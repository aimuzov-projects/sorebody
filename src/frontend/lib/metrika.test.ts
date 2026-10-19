import assert from 'node:assert/strict'
import { test } from 'node:test'

import { site } from '#frontend/data/site.ts'

import { metrikaGoal, metrikaHit } from './metrika.ts'

const page = (href: string, title: string) => ({
	location: { href } as Location,
	document: { title } as Document,
})

test('a page change without reload is sent as a hit with the new address and title', () => {
	const calls: unknown[][] = []

	metrikaHit('https://sorebody.aimuzov.online/', {
		...page('https://sorebody.aimuzov.online/padel/', 'Боль в паделе — Sorebody'),
		ym: (...args) => calls.push(args),
	})

	assert.deepEqual(calls, [
		[
			site.metrikaId,
			'hit',
			'https://sorebody.aimuzov.online/padel/',
			{ title: 'Боль в паделе — Sorebody', referer: 'https://sorebody.aimuzov.online/' },
		],
	])
})

test('a goal is sent as reachGoal with the counter id', () => {
	const calls: unknown[][] = []

	metrikaGoal('scene-lite', { ym: (...args: unknown[]) => calls.push(args) })

	assert.deepEqual(calls, [[site.metrikaId, 'reachGoal', 'scene-lite']])
})

test('without the counter nothing happens', () => {
	assert.doesNotThrow(() => metrikaHit('/', page('/padel/', 'Падел')))
	assert.doesNotThrow(() => metrikaGoal('scene-lite', {}))
})
