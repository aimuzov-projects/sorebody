import assert from 'node:assert/strict'
import { test } from 'node:test'

import { articleAt, articlePath, parseHash, placeAt, regionPlace, sportAt, zoneHash } from './place.ts'
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
	for (const hash of [
		'',
		'#',
		'#zone=knee:5',
		'#zone=elbow:0',
		'#no-such',
		'#%',
		'#zone=knee:x',
		'#zone=knee',
		'#tgWebAppData=query_id%3DAA%26user%3D%257B%257D',
	])
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
	assert.equal(sportAt('/crossfit', sports), 'crossfit')
	assert.equal(sportAt('/padel', sports), 'padel')
	assert.equal(sportAt('/padel/', sports), 'padel')
	assert.equal(sportAt('/about/', sports), undefined)
})

test('путь статьи и обратно', () => {
	const sports = [{ slug: 'crossfit' }, { slug: 'padel' }]

	assert.equal(articlePath('padel', 'acl-tear'), '/padel/acl-tear/')
	assert.deepEqual(articleAt('/padel/acl-tear/', sports), { sport: 'padel', slug: 'acl-tear' })
	assert.deepEqual(articleAt('/padel/acl-tear', sports), { sport: 'padel', slug: 'acl-tear' })
	assert.equal(articleAt('/padel/', sports), null)
	assert.equal(articleAt('/', sports), null)
	assert.equal(articleAt('/movements/squat/', sports), null)
	assert.equal(articleAt('/padel/elements/smash/', sports), null)
})

test('место по адресу: статья по пути, зона и старая статья по хешу', () => {
	const padel = { slug: 'padel' }
	const at = (pathname: string, hash = '') => placeAt({ pathname, hash }, padel, zones)

	assert.deepEqual(at('/padel/meniscus-tear/'), { level: 2, zone: knee, injury: knee.injuries[1] })

	assert.deepEqual(at('/padel/meniscus-tear/', '#zone=knee:1'), {
		level: 2,
		zone: knee,
		injury: knee.injuries[1],
	})

	assert.deepEqual(at('/padel/', '#zone=knee:1'), { level: 1, zone: knee, index: 1 })
	assert.deepEqual(at('/padel/', '#acl-tear'), { level: 2, zone: knee, injury: knee.injuries[0] })
	assert.deepEqual(at('/padel/no-such/'), { level: 0 })
	assert.deepEqual(at('/crossfit/acl-tear/'), { level: 0 })
	assert.deepEqual(at('/movements/squat/', '#acl-tear'), { level: 2, zone: knee, injury: knee.injuries[0] })
})
