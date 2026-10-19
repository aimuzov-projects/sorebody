import { expect, test, type Page } from '@playwright/test'

// Под «Частыми» у кроссфита голова пустая. Пустая зона на модели не подсвечивается: точки
// остальных зон не притушены. Сцена под автотестом не грузится, но классы точек считаются и без неё
const dimmed = (page: Page) => page.locator('.body3d__spot--dim')
const row = (page: Page, label: string) => page.locator('.index__zone', { hasText: label })
const frequent = (page: Page) => page.getByRole('button', { name: /Частые/ }).first()

test('наведение на опустевшую под фильтром зону её не подсвечивает', async ({ page }) => {
	await page.goto('/')
	await frequent(page).click()
	await expect(row(page, 'Голова')).toBeDisabled()

	await row(page, 'Голова').hover({ force: true })
	await expect(dimmed(page)).toHaveCount(0)

	// Для сравнения: зона с травмами подсвечивается
	await row(page, 'Плечо').hover()
	await expect(dimmed(page)).not.toHaveCount(0)
})

test('фильтр опустошил зону под курсором -- подсветка снимается сразу', async ({ page }) => {
	await page.goto('/')
	await row(page, 'Голова').hover()
	await expect(dimmed(page)).not.toHaveCount(0)

	// Фильтр с клавиатуры: курсор остаётся на строке
	await frequent(page).focus()
	await page.keyboard.press('Enter')

	await expect(row(page, 'Голова')).toBeDisabled()
	await expect(dimmed(page)).toHaveCount(0)
})
