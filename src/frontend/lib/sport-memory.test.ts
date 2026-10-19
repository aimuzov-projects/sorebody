import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

import { SPORT_LEAVING, SPORT_RETURN, SPORT_STAY } from './sport-memory.ts'

/** Главная `sport`, открытая «Назад», когда выбран `chosen`: окружение скрипта из `<head>`. */
function homePage(sport: string, chosen: string) {
	const attributes = new Set<string>()
	const events: string[] = []
	const timers: (() => void)[] = []
	const replaced: string[] = []
	const html = {
		dataset: { sport, sportHomes: JSON.stringify({ crossfit: '/', padel: '/padel/' }) },
		style: { visibility: '' },
		setAttribute: (name: string) => attributes.add(name),
		removeAttribute: (name: string) => attributes.delete(name),
	}
	const context = {
		document: { documentElement: html, dispatchEvent: (event: { type: string }) => events.push(event.type) },
		sessionStorage: { getItem: () => chosen, setItem: () => {} },
		performance: { getEntriesByType: () => [{ type: 'back_forward' }] },
		location: { search: '', hash: '#zone=shin:0', replace: (to: string) => replaced.push(to) },
		setTimeout: (run: () => void) => timers.push(run),
		Event: function (this: { type: string }, type: string) {
			this.type = type
		},
	}

	runInNewContext(SPORT_RETURN, context)

	return { html, attributes, events, timers, replaced }
}

test('a home page of another sport hides itself and leaves for the chosen one', () => {
	const page = homePage('padel', 'crossfit')

	assert.deepEqual(page.replaced, ['/#zone=shin:0'])
	assert.equal(page.html.style.visibility, 'hidden')
	assert.ok(page.attributes.has(SPORT_LEAVING))
})

test('a home page that did not leave shows itself again and lets Metrika start', () => {
	const page = homePage('padel', 'crossfit')

	for (const run of page.timers) run()

	assert.equal(page.html.style.visibility, '')
	assert.ok(!page.attributes.has(SPORT_LEAVING))
	assert.deepEqual(page.events, [SPORT_STAY])
})

test('a home page of the chosen sport stays as it is', () => {
	const page = homePage('crossfit', 'crossfit')

	assert.deepEqual(page.replaced, [])
	assert.equal(page.html.style.visibility, '')
	assert.equal(page.timers.length, 0)
})
