/** Зоны тела в порядке показа на главной. Slug идёт в frontmatter статьи и в адрес фильтра. */
export const REGIONS = [
	{ slug: 'head', label: 'Голова' },
	{ slug: 'shoulder', label: 'Плечо' },
	{ slug: 'elbow', label: 'Локоть' },
	{ slug: 'wrist-hand', label: 'Запястье и кисть' },
	{ slug: 'lumbar', label: 'Поясница' },
	{ slug: 'hip-groin', label: 'Таз, бедро и пах' },
	{ slug: 'knee', label: 'Колено' },
	{ slug: 'shin', label: 'Голень' },
	{ slug: 'ankle-foot', label: 'Голеностоп и стопа' },
	{ slug: 'other', label: 'Всё тело и прочее' },
] as const

export type Region = (typeof REGIONS)[number]['slug']

export const REGION_SLUGS = REGIONS.map((r) => r.slug) as [Region, ...Region[]]

export function regionLabel(slug: Region) {
	return REGIONS.find((r) => r.slug === slug)!.label
}
