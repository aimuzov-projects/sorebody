import { expect, test } from '@playwright/test'

// Тему, выбранную до переименования под ключом `wodcare:theme`, скрипт в head переносит
// на `sorebody:theme` раньше ThemeBoot, и страница сразу открывается в ней
test('выбор под старым ключом wodcare:* переезжает на sorebody:*', async ({ page }) => {
	await page.goto('/')

	await page.evaluate(() => {
		localStorage.setItem('wodcare:theme', 'dark')
		localStorage.setItem('wodcare:intro-hint', 'seen')
	})

	await page.reload()

	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

	expect(
		await page.evaluate(() => ({
			theme: localStorage.getItem('sorebody:theme'),
			hint: localStorage.getItem('sorebody:intro-hint'),
			old: Object.keys(localStorage).filter((k) => k.startsWith('wodcare:')),
		})),
	).toEqual({ theme: 'dark', hint: 'seen', old: [] })
})
