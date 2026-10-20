import { expect, test } from '@playwright/test'

import { ALL_FREQUENCIES_HINT, FREQUENCIES } from '#frontend/data/frequency.ts'

test('подсказка у чипа частоты объясняет, как уровень считается', async ({ page }) => {
	await page.goto('/')

	const tip = page.locator('.tip--hint')

	for (const [label, hint] of [['Все', ALL_FREQUENCIES_HINT], ...FREQUENCIES.map((f) => [f.label, f.hint])]) {
		const chip = page.getByRole('button', { name: label, exact: true })

		await chip.hover()
		await expect(tip).toHaveText(hint!)
		await page.mouse.move(0, 0)
		await expect(tip).toBeHidden()
	}
})
