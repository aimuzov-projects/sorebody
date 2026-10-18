import { getCollection, type CollectionEntry } from 'astro:content'

import { SPORTS, type Sport, type SportSlug } from '#frontend/data/sports.ts'

export type Injury = CollectionEntry<'injuries'>
export type Lens = CollectionEntry<'lenses'>

/** Травма в спорте: общая часть и линза. */
export type SportInjury = { slug: string; injury: Injury; lens: Lens }

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
	const lenses = new Set((await getCollection('lenses')).map((entry) => entry.id))

	return SPORTS.filter((sport) => lenses.has(`${sport.slug}/${slug}`)).map((sport) => sport.slug)
}
