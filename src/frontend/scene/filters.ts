import { Search } from 'lucide-static'

import { frequencyOf, type Frequency } from '#frontend/data/frequency.ts'
import { MOVEMENT_ICONS, type ElementIcon } from '#frontend/data/movement-icons.ts'

import type { Zone } from './zones.ts'

type Injury = Zone['injuries'][number]

/** Текст для поиска: тексты набраны с неразрывными пробелами, а в запросе пробелы обычные. */
const normalize = (s: string) => s.toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ').trim()

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

/**
 * Зона, которую можно подсветить на модели: под фильтры в ней осталась хотя бы одна травма.
 * Пустую зону не выделяем ни с её строки, ни с точки: иначе модель показывает место, где
 * смотреть нечего.
 */
export function litZone<Z>(zone: Z | null, counts: ReadonlyMap<Z, number>): Z | null {
	return zone && (counts.get(zone) ?? 0) > 0 ? zone : null
}

const EN_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`"
const RU_KEYS = 'йцукенгшщзхъфывапролджэячсмитьбюё'
const SWAP = new Map([...EN_KEYS].flatMap((en, i) => [[en, RU_KEYS[i]!] as const, [RU_KEYS[i]!, en] as const]))

/**
 * Запрос, набранный не в той раскладке: «rjktyj» -> «колено», «ащще» -> «foot». Каждую клавишу
 * меняем на соседку по раскладке. Нечего менять -- пустая строка.
 */
export function swapLayout(query: string) {
	const q = normalize(query)
	const swapped = [...q].map((ch) => SWAP.get(ch) ?? ch).join('')

	return swapped === q ? '' : swapped
}

type Entry = ReturnType<typeof zoneEntries>[number]

/**
 * Чем помочь, когда запрос ничего не нашёл. Сначала -- раскладка: запрос в соседней что-то
 * находит, показываем это. Потом -- фильтры: без частоты и движения нашлось бы `count`. Иначе --
 * частые травмы спорта, чтобы было куда пойти.
 */
export type EmptySearch =
	| { kind: 'layout'; query: string; results: Entry[] }
	| { kind: 'filters'; count: number }
	| { kind: 'none'; suggestions: Entry[] }

export function emptySearch(zones: Zone[], filters: SceneFilters, suggest = 6): EmptySearch {
	const find = (f: SceneFilters) => zoneEntries(zones, (injury) => matchesFilters(injury, f))
	const swapped = swapLayout(filters.query)

	if (swapped) {
		const results = find({ ...filters, query: swapped })

		if (results.length) return { kind: 'layout', query: swapped, results }
	}

	const loose = Math.max(
		...[filters.query, swapped]
			.filter(Boolean)
			.map((query) => find({ query, frequency: 'all', movement: '' }).length),
	)

	if (loose) return { kind: 'filters', count: loose }

	// Травма в двух зонах (голеностоп и стопа) попала бы в подсказки дважды
	const seen = new Set<string>()
	const suggestions = zoneEntries(zones, (injury) => injury.frequency === 'common').filter(
		({ injury }) => !seen.has(injury.slug) && seen.add(injury.slug),
	)

	return { kind: 'none', suggestions: suggestions.slice(0, suggest) }
}
