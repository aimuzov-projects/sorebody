import { expect, test } from '@playwright/test'

const link = '#method p a'

test('на странице без спорта ссылка в тексте окрашена градиентом бренда', async ({ page }) => {
	await page.goto('/about/')

	const a = page.locator(link).first()

	await expect(a).toHaveCSS('color', 'rgba(0, 0, 0, 0)')
	await expect(a).toHaveCSS('background-image', /linear-gradient/)
	await expect(a).toHaveCSS('animation-name', 'none')

	await a.hover()
	await expect(a).toHaveCSS('animation-name', 'brand-flow')
	await expect(a).toHaveCSS('text-decoration-line', 'none')
})

test('на странице спорта ссылки цвета спорта, без градиента', async ({ page }) => {
	await page.goto('/crossfit/acl-tear/')

	const a = page.locator('.article-section a').first()

	await expect(a).toHaveCSS('background-image', 'none')
	await expect(a).not.toHaveCSS('color', 'rgba(0, 0, 0, 0)')
})

test('без движения градиент при наведении не плывёт', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.goto('/about/')

	const a = page.locator(link).first()

	await a.hover()
	await expect(a).toHaveCSS('animation-name', 'none')
	await expect(a).toHaveCSS('background-image', /linear-gradient/)
})

test('в Mini App ссылки без градиента: фон и текст там из темы Telegram', async ({ page }) => {
	await page.goto('/about/#tgWebAppPlatform=ios')

	const a = page.locator(link).first()

	await expect(a).toHaveCSS('background-image', 'none')
	await expect(a).not.toHaveCSS('color', 'rgba(0, 0, 0, 0)')
})

test('ссылка на страницу сайта -- плашкой, на другой сайт -- подчёркнутая', async ({ page }) => {
	await page.goto('/crossfit/orofacial-trauma/')

	const internal = page.locator(".article-section a[href^='/']").first()
	const external = page.locator(".article-section a[href^='http']").first()

	await expect(internal).toHaveCSS('text-decoration-line', 'none')
	await expect(internal).toHaveCSS('background-image', /linear-gradient/)
	await expect(external).toHaveCSS('text-decoration-line', 'underline')

	// Наведение меняет цвета местами: заливка синим кроссфита, текст белый
	await internal.hover()
	await expect(internal).toHaveCSS('background-color', 'rgb(0, 102, 204)')
	await expect(internal).toHaveCSS('color', 'rgb(255, 255, 255)')

	await external.hover()
	await expect(external).toHaveCSS('text-decoration-line', 'none')
})

test('на странице без спорта плашка ссылки -- вторым слоем под градиентом текста', async ({ page }) => {
	await page.goto('/injuries/orofacial-trauma/')

	const a = page.locator(".article-section a[href^='/']").first()

	await expect(a).toHaveCSS('background-image', /linear-gradient.*linear-gradient/)
	await expect(a).toHaveCSS('background-clip', 'text, padding-box')
})
