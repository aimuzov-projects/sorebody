import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import * as frame from './frame.ts'
import poster from './poster.json' with { type: 'json' }
import { ANKLES_BOX, HEAD_BOX } from './zones.ts'

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

test('on phones the figure is FIT_FILL of the free band, but not above the unscaled frame', () => {
	for (const [width, height, top, bottom] of [
		[375, 812, 52, 480],
		[375, 663, 52, 330],
		[375, 553, 52, 243],
		[430, 932, 64, 600],
	]) {
		const r = frame.projectBox(
			poster.box as never,
			width,
			height,
			frame.fitShift(poster.box as never, width, height, top, bottom),
		)
		const free = bottom - top
		const unscaled = frame.projectBox(poster.box as never, width, height, { x: 0, y: 0, s: 1 }).height

		assert.ok(
			Math.abs(r.height - Math.min(free * frame.FIT_FILL, unscaled)) < 1,
			JSON.stringify({ width, height, r }),
		)

		assert.ok(Math.abs(r.top + r.height / 2 - (top + free / 2)) < 1, JSON.stringify({ width, height, r }))
	}
})

const hintBoxes = { figure: poster.box as frame.Box, head: HEAD_BOX, ankles: ANKLES_BOX }

test('the first-visit hint stands beside the head when wide and under the feet when narrow', () => {
	// Пол -- верх подвала сцены, как его меряет body-3d: строка около 43px у низа окна
	for (const [width, height, side] of [
		[1920, 1080, true],
		[1024, 800, true],
		[820, 900, true],
		[744, 1133, false],
	] as const) {
		const floor = height - 43 - 8
		const hint = frame.placeHint(hintBoxes, width, height, frame.homeShift(width), floor)
		const size = `${width}x${height}`
		const head = frame.projectBox(HEAD_BOX, width, height)
		const ankles = frame.projectBox(ANKLES_BOX, width, height)

		assert.equal(hint.side, side, size)

		if (hint.side) {
			assert.ok(hint.x >= head.left + head.width, `${size}: правее головы`)
			assert.ok(hint.x + hint.room <= width - 16, `${size}: не за правым краем`)
			assert.ok(hint.room >= frame.HINT_SIDE_LAST, `${size}: есть место под текст`)
		} else {
			assert.ok(hint.y >= ankles.top + ankles.height, `${size}: ниже точек стопы`)
			assert.ok(hint.y + frame.HINT_HEIGHT <= floor, `${size}: выше подвала`)
		}
	}
})

test('the first-visit hint stays under the feet on phones', () => {
	const hint = frame.placeHint(hintBoxes, 390, 844, frame.homeShift(390), 500)
	const body = frame.projectBox(poster.box as frame.Box, 390, 844)

	assert.equal(hint.side, false)
	assert.ok(Math.abs(hint.x - (body.left + body.width / 2)) < 1, 'по оси фигуры')
	assert.equal(hint.room, 500 - hint.y)
})

test('on phones the hint stays above the sheet title when the feet go over it', () => {
	const floor = 240
	const hint = frame.placeHint(hintBoxes, 375, 553, frame.fitShift(poster.box as never, 375, 553, 52, 243), floor)

	assert.equal(hint.side, false)
	assert.equal(hint.y, floor - frame.HINT_HEIGHT)
	assert.equal(hint.room, frame.HINT_HEIGHT)
})
