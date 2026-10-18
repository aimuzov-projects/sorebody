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
	await page.getByRole('button', { name: 'Свернуть поиск' }).tap()
	await expect(island).toHaveText(/Редкие/)
	await expect(page.locator('.search__input')).toBeHidden()
})

test('тап по зоне раскрывает её список', async ({ page }) => {
	await page.goto('/')
	await page.locator('.index__zone', { hasText: 'Плечо' }).tap()

	await expect(page).toHaveURL(/#zone=shoulder/)
	await expect(page.locator('.zone')).toBeVisible()
})

test('кнопка разделов открывает меню и ведёт к разделу', async ({ page }) => {
	await page.goto('/injuries/acl-tear/')

	const button = page.getByRole('button', { name: 'Разделы статьи' })
	const menu = page.locator('#toc-menu')

	await button.tap()
	await expect(button).toHaveAttribute('aria-expanded', 'true')
	await expect(menu).toBeVisible()

	await menu.getByRole('link', { name: 'Симптомы' }).tap()
	await expect(menu).toBeHidden()
	await expect(button).toHaveAttribute('aria-expanded', 'false')
	await expect(button).toBeFocused()
	await expect(page.locator('#symptoms')).toBeInViewport()
	// Меню уже закрыто, роль скрытой ссылке не достаётся -- ищем по адресу
	await expect(menu.locator('a[href="#symptoms"]')).toHaveAttribute('aria-current')

	await button.tap()
	await page.keyboard.press('Escape')
	await expect(menu).toBeHidden()
	await expect(button).toBeFocused()
})

test('меню разделов работает и в статье поверх модели', async ({ page }) => {
	await page.goto('/')
	await page.locator('.index__zone', { hasText: 'Колено' }).tap()
	await page.locator('.zone__item', { hasText: 'передней крестообразной' }).tap()

	const reader = page.locator('.reader')
	const button = reader.getByRole('button', { name: 'Разделы статьи' })

	await button.tap()
	await reader.locator('#toc-menu').getByRole('link', { name: 'Профилактика' }).tap()
	await expect(reader.locator('#toc-menu')).toBeHidden()
	await expect(reader.locator('#prevention')).toBeInViewport()
})

test.describe('на широком экране', () => {
	test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false })

	test('кнопки разделов нет: оглавление сбоку', async ({ page }) => {
		await page.goto('/injuries/acl-tear/')

		await expect(page.getByRole('button', { name: 'Разделы статьи' })).toBeHidden()
		await expect(page.locator('.article__toc')).toBeVisible()
	})
})

test('в только что открытой статье поверх модели ни один раздел не подсвечен', async ({ page }) => {
	await page.goto('/')
	await page.locator('.index__zone', { hasText: 'Колено' }).tap()
	await page.locator('.zone__item', { hasText: 'передней крестообразной' }).tap()
	await page.locator('.reader').getByRole('button', { name: 'Разделы статьи' }).tap()

	await expect(page.locator('.reader #toc-menu a[aria-current]')).toHaveCount(0)
})
