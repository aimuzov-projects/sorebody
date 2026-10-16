// Где точка относительно кожи BodyParts3D: под кожей, в её толще или снаружи.
// Кожа -- толстая оболочка из двух поверхностей, поэтому луч +X из точки под кожей пересекает
// её 2 mod 4 раз, из толщи -- нечётное число, снаружи -- 0 mod 4.

/** `pos` -- xyz вершин кожи, `idx` -- треугольники; `cell` -- шаг сетки для лучей, метры. */
export function createSkinTest(pos, idx, cell = 0.01) {
	const rays = new Map()
	const tri = (t) => [idx[t], idx[t + 1], idx[t + 2]].map((v) => [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]])

	for (let t = 0; t < idx.length; t += 3) {
		const p = tri(t)
		const lo = [1, 2].map((k) => Math.min(p[0][k], p[1][k], p[2][k]))
		const hi = [1, 2].map((k) => Math.max(p[0][k], p[1][k], p[2][k]))

		for (let gy = Math.floor(lo[0] / cell); gy <= Math.floor(hi[0] / cell); gy++)
			for (let gz = Math.floor(lo[1] / cell); gz <= Math.floor(hi[1] / cell); gz++) {
				const key = `${gy},${gz}`
				const list = rays.get(key)

				if (list) list.push(t)
				else rays.set(key, [t])
			}
	}

	/** 'inside' -- под кожей, 'skin' -- в её толще, 'outside' -- снаружи. */
	return function where(px, py, pz) {
		// Сдвиг на доли микрона, чтобы луч не шёл ровно по ребру
		py += 1.3e-7
		pz += 1.7e-7
		let hits = 0

		for (const t of rays.get(`${Math.floor(py / cell)},${Math.floor(pz / cell)}`) ?? []) {
			const [a, b, c] = tri(t)
			const d = (b[1] - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (b[2] - a[2])

			if (Math.abs(d) < 1e-14) continue

			const u = ((py - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (pz - a[2])) / d
			const w = ((b[1] - a[1]) * (pz - a[2]) - (py - a[1]) * (b[2] - a[2])) / d

			if (u < 0 || w < 0 || u + w > 1) continue

			if (a[0] + u * (b[0] - a[0]) + w * (c[0] - a[0]) > px) hits++
		}

		return hits % 2 ? 'skin' : hits % 4 ? 'inside' : 'outside'
	}
}
