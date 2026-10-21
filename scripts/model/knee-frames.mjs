// Сборка GLB колена из расчёта Open Knee(s): кадры сгибания -- morph targets, позы костей -- в extras.
// Вход -- knee.json и knee.bin из openknee/export.py: у каждой группы положения вершин во всех кадрах
// в координатах её кости (bone), сама кость едет по позе кадра. Сцена (scene/model-viewer.ts)
// смешивает два соседних кадра: позы костей -- поворотом, деформацию тканей -- морфами.
// usage: node knee-frames.mjs <knee.json> <rig.json> <out.glb>
import fs from 'node:fs'
import path from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { meshopt, prune, quantize, reorder } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'

const [dataPath, rigPath, outPath] = process.argv.slice(2)
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
const rig = JSON.parse(fs.readFileSync(rigPath, 'utf8'))
const bin = fs.readFileSync(path.join(path.dirname(dataPath), path.basename(dataPath, '.json') + '.bin'))

const view = (Type, [offset, bytes]) =>
	new Type(bin.buffer.slice(bin.byteOffset + offset, bin.byteOffset + offset + bytes))

/** Нормали вершин по площадям треугольников. */
function normals(pos, idx) {
	const n = new Float32Array(pos.length)

	for (let t = 0; t < idx.length; t += 3) {
		const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3]
		const ux = pos[b] - pos[a]
		const uy = pos[b + 1] - pos[a + 1]
		const uz = pos[b + 2] - pos[a + 2]
		const vx = pos[c] - pos[a]
		const vy = pos[c + 1] - pos[a + 1]
		const vz = pos[c + 2] - pos[a + 2]
		const nx = uy * vz - uz * vy
		const ny = uz * vx - ux * vz
		const nz = ux * vy - uy * vx

		for (const v of [a, b, c]) {
			n[v] += nx
			n[v + 1] += ny
			n[v + 2] += nz
		}
	}

	for (let i = 0; i < n.length; i += 3) {
		const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1

		n[i] /= l
		n[i + 1] /= l
		n[i + 2] /= l
	}

	return n
}

/** Главная ось облака точек: направление волокон для шейдера, как у мышц в build.mjs. */
function mainAxis(pos) {
	const n = pos.length / 3
	const m = [0, 0, 0]

	for (let i = 0; i < pos.length; i++) m[i % 3] += pos[i] / n

	const c = Array.from({ length: 9 }, () => 0)

	for (let i = 0; i < pos.length; i += 3)
		for (let a = 0; a < 3; a++)
			for (let b = 0; b < 3; b++) c[a * 3 + b] += (pos[i + a] - m[a]) * (pos[i + b] - m[b])

	let x = [0.3, 0.9, 0.2]

	for (let it = 0; it < 30; it++) {
		const y = [0, 1, 2].map((a) => c[a * 3] * x[0] + c[a * 3 + 1] * x[1] + c[a * 3 + 2] * x[2])
		const l = Math.hypot(...y) || 1

		x = y.map((k) => k / l)
	}

	return x
}

await MeshoptSimplifier.ready
await MeshoptEncoder.ready

const doc = new Document()
const buffer = doc.createBuffer()
const scene = doc.createScene('knee')
const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer)
const F = data.angles.length

for (const g of data.groups) {
	const cfg = rig.groups[g.name]

	if (!cfg) continue

	const all = view(Float32Array, g.position)
	const V = g.verts
	const frame = (k) => all.subarray(k * V * 3, (k + 1) * V * 3)
	const source = view(Uint32Array, g.index)
	const part = g.part ? view(Uint16Array, g.part) : null

	// Упрощение по кадру 0: meshopt выбрасывает вершины, но не двигает их, и кадры остаются верными.
	// Части группы (два мениска) упрощаются по отдельности, чтобы не слиплись
	let idx = source

	if (cfg.ratio < 1) {
		const pieces = []

		for (let id = 1; id <= (part ? g.parts.length : 1); id++) {
			const own = part ? source.filter((_, i) => part[source[i - (i % 3)]] === id) : source
			const [out] = MeshoptSimplifier.simplify(
				own,
				frame(0),
				3,
				Math.floor((own.length * cfg.ratio) / 3) * 3,
				cfg.error ?? 0.01,
				['ErrorAbsolute'],
			)

			pieces.push(out)
		}

		idx = Uint32Array.from(pieces.flatMap((p) => [...p]))
	}

	// Сжатие вершин до используемых
	const remap = new Int32Array(V).fill(-1)
	let count = 0

	for (const v of idx) if (remap[v] < 0) remap[v] = count++

	const pick = (src, size) => {
		const out = new src.constructor(count * size)

		for (let v = 0; v < V; v++)
			if (remap[v] >= 0) for (let k = 0; k < size; k++) out[remap[v] * size + k] = src[v * size + k]

		return out
	}
	const index = idx.map((v) => remap[v])
	// `still` -- деформация в расчёте меньше пикселя (хрящи, доли миллиметра): кадры не храним
	const frames = Array.from({ length: g.rigid || cfg.still ? 1 : F }, (_, k) => pick(frame(k), 3))
	const norms = frames.map((p) => normals(p, index))
	const prim = doc
		.createPrimitive()
		.setAttribute('POSITION', accessor('VEC3', frames[0]))
		.setIndices(accessor('SCALAR', index))

	// Нормали нужны только морфам: жёстким мешам сцена считает их сама, как у build.mjs, а в
	// квантованный атрибут computeVertexNormals() копил бы суммы с обрезкой
	// Нормаль сетки -- средняя по кадрам, а не кадра 0: разности с ней вдвое меньше и не упираются
	// в [-1, 1] квантования, даже где связка за сгибание поворачивается больше чем на 90°
	const base = new Float32Array(count * 3)

	if (frames.length > 1) {
		for (const n of norms) for (let i = 0; i < base.length; i++) base[i] += n[i]

		for (let i = 0; i < base.length; i += 3) {
			const l = Math.hypot(base[i], base[i + 1], base[i + 2]) || 1

			base[i] /= l
			base[i + 1] /= l
			base[i + 2] /= l
		}

		prim.setAttribute('NORMAL', accessor('VEC3', base))
	}

	if (part) {
		const own = pick(part, 1)

		prim.setAttribute('_PART', accessor('SCALAR', own))

		// Волокна вдоль главной оси каждой части
		const fiber = new Float32Array(count * 3)

		for (let id = 1; id <= g.parts.length; id++) {
			const p = []

			for (let v = 0; v < count; v++)
				if (own[v] === id) p.push(frames[0][v * 3], frames[0][v * 3 + 1], frames[0][v * 3 + 2])

			const axis = mainAxis(p)

			for (let v = 0; v < count; v++) if (own[v] === id) fiber.set(axis, v * 3)
		}

		prim.setAttribute('_FIBER', accessor('VEC3', fiber))
	}

	// Цель k -- кадр k, включая 0: положения -- разности с кадром 0, нормали -- со средней. Сцена
	// даёт двум соседним кадрам веса с суммой 1, и база нормали сокращается
	let over = 0

	for (let k = 0; k < (frames.length > 1 ? frames.length : 0); k++) {
		const dp = frames[k].map((x, i) => x - frames[0][i])
		const dn = norms[k].map((x, i) => x - base[i])

		over += dn.filter((x) => Math.abs(x) > 1).length

		prim.addTarget(
			doc
				.createPrimitiveTarget(`frame${k}`)
				.setAttribute('POSITION', accessor('VEC3', dp))
				.setAttribute('NORMAL', accessor('VEC3', dn)),
		)
	}

	// Квантование обрежет такие разности по [-1, 1]: на изгибе поедет освещение
	if (over) console.warn(g.name, 'normal deltas over 1:', over)

	const mesh = doc.createMesh(g.name).addPrimitive(prim)

	if (frames.length > 1) mesh.setWeights(Array.from({ length: frames.length }, () => 0))

	mesh.setExtras(g.parts ? { parts: g.parts } : {})
	scene.addChild(doc.createNode(g.name).setMesh(mesh))
	console.log(g.name, 'tris', index.length / 3, 'verts', count, 'frames', frames.length)
}

// Позы костей по кадрам и углы кадров: сцена смешивает соседние
const bones = [...new Set(data.groups.filter((g) => rig.groups[g.name]).map((g) => g.bone))]

scene.setExtras({
	rig: {
		title: rig.title,
		joints: [],
		groups: Object.fromEntries(
			Object.entries(rig.groups).map(([name, cfg]) => [
				name,
				{ layer: cfg.layer, bone: data.groups.find((g) => g.name === name).bone, toggle: cfg.toggle },
			]),
		),
		frames: {
			angles: data.angles.map((a) => +a.toFixed(3)),
			poses: Object.fromEntries(bones.map((b) => [b, data.poses[b].map((m) => m.map((x) => +x.toFixed(6)))])),
		},
		motion: rig.motion,
		view: rig.view,
		about: rig.about,
	},
})

await doc.transform(prune())
await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize({ quantizePosition: 14, quantizeNormal: 8 }))
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })

await io.write(outPath, doc)
console.log('written', outPath, fs.statSync(outPath).size)
