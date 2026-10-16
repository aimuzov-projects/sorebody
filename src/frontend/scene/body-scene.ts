import {
	AmbientLight,
	Box3,
	DirectionalLight,
	HemisphereLight,
	MathUtils,
	Mesh,
	NeutralToneMapping,
	OrthographicCamera,
	PlaneGeometry,
	Scene,
	ShaderMaterial,
	Spherical,
	SRGBColorSpace,
	Vector3,
	WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { createDetail, DETAIL_REACH, detailKey, partIds } from './detail.ts'
import { BONE_RIM, createDissolveMaterial, MUSCLE_RIM, SKIN_RIM } from './dissolve.ts'
import { AZIMUTH_DEG, FRAME, NARROW, POLAR_DEG, TARGET_Y } from './frame.ts'

type Vec3 = [number, number, number]

const TARGET = new Vector3(0, TARGET_Y, 0)
/** Предел зума колёсиком и щипком: ближе фигура заходит на индекс слева. Наезд на зону и травму его поднимает. */
const MAX_ZOOM = 2.6
const POLAR = MathUtils.degToRad(POLAR_DEG)
/** Ракурсы зон по наклону лежат в этих пределах; ниже горизонта камера не опускается. */
const POLAR_RANGE = [MathUtils.degToRad(50), MathUtils.degToRad(80)] as const

export type BodyScene = Awaited<ReturnType<typeof createBodyScene>>

/**
 * Сцена фигуры: ортокамера в три четверти, OrbitControls без панорамы и с зажатым наклоном,
 * фарфоровая оболочка с растворением и кости под ней. Наружу отдаёт проекцию точек на экран
 * и `dissolve()` -- плавно открыть сферу вокруг точки или закрыть её.
 */
export async function createBodyScene(
	canvas: HTMLCanvasElement,
	modelUrl: string,
	onProgress?: (share: number) => void,
) {
	const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })

	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
	renderer.outputColorSpace = SRGBColorSpace
	renderer.toneMapping = NeutralToneMapping

	const scene = new Scene()
	const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 20)

	// Стартовый ракурс -- из frame.ts: по тем же числам до загрузки встаёт постер фигуры
	camera.position.setFromSphericalCoords(5, POLAR, MathUtils.degToRad(AZIMUTH_DEG)).add(TARGET)

	// Студийный свет продуктового рендера: мягкий верхний, ключ спереди-слева, заполняющий
	// справа и контровой сзади, чтобы силуэт отделялся от фона
	scene.add(new HemisphereLight('#ffffff', '#d4d4d9', 1.25))
	scene.add(new AmbientLight('#ffffff', 0.2))

	const lights: [string, number, Vec3][] = [
		['#ffffff', 2.1, [-1.6, 3, 2.8]],
		['#f2f4f8', 0.7, [2.8, 1.2, 1.4]],
		['#ffffff', 1.5, [0.4, 2.2, -3.2]],
	]

	for (const [color, intensity, [x, y, z]] of lights) {
		const light = new DirectionalLight(color, intensity)

		light.position.set(x, y, z)
		scene.add(light)
	}

	scene.add(createContactShadow())

	const controls = new OrbitControls(camera, canvas)

	// OrbitControls ставит инлайн cursor: auto и глушит курсоры из CSS компонента
	canvas.style.removeProperty('cursor')

	controls.target.copy(TARGET)
	controls.enablePan = false
	controls.enableDamping = true
	// Наклон камеры не меняется: фигура только вертится вокруг своей оси и не уезжает
	// на индекс. focus() снимает зажим, чтобы облететь к ракурсу зоны, и ставит его на новом
	controls.minPolarAngle = controls.maxPolarAngle = POLAR
	controls.minZoom = 0.6
	controls.maxZoom = MAX_ZOOM
	controls.autoRotate = true
	controls.autoRotateSpeed = 0.6
	controls.update()

	// Слои снаружи внутрь: в зоне раскрывается кожа, под ней мышцы; у травмы глубже (связка, мениск,
	// диск, нерв) мышцы расходятся малой сферой. Сатиновая керамика снаружи, кромка среза -- синяя
	const skin = createDissolveMaterial('#f5f5f3', SKIN_RIM, 0.42)

	// Подсветка всей фигуры (зона «Всё тело»): синее свечение кожи, по умолчанию погашено
	skin.material.emissive.set('#3d8bfd')
	skin.material.emissiveIntensity = 0
	// Мышцы как в атласе: красные с волокнами, матовые; в тёмной теме глубже
	const muscles = createDissolveMaterial(muscleColor(), MUSCLE_RIM, 0.78, true)
	// Кости -- тот же материал без растворения: так в них работает вырез под детальный кусок зоны
	const bones = createDissolveMaterial('#efe7da', BONE_RIM, 0.5)
	/** Сфера в мышцах у глубокой травмы -- доля радиуса зоны. */
	const DEEP_SHARE = 0.45

	const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
	// Доля загруженного body.glb -- для полосы под силуэтом; без размера ответа её нет
	const gltf = await loader.loadAsync(modelUrl, (event) => {
		if (event.lengthComputable && event.total) onProgress?.(event.loaded / event.total)
	})

	gltf.scene.traverse((obj) => {
		if (!(obj instanceof Mesh)) return

		obj.geometry.computeVertexNormals()

		// Квантованный меш масштабирован узлом, поэтому 3 мм переводим в его единицы
		if (obj.name.startsWith('muscles')) muscles.uniforms.uInset.value = 0.003 / obj.getWorldScale(new Vector3()).x

		obj.material = obj.name.startsWith('bones')
			? bones.material
			: obj.name.startsWith('muscles')
				? muscles.material
				: skin.material
	})

	scene.add(gltf.scene)

	// Коробка фигуры вместе с тенью на полу: по ней скрипт режет постер, а страница его ставит
	const bounds = new Box3()
		.setFromObject(gltf.scene)
		.union(new Box3(new Vector3(-0.45, 0, -0.3), new Vector3(0.45, 0, 0.3)))

	// Слабый GPU (см. adaptPixelRatio) не получает нервов в детальных кусках зон
	let slow = false
	const detail = createDetail({
		scene,
		loader,
		base: [muscles, bones],
		baseUrl: modelUrl.replace(/[^/]*$/, 'detail/'),
		lowPower: () => slow,
		muscleColor: muscleColor(),
	})

	let baseMuscles: Mesh | undefined

	gltf.scene.traverse((obj) => {
		if (obj instanceof Mesh && obj.name.startsWith('muscles')) baseMuscles = obj
	})

	const darkScheme = matchMedia('(prefers-color-scheme: dark)')
	const themeWatch = new MutationObserver(applyTheme)

	function applyTheme() {
		muscles.material.color.set(muscleColor())
		detail.recolor(muscleColor())
	}

	themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
	darkScheme.addEventListener('change', applyTheme)

	function resize() {
		const { clientWidth: w, clientHeight: h } = canvas

		renderer.setSize(w, h, false)
		const aspect = w / h

		// В узком кадре фигура упирается в ширину, а не в высоту
		half = aspect < NARROW ? (FRAME * NARROW) / aspect / 2 : FRAME / 2
		halfWidth = half * aspect
		applyFrame()
	}

	// Сдвиг кадра в долях экрана: на главной фигура стоит правее индекса (на телефоне -- выше).
	// Двигаем окно камеры, а не центр орбиты: иначе при автоповороте фигура ходила бы по кругу
	let half = FRAME / 2
	let halfWidth = FRAME / 2
	// `s` -- масштаб окна: больше 1, и фигура мельче (на главной телефона она уходит наверх)
	const shift = { x: 0, y: 0, s: 1 }
	const shiftTo = { x: 0, y: 0, s: 1 }

	// Three делит на зум ширину окна, но не его сдвиг: без поправки на зум сдвиг на экране
	// рос бы вместе с зумом и фигура уезжала вправо, на зуме к ней -- за край
	let framedZoom = 1

	function applyFrame() {
		const w = halfWidth * shift.s
		const h = half * shift.s
		const dx = (shift.x * 2 * w) / camera.zoom
		const dy = (shift.y * 2 * h) / camera.zoom

		framedZoom = camera.zoom
		camera.left = -w - dx
		camera.right = w - dx
		camera.top = h - dy
		camera.bottom = -h - dy
		camera.updateProjectionMatrix()
	}

	const projected = new Vector3()

	/** Точка модели → пиксели канваса и глубина (меньше -- ближе к камере). */
	function project(p: Vec3) {
		projected.set(...p).project(camera)

		return {
			x: ((projected.x + 1) / 2) * canvas.clientWidth,
			y: ((1 - projected.y) / 2) * canvas.clientHeight,
			depth: projected.z,
		}
	}

	/** Направление "к камере" -- по нему отсекаем точки на обратной стороне тела. */
	function facing(normal: Vec3) {
		return camera.position
			.clone()
			.sub(TARGET)
			.normalize()
			.dot(new Vector3(...normal))
	}

	let radius = 0
	let radiusTo = 0
	// Сфера в мышцах у глубокой травмы и сила подсветки мышц травмы
	let deep = 0
	let deepTo = 0
	let highlight = 0
	let highlightTo = 0
	// Сфера снимает только мышцы над подсвеченными: сосуды и нервы в ней не показываем
	let peel = false
	let peelTo = false
	// Центр проёма тоже доезжает плавно: при смене травмы в зоне проём переползает к ней
	const center = skin.uniforms.uCenter.value
	const centerTo = new Vector3()
	let glowTo = 0
	let tintTo = 0
	let last = performance.now()
	let onFrame: (() => void) | undefined

	// Наезд на зону: куда сдвинуть центр орбиты, какой зум и ракурс, и что вернуть после
	// `spring` -- доезд пружиной с лёгким перелётом (наезд на травму), иначе экспонентой
	type Shot = { target: Vector3; zoom: number; azimuth: number; polar: number; spring?: boolean }

	let focusTo: Shot | null = null
	let restore: Shot | null = null
	// Человек сам крутит или зумит: наезд не тянет камеру обратно, пока не придёт новый focus()
	let manual = false

	controls.addEventListener('start', () => {
		manual = true
		// Человек вертит фигуру: наклон остаётся тем, к которому камера успела приехать
		orbit.setFromVector3(offset.subVectors(camera.position, controls.target))
		controls.minPolarAngle = controls.maxPolarAngle = orbit.phi
	})

	const step = new Vector3()
	const offset = new Vector3()
	const orbit = new Spherical()
	// Скорости пружины: цель орбиты, зум, азимут и наклон
	const velocity = { target: new Vector3(), zoom: 0, azimuth: 0, polar: 0 }
	const rest = new Vector3()
	const STIFFNESS = 90
	const DAMPING = 2 * Math.sqrt(STIFFNESS) * 0.72
	const springStep = (gap: number, v: number, dt: number) => v + (gap * STIFFNESS - v * DAMPING) * dt

	function currentShot(): Shot {
		orbit.setFromVector3(offset.subVectors(camera.position, controls.target))

		return { target: controls.target.clone(), zoom: camera.zoom, azimuth: orbit.theta, polar: orbit.phi }
	}

	const loop = (now: number) => {
		const dt = Math.min((now - last) / 1000, 0.1)

		last = now
		radius += (radiusTo - radius) * (1 - Math.exp(-dt * 7))
		center.lerp(centerTo, 1 - Math.exp(-dt * 6))
		muscles.uniforms.uCenter.value.copy(center)

		if (Math.abs(radiusTo - radius) < 0.0005) radius = radiusTo

		deep += (deepTo - deep) * (1 - Math.exp(-dt * 5))
		highlight += (highlightTo - highlight) * (1 - Math.exp(-dt * 6))

		if (Math.abs(deepTo - deep) < 0.0005) deep = deepTo

		// Снятая сфера закрывается -- мышцы травмы остаются до конца, иначе мигнули бы
		peel = peelTo || (peel && deepTo === 0 && deep > 0)

		skin.uniforms.uRadius.value = radius
		muscles.uniforms.uRadius.value = deep
		muscles.uniforms.uHighlight.value = highlight
		muscles.uniforms.uPeel.value = peel ? 1 : 0
		// Мышцы видны только в проёме кожи: в BodyParts3D сухожилия у колена и мышцы шеи
		// местами выходят за кожу и проступали серыми полосами. Без проёма мышц нет вовсе
		muscles.uniforms.uOuter.value = radius
		detail.sync(center, radius, deep, highlight, peel)

		const ease = 1 - Math.exp(-dt * 6)

		if (shift.x !== shiftTo.x || shift.y !== shiftTo.y || shift.s !== shiftTo.s) {
			shift.x += (shiftTo.x - shift.x) * ease
			shift.y += (shiftTo.y - shift.y) * ease
			shift.s += (shiftTo.s - shift.s) * ease

			const left = Math.abs(shiftTo.x - shift.x) + Math.abs(shiftTo.y - shift.y) + Math.abs(shiftTo.s - shift.s)

			if (left < 1e-4) Object.assign(shift, shiftTo)

			applyFrame()
		}

		skin.material.emissiveIntensity += (glowTo - skin.material.emissiveIntensity) * ease
		// Подсветка медленнее камеры: резкое появление пятна на коже бросалось в глаза
		const tintEase = 1 - Math.exp(-dt * 3.5)

		skin.uniforms.uTintStrength.value += (tintTo - skin.uniforms.uTintStrength.value) * tintEase
		skin.uniforms.uTintPrevStrength.value *= 1 - tintEase

		const goal = manual ? null : (focusTo ?? restore)

		if (goal) {
			const k = 1 - Math.exp(-dt * 6)
			const gap = rest.subVectors(goal.target, controls.target)

			orbit.setFromVector3(offset.subVectors(camera.position, controls.target))
			// Облёт к ракурсу вокруг центра орбиты, по азимуту -- кратчайшей дугой
			const turn = Math.atan2(Math.sin(goal.azimuth - orbit.theta), Math.cos(goal.azimuth - orbit.theta))
			const tilt = goal.polar - orbit.phi
			const zoomGap = goal.zoom - camera.zoom

			if (goal.spring) {
				// Пружину считаем мелкими шагами: на длинном кадре явный шаг разносит
				const n = Math.ceil(dt * 120)
				const h = dt / n
				let zoomLeft = zoomGap
				let turnLeft = turn
				let tiltLeft = tilt

				step.set(0, 0, 0)

				for (let i = 0; i < n; i++) {
					velocity.target.addScaledVector(gap, STIFFNESS * h).multiplyScalar(1 - DAMPING * h)
					gap.addScaledVector(velocity.target, -h)
					step.addScaledVector(velocity.target, h)
					velocity.zoom = springStep(zoomLeft, velocity.zoom, h)
					zoomLeft -= velocity.zoom * h
					velocity.azimuth = springStep(turnLeft, velocity.azimuth, h)
					turnLeft -= velocity.azimuth * h
					velocity.polar = springStep(tiltLeft, velocity.polar, h)
					tiltLeft -= velocity.polar * h
				}

				camera.zoom = goal.zoom - zoomLeft
				orbit.theta += turn - turnLeft
				orbit.phi = goal.polar - tiltLeft
			} else {
				velocity.target.set(0, 0, 0)
				velocity.zoom = velocity.azimuth = velocity.polar = 0
				step.copy(gap).multiplyScalar(k)
				camera.zoom += zoomGap * k
				orbit.theta += turn * k
				orbit.phi += tilt * k
			}

			// Наклон не уходит за пределы орбиты и при перелёте пружины
			orbit.phi = MathUtils.clamp(orbit.phi, controls.minPolarAngle, controls.maxPolarAngle)
			controls.target.add(step)
			camera.updateProjectionMatrix()
			camera.position.copy(controls.target).add(offset.setFromSpherical(orbit))
			camera.lookAt(controls.target)

			const settled =
				rest.subVectors(goal.target, controls.target).lengthSq() < 1e-10 &&
				Math.abs(zoomGap) < 1e-3 &&
				Math.abs(turn) < 1e-3 &&
				Math.abs(tilt) < 1e-3 &&
				velocity.target.lengthSq() < 1e-8

			if (!focusTo && settled) {
				restore = null
				controls.maxZoom = MAX_ZOOM
				controls.minPolarAngle = controls.maxPolarAngle = POLAR
			}
		}

		controls.update(dt)

		if (camera.zoom !== framedZoom) applyFrame()

		renderer.render(scene, camera)
		onFrame?.()
		adaptPixelRatio(now)
	}

	// Слабый GPU не тянет ретину: если за секунду меньше 45 кадров, рисуем в 1x
	let windowFrom = performance.now()
	let windowFrames = 0

	// Распаковка детального куска сама съедает кадры: пока куски грузятся, не меряем
	let loading = 0

	function quiet(task: Promise<unknown>) {
		loading++

		void task.finally(() => {
			loading--
			windowFrom = performance.now()
			windowFrames = 0
		})
	}

	function adaptPixelRatio(now: number) {
		if (slow) return

		if (loading) {
			windowFrom = now
			windowFrames = 0

			return
		}

		windowFrames++

		if (now - windowFrom < 1000) return

		if (windowFrames < 45) {
			slow = true

			if (renderer.getPixelRatio() > 1) {
				renderer.setPixelRatio(1)
				resize()
			}
		}

		windowFrom = now
		windowFrames = 0
	}

	renderer.setAnimationLoop(loop)

	return {
		/** Коробка фигуры с тенью, метры модели (scripts/poster). */
		bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
		resize,
		/** Заранее загрузить детальный кусок зоны (наведение на строку или точку). */
		prefetchDetail(slug: string, point: Vec3) {
			quiet(detail.prefetch(detailKey(slug, point)))
		},
		/** Детальный кусок зоны вокруг точки `point` для зоны радиуса `size`; `null` -- убрать. */
		showDetail(slug: string | null, point?: Vec3, size = 0) {
			quiet(detail.show(slug && point ? detailKey(slug, point) : null, point, size * DETAIL_REACH))
		},
		project,
		facing,
		controls,
		set onFrame(fn: (() => void) | undefined) {
			onFrame = fn
		},
		/** Сдвиг кадра в долях экрана: x вправо, y вверх. Плавно, в цикле отрисовки. */
		/** `instant` -- без доезда: первый кадр после загрузки сразу встаёт на место. */
		frame(x: number, y: number, scale = 1, instant = false) {
			shiftTo.x = x
			shiftTo.y = y
			shiftTo.s = scale

			if (instant) {
				Object.assign(shift, shiftTo)
				applyFrame()
			}
		},
		glow(on: boolean) {
			glowTo = on ? 0.16 : 0
		},
		/** Подсветить места на коже голубым с переходом в серый; `null` гасит. */
		tint(points: Vec3[] | null, radius = 0.1) {
			if (points?.length) {
				const [a, b = a] = points
				const { uTint, uTintPrev, uTintStrength, uTintPrevStrength } = skin.uniforms
				const moved = !uTint.value[0].equals(new Vector3(...a)) || !uTint.value[1].equals(new Vector3(...b))

				// Другое место -- перетекание: старое пятно гаснет на месте, новое разгорается с нуля
				if (moved && uTintStrength.value > 0.01) {
					uTintPrev.value[0].copy(uTint.value[0])
					uTintPrev.value[1].copy(uTint.value[1])
					skin.uniforms.uTintPrevRadius.value = skin.uniforms.uTintRadius.value
					uTintPrevStrength.value = Math.max(uTintPrevStrength.value, uTintStrength.value)
					uTintStrength.value = 0
				}

				skin.uniforms.uTint.value[0].set(...a)
				skin.uniforms.uTint.value[1].set(...b)
				skin.uniforms.uTintRadius.value = radius
			}

			tintTo = points?.length ? 0.7 : 0
		},
		/**
		 * Проём в коже вокруг точки на `size`; `null` закрывает. `depth` -- травма глубже мышц:
		 * мышцы у точки расходятся сферой поменьше, под ними связки, кости, сосуды и нервы.
		 * `peeled` -- та же сфера снимает только мышцы над подсвеченными (см. highlight).
		 * `midline` -- проём не переходит середину тела, нужен паху.
		 */
		dissolve(point: Vec3 | null, size = 0, depth: 'muscle' | 'deep' = 'muscle', peeled = false, midline = false) {
			skin.uniforms.uMidline.value = midline ? 1 : 0
			muscles.uniforms.uMidline.value = midline ? 1 : 0

			if (point) {
				centerTo.set(...point)

				// Проём закрыт -- открываем сразу на месте, а не ведём центр через всё тело
				if (radius < 0.005) center.copy(centerTo)
			}

			radiusTo = point ? size : 0
			deepTo = point && (depth === 'deep' || peeled) ? size * DEEP_SHARE : 0
			peelTo = peeled && depth !== 'deep'
		},
		/** Подсветить мышцы, в названиях которых есть строки из `names`; `null` гасит. */
		highlight(names: string[] | null) {
			const ids = partIds(baseMuscles?.userData.parts, names)

			muscles.uniforms.uParts.value = ids
			detail.highlight(names)
			highlightTo = names?.length ? 0.45 : 0
		},
		/**
		 * Наехать на точку так, чтобы при зуме `zoom` она встала в `at` -- долях экрана от
		 * центра (x вправо, y вверх); сдвиг кадра задаёт сам наезд. `view` -- ракурс в градусах:
		 * азимут от лица (+Z) к левому боку (+X) и угол от вертикали; без него ракурс остаётся
		 * текущим. `spring` -- доезд пружиной. `null` возвращает камеру как было до наезда.
		 */
		focus(
			point: Vec3 | null,
			zoom = 1,
			at = { x: 0, y: 0 },
			view?: { azimuth: number; polar: number },
			spring = false,
		) {
			manual = false

			// Наклон освобождаем на время облёта: и к ракурсу зоны, и обратно к общему плану
			;[controls.minPolarAngle, controls.maxPolarAngle] = POLAR_RANGE

			if (!point) {
				focusTo = null

				return
			}

			const now = currentShot()

			restore ??= now
			const azimuth = view ? MathUtils.degToRad(view.azimuth) : now.azimuth
			const polar = view ? MathUtils.degToRad(view.polar) : now.polar
			// Центр орбиты -- на оси тела, на высоте точки: фигура и в зоне вертится вокруг
			// своей оси, а не вокруг локтя. В `at` точку ставит сдвиг окна кадра, а не центра.
			// Сдвиг считаем в осях будущего ракурса, а не текущего: камера ещё повернётся
			const target = new Vector3(0, point[1], 0)
			const toCamera = new Vector3().setFromSphericalCoords(1, polar, azimuth)
			const right = new Vector3(0, 1, 0).cross(toCamera).normalize()
			const up = toCamera.clone().cross(right)
			const off = new Vector3(...point).sub(target)

			shiftTo.x = at.x - (off.dot(right) * zoom) / (2 * halfWidth * shiftTo.s)
			shiftTo.y = at.y - (off.dot(up) * zoom) / (2 * half * shiftTo.s)

			// OrbitControls зажимает зум в своих пределах на каждом update()
			controls.maxZoom = Math.max(MAX_ZOOM, zoom)
			focusTo = { target, zoom, azimuth, polar, spring }
		},
		pause(paused: boolean) {
			last = performance.now()
			windowFrom = last
			windowFrames = 0
			renderer.setAnimationLoop(paused ? null : loop)
		},
		dispose() {
			themeWatch.disconnect()
			darkScheme.removeEventListener('change', applyTheme)
			renderer.setAnimationLoop(null)
			controls.dispose()
			renderer.dispose()
		},
	}
}

/**
 * Мягкая контактная тень под стопами, как у продуктового рендера: плоскость на полу
 * с радиальным спадом прозрачности. Настоящие тени от света тут дороже и резче.
 */
function createContactShadow() {
	const material = new ShaderMaterial({
		transparent: true,
		depthWrite: false,
		vertexShader: `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
		fragmentShader: `
varying vec2 vUv;
void main() {
	float r = length(vUv - 0.5) * 2.0;
	float core = 1.0 - smoothstep(0.0, 0.45, r);
	float halo = 1.0 - smoothstep(0.2, 1.0, r);
	gl_FragColor = vec4(0.0, 0.0, 0.0, core * 0.22 + halo * 0.12);
}`,
	})
	const shadow = new Mesh(new PlaneGeometry(0.9, 0.6), material)

	shadow.rotation.x = -Math.PI / 2
	shadow.position.y = 0.002
	shadow.renderOrder = -1

	return shadow
}

/** Красный мышц: в тёмной теме глубже, чтобы не светился на тёмном фоне. Тема -- `<html data-theme>` или система. */
function muscleColor() {
	const theme = document.documentElement.dataset.theme
	const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches

	return dark ? '#a3392f' : '#c65a4b'
}
