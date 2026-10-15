import { REGIONS, type Region } from '#frontend/data/regions.ts'

type Vec3 = [number, number, number]

export type LabZone = {
	slug: Region
	label: string
	/** Радиус сферы растворения, метры модели. */
	radius: number
	/** Точки зоны на модели: обе стороны тела у парных зон. `normal` -- куда точка "смотрит". */
	points: { position: Vec3; normal: Vec3 }[]
	injuries: { slug: string; title: string; summary: string }[]
}

/**
 * Центры суставов в координатах `public/lab/body.glb`: метры, Y вверх, лицо к +Z, правая сторона
 * тела на -X. Посчитаны скриптом сборки модели по костям BodyParts3D (головка плечевой, дистальный
 * эпифиз плечевой, кости запястья, L1–L5, головка бедренной, надколенник, таранная).
 */
const ANCHORS: Record<Exclude<Region, 'other'>, { radius: number; points: { position: Vec3; normal: Vec3 }[] }> = {
	shoulder: { radius: 0.13, points: pair([0.165, 1.39, -0.024], 1, 0.3) },
	elbow: { radius: 0.09, points: pair([0.21, 1.127, -0.033], 1, -0.2) },
	'wrist-hand': { radius: 0.1, points: pair([0.25, 0.874, 0.021], 1, 0.3) },
	lumbar: { radius: 0.15, points: [{ position: [0, 1.066, -0.034], normal: [0, 0, -1] }] },
	'hip-groin': { radius: 0.14, points: pair([0.107, 0.882, -0.025], 0.6, 1) },
	knee: { radius: 0.085, points: pair([0.081, 0.459, 0.011], 0.4, 1) },
	'ankle-foot': { radius: 0.11, points: pair([0.07, 0.064, -0.024], 0.5, 1) },
}

/** Левая точка по данным и зеркальная правая; нормаль -- наружу вбок (`side`) и вперёд (`front`). */
function pair([x, y, z]: Vec3, side: number, front: number) {
	const len = Math.hypot(side, front)

	return [1, -1].map((s) => ({ position: [s * x, y, z] as Vec3, normal: [(s * side) / len, 0, front / len] as Vec3 }))
}

/** "Всё тело": растворение от груди на всю фигуру. */
const WHOLE = { radius: 1.3, points: [{ position: [0, 1.25, 0.05] as Vec3, normal: [0, 0, 1] as Vec3 }] }

export function buildZones(injuries: { slug: string; title: string; summary: string; region: Region }[]) {
	const byRegion = (slug: Region) =>
		injuries
			.filter((i) => i.region === slug)
			.map(({ slug, title, summary }) => ({ slug, title, summary }))
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
