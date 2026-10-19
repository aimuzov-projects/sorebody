import { expect, test } from '@playwright/test'

test('ссылка рядом с темой ведёт на страницу «Что нового»', async ({ page }) => {
	await page.goto('/about/')
	await page.getByRole('link', { name: 'Что нового' }).click()

	await expect(page).toHaveURL(/\/changelog\/?$/)
	await expect(page.getByRole('heading', { level: 1, name: 'Что нового' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'Что нового' })).toHaveAttribute('aria-current', 'page')
})

test('значок (i) в углу ведёт на страницу «О справочнике» и на ней горит', async ({ page }) => {
	await page.goto('/changelog/')
	await page.getByRole('link', { name: 'О справочнике', exact: true }).click()

	await expect(page).toHaveURL(/\/about\/?$/)

	await expect(page.getByRole('link', { name: 'О справочнике', exact: true })).toHaveAttribute('aria-current', 'page')

	await expect(page.getByRole('link', { name: 'Что нового' })).not.toHaveAttribute('aria-current')
})

test('значки в углу стоят в ряд слева от темы: (i), «Что нового», тема', async ({ page }) => {
	await page.goto('/changelog/')

	const about = (await page.getByRole('link', { name: 'О справочнике', exact: true }).boundingBox())!
	const changelog = (await page.getByRole('link', { name: 'Что нового' }).boundingBox())!
	const theme = (await page.getByRole('button', { name: /^Тема:/ }).boundingBox())!

	expect(about.y).toBe(theme.y)
	expect(changelog.y).toBe(theme.y)
	expect(about.x + about.width).toBeLessThanOrEqual(changelog.x)
	expect(changelog.x + changelog.width).toBeLessThanOrEqual(theme.x)
})

test('подсказки значков в углу открываются с клавиатуры и повторяют подпись', async ({ page }) => {
	await page.goto('/changelog/')

	for (const name of ['О справочнике', 'Что нового']) {
		const link = page.getByRole('link', { name, exact: true })
		const tip = link.locator('xpath=following-sibling::*[1]')

		await expect(tip).toBeHidden()
		await page.keyboard.press('Tab')

		// Табом до нужного значка: перед ним на странице могут быть другие ссылки
		for (let i = 0; i < 20 && !(await link.evaluate((el) => el === document.activeElement)); i++)
			await page.keyboard.press('Tab')

		await expect(tip).toBeVisible()
		await expect(tip).toHaveText(name)
	}
})

test('в Mini App ссылка встаёт в угол на место скрытого переключателя темы', async ({ page }) => {
	const link = page.getByRole('link', { name: 'Что нового' })
	const theme = page.getByRole('button', { name: /^Тема:/ })

	await page.goto('/about/')

	const toggle = (await theme.boundingBox())!

	await page.goto('/about/#tgWebAppPlatform=ios')
	await page.reload()
	await expect(theme).toBeHidden()

	const box = (await link.boundingBox())!

	expect(Math.abs(box.x - toggle.x)).toBeLessThan(1)
	expect(Math.abs(box.y - toggle.y)).toBeLessThan(1)
})

test.describe('на телефоне', () => {
	test.use({ viewport: { width: 375, height: 663 }, hasTouch: true, isMobile: true })

	test('меню релизов ведёт к нужному релизу', async ({ page }) => {
		await page.goto('/changelog/')

		const button = page.getByRole('button', { name: 'Релизы' })
		const menu = page.locator('#toc-menu')

		await button.tap()
		await menu.getByRole('link', { name: 'Запуск справочника' }).tap()
		await expect(menu).toBeHidden()
		await expect(page.locator('#v1-1-0')).toBeInViewport()
	})
})
