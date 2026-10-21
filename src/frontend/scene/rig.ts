import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three'

type Vec3 = [number, number, number]

/** Сустав модели из extras GLB (scripts/model/rig.mjs): центр и ось в координатах сцены до квантования. */
export type RigJoint = {
	name: string
	parent: string | null
	pivot: Vec3
	radius?: number
	axis: Vec3
	/** Доля общего угла движения: у плеча 2/3 -- сустав, 1/3 -- лопатка. */
	share: number
	/** Точка, которая при положительном угле уходит к `toward` (проверка знака оси). */
	probe: Vec3
	toward: string
}

/** Группа -- один меш модели: слой (цвет), сустав, за которым она идёт, и вес мышцы между костями. */
type RigGroup = {
	layer: string
	joint?: string
	weighted?: { joint: string; fixed: string[] }
	/** Вершины идут за суставом целиком с весом `_FOLLOW`: мышца от рёбер к лопатке. */
	follow?: { joint: string }
	toggle?: { label: string; visible: boolean }
	/** Сдвиг вершин внутрь по нормали, м: корни зубов BodyParts3D местами выходят из тонкой кости. */
	inset?: number
	/** Кость, на которой группа едет в модели из кадров расчёта (`frames`). */
	bone?: string
}

/**
 * Движение из кадров расчёта (scripts/model/knee-frames.mjs): углы кадров и позы костей по кадрам,
 * матрицы 4x4 по столбцам. Деформация тканей между позами -- в morph targets мешей, цель k -- кадр k.
 */
export type RigFrames = {
	angles: number[]
	poses: Record<string, number[][]>
}

export type ModelRig = {
	title: string
	joints: RigJoint[]
	groups: Record<string, RigGroup>
	/** `null` -- модель без движения: её только вращают. */
	motion: { label: string; verb: string; max: number } | null
	/** Кадр: группа в кадре, сустав, к которому сдвинут центр, направление и дистанция в её размерах. */
	view: { focus: string; toward?: string; direction: Vec3; distance: number }
	about: string
	frames?: RigFrames
}

/** Между какими кадрами лежит угол `deg` и доля второго: [i, t], 0 <= t <= 1. */
export function frameSpan(angles: number[], deg: number): [number, number] {
	const last = angles.length - 1

	if (deg <= angles[0] || last === 0) return [0, 0]

	if (deg >= angles[last]) return [last - 1, 1]

	let i = 0

	while (angles[i + 1] < deg) i++

	return [i, (deg - angles[i]) / (angles[i + 1] - angles[i])]
}

const qa = new Quaternion()
const qb = new Quaternion()
const pa = new Vector3()
const pb = new Vector3()
const scale = new Vector3()

/**
 * Поза кости между кадрами расчёта: поворот -- slerp, сдвиг -- линейно. Матрицы не смешиваются
 * поэлементно: так кость сжималась бы на полпути между кадрами.
 */
export function framePose(frames: RigFrames, bone: string, deg: number, out = new Matrix4()) {
	const poses = frames.poses[bone]
	const [i, t] = frameSpan(frames.angles, deg)

	out.fromArray(poses[i]).decompose(pa, qa, scale)

	if (t > 0) {
		out.fromArray(poses[i + 1]).decompose(pb, qb, scale)
		qa.slerp(qb, t)
		pa.lerp(pb, t)
	}

	return out.compose(pa, qa, scale.set(1, 1, 1))
}

/** Поворот на `deg` градусов вокруг оси `axis`, проходящей через `center`. */
export function rotationAbout(center: Vec3, axis: Vec3, deg: number) {
	const c = new Vector3(...center)

	return new Matrix4()
		.makeTranslation(c.x, c.y, c.z)
		.multiply(new Matrix4().makeRotationAxis(new Vector3(...axis).normalize(), MathUtils.degToRad(deg)))
		.multiply(new Matrix4().makeTranslation(-c.x, -c.y, -c.z))
}

/** Угол сустава при движении на `total` градусов: его доля общего угла, в пределах движения модели. */
export function jointAngle(rig: ModelRig, joint: RigJoint, total: number) {
	return MathUtils.clamp(total, 0, rig.motion?.max ?? 0) * joint.share
}

/**
 * Положение каждого сустава при движении на `total` градусов: поворот вокруг его центра на его
 * долю угла поверх положения родителя. У плеча так ключица поворачивается в грудино-ключичном
 * суставе, лопатка -- вместе с ней и ещё в акромиально-ключичном, плечевая кость -- вместе
 * с лопаткой и ещё вокруг центра головки (лопаточно-плечевой ритм).
 */
export function rigPose(rig: ModelRig, total: number) {
	const pose = new Map<string, Matrix4>()
	const byName = new Map(rig.joints.map((joint) => [joint.name, joint]))

	function place(joint: RigJoint): Matrix4 {
		const done = pose.get(joint.name)

		if (done) return done

		const parent = joint.parent ? place(byName.get(joint.parent)!) : new Matrix4()
		const matrix = parent.clone().multiply(rotationAbout(joint.pivot, joint.axis, jointAngle(rig, joint, total)))

		pose.set(joint.name, matrix)

		return matrix
	}

	for (const joint of rig.joints) place(joint)

	return pose
}
