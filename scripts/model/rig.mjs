// Расчёты для плеча в статье (rig.py): центры поворота костей, оси и веса вершин мышц.
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

/**
 * Центры и оси суставов плеча. Знак каждой оси выбран так, чтобы положительный угол поднимал руку:
 * локоть уходит вверх, нижний угол лопатки -- наружу, акромиальный конец ключицы -- вверх.
 */
export function shoulderRig({ clavicle, scapula, humerus }) {
	const toScapula = createNearest(scapula)
	const near = (points) => {
		const d = []

		for (let p = 0; p < points.length; p += 3) d.push(toScapula(points[p], points[p + 1], points[p + 2]))

		return d
	}

	// Головка -- по суставной поверхности, то есть вершинам плечевой кости у самой лопатки
	const dh = near(humerus)
	const minH = Math.min(...dh)
	const joint = []

	for (let i = 0; i < dh.length; i++)
		if (dh[i] < minH + 0.01) joint.push(humerus[3 * i], humerus[3 * i + 1], humerus[3 * i + 2])

	const head = fitSphere(joint)

	// Акромиально-ключичный сустав -- место, где ключица ближе всего к лопатке; грудино-ключичный -- дальний конец
	const dc = near(clavicle)
	const minC = Math.min(...dc)
	const ac = centroid(clavicle, (p) => dc[p / 3] < minC + 0.003)
	let far = 0

	for (let p = 0; p < clavicle.length; p += 3) {
		const d = Math.hypot(clavicle[p] - ac[0], clavicle[p + 1] - ac[1], clavicle[p + 2] - ac[2])

		if (d > far) far = d
	}

	const sc = centroid(
		clavicle,
		(p) => Math.hypot(clavicle[p] - ac[0], clavicle[p + 1] - ac[1], clavicle[p + 2] - ac[2]) > far - 0.008,
	)

	// Плоскость лопатки -- две главные оси её облака, нормаль к ней -- ось отведения и поворота лопатки
	const plane = principalAxes(scapula)[2]
	const step = Math.PI / 6
	const elbow = lowest(humerus)
	// Наружу у правого плеча -- к -X. По высоте не проверить: локоть висит почти под головкой
	// и поднимается при повороте в любую сторону
	const ghAxis = rotate(elbow, head.center, plane, step)[0] < elbow[0] ? plane : plane.map((x) => -x)
	const angle = lowest(scapula)
	const scapulaAxis = rotate(angle, ac, plane, step)[0] < angle[0] ? plane : plane.map((x) => -x)
	const clavicleAxis = rotate(ac, sc, [0, 0, 1], step)[1] > ac[1] ? [0, 0, 1] : [0, 0, -1]

	return {
		head: round(head.center),
		radius: +head.radius.toFixed(5),
		ghAxis: round(ghAxis),
		ac: round(ac),
		scapulaAxis: round(scapulaAxis),
		sc: round(sc),
		clavicleAxis,
	}
}

/**
 * Вес плечевой кости по вершинам мышцы: у лопатки и ключицы 0, у плечевой кости 1, между ними плавно.
 * `tendon` -- последние сантиметры у плечевой кости, шейдер красит их как сухожилие.
 */
export function muscleWeights(points, girdle, humerus) {
	const toGirdle = createNearest(girdle)
	const toHumerus = createNearest(humerus)
	const weight = new Float32Array(points.length / 3)
	const tendon = new Float32Array(points.length / 3)

	for (let p = 0, i = 0; p < points.length; p += 3, i++) {
		const dg = toGirdle(points[p], points[p + 1], points[p + 2])
		const dh = toHumerus(points[p], points[p + 1], points[p + 2])

		weight[i] = smoothstep((dg / (dg + dh + 1e-9) - 0.35) / 0.5)
		// 3 мм -- запас на раздувание remesh.py
		tendon[i] = Math.min(1, Math.max(0, 1 - (dh - 0.003) / 0.02)) ** 1.5
	}

	return { weight, tendon }
}
