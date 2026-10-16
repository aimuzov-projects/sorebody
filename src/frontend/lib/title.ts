import { site } from '#frontend/data/site.ts'

/** Заголовок страницы: своё название и через тире название сайта, у главной -- только сайт. */
export function pageTitle(title?: string) {
	return title ? `${title} — ${site.name}` : site.name
}

/**
 * Название травмы без другого названия в скобках в конце: «Разрыв передней крестообразной
 * связки (ПКС)» -> «Разрыв передней крестообразной связки» и «ПКС». Скобки с запятой -- уточнение,
 * а не второе имя («Растяжения мышц (дельтовидная, трапециевидная, …)»), их оставляем в названии.
 */
export function splitTitle(title: string): { name: string; alias?: string } {
	const match = title.match(/^(.*\S)\s*\(([^(),]+)\)$/)

	return match ? { name: match[1], alias: match[2].trim() } : { name: title }
}
