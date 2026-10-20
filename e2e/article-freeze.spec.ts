import { expect, test, type Page } from '@playwright/test'

// Статья из списка зоны: модель замирает в кадре, в котором её застала статья, а не улетает
// к общему плану зоны под гаснущей сценой. После статьи курсор над той же травмой -- кадр
// остаётся, курсор ушёл -- камера возвращается ко всем травмам зоны.
// Сверяем цель камеры (bodyScene.goal), а не её положение: на программном WebGL в CI камера
// доезжает минутами, а цель меняется сразу
// Две сцены на программном WebGL в параллель рисуют кадр раз в секунды: тесты файла -- по очереди
test.describe.configure({ mode: 'default' })

type Goal = { x: number; y: number; z: number; zoom: number; azimuth: number; polar: number } | null

const goal = (page: Page) =>
	page.evaluate(() => (window as unknown as { bodyScene: { goal(): Goal } }).bodyScene.goal())

const same = (a: Goal, b: Goal) =>
	a === b ||
	(!!a &&
		!!b &&
		(['x', 'y', 'z', 'zoom', 'azimuth', 'polar'] as const).every((key) => Math.abs(a[key] - b[key]) < 1e-3))

/** Зона с моделью, курсор на строке травмы, камера едет к её месту. */
async function openRow(page: Page) {
	// Модель под webdriver грузится только с `?scene`, и не быстро
	test.slow()
	await page.goto('/?scene#zone=knee:0')
	await page.waitForFunction(() => 'bodyScene' in window, null, { timeout: 60_000 })

	const row = page.locator('.zone .zone__item').first()

	await expect.poll(() => goal(page), { timeout: 60_000 }).not.toBeNull()

	const zone = await goal(page)

	await row.hover()
	await expect(row).toHaveClass(/zone__item--current/)
	// Камера отвечает строке с задержкой
	await expect.poll(async () => same(await goal(page), zone), { timeout: 30_000 }).toBe(false)

	return { row, framed: await goal(page) }
}

test('статья из зоны: модель стоит, после неё курсор над той же травмой -- кадр не меняется', async ({ page }) => {
	const { row, framed } = await openRow(page)

	await row.click()
	await expect(page.locator('.reader')).toBeVisible()
	// Сцена гаснет 0,45 с и встаёт на паузу: цель камеры за это время прежняя
	await page.waitForTimeout(800)
	expect(same(await goal(page), framed)).toBe(true)

	await page.keyboard.press('Escape')
	await expect(page.locator('.reader')).toHaveCount(0)
	await expect(row).toHaveClass(/zone__item--current/)
	await page.waitForTimeout(800)
	expect(same(await goal(page), framed)).toBe(true)
})

test('статья из зоны: курсор ушёл со строки -- после статьи модель возвращается ко всем травмам', async ({ page }) => {
	const { row, framed } = await openRow(page)

	await row.click()
	await expect(page.locator('.reader')).toBeVisible()

	// Курсор -- в стороне от списка зоны, над статьёй
	const panel = (await page.locator('.zone').boundingBox())!
	const width = page.viewportSize()!.width

	await page.mouse.move(panel.x > width / 2 ? 20 : width - 20, panel.y + panel.height / 2)
	await page.waitForTimeout(800)
	expect(same(await goal(page), framed)).toBe(true)

	await page.keyboard.press('Escape')
	await expect(page.locator('.reader')).toHaveCount(0)
	await expect(page.locator('.zone__item--current')).toHaveCount(0)
	await expect.poll(async () => same(await goal(page), framed), { timeout: 30_000 }).toBe(false)
})
