// Сборка GLB из OBJ BodyParts3D: группы (skin / muscles / bones) сливаются в один меш каждая,
// упрощаются meshoptimizer и пишутся с квантованием + EXT_meshopt_compression.
// Детальный кусок зоны: `offset` из сборки фигуры (те же координаты) и `clip` -- сфера вокруг точки.
// usage: node build.mjs <config.json> <out.glb>
import fs from 'node:fs'
import path from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import {
	compactPrimitive,
	dedup,
	meshopt,
	prune,
	quantize,
	reorder,
	simplifyPrimitive,
	weld,
} from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'

import { createSkinTest } from './skin-test.mjs'

const [cfgPath, outPath] = process.argv.slice(2)
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))

function readObj(file) {
	const text = fs.readFileSync(file, 'utf8')
	const v = []
	const f = []
	let name = ''

	for (const line of text.split('\n')) {
		if (line.startsWith('# English name')) name = line.split(':')[1].trim()
		else if (line.startsWith('v ')) {
			const [, x, y, z] = line.trim().split(/\s+/)

			// мм, Z вверх, перед = -Y  ->  метры, Y вверх, перед = +Z
			v.push(+x / 1000, +z / 1000, -y / 1000)
		} else if (line.startsWith('f ')) {
			const idx = line
				.trim()
				.split(/\s+/)
				.slice(1)
				.map((t) => parseInt(t, 10) - 1)

			for (let i = 1; i + 1 < idx.length; i++) f.push(idx[0], idx[i], idx[i + 1])
		}
	}

	return { v, f, name }
}

/** Имя мышцы без стороны: "Long head of left biceps femoris" -> "long head of biceps femoris". */
function partName(name) {
	return name
		.toLowerCase()
		.replace(/\b(left|right)\b/g, '')
		.replace(/\s+muscle$/, '')
		.replace(/\s+/g, ' ')
		.trim()
}

/** Главная ось облака точек -- вдоль неё у мышцы идут волокна. Степенной метод по ковариации. */
function mainAxis(v) {
	const n = v.length / 3
	const m = [0, 0, 0]

	for (let i = 0; i < v.length; i++) m[i % 3] += v[i] / n

	const c = [0, 0, 0, 0, 0, 0, 0, 0, 0]

	for (let i = 0; i < v.length; i += 3)
		for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) c[a * 3 + b] += (v[i + a] - m[a]) * (v[i + b] - m[b])

	let x = [0.3, 0.9, 0.2]

	for (let it = 0; it < 30; it++) {
		const y = [0, 1, 2].map((a) => c[a * 3] * x[0] + c[a * 3 + 1] * x[1] + c[a * 3 + 2] * x[2])
		const l = Math.hypot(...y) || 1

		x = y.map((k) => k / l)
	}

	return x
}

function findObj(id) {
	for (const dir of cfg.objDirs) {
		const p = path.join(dir, id + '.obj')

		if (fs.existsSync(p)) return p
	}

	return null
}

const doc = new Document()
const buffer = doc.createBuffer()
const scene = doc.createScene('body')
let missing = 0

// Мышцы помечаются по вершинам: номер мышцы в `parts` меша (с 1) и направление волокон
const positions = []

for (const group of cfg.groups) {
	const pos = []
	const idx = []
	const part = []
	const fiber = []
	const parts = []

	for (const id of group.files) {
		const p = findObj(id)

		if (!p) {
			missing++
			continue
		}

		const { v, f, name } = readObj(p)
		const base = pos.length / 3

		for (const x of v) pos.push(x)

		if (group.parts) {
			const key = partName(name)
			let id = parts.indexOf(key) + 1

			if (!id) id = parts.push(key)

			const axis = mainAxis(v)

			for (let i = 0; i < v.length / 3; i++) {
				part.push(id)
				fiber.push(...axis)
			}
		}

		for (const i of f) idx.push(i + base)
	}

	console.log(group.name, 'files', group.files.length, 'verts', pos.length / 3, 'tris', idx.length / 3)
	const position = doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer)
	const prim = doc
		.createPrimitive()
		.setAttribute('POSITION', position)
		.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buffer))

	positions.push(position)

	if (group.parts) {
		prim.setAttribute(
			'_PART',
			doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(part)).setBuffer(buffer),
		)

		prim.setAttribute(
			'_FIBER',
			doc.createAccessor().setType('VEC3').setArray(new Float32Array(fiber)).setBuffer(buffer),
		)
	}

	const mesh = doc.createMesh(group.name).addPrimitive(prim)

	mesh.setExtras({ ratio: group.ratio, error: group.error, parts: group.parts ? parts : undefined })
	scene.addChild(doc.createNode(group.name).setMesh(mesh))
}

console.log('missing files', missing)

// Центрируем по X/Z, ставим стопы на y = 0
{
	let min = [Infinity, Infinity, Infinity]
	let max = [-Infinity, -Infinity, -Infinity]

	for (const acc of positions) {
		const a = acc.getArray()

		for (let i = 0; i < a.length; i += 3)
			for (let k = 0; k < 3; k++) {
				min[k] = Math.min(min[k], a[i + k])
				max[k] = Math.max(max[k], a[i + k])
			}
	}

	const off = cfg.offset ?? [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2]

	console.log('bounds', min, max, 'offset', off)

	for (const acc of positions) {
		const a = acc.getArray()

		for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) a[i + k] += off[k]
	}

	const anchors = []

	for (const an of cfg.anchors ?? []) {
		const v = []

		for (const id of an.files) {
			const p = findObj(id)

			if (p) v.push(...readObj(p).v)
		}

		for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) v[i + k] += off[k]

		let lo = Infinity
		let hi = -Infinity

		for (let i = 1; i < v.length; i += 3) {
			lo = Math.min(lo, v[i])
			hi = Math.max(hi, v[i])
		}

		const keep = (y) => (an.mode === 'top' ? y > hi - an.band : an.mode === 'bottom' ? y < lo + an.band : true)
		const bmin = [Infinity, Infinity, Infinity]
		const bmax = [-Infinity, -Infinity, -Infinity]

		for (let i = 0; i < v.length; i += 3) {
			if (!keep(v[i + 1])) continue

			for (let k = 0; k < 3; k++) {
				bmin[k] = Math.min(bmin[k], v[i + k])
				bmax[k] = Math.max(bmax[k], v[i + k])
			}
		}

		const c = bmin.map((m, k) => +((m + bmax[k]) / 2).toFixed(3))

		anchors.push({ zone: an.zone, side: an.side, position: c })
	}

	if (cfg.anchors) fs.writeFileSync(outPath.replace(/\.glb$/, '.anchors.json'), JSON.stringify(anchors, null, 1))
}

// Оставляем треугольники, у которых хоть одна вершина в сфере `clip`. Слои из `skinClip.groups`
// (взятые из другой модели) ещё и обрезаем по коже BP3D: что вышло наружу, висело бы над телом
if (cfg.clip) {
	const { center, radius } = cfg.clip
	let outside = () => false

	if (cfg.skinClip) {
		const { v, f } = readObj(findObj(cfg.skinClip.skin))
		const off = cfg.offset

		for (let i = 0; i < v.length; i++) v[i] += off[i % 3]

		const where = createSkinTest(v, f)

		outside = (pos, i) => where(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]) === 'outside'
	}

	for (const mesh of doc.getRoot().listMeshes())
		for (const prim of mesh.listPrimitives()) {
			const pos = prim.getAttribute('POSITION').getArray()
			const idx = prim.getIndices().getArray()
			const near = (v) =>
				Math.hypot(pos[3 * v] - center[0], pos[3 * v + 1] - center[1], pos[3 * v + 2] - center[2]) < radius
			const skinClip = cfg.skinClip?.groups.includes(mesh.getName())
			const keep = []

			for (let t = 0; t < idx.length; t += 3) {
				const tri = [idx[t], idx[t + 1], idx[t + 2]]

				if (!tri.some(near)) continue

				if (skinClip && tri.some((v) => outside(pos, v))) continue

				keep.push(...tri)
			}

			prim.getIndices().setArray(new Uint32Array(keep))
			compactPrimitive(prim)
			console.log(mesh.getName(), 'tris in clip', keep.length / 3)
		}

	// Пустые группы (в сфере нет ни одного элемента) выкидываем
	for (const node of doc.getRoot().listNodes())
		if (node.getMesh()?.listPrimitives()[0].getIndices().getCount() === 0) {
			node.getMesh().dispose()
			node.dispose()
		}
}

await MeshoptSimplifier.ready
await MeshoptEncoder.ready
await doc.transform(weld({}))

for (const mesh of doc.getRoot().listMeshes()) {
	const { ratio, error, parts } = mesh.getExtras()

	// Воксельные мышцы (remesh.py) без RegularizeLight упрощаются с зарубками
	const simplifier = parts
		? {
				...MeshoptSimplifier,
				simplify: (...a) => MeshoptSimplifier.simplify(...a.slice(0, 5), [...a[5], 'RegularizeLight']),
			}
		: MeshoptSimplifier

	for (const prim of mesh.listPrimitives()) {
		// ratio 1 -- исходная сетка без упрощения
		if (ratio < 1) simplifyPrimitive(prim, { simplifier, ratio, error, lockBorder: false })

		console.log(mesh.getName(), 'tris after', prim.getIndices().getCount() / 3)
	}

	// Названия мышц по номерам из `_PART` уходят в extras меша, сцена берёт их из userData
	mesh.setExtras(parts ? { parts } : {})
}

await doc.transform(weld({}), dedup(), prune())
await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize({ quantizePosition: 14, quantizeNormal: 8 }))

if (!cfg.noMeshopt) await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })

await io.write(outPath, doc)
console.log('written', outPath, fs.statSync(outPath).size)
