import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { detailKey } from './detail.ts'
import { ANCHORS } from './zones.ts'

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
