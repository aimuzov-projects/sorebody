import { expect, test } from '@playwright/test'

test('ссылка рядом с темой ведёт на страницу «Что нового»', async ({ page }) => {
	await page.goto('/about/')
	await page.getByRole('link', { name: 'Что нового' }).click()

	await expect(page).toHaveURL(/\/changelog\/?$/)
	await expect(page.getByRole('heading', { level: 1, name: 'Что нового' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'Что нового' })).toHaveAttribute('aria-current', 'page')
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
