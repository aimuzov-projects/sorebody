import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Vector3 } from 'three'

import { MAX_ELEVATION, rigPose, rotationAbout, splitElevation, type ShoulderRig } from './rig.ts'

/** Rig из extras сцены в JSON-чанке GLB: геометрию для этого распаковывать не нужно. */
function readRig(): ShoulderRig {
	const glb = readFileSync('public/model/rig/shoulder-right.glb')
	const length = glb.readUInt32LE(12)
	const json = JSON.parse(glb.subarray(20, 20 + length).toString('utf8'))

	return json.scenes[0].extras.rig
}

const rig = readRig()
const near = (a: Vector3, b: Vector3, eps = 1e-6) => a.distanceTo(b) < eps

test('подъём руки делится на сустав и лопатку два к одному и упирается в предел', () => {
	assert.deepEqual(splitElevation(90), { gh: 60, scapula: 30, clavicle: 10 })
	assert.equal(splitElevation(400).gh + splitElevation(400).scapula, MAX_ELEVATION)
	assert.deepEqual(splitElevation(-10), { gh: 0, scapula: 0, clavicle: 0 })
})

test('поворот вокруг оси не сдвигает её центр', () => {
	const center = new Vector3(...rig.head)

	assert.ok(near(center.clone().applyMatrix4(rotationAbout(rig.head, rig.ghAxis, 70)), center))
})

test('в покое кости стоят на месте', () => {
	const pose = rigPose(rig, 0)
	const p = new Vector3(0.1, 1.2, -0.05)

	for (const m of [pose.clavicle, pose.scapula, pose.humerus]) assert.ok(near(p.clone().applyMatrix4(m), p))
})

test('при любом подъёме суставы не расходятся', () => {
	for (const total of [30, 90, MAX_ELEVATION]) {
		const pose = rigPose(rig, total)
		const ac = new Vector3(...rig.ac)
		const head = new Vector3(...rig.head)

		// Акромиально-ключичный сустав -- общая точка ключицы и лопатки
		assert.ok(near(ac.clone().applyMatrix4(pose.clavicle), ac.clone().applyMatrix4(pose.scapula)))
		// Головка остаётся во впадине лопатки: её центр плечевая кость и лопатка ведут одинаково
		assert.ok(near(head.clone().applyMatrix4(pose.humerus), head.clone().applyMatrix4(pose.scapula)))
	}
})

test('рука поднимается вбок и вверх, а лопатка поворачивается нижним углом наружу', () => {
	const pose = rigPose(rig, 90)
	// Точка на плечевой кости в 25 см под головкой: примерно локоть
	const elbow = new Vector3(...rig.head).add(new Vector3(0, -0.25, 0))
	const moved = elbow.clone().applyMatrix4(pose.humerus)

	assert.ok(moved.y > elbow.y + 0.15, `локоть поднялся на ${(moved.y - elbow.y).toFixed(3)} м`)
	// Правая сторона на -X: наружу -- к меньшему X
	assert.ok(moved.x < elbow.x, 'локоть ушёл наружу')

	const angle = new Vector3(...rig.ac).add(new Vector3(0.05, -0.15, 0))

	assert.ok(angle.clone().applyMatrix4(pose.scapula).x < angle.x, 'нижний угол лопатки ушёл наружу')
})

test('центр головки лежит в пределах головки плечевой кости, оси единичные', () => {
	assert.ok(rig.radius > 0.018 && rig.radius < 0.03, `радиус ${rig.radius}`)

	for (const axis of [rig.ghAxis, rig.scapulaAxis, rig.clavicleAxis])
		assert.ok(Math.abs(new Vector3(...axis).length() - 1) < 1e-3)
})
