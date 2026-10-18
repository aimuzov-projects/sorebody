import { expect, test } from '@playwright/test'

const SLUG = 'rotator-cuff-tendinopathy'

test('плашка «справка, а не диагноз» ведёт к разделу «Когда сразу к врачу»', async ({ page }) => {
	await page.goto(`/injuries/${SLUG}/`)

	const note = page.getByRole('note').filter({ hasText: 'Это справка, а не диагноз' })

	await expect(note).toBeVisible()
	await note.getByRole('link', { name: '«Когда сразу к врачу»' }).click()
	await expect(page.locator('#urgent')).toBeInViewport()
})

test('на главной ссылка из плашки прокручивает статью, а не закрывает её', async ({ page }) => {
	await page.goto(`/#${SLUG}`)

	const note = page.locator('.reader').getByRole('note').filter({ hasText: 'Это справка, а не диагноз' })

	await note.getByRole('link', { name: '«Когда сразу к врачу»' }).click()
	await expect(page).toHaveURL(new RegExp(`#${SLUG}$`))
	await expect(page.locator('.reader #urgent')).toBeInViewport()
})
