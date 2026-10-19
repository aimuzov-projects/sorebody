/**
 * Градиент бренда -- акцент страниц без спорта (about, «Что нового», 404, общая статья травмы):
 * от синего кроссфита к зелёному футбола. Цвета берутся из `accent` этих спортов в
 * data/sports.ts, не дублируются. Все цвета спортов сразу не сочетались: лайм падела между
 * синим и зелёным давал грязный переход, поэтому новый спорт сюда не добавляется сам.
 * base.astro вставляет `BRAND_GRADIENT_CSS` в `<head>`, styles/global.css берёт из него
 * `--brand-gradient` своей темы, знак логотипа и значки -- остановки `brand-stop-<i>`.
 */
import { SPORTS, type SportSlug } from '#frontend/data/sports.ts'

export type Theme = 'light' | 'dark'

/** Спорты, чьи цвета составляют градиент, по порядку. */
export const BRAND_SPORTS: readonly SportSlug[] = ['crossfit', 'football']

const brandAccents = () =>
	BRAND_SPORTS.map((slug) => {
		const sport = SPORTS.find((s) => s.slug === slug)

		if (!sport) throw new Error(`Нет спорта ${slug} для градиента бренда`)

		return sport.accent
	})

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
		`--brand-tint-light:${brandTint('light')};--brand-tint-dark:${brandTint('dark')}}`,
	...brandAccents().map(
		({ light, dark }, i) => `.brand-stop-${i}{stop-color:${light};stop-color:light-dark(${light},${dark})}`,
	),
].join('\n')

/** Сколько остановок у SVG-градиентов: по одной на цвет. */
export const BRAND_STOP_COUNT = BRAND_SPORTS.length
