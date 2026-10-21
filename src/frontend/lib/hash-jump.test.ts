import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

import { HASH_JUMP } from './hash-jump.ts'

/** Страница статьи с хешем `hash`: окружение скрипта из `<head>`. */
function articlePage(hash: string, ids: string[] = ['urgent']) {
	const scrolled: string[] = []
	const listeners: (() => void)[] = []
	const timers: (() => void)[] = []
	const html = { style: { visibility: '' } }
	const document = {
		documentElement: html,
		readyState: 'loading',
		addEventListener: (_type: string, run: () => void) => listeners.push(run),
		getElementById: (id: string) => (ids.includes(id) ? { scrollIntoView: () => scrolled.push(id) } : null),
	}

	runInNewContext(HASH_JUMP, { document, location: { hash }, setTimeout: (run: () => void) => timers.push(run) })

	const parsed = () => {
		document.readyState = 'interactive'

		for (const run of listeners) run()
	}

	return { html, scrolled, timers, parsed }
}

test('a section hash hides the page until the markup is parsed, then jumps to the section', () => {
	const page = articlePage('#urgent')

	assert.equal(page.html.style.visibility, 'hidden')
	page.parsed()
	assert.deepEqual(page.scrolled, ['urgent'])
	assert.equal(page.html.style.visibility, '')
})

test('an unknown section only shows the page again, the timer shows it as a fallback', () => {
	const page = articlePage('#no-such')

	page.parsed()
	assert.deepEqual(page.scrolled, [])
	assert.equal(page.html.style.visibility, '')

	const stuck = articlePage('#urgent')

	for (const run of stuck.timers) run()

	assert.equal(stuck.html.style.visibility, '')
})

test('no hash, a Telegram hash and a broken hash leave the page alone', () => {
	for (const hash of ['', '#', '#tgWebAppData=query_id%3DAA', '#%'])
		assert.equal(articlePage(hash).html.style.visibility, '', hash)
})
