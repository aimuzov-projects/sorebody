import {
	AmbientLight,
	DirectionalLight,
	HemisphereLight,
	MathUtils,
	Mesh,
	MeshStandardMaterial,
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

import { createDissolveMaterial } from './dissolve.ts'

type Vec3 = [number, number, number]

/** Высота кадра в метрах модели: фигура 1,72 м плюс поля. */
const FRAME = 2.0
const TARGET = new Vector3(0, 0.9, 0)

export type BodyScene = Awaited<ReturnType<typeof createBodyScene>>

/**
 * Сцена фигуры: ортокамера в три четверти, OrbitControls без панорамы и с зажатым наклоном,
 * фарфоровая оболочка с растворением и кости под ней. Наружу отдаёт проекцию точек на экран
 * и `dissolve()` -- плавно открыть сферу вокруг точки или закрыть её.
 */
export async function createBodyScene(canvas: HTMLCanvasElement, modelUrl: string) {
	const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })

	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
	renderer.outputColorSpace = SRGBColorSpace
	renderer.toneMapping = NeutralToneMapping

	const scene = new Scene()
	const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 20)

	camera.position.set(2.6, 2.2, 3.4)

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
	controls.minPolarAngle = Math.PI * 0.3
	controls.maxPolarAngle = Math.PI * 0.55
	controls.minZoom = 0.9
	controls.maxZoom = 2.6
	controls.autoRotate = true
	controls.autoRotateSpeed = 0.6
	controls.update()

	// Слои снаружи внутрь: кожа раскрывается на весь радиус, мышцы -- на часть, кости целы
	// Сатиновая керамика снаружи, кромка среза -- синяя, как акцент интерфейса
	const skin = createDissolveMaterial('#f5f5f3', '#4a9bff', 0.42)
	const muscles = createDissolveMaterial('#e8e4df', '#0071e3', 0.6)
	const bones = new MeshStandardMaterial({ color: '#efe7da', roughness: 0.5, metalness: 0 })
	const MUSCLE_SHARE = 0.6

	const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
	const gltf = await loader.loadAsync(modelUrl)

	gltf.scene.traverse((obj) => {
		if (!(obj instanceof Mesh)) return

		obj.geometry.computeVertexNormals()

		// Квантованный меш масштабирован узлом, поэтому 3 мм переводим в его единицы
		if (obj.name.startsWith('muscles')) muscles.uniforms.uInset.value = 0.003 / obj.getWorldScale(new Vector3()).x

		obj.material = obj.name.startsWith('bones')
			? bones
			: obj.name.startsWith('muscles')
				? muscles.material
				: skin.material
	})

	scene.add(gltf.scene)

	function resize() {
		const { clientWidth: w, clientHeight: h } = canvas

		renderer.setSize(w, h, false)
		const aspect = w / h
		// В узком кадре фигура упирается в ширину, а не в высоту
		const half = aspect < 0.62 ? (FRAME * 0.62) / aspect / 2 : FRAME / 2

		camera.left = -half * aspect
		camera.right = half * aspect
		camera.top = half
		camera.bottom = -half
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
	let last = performance.now()
	let onFrame: (() => void) | undefined

	// Наезд на зону: куда сдвинуть центр орбиты, какой зум и ракурс, и что вернуть после
	type Shot = { target: Vector3; zoom: number; azimuth: number; polar: number }

	let focusTo: Shot | null = null
	let restore: Shot | null = null
	const step = new Vector3()
	const offset = new Vector3()
	const orbit = new Spherical()

	function currentShot(): Shot {
		orbit.setFromVector3(offset.subVectors(camera.position, controls.target))

		return { target: controls.target.clone(), zoom: camera.zoom, azimuth: orbit.theta, polar: orbit.phi }
	}

	const loop = (now: number) => {
		const dt = Math.min((now - last) / 1000, 0.1)

		last = now
		radius += (radiusTo - radius) * (1 - Math.exp(-dt * 7))

		if (Math.abs(radiusTo - radius) < 0.0005) radius = radiusTo

		skin.uniforms.uRadius.value = radius
		muscles.uniforms.uRadius.value = radius * MUSCLE_SHARE

		const goal = focusTo ?? restore

		if (goal) {
			const k = 1 - Math.exp(-dt * 6)

			step.subVectors(goal.target, controls.target).multiplyScalar(k)
			controls.target.add(step)
			camera.position.add(step)
			camera.zoom += (goal.zoom - camera.zoom) * k
			camera.updateProjectionMatrix()

			// Облёт к ракурсу вокруг центра орбиты, по азимуту -- кратчайшей дугой
			orbit.setFromVector3(offset.subVectors(camera.position, controls.target))
			const turn = Math.atan2(Math.sin(goal.azimuth - orbit.theta), Math.cos(goal.azimuth - orbit.theta))

			orbit.theta += turn * k
			orbit.phi += (goal.polar - orbit.phi) * k
			camera.position.copy(controls.target).add(offset.setFromSpherical(orbit))
			camera.lookAt(controls.target)

			const settled =
				step.lengthSq() < 1e-10 &&
				Math.abs(goal.zoom - camera.zoom) < 1e-3 &&
				Math.abs(turn) < 1e-3 &&
				Math.abs(goal.polar - orbit.phi) < 1e-3

			if (!focusTo && settled) restore = null
		}

		controls.update(dt)
		renderer.render(scene, camera)
		onFrame?.()
		adaptPixelRatio(now)
	}

	// Слабый GPU не тянет ретину: если за секунду меньше 45 кадров, рисуем в 1x
	let windowFrom = performance.now()
	let windowFrames = 0

	function adaptPixelRatio(now: number) {
		if (renderer.getPixelRatio() <= 1) return

		windowFrames++

		if (now - windowFrom < 1000) return

		if (windowFrames < 45) {
			renderer.setPixelRatio(1)
			resize()
		}

		windowFrom = now
		windowFrames = 0
	}

	renderer.setAnimationLoop(loop)

	return {
		resize,
		project,
		facing,
		controls,
		set onFrame(fn: (() => void) | undefined) {
			onFrame = fn
		},
		dissolve(center: Vec3 | null, radius = 0) {
			if (center) {
				skin.uniforms.uCenter.value.set(...center)
				muscles.uniforms.uCenter.value.set(...center)
			}

			radiusTo = center ? radius : 0
		},
		/**
		 * Наехать на точку так, чтобы при зуме `zoom` она встала в `at` -- долях кадра от центра
		 * (x вправо, y вверх). `view` -- ракурс в градусах: азимут от лица (+Z) к левому боку
		 * (+X) и угол от вертикали; без него ракурс остаётся текущим. `null` возвращает камеру
		 * как было до наезда.
		 */
		focus(point: Vec3 | null, zoom = 1, at = { x: 0, y: 0 }, view?: { azimuth: number; polar: number }) {
			if (!point) {
				focusTo = null

				return
			}

			const now = currentShot()

			restore ??= now
			const azimuth = view ? MathUtils.degToRad(view.azimuth) : now.azimuth
			const polar = view ? MathUtils.degToRad(view.polar) : now.polar
			// Сдвиг считаем в осях будущего ракурса, а не текущего: камера ещё повернётся
			const toCamera = new Vector3().setFromSphericalCoords(1, polar, azimuth)
			const right = new Vector3(0, 1, 0).cross(toCamera).normalize()
			const up = toCamera.clone().cross(right)
			const target = new Vector3(...point)
				.addScaledVector(right, (-at.x * (camera.right - camera.left)) / zoom)
				.addScaledVector(up, (-at.y * (camera.top - camera.bottom)) / zoom)

			focusTo = { target, zoom, azimuth, polar }
		},
		pause(paused: boolean) {
			last = performance.now()
			windowFrom = last
			windowFrames = 0
			renderer.setAnimationLoop(paused ? null : loop)
		},
		dispose() {
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
