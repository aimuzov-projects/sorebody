import type { Frequency } from '#frontend/data/frequency.ts'
import { REGIONS, type Region } from '#frontend/data/regions.ts'
import { frequencyRank, type Sport } from '#frontend/data/sports.ts'
import type { Box } from '#frontend/scene/frame.ts'

type Vec3 = [number, number, number]

/** Ракурс камеры, градусы: азимут от лица (+Z) к левому боку (+X), полярный угол от вертикали. */
type View = { azimuth: number; polar: number }

type Point = { position: Vec3; normal: Vec3; view: View }

export type Zone = {
	slug: Region
	label: string
	/** Радиус сферы растворения, метры модели. */
	radius: number
	/**
	 * Точки зоны на модели: обе стороны тела у парных зон. `normal` -- куда точка "смотрит",
	 * `view` -- ракурс, с которого раскрытая зона видна целиком и не перекрыта рукой или телом.
	 */
	points: Point[]
	injuries: ZoneInjury[]
}

/** Травма в списке зоны: хватает для поиска, фильтров и строки списка. */
type ZoneInjury = {
	slug: string
	title: string
	titleEn: string
	summary: string
	frequency: Frequency
	movements: string[]
}

/**
 * Центры суставов в координатах `public/model/body.glb`: метры, Y вверх, лицо к +Z, правая сторона
 * тела на -X. Посчитаны скриптом сборки модели по костям BodyParts3D (головка плечевой, дистальный
 * эпифиз плечевой, кости запястья, L1–L5, головка бедренной, надколенник, таранная). Голова и
 * голень -- по костям фигуры `body.glb`: центр черепа с нижней челюстью и середина большеберцовой
 * и малоберцовой между коленом и лодыжкой.
 * Ракурсы подобраны по снимкам: плечо и таз спереди-сбоку, локоть и кисть сбоку, чтобы их
 * не закрывало туловище, поясница сзади, голеностоп чуть сверху, голова спереди, голень сзади-сбоку --
 * со стороны икры.
 */
export const ANCHORS: Record<Exclude<Region, 'other'>, { radius: number; points: Point[] }> = {
	head: {
		radius: 0.12,
		points: [{ position: [0, 1.6, 0], normal: [0, 0, 1], view: { azimuth: 20, polar: 82 } }],
	},
	shoulder: { radius: 0.13, points: pair([0.165, 1.39, -0.024], 1, 0.3, { azimuth: 40, polar: 70 }) },
	elbow: { radius: 0.06, points: pair([0.21, 1.127, -0.033], 1, -0.2, { azimuth: 95, polar: 74 }) },
	'wrist-hand': { radius: 0.1, points: pair([0.25, 0.874, 0.021], 1, 0.3, { azimuth: 70, polar: 74 }) },
	lumbar: {
		radius: 0.15,
		points: [{ position: [0, 1.066, -0.034], normal: [0, 0, -1], view: { azimuth: 160, polar: 76 } }],
	},
	'hip-groin': { radius: 0.12, points: pair([0.107, 0.882, -0.025], 0.6, 1, { azimuth: 35, polar: 76 }) },
	knee: { radius: 0.085, points: pair([0.081, 0.459, 0.011], 0.4, 1, { azimuth: 25, polar: 76 }) },
	shin: { radius: 0.11, points: pair([0.09, 0.273, -0.028], 1, -0.6, { azimuth: 125, polar: 76 }) },
	'ankle-foot': { radius: 0.09, points: pair([0.07, 0.064, -0.024], 0.5, 1, { azimuth: 40, polar: 62 }) },
}

/**
 * Левая точка по данным и зеркальная правая; нормаль -- наружу вбок (`side`) и вперёд (`front`),
 * ракурс правой точки -- с зеркальным азимутом.
 */
function pair([x, y, z]: Vec3, side: number, front: number, view: View) {
	const len = Math.hypot(side, front)

	return [1, -1].map((s) => ({
		position: [s * x, y, z] as Vec3,
		normal: [(s * side) / len, 0, front / len] as Vec3,
		view: { azimuth: s * view.azimuth, polar: view.polar },
	}))
}

/** Коробка вокруг точек зоны, с полями `pad` метров. */
function anchorBox(region: Exclude<Region, 'other'>, pad: number): Box {
	const { points } = ANCHORS[region]
	const axis = (i: number, f: (...n: number[]) => number) => f(...points.map((p) => p.position[i]))
	const corner = (f: (...n: number[]) => number, d: number): Vec3 => [0, 1, 2].map((i) => axis(i, f) + d) as Vec3

	return { min: corner(Math.min, -pad), max: corner(Math.max, pad) }
}

/** Голова целиком (сфера растворения зоны) и обе точки стопы: по ним встаёт подсказка первого визита. */
export const HEAD_BOX = anchorBox('head', ANCHORS.head.radius)
export const ANKLES_BOX = anchorBox('ankle-foot', 0)

/** "Всё тело": растворение от груди на всю фигуру, вид спереди в три четверти. */
const WHOLE = {
	radius: 1.3,
	points: [{ position: [0, 1.25, 0.05] as Vec3, normal: [0, 0, 1] as Vec3, view: { azimuth: 25, polar: 76 } }],
}

/**
 * Зоны фигуры с травмами спорта, внутри зоны -- от частых к редким по его `frequencyOrder`. Зон без
 * травм спорта на его странице нет: голова паделу нужна, кроссфиту -- нет. Регион `other` своего
 * сустава не имеет: он становится `whole`, растворением всей фигуры от груди.
 */
export function buildZones(sport: Sport, injuries: (ZoneInjury & { region: Region })[]) {
	const byRegion = (slug: Region) =>
		injuries
			.filter((i) => i.region === slug)
			.map(({ region: _region, ...injury }) => injury)
			.sort(
				(a, b) =>
					frequencyRank(sport, a.slug) - frequencyRank(sport, b.slug) || a.title.localeCompare(b.title, 'ru'),
			)
	const zones: Zone[] = REGIONS.filter((r) => r.slug !== 'other')
		.map((r) => ({
			slug: r.slug,
			label: r.label,
			...ANCHORS[r.slug as Exclude<Region, 'other'>],
			injuries: byRegion(r.slug),
		}))
		.filter((zone) => zone.injuries.length > 0)
	const other = REGIONS.find((r) => r.slug === 'other')!
	const whole: Zone = { slug: other.slug, label: other.label, ...WHOLE, injuries: byRegion(other.slug) }

	return { zones, whole }
}

/**
 * Где внутри зоны сама травма. Смещение от центра зоны в метрах модели, для левой точки
 * (+X -- наружу); у правой зеркалится. `normal` и `view` -- если с ракурса зоны место не видно,
 * `zoom` -- во сколько раз ближе кадра зоны. Травмы без записи наезжают на центр зоны.
 */
const INJURY_FOCUS: Record<string, { offset: Vec3; normal?: Vec3; view?: View; zoom?: number }> = {
	// Колено: надколенник спереди, ПКС в центре сустава, мениск -- по суставной щели изнутри, ИТТ -- снаружи
	'patellofemoral-pain': { offset: [0, 0.02, 0.05], normal: [0.2, 0, 1], view: { azimuth: 12, polar: 78 } },
	'acl-tear': { offset: [0, 0, 0], zoom: 2 },
	'meniscus-tear': { offset: [-0.035, -0.015, 0.015], normal: [-0.3, 0, 1], view: { azimuth: 0, polar: 78 } },
	'iliotibial-band-syndrome': { offset: [0.045, 0.02, 0], normal: [1, 0, 0], view: { azimuth: 80, polar: 78 } },
	// Плечо: манжета и акромион сверху, ключица и подключичная вена спереди, лопатка сзади
	'subacromial-impingement': { offset: [0, 0.045, 0.005], normal: [0.4, 1, 0.3] },
	'rotator-cuff-tendinopathy': { offset: [-0.02, 0.05, -0.015], normal: [0.2, 1, -0.2] },
	'labral-tear-slap': { offset: [0, 0, 0], zoom: 2 },
	'subscapularis-biceps-pulley': { offset: [0, -0.01, 0.045], normal: [0.3, 0, 1], view: { azimuth: 20, polar: 74 } },
	'pectoralis-major-rupture': { offset: [-0.07, -0.05, 0.08], normal: [0, 0, 1], view: { azimuth: 10, polar: 74 } },
	'paget-schroetter-syndrome': { offset: [-0.07, 0.02, 0.06], normal: [0, 0.3, 1], view: { azimuth: 8, polar: 70 } },
	'latissimus-dorsi-tear': { offset: [-0.03, -0.12, -0.06], normal: [0.5, 0, -1], view: { azimuth: 125, polar: 76 } },
	'upper-limb-stress-fractures': {
		offset: [-0.06, -0.03, -0.09],
		normal: [0, 0, -1],
		view: { azimuth: 150, polar: 72 },
	},
	// Таз и бедро: пах спереди изнутри, задняя поверхность бедра сзади
	'inguinal-hernia': { offset: [-0.055, 0, 0.085], normal: [0, 0, 1], view: { azimuth: 10, polar: 76 } },
	'meralgia-paresthetica': { offset: [0.03, -0.07, 0.07], normal: [0.5, 0, 1], view: { azimuth: 35, polar: 76 } },
	'hamstring-strain': { offset: [0, -0.15, -0.07], normal: [0, 0, -1], view: { azimuth: 155, polar: 76 } },
	'stress-urinary-incontinence': {
		offset: [-0.107, 0.01, 0.07],
		normal: [0, 0, 1],
		view: { azimuth: 0, polar: 78 },
	},
	// Поясница: диск по центру, мышцы -- сбоку от позвоночника
	'lumbar-disc-herniation': { offset: [0, -0.03, 0], zoom: 1.8 },
	'low-back-strain': { offset: [0.05, 0, -0.04], normal: [0.3, 0, -1] },
	// Голова: глаз и рот спереди, от центра черепа
	'eye-injury': { offset: [0.032, 0, 0.07], normal: [0.2, 0, 1], view: { azimuth: 15, polar: 84 }, zoom: 2.4 },
	'orofacial-trauma': { offset: [0, -0.075, 0.085], normal: [0, 0, 1], view: { azimuth: 15, polar: 86 }, zoom: 2.2 },
	// Локоть: тендинопатия -- наружный надмыщелок, бицепс крепится спереди в сгибе локтя
	'elbow-tendinopathy': { offset: [0.03, 0, 0], normal: [1, 0, 0] },
	'distal-biceps-rupture': { offset: [0, -0.025, 0.04], normal: [0, 0, 1], view: { azimuth: 25, polar: 76 } },
	// Кисть: запястье в центре зоны, мозоли -- на ладони у пальцев
	'wrist-sprain': { offset: [0, 0, 0] },
	'hand-rips': { offset: [0, -0.07, 0.015], normal: [0, 0, 1], view: { azimuth: 20, polar: 80 } },
	// Таз: импинджмент -- перед тазобедренного сустава, отрыв хамстрингов -- седалищный бугор сзади
	'femoroacetabular-impingement': { offset: [0, 0, 0.06], normal: [0, 0, 1], view: { azimuth: 20, polar: 76 } },
	'proximal-hamstring-avulsion': {
		offset: [-0.03, -0.09, -0.07],
		normal: [0, 0, -1],
		view: { azimuth: 160, polar: 76 },
	},
	// Стопа: связки снаружи у лодыжки, фасция на подошве пятки, ахилл сзади над пяткой
	'ankle-sprain': { offset: [0.03, -0.01, -0.005], normal: [1, 0, 0], view: { azimuth: 85, polar: 70 } },
	'plantar-fasciitis': { offset: [0, -0.055, -0.035], normal: [0, -0.6, -1], view: { azimuth: 160, polar: 95 } },
	'achilles-tendinopathy': { offset: [0, 0.035, -0.06], normal: [0, 0, -1], view: { azimuth: 165, polar: 80 } },
	// Разрыв на том же сухожилии, но маркер ниже, к пятке: если у падела появится его линза,
	// оба ахилла окажутся в одной зоне и не должны делить место
	'achilles-tendon-rupture': { offset: [0, 0.01, -0.06], normal: [0, 0, -1], view: { azimuth: 165, polar: 80 } },
	// Голень: медиальная головка икроножной сзади и изнутри
	'tennis-leg': { offset: [-0.02, 0.03, -0.075], normal: [-0.3, 0, -1], view: { azimuth: 175, polar: 78 } },
	// Всё тело: шея
	'cervical-artery-dissection': {
		offset: [0, 0.2, -0.01],
		normal: [0, 0, 1],
		view: { azimuth: 25, polar: 80 },
		zoom: 3,
	},
}

/**
 * Глубина травмы в раскрытой зоне. `deep` -- связка, мениск, губа, кость, диск, нерв или сосуд:
 * мышцы у места травмы расходятся малой сферой, под ними видны глубокие слои. `muscle` -- мышца
 * или сухожилие: мышцы остаются, а подсвечиваются те, чьи названия (из BodyParts3D и Z-Anatomy,
 * без стороны) содержат строки из `muscles`. `peel` -- мышца травмы лежит под другими (манжета под
 * дельтовидной, разгибатели под широчайшей): малая сфера снимает мышцы над ней. Травмы без записи --
 * `muscle` без подсветки.
 */
export const INJURY_LAYER: Record<string, { depth: 'muscle' | 'deep'; muscles?: string[]; peel?: boolean }> = {
	'acl-tear': { depth: 'deep' },
	'meniscus-tear': { depth: 'deep' },
	// Тендинопатия надколенника -- сухожилие четырёхглавой
	'patellofemoral-pain': { depth: 'muscle', muscles: ['rectus femoris', 'vastus'] },
	'subacromial-impingement': { depth: 'muscle', muscles: ['supraspinatus'], peel: true },
	'rotator-cuff-tendinopathy': {
		depth: 'muscle',
		muscles: ['supraspinatus', 'infraspinatus', 'teres minor', 'subscapularis'],
		peel: true,
	},
	'labral-tear-slap': { depth: 'deep' },
	'subscapularis-biceps-pulley': {
		depth: 'muscle',
		muscles: ['subscapularis', 'long head of biceps brachii'],
		peel: true,
	},
	'pectoralis-major-rupture': { depth: 'muscle', muscles: ['pectoralis major'] },
	'paget-schroetter-syndrome': { depth: 'deep' },
	'latissimus-dorsi-tear': { depth: 'muscle', muscles: ['latissimus dorsi'] },
	'upper-limb-stress-fractures': { depth: 'deep' },
	'inguinal-hernia': {
		depth: 'muscle',
		muscles: ['external oblique', 'internal abdominal oblique', 'transversus abdominis'],
		peel: true,
	},
	'meralgia-paresthetica': { depth: 'deep' },
	'iliotibial-band-syndrome': { depth: 'muscle', muscles: ['iliotibial tract'] },
	'hamstring-strain': { depth: 'muscle', muscles: ['biceps femoris', 'semitendinosus', 'semimembranosus'] },
	'stress-urinary-incontinence': { depth: 'muscle', muscles: ['coccygeus', 'levator ani'], peel: true },
	'femoroacetabular-impingement': { depth: 'deep' },
	'lumbar-disc-herniation': { depth: 'deep' },
	'low-back-strain': {
		depth: 'muscle',
		muscles: ['iliocostalis lumborum', 'longissimus thoracis', 'multifidus lumborum', 'quadratus lumborum'],
		peel: true,
	},
	'elbow-tendinopathy': {
		depth: 'muscle',
		muscles: ['extensor carpi radialis brevis', 'extensor digitorum', 'flexor carpi radialis', 'pronator teres'],
	},
	'wrist-sprain': { depth: 'deep' },
	'ankle-sprain': { depth: 'deep' },
	// Глазного яблока в BodyParts3D нет: глазницу показывают прямые мышцы глаза вокруг него
	'eye-injury': {
		depth: 'muscle',
		muscles: ['superior rectus', 'inferior rectus', 'medial rectus', 'lateral rectus'],
	},
	'tennis-leg': { depth: 'muscle', muscles: ['medial head of gastrocnemius'] },
}

/** Слой травмы: глубина и подсвечиваемые мышцы. */
export function injuryLayer(slug: string) {
	return INJURY_LAYER[slug] ?? { depth: 'muscle' as const }
}

export type InjuryFocus = { position: Vec3; normal: Vec3; view: View; zoom: number }

/** Точка фокуса травмы на стороне `index` раскрытой зоны; `zoom` -- множитель к кадру зоны. */
export function injuryFocus(zone: Zone, index: number, slug: string): InjuryFocus {
	const point = zone.points[index]
	const entry = INJURY_FOCUS[slug]
	const s = point.position[0] < 0 ? -1 : 1

	if (!entry) return { ...point, zoom: 1.8 }

	const [dx, dy, dz] = entry.offset
	const [x, y, z] = point.position
	const normal = entry.normal ? ([s * entry.normal[0], entry.normal[1], entry.normal[2]] as Vec3) : point.normal

	return {
		position: [x + s * dx, y + dy, z + dz],
		normal,
		view: entry.view ? { azimuth: s * entry.view.azimuth, polar: entry.view.polar } : point.view,
		zoom: entry.zoom ?? 1.8,
	}
}
