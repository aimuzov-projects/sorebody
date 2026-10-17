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

test('тап по зоне раскрывает её список', async ({ page }) => {
	await page.goto('/')
	await page.locator('.index__zone', { hasText: 'Плечо' }).tap()

	await expect(page).toHaveURL(/#zone=shoulder/)
	await expect(page.locator('.zone')).toBeVisible()
})
