import { expect, test, type Page } from '@playwright/test'

// Статья из списка зоны: модель замирает в кадре, в котором её застала статья, а не улетает
// к общему плану зоны под гаснущей сценой. После статьи курсор над той же травмой -- кадр
// остаётся, курсор ушёл -- камера возвращается ко всем травмам зоны
// Две сцены на программном WebGL в параллель рисуют кадр раз в секунды: тесты файла -- по очереди
test.describe.configure({ mode: 'default' })

type Shot = { x: number; y: number; z: number; zoom: number }

const shot = (page: Page) =>
	page.evaluate(() => {
		const { controls } = (window as unknown as { bodyScene: { controls: { object: Shot & { position: Shot } } } })
			.bodyScene
		const { x, y, z } = controls.object.position

		return { x, y, z, zoom: controls.object.zoom }
	})

const near = (a: Shot, b: Shot) =>
	Math.abs(a.x - b.x) < 1e-3 &&
	Math.abs(a.y - b.y) < 1e-3 &&
	Math.abs(a.z - b.z) < 1e-3 &&
	Math.abs(a.zoom - b.zoom) < 1e-3

/**
 * Камера доехала: за 20 кадров не сдвинулась. Считаем кадры, а не миллисекунды: программный WebGL
 * рисует редко, и по часам камера посреди облёта успевала дважды попасть в один кадр.
 */
async function settled(page: Page) {
	let last = await shot(page)

	await expect
		.poll(
			async () => {
				await page.evaluate(async () => {
					for (let i = 0; i < 20; i++) await new Promise(requestAnimationFrame)
				})

				const next = await shot(page)
				const still = near(last, next)

				last = next

				return still
			},
			{ intervals: [0], timeout: 60_000 },
		)
		.toBe(true)

	return last
}

/** Зона с моделью, курсор на строке травмы, камера у её места. */
async function openRow(page: Page) {
	// Модель под webdriver грузится только с `?scene`, и не быстро
	test.slow()
	await page.goto('/?scene#zone=knee:0')
	await page.waitForFunction(() => 'bodyScene' in window, null, { timeout: 60_000 })

	const row = page.locator('.zone .zone__item').first()
	const zone = await settled(page)

	await row.hover()
	await expect(row).toHaveClass(/zone__item--current/)
	// Камера отвечает строке с задержкой: сначала ждём, что она тронулась, потом -- что доехала
	await expect.poll(async () => near(await shot(page), zone), { timeout: 60_000 }).toBe(false)

	return { row, framed: await settled(page) }
}

test('статья из зоны: модель стоит, после неё курсор над той же травмой -- кадр не меняется', async ({ page }) => {
	const { row, framed } = await openRow(page)

	await row.click()
	await expect(page.locator('.reader')).toBeVisible()
	// Сцена гаснет 0,45 с и встаёт на паузу: за это время камера не двигается
	await page.waitForTimeout(800)
	expect(near(await shot(page), framed)).toBe(true)

	await page.keyboard.press('Escape')
	await expect(page.locator('.reader')).toHaveCount(0)
	await expect(row).toHaveClass(/zone__item--current/)
	expect(near(await settled(page), framed)).toBe(true)
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
	expect(near(await shot(page), framed)).toBe(true)

	await page.keyboard.press('Escape')
	await expect(page.locator('.reader')).toHaveCount(0)
	await expect(page.locator('.zone__item--current')).toHaveCount(0)
	expect(near(await settled(page), framed)).toBe(false)
})
