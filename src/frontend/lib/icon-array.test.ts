import assert from 'node:assert/strict'
import { test } from 'node:test'

import { filledIcons, iconArrayHtml } from './icon-array.ts'
import type { Chart } from './injury-schema.ts'

const chart: Chart = {
	id: 'demo',
	title: 'Нет боли, но есть <находка>',
	groups: ['20 лет', '80 лет'],
	rows: [{ label: 'Выбухание', values: [30, 84] }],
	caption: 'Подпись к графику',
}

test('percent rounds to the nearest of ten icons', () => {
	assert.equal(filledIcons(0), 0)
	assert.equal(filledIcons(84), 8)
	assert.equal(filledIcons(85), 9)
	assert.equal(filledIcons(100), 10)
})

test('every line has ten icons with the right number filled', () => {
	const html = iconArrayHtml(chart)
	const lines = html.split('class="icon-array__line"').slice(1)

	assert.equal(lines.length, 2)

	assert.deepEqual(
		lines.map((line) => (line.match(/icon-array__icon--on/g) ?? []).length),
		[3, 8],
	)

	assert.deepEqual(
		lines.map((line) => (line.match(/icon-array__icon /g) ?? []).length),
		[10, 10],
	)
})

test('numbers stay readable as text next to the hidden svg', () => {
	const html = iconArrayHtml(chart)

	assert.match(html, /<svg [^>]*aria-hidden="true"/)
	assert.match(html, /3 из 10 · 30%/)
	assert.match(html, /8 из 10 · 84%/)
})

test('fractional percent uses a decimal comma', () => {
	const html = iconArrayHtml({ ...chart, rows: [{ label: 'Выступ', values: [54.8, 23.1] }] })

	assert.match(html, /5 из 10 · 54,8%/)
	assert.match(html, /2 из 10 · 23,1%/)
})

test('text from frontmatter is escaped', () => {
	assert.match(iconArrayHtml(chart), /&lt;находка&gt;/)
})
