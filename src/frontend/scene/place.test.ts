import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseHash, regionPlace, sportAt, zoneHash } from './place.ts'
import type { Zone } from './zones.ts'

const point = { position: [0, 0, 0], normal: [0, 0, 1], view: { azimuth: 0, polar: 0 } }
const zone = (slug: string, points: number, injuries: string[]) =>
	({
		slug,
		label: slug,
		radius: 0.1,
		points: Array(points).fill(point),
		injuries: injuries.map((s) => ({ slug: s })),
	}) as unknown as Zone

const knee = zone('knee', 2, ['acl-tear', 'meniscus-tear'])
const whole = zone('other', 1, ['muscle-strains'])
const zones = [knee, whole]

test('хеш зоны и обратно', () => {
	assert.equal(zoneHash(knee, 1), '#zone=knee:1')
	assert.deepEqual(parseHash('#zone=knee:1', zones), { level: 1, zone: knee, index: 1 })
	assert.deepEqual(parseHash('zone=knee:0', zones), { level: 1, zone: knee, index: 0 })
})

test('статья -- уровень 2 с её зоной, в том числе из "Всё тело"', () => {
	assert.deepEqual(parseHash('#meniscus-tear', zones), { level: 2, zone: knee, injury: knee.injuries[1] })
	assert.deepEqual(parseHash('#muscle-strains', zones), { level: 2, zone: whole, injury: whole.injuries[0] })
})

test('пустой, чужой и битый хеш -- сцена', () => {
	for (const hash of ['', '#', '#zone=knee:5', '#zone=elbow:0', '#no-such', '#%', '#zone=knee:x'])
		assert.deepEqual(parseHash(hash, zones), { level: 0 }, hash)
})

test('?region= -- зона и точка, нет точки -- первая, нет зоны -- null', () => {
	assert.deepEqual(regionPlace('?region=knee:1', zones), { zone: knee, index: 1 })
	assert.deepEqual(regionPlace('?region=knee:7', zones), { zone: knee, index: 0 })
	assert.deepEqual(regionPlace('?region=knee', zones), { zone: knee, index: 0 })
	assert.equal(regionPlace('?region=elbow', zones), null)
	assert.equal(regionPlace('', zones), null)
})

test('спорт по пути главной', () => {
	const sports = [
		{ slug: 'crossfit', href: '/' },
		{ slug: 'padel', href: '/padel/' },
	]

	assert.equal(sportAt('/', sports), 'crossfit')
	assert.equal(sportAt('/crossfit/', sports), 'crossfit')
	assert.equal(sportAt('/padel', sports), 'padel')
	assert.equal(sportAt('/padel/', sports), 'padel')
	assert.equal(sportAt('/about/', sports), undefined)
})
