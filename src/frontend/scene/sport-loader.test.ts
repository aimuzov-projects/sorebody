import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applySportHead, createRequestGuard, createSportLoader } from './sport-loader.ts'

/** fetch, который считает запросы и отвечает по очереди из `responses`. */
function fakeFetch(responses: { ok: boolean; body?: unknown }[]) {
	const calls: string[] = []
	const fetcher = (async (url: string) => {
		calls.push(url)

		const next = responses.shift() ?? { ok: false }

		return { ok: next.ok, url, status: next.ok ? 200 : 500, json: async () => next.body } as Response
	}) as typeof fetch

	return { fetcher, calls }
}

test('свой спорт -- без запроса, другой -- один запрос и кеш', async () => {
	const { fetcher, calls } = fakeFetch([{ ok: true, body: 'padel-data' }])
	const load = createSportLoader({ slug: 'crossfit', data: 'crossfit-data' }, fetcher)

	assert.equal(await load('crossfit'), 'crossfit-data')
	assert.equal(await load('padel'), 'padel-data')
	assert.equal(await load('padel'), 'padel-data')
	assert.deepEqual(calls, ['/padel/scene.json'])
})

test('неудачный ответ не кешируется: следующий запрос идёт заново', async () => {
	const { fetcher, calls } = fakeFetch([{ ok: false }, { ok: true, body: 'padel-data' }])
	const load = createSportLoader({ slug: 'crossfit', data: 'crossfit-data' }, fetcher)

	await assert.rejects(load('padel'), /500/)
	assert.equal(await load('padel'), 'padel-data')
	assert.equal(calls.length, 2)
})

test('ответ актуален, только пока нет нового запроса и адрес тот же', () => {
	let href = '/'
	const guard = createRequestGuard(() => href)

	const first = guard.start()

	assert.equal(first.current(), true)

	const second = guard.start()

	assert.equal(first.current(), false)
	assert.equal(first.latest(), false)
	assert.equal(second.current(), true)

	href = '/#zone=knee:0'
	assert.equal(second.current(), false)
	assert.equal(second.latest(), true)

	guard.cancel()
	assert.equal(second.latest(), false)
})

/** Минимальный документ: head с метками, html и скрытый h1. */
function fakeDocument() {
	const attrs = new Map<string, string>()
	const meta = (key: string) => ({ setAttribute: (_: string, value: string) => attrs.set(key, value) })
	const canonical = { href: 'https://sorebody.aimuzov.online/' }
	const heading = { textContent: '' }
	const head = {
		querySelector: (selector: string) =>
			selector === 'link[rel="canonical"]' ? canonical : meta(selector.match(/"(.+)"/)?.[1] ?? selector),
	}
	const doc = {
		head,
		title: '',
		documentElement: { dataset: {} as Record<string, string> },
		querySelector: () => heading,
	}

	return { doc: doc as unknown as Document, attrs, canonical, heading }
}

test('заголовки страницы -- как у главной спорта', () => {
	const { doc, attrs, canonical, heading } = fakeDocument()

	applySportHead(doc, { slug: 'padel', heading: 'Боль в паделе', description: 'Падел', home: '/padel/' })

	assert.equal(doc.documentElement.dataset.sport, 'padel')
	assert.match(doc.title, /^Боль в паделе/)
	assert.equal(attrs.get('description'), 'Падел')
	assert.equal(attrs.get('og:description'), 'Падел')
	assert.equal(attrs.get('og:title'), doc.title)
	assert.equal(canonical.href, 'https://sorebody.aimuzov.online/padel/')
	assert.equal(attrs.get('og:url'), canonical.href)
	assert.equal(heading.textContent, 'Боль в паделе')
})
