import { expect, test } from '@playwright/test'

// Этап 0 многоспортивного справочника (docs/multisport-concept.md): кроссфит переехал под
// `/crossfit/`, старые адреса ведут туда же, раздел статьи и зона сцены в хеше не теряются
test('старый адрес статьи ведёт на статью кроссфита к тому же разделу', async ({ page }) => {
	await page.goto('/injuries/acl-tear/#urgent')
	await expect(page).toHaveURL(/\/crossfit\/acl-tear\/#urgent$/)
	await expect(page.locator('.article__title')).toBeVisible()
})

test('старый адрес движения ведёт на страницу элемента кроссфита', async ({ page }) => {
	await page.goto('/movements/burpee/')
	await expect(page).toHaveURL(/\/crossfit\/elements\/burpee\/$/)
	await expect(page.locator('.index__title')).toHaveText('Бёрпи')
})

test('страницы спорта помечены data-sport и красят акцент его цветом, остальные -- без спорта', async ({ page }) => {
	// Сборка сжимает цвет до #06c: сравниваем то, что получилось у элемента, а не текст токена
	const accent = () =>
		page.evaluate(() => {
			const probe = document.body.appendChild(document.createElement('i'))

			probe.style.color = 'var(--accent)'

			return getComputedStyle(probe).color
		})

	for (const path of ['/', '/crossfit/', '/crossfit/acl-tear/', '/crossfit/elements/burpee/']) {
		await page.goto(path)
		await expect(page.locator('html')).toHaveAttribute('data-sport', 'crossfit')
	}

	expect(await accent()).toBe('rgb(0, 102, 204)')

	await page.goto('/about/')
	await expect(page.locator('html')).not.toHaveAttribute('data-sport')
})

test('главная спорта по умолчанию живёт и на /crossfit/, canonical -- на /', async ({ page }) => {
	await page.goto('/crossfit/')
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/$/)
	await expect(page.locator('link[rel="canonical"]')).not.toHaveAttribute('href', /crossfit/)
	await expect(page.locator('.index__title--home')).toBeVisible()
})
