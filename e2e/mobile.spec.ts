import { expect, test } from '@playwright/test'

// Шторка главной на телефоне. Без `?scene` модель под webdriver не грузится, а индекс работает и без неё
test.use({ viewport: { width: 375, height: 663 }, hasTouch: true, isMobile: true })

test('все зоны помещаются в шторку без горизонтальной прокрутки', async ({ page }) => {
	await page.goto('/')

	const zones = page.locator('.index__zones')
	const rows = zones.locator('.index__zone')

	await expect(rows.last()).toBeInViewport({ ratio: 1 })
	expect(await zones.evaluate((list) => list.scrollWidth <= list.clientWidth)).toBe(true)
})

test('поиск и фильтры прячутся в остров и раскрываются по нажатию', async ({ page }) => {
	await page.goto('/')

	const island = page.locator('.index__island-open')

	await expect(page.locator('.search__input')).toBeHidden()
	await island.tap()
	await expect(page.locator('.search__input')).toBeFocused()

	await page.locator('.index__chip', { hasText: 'Редкие' }).tap()
	await page.locator('.index__panel-done').tap()
	await expect(island).toHaveText(/Редкие/)
	await expect(page.locator('.search__input')).toBeHidden()
})

test('тап по зоне раскрывает её список', async ({ page }) => {
	await page.goto('/')
	await page.locator('.index__zone', { hasText: 'Плечо' }).tap()

	await expect(page).toHaveURL(/#zone=shoulder/)
	await expect(page.locator('.zone')).toBeVisible()
})
