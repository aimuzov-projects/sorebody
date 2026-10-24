import {
	expectAccessible,
	expectHealthyPage,
	expectNoTapHighlight,
	expectStableWidth,
	siteChecks,
	sitemapPaths,
} from '@aimuzov/infra-site-kit/playwright/checks'
import { expect, test, type APIRequestContext } from '@playwright/test'

// Проверки, общие для всех сайтов: кнопка темы с подсмотром другой схемы и 404 из кита.
// Метрики в сборке для e2e нет, её хит проверяет metrika.spec.ts. Ширину с полосой прокрутки
// и подсветку касания кит тоже проверяет одним обходом sitemap, их обход -- по частям ниже
siteChecks({
	pages: false,
	a11y: false,
	gutter: false,
	tapHighlight: false,
	theme: { button: (page) => page.getByRole('button', { name: /^Тема:/ }) },
	notFound: true,
})

// Обход sitemap кит делает одним тестом на проверку, страница за страницей: на почти сотне страниц
// axe шёл минуты на одном воркере (модель под webdriver не грузится, время уходит на сам axe).
// Здесь тот же обход разложен на части, и части идут параллельно. Страницы известны только
// у собранного сайта, а тесты собираются до сборки, поэтому делим не по страницам, а по номеру
// в sitemap: часть `n` берёт каждую восьмую страницу, начиная с n-й
const SHARDS = 8

const shardPaths = async (request: APIRequestContext, shard: number) =>
	(await sitemapPaths(request)).filter((_, i) => i % SHARDS === shard)

test.describe('sitemap', () => {
	// В части около дюжины страниц, на каждой axe: 45 секунд на тест под нагрузкой впритык
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
					await expectNoTapHighlight(page, [path])
				})
			}
		})

		// Полосу прокрутки headless Chromium прячет на весь воркер, поэтому браузер свой, как у кита.
		// Каждая часть сравнивает свои страницы с главной, так ширина у всех одна, а 404 -- в первой
		test(`pages ${part} keep their width with or without a scrollbar`, async ({
			playwright,
			browserName,
			request,
			baseURL,
			viewport,
		}) => {
			const browser = await playwright[browserName].launch({ ignoreDefaultArgs: ['--hide-scrollbars'] })

			try {
				const paths = ['/', ...(await shardPaths(request, shard)), ...(shard === 0 ? ['/kit-404-probe'] : [])]

				await expectStableWidth(await browser.newPage({ baseURL, viewport }), paths)
			} finally {
				await browser.close()
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
