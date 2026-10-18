import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { REGIONS } from './regions.ts'
import { DEFAULT_SPORT, SPORTS } from './sports.ts'

const GLOBAL_CSS = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8')

/** Контраст двух цветов #rrggbb по WCAG 2. */
function contrast(a: string, b: string) {
	const luminance = (hex: string) => {
		const [r, g, b] = [1, 3, 5].map((i) => {
			const v = parseInt(hex.slice(i, i + 2), 16) / 255

			return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
		})

		return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
	}
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)

	return (hi! + 0.05) / (lo! + 0.05)
}

test('regions have unique slugs and Russian labels', () => {
	const slugs = REGIONS.map((r) => r.slug)

	assert.equal(new Set(slugs).size, slugs.length)

	for (const r of REGIONS) assert.match(r.label, /[а-яё]/i)
})

test('sports have unique kebab-case slugs, and the default sport is one of them', () => {
	const slugs = SPORTS.map((s) => s.slug)

	assert.equal(new Set(slugs).size, slugs.length)

	for (const slug of slugs) assert.match(slug, /^[a-z]+(-[a-z]+)*$/)

	assert.ok(slugs.includes(DEFAULT_SPORT))
})

for (const sport of SPORTS) {
	test(`${sport.slug}: elements have unique kebab-case slugs and both names`, () => {
		const slugs = sport.elements.map((m) => m.slug)

		assert.equal(new Set(slugs).size, slugs.length)

		for (const m of sport.elements) {
			assert.match(m.slug, /^[a-z]+(-[a-z]+)*$/)
			assert.ok(m.title && m.titleEn, m.slug)
		}
	})

	test(`${sport.slug}: frequency order has no duplicates`, () => {
		assert.equal(new Set(sport.frequencyOrder).size, sport.frequencyOrder.length)
	})

	// Пара цветов живёт и в данных, и в global.css: CSS не импортирует TS, поэтому сверяем
	test(`${sport.slug}: global.css paints [data-sport] with the sport accent`, () => {
		const block = GLOBAL_CSS.match(new RegExp(`:root\\[data-sport='${sport.slug}'\\]\\s*\\{([^}]*)\\}`))?.[1]

		assert.ok(block, `нет блока :root[data-sport='${sport.slug}'] в global.css`)
		assert.match(block, new RegExp(`--accent-light: ${sport.accent.light};`))
		assert.match(block, new RegExp(`--accent-dark: ${sport.accent.dark};`))
		assert.match(block, new RegExp(`--on-accent-light: ${sport.accent.onLight};`))
		assert.match(block, new RegExp(`--on-accent-dark: ${sport.accent.onDark};`))
	})

	// Номер текущей строки и метка травмы на модели -- крупные цифры: для них хватает 3:1
	test(`${sport.slug}: digits on the accent fill are readable in both themes`, () => {
		assert.ok(contrast(sport.accent.onLight, sport.accent.light) >= 3, 'light')
		assert.ok(contrast(sport.accent.onDark, sport.accent.dark) >= 3, 'dark')
	})

	test(`${sport.slug}: accent differs from the frequency and danger colors`, () => {
		const taken = [...GLOBAL_CSS.matchAll(/--(?:common|uncommon|rare|danger): (#[0-9a-f]{6});/g)].map((m) => m[1])

		assert.ok(taken.length >= 8)

		for (const color of [sport.accent.light, sport.accent.dark]) assert.ok(!taken.includes(color), color)
	})
}
