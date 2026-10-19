import assert from 'node:assert/strict'
import { test } from 'node:test'

import { plural } from './plural.ts'

test('форма слова «боль» после числа', () => {
	assert.deepEqual(
		[0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map((n) => `${n} ${plural(n)}`),
		[
			'0 болей',
			'1 боль',
			'2 боли',
			'4 боли',
			'5 болей',
			'11 болей',
			'12 болей',
			'14 болей',
			'21 боль',
			'22 боли',
			'25 болей',
			'101 боль',
			'111 болей',
		],
	)
})
