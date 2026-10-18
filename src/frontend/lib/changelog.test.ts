import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

import { RELEASES } from '#frontend/data/changelog.ts'
import { SPORTS } from '#frontend/data/sports.ts'

import { itemHtml, itemLinks, releaseDate } from './changelog.ts'
import { injuryPage } from './injury-page.ts'

test('links become anchors and the rest of the item is escaped', () => {
	assert.equal(
		itemHtml('Статья о [разрыве ПКС](/injuries/acl-tear) & <b>'),
		'Статья о <a href="/injuries/acl-tear">разрыве ПКС</a> &amp; &lt;b&gt;',
	)

	assert.equal(itemHtml('Без ссылок'), 'Без ссылок')
})

test('the release date reads as a Russian date without the year suffix', () => {
	assert.equal(releaseDate('2026-10-18'), '18 октября 2026')
	assert.equal(releaseDate('2026-01-01'), '1 января 2026')
})

test('releases go newest first with unique versions and dates in order', () => {
	const versions = RELEASES.map((r) => r.version)

	assert.equal(new Set(versions).size, versions.length)

	for (const [i, r] of RELEASES.entries()) {
		assert.match(r.version, /^\d+\.\d+\.\d+$/)
		assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/)
		assert.ok(r.items.length > 0, r.version)

		const next = RELEASES[i + 1]

		if (next) assert.ok(r.date >= next.date, `${r.version} is older than ${next.version}`)
	}
})

// release-please поднимает версию в package.json своим PR: без записи о ней CI там упадёт
test('the current package version has a changelog entry', () => {
	const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

	assert.ok(
		RELEASES.some((r) => r.version === version),
		`add a ${version} entry to src/frontend/data/changelog.ts`,
	)
})

// Ссылка на травму -- сразу на страницу разбора: `/injuries/<slug>` без слэша -- это 301 от сервера
// и ещё страница-переадресация, если у травмы один спорт
test('every link in the changelog leads straight to an existing page', () => {
	const sportsOf = (slug: string) =>
		SPORTS.filter((s) => existsSync(`src/frontend/content/sports/${s.slug}/${slug}.md`)).map((s) => s.slug)

	for (const r of RELEASES) {
		for (const href of r.items.flatMap(itemLinks)) {
			assert.match(href, /\/$/, `${href}: без слэша на конце`)

			const [, scope, slug] = href.match(/^\/([a-z-]+)\/([a-z0-9-]+)\/$/) ?? []
			const sport = SPORTS.find((s) => s.slug === scope)?.slug

			if (slug && (scope === 'injuries' || sport)) assert.equal(href, injuryPage(slug, sportsOf(slug), sport))
			else assert.ok(existsSync(`src/frontend/pages${href.slice(0, -1)}.astro`), href)
		}
	}
})
