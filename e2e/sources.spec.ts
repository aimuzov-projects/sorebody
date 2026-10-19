import { expect, test } from '@playwright/test'

// Список источников длинный и свёрнут под заголовком: раскрывают его клик, ссылка с якорем
// #sources и печать
const SLUG = 'rotator-cuff-tendinopathy'

test('источники свёрнуты, клик по заголовку их раскрывает', async ({ page }) => {
	await page.goto(`/crossfit/${SLUG}/`)

	const sources = page.locator('[data-sources]')
	const list = sources.locator('.article__source-list')

	await expect(sources).not.toHaveAttribute('open')
	await expect(list).toBeHidden()
	await expect(sources.locator('summary')).toContainText(/Источники\s+\d+/)
	await expect(sources.locator('summary')).toContainText('из PubMed')

	await sources.locator('summary').click()
	await expect(sources).toHaveAttribute('open')
	await expect(list.locator('li').first()).toBeVisible()
})

test('сноски в тексте по-прежнему ведут на источник', async ({ page }) => {
	await page.goto(`/crossfit/${SLUG}/`)
	await expect(page.locator('.cite__link').first()).toHaveAttribute('href', /^https:\/\//)
})

test('ссылка с якорем #sources раскрывает список и прокручивает к нему', async ({ page }) => {
	await page.goto(`/crossfit/${SLUG}/#sources`)

	const sources = page.locator('[data-sources]')

	await expect(sources).toHaveAttribute('open')
	await expect(sources.locator('summary')).toBeInViewport()
	await expect(sources.locator('.article__source-list li').first()).toBeVisible()
})

test('на печати список раскрыт', async ({ page }) => {
	await page.goto(`/crossfit/${SLUG}/`)
	await page.emulateMedia({ media: 'print' })
	await expect(page.locator('[data-sources] .article__source-list li').first()).toBeVisible()
})

test('в статье на главной источники тоже свёрнуты и раскрываются', async ({ page }) => {
	await page.goto(`/#${SLUG}`)

	const sources = page.locator('.reader:not(.theme-peek *) [data-sources]')

	await expect(sources).not.toHaveAttribute('open')
	await sources.locator('summary').click()
	await expect(sources.locator('.article__source-list li').first()).toBeVisible()
	await expect(page).toHaveURL(new RegExp(`#${SLUG}$`))
})
