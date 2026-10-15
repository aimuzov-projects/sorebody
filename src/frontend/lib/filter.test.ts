import assert from 'node:assert/strict'
import { test } from 'node:test'

import { filterInjuries, type InjuryListItem } from './filter.ts'

const list: InjuryListItem[] = [
	{
		slug: 'acl-tear',
		title: 'Разрыв ПКС',
		titleEn: 'ACL tear',
		summary: 'Связка колена',
		region: 'knee',
		frequency: 'common',
		movements: ['box-jump'],
	},
	{
		slug: 'pectoralis-major-rupture',
		title: 'Разрыв большой грудной',
		titleEn: 'Pectoralis major rupture',
		summary: 'Грудь',
		region: 'shoulder',
		frequency: 'rare',
		movements: ['ring-dip'],
	},
]

test('no filters return everything', () => {
	assert.equal(filterInjuries(list, {}).length, 2)
})

test('filters combine: region, frequency, movement', () => {
	assert.deepEqual(
		filterInjuries(list, { region: 'knee' }).map((i) => i.slug),
		['acl-tear'],
	)

	assert.deepEqual(
		filterInjuries(list, { frequency: 'rare' }).map((i) => i.slug),
		['pectoralis-major-rupture'],
	)

	assert.deepEqual(filterInjuries(list, { region: 'knee', movement: 'ring-dip' }), [])
})

test('query matches Russian and English titles case-insensitively, ё = е', () => {
	assert.deepEqual(
		filterInjuries(list, { query: 'пкс' }).map((i) => i.slug),
		['acl-tear'],
	)

	assert.deepEqual(
		filterInjuries(list, { query: 'PECTORALIS' }).map((i) => i.slug),
		['pectoralis-major-rupture'],
	)
})

test('query matches the region label', () => {
	assert.deepEqual(
		filterInjuries(list, { query: 'плечо' }).map((i) => i.slug),
		['pectoralis-major-rupture'],
	)
})

test('ё and е are interchangeable in both query and text', () => {
	const withYo: InjuryListItem[] = [{ ...list[0]!, slug: 'yo', summary: 'Ушиб при падении на тёмном полу' }]

	assert.deepEqual(
		filterInjuries(withYo, { query: 'темном' }).map((i) => i.slug),
		['yo'],
	)

	assert.deepEqual(
		filterInjuries([{ ...withYo[0]!, summary: 'Ушиб при падении на темном полу' }], { query: 'тёмном' }).map(
			(i) => i.slug,
		),
		['yo'],
	)
})
