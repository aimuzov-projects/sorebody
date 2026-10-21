import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Vector3 } from 'three'

import { jointAngle, rigPose, rotationAbout, type ModelRig } from './rig.ts'

const DIR = 'public/model/rig'

/** Rig из extras сцены в JSON-чанке GLB: геометрию для этого распаковывать не нужно. */
function readRig(file: string): ModelRig {
	const glb = readFileSync(`${DIR}/${file}`)
	const length = glb.readUInt32LE(12)
	const json = JSON.parse(glb.subarray(20, 20 + length).toString('utf8'))

	return json.scenes[0].extras.rig
}

const models = readdirSync(DIR)
	.filter((file) => file.endsWith('.glb'))
	.map((file) => [file, readRig(file)] as const)
const near = (a: Vector3, b: Vector3, eps = 1e-6) => a.distanceTo(b) < eps

test('в public/model/rig есть хотя бы одна модель', () => {
	assert.ok(models.length > 0)
})

test('поворот вокруг оси не сдвигает её центр', () => {
	const center = new Vector3(0.1, 1.2, -0.05)

	assert.ok(near(center.clone().applyMatrix4(rotationAbout(center.toArray(), [0, 0, 1], 70)), center))
})

for (const [file, rig] of models) {
	test(`${file}: в покое кости стоят на месте`, () => {
		const p = new Vector3(0.1, 1.2, -0.05)

		for (const matrix of rigPose(rig, 0).values()) assert.ok(near(p.clone().applyMatrix4(matrix), p))
	})

	test(`${file}: при любом угле сустав остаётся общей точкой двух костей`, () => {
		if (!rig.motion) return

		for (const total of [rig.motion.max / 3, rig.motion.max]) {
			const pose = rigPose(rig, total)

			for (const joint of rig.joints) {
				const pivot = new Vector3(...joint.pivot)
				const parent = joint.parent ? pose.get(joint.parent)!.clone() : null
				const own = pivot.clone().applyMatrix4(pose.get(joint.name)!)

				assert.ok(near(own, parent ? pivot.clone().applyMatrix4(parent) : pivot), `${joint.name} на ${total}°`)
			}
		}
	})

	test(`${file}: положительный угол ведёт кость в сторону, заданную описателем`, () => {
		if (!rig.motion) return

		for (const joint of rig.joints) {
			// Только свой поворот сустава: родительский может уводить точку и в другую сторону
			const probe = new Vector3(...joint.probe)
			const moved = probe.clone().applyMatrix4(rotationAbout(joint.pivot, joint.axis, jointAngle(rig, joint, 30)))
			const k = 'xyz'.indexOf(joint.toward[1]) as 0 | 1 | 2
			const sign = joint.toward[0] === '-' ? -1 : 1

			assert.ok((moved.getComponent(k) - probe.getComponent(k)) * sign > 0, `${joint.name} → ${joint.toward}`)
		}
	})

	test(`${file}: оси единичные, у каждой группы известный слой и сустав`, () => {
		const joints = new Set(rig.joints.map((joint) => joint.name))

		for (const joint of rig.joints) assert.ok(Math.abs(new Vector3(...joint.axis).length() - 1) < 1e-3)

		for (const [name, group] of Object.entries(rig.groups)) {
			assert.ok(group.layer, `${name}: слой`)

			if (group.joint) assert.ok(joints.has(group.joint), `${name}: сустав ${group.joint}`)

			if (group.weighted) assert.ok(joints.has(group.weighted.joint), `${name}: вес по ${group.weighted.joint}`)
		}
	})

	test(`${file}: у радиуса головки правдоподобный размер`, () => {
		for (const joint of rig.joints)
			if (joint.radius) assert.ok(joint.radius > 0.005 && joint.radius < 0.04, `${joint.name}: ${joint.radius}`)
	})
}
