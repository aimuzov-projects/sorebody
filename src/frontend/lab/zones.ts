import { REGIONS, type Region } from '#frontend/data/regions.ts'

type Vec3 = [number, number, number]

/** Ракурс камеры, градусы: азимут от лица (+Z) к левому боку (+X), полярный угол от вертикали. */
export type View = { azimuth: number; polar: number }

type Point = { position: Vec3; normal: Vec3; view: View }

export type LabZone = {
	slug: Region
	label: string
	/** Радиус сферы растворения, метры модели. */
	radius: number
	/**
	 * Точки зоны на модели: обе стороны тела у парных зон. `normal` -- куда точка "смотрит",
	 * `view` -- ракурс, с которого раскрытая зона видна целиком и не перекрыта рукой или телом.
	 */
	points: Point[]
	injuries: { slug: string; title: string; summary: string; rare: boolean }[]
}

/**
 * Центры суставов в координатах `public/lab/body.glb`: метры, Y вверх, лицо к +Z, правая сторона
 * тела на -X. Посчитаны скриптом сборки модели по костям BodyParts3D (головка плечевой, дистальный
 * эпифиз плечевой, кости запястья, L1–L5, головка бедренной, надколенник, таранная).
 * Ракурсы подобраны по снимкам: плечо и таз спереди-сбоку, локоть и кисть сбоку, чтобы их
 * не закрывало туловище, поясница сзади, голеностоп чуть сверху.
 */
const ANCHORS: Record<Exclude<Region, 'other'>, { radius: number; points: Point[] }> = {
	shoulder: { radius: 0.13, points: pair([0.165, 1.39, -0.024], 1, 0.3, { azimuth: 40, polar: 70 }) },
	elbow: { radius: 0.09, points: pair([0.21, 1.127, -0.033], 1, -0.2, { azimuth: 95, polar: 78 }) },
	'wrist-hand': { radius: 0.1, points: pair([0.25, 0.874, 0.021], 1, 0.3, { azimuth: 70, polar: 78 }) },
	lumbar: {
		radius: 0.15,
		points: [{ position: [0, 1.066, -0.034], normal: [0, 0, -1], view: { azimuth: 160, polar: 76 } }],
	},
	'hip-groin': { radius: 0.14, points: pair([0.107, 0.882, -0.025], 0.6, 1, { azimuth: 35, polar: 76 }) },
	knee: { radius: 0.085, points: pair([0.081, 0.459, 0.011], 0.4, 1, { azimuth: 25, polar: 76 }) },
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

/** "Всё тело": растворение от груди на всю фигуру, вид спереди в три четверти. */
const WHOLE = {
	radius: 1.3,
	points: [{ position: [0, 1.25, 0.05] as Vec3, normal: [0, 0, 1] as Vec3, view: { azimuth: 25, polar: 76 } }],
}

export function buildZones(
	injuries: { slug: string; title: string; summary: string; rare: boolean; region: Region }[],
) {
	const byRegion = (slug: Region) =>
		injuries
			.filter((i) => i.region === slug)
			.map(({ slug, title, summary, rare }) => ({ slug, title, summary, rare }))
			.sort((a, b) => a.title.localeCompare(b.title, 'ru'))
	const zones: LabZone[] = REGIONS.filter((r) => r.slug !== 'other').map((r) => ({
		slug: r.slug,
		label: r.label,
		...ANCHORS[r.slug as Exclude<Region, 'other'>],
		injuries: byRegion(r.slug),
	}))
	const other = REGIONS.find((r) => r.slug === 'other')!
	const whole: LabZone = { slug: other.slug, label: other.label, ...WHOLE, injuries: byRegion(other.slug) }

	return { zones, whole }
}
