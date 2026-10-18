import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import type { Region } from '#frontend/data/regions.ts'
import { sportOf, SPORTS } from '#frontend/data/sports.ts'

import { layoutMarks } from './marks.ts'
import { buildZones } from './zones.ts'

const injury = (slug: string, region: Region) => ({
	slug,
	title: slug,
	titleEn: slug,
	summary: '',
	frequency: 'common' as const,
	movements: [],
	region,
})

/** Травмы спорта с регионами из frontmatter общих частей. */
function sportInjuries(sport: (typeof SPORTS)[number]) {
	return sport.frequencyOrder.map((slug) => {
		const front = readFileSync(new URL(`../content/injuries/${slug}.md`, import.meta.url), 'utf8')
		const region = front.match(/^region: ([a-z-]+)$/m)?.[1] as Region

		assert.ok(region, slug)

		return injury(slug, region)
	})
}

test('injuries with one place line up in a row, each with its own number', () => {
	const { whole } = buildZones(sportOf('crossfit'), [
		injury('muscle-strains', 'other'),
		injury('fall-contusions', 'other'),
		injury('exertional-rhabdomyolysis', 'other'),
	])
	const marks = layoutMarks(whole, 0, ['muscle-strains', 'fall-contusions', 'exertional-rhabdomyolysis'])

	assert.deepEqual(
		marks.map((m) => m.shift),
		[-1, 0, 1],
	)

	assert.deepEqual(
		marks.map((m) => m.number),
		[1, 2, 3],
	)
})

test('injuries in different places stay where they are', () => {
	const { zones } = buildZones(sportOf('padel'), [
		injury('ankle-sprain', 'ankle-foot'),
		injury('plantar-fasciitis', 'ankle-foot'),
		injury('achilles-tendinopathy', 'ankle-foot'),
	])
	const marks = layoutMarks(zones[0]!, 0, ['ankle-sprain', 'plantar-fasciitis', 'achilles-tendinopathy'])

	assert.deepEqual(
		marks.map((m) => m.shift),
		[0, 0, 0],
	)
})

test('both Achilles injuries in one zone do not share a place', () => {
	const { zones } = buildZones(sportOf('padel'), [
		injury('achilles-tendinopathy', 'ankle-foot'),
		injury('achilles-tendon-rupture', 'ankle-foot'),
	])
	const marks = layoutMarks(zones[0]!, 0, ['achilles-tendinopathy', 'achilles-tendon-rupture'])

	assert.deepEqual(
		marks.map((m) => m.shift),
		[0, 0],
	)
})

test('no two markers of a sport land on one spot of the screen, the whole body included', () => {
	for (const sport of SPORTS) {
		const { zones, whole } = buildZones(sport, sportInjuries(sport))

		for (const zone of [...zones, whole]) {
			const marks = layoutMarks(
				zone,
				0,
				zone.injuries.map((i) => i.slug),
			)
			const spots = marks.map((m) => `${m.focus.position.map((v) => v.toFixed(3)).join()}|${m.shift}`)

			assert.equal(new Set(spots).size, spots.length, `${sport.slug}, ${zone.slug}: маркеры наезжают`)

			assert.ok(
				marks.every((m, i) => m.number === i + 1),
				`${sport.slug}, ${zone.slug}: номер маркера -- место в списке`,
			)
		}
	}
})
