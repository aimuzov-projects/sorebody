import type { Movement } from '#frontend/data/movements.ts'
import type { Region } from '#frontend/data/regions.ts'

/** Что нужно острову главной от статьи: без тела статьи, чтобы не раздувать HTML. */
export type InjuryListItem = {
	slug: string
	title: string
	titleEn: string
	summary: string
	region: Region
	frequency: 'common' | 'rare'
	movements: Movement[]
}

export type Filters = {
	region?: Region
	frequency?: 'common' | 'rare'
	movement?: Movement
	query?: string
}

const normalize = (s: string) => s.toLowerCase().replaceAll('ё', 'е').trim()

export function filterInjuries(list: InjuryListItem[], { region, frequency, movement, query }: Filters) {
	const q = query ? normalize(query) : ''

	return list.filter(
		(i) =>
			(!region || i.region === region) &&
			(!frequency || i.frequency === frequency) &&
			(!movement || i.movements.includes(movement)) &&
			(!q || normalize(`${i.title} ${i.titleEn} ${i.summary}`).includes(q)),
	)
}
