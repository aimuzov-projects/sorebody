import { expect, test } from '@playwright/test'

// В сборке для e2e счётчика нет (METRIKA=off), поэтому ym подменяем: смена спорта без
// перезагрузки должна отправить хит, иначе Метрика её не увидит
test('смена спорта без перезагрузки отправляет хит в Метрику, в статье -- тоже', async ({ page }) => {
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
	// referer -- адрес в строке в момент ухода
	const origin = new URL(page.url()).origin

	expect(options).toEqual({ title: expect.stringMatching(/^Травмы в паделе/), referer: `${origin}/` })

	// Хеш в том же спорте -- не новая страница: зона открылась, хитов не прибавилось
	await page.evaluate(() => (location.hash = '#zone=knee:0'))
	await expect(page.locator('.zone__title')).toHaveText('Колено')
	expect(await hits()).toHaveLength(1)

	// «Разбор ‹в …›» в открытой статье -- та же смена спорта и тот же хит
	await page.evaluate(() => (location.hash = '#ankle-sprain'))
	await page.locator('.reader:not(.theme-peek *) [data-sport-switch] button').click()
	await page.getByRole('option', { name: 'Кроссфит' }).click()
	await expect(page).toHaveURL(`${origin}/#ankle-sprain`)
	await expect.poll(hits).toHaveLength(2)
	expect((await hits())[1][3]).toMatchObject({ referer: `${origin}/padel/#ankle-sprain` })
})

// Ссылка «/?region=knee» со статьи: страница сразу меняет адрес на хеш зоны, «Назад» -- на
// корень. referer -- то, что было в строке в момент ухода
test('referer хита после захода по ссылке на зону -- адрес в строке при смене спорта', async ({ page }) => {
	await page.addInitScript(() => {
		const hits: unknown[][] = []

		Object.assign(window, { hits, ym: (...args: unknown[]) => hits.push(args) })
	})

	await page.goto('/?region=knee')
	await expect(page.locator('.zone__title')).toHaveText('Колено')
	await page.getByRole('button', { name: 'Назад' }).click()
	await expect(page).toHaveURL(/\/$/)

	const origin = new URL(page.url()).origin

	await page.getByRole('button', { name: 'Вид спорта Кроссфит' }).click()
	await page.getByRole('option', { name: 'Падел' }).click()
	await expect(page).toHaveURL(/\/padel\//)

	const hits = () => page.evaluate(() => (window as unknown as { hits: unknown[][] }).hits)

	await expect.poll(hits).toHaveLength(1)
	expect((await hits())[0][3]).toMatchObject({ referer: `${origin}/` })
})
