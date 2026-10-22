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

test('searchInjuries: острая травма с хлопком и отёком выше перегрузки', () => {
	const acute = ['acl-tear', 'meniscus-tear', 'mcl-sprain']
	const overuse = ['iliotibial-band-syndrome', 'patellofemoral-pain']
	const cases: [string, object?][] = [
		['в кроссфите после прыжка на тумбу хрустнуло колено и опухло', { sport: 'crossfit' }],
		['хрустнуло колено и опухло'],
		['щелкнуло в колене на развороте, отекло', { sport: 'football' }],
		['хлопок в колене, потом припухло', { sport: 'basketball' }],
	]

	for (const [query, filter] of cases) {
		const order = top(query, 10, filter)
		const firstAcute = Math.min(...acute.map((s) => order.indexOf(s)).filter((i) => i >= 0))
		const firstOveruse = Math.min(...overuse.map((s) => order.indexOf(s)).filter((i) => i >= 0))

		assert.equal(firstAcute, 0, `«${query}»: ${order.join(', ')}`)
		assert.ok(firstAcute < firstOveruse, `«${query}»: ${order.join(', ')}`)
	}
})

test('searchInjuries: названная зона тела поднимает свои травмы', () => {
	// Щелчок и хлопок бывают в паху, плече и бедре, но вопрос -- про колено
	for (const query of ['хлопнуло в колене', 'щелчок в колене']) {
		const hits = tools.searchInjuries({ query, limit: 3 })

		assert.equal(hits[0]!.slug, 'acl-tear', `«${query}»: ${hits.map((h) => h.slug).join(', ')}`)

		assert.ok(
			hits.filter((h) => h.region === 'knee').length >= 2,
			`«${query}»: ${hits.map((h) => h.slug).join(', ')}`,
		)
	}
})

test('searchInjuries: синонимы симптомов -- хруст как хлопок, опух как отёк', () => {
	assert.equal(top('подвернул голеностоп, хрустнуло, опух', 1)[0], 'ankle-sprain')
	assert.equal(top('хлопок в икре, как будто ударили сзади', 1)[0], 'achilles-tendon-rupture')
	// Перегрузку синонимы не перебивают: где нет хлопка и отёка, наверху перегрузочные
	assert.ok(top('ноет колено снаружи при беге', 2, { sport: 'running' }).includes('iliotibial-band-syndrome'))
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
