import { sportHome, SPORTS, type Sport } from '#frontend/data/sports.ts'
import { sportInjuries } from '#frontend/lib/catalog.ts'
import { buildZones } from '#frontend/scene/zones.ts'

/** Данные сцены спорта для его главной и страниц элементов: зоны с травмами и элементы для фильтра. */
export async function sceneData(sport: Sport) {
	const entries = await sportInjuries(sport)
	const injuries = entries.map(({ slug, injury, lens }) => ({
		slug,
		title: injury.data.title,
		titleEn: injury.data.titleEn,
		summary: lens.data.summary,
		frequency: lens.data.frequency,
		movements: lens.data.elements,
		region: injury.data.region,
	}))
	const { zones, whole } = buildZones(sport, injuries)
	const movements = sport.elements
		.filter((m) => injuries.some((i) => i.movements.includes(m.slug)))
		.map(({ slug, title }) => ({ slug, title }))

	return {
		entries,
		zones,
		whole,
		movements,
		// Что острову сцены нужно от спорта: адреса, подписи, цвет подсветки модели и спорты для
		// селекта в заголовке -- только те, где уже есть травмы
		scene: {
			slug: sport.slug,
			home: sportHome(sport.slug),
			phrase: sport.phrase,
			elementLabel: sport.elementLabel,
			glow: sport.accent.glow,
			sports: (await Promise.all(SPORTS.map(async (s) => ((await sportInjuries(s)).length ? [s] : []))))
				.flat()
				.map((s) => ({ slug: s.slug, title: s.title, phrase: s.phrase, href: sportHome(s.slug) })),
		},
	}
}

export type SceneSport = Awaited<ReturnType<typeof sceneData>>['scene']
