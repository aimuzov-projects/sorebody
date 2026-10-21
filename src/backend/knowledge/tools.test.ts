import assert from 'node:assert/strict'
import { test } from 'node:test'

import { diskKnowledge } from '#frontend/lib/knowledge-disk.ts'

import { stem, terms } from './text.ts'
import { KnowledgeError, knowledgeTools } from './tools.ts'

const tools = knowledgeTools(diskKnowledge())

/** Slug первых `n` найденных травм. */
const top = (query: string, n = 3, filter = {}) =>
	tools.searchInjuries({ query, limit: n, ...filter }).map((hit) => hit.slug)

test('stem: формы одного слова сходятся', () => {
	assert.equal(stem('колено'), stem('колени'))
	assert.equal(stem('коленом'), stem('колена'))
	assert.equal(stem('прыжков'), stem('прыжки'))
})

test('terms: без служебных слов, ё как е', () => {
	assert.deepEqual(terms('Болит плечо после жима'), ['бол', 'плеч', 'жим'])
	assert.deepEqual(terms('ушиб ёлкой'), terms('ушиб елкой'))
})

test('searchInjuries: живые вопросы находят свою травму в первой пятёрке', () => {
	const cases: [string, string, object?][] = [
		['хлопнуло в колене после прыжка на тумбу и оно опухло', 'acl-tear'],
		['колено подкашивается и заблокировалось', 'meniscus-tear'],
		['подвернул ногу, опух голеностоп', 'ankle-sprain'],
		['болит пятка по утрам, первые шаги больно', 'plantar-fasciitis'],
		['ударился головой, тошнит и кружится голова', 'concussion'],
		['мозоли на ладонях порвались от турника', 'hand-rips'],
		['моча тёмная как кола после тяжёлой тренировки', 'exertional-rhabdomyolysis'],
		['ноет голень спереди при беге', 'medial-tibial-stress-syndrome', { sport: 'running' }],
		['ACL', 'acl-tear'],
	]

	for (const [query, slug, filter] of cases)
		assert.ok(top(query, 5, filter).includes(slug), `«${query}»: ${top(query, 5, filter).join(', ')}`)
})

test('searchInjuries: фильтры сужают, адрес -- разбор спорта', () => {
	const hits = tools.searchInjuries({ query: 'колено', region: 'knee', sport: 'crossfit' })

	assert.ok(hits.length > 0)
	assert.ok(hits.every((h) => h.region === 'knee' && h.sports.includes('crossfit')))
	assert.ok(hits.every((h) => h.url.startsWith('https://sorebody.aimuzov.online/crossfit/')))
})

test('searchInjuries: неизвестный спорт и движение -- ошибка с подсказкой', () => {
	assert.throws(() => top('колено', 3, { sport: 'chess' }), KnowledgeError)
	assert.throws(() => top('колено', 3, { sport: 'crossfit', element: 'smash' }), /Есть: squat/)
})

test('getArticle: только запрошенные разделы, линза спорта', () => {
	const article = tools.getArticle({ slug: 'acl-tear', sport: 'crossfit', sections: ['urgent', 'adapt'] })

	assert.deepEqual(
		article.sections.map((s) => s.id),
		['urgent'],
	)

	assert.deepEqual(
		article.lens!.sections.map((s) => s.id),
		['adapt'],
	)

	assert.throws(() => tools.getArticle({ slug: 'no-such' }), /search_injuries/)
})

test('getRedFlags: по травме и по зоне, срочность словами', () => {
	const [acl] = tools.getRedFlags({ slug: 'acl-tear' })

	assert.ok(acl!.url.endsWith('#urgent'))
	assert.ok(acl!.alarms.some((a) => a.urgency === 'call' && a.action.includes('103')))
	assert.ok(tools.getRedFlags({ region: 'knee' }).length > 2)
	assert.throws(() => tools.getRedFlags({}), KnowledgeError)
	assert.throws(() => tools.getRedFlags({ slug: 'acl-tear', region: 'knee' }), /что-то одно/)
})

test('listInjuries: со спортом -- частота', () => {
	const list = tools.listInjuries({ sport: 'padel' })

	assert.ok(list.length > 5)
	assert.ok(list.every((i) => i.frequency))
})
