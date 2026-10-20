import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createArticleLoader } from './article-loader.ts'

/** fetch, который считает запросы и отвечает по очереди из `responses`. */
function fakeFetch(responses: { ok: boolean; body?: string }[]) {
	const calls: string[] = []
	const fetcher = (async (url: string) => {
		calls.push(url)

		const next = responses.shift() ?? { ok: false }

		return { ok: next.ok, status: next.ok ? 200 : 500, text: async () => next.body ?? '' } as Response
	}) as typeof fetch

	return { fetcher, calls }
}

test('статья грузится один раз: префетч и открытие делят один запрос', async () => {
	const { fetcher, calls } = fakeFetch([{ ok: true, body: '<main>статья</main>' }])
	const load = createArticleLoader(fetcher)
	const prefetched = load('/crossfit/ankle-sprain/')

	assert.equal(await load('/crossfit/ankle-sprain/'), '<main>статья</main>')
	assert.equal(await prefetched, '<main>статья</main>')
	assert.deepEqual(calls, ['/crossfit/ankle-sprain/'])
})

test('неудачный ответ не кешируется: повтор идёт заново', async () => {
	const { fetcher, calls } = fakeFetch([{ ok: false }, { ok: true, body: 'ok' }])
	const load = createArticleLoader(fetcher)

	await assert.rejects(load('/padel/ankle-sprain/'), /500/)
	assert.equal(await load('/padel/ankle-sprain/'), 'ok')
	assert.equal(calls.length, 2)
})
