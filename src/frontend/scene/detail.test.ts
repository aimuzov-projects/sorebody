import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { detailKey } from './detail.ts'
import { ANCHORS, INJURY_LAYER, injuryLayer } from './zones.ts'

test('the chunk name follows the side of the body: left is +X, the spine is the center', () => {
	assert.equal(detailKey('knee', [0.081, 0.459, 0.011]), 'knee-left')
	assert.equal(detailKey('knee', [-0.081, 0.459, 0.011]), 'knee-right')
	assert.equal(detailKey('lumbar', [0, 1.066, -0.034]), 'lumbar-center')
})

test('every zone point has a chunk in public/model/detail', () => {
	const index = JSON.parse(readFileSync('public/model/detail/index.json', 'utf8'))

	for (const [slug, { points }] of Object.entries(ANCHORS))
		for (const { position } of points) assert.ok(index[detailKey(slug, position)], detailKey(slug, position))
})

test('chunks are built around the same points and radii as the zones', () => {
	// scripts/model/detail.py: 'knee': ((0.081, 0.459, 0.011), 0.085),
	const script = readFileSync('scripts/model/detail.py', 'utf8')

	for (const [slug, { radius, points }] of Object.entries(ANCHORS)) {
		const [x, y, z] = points[0].position
		const line = `'${slug}': ((${x}, ${y}, ${z}), ${radius}),`

		assert.ok(script.includes(line), `${slug}: ${line}`)
	}
})

test('every injury layer points to a real injury, and its muscles are in the chunk of its zone', () => {
	const index = JSON.parse(readFileSync('public/model/detail/index.json', 'utf8'))

	for (const [slug, layer] of Object.entries(INJURY_LAYER)) {
		const article = readFileSync(`src/frontend/content/injuries/${slug}.md`, 'utf8')
		const region = article.match(/^region: *(\S+)/m)?.[1]

		assert.ok(region, slug)

		const names = Object.entries(index)
			.filter(([key]) => key.startsWith(`${region}-`))
			.flatMap(([, entry]) => (entry as { muscles: string[] }).muscles)

		for (const muscle of layer.muscles ?? [])
			assert.ok(
				names.some((name) => name.includes(muscle)),
				`${slug}: ${muscle} is not in ${region}`,
			)
	}
})

test('an injury without an entry keeps the muscles and highlights nothing', () => {
	assert.deepEqual(injuryLayer('no-such-injury'), { depth: 'muscle' })
	assert.equal(injuryLayer('acl-tear').depth, 'deep')
})
