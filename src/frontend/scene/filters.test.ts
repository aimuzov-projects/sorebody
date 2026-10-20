import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
	activeFilterChips,
	emptySearch,
	isFiltering,
	litZone,
	matchesFilters,
	swapLayout,
	zoneEntries,
} from './filters.ts'
import type { Zone } from './zones.ts'

type Injury = Zone['injuries'][number]

const injury = (slug: string, frequency: string, movements: string[], title = slug) =>
	({ slug, title, titleEn: `${slug} en`, summary: 'Связки надрываются', frequency, movements }) as unknown as Injury

const acl = injury('acl-tear', 'rare', ['box-jump'], 'Разрыв передней крестообразной связки')
const ankle = injury('ankle-sprain', 'uncommon', ['box-jump', 'running'], 'Растяжение связок голеностопа')
const none = { query: '', frequency: 'all', movement: '' } as const

test('без фильтров проходит всё', () => {
	assert.equal(matchesFilters(acl, none), true)
	assert.equal(isFiltering(none), false)
	assert.equal(isFiltering({ ...none, query: '   ' }), false)
})

test('частота и движение', () => {
	assert.equal(matchesFilters(acl, { ...none, frequency: 'rare' }), true)
	assert.equal(matchesFilters(acl, { ...none, frequency: 'common' }), false)
	assert.equal(matchesFilters(ankle, { ...none, movement: 'running' }), true)
	assert.equal(matchesFilters(acl, { ...none, movement: 'running' }), false)
})

test('запрос: без регистра, ё как е, лишние пробелы, по английскому названию и описанию', () => {
	assert.equal(matchesFilters(acl, { ...none, query: 'КРЕСТООБРАЗНОЙ' }), true)
	assert.equal(matchesFilters(ankle, { ...none, query: 'ankle-sprain en' }), true)
	assert.equal(matchesFilters(acl, { ...none, query: 'крёстообразной' }), true)
	assert.equal(matchesFilters(acl, { ...none, query: '  передней   крестообразной ' }), true)
	assert.equal(matchesFilters(acl, { ...none, query: 'надрываются' }), true)
	assert.equal(matchesFilters(acl, { ...none, query: 'плечо' }), false)
})

test('ё в тексте находится запросом с е, неразрывный пробел -- обычным', () => {
	assert.equal(matchesFilters(injury('bruise', 'common', [], 'Тёмный ушиб'), { ...none, query: 'темный' }), true)

	assert.equal(
		matchesFilters({ ...acl, summary: 'К врачу в\u00a0тот же\u00a0день' }, { ...none, query: 'в тот же день' }),
		true,
	)
})

test('чипы включённых фильтров: запрос, частота, движение -- в этом порядке', () => {
	const chips = activeFilterChips({ query: ' колено ', frequency: 'rare', movement: 'box-jump' }, [
		{ slug: 'box-jump', title: 'Прыжки на тумбу' },
	])

	assert.deepEqual(
		chips.map((c) => [c.key, c.label, c.tone]),
		[
			['query', '«колено»', ''],
			['frequency', 'Редкие', 'rare'],
			['movement', 'Прыжки на тумбу', ''],
		],
	)

	assert.ok(chips.every((c) => c.icon.trim().startsWith('<svg')))
	assert.deepEqual(activeFilterChips(none, []), [])
})

test('неизвестное движение: подпись -- его slug, без иконки', () => {
	const [chip] = activeFilterChips({ ...none, movement: 'unknown' }, [])

	assert.deepEqual([chip?.label, chip?.icon], ['unknown', ''])
})

test('травмы по зонам сверху вниз', () => {
	const knee = { slug: 'knee', injuries: [acl, ankle] } as unknown as Zone
	const foot = { slug: 'ankle-foot', injuries: [ankle] } as unknown as Zone

	assert.deepEqual(
		zoneEntries([knee, foot], (i) => i.slug === 'ankle-sprain').map((e) => [e.zone.slug, e.injury.slug]),
		[
			['knee', 'ankle-sprain'],
			['ankle-foot', 'ankle-sprain'],
		],
	)
})

test('пустую под фильтры зону не подсвечиваем, непустую и «нет зоны» отдаём как есть', () => {
	const knee = { slug: 'knee' }
	const head = { slug: 'head' }
	const counts = new Map([
		[knee, 2],
		[head, 0],
	])

	assert.equal(litZone(knee, counts), knee)
	assert.equal(litZone(head, counts), null)
	assert.equal(litZone({ slug: 'elbow' }, counts), null)
	assert.equal(litZone(null, counts), null)
})

test('раскладка: клавиши меняются на соседние, без букв менять нечего', () => {
	assert.equal(swapLayout('Hfcnz;tybt'), 'растяжение')
	assert.equal(swapLayout('ащще'), 'foot')
	assert.equal(swapLayout('123'), '')
	assert.equal(swapLayout('  '), '')
})

test('пустой поиск: сначала раскладка, потом фильтры, иначе частые травмы', () => {
	const common = injury('patellar-tendinopathy', 'common', ['running'], 'Тендинопатия надколенника')
	const knee = { slug: 'knee', injuries: [common, acl, ankle] } as unknown as Zone
	const foot = { slug: 'ankle-foot', injuries: [ankle, common] } as unknown as Zone
	const zones = [knee, foot]
	const layout = emptySearch(zones, { ...none, query: 'hfcnz;tybt' })

	assert.equal(layout.kind, 'layout')

	assert.deepEqual(layout.kind === 'layout' && [layout.query, layout.results.map((e) => e.injury.slug)], [
		'растяжение',
		['ankle-sprain', 'ankle-sprain'],
	])

	assert.deepEqual(emptySearch(zones, { ...none, query: 'растяжение', frequency: 'rare' }), {
		kind: 'filters',
		count: 2,
	})

	assert.deepEqual(emptySearch(zones, { query: 'hfcnz;tybt', frequency: 'rare', movement: '' }), {
		kind: 'filters',
		count: 2,
	})

	const nothing = emptySearch(zones, { ...none, query: 'asdasd' })

	assert.deepEqual(nothing.kind === 'none' && nothing.suggestions.map((e) => [e.zone.slug, e.injury.slug]), [
		['knee', 'patellar-tendinopathy'],
	])
})
