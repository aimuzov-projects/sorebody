import { expect, test } from '@playwright/test'

test('статья не загрузилась: экран с повтором и ссылкой на отдельную страницу', async ({ page }) => {
	const article = '**/crossfit/orofacial-trauma/'

	await page.goto('/crossfit/')
	await page.route(article, (route) => route.abort())

	await page
		.getByRole('button', { name: /Голова/ })
		.first()
		.click()

	await page
		.getByRole('link', { name: /Травмы лица и зубов/ })
		.first()
		.click()

	const alert = page.getByRole('alert')

	await expect(alert).toContainText('Статья не загрузилась')

	await expect(alert.getByRole('link', { name: 'Открыть отдельно' })).toHaveAttribute(
		'href',
		'/crossfit/orofacial-trauma/',
	)

	// Связь вернулась: повтор грузит статью на месте
	await page.unroute(article)
	await alert.getByRole('button', { name: 'Попробовать ещё раз' }).click()
	await expect(page.getByRole('heading', { level: 1, name: /Травмы лица и зубов/ })).toBeVisible()
	await expect(alert).toBeHidden()
})
