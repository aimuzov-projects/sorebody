import { expect, test, type Page } from '@playwright/test'

const SLUG = 'rotator-cuff-tendinopathy'

/** Запросы модели плеча: до нажатия на кнопку их быть не должно. */
function watchModel(page: Page) {
	const requests: string[] = []

	page.on('request', (request) => {
		if (request.url().includes('/model/rig/')) requests.push(request.url())
	})

	return requests
}

test('модель грузится только по кнопке «Покрутить в 3D» и открывается на весь экран', async ({ page }) => {
	const requests = watchModel(page)

	await page.goto(`/injuries/${SLUG}/`)

	const open = page.getByRole('button', { name: 'Покрутить в 3D' })

	await expect(open).toBeVisible()
	expect(requests).toEqual([])

	await open.click()

	const dialog = page.getByRole('dialog', { name: '3D-модель плеча' })

	await expect(dialog).toBeVisible()
	await expect(dialog.getByRole('button', { name: 'Назад' })).toBeVisible()
	await expect.poll(() => requests.length).toBeGreaterThan(0)
})

test('Esc, стрелка и «Назад» браузера закрывают модель, а статья остаётся на месте', async ({ page }) => {
	await page.goto(`/injuries/${SLUG}/`)

	const url = page.url()
	const open = page.getByRole('button', { name: 'Покрутить в 3D' })
	const dialog = page.getByRole('dialog', { name: '3D-модель плеча' })

	await open.click()
	await expect(dialog).toBeVisible()
	await page.keyboard.press('Escape')
	await expect(dialog).toHaveCount(0)
	await expect(page).toHaveURL(url)

	await open.click()
	await dialog.getByRole('button', { name: 'Назад' }).click()
	await expect(dialog).toHaveCount(0)
	await expect(page).toHaveURL(url)

	await open.click()
	await expect(dialog).toBeVisible()
	await page.goBack()
	await expect(dialog).toHaveCount(0)
	await expect(page).toHaveURL(url)
	await expect(page.locator('.article__title')).toBeVisible()
})

test('в статье на главной модель закрывается, а статья остаётся открытой', async ({ page }) => {
	await page.goto(`/#${SLUG}`)

	const reader = page.locator('.reader')
	const dialog = page.getByRole('dialog', { name: '3D-модель плеча' })

	await reader.getByRole('button', { name: 'Покрутить в 3D' }).click()
	await expect(dialog).toBeVisible()
	await page.keyboard.press('Escape')
	await expect(dialog).toHaveCount(0)
	await expect(page).toHaveURL(new RegExp(`#${SLUG}$`))
	await expect(reader.locator('.article__title')).toBeVisible()
})
