import { expect, test, type Page } from '@playwright/test'

// Полоса прокрутки окна не двигает значки в углу, даже где прокручивать нечего.
// Полосы здесь обычные, как в Windows: headless Chromium их иначе прячет.
// На macOS полосы бывают поверх контента, тогда тесты пропускаются, а в CI они обычные
test.use({
	viewport: { width: 1280, height: 800 },
	launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] },
})

const SLUG = 'rotator-cuff-tendinopathy'

/** Края значков в углу: при сдвиге на ширину полосы они и уезжают. */
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

/** Пропускает тест, если полосы поверх контента: страница с прокруткой не уже окна. */
async function needClassicScrollbars(page: Page) {
	await page.goto('/about/')
	const width = await page.evaluate(() => innerWidth - document.documentElement.clientWidth)

	test.skip(width === 0, 'Полосы прокрутки поверх контента')
}

const titleLeft = (page: Page, scope: string) =>
	page.locator(`${scope} .article__title`).evaluate((el) => Math.round(el.getBoundingClientRect().left))

test('значки в углу стоят одинаково на страницах с прокруткой и без', async ({ page }) => {
	await needClassicScrollbars(page)
	const expected = await corners(page)

	for (const path of ['/', '/crossfit/', `/crossfit/${SLUG}/`, `/injuries/${SLUG}/`, '/changelog/', '/nope/']) {
		await page.goto(path)
		expect(await corners(page), path).toEqual(expected)
	}
})

test('статья на главной: значки на месте, колонка текста там же, где у отдельной страницы', async ({ page }) => {
	await needClassicScrollbars(page)
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

test('подсказка значка в углу прижата к его правому краю и там, где прокрутки нет', async ({ page }) => {
	await needClassicScrollbars(page)

	for (const path of ['/', '/about/']) {
		await page.goto(path)
		const link = page.locator('.corner-link').first()

		await link.hover()
		const tip = page.locator('[data-corner-tip]:popover-open')

		await expect(tip).toBeVisible()
		const [linkRight, tipRight] = await Promise.all(
			[link, tip].map((el) => el.evaluate((node) => Math.round(node.getBoundingClientRect().right))),
		)

		expect(tipRight, path).toBe(linkRight)
		await page.mouse.move(0, 400)
	}
})
