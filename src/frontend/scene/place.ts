import type { Zone } from './zones.ts'

type Injury = Zone['injuries'][number]

/**
 * Где посетитель на главной, по адресу: сцена (без хеша), зона `#zone=knee:0` или статья по её
 * пути `/crossfit/meniscus-tear/`. Адрес -- источник правды, body-3d.svelte сверяется с ним.
 */
export type Place = { level: 0 } | { level: 1; zone: Zone; index: number } | { level: 2; zone: Zone; injury: Injury }

export function zoneHash(zone: Zone, index: number) {
	return `#zone=${zone.slug}:${index}`
}

/**
 * Путь статьи спорта, как у её страницы (`sportArticle` в data/sports.ts): статью поверх сцены
 * держим под ним, а не под хешем главной. Хеш не уходит на сервер, и ссылка из адресной строки
 * отдавала превью и поисковикам мету главной спорта.
 */
export function articlePath(sport: string, slug: string) {
	return `/${sport}/${slug}/`
}

/** Статья по пути `/<спорт>/<травма>/`, спорт -- из `sports`. Другой путь -- null. */
export function articleAt(pathname: string, sports: { slug: string }[]) {
	const match = pathname.match(/^\/([\w-]+)\/([\w-]+)\/?$/)

	if (!match || !sports.some((s) => s.slug === match[1])) return null

	return { sport: match[1], slug: match[2] }
}

/**
 * Место по адресу: статья -- по пути спорта `sport`, зона и старые ссылки `#meniscus-tear` -- по
 * хешу. Путь статьи другого спорта или травмы, которой нет в зонах, -- сцена.
 */
export function placeAt(
	{ pathname, hash }: { pathname: string; hash: string },
	sport: { slug: string },
	zones: Zone[],
): Place {
	const at = articleAt(pathname, [sport])

	if (!at) return parseHash(hash, zones)

	const place = parseHash(at.slug, zones)

	return place.level === 2 ? place : { level: 0 }
}

/** Место по хешу адреса (`location.hash`). `zones` -- все зоны спорта вместе со "Всё тело". */
export function parseHash(rawHash: string, zones: Zone[]): Place {
	let hash: string

	// Битый процент-эскейп (`/#%`) бросает URIError и валил onMount -- считаем, что хеша нет
	try {
		hash = decodeURIComponent(rawHash.replace(/^#/, ''))
	} catch {
		return { level: 0 }
	}

	const zoneMatch = hash.match(/^zone=([\w-]+):(\d)$/)

	if (zoneMatch) {
		const zone = zones.find((z) => z.slug === zoneMatch[1])
		const index = Number(zoneMatch[2])

		if (zone && zone.points[index]) return { level: 1, zone, index }
	}

	for (const zone of zones) {
		const injury = zone.injuries.find((i) => i.slug === hash)

		if (injury) return { level: 2, zone, injury }
	}

	return { level: 0 }
}

/**
 * Зона из ссылки «?region=knee» (или «knee:1» -- с точкой зоны) со страницы статьи.
 * Точки с таким номером нет -- первая; зоны нет -- null.
 */
export function regionPlace(search: string, zones: Zone[]) {
	const [region, point] = (new URLSearchParams(search).get('region') ?? '').split(':')
	const zone = zones.find((z) => z.slug === region)

	if (!zone) return null

	return { zone, index: zone.points[Number(point)] ? Number(point) : 0 }
}

/** Спорт по адресу главной: `/` и `/crossfit/` -- кроссфит, `/padel/` -- падел. */
export function sportAt(pathname: string, sports: { slug: string; href: string }[]) {
	const path = pathname.replace(/\/?$/, '/')

	return sports.find((s) => s.href === path || `/${s.slug}/` === path)?.slug
}
