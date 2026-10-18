import { Circle, Diamond, Triangle } from 'lucide-static'

/**
 * Как часто травма встречается в кроссфите. Уровень и порядок -- из таблицы диагнозов
 * в docs/research/crossfit-injuries-pubmed.md: частые -- там "очень часто" и "часто",
 * нечастые -- "нередко" и "нечасто", редкие -- только описания случаев.
 */
export const FREQUENCIES = [
	{ slug: 'common', label: 'Частые', pill: 'Частая травма', icon: Circle },
	{ slug: 'uncommon', label: 'Нечастые', pill: 'Встречается нечасто', icon: Triangle },
	{ slug: 'rare', label: 'Редкие', pill: 'Редко, но опасно', icon: Diamond },
] as const

export type Frequency = (typeof FREQUENCIES)[number]['slug']

export const FREQUENCY_SLUGS = FREQUENCIES.map((f) => f.slug) as [Frequency, ...Frequency[]]

export const frequencyOf = (slug: Frequency) => FREQUENCIES.find((f) => f.slug === slug)!

/**
 * Все травмы от самой частой к самой редкой: в этом порядке они стоят в списках зон.
 * Уровни идут подряд, это проверяет тест контента.
 */
export const FREQUENCY_ORDER = [
	// Частые
	'rotator-cuff-tendinopathy',
	'subacromial-impingement',
	'low-back-strain',
	'muscle-strains',
	'patellofemoral-pain',
	'wrist-sprain',
	'hand-rips',
	'stress-urinary-incontinence',
	// Нечастые
	'labral-tear-slap',
	'subscapularis-biceps-pulley',
	'lumbar-disc-herniation',
	'elbow-tendinopathy',
	'fall-contusions',
	'meniscus-tear',
	'ankle-sprain',
	'femoroacetabular-impingement',
	'hamstring-strain',
	'inguinal-hernia',
	'iliotibial-band-syndrome',
	'orofacial-trauma',
	// Редкие
	'exertional-rhabdomyolysis',
	'acl-tear',
	'achilles-tendon-rupture',
	'distal-biceps-rupture',
	'proximal-hamstring-avulsion',
	'compartment-syndrome',
	'pectoralis-major-rupture',
	'latissimus-dorsi-tear',
	'upper-limb-stress-fractures',
	'cervical-artery-dissection',
	'paget-schroetter-syndrome',
	'meralgia-paresthetica',
]

/** Место травмы в `FREQUENCY_ORDER`; травмы не из списка -- в конец. */
export function frequencyRank(slug: string) {
	const rank = FREQUENCY_ORDER.indexOf(slug)

	return rank === -1 ? FREQUENCY_ORDER.length : rank
}
