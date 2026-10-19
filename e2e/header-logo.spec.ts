import { expect, test, type Locator } from '@playwright/test'

const SLUG = 'acl-tear'

const opacity = (el: Locator) => el.evaluate((node) => Number(getComputedStyle(node).opacity))

test('в шапке статьи логотип уступает место заголовку при прокрутке и возвращается наверху', async ({ page }) => {
	await page.goto(`/crossfit/${SLUG}/`)

	const logo = page.locator('.site-header').getByRole('link', { name: 'Sorebody, на главную' })
	const title = page.locator('.article-bar__title')

	await expect(logo).toBeVisible()
	await expect(logo).toHaveAttribute('href', '/')
	expect(await opacity(title)).toBe(0)

	await page.evaluate(() => scrollTo(0, 400))
	await expect(logo).toBeHidden()
	await expect.poll(() => opacity(title)).toBe(1)

	await page.evaluate(() => scrollTo(0, 0))
	await expect(logo).toBeVisible()
	await expect.poll(() => opacity(title)).toBe(0)
})

test('в ридере на главной логотип прячется при прокрутке ридера и закрывает статью', async ({ page }) => {
	await page.goto(`/#${SLUG}`)

	const reader = page.locator('.reader:not(.theme-peek *)')
	const logo = reader.getByRole('link', { name: 'Sorebody, на главную' })
	const title = reader.locator('.article-bar__title')

	await expect(reader.locator('.article__title')).toBeVisible()
	await expect(logo).toBeVisible()

	await reader.evaluate((el) => el.scrollTo(0, 400))
	await expect(logo).toBeHidden()
	await expect.poll(() => opacity(title)).toBe(1)

	await reader.evaluate((el) => el.scrollTo(0, 0))
	await logo.click()
	await expect(reader).toHaveCount(0)
	// Как "Назад": статья закрыта, адрес вернулся к главной
	await expect(page).not.toHaveURL(new RegExp(`#${SLUG}$`))
})

test.describe('на телефоне', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

	test('длинный заголовок в шапке обрезается многоточием и не раздвигает страницу', async ({ page }) => {
		await page.goto('/padel/elbow-tendinopathy/')
		await page.evaluate(() => scrollTo(0, 400))

		const title = page.locator('.article-bar__title')

		await expect.poll(() => opacity(title)).toBe(1)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

		const header = (await page.locator('.site-header').boundingBox())!
		const box = (await title.boundingBox())!

		expect(box.x + box.width).toBeLessThanOrEqual(header.x + header.width)
	})
})
