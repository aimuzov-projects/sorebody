/**
 * Градиент бренда -- акцент страниц без спорта (about, «Что нового», 404, общая статья травмы):
 * от синего кроссфита к голубому. Синий -- `accent` кроссфита из data/sports.ts, голубой свой,
 * спорта у него нет. Цвета других спортов сюда не идут: синий в зелёный футбола выглядел
 * грязно, а лайм падела ещё хуже.
 * base.astro вставляет `BRAND_GRADIENT_CSS` в `<head>`, styles/global.css берёт из него
 * `--brand-gradient` своей темы, знак логотипа и значки -- остановки `brand-stop-<i>`.
 */
import { SPORTS } from '#frontend/data/sports.ts'

export type Theme = 'light' | 'dark'

/** Голубой конец градиента. Светлый близок к синему: светлее текст не проходит AA. */
export const BRAND_SKY = { light: '#006da6', dark: '#5ac8fa' } as const

const crossfit = SPORTS.find((s) => s.slug === 'crossfit')

if (!crossfit) throw new Error('Нет кроссфита для градиента бренда')

/** Цвета градиента по порядку, у каждого -- светлый и тёмный. */
export const BRAND_COLORS: readonly { light: string; dark: string }[] = [crossfit.accent, BRAND_SKY]

const brandAccents = () => BRAND_COLORS

/** Цвета градиента темы. */
export const brandStops = (theme: Theme): string[] => brandAccents().map((accent) => accent[theme])

/**
 * Градиент темы. Первый цвет повторён в конце: при наведении фон уезжает на длину градиента,
 * и с повтором перелив идёт по кругу без шва. Интерполяция sRGB, без `in oklab`: её понимают все
 * браузеры, а промежуточные цвета тоже проверяет на AA тест.
 */
export function brandGradient(theme: Theme): string {
	const stops = brandStops(theme)

	return `linear-gradient(90deg, ${[...stops, stops[0]].join(', ')})`
}

/**
 * Тот же градиент без повтора: слева направо от первого цвета к последнему. Для того, что не
 * плывёт, -- кнопки меню и полосы прогресса: с повтором справа снова проступал синий.
 */
export function brandLine(theme: Theme): string {
	return `linear-gradient(90deg, ${brandStops(theme).join(', ')})`
}

/**
 * Сколько процентов цвета в заливке плашки у ссылки на другую страницу сайта (styles/article.css,
 * главная). Больше нельзя: на сером фоне главной синий и лайм уже у порога AA, это сверяет тест.
 */
export const LINK_TINT = 8

/** Заливка плашки внутренней ссылки на странице без спорта: тот же градиент, едва заметный. */
export function brandTint(theme: Theme): string {
	const stops = brandStops(theme).map((c) => `color-mix(in srgb, ${c} ${LINK_TINT}%, transparent)`)

	return `linear-gradient(90deg, ${[...stops, stops[0]].join(', ')})`
}

/**
 * CSS для `<head>`: градиенты и заливки обеих тем и цвета остановок SVG-градиентов знака
 * и значков. Остановке цвет темы даёт `light-dark()` от `color-scheme` темы, перед ним --
 * светлый на случай старого браузера.
 */
export const BRAND_GRADIENT_CSS = [
	`:root{--brand-gradient-light:${brandGradient('light')};--brand-gradient-dark:${brandGradient('dark')};` +
		`--brand-line-light:${brandLine('light')};--brand-line-dark:${brandLine('dark')};` +
		`--brand-tint-light:${brandTint('light')};--brand-tint-dark:${brandTint('dark')}}`,
	...brandAccents().map(
		({ light, dark }, i) => `.brand-stop-${i}{stop-color:${light};stop-color:light-dark(${light},${dark})}`,
	),
].join('\n')

/** Сколько остановок у SVG-градиентов: по одной на цвет. */
export const BRAND_STOP_COUNT = BRAND_COLORS.length
