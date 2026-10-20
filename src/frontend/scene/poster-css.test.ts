import assert from 'node:assert/strict'
import { test } from 'node:test'

import { FIT_FILL, fitShift, projectBox, type Box } from './frame.ts'
import { phoneTerms, POSTER_CSS, posterGeometry, WIDE_SHIFT } from './poster-css.ts'
import poster from './poster.json' with { type: 'json' }

const NUMBER = String.raw`(-?[\d.]+(?:e-?\d+)?)`
const CALC = new RegExp(
	String.raw`^calc\((?:${NUMBER}cq([wh]) ([+-]) )?${NUMBER} \* min\(${NUMBER}cqh, ${NUMBER}cqw\)\)$`,
)

/** `calc` из posterGeometry в пикселях для контейнера `width` x `height`. */
function evaluate(css: string, width: number, height: number) {
	const match = css.match(CALC)

	assert.ok(match, css)

	const [, share = '0', axis, sign = '+', metres, perHeight, perWidth] = match
	const base = (Number(share) * (axis === 'w' ? width : height)) / 100
	const scale = Math.min((Number(perHeight) * height) / 100, (Number(perWidth) * width) / 100)

	return base + (sign === '-' ? -1 : 1) * Number(metres) * scale
}

test('the server poster CSS puts the figure where projectBox does on wide screens', () => {
	const geometry = posterGeometry(poster.box as Box)

	for (const [width, height] of [
		[700, 900],
		[1024, 768],
		[1440, 900],
		[1920, 1080],
		[2560, 1080],
		// Уже NARROW: фигура упирается в ширину кадра
		[700, 1400],
	]) {
		const expected = projectBox(poster.box as Box, width, height, WIDE_SHIFT)

		for (const key of ['left', 'top', 'width', 'height'] as const)
			assert.ok(
				Math.abs(evaluate(geometry[key], width, height) - expected[key]) < 0.01,
				`${width}x${height} ${key}: ${geometry[key]}`,
			)
	}
})

test('the server poster CSS is the wide-screen frame, and the phone frame on the home page', () => {
	assert.deepEqual(WIDE_SHIFT, { x: 0.17, y: 0, s: 1 })
	assert.match(POSTER_CSS, /^\.body3d__poster-image\{left:calc\(.+\);top:.+;width:.+;height:.+\}@container/)
	assert.match(POSTER_CSS, /@container \(width < 700px\)\{\.body3d__start--home \.body3d__poster-image\{--poster-h:/)
})

// Те же шаги, что в phoneGeometry: высота фигуры, середина полосы, ось окна
test('the phone poster terms give the fitShift frame', () => {
	const box = poster.box as Box
	const terms = phoneTerms(box)

	for (const [width, height, top, bottom] of [
		[375, 812, 52, 454],
		[320, 568, 52, 250],
		[390, 844, 52, 486],
		[430, 932, 64, 574],
		// Полоса узкая: фигура мельче кадра без масштаба
		[375, 667, 52, 300],
	]) {
		const expected = projectBox(box, width, height, fitShift(box, width, height, top, bottom))
		const unscaled = terms.tall * Math.min(height / 2, width / (2 * 0.62))
		const tall = Math.min(unscaled, FIT_FILL * (bottom - top))
		const actual = {
			left: width / 2 + terms.left * tall,
			top: top + (bottom - top - tall) / 2,
			width: terms.width * tall,
			height: tall,
		}

		for (const key of ['left', 'top', 'width', 'height'] as const)
			assert.ok(Math.abs(actual[key] - expected[key]) < 0.01, `${width}x${height} ${key}`)
	}
})
