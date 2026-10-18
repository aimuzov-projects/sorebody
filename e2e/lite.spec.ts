import { expect, test } from '@playwright/test'

// Медленный WebGL (`?lite` -- тот же режим на любом устройстве): постер и индекс, сцена -- по кнопке
test('без видеокарты 3D на паузе: индекс работает, кнопка включает сцену', async ({ page }) => {
	await page.goto('/?lite')

	const start = page.getByRole('button', { name: 'Включить 3D' })

	await expect(start).toBeVisible()
	await expect(page.locator('.body3d__poster-image')).toBeVisible()
	await expect(page.getByText('Нажмите на точку')).toHaveCount(0)

	// Зоны открываются из индекса и без сцены
	await page
		.locator('.index__zones')
		.getByRole('button', { name: /Колено/ })
		.click()

	await expect(page.locator('.zone__title')).toHaveText('Колено')
	await expect(start).toHaveCount(0)
	await page.getByRole('button', { name: 'Назад' }).click()

	await start.click()
	await expect(start).toHaveCount(0)
	await expect.poll(() => page.evaluate(() => 'bodyScene' in window), { timeout: 30_000 }).toBe(true)
})

// Ссылка со статьи открывает зону (`?region=` -> хеш), «Назад» -- общий план: без сцены на нём
// постер и плашка, а не пустота
test('без видеокарты после «Назад» из зоны по ссылке -- постер и кнопка «Включить 3D»', async ({ page }) => {
	await page.goto('/?lite&region=knee')
	await expect(page.locator('.zone__title')).toHaveText('Колено')
	await page.getByRole('button', { name: 'Назад' }).click()

	await expect(page.getByRole('button', { name: 'Включить 3D' })).toBeVisible()
	await expect(page.locator('.body3d__poster-image')).toBeVisible()
})
