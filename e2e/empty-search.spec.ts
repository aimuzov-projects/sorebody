import { expect, test, type Page } from '@playwright/test'

// Пустой поиск подсказывает, что делать дальше: не та раскладка, мешают фильтры или
// просто нет такого -- тогда облако частых травм
const search = (page: Page) => page.getByRole('searchbox', { name: 'Поиск по боли' })
const results = (page: Page) => page.locator('.index__results').first()

test('запрос не в той раскладке находит травмы, «Исправить» меняет запрос', async ({ page }) => {
	await page.goto('/')
	await search(page).fill('rjktyj')
	await expect(results(page).locator('.index__hint')).toContainText('«колено»')
	await expect(results(page).locator('.index__result').first()).toBeVisible()

	await results(page).getByRole('button', { name: 'Исправить' }).click()
	await expect(search(page)).toHaveValue('колено')
	await expect(results(page).locator('.index__hint')).toHaveCount(0)
})

test('если всё отсекли фильтры, «Сбросить фильтры» возвращает результаты и оставляет запрос', async ({ page }) => {
	await page.goto('/')

	await page
		.getByRole('button', { name: /Редкие/ })
		.first()
		.click()

	await search(page).fill('мозол')
	await expect(results(page)).toContainText('Мешают фильтры')

	await results(page).getByRole('button', { name: 'Сбросить фильтры' }).click()
	await expect(search(page)).toHaveValue('мозол')
	await expect(results(page).locator('.index__result').first()).toBeVisible()
})

test('ничего не нашлось -- облако частых травм ведёт в статью', async ({ page }) => {
	await page.goto('/')
	await search(page).fill('asdasd')
	await expect(results(page)).toContainText('Ничего не нашлось')
	await results(page).locator('.index__suggest-item').first().click()
	await expect(page.locator('.reader')).toBeVisible()
})
