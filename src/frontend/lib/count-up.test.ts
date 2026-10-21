import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatStat, parseStat } from './count-up.ts'

test('a stat splits into sign, number and unit', () => {
	assert.deepEqual(parseStat('−51%'), { prefix: '−', suffix: '%', target: 51, decimals: 0 })
	assert.deepEqual(parseStat('38,2%'), { prefix: '', suffix: '%', target: 38.2, decimals: 1 })
	assert.equal(parseStat('много'), undefined)
})

test('every frame keeps the look of the final value', () => {
	const stat = parseStat('38,2%')!

	assert.equal(formatStat(stat, 0), ' 0,0%')
	assert.equal(formatStat(stat, 19.04), '19,0%')
	assert.equal(formatStat(stat, 38.2), '38,2%')
})
