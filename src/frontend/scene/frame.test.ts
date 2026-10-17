import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import * as frame from './frame.ts'
import poster from './poster.json' with { type: 'json' }

test('poster was rendered with the current start frame', () => {
	// Разошлись -- перерендерить постер: node scripts/poster/render.mjs
	assert.deepEqual(poster.frame, {
		FRAME: frame.FRAME,
		NARROW: frame.NARROW,
		TARGET_Y: frame.TARGET_Y,
		POLAR_DEG: frame.POLAR_DEG,
		AZIMUTH_DEG: frame.AZIMUTH_DEG,
		POSTER_SHIFT: frame.POSTER_SHIFT,
	})
})

test('poster images are in public/model', () => {
	for (const ext of ['webp', 'png'])
		assert.ok(existsSync(new URL(`../../../public/model/poster.${ext}`, import.meta.url)), ext)
})

test('the poster render frame holds the whole figure box', () => {
	const r = frame.projectBox(poster.box as never, 1440, 900, frame.POSTER_SHIFT)

	assert.ok(r.left >= 0 && r.top >= 0 && r.left + r.width <= 1440 && r.top + r.height <= 900, JSON.stringify(r))
})

test('the figure box projects right of the index on desktop and above the panel on phones', () => {
	const desktop = frame.projectBox(poster.box as never, 1440, 900)
	const phone = frame.projectBox(poster.box as never, 375, 812)

	assert.ok(
		desktop.left > 1440 * 0.45 && desktop.top >= 0 && desktop.top + desktop.height <= 920,
		JSON.stringify(desktop),
	)

	assert.ok(phone.top >= 0 && phone.top + phone.height < 812 * 0.6, JSON.stringify(phone))
})

test('on phones the figure fills the free band between the header and the sheet', () => {
	for (const [width, height, top, bottom] of [
		[375, 812, 52, 480],
		[375, 663, 52, 330],
		[430, 932, 64, 600],
	]) {
		const r = frame.projectBox(
			poster.box as never,
			width,
			height,
			frame.fitShift(poster.box as never, width, height, top, bottom),
		)
		const free = bottom - top

		assert.ok(r.top >= top && r.top + r.height <= bottom, JSON.stringify({ width, height, r }))
		assert.ok(r.height >= free * 0.85, JSON.stringify({ width, height, r }))
		assert.ok(Math.abs(r.top + r.height / 2 - (top + free / 2)) < 1, JSON.stringify({ width, height, r }))
	}
})
