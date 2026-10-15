// Сборка GLB из OBJ BodyParts3D: группы (skin / muscles / bones) сливаются в один меш каждая,
// упрощаются meshoptimizer и пишутся с квантованием + EXT_meshopt_compression.
// usage: node build.mjs <config.json> <out.glb>
import fs from 'node:fs'
import path from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, quantize, reorder, simplifyPrimitive, weld } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'

const [cfgPath, outPath] = process.argv.slice(2)
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))

function readObj(file) {
	const text = fs.readFileSync(file, 'utf8')
	const v = []
	const f = []

	for (const line of text.split('\n')) {
		if (line.startsWith('v ')) {
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

	return { v, f }
}

/**
 * Убирает с кожи половые органы, как у манекена. В BodyParts3D они смоделированы
 * намного мельче остального тела (рёбра 2-5 мм против 10-12), поэтому область --
 * вершины в коробке паха со средним ребром короче `edgeMax`. Её треугольники
 * удаляются, дыра закрывается заплаткой из колец, а внутренние вершины заплатки
 * усредняются по соседям при закреплённом крае. Получается гладкий пах манекена.
 */
function neuter({ v, f }, edgeMax = 0.007, iterations = 2000) {
	const count = v.length / 3
	// На швах OBJ вершины задублированы: сшиваем по позиции, иначе шов разойдётся
	const canon = new Map()
	const same = new Int32Array(count)

	for (let i = 0; i < count; i++) {
		const key = `${v[i * 3]},${v[i * 3 + 1]},${v[i * 3 + 2]}`

		if (!canon.has(key)) canon.set(key, i)

		same[i] = canon.get(key)
	}

	const nb = Array.from({ length: count }, () => new Set())

	for (let i = 0; i < f.length; i += 3)
		for (let k = 0; k < 3; k++) {
			const a = same[f[i + k]]
			const b = same[f[i + ((k + 1) % 3)]]

			nb[a].add(b)
			nb[b].add(a)
		}

	const dist = (a, b) => Math.hypot(v[a * 3] - v[b * 3], v[a * 3 + 1] - v[b * 3 + 1], v[a * 3 + 2] - v[b * 3 + 2])
	const meanEdge = (i) => [...nb[i]].reduce((s, j) => s + dist(i, j), 0) / Math.max(1, nb[i].size)

	const lo = [Infinity, Infinity, Infinity]
	const hi = [-Infinity, -Infinity, -Infinity]

	for (let i = 0; i < count; i++)
		for (let k = 0; k < 3; k++) {
			lo[k] = Math.min(lo[k], v[i * 3 + k])
			hi[k] = Math.max(hi[k], v[i * 3 + k])
		}

	// Коробка паха в метрах от габаритов кожи: по центру, 0,74-0,90 м от стоп, спереди от
	// -8 см. Задний край отсекает анус: он тоже мелкий, но к полу отношения не имеет
	const cx = (lo[0] + hi[0]) / 2
	const cz = (lo[2] + hi[2]) / 2
	const region = new Set()

	for (let i = 0; i < count; i++) {
		if (same[i] !== i) continue

		const x = v[i * 3] - cx
		const y = v[i * 3 + 1] - lo[1]
		const z = v[i * 3 + 2] - cz

		if (Math.abs(x) < 0.05 && y > 0.74 && y < 0.9 && z > -0.08 && meanEdge(i) < edgeMax) region.add(i)
	}

	// Порог по ребру даёт рваный край с дырками внутри. Сначала затягиваем дырки
	// (вершина, у которой больше половины соседей в области), потом отступаем на два
	// кольца в крупную сетку: край дыры становится одной ровной петлёй
	for (let pass = 0; pass < 4; pass++)
		for (let i = 0; i < count; i++) {
			if (same[i] !== i || region.has(i) || !nb[i].size) continue

			let inside = 0

			for (const j of nb[i]) if (region.has(j)) inside++

			if (inside * 2 > nb[i].size) region.add(i)
		}

	for (let ring = 0; ring < 2; ring++) for (const i of [...region]) for (const j of nb[i]) region.add(j)

	// Треугольники с вершиной в области уходят. Рёбра, которые оставшиеся делят
	// с удалёнными, -- край дыры. Ориентацию берём с оставшихся: заплатка проходит
	// общее ребро в обратную сторону, тогда нормали смотрят наружу
	function cut() {
		const kept = []
		const removedEdges = new Set()

		for (let i = 0; i < f.length; i += 3) {
			const t = [same[f[i]], same[f[i + 1]], same[f[i + 2]]]

			if (t.some((j) => region.has(j))) for (let k = 0; k < 3; k++) removedEdges.add(`${t[k]},${t[(k + 1) % 3]}`)
			else for (const j of t) kept.push(j)
		}

		// Островки кожи, отрезанные областью от тела, тоже уходят в область
		const root = new Int32Array(count).map((_, i) => i)
		const find = (a) => {
			while (root[a] !== a) a = root[a] = root[root[a]]

			return a
		}

		for (let i = 0; i < kept.length; i += 3) {
			root[find(kept[i + 1])] = find(kept[i])
			root[find(kept[i + 2])] = find(kept[i])
		}

		const sizes = new Map()

		for (let i = 0; i < kept.length; i += 3) sizes.set(find(kept[i]), (sizes.get(find(kept[i])) ?? 0) + 1)

		const body = [...sizes].sort((a, b) => b[1] - a[1])[0][0]
		const islands = kept.length / 3 - sizes.get(body)

		for (let i = kept.length - 3; i >= 0; i -= 3) {
			if (find(kept[i]) === body) continue

			for (let k = 0; k < 3; k++) {
				removedEdges.add(`${kept[i + k]},${kept[i + ((k + 1) % 3)]}`)
				region.add(kept[i + k])
			}

			kept.splice(i, 3)
		}

		const out = new Map()

		for (let i = 0; i < kept.length; i += 3)
			for (let k = 0; k < 3; k++) {
				const a = kept[i + k]
				const b = kept[i + ((k + 1) % 3)]

				if (removedEdges.has(`${b},${a}`)) out.set(b, [...(out.get(b) ?? []), a])
			}

		return { kept, islands, out }
	}

	// Вершина, через которую край проходит дважды, рвёт петлю на куски.
	// Такие перешейки отдаём области, пока край не станет простыми петлями
	let kept
	let islands
	let next

	for (;;) {
		const result = cut()
		const pinches = [...result.out].filter(([, to]) => to.length > 1).map(([p]) => p)

		if (!pinches.length) {
			;({ kept, islands } = result)
			next = new Map([...result.out].map(([p, [to]]) => [p, to]))
			break
		}

		for (const p of pinches) region.add(p)
	}

	const loops = []
	const seen = new Set()

	for (const start of next.keys()) {
		if (seen.has(start)) continue

		const loop = []
		let p = start

		for (; p !== undefined && !seen.has(p); p = next.get(p)) {
			seen.add(p)
			loop.push(p)
		}

		if (p !== start) throw new Error(`neuter: open boundary chain of ${loop.length} vertices`)

		if (loop.length >= 3) loops.push(loop)
	}

	// Кожа у BodyParts3D -- оболочка с внешним и внутренним слоем, поэтому вырез даёт
	// две почти совпадающие петли. Закрываем только внешнюю: вторая заплатка в паре
	// миллиметров под первой просвечивала осколками. Петли различаем по ориентации:
	// заплатка внешнего слоя смотрит из тела, то есть в паху вниз, внутреннего -- вверх
	const facingDown = (loop) => {
		let y = 0

		for (let i = 0; i < loop.length; i++) {
			const a = loop[i]
			const b = loop[(i + 1) % loop.length]

			// Y-компонента площади многоугольника: z_a * x_b - x_a * z_b
			y += v[a * 3 + 2] * v[b * 3] - v[a * 3] * v[b * 3 + 2]
		}

		return -y
	}
	const outerLoop = loops.reduce((best, loop) => (facingDown(loop) > facingDown(best) ? loop : best))

	console.log('neuter: loop facing', loops.map((l) => `${l.length}:${facingDown(l).toFixed(4)}`).join(' '))
	const fill = []
	const inner = []

	for (const loop of [outerLoop]) {
		const n = loop.length
		const c = [0, 0, 0]

		for (const p of loop) for (let k = 0; k < 3; k++) c[k] += v[p * 3 + k] / n

		// Кольца от края к центру, между соседними -- полоса треугольников
		const rings = Math.max(2, Math.min(16, Math.round(n / 8)))
		let outer = loop

		for (let r = 1; r < rings; r++) {
			const ring = loop.map((p) => {
				const id = v.length / 3

				for (let k = 0; k < 3; k++) v.push(v[p * 3 + k] + (c[k] - v[p * 3 + k]) * (r / rings))

				inner.push(id)

				return id
			})

			for (let i = 0; i < n; i++) {
				const j = (i + 1) % n

				fill.push(outer[i], outer[j], ring[i], ring[i], outer[j], ring[j])
			}

			outer = ring
		}

		const center = v.length / 3

		v.push(...c)
		inner.push(center)

		for (let i = 0; i < n; i++) fill.push(outer[i], outer[(i + 1) % n], center)
	}

	// Внутренние вершины заплатки усредняются по соседям при закреплённом крае
	const patchNb = new Map(inner.map((i) => [i, new Set()]))

	for (let i = 0; i < fill.length; i += 3)
		for (let k = 0; k < 3; k++) {
			const a = fill[i + k]
			const b = fill[i + ((k + 1) % 3)]

			patchNb.get(a)?.add(b)
			patchNb.get(b)?.add(a)
		}

	for (let it = 0; it < iterations; it++)
		for (const [i, ns] of patchNb) {
			for (let k = 0; k < 3; k++) {
				let s = 0

				for (const j of ns) s += v[j * 3 + k]

				v[i * 3 + k] = s / ns.size
			}
		}

	// Открытый край внутреннего слоя проступал трещинками у края заплатки. Изнутри
	// его не видно, поэтому срезаем ещё восемь колец от края
	const keptNb = new Map()

	for (let i = 0; i < kept.length; i += 3)
		for (let k = 0; k < 3; k++) {
			const a = kept[i + k]
			const b = kept[i + ((k + 1) % 3)]

			if (!keptNb.has(a)) keptNb.set(a, [])

			keptNb.get(a).push(b)
		}

	const innerCut = new Set(loops.filter((l) => l !== outerLoop).flat())
	let front = [...innerCut]

	for (let ring = 0; ring < 8; ring++) {
		const grown = []

		for (const i of front)
			for (const j of keptNb.get(i) ?? [])
				if (!innerCut.has(j)) {
					innerCut.add(j)
					grown.push(j)
				}

		front = grown
	}

	f.length = 0

	for (let i = 0; i < kept.length; i += 3) {
		if (innerCut.has(kept[i]) || innerCut.has(kept[i + 1]) || innerCut.has(kept[i + 2])) continue

		f.push(kept[i], kept[i + 1], kept[i + 2])
	}

	for (const t of fill) f.push(t)

	console.log(
		'neuter: removed',
		region.size,
		'vertices and',
		islands,
		'island triangles, loops',
		loops.map((l) => l.length).join('+'),
	)
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

for (const group of cfg.groups) {
	const pos = []
	const idx = []

	for (const id of group.files) {
		const p = findObj(id)

		if (!p) {
			missing++
			continue
		}

		const obj = readObj(p)

		if (group.neuter) neuter(obj)

		const { v, f } = obj
		const base = pos.length / 3

		for (const x of v) pos.push(x)

		for (const i of f) idx.push(i + base)
	}

	console.log(group.name, 'files', group.files.length, 'verts', pos.length / 3, 'tris', idx.length / 3)
	const prim = doc
		.createPrimitive()
		.setAttribute(
			'POSITION',
			doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer),
		)
		.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buffer))
	const mesh = doc.createMesh(group.name).addPrimitive(prim)

	mesh.setExtras({ ratio: group.ratio, error: group.error })
	scene.addChild(doc.createNode(group.name).setMesh(mesh))
}

console.log('missing files', missing)

// Центрируем по X/Z, ставим стопы на y = 0
{
	let min = [Infinity, Infinity, Infinity]
	let max = [-Infinity, -Infinity, -Infinity]

	for (const acc of doc.getRoot().listAccessors()) {
		if (acc.getType() !== 'VEC3') continue

		const a = acc.getArray()

		for (let i = 0; i < a.length; i += 3)
			for (let k = 0; k < 3; k++) {
				min[k] = Math.min(min[k], a[i + k])
				max[k] = Math.max(max[k], a[i + k])
			}
	}

	const off = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2]

	console.log('bounds', min, max)

	for (const acc of doc.getRoot().listAccessors()) {
		if (acc.getType() !== 'VEC3') continue

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

	fs.writeFileSync(outPath.replace(/\.glb$/, '.anchors.json'), JSON.stringify(anchors, null, 1))
}

await MeshoptSimplifier.ready
await MeshoptEncoder.ready
await doc.transform(weld({}))

for (const mesh of doc.getRoot().listMeshes()) {
	const { ratio, error } = mesh.getExtras()

	for (const prim of mesh.listPrimitives()) {
		simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error, lockBorder: false })
		console.log(mesh.getName(), 'tris after', prim.getIndices().getCount() / 3)
	}

	mesh.setExtras({})
}

await doc.transform(weld({}), dedup(), prune())
await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize({ quantizePosition: 14, quantizeNormal: 8 }))

if (!cfg.noMeshopt) await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })

await io.write(outPath, doc)
console.log('written', outPath, fs.statSync(outPath).size)
