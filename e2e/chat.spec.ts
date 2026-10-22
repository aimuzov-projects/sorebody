import { expect, test, type Page, type Route } from '@playwright/test'

// Чат на сайте с подменённым бэкендом: сборка e2e идёт с CHAT=preview (playwright.config.ts),
// поэтому кнопка есть только с ?chat=1. Настоящий /api/chat в e2e не поднимается

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
	['cards', { cards: [{ slug: 'acl-tear', title: 'Разрыв ПКС', url: '/crossfit/acl-tear/', draft: true }] }],
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

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Описать своими словами' })

async function openChat(page: Page) {
	await page.goto('/crossfit/?chat=1')
	await page.getByRole('button', { name: 'Описать своими словами' }).first().click()
	await expect(sheet(page)).toBeVisible()
}

test('без метки ?chat=1 кнопки чата нет', async ({ page }) => {
	await page.goto('/crossfit/')
	await expect(page.locator('.index__panel')).toBeAttached()
	await expect(page.getByRole('button', { name: 'Описать своими словами' })).toHaveCount(0)
})

test('чат: согласие, вопрос, признаки, текст, статья с плашкой черновика', async ({ page }) => {
	const posts = await mockChat(page, (route) =>
		route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: ANSWER }),
	)

	await openChat(page)

	const input = sheet(page).getByRole('textbox', { name: 'Ваш вопрос' })

	await expect(input).toBeDisabled()
	await sheet(page).getByRole('button', { name: 'Понятно' }).click()
	await expect(input).toBeFocused()

	// Вебвизор не пишет ни ввод, ни ленту: в них симптомы
	await expect(input).toHaveClass(/ym-disable-keys/)
	await expect(sheet(page).locator('.chat__feed')).toHaveClass(/ym-hide-content/)

	await input.fill('хлопнуло в колене')
	await sheet(page).getByRole('button', { name: 'Отправить' }).click()

	const alarms = sheet(page).getByRole('list', { name: 'Когда сразу к врачу' })

	await expect(alarms).toContainText('Скорая 103 или 112')
	await expect(alarms).toContainText('Сегодня в травмпункт')
	await expect(alarms).not.toContainText('Болит ночью')
	await expect(sheet(page).locator('.chat__later')).toContainText('ещё 1')

	await expect(sheet(page).locator('.chat__text strong')).toHaveText('Сегодня в травмпункт.')

	await expect(sheet(page).getByRole('link', { name: 'статья' })).toHaveAttribute(
		'href',
		'https://sorebody.aimuzov.online/injuries/acl-tear/',
	)

	const card = sheet(page).getByRole('list', { name: 'Статьи' }).getByRole('link')

	await expect(card).toContainText('Разрыв ПКС')
	await expect(card).toContainText('черновик')
	expect(posts).toEqual([{ message: 'хлопнуло в колене', sport: 'crossfit' }])

	// Второй вопрос идёт в тот же диалог
	await input.fill('а если не опухло?')
	await sheet(page).getByRole('button', { name: 'Отправить' }).click()
	await expect.poll(() => posts.length).toBe(2)
	expect(posts[1]).toMatchObject({ session: 's1', message: 'а если не опухло?' })
})

test('чат: Esc закрывает, переписка дожидается следующего открытия', async ({ page }) => {
	await mockChat(page, (route) =>
		route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: ANSWER }),
	)

	await openChat(page)
	await sheet(page).getByRole('button', { name: 'Понятно' }).click()
	await sheet(page).getByRole('button', { name: 'Болит колено после бега' }).click()
	await expect(sheet(page).locator('.chat__question')).toHaveText('Болит колено после бега')

	await page.keyboard.press('Escape')
	await expect(sheet(page)).toBeHidden()

	await page.getByRole('button', { name: 'Описать своими словами' }).first().click()
	await expect(sheet(page).locator('.chat__question')).toHaveText('Болит колено после бега')
})

test('чат: на сегодня закрыт -- заглушка «вернётся завтра», поле выключено', async ({ page }) => {
	await page.route('**/api/chat*', (route) =>
		route.fulfill({ json: { open: false, reopensAt: '2026-10-22T21:00:00.000Z' } }),
	)

	await openChat(page)
	await expect(sheet(page)).toContainText('вернётся завтра')
	await expect(sheet(page).getByRole('textbox', { name: 'Ваш вопрос' })).toBeDisabled()
})

test('чат: сервис не ответил -- понятный текст, а не пустой экран', async ({ page }) => {
	await mockChat(page, (route) => route.fulfill({ status: 502, body: 'Bad gateway' }))

	await openChat(page)
	await sheet(page).getByRole('button', { name: 'Понятно' }).click()
	await sheet(page).getByRole('textbox', { name: 'Ваш вопрос' }).fill('болит плечо')
	await sheet(page).getByRole('button', { name: 'Отправить' }).click()
	await expect(sheet(page).getByRole('alert')).toContainText('Не получилось ответить')
})

test.describe('телефон', () => {
	test.use({ viewport: { width: 375, height: 663 }, hasTouch: true, isMobile: true })

	test('лист на весь экран, поле ввода видно, страница не скроллится вбок', async ({ page }) => {
		await mockChat(page, (route) =>
			route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: ANSWER }),
		)

		await page.goto('/crossfit/?chat=1')
		await page.locator('.index__island-open').tap()
		await page.getByRole('button', { name: 'Описать своими словами' }).first().tap()
		await sheet(page).getByRole('button', { name: 'Понятно' }).tap()

		const box = await sheet(page).boundingBox()

		expect(box).toMatchObject({ x: 0, y: 0, width: 375 })
		expect(Math.round(box!.height)).toBe(663)

		await sheet(page).getByRole('textbox', { name: 'Ваш вопрос' }).fill('подвернул ногу')
		await sheet(page).getByRole('button', { name: 'Отправить' }).tap()
		await expect(sheet(page).getByRole('list', { name: 'Статьи' })).toBeVisible()
		await expect(sheet(page).getByRole('button', { name: 'Отправить' })).toBeInViewport()

		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

		expect(overflow).toBeLessThanOrEqual(0)
		await page.screenshot({ path: 'test-results/chat-mobile.png' })
	})
})
