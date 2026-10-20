import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { SPORTS } from '#frontend/data/sports.ts'

import {
	BRAND_COLORS,
	BRAND_GRADIENT_CSS,
	BRAND_SKY,
	BRAND_STOP_COUNT,
	brandGradient,
	brandStops,
	brandTint,
	LINK_TINT,
	type Theme,
} from './brand-gradient.ts'

const GLOBAL_CSS = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8')
const BASE = readFileSync(new URL('../layouts/base.astro', import.meta.url), 'utf8')
const ARTICLE_CSS = readFileSync(new URL('../styles/article.css', import.meta.url), 'utf8')
const BODY_3D = readFileSync(new URL('../components/body-3d.svelte', import.meta.url), 'utf8')

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

function luminance(c: number[]) {
	const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))

	return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: number[], b: number[]) {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)

	return (hi! + 0.05) / (lo! + 0.05)
}

/** Фон страницы и заливка чипов: на них стоят ссылки и подписи градиентом. */
const BACKGROUNDS: Record<Theme, string[]> = { light: ['#ffffff', '#f5f5f7'], dark: ['#161617', '#2d2d2e'] }

const accentOf = (slug: string, theme: Theme) => SPORTS.find((s) => s.slug === slug)!.accent[theme]

for (const theme of ['light', 'dark'] as const) {
	test(`${theme}: the brand gradient runs from the crossfit blue to the sky blue`, () => {
		const accents = [accentOf('crossfit', theme), BRAND_SKY[theme]]

		assert.deepEqual(brandStops(theme), accents)
		assert.equal(brandGradient(theme), `linear-gradient(90deg, ${[...accents, accents[0]].join(', ')})`)
		assert.ok(BRAND_GRADIENT_CSS.includes(`--brand-gradient-${theme}:${brandGradient(theme)}`))
	})

	// Текст градиентом читается везде, где читается каждый его кусок: проверяем не только
	// цвета спортов, но и смеси между соседями (градиент в sRGB смешивает каналы линейно)
	test(`${theme}: every point of the brand gradient passes AA as text`, () => {
		const stops = [...brandStops(theme), brandStops(theme)[0]!].map(rgb)

		for (const bg of BACKGROUNDS[theme])
			for (let i = 0; i < stops.length - 1; i++)
				for (let step = 0; step <= 20; step++) {
					const mix = stops[i]!.map((v, k) => Math.round(v + ((stops[i + 1]![k]! - v) * step) / 20))

					assert.ok(contrast(mix, rgb(bg)) >= 4.5, `rgb(${mix.join(' ')}) на ${bg}`)
				}
	})
}

test('every brand colour has an SVG gradient stop', () => {
	assert.equal(BRAND_STOP_COUNT, BRAND_COLORS.length)

	for (const [i, { light, dark }] of BRAND_COLORS.entries()) {
		assert.ok(
			BRAND_GRADIENT_CSS.includes(
				`.brand-stop-${i}{stop-color:${light};stop-color:light-dark(${light},${dark})}`,
			),
		)
	}
})

test('global.css takes the brand gradient of its theme and base.astro inserts it', () => {
	assert.match(GLOBAL_CSS, /--brand-gradient: var\(--brand-gradient-light\);/)

	assert.equal(
		GLOBAL_CSS.match(/--brand-gradient: var\(--brand-gradient-dark\);/g)?.length,
		2,
		'оба блока тёмной темы',
	)

	assert.match(BASE, /BRAND_GRADIENT_CSS/)
})

/** Цвет `color` поверх фона `bg` с непрозрачностью `share`, как `color-mix(... transparent)`. */
const over = (color: number[], bg: number[], share: number) => color.map((v, k) => v * share + bg[k]! * (1 - share))

/** Где стоят плашки внутренних ссылок: страница и серый фон главной, тёмный фон обеих. */
const LINK_BACKGROUNDS: Record<Theme, string[]> = { light: ['#ffffff', '#f5f5f7'], dark: ['#161617'] }

// Плашка ссылки на страницу сайта -- заливка цветом самой ссылки: чем гуще, тем ближе фон
// к тексту. Проверяем цвета всех спортов и обе точки градиента бренда
test('the internal link pill keeps AA for every sport and the brand gradient', () => {
	for (const theme of ['light', 'dark'] as const) {
		const colors = [...SPORTS.map((sport) => sport.accent[theme]), ...brandStops(theme)]

		for (const color of colors)
			for (const bg of LINK_BACKGROUNDS[theme]) {
				const fill = over(rgb(color), rgb(bg), LINK_TINT / 100)

				assert.ok(contrast(rgb(color), fill) >= 4.5, `${color} на плашке поверх ${bg}`)
			}

		assert.ok(BRAND_GRADIENT_CSS.includes(`--brand-tint-${theme}:${brandTint(theme)}`))
	}

	assert.match(ARTICLE_CSS, new RegExp(`color-mix\\(in srgb, var\\(--accent\\) ${LINK_TINT}%, transparent\\)`))
	assert.match(BODY_3D, new RegExp(`color-mix\\(in srgb, var\\(--a-blue\\) ${LINK_TINT}%, transparent\\)`))
})
