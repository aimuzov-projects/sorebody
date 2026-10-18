import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Region } from '#frontend/data/regions.ts'
import { sportOf } from '#frontend/data/sports.ts'

import { buildZones } from './zones.ts'

const injury = (slug: string, region: Region) => ({
	slug,
	title: slug,
	titleEn: slug,
	summary: '',
	frequency: 'common' as const,
	movements: [],
	region,
})

test('a sport gets a zone only where it has injuries', () => {
	const { zones, whole } = buildZones(sportOf('padel'), [
		injury('tennis-leg', 'shin'),
		injury('eye-injury', 'head'),
		injury('fall-contusions', 'other'),
	])

	assert.deepEqual(
		zones.map((z) => z.slug),
		['head', 'shin'],
	)

	assert.deepEqual(
		whole.injuries.map((i) => i.slug),
		['fall-contusions'],
	)
})

test('injuries inside a zone go from common to rare in the sport order', () => {
	const { zones } = buildZones(sportOf('padel'), [injury('orofacial-trauma', 'head'), injury('eye-injury', 'head')])

	assert.deepEqual(
		zones[0]!.injuries.map((i) => i.slug),
		['eye-injury', 'orofacial-trauma'],
	)
})

test('the whole body stays even without injuries: the scene hides it itself', () => {
	const { zones, whole } = buildZones(sportOf('crossfit'), [injury('acl-tear', 'knee')])

	assert.deepEqual(
		zones.map((z) => z.slug),
		['knee'],
	)

	assert.equal(whole.injuries.length, 0)
})
