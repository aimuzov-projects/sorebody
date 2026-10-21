import { expect, test } from '@playwright/test'

const ARTICLE = '/basketball/concussion/'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

const clipboard = (page: import('@playwright/test').Page) => page.evaluate(() => navigator.clipboard.readText())

test('пункт оглавления ставит хеш раздела, ссылка с ним открывает раздел', async ({ page }) => {
	await page.goto(ARTICLE)
	await page.locator('[data-toc]').getByRole('link', { name: 'Диагностика' }).click()
	await expect(page).toHaveURL(new RegExp(`${ARTICLE}#diagnosis$`))
	await expect(page.locator('#diagnosis')).toBeInViewport()

	await page.goto(`${ARTICLE}#treatment`)
	await expect(page.locator('#treatment-title')).toBeInViewport()
})

test('клик по заголовку раздела копирует ссылку на него', async ({ page }) => {
	await page.goto(ARTICLE)

	const title = page.locator('#diagnosis-title')

	await title.scrollIntoViewIfNeeded()
	await title.click()
	await expect(page).toHaveURL(new RegExp(`${ARTICLE}#diagnosis$`))
	await expect(page.getByRole('status').filter({ hasText: 'Ссылка скопирована' })).toBeVisible()
	expect(await clipboard(page)).toMatch(new RegExp(`${ARTICLE}#diagnosis$`))

	// Значок у заголовка -- то же с клавиатуры
	await page.getByRole('button', { name: 'Скопировать ссылку на раздел «Лечение»' }).focus()
	await page.keyboard.press('Enter')
	expect(await clipboard(page)).toMatch(new RegExp(`${ARTICLE}#treatment$`))
})

// Поверх модели статья под своим путём: хеш раздела сцена не читает, статья остаётся открытой,
// а «Назад» ведёт из статьи в зону, а не по разделам
test('в статье поверх модели якорь раздела не закрывает статью', async ({ page }) => {
	await page.goto('/basketball/#concussion')

	const reader = page.locator('.reader:not(.theme-peek *)')

	await reader.locator('[data-toc]').getByRole('link', { name: 'Диагностика' }).click()
	await expect(page).toHaveURL(new RegExp(`${ARTICLE}#diagnosis$`))
	await expect(reader.locator('#diagnosis')).toBeInViewport()

	await reader.locator('#treatment-title').click()
	expect(await clipboard(page)).toMatch(new RegExp(`${ARTICLE}#treatment$`))
	await expect(reader.locator('.article__title')).toBeAttached()

	await reader.locator('.reader__back').click()
	await expect(page).toHaveURL(/\/basketball\/#zone=[\w-]+:\d$/)
	await expect(page.locator('.zone')).toBeVisible()
})
