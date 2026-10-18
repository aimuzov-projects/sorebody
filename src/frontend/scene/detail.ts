import { Mesh, Vector3, type Group, type Scene } from 'three'
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { BONE_RIM, createDissolveMaterial, MUSCLE_RIM } from './dissolve.ts'

type Vec3 = [number, number, number]
type Dissolve = ReturnType<typeof createDissolveMaterial>

/**
 * Кусок зоны покрывает сферу в 1,25 радиуса зоны вокруг её точки -- как `radius * 1.25`
 * в scripts/model/detail.py. Внутри этой сферы базовые мышцы и кости уступают куску.
 */
export const DETAIL_REACH = 1.25

/** Слои куска: кости как у фигуры, связки с менисками голубоватые, сосуды и нервы цветные. Мышцы -- цветом темы. */
const LAYERS: Record<string, string> = {
	bones: '#efe7da',
	muscles: '#c65a4b',
	cartilage: '#d6e4ec',
	ligaments: '#9fbbe6',
	arteries: '#c9463d',
	veins: '#4f6fb8',
	nerves: '#e8c650',
}

/** Сколько кусков держать в памяти: открытая зона и пара соседних по наведению. */
const KEEP = 4
/** Слои, которые видны только в сфере глубокой травмы: под мышцами, но без неё они лишь мешают. */
const DEEP = new Set(['arteries', 'veins', 'nerves'])

/**
 * Номера мышц для подсветки: позиции (с 1) в `parts` меша тех мышц, в названиях которых есть
 * строка из `names`. Шейдер берёт до 8 номеров, пустые места -- -1.
 */
export function partIds(parts: string[] | undefined, names: string[] | null) {
	const ids: number[] = []

	parts?.forEach((part, i) => {
		if (names?.some((name) => part.includes(name))) ids.push(i + 1)
	})

	return Array.from({ length: 8 }, (_, i) => ids[i] ?? -1)
}

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
	muscleColor: string
}) {
	const { scene, loader, base, baseUrl, lowPower } = options
	const materials = Object.fromEntries(
		Object.entries(LAYERS).map(([layer, color]) => [
			layer,
			layer === 'muscles'
				? createDissolveMaterial(options.muscleColor, MUSCLE_RIM, 0.78, true)
				: createDissolveMaterial(color, BONE_RIM, layer === 'bones' ? 0.5 : 0.6),
		]),
	)
	const all = Object.values(materials)

	// Кусок рисуется только внутри своей сферы, снаружи остаётся базовая фигура
	for (const m of all) m.uniforms.uCutSide.value = -1

	let index: Promise<Record<string, { nerves: boolean }>> | undefined
	// Куски по имени файла; порядок в Map -- от давнего к свежему, для вытеснения
	const cache = new Map<string, Promise<Group | null>>()
	// Загруженные куски, которые ещё в кэше
	const cached = new Set<Group>()
	let shown: Group[] = []
	let wanted: string | null = null
	let highlighted: string[] | null = null

	/** Номера подсвеченных мышц -- по списку мышц показанного куска. */
	function applyHighlight() {
		let parts: string[] | undefined

		for (const group of shown)
			group.traverse((obj) => {
				if (obj instanceof Mesh && obj.userData.parts) parts = obj.userData.parts
			})

		materials.muscles.uniforms.uParts.value = partIds(parts, highlighted)
	}

	function readIndex() {
		index ??= fetch(`${baseUrl}index.json`)
			.then((r) => {
				if (!r.ok) throw new Error(`${r.url}: ${r.status}`)

				return r.json()
			})
			.catch((error) => {
				// Неудачу не запоминаем: следующая зона спросит индекс заново, а не останется без кусков
				console.error(error)
				index = undefined

				return {}
			})

		return index
	}

	function dispose(group: Group) {
		group.traverse((obj) => {
			if (obj instanceof Mesh) obj.geometry.dispose()
		})
	}

	/** Освободить кусок, если он уже не в кэше и не на сцене. */
	function release(group: Group) {
		if (!cached.has(group) && !shown.includes(group)) dispose(group)
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

					// Без сдвига внутрь (uInset), как у фигуры: мышцы куска видны только в проёме, где кожи
					// нет, а сдвиг на 3 мм съедал тонкие листы вроде грудной, и сквозь них светила кость
					obj.material = (materials[layer] ?? materials.muscles).material
				})

				// Вытеснен, пока грузился, -- в кэш не кладём, освободит его evict()
				if (cache.get(file) === promise) cached.add(gltf.scene)

				return gltf.scene
			})
			.catch((error) => {
				// Неудачу не запоминаем: при следующем открытии зоны кусок попробуем снова
				console.error(error)

				if (cache.get(file) === promise) cache.delete(file)

				return null
			})

		cache.set(file, promise)
		evict()

		return promise
	}

	function evict() {
		for (const [file, promise] of cache) {
			if (cache.size <= KEEP) break

			cache.delete(file)

			// Кусок на сцене освободит show(), когда его уберёт
			void promise.then((group) => {
				if (!group) return

				cached.delete(group)
				release(group)
			})
		}
	}

	/** Убрать со сцены прежние куски; вытесненные из кэша, пока были на сцене, -- освободить. */
	function replace(groups: Group[]) {
		const old = shown

		shown = groups

		for (const group of old) {
			if (groups.includes(group)) continue

			scene.remove(group)
			release(group)
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
				replace([])
				cut(null, 0)

				return
			}

			const groups = (await Promise.all((await files(key)).map(load))).filter((g): g is Group => !!g)

			// Пока грузили, зону успели сменить или закрыть -- этот кусок уже не нужен
			if (wanted !== key) return

			replace(groups)

			// У зоны нет куска («Всё тело») или он не загрузился -- остаётся лёгкая фигура
			if (!groups.length) return cut(null, 0)

			for (const group of groups) scene.add(group)

			cut(point, radius)
			applyHighlight()
			// Метка для замера догрузки: от клика по зоне до куска на сцене
			performance.mark(`detail:${key}`)
		},
		/**
		 * Каждый кадр: слои куска следуют за проёмом кожи `radius`. Мышцы расходятся на `deep`
		 * у глубокой травмы, сосуды и нервы видны только в этой сфере, `highlight` -- сила подсветки.
		 * `peel` -- сфера снимает лишь мышцы над подсвеченными, сосуды и нервы не нужны.
		 */
		sync(center: Vector3, radius: number, deep: number, highlight: number, peel: boolean) {
			if (!shown.length) return

			for (const [layer, m] of Object.entries(materials)) {
				m.uniforms.uCenter.value.copy(center)
				// Кости видны и без проёма -- их закрывает кожа; остальное рисуем только в проёме
				m.uniforms.uOuter.value = layer === 'bones' ? -1 : DEEP.has(layer) ? (peel ? 0 : deep) : radius
				m.uniforms.uRadius.value = layer === 'muscles' ? deep : 0
			}

			materials.muscles.uniforms.uHighlight.value = highlight
			materials.muscles.uniforms.uPeel.value = peel ? 1 : 0
		},
		/** Подсветить мышцы куска по строкам в названиях; `null` гасит. */
		highlight(names: string[] | null) {
			highlighted = names
			applyHighlight()
		},
		/** Цвет мышц при смене темы. */
		recolor(color: string) {
			materials.muscles.material.color.set(color)
		},
	}
}
