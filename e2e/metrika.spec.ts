import { expect, test } from '@playwright/test'

// В сборке для e2e счётчика нет (METRIKA=off), поэтому ym подменяем: смена спорта без
// перезагрузки должна отправить хит, иначе Метрика её не увидит
test('смена спорта без перезагрузки отправляет хит в Метрику, «Назад» -- тоже', async ({ page }) => {
	await page.addInitScript(() => {
		const hits: unknown[][] = []

		Object.assign(window, { hits, ym: (...args: unknown[]) => hits.push(args) })
	})

	const hits = () => page.evaluate(() => (window as unknown as { hits: unknown[][] }).hits)

	await page.goto('/')
	await page.locator('.body3d__canvas').waitFor({ state: 'attached' })
	await page.getByRole('button', { name: 'Вид спорта Кроссфит' }).click()
	await page.getByRole('option', { name: 'Падел' }).click()
	await expect(page).toHaveURL(/\/padel\/$/)

	await expect.poll(hits).toHaveLength(1)

	const [[id, method, url, options]] = await hits()

	expect(method).toBe('hit')
	expect(id).toEqual(expect.any(Number))
	expect(url).toMatch(/\/padel\/$/)
	expect(options).toEqual({ title: expect.stringMatching(/^Травмы в паделе/), referer: expect.stringMatching(/\/$/) })

	await page.goBack()
	await expect.poll(hits).toHaveLength(2)
	expect((await hits())[1][3]).toMatchObject({ referer: expect.stringMatching(/\/padel\/$/) })

	// Хеш в том же спорте -- не новая страница: зона открылась, хитов не прибавилось
	await page.evaluate(() => (location.hash = '#zone=knee:0'))
	await expect(page.locator('.zone__title')).toHaveText('Колено')
	expect(await hits()).toHaveLength(2)
})
