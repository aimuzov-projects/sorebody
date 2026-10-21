import { expect, test } from '@playwright/test'

// Chromium без окна (headless shell) и флаг Playwright по умолчанию выключают bfcache: страница
// при «Назад» всегда грузилась бы заново. Полный Chromium без этого флага возвращает её из кеша
test.use({ channel: 'chromium', launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] } })

// Главная при «Назад» встаёт из bfcache такой, какой её оставили: скрипт в head не выполняется,
// спорт на месте меняет pageshow. Открытая статья остаётся, Метрика получает хит, как при выборе
test('главная из bfcache после смены спорта на другой странице переключается на выбранный', async ({ page }) => {
	await page.addInitScript(() => {
		const hits: unknown[][] = []

		Object.assign(window, { hits, ym: (...args: unknown[]) => hits.push(args), restored: false })
		addEventListener('pageshow', (event) => event.persisted && Object.assign(window, { restored: true }))
	})

	await page.goto('/football/#orofacial-trauma')

	const reader = page.locator('.reader:not(.theme-peek *)')

	await expect(reader.locator('[data-sport-switch] button')).toHaveText(/в\sфутболе/)
	await expect(page).toHaveURL(/\/football\/orofacial-trauma\/$/)
	// Страница статьи -- под другим адресом: тот же путь `goto` открыл бы на месте записи главной
	await page.goto('/football/orofacial-trauma/?static')
	await page.locator('[data-sport-switch] astro-island:not([ssr])').waitFor({ state: 'attached' })
	await page.getByRole('button', { name: 'Вид спорта Футбол' }).click()
	await page.getByRole('option', { name: 'Кроссфит' }).click()
	await expect(page).toHaveURL(/\/crossfit\/orofacial-trauma\/$/)

	// Страница из кеша не шлёт load, ждать его нельзя
	await page.goBack({ waitUntil: 'commit' })
	await expect.poll(() => page.evaluate(() => (window as unknown as { restored: boolean }).restored)).toBe(true)
	await expect(page).toHaveURL(/\/crossfit\/orofacial-trauma\/$/)
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'crossfit')
	await expect(reader.locator('[data-sport-switch] button')).toHaveText(/в\sкроссфите/)

	const hits = await page.evaluate(() => (window as unknown as { hits: unknown[][] }).hits)
	const origin = new URL(page.url()).origin

	expect(hits).toHaveLength(1)
	expect(hits[0][3]).toMatchObject({ referer: `${origin}/football/orofacial-trauma/` })
})
