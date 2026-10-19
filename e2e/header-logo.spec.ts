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

test.describe('на узком телефоне', () => {
	test.use({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true })

	test('логотип и длинный заголовок не заходят под значки в углу и не раздвигают страницу', async ({ page }) => {
		await page.goto(`/crossfit/${SLUG}/`)

		// Самый левый значок ряда в углу. У .site-header справа отступ под эти значки, и
		// наложение на них сравнение с краем шапки не поймало бы
		const corner = (await page.getByRole('link', { name: 'О справочнике' }).boundingBox())!
		const logo = (await page.locator('.article-bar__logo').boundingBox())!

		expect(logo.x + logo.width).toBeLessThanOrEqual(corner.x)

		await page.evaluate(() => scrollTo(0, 400))

		const title = page.locator('.article-bar__title')

		await expect.poll(() => opacity(title)).toBe(1)
		expect(await title.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

		const box = (await title.boundingBox())!

		expect(box.x + box.width).toBeLessThanOrEqual(corner.x)
	})
})
