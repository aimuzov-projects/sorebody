import {
	expectAccessible,
	expectHealthyPage,
	siteChecks,
	sitemapPaths,
} from '@aimuzov-projects/infra-site-kit/playwright/checks'
import { expect, test, type APIRequestContext } from '@playwright/test'

// Проверки, общие для всех сайтов: кнопка темы с подсмотром другой схемы и 404 из кита.
// Счётчика Метрики у сайта нет
siteChecks({
	pages: false,
	a11y: false,
	theme: { button: (page) => page.getByRole('button', { name: /^Тема:/ }) },
	notFound: true,
})

// Обход sitemap кит делает одним тестом на проверку, страница за страницей: почти сотня страниц
// с 3D-моделью шла минуты на одном воркере. Здесь тот же обход разложен на части, и части идут
// параллельно. Страницы известны только у собранного сайта, а тесты собираются до сборки,
// поэтому делим не по страницам, а по номеру в sitemap: часть `n` берёт каждую SHARDS-ю страницу
const SHARDS = 8

const shardPaths = async (request: APIRequestContext, shard: number) =>
	(await sitemapPaths(request)).filter((_, i) => i % SHARDS === shard)

test.describe('sitemap', () => {
	// Часть -- это десяток страниц подряд: 45 секунд на тест под нагрузкой впритык
	test.slow()

	for (let shard = 0; shard < SHARDS; shard++) {
		const part = `${shard + 1}/${SHARDS}`

		// Ответ, консоль и axe в светлой схеме -- за один заход на страницу
		test(`pages ${part} answer 200 without console errors and pass axe in the light scheme`, async ({
			page,
			request,
		}) => {
			await page.emulateMedia({ colorScheme: 'light' })

			for (const path of await shardPaths(request, shard)) {
				await test.step(path, async () => {
					await expectHealthyPage(page, path)
					await expectAccessible(page)
				})
			}
		})

		test(`pages ${part} pass axe in the dark scheme`, async ({ page, request }) => {
			await page.emulateMedia({ colorScheme: 'dark' })

			for (const path of await shardPaths(request, shard)) {
				await test.step(path, async () => {
					await page.goto(path)
					await expectAccessible(page)
				})
			}
		})
	}
})

// С `a11y: false` кит не проверяет axe и у своей 404
for (const colorScheme of ['light', 'dark'] as const) {
	test(`the not-found page passes axe in the ${colorScheme} scheme`, async ({ page }) => {
		await page.emulateMedia({ colorScheme })
		expect((await page.goto('/kit-404-probe'))?.status()).toBe(404)
		await expectAccessible(page)
	})
}
