import { Circle, Diamond, Triangle } from 'lucide-static'

/**
 * Как часто травма встречается в спорте. Уровни общие для всех спортов, уровень травмы
 * задаёт линза спорта, порядок внутри уровня -- `frequencyOrder` спорта (data/sports.ts).
 * `hint` -- подсказка к чипу фильтра: откуда уровень берётся, по той же шкале, что в
 * docs/article-template.md.
 */
export const FREQUENCIES = [
	{
		slug: 'common',
		label: 'Частые',
		pill: 'Частая боль',
		icon: Circle,
		hint: 'В исследованиях этого спорта среди самых частых жалоб',
	},
	{
		slug: 'uncommon',
		label: 'Нечастые',
		pill: 'Встречается нечасто',
		icon: Triangle,
		hint: 'В исследованиях этого спорта встречается, но заметно реже частых',
	},
	{
		slug: 'rare',
		label: 'Редкие',
		pill: 'Редко, но опасно',
		icon: Diamond,
		hint: 'Только отдельные описания случаев, но пропускать такое опасно',
	},
] as const

/** Подсказка к чипу «Все». */
export const ALL_FREQUENCIES_HINT = 'Вся боль этого спорта: сначала частая, ниже нечастая и редкая'

export type Frequency = (typeof FREQUENCIES)[number]['slug']

export const FREQUENCY_SLUGS = FREQUENCIES.map((f) => f.slug) as [Frequency, ...Frequency[]]

export const frequencyOf = (slug: Frequency) => FREQUENCIES.find((f) => f.slug === slug)!
