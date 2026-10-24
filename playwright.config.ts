// e2e-пресет infra-site-kit: Chromium против `astro build && astro preview`.
import { createServer } from 'node:net'
import preset from '@aimuzov/infra-site-kit/playwright'
import { defineConfig, type ReporterDescription } from '@playwright/test'

const server = preset.webServer

if (!server || Array.isArray(server)) throw new Error('В пресете infra-site-kit ждали один webServer')

/**
 * Занимает порт на `localhost` и сразу отпускает: 0 -- любой свободный, который отдаст система.
 * Занятый порт отклоняет промис с EADDRINUSE.
 */
const claim = (port: number) =>
	new Promise<number>((resolve, reject) => {
		const probe = createServer()
			.once('error', reject)
			.listen(port, 'localhost', () => {
				const { port: claimed } = probe.address() as { port: number }

				probe.close(() => resolve(claimed))
			})
	})

// Фиксированный 4399 пресета бывает занят забытым `astro preview` другой сессии: он отвечает 404,
// Playwright такой порт не считает занятым, наш preview молча уходит на соседний, а Playwright
// ждёт 4399 все 180 секунд. Поэтому порт берём свободный, а заданный руками E2E_PORT проверяем:
// занят -- падаем сразу. Конфиг грузят и раннер, и каждый воркер, а env воркеры наследуют
// от раннера: порт выбирается и проверяется один раз на прогон, пока сервера ещё нет
if (!process.env.E2E_PORT_READY) {
	const wanted = Number(process.env.E2E_PORT || 0)

	if (!Number.isInteger(wanted) || wanted < 0) throw new Error(`E2E_PORT=${process.env.E2E_PORT}: нужен номер порта`)

	try {
		process.env.E2E_PORT = String(await claim(wanted))
	} catch (error) {
		throw new Error(`E2E_PORT=${wanted} занят, e2e не запустить: освободите порт или уберите E2E_PORT`, {
			cause: error,
		})
	}

	process.env.E2E_PORT_READY = '1'
}

const port = Number(process.env.E2E_PORT)
const baseURL = `http://localhost:${port}`

// Сборка для e2e без Метрики: визиты из тестов не нужны в статистике (layouts/base.astro).
// Пресет разворачивается, а не передаётся в defineConfig вторым конфигом: при слиянии
// webServer пресета и свой встали бы в список и оба запускались бы на одном порту.
// Команда -- как у пресета, только с нашим портом: пресет читает E2E_PORT при импорте,
// раньше, чем порт выбран
export default defineConfig({
	...preset,
	// Тяжёлые тесты сами поднимают себе лимит через test.slow()
	timeout: 45_000,
	// `--shard` раскладывает e2e/shard.ts, а не встроенный: тот слепил бы обход sitemap в один шард
	reporter: [...(preset.reporter as ReporterDescription[]), ['./e2e/shard.ts']],
	use: { ...preset.use, baseURL },
	webServer: {
		...server,
		command: `astro build && astro preview --port ${port} --ignore-lock`,
		url: baseURL,
		// Чат -- в режиме тихого запуска: кнопка только с ?chat=1, остальным тестам не мешает
		env: { METRIKA: 'off', CHAT: 'preview' },
	},
})
