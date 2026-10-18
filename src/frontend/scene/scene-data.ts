import { getCollection } from 'astro:content'

import { MOVEMENTS } from '#frontend/data/movements.ts'
import { buildZones } from '#frontend/scene/zones.ts'

/** Данные сцены для главной и страниц движений: зоны с травмами и движения для фильтра. */
export async function sceneData() {
	const entries = await getCollection('injuries')
	const injuries = entries.map(({ id, data }) => ({
		slug: id,
		title: data.title,
		titleEn: data.titleEn,
		summary: data.summary,
		frequency: data.frequency,
		movements: data.movements as string[],
		region: data.region,
	}))
	const { zones, whole } = buildZones(injuries)
	const movements = MOVEMENTS.filter((m) => injuries.some((i) => i.movements.includes(m.slug))).map(
		({ slug, title }) => ({ slug, title }),
	)

	return { entries, zones, whole, movements }
}
