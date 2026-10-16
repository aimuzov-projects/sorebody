import { Mesh, Vector3, type Group, type Scene } from 'three'
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { createDissolveMaterial } from './dissolve.ts'

type Vec3 = [number, number, number]
type Dissolve = ReturnType<typeof createDissolveMaterial>

/**
 * Кусок зоны покрывает сферу в 1,25 радиуса зоны вокруг её точки -- как `radius * 1.25`
 * в scripts/model/detail.py. Внутри этой сферы базовые мышцы и кости уступают куску.
 */
export const DETAIL_REACH = 1.25

/** Слои куска: кости и мышцы как у фигуры, связки с менисками голубоватые, сосуды и нервы цветные. */
const LAYERS: Record<string, string> = {
	bones: '#efe7da',
	muscles: '#e8e4df',
	cartilage: '#d6e4ec',
	ligaments: '#9fbbe6',
	arteries: '#c9463d',
	veins: '#4f6fb8',
	nerves: '#e8c650',
}

/** Сколько кусков держать в памяти: открытая зона и пара соседних по наведению. */
const KEEP = 4

/** Имя куска: зона и сторона тела. Левая сторона -- на +X, как в zones.ts. */
export function detailKey(slug: string, position: Vec3) {
	const [x] = position

	return `${slug}-${x > 0 ? 'left' : x < 0 ? 'right' : 'center'}`
}

/**
 * Детальные куски зон: при открытии зоны догружается её геометрия во всех слоях (связки,
 * мениски, сосуды, нервы) и подменяет внутри своей сферы базовые мышцы и кости. Общий план
 * обходится лёгкой фигурой. `lowPower` -- слабое устройство: кусок нервов не грузим.
 */
export function createDetail(options: {
	scene: Scene
	loader: GLTFLoader
	base: Dissolve[]
	baseUrl: string
	lowPower: () => boolean
}) {
	const { scene, loader, base, baseUrl, lowPower } = options
	const materials = Object.fromEntries(
		Object.entries(LAYERS).map(([layer, color]) => [
			layer,
			createDissolveMaterial(color, '#0071e3', layer === 'bones' ? 0.5 : 0.6),
		]),
	)
	const all = Object.values(materials)

	for (const m of all) m.uniforms.uCutSide.value = -1

	let index: Promise<Record<string, { nerves: boolean }>> | undefined
	// Куски по имени файла; порядок в Map -- от давнего к свежему, для вытеснения
	const cache = new Map<string, Promise<Group | null>>()
	let shown: Group[] = []
	let wanted: string | null = null

	function readIndex() {
		index ??= fetch(`${baseUrl}index.json`)
			.then((r) => (r.ok ? r.json() : {}))
			.catch(() => ({}))

		return index
	}

	function load(file: string) {
		const hit = cache.get(file)

		if (hit) {
			cache.delete(file)
			cache.set(file, hit)

			return hit
		}

		const promise = loader
			.loadAsync(`${baseUrl}${file}.glb`)
			.then((gltf) => {
				gltf.scene.traverse((obj) => {
					if (!(obj instanceof Mesh)) return

					obj.geometry.computeVertexNormals()
					const layer = obj.name.split('.')[0]

					obj.material = (materials[layer] ?? materials.muscles).material

					// Сдвиг мышц внутрь -- 3 мм в единицах квантованного меша, как у фигуры
					if (layer === 'muscles') obj.userData.inset = 0.003 / obj.getWorldScale(new Vector3()).x
				})

				return gltf.scene
			})
			.catch(() => null)

		cache.set(file, promise)
		evict()

		return promise
	}

	function evict() {
		for (const [file, promise] of cache) {
			if (cache.size <= KEEP) break

			cache.delete(file)

			void promise.then((group) => {
				if (!group || shown.includes(group)) return

				group.traverse((obj) => {
					if (obj instanceof Mesh) obj.geometry.dispose()
				})
			})
		}
	}

	async function files(key: string) {
		const entry = (await readIndex())[key]

		if (!entry) return []

		return entry.nerves && !lowPower() ? [key, `${key}.nerves`] : [key]
	}

	function cut(center: Vec3 | null, radius: number) {
		for (const m of base) {
			m.uniforms.uCutSide.value = center ? 1 : 0

			if (center) m.uniforms.uCut.value.set(...center, radius)
		}

		for (const m of all) if (center) m.uniforms.uCut.value.set(...center, radius)
	}

	return {
		/** Загрузить кусок заранее, например при наведении на строку зоны. Ждёт и распаковку. */
		async prefetch(key: string) {
			await Promise.all((await files(key)).map(load))
		},
		/**
		 * Показать кусок `key` вокруг точки зоны `point` в сфере `radius`; `null` убирает его.
		 * Пока кусок грузится, в зоне остаётся лёгкая фигура.
		 */
		async show(key: string | null, point?: Vec3, radius = 0) {
			wanted = key

			if (!key || !point) {
				for (const group of shown) scene.remove(group)

				shown = []
				cut(null, 0)

				return
			}

			const groups = (await Promise.all((await files(key)).map(load))).filter((g): g is Group => !!g)

			if (wanted !== key) return

			for (const group of shown) scene.remove(group)

			shown = groups

			// У зоны нет куска («Всё тело») или он не загрузился -- остаётся лёгкая фигура
			if (!groups.length) return cut(null, 0)

			for (const group of groups) {
				group.traverse((obj) => {
					if (obj instanceof Mesh && obj.userData.inset)
						materials.muscles.uniforms.uInset.value = obj.userData.inset
				})

				scene.add(group)
			}

			cut(point, radius)
			// Метка для замера догрузки: от клика по зоне до куска на сцене
			performance.mark(`detail:${key}`)
		},
		/** Каждый кадр: слои куска следуют за проёмом кожи, мышцы -- за своей долей. */
		sync(center: Vector3, radius: number, muscleShare: number) {
			if (!shown.length) return

			for (const [layer, m] of Object.entries(materials)) {
				m.uniforms.uCenter.value.copy(center)
				// Кости видны и без проёма -- их закрывает кожа; остальное рисуем только в проёме
				m.uniforms.uOuter.value = layer === 'bones' ? -1 : radius
				m.uniforms.uRadius.value = layer === 'muscles' ? radius * muscleShare : 0
			}
		},
	}
}
