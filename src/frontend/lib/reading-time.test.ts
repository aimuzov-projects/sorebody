import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readingMinutes } from './reading-time.ts'

test('a short text takes a minute', () => {
	assert.equal(readingMinutes('Колено болит.'), 1)
})

test('link addresses and block markers are not words', () => {
	const words = Array.from({ length: 320 }, () => 'слово').join(' ')

	assert.equal(readingMinutes(`${words} ([1](https://pubmed.ncbi.nlm.nih.gov/123/)) <div data-stat="x"></div>`), 2)
})
