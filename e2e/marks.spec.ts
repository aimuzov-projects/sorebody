import { expect, test } from '@playwright/test'

// У «Всего тела» кроссфита четыре травмы делят одно место на фигуре. У каждой свой маркер с одним
// номером, как в списке, а не «1,2,3,4» на общем кружке (scene/marks.ts)
test('травмы с общим местом получают по маркеру, номера не склеиваются', async ({ page }) => {
	await page.goto('/#zone=other:0')

	const dots = page.locator('.body3d__mark-dot')

	await expect(dots).toHaveCount(await page.locator('.zone__list > li').count())
	expect(await dots.allTextContents()).toEqual(expect.arrayContaining(['1', '2']))

	for (const text of await dots.allTextContents()) expect(text).toMatch(/^\d+$/)
})
