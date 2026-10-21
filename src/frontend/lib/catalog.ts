import { getCollection, type CollectionEntry } from 'astro:content'

import type { Frequency } from '#frontend/data/frequency.ts'
import { SPORTS, type Sport, type SportSlug } from '#frontend/data/sports.ts'

export type Injury = CollectionEntry<'injuries'>
export type Lens = CollectionEntry<'lenses'>

/** Травма в спорте: общая часть и линза. */
type SportInjury = { slug: string; injury: Injury; lens: Lens }

/**
 * Травмы спорта: линзы из `content/sports/<sport>` вместе с общими частями. Линза без общей
 * части и элемент не из списка спорта роняют сборку, как и в тесте контента.
 */
export async function sportInjuries(sport: Sport): Promise<SportInjury[]> {
	const injuries = new Map((await getCollection('injuries')).map((entry) => [entry.id, entry]))
	const lenses = await getCollection('lenses', (entry) => entry.id.startsWith(`${sport.slug}/`))
	const known = new Set(sport.elements.map((e) => e.slug))

	return lenses.map((lens) => {
		const slug = lens.id.slice(sport.slug.length + 1)
		const injury = injuries.get(slug)

		if (!injury) throw new Error(`${lens.id}: нет общей части content/injuries/${slug}.md`)

		const unknown = lens.data.elements.filter((e) => !known.has(e))

		if (unknown.length) throw new Error(`${lens.id}: элементы не из списка спорта: ${unknown.join(', ')}`)

		return { slug, injury, lens }
	})
}

/** Спорты, у которых есть линза к травме, в порядке `SPORTS`. */
export async function sportsOf(slug: string): Promise<SportSlug[]> {
	return (await lensSports()).get(slug) ?? []
}

/** Спорты с линзой для каждой травмы, у которой она есть хоть в одном, в порядке `SPORTS`. */
export async function lensSports(): Promise<Map<string, SportSlug[]>> {
	const lenses = new Set((await getCollection('lenses')).map((entry) => entry.id))
	const injuries = await getCollection('injuries')

	return new Map(
		injuries.map((injury) => [
			injury.id,
			SPORTS.filter((sport) => lenses.has(`${sport.slug}/${injury.id}`)).map((sport) => sport.slug),
		]),
	)
}

/** Частота травмы в каждом спорте, где у неё есть линза, в порядке `SPORTS`. */
export async function injuryFrequencies(slug: string): Promise<{ sport: SportSlug; frequency: Frequency }[]> {
	const lenses = new Map((await getCollection('lenses')).map((entry) => [entry.id, entry]))

	return SPORTS.flatMap((sport) => {
		const lens = lenses.get(`${sport.slug}/${slug}`)

		return lens ? [{ sport: sport.slug, frequency: lens.data.frequency }] : []
	})
}

/** Ссылки на травмы в тексте: `/injuries/<slug>/`, как их пишет Markdown статей. */
const linkedSlugs = (body = '') => [...body.matchAll(/\]\(\/injuries\/([a-z0-9-]+)\/?(?:#[^)]*)?\)/g)].map((m) => m[1]!)

/**
 * Травмы, связанные с этой ссылками в текстах: сначала те, на которые ссылается она сама
 * (общая часть и линзы), потом те, что ссылаются на неё. Без повторов и без неё самой.
 */
export async function relatedInjuries(slug: string, limit = 4): Promise<Injury[]> {
	const injuries = await getCollection('injuries')
	const lenses = await getCollection('lenses')
	const own = [
		injuries.find((i) => i.id === slug)?.body,
		...lenses.filter((l) => l.id.endsWith(`/${slug}`)).map((l) => l.body),
	]
	const outgoing = own.flatMap((body) => linkedSlugs(body))
	const incoming = [...injuries, ...lenses]
		.filter((entry) => linkedSlugs(entry.body).includes(slug))
		.map((entry) => entry.id.split('/').at(-1)!)
	const order = [...new Set([...outgoing, ...incoming])].filter((s) => s !== slug)

	return order.flatMap((s) => injuries.find((i) => i.id === s) ?? []).slice(0, limit)
}
