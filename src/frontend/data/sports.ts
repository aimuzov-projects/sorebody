/**
 * Виды спорта. Травма описана один раз (`content/injuries`), спорт добавляет к ней линзу
 * (`content/sports/<slug>`): частоту, элементы, адаптацию тренировок. Здесь -- то, что у спорта
 * своё: фраза для заголовков, список элементов для фильтра, порядок травм по частоте и цвет.
 */

/**
 * Движения кроссфита, на которых травмы случаются чаще всего. Линза ссылается на них по slug,
 * страница `/crossfit/elements/<slug>` собирает травмы движения.
 */
const CROSSFIT_ELEMENTS = [
	{ slug: 'squat', title: 'Приседания со штангой', titleEn: 'Back/front squat' },
	{ slug: 'deadlift', title: 'Становая тяга', titleEn: 'Deadlift' },
	{ slug: 'hip-thrust', title: 'Ягодичный мост со штангой', titleEn: 'Barbell hip thrust' },
	{ slug: 'snatch', title: 'Рывок', titleEn: 'Snatch' },
	{ slug: 'clean-and-jerk', title: 'Взятие на грудь и толчок', titleEn: 'Clean and jerk' },
	{ slug: 'overhead-press', title: 'Жимы и швунги над головой', titleEn: 'Press, push press, push jerk' },
	{ slug: 'thruster', title: 'Трастеры', titleEn: 'Thruster' },
	{ slug: 'bench-press', title: 'Жим лёжа', titleEn: 'Bench press' },
	{ slug: 'kipping-pull-up', title: 'Подтягивания с кипом', titleEn: 'Kipping pull-up' },
	{ slug: 'muscle-up', title: 'Выход силой', titleEn: 'Muscle-up' },
	{ slug: 'ring-dip', title: 'Отжимания на кольцах', titleEn: 'Ring dip' },
	{ slug: 'handstand-push-up', title: 'Отжимания в стойке на руках', titleEn: 'Handstand push-up' },
	{ slug: 'toes-to-bar', title: 'Ноги к перекладине', titleEn: 'Toes-to-bar' },
	{ slug: 'box-jump', title: 'Прыжки на тумбу', titleEn: 'Box jump' },
	{ slug: 'double-unders', title: 'Двойные прыжки через скакалку', titleEn: 'Double-unders' },
	{ slug: 'running', title: 'Бег', titleEn: 'Running' },
	{ slug: 'rowing', title: 'Гребля', titleEn: 'Rowing' },
	{ slug: 'wall-ball', title: 'Броски мяча в цель', titleEn: 'Wall ball' },
	{ slug: 'kettlebell-swing', title: 'Махи гирей', titleEn: 'Kettlebell swing' },
	{ slug: 'burpee', title: 'Бёрпи', titleEn: 'Burpee' },
] as const

export type CrossfitElement = (typeof CROSSFIT_ELEMENTS)[number]['slug']

/**
 * Все травмы кроссфита от самой частой к самой редкой: в этом порядке они стоят в списках зон.
 * Уровень и порядок -- из таблицы диагнозов в docs/research/crossfit-injuries-pubmed.md:
 * частые -- там "очень часто" и "часто", нечастые -- "нередко" и "нечасто", редкие -- только
 * описания случаев. Уровни идут подряд, это проверяет тест контента.
 */
const CROSSFIT_FREQUENCY_ORDER = [
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

export type SportElement = { slug: string; title: string; titleEn: string }

/** Slug спортов списком: новый спорт добавляется сюда и в `SPORTS`. */
export type SportSlug = 'crossfit'

export type Sport = {
	slug: SportSlug
	title: string
	/** Готовая фраза для заголовков, падежи не генерируются: «Травмы в кроссфите», «Как часто в кроссфите». */
	phrase: string
	/** Подпись фильтра по элементам: «Движение любое». */
	elementLabel: string
	/** Заголовок раздела о механизме в статье спорта. */
	mechanismTitle: string
	/** Техники или ситуации спорта: варианты фильтра и страницы `/<sport>/elements/<slug>`. */
	elements: readonly SportElement[]
	/** Slug травм от частых к редким. */
	frequencyOrder: readonly string[]
	/**
	 * Цвет спорта: `light` и `dark` -- `--accent` в светлой и тёмной теме (styles/global.css
	 * повторяет их в блоке `[data-sport]`, сверяет тест), `glow` -- подсветка кожи на модели.
	 */
	accent: { light: string; dark: string; glow: string }
}

export const SPORTS = [
	{
		slug: 'crossfit',
		title: 'Кроссфит',
		phrase: 'в кроссфите',
		elementLabel: 'Движение',
		mechanismTitle: 'Механизм и движения',
		elements: CROSSFIT_ELEMENTS,
		frequencyOrder: CROSSFIT_FREQUENCY_ORDER,
		accent: { light: '#0066cc', dark: '#2997ff', glow: '#3d8bfd' },
	},
] as const satisfies readonly Sport[]

/** Спорт, который открывает `/`. Пока спорт один, его страницы и ссылки живут от корня. */
export const DEFAULT_SPORT: SportSlug = 'crossfit'

export const sportOf = (slug: SportSlug): Sport => SPORTS.find((s) => s.slug === slug)!

/** Сцена спорта: у спорта по умолчанию -- главная. */
export const sportHome = (slug: SportSlug) => (slug === DEFAULT_SPORT ? '/' : `/${slug}/`)

export const sportArticle = (slug: SportSlug, injury: string) => `/${slug}/${injury}/`

export const sportElement = (slug: SportSlug, element: string) => `/${slug}/elements/${element}/`

/** Место травмы в порядке частоты спорта; травмы не из списка -- в конец. */
export function frequencyRank(sport: Sport, injury: string) {
	const rank = sport.frequencyOrder.indexOf(injury)

	return rank === -1 ? sport.frequencyOrder.length : rank
}
