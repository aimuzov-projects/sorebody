import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MOVEMENTS } from './movements.ts'
import { REGIONS } from './regions.ts'

test('regions have unique slugs and Russian labels', () => {
	const slugs = REGIONS.map((r) => r.slug)

	assert.equal(new Set(slugs).size, slugs.length)

	for (const r of REGIONS) assert.match(r.label, /[а-яё]/i)
})

test('movements have unique kebab-case slugs and both names', () => {
	const slugs = MOVEMENTS.map((m) => m.slug)

	assert.equal(new Set(slugs).size, slugs.length)

	for (const m of MOVEMENTS) {
		assert.match(m.slug, /^[a-z]+(-[a-z]+)*$/)
		assert.ok(m.title && m.titleEn, m.slug)
	}
})
