import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import { itemLinks } from '@aimuzov/infra-site-kit/changelog.js'

import { RELEASES } from '#frontend/data/changelog.ts'
import { SPORTS } from '#frontend/data/sports.ts'

import { injuryPage } from './injury-page.ts'

// Формат, запись для текущей версии и что страницы есть в сборке, проверяет site-changelog verify
// в CI. Здесь только своё: ссылка на травму -- сразу на страницу разбора. `/injuries/<slug>` без
// слэша -- это 301 от сервера и ещё страница-переадресация, если у травмы один спорт
test('every link in the changelog leads straight to an existing page', () => {
	const sportsOf = (slug: string) =>
		SPORTS.filter((s) => existsSync(`src/frontend/content/sports/${s.slug}/${slug}.md`)).map((s) => s.slug)

	for (const r of RELEASES) {
		for (const href of r.items.flatMap(itemLinks)) {
			assert.match(href, /\/$/, `${href}: без слэша на конце`)

			const [, scope, slug] = href.match(/^\/([a-z-]+)\/([a-z0-9-]+)\/$/) ?? []
			const sport = SPORTS.find((s) => s.slug === scope)?.slug

			if (slug && (scope === 'injuries' || sport)) assert.equal(href, injuryPage(slug, sportsOf(slug), sport))
		}
	}
})
