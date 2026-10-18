import type { Frequency } from '#frontend/data/frequency.ts'
import { regionLabel, type Region } from '#frontend/data/regions.ts'
import type { CrossfitElement as Movement } from '#frontend/data/sports.ts'

/** Что нужно острову главной от статьи: без тела статьи, чтобы не раздувать HTML. */
export type InjuryListItem = {
	slug: string
	title: string
	titleEn: string
	summary: string
	region: Region
	frequency: Frequency
	movements: Movement[]
}

type Filters = {
	region?: Region
	frequency?: Frequency
	movement?: Movement
	query?: string
}

/** Текст для поиска: тексты набраны с неразрывными пробелами, а в запросе пробелы обычные. */
export const normalize = (s: string) => s.toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ').trim()

/**
 * Список травм под фильтры главной. Незаданный фильтр пропускает всё.
 * Запрос ищется подстрокой в обоих названиях, описании и подписи зоны, через `normalize`.
 */
export function filterInjuries(list: InjuryListItem[], { region, frequency, movement, query }: Filters) {
	const q = query ? normalize(query) : ''

	return list.filter(
		(i) =>
			(!region || i.region === region) &&
			(!frequency || i.frequency === frequency) &&
			(!movement || i.movements.includes(movement)) &&
			(!q || normalize(`${i.title} ${i.titleEn} ${i.summary} ${regionLabel(i.region)}`).includes(q)),
	)
}
