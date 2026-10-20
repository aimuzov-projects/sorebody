import { expect, test } from '@playwright/test'

// Статья начинает грузиться, когда курсор задержался на её ссылке: клик берёт готовый ответ
// и второго запроса не делает
test('наведение на травму грузит статью заранее, открытие -- без второго запроса', async ({ page }) => {
	const requests: string[] = []

	page.on('request', (request) => {
		if (/\/crossfit\/[^/]+\/$/.test(new URL(request.url()).pathname)) requests.push(request.url())
	})

	await page.goto('/')
	await page.locator('.index__zone', { hasText: 'Колено' }).click()

	const item = page.locator('.zone .zone__item').first()
	const prefetched = page.waitForRequest((request) => /\/crossfit\/[^/]+\/$/.test(new URL(request.url()).pathname))

	await item.hover()
	await prefetched
	await page.waitForLoadState('networkidle')
	await item.click()
	await expect(page.locator('.reader')).toHaveAttribute('aria-busy', 'false')
	expect(requests).toHaveLength(1)
})

test('пролёт курсора над списком статьи не грузит', async ({ page }) => {
	const requests: string[] = []

	page.on('request', (request) => {
		if (/\/crossfit\/[^/]+\/$/.test(new URL(request.url()).pathname)) requests.push(request.url())
	})

	await page.goto('/')
	await page.locator('.index__zone', { hasText: 'Колено' }).click()

	await page.locator('.zone .zone__item').first().waitFor()

	// Курсор проходит над каждой ссылкой и сразу уходит. События -- из страницы одним циклом:
	// реальная мышь под нагрузкой полного прогона задерживалась на строке дольше порога
	await page.evaluate(() => {
		for (const link of document.querySelectorAll('.zone .zone__item')) {
			link.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }))
			link.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' }))
		}
	})

	await page.waitForTimeout(300)
	expect(requests).toHaveLength(0)
})
