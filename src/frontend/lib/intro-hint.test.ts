import assert from 'node:assert/strict'
import { test } from 'node:test'

import { introHintSeen, markIntroHintSeen } from './intro-hint.ts'

function memoryStore() {
	const data = new Map<string, string>()

	return {
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => data.set(key, value),
	}
}

test('the hint is shown until it is marked as seen', () => {
	const store = memoryStore()

	assert.equal(
		introHintSeen(() => store),
		false,
	)

	markIntroHintSeen(() => store)

	assert.equal(
		introHintSeen(() => store),
		true,
	)
})

test('a storage that throws on access keeps the hint and does not throw', () => {
	const blocked = () => {
		throw new Error('SecurityError')
	}

	assert.equal(introHintSeen(blocked), false)
	assert.doesNotThrow(() => markIntroHintSeen(blocked))
})

test('a storage that throws on read or write keeps the hint and does not throw', () => {
	const throwing = {
		getItem: () => {
			throw new Error('SecurityError')
		},
		setItem: () => {
			throw new Error('QuotaExceededError')
		},
	}

	assert.equal(
		introHintSeen(() => throwing),
		false,
	)

	assert.doesNotThrow(() => markIntroHintSeen(() => throwing))
})

test('without a storage the hint is shown', () => {
	assert.equal(
		introHintSeen(() => undefined),
		false,
	)

	assert.doesNotThrow(() => markIntroHintSeen(() => undefined))
})
