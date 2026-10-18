import { Circle, Diamond, Triangle } from 'lucide-static'

/**
 * Как часто травма встречается в спорте. Уровни общие для всех спортов, уровень травмы
 * задаёт линза спорта, порядок внутри уровня -- `frequencyOrder` спорта (data/sports.ts).
 */
export const FREQUENCIES = [
	{ slug: 'common', label: 'Частые', pill: 'Частая травма', icon: Circle },
	{ slug: 'uncommon', label: 'Нечастые', pill: 'Встречается нечасто', icon: Triangle },
	{ slug: 'rare', label: 'Редкие', pill: 'Редко, но опасно', icon: Diamond },
] as const

export type Frequency = (typeof FREQUENCIES)[number]['slug']

export const FREQUENCY_SLUGS = FREQUENCIES.map((f) => f.slug) as [Frequency, ...Frequency[]]

export const frequencyOf = (slug: Frequency) => FREQUENCIES.find((f) => f.slug === slug)!
