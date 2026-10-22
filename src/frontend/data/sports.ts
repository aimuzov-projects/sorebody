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
 * Удары и игровые ситуации падела по docs/research/padel-injuries-pubmed.md, раздел 4. Бандеха
 * и вибора -- один элемент: в литературе их не разделяют, а травмы у них те же.
 */
const PADEL_ELEMENTS = [
	{ slug: 'smash', title: 'Смэш', titleEn: 'Smash' },
	{ slug: 'bandeja-vibora', title: 'Бандеха и вибора', titleEn: 'Bandeja and víbora' },
	{ slug: 'volley', title: 'Удар с лёта', titleEn: 'Volley' },
	{ slug: 'backhand', title: 'Удар слева', titleEn: 'Backhand' },
	{ slug: 'off-the-glass', title: 'Игра от стекла', titleEn: 'Off-the-glass shot' },
	{ slug: 'sprint-to-ball', title: 'Рывок к мячу', titleEn: 'Sprint to the ball' },
	{ slug: 'lunge', title: 'Выпад к низкому мячу', titleEn: 'Lunge' },
	{ slug: 'jump-landing', title: 'Приземление после прыжка', titleEn: 'Jump landing' },
	{ slug: 'ball-impact', title: 'Попадание мячом', titleEn: 'Ball impact' },
	{ slug: 'glass-collision', title: 'Удар о стекло или сетку', titleEn: 'Glass or net collision' },
	{ slug: 'partner-collision', title: 'Столкновение с партнёром', titleEn: 'Partner collision' },
	{ slug: 'racket-rebound', title: 'Отскок ракетки от стекла', titleEn: 'Racket rebound' },
] as const

export type PadelElement = (typeof PADEL_ELEMENTS)[number]['slug']

/**
 * Игровые действия и ситуации футбола по docs/research/football-injuries-pubmed.md, раздел 4.
 * Отбор и подкат -- один элемент с двумя сторонами: атакуешь сам или атакуют тебя. Падение на руку
 * отдельно от них: игрок часто падает после отбора, но вывих плеча или перелом кисти даёт опора на руку.
 */
const FOOTBALL_ELEMENTS = [
	{ slug: 'kicking', title: 'Удар по мячу', titleEn: 'Kicking' },
	{ slug: 'sprint', title: 'Спринт', titleEn: 'Sprint' },
	{ slug: 'change-of-direction', title: 'Резкая смена направления', titleEn: 'Change of direction' },
	{ slug: 'deceleration', title: 'Торможение', titleEn: 'Deceleration' },
	{ slug: 'tackle', title: 'Единоборство и подкат', titleEn: 'Tackle' },
	{ slug: 'heading', title: 'Игра головой', titleEn: 'Heading' },
	{ slug: 'jump-landing', title: 'Приземление после прыжка', titleEn: 'Jump landing' },
	{ slug: 'collision', title: 'Столкновение', titleEn: 'Collision' },
	{ slug: 'ball-impact', title: 'Попадание мячом', titleEn: 'Ball impact' },
	{ slug: 'goalkeeping', title: 'Вратарские действия', titleEn: 'Goalkeeping' },
	{ slug: 'fall', title: 'Падение на руку', titleEn: 'Fall on an outstretched arm' },
] as const

export type FootballElement = (typeof FOOTBALL_ELEMENTS)[number]['slug']

/**
 * Нагрузки и условия бега по docs/research/running-injuries-pubmed.md, раздел «Элементы». У бега одно
 * движение, поэтому элемент -- не техника, а то, что меняет нагрузку: объём, скорость, рельеф, грунт,
 * обувь, погода. Длинная пробежка входит в рост объёма, виражей стадиона нет: по ним нет работ о травмах.
 */
const RUNNING_ELEMENTS = [
	{ slug: 'mileage-spike', title: 'Резкий рост объёма', titleEn: 'Mileage spike' },
	{ slug: 'speed-work', title: 'Интервалы и скорость', titleEn: 'Speed work' },
	{ slug: 'uphill', title: 'Бег в гору', titleEn: 'Uphill running' },
	{ slug: 'downhill', title: 'Бег под гору', titleEn: 'Downhill running' },
	{ slug: 'trail', title: 'Трейл и неровный грунт', titleEn: 'Trail and uneven ground' },
	{ slug: 'race', title: 'Забег и марафон', titleEn: 'Race and marathon' },
	{ slug: 'heat', title: 'Жара и влажность', titleEn: 'Heat and humidity' },
	{ slug: 'footwear-change', title: 'Смена обуви', titleEn: 'Footwear change' },
	{ slug: 'overstriding', title: 'Длинный шаг и низкий каденс', titleEn: 'Overstriding and low cadence' },
] as const

export type RunningElement = (typeof RUNNING_ELEMENTS)[number]['slug']

/**
 * Движения и игровые ситуации баскетбола по docs/research/basketball-injuries-pubmed.md, раздел
 * «Элементы». Приземление, смена направления, остановка, контакт, мяч и падение -- общие с паделом
 * и футболом. Защитные приставные шаги входят в смену направления, уличной площадки нет: по ней
 * нет работ о травмах.
 */
const BASKETBALL_ELEMENTS = [
	{ slug: 'jump-landing', title: 'Приземление после прыжка', titleEn: 'Jump landing' },
	{ slug: 'landing-on-foot', title: 'Приземление на стопу соперника', titleEn: "Landing on an opponent's foot" },
	{ slug: 'change-of-direction', title: 'Резкая смена направления', titleEn: 'Change of direction' },
	{ slug: 'deceleration', title: 'Резкая остановка', titleEn: 'Hard stop' },
	{ slug: 'drive', title: 'Проход под кольцо', titleEn: 'Drive to the basket' },
	{ slug: 'collision', title: 'Контакт под кольцом и заслоны', titleEn: 'Contact under the basket' },
	{ slug: 'ball-impact', title: 'Мяч в пальцы', titleEn: 'Ball to the fingers' },
	{ slug: 'elbow-to-face', title: 'Локоть или рука в лицо', titleEn: 'Elbow or hand to the face' },
	{ slug: 'fall', title: 'Падение на паркет', titleEn: 'Fall on the court' },
	{ slug: 'congested-schedule', title: 'Плотный календарь', titleEn: 'Congested schedule' },
] as const

export type BasketballElement = (typeof BASKETBALL_ELEMENTS)[number]['slug']

/**
 * Ситуации и нагрузки хайкинга по docs/research/hiking-injuries-pubmed.md, раздел «Элементы». Как
 * у бега, элемент -- не техника шага, а то, что происходит на маршруте: рельеф, рюкзак, погода,
 * высота, обувь. Треккинговые палки -- не элемент, а профилактика в линзах.
 */
const HIKING_ELEMENTS = [
	{ slug: 'descent', title: 'Долгий спуск', titleEn: 'Long descent' },
	{ slug: 'ascent', title: 'Крутой подъём', titleEn: 'Steep ascent' },
	{ slug: 'backpack', title: 'Тяжёлый рюкзак', titleEn: 'Heavy backpack' },
	{ slug: 'rocky-terrain', title: 'Камни, осыпь, неровная тропа', titleEn: 'Rocky and uneven terrain' },
	{ slug: 'fall', title: 'Поскользнулся или упал', titleEn: 'Slip or fall' },
	{ slug: 'multi-day', title: 'Многодневный поход', titleEn: 'Multi-day trek' },
	{ slug: 'altitude', title: 'Высота выше 2500 м', titleEn: 'Altitude above 2500 m' },
	{ slug: 'heat', title: 'Жара', titleEn: 'Heat' },
	{ slug: 'cold', title: 'Холод, ветер и дождь', titleEn: 'Cold, wind and rain' },
	{ slug: 'new-boots', title: 'Новые или неподходящие ботинки', titleEn: 'New or ill-fitting boots' },
] as const

export type HikingElement = (typeof HIKING_ELEMENTS)[number]['slug']

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
	'neck-strain',
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

/**
 * Травмы падела от частых к редким, уровни -- из таблицы диагнозов (раздел 3) и пилота (раздел 5)
 * в docs/research/padel-injuries-pubmed.md.
 */
const PADEL_FREQUENCY_ORDER = [
	// Частые
	'elbow-tendinopathy',
	'ankle-sprain',
	'tennis-leg',
	'rotator-cuff-tendinopathy',
	'patellofemoral-pain',
	'low-back-strain',
	'neck-strain',
	// Нечастые
	'plantar-fasciitis',
	'achilles-tendinopathy',
	'fall-contusions',
	'eye-injury',
	'wrist-sprain',
	// Редкие
	'orofacial-trauma',
]

/**
 * Травмы футбола от частых к редким, уровни -- из таблицы диагнозов (раздел 3), пилота (раздел 5)
 * и второй волны (раздел 5а) в docs/research/football-injuries-pubmed.md. Внутри уровня -- по доле
 * в таблице диагнозов Ekstrand 2020 (62% травм -- UEFA ECIS), диагнозы ниже её порога -- по доле
 * от всех травм в когортах с медицинской регистрацией.
 */
const FOOTBALL_FREQUENCY_ORDER = [
	// Частые
	'hamstring-strain',
	'fall-contusions',
	'adductor-groin-pain',
	'ankle-sprain',
	'muscle-strains',
	'mcl-sprain',
	// Нечастые
	'low-back-strain',
	'achilles-tendinopathy',
	'concussion',
	'patellofemoral-pain',
	'acl-tear',
	'meniscus-tear',
	'shoulder-dislocation',
	'hand-finger-injuries',
	'fifth-metatarsal-fracture',
	'lower-leg-fracture',
	'achilles-tendon-rupture',
	'lower-limb-stress-fractures',
	// Редкие
	'orofacial-trauma',
	'eye-injury',
	'femoroacetabular-impingement',
	'proximal-hamstring-avulsion',
]

/**
 * Травмы бега от частых к редким, уровни и порядок -- по правилу уровня в
 * docs/research/running-injuries-pubmed.md: доля в проспективном пуле Kakouris 2021 (частые -- 5%
 * и больше, нечастые -- есть строка, но меньше), редкие -- только медпункты забегов и серии случаев.
 */
const RUNNING_FREQUENCY_ORDER = [
	// Частые
	'achilles-tendinopathy',
	'medial-tibial-stress-syndrome',
	'patellofemoral-pain',
	'plantar-fasciitis',
	'ankle-sprain',
	'iliotibial-band-syndrome',
	// Кожу беговые обзоры не считают, строки у Kakouris нет: уровень -- по любителям и трейлу, в конце
	// частых, см. «Спорные уровни» в docs/research/running-injuries-pubmed.md
	'foot-blisters',
	// Нечастые
	'greater-trochanteric-pain-syndrome',
	'meniscus-tear',
	'muscle-strains',
	'lower-limb-stress-fractures',
	'hamstring-strain',
	'low-back-strain',
	// Редкие
	'exertional-heat-illness',
	'exercise-associated-hyponatremia',
	'exertional-rhabdomyolysis',
	'popliteus-tendinopathy',
]

/**
 * Травмы баскетбола от частых к редким по правилу уровня в docs/research/basketball-injuries-pubmed.md:
 * частые -- от 3% всех травм отдельной строкой в медкарте НБА (Mack 2025) или у студентов Division I,
 * нечастые -- доля или частота в когорте с медицинской регистрацией, редкие -- публичные данные,
 * серии случаев и регистры смертей. Внутри уровня -- по доле в таблице Mack.
 */
const BASKETBALL_FREQUENCY_ORDER = [
	// Частые
	'ankle-sprain',
	'low-back-strain',
	'fall-contusions',
	'concussion',
	// Нечастые
	'hamstring-strain',
	'patellofemoral-pain',
	'adductor-groin-pain',
	'orofacial-trauma',
	'achilles-tendinopathy',
	'mcl-sprain',
	'neck-strain',
	'finger-sprains',
	'meniscus-tear',
	'hand-finger-injuries',
	'acl-tear',
	'eye-injury',
	'lower-limb-stress-fractures',
	'fifth-metatarsal-fracture',
	// Редкие
	'achilles-tendon-rupture',
	'sudden-cardiac-arrest',
]

/**
 * Травмы хайкинга от частых к редким по двухтрековому правилу в docs/research/hiking-injuries-pubmed.md:
 * опросы туристов (частые -- от 10% туристов в двух когортах) и регистр Альпийской полиции Австрии
 * (частые -- от 25% локализаций или типов травм, нечастые -- от 5%). Редкие -- смерти, спасения,
 * медпункты парков и военные данные. Внутри уровня сначала цифра по самому диагнозу или месту, потом
 * по широкой категории; высотная болезнь -- последней среди частых, она про ночёвки выше 2500 м.
 */
const HIKING_FREQUENCY_ORDER = [
	// Частые
	'foot-blisters',
	'ankle-sprain',
	'fall-contusions',
	'acute-altitude-illness',
	// Нечастые
	'concussion',
	'lower-leg-fracture',
	'meralgia-paresthetica',
	'low-back-strain',
	'wrist-sprain',
	'patellofemoral-pain',
	// Редкие
	'sudden-cardiac-arrest',
	'hypothermia',
	'exertional-heat-illness',
	'exercise-associated-hyponatremia',
	'frostbite',
	'rucksack-palsy',
]

type SportElement = { slug: string; title: string; titleEn: string }

/** Slug спортов списком: новый спорт добавляется сюда и в `SPORTS`. */
export type SportSlug = 'crossfit' | 'padel' | 'football' | 'running' | 'basketball' | 'hiking'

export type Sport = {
	slug: SportSlug
	title: string
	/** Готовая фраза для заголовков, падежи не генерируются: «Травмы в кроссфите», «Как часто в кроссфите». */
	phrase: string
	/** Подпись фильтра по элементам: «Движение любое». */
	elementLabel: string
	/** Заголовок списка элементов в конце статьи: «Связанные движения». */
	elementsTitle: string
	/** Элемент в предложном падеже для описания его страницы: «травмы на движении «Бёрпи»». */
	elementOn: string
	/** `meta description` главной спорта. */
	description: string
	/** Заголовок раздела о механизме в статье спорта. */
	mechanismTitle: string
	/** Техники или ситуации спорта: варианты фильтра и страницы `/<sport>/elements/<slug>`. */
	elements: readonly SportElement[]
	/** Slug травм от частых к редким. */
	frequencyOrder: readonly string[]
	/**
	 * Цвет спорта: `light` и `dark` -- `--accent` в светлой и тёмной теме (styles/global.css
	 * повторяет их в блоке `[data-sport]`, сверяет тест), `onLight` и `onDark` -- цифры на заливке
	 * этим цветом, `glow` -- подсветка кожи на модели.
	 */
	accent: { light: string; dark: string; onLight: string; onDark: string; glow: string }
}

export const SPORTS = [
	{
		slug: 'crossfit',
		title: 'Кроссфит',
		phrase: 'в кроссфите',
		elementLabel: 'Движение',
		elementsTitle: 'Связанные движения',
		elementOn: 'на движении',
		description:
			'Справочник боли в кроссфите: как часто случаются, симптомы, когда к врачу и как адаптировать тренировки — со ссылками на исследования.',
		mechanismTitle: 'Механизм и движения',
		elements: CROSSFIT_ELEMENTS,
		frequencyOrder: CROSSFIT_FREQUENCY_ORDER,
		accent: { light: '#0066cc', dark: '#2997ff', onLight: '#ffffff', onDark: '#ffffff', glow: '#3d8bfd' },
	},
	{
		slug: 'padel',
		title: 'Падел',
		phrase: 'в паделе',
		elementLabel: 'Удар или действие',
		elementsTitle: 'Удары и действия',
		elementOn: 'на элементе',
		description:
			'Справочник боли в паделе: как часто случаются, симптомы, когда к врачу и как изменить игру и тренировки — со ссылками на исследования.',
		mechanismTitle: 'Механизм и удары',
		elements: PADEL_ELEMENTS,
		frequencyOrder: PADEL_FREQUENCY_ORDER,
		// Лайм: светлый -- 5.5:1 на белом и 4.5:1 на серой заливке чипов, тёмный -- 12:1 на фоне
		// тёмной темы, цифры на нём тоже тёмные. По тону далеко и от бирюзы частых травм, и от
		// красного «опасно»
		accent: { light: '#467509', dark: '#a3e635', onLight: '#ffffff', onDark: '#161617', glow: '#84cc16' },
	},
	{
		slug: 'football',
		title: 'Футбол',
		phrase: 'в футболе',
		elementLabel: 'Действие',
		elementsTitle: 'Игровые действия',
		elementOn: 'на действии',
		description:
			'Справочник боли в футболе: как часто случаются, симптомы, когда к врачу и как изменить игру и тренировки — со ссылками на исследования.',
		mechanismTitle: 'Механизм и игровые действия',
		elements: FOOTBALL_ELEMENTS,
		frequencyOrder: FOOTBALL_FREQUENCY_ORDER,
		// Зелёный газона: светлый -- 7:1 на белом и 6.5:1 на серой заливке чипов, тёмный -- 9:1 на фоне
		// тёмной темы, цифры на нём тёмные. Тон сдвинут к бирюзе дальше лайма падела, но светлота
		// и насыщенность не дают спутать его с бирюзой частых травм
		accent: { light: '#0a6640', dark: '#30d18a', onLight: '#ffffff', onDark: '#161617', glow: '#22c07a' },
	},
	{
		slug: 'running',
		title: 'Бег',
		phrase: 'в беге',
		elementLabel: 'Нагрузка или условие',
		elementsTitle: 'Нагрузки и условия',
		elementOn: 'при нагрузке',
		description:
			'Справочник боли в беге: как часто случаются, симптомы, когда к врачу и как изменить бег и тренировки — со ссылками на исследования.',
		mechanismTitle: 'Механизм и нагрузки',
		elements: RUNNING_ELEMENTS,
		frequencyOrder: RUNNING_FREQUENCY_ORDER,
		// Оранжевый: светлый -- 5.6:1 на белом и 5.2:1 на серой заливке чипов, AA держит и плашка
		// ссылки; тёмный -- 8:1 на фоне тёмной темы, цифры на нём тёмные. От красного «опасно»
		// отходит по тону к жёлтому, от остальных спортов далеко
		accent: { light: '#a84d08', dark: '#fb923c', onLight: '#ffffff', onDark: '#161617', glow: '#f97316' },
	},
	{
		slug: 'basketball',
		title: 'Баскетбол',
		phrase: 'в баскетболе',
		elementLabel: 'Движение или ситуация',
		elementsTitle: 'Движения и ситуации',
		elementOn: 'в ситуации',
		description:
			'Справочник боли в баскетболе: как часто случаются, симптомы, когда к врачу и как изменить игру и тренировки — со ссылками на исследования.',
		mechanismTitle: 'Механизм и игровые ситуации',
		elements: BASKETBALL_ELEMENTS,
		frequencyOrder: BASKETBALL_FREQUENCY_ORDER,
		// Фиолетовый: оранжевый мяча уже у бега. Светлый -- 7:1 на белом и 6.5:1 на серой заливке чипов,
		// тёмный -- почти 10:1 на фоне тёмной темы, цифры на нём тёмные. От индиго нечастых и пурпура
		// редких отходит дальше 0.09 в OKLab, от синего кроссфита -- на 0.15
		accent: { light: '#6d28d9', dark: '#c4b5fd', onLight: '#ffffff', onDark: '#161617', glow: '#a855f7' },
	},
	{
		slug: 'hiking',
		title: 'Хайкинг',
		phrase: 'в хайкинге',
		elementLabel: 'Ситуация или нагрузка',
		elementsTitle: 'Ситуации и нагрузки',
		elementOn: 'в ситуации',
		description:
			'Справочник боли в хайкинге и горных походах: как часто случается, симптомы, когда к врачу и как изменить поход — со ссылками на исследования.',
		mechanismTitle: 'Механизм и ситуации',
		elements: HIKING_ELEMENTS,
		frequencyOrder: HIKING_FREQUENCY_ORDER,
		// Землисто-коричневый, цвет тропы. Светлый -- 9:1 на белом и 8.3:1 на серой заливке чипов,
		// тёмный -- 7.7:1 на фоне тёмной темы, цифры на нём тёмные. От оранжевого бега отходит на 0.12
		// в OKLab в светлой теме и на 0.095 в тёмной, от красного «опасно» -- на 0.15
		accent: { light: '#78350f', dark: '#c9a27e', onLight: '#ffffff', onDark: '#161617', glow: '#a3622a' },
	},
] as const satisfies readonly Sport[]

/** Спорт, который открывает `/`: ссылки на его сцену ведут сюда, а не на `/<sport>/`. */
export const DEFAULT_SPORT: SportSlug = 'crossfit'

export const sportOf = (slug: SportSlug): Sport => SPORTS.find((s) => s.slug === slug)!

/** Сцена спорта: у спорта по умолчанию -- главная. */
export const sportHome = (slug: SportSlug) => (slug === DEFAULT_SPORT ? '/' : `/${slug}/`)

export const sportArticle = (slug: SportSlug, injury: string) => `/${slug}/${injury}/`

/**
 * Props селекта «Разбор ‹в …›» статьи (components/sport-switch.svelte). Одна сборка на страницу статьи
 * и заготовку ридера: заготовка рисует тот же селект, иначе при подмене строка мигала. Спорт один --
 * селекта нет.
 */
export function sportSwitchProps(sports: readonly SportSlug[], current: SportSlug, injury: string) {
	if (sports.length < 2) return undefined

	return {
		sports: sports.map((slug) => ({
			slug,
			title: sportOf(slug).title,
			phrase: sportOf(slug).phrase,
			href: sportArticle(slug, injury),
		})),
		value: current,
		size: 'lead' as const,
	}
}

export const sportElement = (slug: SportSlug, element: string) => `/${slug}/elements/${element}/`

/** Место травмы в порядке частоты спорта; травмы не из списка -- в конец. */
export function frequencyRank(sport: Sport, injury: string) {
	const rank = sport.frequencyOrder.indexOf(injury)

	return rank === -1 ? sport.frequencyOrder.length : rank
}
