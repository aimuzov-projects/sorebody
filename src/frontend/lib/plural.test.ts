import assert from 'node:assert/strict'
import { test } from 'node:test'

import { plural } from './plural.ts'

test('форма слова «травма» после числа', () => {
	assert.deepEqual(
		[0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map((n) => `${n} ${plural(n)}`),
		[
			'0 травм',
			'1 травма',
			'2 травмы',
			'4 травмы',
			'5 травм',
			'11 травм',
			'12 травм',
			'14 травм',
			'21 травма',
			'22 травмы',
			'25 травм',
			'101 травма',
			'111 травм',
		],
	)
})
