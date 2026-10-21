// Расчёты для 3D-моделей статей (rig.py): центры поворота костей, оси и веса вершин мышц.
// Координаты уже сцены: метры, Y вверх, перед = +Z, правая сторона на -X.

/**
 * Расстояние до ближайшей точки облака, не дальше `limit`: дальше точное значение весам уже не важно.
 * Сетка ячеек: перебор всех пар на десятках тысяч вершин долгий.
 */
export function createNearest(points, cell = 0.01, limit = 0.08) {
	const grid = new Map()
	// Числовой ключ ячейки: строки на сотнях тысяч запросов заметно медленнее
	const key = (i, j, k) => (i + 512) * 1048576 + (j + 512) * 1024 + (k + 512)

	for (let p = 0; p < points.length; p += 3) {
		const k = key(...[0, 1, 2].map((a) => Math.floor(points[p + a] / cell)))

		if (!grid.has(k)) grid.set(k, [])

		grid.get(k).push(p)
	}

	const rings = Math.ceil(limit / cell) + 1

	return (x, y, z) => {
		const c = [x, y, z].map((v) => Math.floor(v / cell))
		let best = limit

		// Кольца ячеек вокруг точки, пока ближайшая найденная ближе следующего кольца
		for (let r = 0; r <= rings; r++) {
			if (best < (r - 1) * cell) break

			for (let i = -r; i <= r; i++)
				for (let j = -r; j <= r; j++)
					for (let k = -r; k <= r; k++) {
						if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== r) continue

						for (const p of grid.get(key(c[0] + i, c[1] + j, c[2] + k)) ?? [])
							best = Math.min(best, Math.hypot(points[p] - x, points[p + 1] - y, points[p + 2] - z))
					}
		}

		return best
	}
}

function solve4(a, b) {
	const m = a.map((row, i) => [...row, b[i]])

	for (let c = 0; c < 4; c++) {
		let p = c

		for (let r = c + 1; r < 4; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r

		;[m[c], m[p]] = [m[p], m[c]]

		for (let r = 0; r < 4; r++) {
			if (r === c) continue

			const f = m[r][c] / m[c][c]

			for (let k = c; k < 5; k++) m[r][k] -= f * m[c][k]
		}
	}

	return m.map((row, i) => row[4] / row[i])
}

/** Сфера по МНК: |p|^2 = 2 c·p + d, радиус из d + |c|^2. */
export function fitSphere(points) {
	const a = [0, 1, 2, 3].map(() => [0, 0, 0, 0])
	const b = [0, 0, 0, 0]

	for (let p = 0; p < points.length; p += 3) {
		const row = [2 * points[p], 2 * points[p + 1], 2 * points[p + 2], 1]
		const rhs = points[p] ** 2 + points[p + 1] ** 2 + points[p + 2] ** 2

		for (let i = 0; i < 4; i++) {
			b[i] += row[i] * rhs

			for (let j = 0; j < 4; j++) a[i][j] += row[i] * row[j]
		}
	}

	const [x, y, z, d] = solve4(a, b)

	return { center: [x, y, z], radius: Math.sqrt(d + x * x + y * y + z * z) }
}

/** Собственные векторы ковариации облака по убыванию разброса (метод Якоби). */
export function principalAxes(points) {
	const n = points.length / 3
	const mean = [0, 0, 0]

	for (let p = 0; p < points.length; p++) mean[p % 3] += points[p] / n

	const c = [0, 1, 2].map(() => [0, 0, 0])

	for (let p = 0; p < points.length; p += 3)
		for (let i = 0; i < 3; i++)
			for (let j = 0; j < 3; j++) c[i][j] += (points[p + i] - mean[i]) * (points[p + j] - mean[j])

	const v = [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	]

	for (let sweep = 0; sweep < 50; sweep++)
		for (const [p, q] of [
			[0, 1],
			[0, 2],
			[1, 2],
		]) {
			if (Math.abs(c[p][q]) < 1e-15) continue

			const t = (c[q][q] - c[p][p]) / (2 * c[p][q])
			const tan = Math.sign(t || 1) / (Math.abs(t) + Math.sqrt(t * t + 1))
			const cos = 1 / Math.sqrt(tan * tan + 1)
			const sin = tan * cos

			for (let k = 0; k < 3; k++) {
				const a = c[k][p]
				const b = c[k][q]

				c[k][p] = cos * a - sin * b
				c[k][q] = sin * a + cos * b
			}

			for (let k = 0; k < 3; k++) {
				const a = c[p][k]
				const b = c[q][k]

				c[p][k] = cos * a - sin * b
				c[q][k] = sin * a + cos * b
			}

			for (let k = 0; k < 3; k++) {
				const a = v[k][p]
				const b = v[k][q]

				v[k][p] = cos * a - sin * b
				v[k][q] = sin * a + cos * b
			}
		}

	return [0, 1, 2]
		.map((i) => ({ value: c[i][i], axis: [v[0][i], v[1][i], v[2][i]] }))
		.sort((a, b) => b.value - a.value)
		.map((e) => e.axis)
}

/** Поворот точки p вокруг оси axis через center на угол a (Родриг). */
export function rotate(p, center, axis, a) {
	const d = [p[0] - center[0], p[1] - center[1], p[2] - center[2]]
	const cos = Math.cos(a)
	const sin = Math.sin(a)
	const dot = axis[0] * d[0] + axis[1] * d[1] + axis[2] * d[2]
	const cross = [axis[1] * d[2] - axis[2] * d[1], axis[2] * d[0] - axis[0] * d[2], axis[0] * d[1] - axis[1] * d[0]]

	return [0, 1, 2].map((k) => center[k] + d[k] * cos + cross[k] * sin + axis[k] * dot * (1 - cos))
}

function centroid(points, keep) {
	const s = [0, 0, 0]
	let n = 0

	for (let p = 0; p < points.length; p += 3) {
		if (!keep(p)) continue

		for (let k = 0; k < 3; k++) s[k] += points[p + k]

		n++
	}

	return s.map((x) => x / n)
}

function lowest(points) {
	let best = 1

	for (let p = 1; p < points.length; p += 3) if (points[p] < points[best]) best = p

	return [points[best - 1], points[best], points[best + 1]]
}

const smoothstep = (x) => {
	const t = Math.min(1, Math.max(0, x))

	return t * t * (3 - 2 * t)
}

const round = (v) => v.map((x) => +x.toFixed(5))

const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }

/**
 * Суставы модели по описателю (`rigs/<name>.json`, см. README): центр, ось, доля общего угла
 * и проба знака. `points` -- вершины групп в координатах сцены.
 *
 * Центр: `sphere: [a, b]` -- сфера по вершинам `a` у самой `b` (головка в суставной впадине);
 * `contact: [a, b]` -- середина места, где `a` ближе всего к `b`; `far: a, from: <центр>` --
 * дальний от `from` конец `a` (грудино-ключичный сустав от акромиально-ключичного).
 * Ось: `x`, `y`, `z` или `plane:<группа>` -- нормаль плоскости группы (лопатка).
 * Знак оси -- такой, чтобы `probe` при повороте на положительный угол уходил к `toward`
 * (`-x` -- наружу у правой стороны, `+y` -- вверх, `+z` -- вперёд).
 */
export function buildRig(joints, points) {
	const nearest = new Map()
	const toGroup = (name) => {
		if (!nearest.has(name)) nearest.set(name, createNearest(points[name]))

		return nearest.get(name)
	}
	const distances = (a, b) => {
		const near = toGroup(b)
		const v = points[a]
		const d = []

		for (let p = 0; p < v.length; p += 3) d.push(near(v[p], v[p + 1], v[p + 2]))

		return d
	}
	const contact = ([a, b], band = 0.003) => {
		const d = distances(a, b)
		const min = Math.min(...d)

		return centroid(points[a], (p) => d[p / 3] < min + band)
	}

	function place(spec) {
		if (spec.sphere) {
			const [a, b] = spec.sphere
			const d = distances(a, b)
			const min = Math.min(...d)
			const surface = []

			// Суставная поверхность -- вершины `a` в сантиметре от самой близкой к `b`
			for (let i = 0; i < d.length; i++) if (d[i] < min + 0.01) surface.push(...points[a].slice(3 * i, 3 * i + 3))

			return fitSphere(surface)
		}

		if (spec.contact) return { center: contact(spec.contact) }

		if (spec.far) {
			const from = place(spec.from).center
			const v = points[spec.far]
			const dist = (p) => Math.hypot(v[p] - from[0], v[p + 1] - from[1], v[p + 2] - from[2])
			let far = 0

			for (let p = 0; p < v.length; p += 3) far = Math.max(far, dist(p))

			return { center: centroid(v, (p) => dist(p) > far - 0.008) }
		}

		if (spec.lowest) return { center: lowest(points[spec.lowest]) }

		// Самая передняя и самая задняя точка: носок стопы, пятка
		if (spec.frontmost || spec.backmost) {
			const v = points[spec.frontmost ?? spec.backmost]
			const sign = spec.frontmost ? 1 : -1
			let best = 2

			for (let p = 2; p < v.length; p += 3) if (v[p] * sign > v[best] * sign) best = p

			return { center: [v[best - 2], v[best - 1], v[best]] }
		}

		throw new Error(`rig: unknown point ${JSON.stringify(spec)}`)
	}

	return joints.map((joint) => {
		const { center, radius } = place(joint.pivot)
		const base = joint.axis.startsWith('plane:') ? principalAxes(points[joint.axis.slice(6)])[2] : AXES[joint.axis]

		if (!base) throw new Error(`rig ${joint.name}: unknown axis ${joint.axis}`)

		const probe = place(joint.probe).center
		const k = 'xyz'.indexOf(joint.toward[1])
		const sign = joint.toward[0] === '-' ? -1 : 1
		const moved = rotate(probe, center, base, Math.PI / 6)
		const axis = (moved[k] - probe[k]) * sign > 0 ? base : base.map((x) => -x)

		return {
			name: joint.name,
			parent: joint.parent ?? null,
			pivot: round(center),
			...(radius ? { radius: +radius.toFixed(5) } : {}),
			axis: round(axis),
			share: joint.share,
			// Для теста: точка, которая при положительном угле уходит к `toward`
			probe: round(probe),
			toward: joint.toward,
		}
	})
}

/**
 * Вес по нескольким костям: у каждой своя доля угла сустава (`{femur: 0, patella: 0.65, tibia: 1}`),
 * вершина берёт их смесь с весами по обратной четвёртой степени расстояния до кости: ближняя
 * кость почти целиком решает, иначе далёкий от сустава верх мышцы тоже чуть поворачивался бы. Так четырёхглавая
 * идёт от бедра через надколенник к бугристости большеберцовой, не отставая ни от одной из костей.
 * `tendon` -- близость к костям с ненулевой долей.
 */
export function anchorWeights(points, anchors) {
	const near = anchors.map(({ points: bone }) => createNearest(bone))
	const weight = new Float32Array(points.length / 3)
	const tendon = new Float32Array(points.length / 3)

	for (let p = 0, i = 0; p < points.length; p += 3, i++) {
		let sum = 0
		let total = 0
		let moving = Infinity

		anchors.forEach(({ share }, k) => {
			const d = near[k](points[p], points[p + 1], points[p + 2])
			// 1 мм -- чтобы вершина на самой кости не делила на ноль
			const w = 1 / Math.max(d, 0.001) ** 4

			sum += share * w
			total += w

			if (share > 0) moving = Math.min(moving, d)
		})

		weight[i] = sum / total
		tendon[i] = Math.min(1, Math.max(0, 1 - (moving - 0.003) / 0.02)) ** 1.5
	}

	return { weight, tendon }
}

/**
 * Вес подвижной кости по вершинам мышцы или связки: у неподвижной 0, у подвижной 1, между ними
 * плавно. `tendon` -- последние сантиметры у подвижной кости, шейдер красит их как сухожилие.
 *
 * `reach` -- для мышцы, которая лежит вдоль подвижной кости, но не прилегает к ней (двуглавая
 * вдоль плечевой): вес растёт с расстоянием от неподвижной кости и становится 1 через `reach`
 * метров, иначе брюшко с промежуточным весом растянулось бы листом.
 */
export function muscleWeights(points, fixed, moving, reach = 0) {
	const toGirdle = createNearest(fixed)
	const toHumerus = createNearest(moving)
	const weight = new Float32Array(points.length / 3)
	const tendon = new Float32Array(points.length / 3)

	for (let p = 0, i = 0; p < points.length; p += 3, i++) {
		const dg = toGirdle(points[p], points[p + 1], points[p + 2])
		const dh = toHumerus(points[p], points[p + 1], points[p + 2])

		weight[i] = reach ? smoothstep(dg / reach) : smoothstep((dg / (dg + dh + 1e-9) - 0.35) / 0.5)
		// 3 мм -- запас на раздувание remesh.py
		tendon[i] = Math.min(1, Math.max(0, 1 - (dh - 0.003) / 0.02)) ** 1.5
	}

	return { weight, tendon }
}
