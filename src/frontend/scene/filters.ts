import { Search } from 'lucide-static'

import { frequencyOf, type Frequency } from '#frontend/data/frequency.ts'
import { MOVEMENT_ICONS, type ElementIcon } from '#frontend/data/movement-icons.ts'
import { normalize } from '#frontend/lib/filter.ts'

import type { Zone } from './zones.ts'

type Injury = Zone['injuries'][number]

/** Фильтры индекса главной. Они же решают, какие травмы видны в зоне и какие точки горят. */
export type SceneFilters = { query: string; frequency: 'all' | Frequency; movement: string }

/** Травма под фильтры: незаданный пропускает всё, запрос ищется в названиях и описании. */
export function matchesFilters(injury: Injury, { query, frequency, movement }: SceneFilters) {
	const q = normalize(query)

	return (
		(frequency === 'all' || injury.frequency === frequency) &&
		(!movement || injury.movements.includes(movement)) &&
		(!q || normalize(`${injury.title} ${injury.titleEn} ${injury.summary}`).includes(q))
	)
}

export function isFiltering({ query, frequency, movement }: SceneFilters) {
	return query.trim() !== '' || frequency !== 'all' || movement !== ''
}

/**
 * Включённые фильтры для шапки раскрытой зоны и свёрнутого острова: каждый своим чипом и
 * со своим знаком -- частота своим знаком в её цвете, движение его иконкой, поиск лупой.
 */
export function activeFilterChips(
	{ query, frequency, movement }: SceneFilters,
	movements: readonly { slug: string; title: string }[],
) {
	return [
		query.trim() && { key: 'query', label: `«${query.trim()}»`, icon: Search, tone: '' },
		frequency !== 'all' && {
			key: 'frequency',
			label: frequencyOf(frequency).label,
			icon: frequencyOf(frequency).icon,
			tone: frequency,
		},
		movement && {
			key: 'movement',
			label: movements.find((m) => m.slug === movement)?.title ?? movement,
			icon: MOVEMENT_ICONS[movement as ElementIcon] ?? '',
			tone: '',
		},
	].filter((f) => f !== false && f !== '')
}

/** Травмы под фильтр по зонам сверху вниз, в порядке индекса главной. */
export function zoneEntries(zones: Zone[], match: (injury: Injury) => boolean) {
	return zones.flatMap((zone) => zone.injuries.filter(match).map((injury) => ({ zone, injury })))
}
