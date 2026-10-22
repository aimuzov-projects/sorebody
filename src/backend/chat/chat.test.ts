import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'

import { httpHandler } from '#backend/http.ts'
import { knowledgeTools } from '#backend/knowledge/tools.ts'
import { diskKnowledge } from '#frontend/lib/knowledge-disk.ts'

import { dailyCounter } from './daily.ts'
import { chatHandler, QUOTA } from './http.ts'
import { keepKnownLinks } from './links.ts'
import { maskContacts } from './mask.ts'
import { OpenRouterError, type AssistantMessage, type Complete, type Message } from './openrouter.ts'
import { chatSystem, RED_FLAGS_REMINDER } from './prompt.ts'
import { sessionStore } from './sessions.ts'
import { chatTools } from './tools.ts'
import { ChatLimitError, chatTurn, FALLBACK, LIMITS, type ChatEvent } from './turn.ts'

const tools = knowledgeTools(diskKnowledge())
const chat = chatTools(tools)
const system = chatSystem(tools)

let ids = 0

/** Ответ модели с вызовами инструментов; рассуждения -- чтобы проверить, что они вернутся как есть. */
const calls = (...list: [string, object][]): AssistantMessage => ({
	role: 'assistant',
	content: '',
	reasoning_details: [{ type: 'reasoning.encrypted', data: `secret-${++ids}` }],
	tool_calls: list.map(([name, args]) => ({
		id: `call-${++ids}`,
		type: 'function',
		function: { name, arguments: JSON.stringify(args) },
	})),
})

const say = (content: string): AssistantMessage => ({ role: 'assistant', content })

/** Модель по сценарию: отдаёт ответы по очереди и запоминает, что ей прислали. */
function scripted(replies: AssistantMessage[], { cost = 0.01, finish = 'stop' } = {}) {
	const requests: Message[][] = []
	const complete: Complete = async ({ messages }) => {
		requests.push(structuredClone(messages))

		// Последний ответ повторяется: так модель, которая не останавливается
		const message = (replies.length > 1 ? replies.shift() : replies[0]) ?? say('')

		return {
			choices: [{ finish_reason: finish, message }],
			usage: { prompt_tokens: 1, completion_tokens: 1, cost },
		}
	}

	return { complete, requests }
}

async function turn(complete: Complete, message: string, session = sessionStore({ ttlMs: 1000, max: 5 }).create()) {
	const events: ChatEvent[] = []

	await chatTurn({ complete, system, tools: chat, session, message, emit: (e) => events.push(e) })

	return { events, session }
}

test('chat: признаки, поиск, статья, ответ -- события по порядку, рассуждения возвращаются', async () => {
	const flags = calls(['get_red_flags', { region: 'knee' }])
	const { complete, requests } = scripted([
		flags,
		calls(['search_injuries', { query: 'хлопнуло в колене', region: 'knee' }]),
		calls(['get_article', { slug: 'acl-tear', sections: ['first-steps'] }]),
		say('Сегодня в травмпункт.'),
	])
	const { events, session } = await turn(complete, 'хлопнуло в колене')

	assert.deepEqual(
		events.map((e) => (e.type === 'status' ? e.step : e.type)),
		['red-flags', 'alarms', 'search', 'cards', 'article', 'text'],
	)

	assert.deepEqual(requests[1]![0], { role: 'system', content: system })
	assert.deepEqual(requests[1]![2], flags, 'ответ с рассуждениями уходит обратно без изменений')

	const alarms = events.find((e) => e.type === 'alarms')!
	const cards = events.find((e) => e.type === 'cards')!

	assert.ok(alarms.type === 'alarms' && alarms.flags.every((f) => !('urgent' in f)), 'признаки краткие')
	assert.ok(cards.type === 'cards' && cards.cards.every((c) => c.draft === true))
	assert.equal(session.messages.at(-1)!.content, 'Сегодня в травмпункт.')
	assert.equal(session.cost.toFixed(2), '0.04')
	assert.ok(session.flagged)
})

test('chat: искал без признаков -- напоминание вместо ответа, история не правится', async () => {
	const search = calls(['search_injuries', { query: 'болит пятка' }])
	const { complete, requests } = scripted([
		search,
		say('Похоже на фасциит.'),
		calls(['get_red_flags', { region: 'ankle-foot' }]),
		say('Сначала признаки, потом статья.'),
	])
	const { events, session } = await turn(complete, 'болит пятка')

	const remind = requests[2]!

	assert.deepEqual(remind.at(-1), { role: 'system', content: RED_FLAGS_REMINDER })
	assert.ok(!remind.some((m) => m.content === 'Похоже на фасциит.'), 'ответ без признаков не дописан')
	assert.deepEqual(remind.slice(0, -1), requests[1], 'начало истории то же, что в прошлом запросе')
	assert.deepEqual((events.at(-1) as { text: string }).text, 'Сначала признаки, потом статья.')
	assert.ok(session.reminded)
})

test('chat: статья без разделов и чужой инструмент -- ошибка модели текстом', async () => {
	const { complete, requests } = scripted([
		calls(['get_article', { slug: 'acl-tear' }], ['delete_everything', {}], ['get_red_flags', { region: 'mars' }]),
		say('Готово.'),
	])

	await turn(complete, 'колено')

	const results = requests[1]!.filter((m) => m.role === 'tool').map((m) => m.content)

	assert.match(results[0]!, /^Ошибка: Укажи sections/)
	assert.match(results[1]!, /^Ошибка: Нет инструмента/)
	assert.match(results[2]!, /^Ошибка: Нет зоны/)
})

test('chat: модель зовёт инструменты без конца -- отказ сверх потолка и запасной ответ', async () => {
	const { complete, requests } = scripted([calls(['get_red_flags', { region: 'knee' }])])
	const { events } = await turn(complete, 'колено')

	assert.equal(requests.length, LIMITS.toolCalls + 3)
	assert.equal(events.filter((e) => e.type === 'alarms').length, LIMITS.toolCalls)
	assert.ok(requests.at(-1)!.some((m) => m.role === 'tool' && m.content.startsWith('Ошибка: вызовов')))
	assert.deepEqual(events.at(-1), { type: 'text', text: FALLBACK })
})

test('chat: пустой ответ и фильтр -- запасной текст', async () => {
	for (const [reply, finish] of [
		[say(''), 'stop'],
		[say('что-то'), 'content_filter'],
	] as const) {
		const { events } = await turn(scripted([reply], { finish }).complete, 'колено')

		assert.deepEqual(events.at(-1), { type: 'text', text: FALLBACK })
	}
})

test('chat: потолки диалога -- реплики и деньги', async () => {
	const sessions = sessionStore({ ttlMs: 1000, max: 5 })
	const session = sessions.create()
	const { complete } = scripted([say('Ответ.')], { cost: 0.01 })

	for (let i = 0; i < LIMITS.turns; i++) await turn(complete, 'колено', session)

	await assert.rejects(turn(complete, 'колено', session), (e) => e instanceof ChatLimitError && e.reason === 'turns')

	const rich = sessions.create()

	rich.cost = LIMITS.cost

	await assert.rejects(turn(complete, 'колено', rich), (e) => e instanceof ChatLimitError && e.reason === 'cost')
})

test('maskContacts: почта и телефоны в любой записи', () => {
	assert.equal(
		maskContacts('пишите ivan.petrov@mail.ru или +7 (912) 345-67-89, 89123456789'),
		'пишите [почта скрыта] или [телефон скрыт], [телефон скрыт]',
	)

	// Цифры без формы номера не трогаем: «8 подходов по 12» -- это тренировка
	assert.equal(maskContacts('8 подходов по 12, вес 80'), '8 подходов по 12, вес 80')
})

test('chat: контакты уходят модели скрытыми', async () => {
	const { complete, requests } = scripted([say('Ответ.')])

	await turn(complete, 'болит колено, мой номер 8 912 345 67 89')

	assert.equal(requests[0]!.at(-1)!.content, 'болит колено, мой номер [телефон скрыт]')
})

test('sessionStore: живут ttl с последней реплики, лишние вытесняются, занятые -- нет', () => {
	let time = 0
	const sessions = sessionStore({ ttlMs: 100, max: 2, now: () => time })
	const a = sessions.create()
	const b = sessions.create()

	time = 50
	assert.ok(sessions.get(a.id), 'реплика продлевает жизнь')

	sessions.create()
	assert.equal(sessions.get(b.id), undefined, 'вытеснена самая давняя')

	a.busy = true
	time = 1000
	sessions.get('')
	assert.ok(sessions.get(a.id), 'занятую не стираем посреди ответа')
})

/** Сервер с чатом на подделанной модели; `events` -- разобранный поток SSE. */
async function server(complete: Complete, extra: Partial<Parameters<typeof chatHandler>[0]> = {}) {
	const handler = httpHandler({
		tools,
		version: '0',
		hosts: ['127.0.0.1'],
		perMinute: 100,
		chat: chatHandler({ complete, tools, origins: ['https://site.test'], ...extra }),
	})
	const srv = createServer(handler)

	await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve))

	const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/chat`
	const post = (body: object, origin = 'https://site.test') =>
		fetch(base, { method: 'POST', headers: { Origin: origin }, body: JSON.stringify(body) })
	const events = async (res: Response) =>
		(await res.text())
			.trim()
			.split('\n\n')
			.map((block) => {
				const [, type = '', data = ''] = block.match(/^event: (.+)\ndata: (.+)$/) ?? []

				return { type, data: JSON.parse(data) }
			})

	return { base, post, events, close: () => srv.close() }
}

test('http: реплика потоком SSE, продолжение диалога, спорт с сайта, удаление', async (t) => {
	const { complete, requests } = scripted([say('Первый.'), say('Второй.')])
	const { base, post, events, close } = await server(complete)

	t.after(close)

	const first = await post({ message: 'болит колено', sport: 'padel' })

	assert.equal(first.headers.get('content-type'), 'text/event-stream; charset=utf-8')

	const stream = await events(first)
	const id = stream[0]!.data.id

	assert.deepEqual(
		stream.map((e) => e.type),
		['session', 'text', 'done'],
	)

	assert.deepEqual(stream.at(-1)!.data, { turnsLeft: LIMITS.turns - 1 })
	assert.match(String(requests[0]!.at(-1)!.content), /Падел.*padel/)

	const second = await events(await post({ session: id, message: 'а если бегаю?' }))

	assert.equal(second[1]!.data.text, 'Второй.')
	assert.ok(!requests[1]!.slice(3).some((m) => m.role === 'system'), 'спорт сообщается один раз')

	const removed = await fetch(`${base}?session=${id}`, { method: 'DELETE', headers: { Origin: 'https://site.test' } })

	assert.equal(removed.status, 204)
	assert.equal((await post({ session: id, message: 'ещё' })).status, 404)
})

test('http: чужой сайт, плохое тело, OpenRouter недоступен', async (t) => {
	const logged: unknown[] = []

	t.mock.method(console, 'error', (...args: unknown[]) => logged.push(...args))

	const { post, events, close } = await server(async () => {
		throw new OpenRouterError(503)
	})

	t.after(close)

	assert.equal((await post({ message: 'колено' }, 'https://evil.test')).status, 403)
	assert.equal((await post({ message: '' })).status, 400)
	assert.equal((await post({ message: 'x'.repeat(1001) })).status, 400)

	const stream = await events(await post({ message: 'секретная жалоба' }))

	assert.deepEqual(stream.at(-1), { type: 'error', data: { reason: 'unavailable' } })
	assert.ok(!JSON.stringify(logged).includes('секретная'), 'текст реплики в лог не попал')
})

test('http: без чата /api/chat -- 404', async (t) => {
	const srv = createServer(httpHandler({ tools, version: '0', hosts: ['127.0.0.1'], perMinute: 100 }))

	await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve))
	t.after(() => srv.close())

	const res = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/chat`, { method: 'POST' })

	assert.equal(res.status, 404)
})

test('dailyCounter: сутки по Москве -- обнуляется в полночь МСК, а не UTC', () => {
	// 2026-10-22 23:30 МСК = 20:30 UTC
	let time = Date.UTC(2026, 9, 22, 20, 30)
	const counter = dailyCounter({ limit: 1, now: () => time })

	counter.add(0.6)
	counter.add(0.6)
	assert.equal(counter.open, false)
	assert.equal(counter.resetsAt, '2026-10-22T21:00:00.000Z')

	time = Date.UTC(2026, 9, 22, 21, 0)
	assert.equal(counter.open, true)
	assert.equal(counter.used, 0)
})

test('http: частит один адрес -- 429 с Retry-After, суточный запас не тратится', async (t) => {
	const { post, close } = await server(scripted([say('Ответ.')]).complete, {
		quota: { ...QUOTA, perMinute: 2, perDay: 3 },
	})

	t.after(close)

	const statuses = []

	for (let i = 0; i < 4; i++) statuses.push((await post({ message: 'колено' })).status)

	assert.deepEqual(statuses, [200, 200, 429, 429])

	const limited = await post({ message: 'колено' })

	assert.ok(Number(limited.headers.get('retry-after')) > 0)
	assert.deepEqual(await limited.json(), { reason: 'rate' })
})

test('http: деньги на сегодня кончились -- 503 до полуночи, GET это показывает', async (t) => {
	let time = Date.UTC(2026, 9, 22, 9, 0)
	const { base, post, events, close } = await server(scripted([say('Ответ.')], { cost: 0.2 }).complete, {
		quota: { ...QUOTA, dollars: 0.3 },
		now: () => time,
	})

	t.after(close)

	assert.deepEqual(await (await fetch(base)).json(), { open: true })

	const first = await events(await post({ message: 'колено' }))
	const id = first[0]!.data.id

	assert.equal(
		(await events(await post({ session: id, message: 'а ещё?' }))).at(-1)!.type,
		'done',
		'реплика, начатая до потолка, доживает',
	)

	const refused = await post({ session: id, message: 'и ещё' })

	assert.equal(refused.status, 503)
	assert.deepEqual(await refused.json(), { reason: 'closed', reopensAt: '2026-10-22T21:00:00.000Z' })
	assert.deepEqual(await (await fetch(base)).json(), { open: false, reopensAt: '2026-10-22T21:00:00.000Z' })

	time = Date.UTC(2026, 9, 22, 21, 1)
	assert.equal((await post({ message: 'колено' })).status, 200, 'после полуночи по Москве снова открыт')
})

test('http: новые диалоги на сегодня кончились -- начатые продолжаются', async (t) => {
	const { post, events, close } = await server(scripted([say('Ответ.')]).complete, {
		quota: { ...QUOTA, dialogs: 1 },
	})

	t.after(close)

	const id = (await events(await post({ message: 'колено' })))[0]!.data.id

	assert.equal((await post({ message: 'плечо' })).status, 503)
	assert.equal((await post({ session: id, message: 'а ещё?' })).status, 200)
})

test('keepKnownLinks: сайт и адреса из инструментов остаются, чужие -- текстом или прочь', () => {
	const known = new Set(['https://pubmed.ncbi.nlm.nih.gov/123/'])
	const keep = (text: string) => keepKnownLinks(text, { site: 'sorebody.aimuzov.online', known })

	assert.equal(
		keep('[ПКС](https://sorebody.aimuzov.online/injuries/acl-tear/) и [акция](https://evil.example/promo)'),
		'[ПКС](https://sorebody.aimuzov.online/injuries/acl-tear/) и акция',
	)

	assert.equal(
		keep('Источник: https://pubmed.ncbi.nlm.nih.gov/123/, ещё https://evil.example/x.'),
		'Источник: https://pubmed.ncbi.nlm.nih.gov/123/, ещё .',
	)

	assert.equal(keep('[битая](не-адрес)'), 'битая')
})

test('chat: чужая ссылка из ответа модели не доходит до виджета', async () => {
	const { complete } = scripted([
		calls(['get_red_flags', { region: 'ankle-foot' }]),
		say(
			'Читайте https://evil.example/promo и [статью](https://sorebody.aimuzov.online/injuries/achilles-tendinopathy/)',
		),
	])
	const { events } = await turn(complete, 'болит ахилл')
	const text = (events.at(-1) as { text: string }).text

	assert.ok(!text.includes('evil.example'))
	assert.ok(text.includes('https://sorebody.aimuzov.online/injuries/achilles-tendinopathy/'))
})
