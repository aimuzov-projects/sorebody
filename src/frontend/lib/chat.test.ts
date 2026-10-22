import assert from 'node:assert/strict'
import { test } from 'node:test'

import { chatStatus, mergeAlarms, sendReply, type ChatEvent } from './chat-client.ts'
import { chatAvailable } from './chat-flag.ts'
import { chatMarkdown } from './chat-markdown.ts'

test('chatMarkdown: абзацы, списки, жирный, ссылки и голые адреса', () => {
	const blocks = chatMarkdown(
		[
			'## Срочно',
			'**Сегодня в травмпункт**, если',
			'колено подкашивается.',
			'',
			'- [ПКС](https://sorebody.aimuzov.online/injuries/acl-tear/)',
			'- Источник: https://pubmed.ncbi.nlm.nih.gov/123/.',
			'1. первое',
		].join('\n'),
	)

	assert.deepEqual(blocks, [
		{
			type: 'paragraph',
			inline: [
				{ type: 'text', text: 'Срочно ' },
				{ type: 'strong', text: 'Сегодня в травмпункт' },
				{ type: 'text', text: ', если колено подкашивается.' },
			],
		},
		{
			type: 'list',
			ordered: false,
			items: [
				[{ type: 'link', text: 'ПКС', href: 'https://sorebody.aimuzov.online/injuries/acl-tear/' }],
				[
					{ type: 'text', text: 'Источник: ' },
					{ type: 'link', text: 'pubmed.ncbi.nlm.nih.gov/123', href: 'https://pubmed.ncbi.nlm.nih.gov/123/' },
					{ type: 'text', text: '.' },
				],
			],
		},
		{ type: 'list', ordered: true, items: [[{ type: 'text', text: 'первое' }]] },
	])
})

test('chatMarkdown: разметка и не-https остаются текстом', () => {
	const [block] = chatMarkdown('<img src=x onerror=alert(1)> [жми](javascript:alert(1)) http://plain.example')

	assert.deepEqual(block, {
		type: 'paragraph',
		inline: [
			{ type: 'text', text: '<img src=x onerror=alert(1)> [жми](javascript:alert(1)) http://plain.example' },
		],
	})
})

/** Поток SSE из кусков, порезанных где попало: клиент должен склеить блоки сам. */
function stream(text: string, size = 7) {
	const bytes = new TextEncoder().encode(text)

	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size))

			controller.close()
		},
	})
}

const sse = (...events: [string, object][]) =>
	events.map(([type, data]) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`).join('')

async function collect(fetch: typeof globalThis.fetch) {
	const events: ChatEvent[] = []

	for await (const event of sendReply({ message: 'колено' }, { fetch })) events.push(event)

	return events
}

test('sendReply: события потока по порядку, кириллица на стыке кусков цела', async () => {
	const body = sse(['session', { id: 's1' }], ['text', { text: 'Сегодня в травмпункт.' }], ['done', { turnsLeft: 3 }])
	const events = await collect(async () => new Response(stream(body)))

	assert.deepEqual(events, [
		{ type: 'session', id: 's1' },
		{ type: 'text', text: 'Сегодня в травмпункт.' },
		{ type: 'done', turnsLeft: 3 },
	])
})

test('sendReply: отказы до потока и оборванный поток -- событие error', async () => {
	const status = (code: number, body: object) => async () =>
		new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } })

	assert.deepEqual(await collect(status(503, { reason: 'closed', reopensAt: 'завтра' })), [
		{ type: 'error', reason: 'closed', reopensAt: 'завтра' },
	])

	assert.deepEqual((await collect(status(429, { reason: 'rate' })))[0], {
		type: 'error',
		reason: 'rate',
		reopensAt: undefined,
	})

	assert.equal(((await collect(status(404, {})))[0] as { reason: string }).reason, 'expired')

	const cut = await collect(async () => new Response(stream(sse(['session', { id: 's1' }]))))

	assert.deepEqual(cut, [
		{ type: 'session', id: 's1' },
		{ type: 'error', reason: 'unavailable' },
	])

	assert.deepEqual(
		await collect(async () => {
			throw new TypeError('fetch failed')
		}),
		[{ type: 'error', reason: 'unavailable' }],
	)
})

test('chatStatus: закрыт -- с временем открытия, не ответил -- считаем открытым', async () => {
	assert.deepEqual(await chatStatus({ fetch: async () => Response.json({ open: false, reopensAt: 'x' }) }), {
		open: false,
		reopensAt: 'x',
	})

	assert.deepEqual(await chatStatus({ fetch: async () => new Response('', { status: 404 }) }), { open: true })
})

test('chatAvailable: режим сборки, метка ?chat=1 до конца вкладки, без Telegram', () => {
	const memory = new Map<string, string>()
	const storage = {
		getItem: (k: string) => memory.get(k) ?? null,
		setItem: (k: string, v: string) => void memory.set(k, v),
	}
	const env = (dataset: DOMStringMap, search = '') => ({ root: { dataset }, search, storage })

	assert.equal(chatAvailable(env({})), false)
	assert.equal(chatAvailable(env({ chat: 'on' })), true)
	assert.equal(chatAvailable(env({ chat: 'on', telegram: '' })), false)
	assert.equal(chatAvailable(env({ chat: 'preview' })), false)
	assert.equal(chatAvailable(env({ chat: 'preview' }, '?chat=1')), true)
	assert.equal(chatAvailable(env({ chat: 'preview' })), true, 'метка запомнилась на вкладку')
})

test('mergeAlarms: без повторов, самая срочная версия фразы, срочные первыми', () => {
	const alarm = (text: string, urgency: 'call' | 'today' | 'soon') => ({ text, urgency, action: urgency })
	const merged = mergeAlarms([
		{ slug: 'a', title: 'A', url: '', alarms: [alarm('Болит ночью', 'soon'), alarm('Стопа холодная', 'call')] },
		{ slug: 'b', title: 'B', url: '', alarms: [alarm('болит ночью', 'today'), alarm('Не наступить', 'today')] },
	])

	assert.deepEqual(
		merged.map((a) => [a.text, a.urgency]),
		[
			['Стопа холодная', 'call'],
			['болит ночью', 'today'],
			['Не наступить', 'today'],
		],
	)
})
