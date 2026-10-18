import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import type { Region } from '#frontend/data/regions.ts'
import { sportOf, SPORTS } from '#frontend/data/sports.ts'

import { buildZones, injuryFocus } from './zones.ts'

const injury = (slug: string, region: Region) => ({
	slug,
	title: slug,
	titleEn: slug,
	summary: '',
	frequency: 'common' as const,
	movements: [],
	region,
})

test('a sport gets a zone only where it has injuries', () => {
	const { zones, whole } = buildZones(sportOf('padel'), [
		injury('tennis-leg', 'shin'),
		injury('eye-injury', 'head'),
		injury('fall-contusions', 'other'),
	])

	assert.deepEqual(
		zones.map((z) => z.slug),
		['head', 'shin'],
	)

	assert.deepEqual(
		whole.injuries.map((i) => i.slug),
		['fall-contusions'],
	)
})

test('injuries inside a zone go from common to rare in the sport order', () => {
	const { zones } = buildZones(sportOf('padel'), [injury('orofacial-trauma', 'head'), injury('eye-injury', 'head')])

	assert.deepEqual(
		zones[0]!.injuries.map((i) => i.slug),
		['eye-injury', 'orofacial-trauma'],
	)
})

// Кружки травм на модели около 2 см: ближе они закрывают друг друга, и номер нижнего не прочитать
const MIN_FOCUS_DISTANCE = 0.025

test('inside a zone the injuries of a sport stand apart on the model', () => {
	const content = new URL('../content/injuries/', import.meta.url)

	for (const sport of SPORTS) {
		const injuries = sport.frequencyOrder.map((slug) => {
			const front = readFileSync(new URL(`${slug}.md`, content), 'utf8')
			const region = front.match(/^region: ([a-z-]+)$/m)?.[1] as Region

			return injury(slug, region)
		})

		for (const zone of buildZones(sport, injuries).zones) {
			const places = zone.injuries.map((i) => ({ slug: i.slug, position: injuryFocus(zone, 0, i.slug).position }))

			for (const [i, a] of places.entries())
				for (const b of places.slice(i + 1)) {
					const d = Math.hypot(...a.position.map((v, k) => v - b.position[k]!))

					assert.ok(
						d >= MIN_FOCUS_DISTANCE,
						`${sport.slug}, ${zone.slug}: ${a.slug} и ${b.slug} в ${d.toFixed(3)} м`,
					)
				}
		}
	}
})

test('the whole body stays even without injuries: the scene hides it itself', () => {
	const { zones, whole } = buildZones(sportOf('crossfit'), [injury('acl-tear', 'knee')])

	assert.deepEqual(
		zones.map((z) => z.slug),
		['knee'],
	)

	assert.equal(whole.injuries.length, 0)
})
