import { expect, test, type Page, type Route } from '@playwright/test'

// Чат по статье с подменённым бэкендом: сборка e2e идёт с CHAT=preview (playwright.config.ts),
// поэтому строка чата есть только с ?chat=1. Настоящий /api/chat в e2e не поднимается

const ARTICLE = '/crossfit/acl-tear/?chat=1'

const sse = (...events: [string, object][]) =>
	events.map(([type, data]) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`).join('')

const ANSWER = sse(
	['session', { id: 's1' }],
	['status', { step: 'red-flags' }],
	[
		'alarms',
		{
			flags: [
				{
					slug: 'acl-tear',
					title: 'Разрыв ПКС',
					url: 'https://sorebody.aimuzov.online/injuries/acl-tear/#urgent',
					alarms: [
						{ text: 'Стопа холодная и бледная', urgency: 'call', action: 'сразу скорая (103/112)' },
						{ text: 'Не наступить на ногу', urgency: 'today', action: 'сегодня в травмпункт' },
						{ text: 'Болит ночью', urgency: 'soon', action: 'к врачу в ближайшие дни' },
					],
				},
			],
		},
	],
	['cards', { cards: [{ slug: 'acl-tear', title: 'Разрыв ПКС', url: '/crossfit/acl-tear/' }] }],
	[
		'text',
		{ text: '**Сегодня в травмпункт.** Подробнее: [статья](https://sorebody.aimuzov.online/injuries/acl-tear/)' },
	],
	['done', { turnsLeft: 3 }],
)

/** Подмена /api/chat: GET -- открыт ли чат, POST -- ответ потоком, тело запроса запоминаем. */
async function mockChat(page: Page, reply: (route: Route) => Promise<void> | void) {
	const posts: unknown[] = []

	await page.route('**/api/chat*', async (route) => {
		const request = route.request()

		if (request.method() === 'GET') return route.fulfill({ json: { open: true } })

		if (request.method() === 'POST') posts.push(request.postDataJSON())

		return reply(route)
	})

	return posts
}

const answer = (route: Route) =>
	route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: ANSWER })

const input = (page: Page) => page.getByRole('textbox', { name: 'Вопрос по справочнику' })
const feed = (page: Page) => page.getByRole('region', { name: 'Вопрос по статье' })

test('без метки ?chat=1 строки чата нет', async ({ page }) => {
	await page.goto('/crossfit/acl-tear/')
	await expect(page.locator('.article__body')).toBeVisible()
	await expect(input(page)).toHaveCount(0)
})

test('строка внизу шириной с колонку текста, фокус накрывает статью диалогом', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 })

	const posts = await mockChat(page, answer)

	await page.goto(ARTICLE)
	await expect(input(page)).toBeVisible()

	const column = (await page.locator('.article__body').boundingBox())!
	const bar = (await page.locator('.dock__bar').boundingBox())!

	expect(Math.round(bar.x)).toBe(Math.round(column.x))
	expect(Math.round(bar.width)).toBe(Math.round(column.width))
	expect(bar.y + bar.height).toBeGreaterThan(760)
	await expect(feed(page)).toBeHidden()

	await input(page).click()
	await expect(feed(page)).toBeVisible()
	await expect(feed(page)).toContainText('Ассистент сначала проверит тревожные признаки')
	await expect(feed(page)).toContainText('Отправляя вопрос, вы с этим соглашаетесь')

	// Вебвизор не пишет ни ввод, ни ленту: в них симптомы
	await expect(input(page)).toHaveClass(/ym-disable-keys/)
	await expect(feed(page)).toHaveClass(/ym-hide-content/)

	await input(page).fill('хлопнуло в колене')
	await page.keyboard.press('Enter')

	// Сначала реплика модели; признаки из инструмента -- свёрнутым списком под ней, самые срочные первыми
	await expect(feed(page).locator('.answer__text strong')).toHaveText('Сегодня в травмпункт.')

	const alarms = feed(page).locator('.answer__alarms')

	await expect(alarms.locator('summary')).toHaveText('Когда сразу к врачу · 3')
	await expect(alarms.getByText('Стопа холодная и бледная')).toBeHidden()

	await alarms.locator('summary').click()
	await expect(alarms.locator('.answer__alarm').first()).toContainText('Скорая 103 или 112')
	await expect(alarms.locator('.answer__alarm').last()).toContainText('Болит ночью')

	const card = feed(page).getByRole('list', { name: 'Статьи' }).getByRole('link')

	await expect(card).toContainText('Разрыв ПКС')
	expect(posts).toEqual([{ message: 'хлопнуло в колене', sport: 'crossfit', article: 'acl-tear' }])

	// Esc сворачивает диалог в строку, переписка ждёт следующего фокуса
	await page.keyboard.press('Escape')
	await expect(feed(page)).toBeHidden()
	await input(page).click()
	await expect(feed(page).locator('.answer__question')).toHaveText('хлопнуло в колене')

	// Второй вопрос -- в тот же диалог
	await input(page).fill('а если не опухло?')
	await page.keyboard.press('Enter')
	await expect.poll(() => posts.length).toBe(2)
	expect(posts[1]).toMatchObject({ session: 's1', article: 'acl-tear' })
})

test('шапка с «Назад», пояснение слева, нажатие по размытию чат не закрывает', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 })

	const posts = await mockChat(page, answer)

	await page.goto(ARTICLE)
	await input(page).click()

	// На широком экране слева, на месте оглавления, -- дисклеймер; что умеет и примеры -- справа, в ленте
	const aside = page.getByRole('complementary', { name: 'Важно' })

	await expect(aside).toContainText('Это справка, а не диагноз')
	await expect(aside).not.toContainText('Ассистент сначала проверит')
	expect((await aside.boundingBox())!.x).toBeLessThan((await page.locator('.dock__feed').boundingBox())!.x)

	await feed(page).getByRole('button', { name: 'К какому врачу идти?' }).click()
	await expect.poll(() => posts.length).toBe(1)
	await expect(feed(page).getByRole('list', { name: 'Примеры вопросов' })).toBeHidden()

	// Esc с фокусом не в поле сворачивает чат, а не уводит со статьи, как "Назад"
	await feed(page).locator('.answer__alarms summary').focus()
	await page.keyboard.press('Escape')
	await expect(feed(page)).toBeHidden()
	await expect(page).toHaveURL(/\/crossfit\/acl-tear\//)
	await input(page).click()

	await page.mouse.click(1240, 400)
	await expect(feed(page)).toBeVisible()

	await page.getByRole('button', { name: 'Назад к статье' }).click()
	await expect(feed(page)).toBeHidden()
})

test('чат на сегодня закрыт -- «вернётся завтра», поле выключено', async ({ page }) => {
	await page.route('**/api/chat*', (route) =>
		route.fulfill({ json: { open: false, reopensAt: '2026-10-22T21:00:00.000Z' } }),
	)

	await page.goto(ARTICLE)
	await input(page).click()
	await expect(feed(page)).toContainText('вернётся завтра')
	await expect(input(page)).toBeDisabled()
})

test('сервис не ответил -- понятный текст, а не пустой экран', async ({ page }) => {
	await mockChat(page, (route) => route.fulfill({ status: 502, body: 'Bad gateway' }))

	await page.goto(ARTICLE)
	await input(page).fill('болит плечо')
	await page.getByRole('button', { name: 'Отправить' }).click()
	await expect(feed(page).getByRole('alert')).toContainText('Не получилось ответить')
})

test('статья поверх модели главной: строка чата внутри статьи и уходит вместе с ней', async ({ page }) => {
	await page.goto('/crossfit/?chat=1')

	await page
		.getByRole('button', { name: /Голова/ })
		.first()
		.click()

	await page
		.getByRole('link', { name: /Травмы лица и зубов/ })
		.first()
		.click()

	await expect(page.getByRole('heading', { level: 1, name: /Травмы лица и зубов/ })).toBeVisible()
	await expect(input(page)).toBeVisible()
	await expect(page.locator('.reader .dock__bar')).toBeInViewport()

	await page.locator('.reader__back').click()
	await expect(page.locator('.reader')).toHaveCount(0)
	await expect(page.locator('.dock')).toHaveCount(0)
})

test.describe('телефон', () => {
	test.use({ viewport: { width: 375, height: 663 }, hasTouch: true, isMobile: true })

	test('кнопка оглавления в одну линию со строкой, в чате строка во всю колонку, вбок не скроллится', async ({
		page,
	}) => {
		await mockChat(page, answer)
		await page.goto(ARTICLE)

		const column = (await page.locator('.article__body').boundingBox())!
		const box = async () => (await page.locator('.dock__bar').boundingBox())!
		const bar = await box()
		const toc = (await page.locator('.toc-menu__button').boundingBox())!

		// Строка от левого края колонки, справа от неё кнопка оглавления: по центру строки,
		// размером с кнопку отправки, правым краем -- по колонке
		expect(Math.round(bar.x)).toBe(Math.round(column.x))
		expect(toc.x).toBeGreaterThan(bar.x + bar.width)
		expect(Math.round(toc.x + toc.width)).toBe(Math.round(column.x + column.width))
		expect(Math.abs(toc.y + toc.height / 2 - (bar.y + bar.height / 2))).toBeLessThan(1.5)
		expect(toc.width).toBe((await page.getByRole('button', { name: 'Отправить' }).boundingBox())!.width)

		await input(page).tap()
		await expect.poll(async () => Math.round((await box()).width)).toBe(Math.round(column.width))

		// Кнопка оглавления под размытием не прыгает и не меняет размер
		expect(await page.locator('.toc-menu__button').boundingBox()).toEqual(toc)

		await input(page).fill('подвернул ногу')
		await page.getByRole('button', { name: 'Отправить' }).tap()
		await expect(feed(page).getByRole('list', { name: 'Статьи' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Отправить' })).toBeInViewport()

		// innerWidth растягивается вместе со страницей, поэтому сравниваем с clientWidth
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
		)

		expect(overflow).toBeLessThanOrEqual(0)
	})
})

/** Ответ со ссылкой, как её присылает сервер: путь на сайте и заголовок вместо адреса. */
const linked = (label: string, href: string) => (route: Route) =>
	route.fulfill({
		status: 200,
		headers: { 'Content-Type': 'text/event-stream' },
		body: sse(
			['session', { id: 's1' }],
			['text', { text: `Подробнее: [${label}](${href})` }],
			['done', { turnsLeft: 3 }],
		),
	})

test('ссылка на раздел этой статьи: чат сворачивается, страница едет к разделу', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 })
	await mockChat(page, linked('Разрыв ПКС — когда сразу к врачу', '/injuries/acl-tear/#urgent'))
	await page.goto(ARTICLE)

	await input(page).fill('когда к врачу?')
	await page.keyboard.press('Enter')
	await feed(page).getByRole('link', { name: 'Разрыв ПКС — когда сразу к врачу' }).click()

	await expect(feed(page)).toBeHidden()
	await expect(page).toHaveURL(/\/crossfit\/acl-tear\/\?chat=1$/)
	await expect(page.locator('#urgent')).toBeInViewport()
})

test('ссылка на другую статью на главной: открывается в ридере без перезагрузки, переписка на месте', async ({
	page,
}) => {
	await mockChat(page, linked('Разрыв мениска', '/crossfit/meniscus-tear/'))
	await page.goto('/crossfit/?chat=1')

	await page
		.getByRole('button', { name: /Колено/ })
		.first()
		.click()

	await page
		.getByRole('link', { name: /крестообразной/ })
		.first()
		.click()

	await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1))
	await input(page).fill('а мениск?')
	await page.keyboard.press('Enter')
	await feed(page).getByRole('link', { name: 'Разрыв мениска' }).click()

	await expect(page).toHaveURL(/\/crossfit\/meniscus-tear\//)
	await expect(page.getByRole('heading', { level: 1, name: /мениска/ })).toBeVisible()
	expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1)

	await input(page).click()
	await expect(feed(page).locator('.answer__question')).toHaveText('а мениск?')
})

test.describe('кнопка оглавления', () => {
	test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true })

	test('одного размера везде: и на странице «Что нового», где чата нет', async ({ page }) => {
		await page.goto('/changelog')

		const button = (await page.locator('.toc-menu__button').boundingBox())!

		expect([button.width, button.height]).toEqual([36, 36])
	})
})

test('статья поверх модели на узком экране: кнопка оглавления над подложкой строки, а не под ней', async ({ page }) => {
	await page.goto('/crossfit/?chat=1')

	await page
		.getByRole('button', { name: /Голова/ })
		.first()
		.click()

	await page
		.getByRole('link', { name: /Травмы лица и зубов/ })
		.first()
		.click()

	await page.setViewportSize({ width: 375, height: 667 })
	await expect(input(page)).toBeVisible()

	const toc = page.locator('.reader .toc-menu__button')
	const box = (await toc.boundingBox())!
	const top = await page.evaluate(
		([x, y]) => document.elementFromPoint(x!, y!)?.closest('.toc-menu__button') !== null,
		[box.x + box.width / 2, box.y + box.height / 2],
	)

	expect(top).toBe(true)
})
