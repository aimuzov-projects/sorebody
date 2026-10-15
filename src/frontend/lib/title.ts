import { site } from '#frontend/data/site.ts'

/** Заголовок страницы: своё название и через тире название сайта, у главной -- только сайт. */
export function pageTitle(title?: string) {
	return title ? `${title} — ${site.name}` : site.name
}
