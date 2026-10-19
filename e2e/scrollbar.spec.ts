import { expect, test, type Page } from '@playwright/test'

// Полоса прокрутки окна не двигает шапку и значки в углу: место под неё держится и там, где
// прокручивать нечего (главная со сценой, 404). Headless Chromium по умолчанию прячет полосы,
// как overlay-полосы macOS; здесь они обычные, как в Windows
test.use({
	viewport: { width: 1280, height: 800 },
	launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] },
})

const SLUG = 'rotator-cuff-tendinopathy'

/** Края значков в углу и правый край шапки: при сдвиге на ширину полосы они и уезжают. */
const corners = (page: Page) =>
	page.evaluate(() => {
		const edges = (selector: string) =>
			[...document.querySelectorAll(selector)]
				.filter((el) => !el.closest('.theme-peek'))
				.map((el) => {
					const { left, right } = el.getBoundingClientRect()

					return [Math.round(left), Math.round(right)]
				})

		return { links: edges('.corner-link'), toggle: edges('.theme-toggle__button') }
	})

const titleLeft = (page: Page, scope: string) =>
	page.locator(`${scope} .article__title`).evaluate((el) => Math.round(el.getBoundingClientRect().left))

test('значки в углу стоят одинаково на страницах с прокруткой и без', async ({ page }) => {
	await page.goto('/about/')
	// Без обычных полос тест ничего не проверяет
	expect(await page.evaluate(() => innerWidth - document.documentElement.clientWidth)).toBeGreaterThan(0)

	const expected = await corners(page)

	for (const path of ['/', '/crossfit/', `/crossfit/${SLUG}/`, `/injuries/${SLUG}/`, '/changelog/', '/nope/']) {
		await page.goto(path)
		expect(await corners(page), path).toEqual(expected)
	}
})

test('статья на главной: значки на месте, колонка текста там же, где у отдельной страницы', async ({ page }) => {
	await page.goto(`/crossfit/${SLUG}/`)
	const left = await titleLeft(page, 'main')

	await page.goto('/')
	const expected = await corners(page)

	await page.locator('.index__zone', { hasText: 'Плечо' }).click()
	await expect(page.locator('.zone')).toBeVisible()
	expect(await corners(page)).toEqual(expected)

	await page.goto(`/#${SLUG}`)
	await expect(page.locator('.reader .article__title')).toBeVisible()
	expect(await corners(page)).toEqual(expected)
	expect(await titleLeft(page, '.reader')).toBe(left)
})
