import { expect, test, type Page } from '@playwright/test'

// Новый посетитель главной: лид под заголовком объясняет, что за сайт, а подсказка у фигуры --
// как им пользоваться. Подсказка разовая, отметка в localStorage. Модель для неё не нужна.
// Крестик на десктопе рядом с переключателем темы: наведение открывает подсмотр темы с копией
// страницы, её подсказку не считаем
const hint = (page: Page) => page.locator('.body3d__hint:not(.theme-peek *)')

test('на главной под заголовком лид со ссылкой на about', async ({ page }) => {
	await page.goto('/')

	const lead = page.locator('.index__lead')

	await expect(lead).toContainText('что болит после тренировки')
	await expect(lead.getByRole('link', { name: 'по исследованиям' })).toHaveAttribute('href', '/about/')
})

test('подсказка первого визита закрывается крестиком и больше не всплывает', async ({ page }) => {
	await page.goto('/')
	await expect(hint(page)).toBeVisible()

	await page.getByRole('button', { name: 'Закрыть подсказку' }).click()
	await expect(hint(page)).toHaveCount(0)

	await page.reload()
	await expect(page.locator('.index__lead')).toBeVisible()
	await expect(hint(page)).toHaveCount(0)
})

test('открытая зона прячет подсказку насовсем', async ({ page }) => {
	await page.goto('/')
	await expect(hint(page)).toBeVisible()

	await page.locator('.index__zone', { hasText: 'Плечо' }).click()
	await expect(page).toHaveURL(/#zone=shoulder/)
	await expect(hint(page)).toHaveCount(0)

	await page.goto('/')
	await expect(page.locator('.index__lead')).toBeVisible()
	await expect(hint(page)).toHaveCount(0)
})

test('подсказки нет, если адрес сразу открывает зону, и на странице движения', async ({ page }) => {
	await page.goto('/#zone=knee:0')
	await expect(page.locator('.zone')).toBeVisible()
	await expect(hint(page)).toHaveCount(0)

	await page.goto('/crossfit/elements/burpee/')
	await expect(page.locator('.index__title')).toBeVisible()
	await expect(hint(page)).toHaveCount(0)
	await expect(page.locator('.index__lead')).toHaveCount(0)
})

// Подсказка поверх сцены: ни кнопка, ни ссылка, ни поле под ней не должны прятаться
const overlaps = (page: Page) =>
	hint(page).evaluate((hint) => {
		const box = hint.getBoundingClientRect()
		const controls = 'a, button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])'

		return [...document.querySelectorAll(controls)]
			.filter((el) => !hint.contains(el) && !el.closest('.theme-peek') && el.checkVisibility())
			.filter((el) => {
				const r = el.getBoundingClientRect()

				return (
					r.width > 0 && r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top
				)
			})
			.map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim())
	})

for (const [width, height] of [
	[375, 663],
	[820, 900],
	[1024, 800],
]) {
	test(`подсказка не ложится на кнопки и ссылки на ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height })
		await page.goto('/')
		await expect(hint(page)).toBeVisible()

		expect(await overlaps(page)).toEqual([])
	})
}
