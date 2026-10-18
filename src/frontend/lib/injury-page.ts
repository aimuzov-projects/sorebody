import { sportArticle, type SportSlug } from '#frontend/data/sports.ts'

/**
 * Адрес страницы травмы без переадресаций. `/injuries/<slug>/` настоящая только у травмы
 * нескольких спортов, у травмы одного спорта там переадресация на его разбор
 * (pages/injuries/[slug].astro). Со страницы спорта ссылка ведёт в его же разбор, если он есть.
 *
 * @param sports спорты, где у травмы есть линза
 * @param current спорт страницы, с которой ссылаемся
 */
export function injuryPage(slug: string, sports: readonly SportSlug[], current?: SportSlug) {
	if (current && sports.includes(current)) return sportArticle(current, slug)

	const [only] = sports

	return sports.length === 1 && only ? sportArticle(only, slug) : `/injuries/${slug}/`
}
