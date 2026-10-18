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

/**
 * Насколько разные два цвета #rrggbb на глаз: расстояние в OKLab, где равные шаги видятся
 * примерно равными. Порог заметной разницы около 0.02, соседние спорты разводим сильнее.
 */
function distance(a: string, b: string) {
	const oklab = (hex: string) => {
		const [r, g, b] = [1, 3, 5].map((i) => {
			const v = parseInt(hex.slice(i, i + 2), 16) / 255

			return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
		}) as [number, number, number]
		const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
		const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
		const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

		return [
			0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
			1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
			0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
		]
	}
	const [p, q] = [oklab(a), oklab(b)]

	return Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!)
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

	// Ссылки и фраза спорта в заголовке -- мелкий текст акцентом: AA на фоне и на серой заливке чипов
	test(`${sport.slug}: accent text passes AA on the page and chip backgrounds`, () => {
		for (const bg of ['#ffffff', '#f5f5f7']) assert.ok(contrast(sport.accent.light, bg) >= 4.5, `light на ${bg}`)

		assert.ok(contrast(sport.accent.dark, '#161617') >= 4.5, 'dark')
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

// Цвет -- знак спорта: при переключении в заголовке и на модели спорты не должны сливаться.
// Самая близкая пара -- лайм падела и зелёный футбола в светлой теме (0.087), порог чуть ниже
const MIN_DISTANCE = 0.08

test('sport accents and model glows are far apart from each other', () => {
	for (const key of ['light', 'dark', 'glow'] as const)
		for (const [i, a] of SPORTS.entries())
			for (const b of SPORTS.slice(i + 1)) {
				const d = distance(a.accent[key], b.accent[key])

				assert.ok(d >= MIN_DISTANCE, `${a.slug} и ${b.slug}, ${key}: ${d.toFixed(3)}`)
			}
})

// С цветами частоты и «опасно» спорт стоит рядом в одной строке, но у уровня частоты есть ещё
// и знак. Самая близкая пара -- синий кроссфита и индиго нечастых (0.046), она была до других
// спортов; порог не даёт новому спорту подойти ещё ближе
test('sport accents are far from the frequency and danger colors of their theme', () => {
	const [light, dark] = ['light', 'dark'].map((theme) => {
		const block =
			theme === 'light'
				? GLOBAL_CSS.split('@media (prefers-color-scheme: dark)')[0]!
				: GLOBAL_CSS.split(":root[data-theme='dark']")[1]!

		return [...block.matchAll(/--(common|uncommon|rare|danger): (#[0-9a-f]{6});/g)].map((m) => m[2]!)
	})

	assert.equal(light!.length, 4)
	assert.equal(dark!.length, 4)

	for (const sport of SPORTS)
		for (const [theme, taken] of [
			['light', light!],
			['dark', dark!],
		] as const)
			for (const color of taken) {
				const d = distance(sport.accent[theme], color)

				assert.ok(d >= 0.04, `${sport.slug}, ${theme}, ${color}: ${d.toFixed(3)}`)
			}
})
