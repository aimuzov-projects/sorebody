import { MathUtils, Matrix4, Vector3 } from 'three'

type Vec3 = [number, number, number]

/** Центры и оси суставов плеча из extras GLB (scripts/model/rig.mjs), координаты сцены до квантования. */
export type ShoulderRig = {
	head: Vec3
	radius: number
	ghAxis: Vec3
	ac: Vec3
	scapulaAxis: Vec3
	sc: Vec3
	clavicleAxis: Vec3
}

/** Рука поднимается не выше: дальше плечевой сустав и лопатка в модели уже не работают. */
export const MAX_ELEVATION = 150

/**
 * Лопаточно-плечевой ритм: из подъёма руки две трети даёт плечевой сустав, треть -- поворот
 * лопатки вверх. Ключица поднимается на треть поворота лопатки. Градусы.
 */
export function splitElevation(total: number) {
	const t = MathUtils.clamp(total, 0, MAX_ELEVATION)
	const scapula = t / 3

	return { gh: t - scapula, scapula, clavicle: scapula / 3 }
}

/** Поворот на `deg` градусов вокруг оси `axis`, проходящей через `center`. */
export function rotationAbout(center: Vec3, axis: Vec3, deg: number) {
	const c = new Vector3(...center)

	return new Matrix4()
		.makeTranslation(c.x, c.y, c.z)
		.multiply(new Matrix4().makeRotationAxis(new Vector3(...axis).normalize(), MathUtils.degToRad(deg)))
		.multiply(new Matrix4().makeTranslation(-c.x, -c.y, -c.z))
}

/**
 * Положение костей при подъёме руки на `total` градусов. Ключица поворачивается вокруг
 * грудино-ключичного сустава, лопатка -- вместе с ней и ещё вокруг акромиально-ключичного,
 * плечевая кость -- вместе с лопаткой и ещё вокруг центра головки. `gh` -- угол плечевого
 * сустава в радианах: на столько шейдер поворачивает вершины мышц с весом 1 (shoulder-viewer.ts).
 */
export function rigPose(rig: ShoulderRig, total: number) {
	const angles = splitElevation(total)
	const clavicle = rotationAbout(rig.sc, rig.clavicleAxis, angles.clavicle)
	const scapula = clavicle.clone().multiply(rotationAbout(rig.ac, rig.scapulaAxis, angles.scapula))
	const humerus = scapula.clone().multiply(rotationAbout(rig.head, rig.ghAxis, angles.gh))

	return { clavicle, scapula, humerus, gh: MathUtils.degToRad(angles.gh) }
}
