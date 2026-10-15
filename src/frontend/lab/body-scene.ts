import {
	AmbientLight,
	DirectionalLight,
	HemisphereLight,
	Mesh,
	MeshStandardMaterial,
	NeutralToneMapping,
	OrthographicCamera,
	Scene,
	SRGBColorSpace,
	Vector3,
	WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { createDissolveMaterial } from './dissolve.ts'

/** Высота кадра в метрах модели: фигура 1,72 м плюс поля. */
type Vec3 = [number, number, number]

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

	scene.add(new HemisphereLight('#fffaf2', '#c9bfb1', 1.6))
	scene.add(new AmbientLight('#ffffff', 0.25))
	const key = new DirectionalLight('#fff4e6', 1.9)

	key.position.set(2, 3, 2.5)
	scene.add(key)
	const rim = new DirectionalLight('#e8eef7', 0.9)

	rim.position.set(-2.5, 1.5, -2)
	scene.add(rim)

	const controls = new OrbitControls(camera, canvas)

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
	const skin = createDissolveMaterial('#f4f1ec', '#d98a4e')
	const muscles = createDissolveMaterial('#e6dcd2', '#b8643a')
	const bones = new MeshStandardMaterial({ color: '#efdcc0', roughness: 0.7, metalness: 0 })
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
	// Наезд на зону: куда сдвинуть центр орбиты и какой зум, и что вернуть после
	let focusTo: { target: Vector3; zoom: number } | null = null
	let restore: { target: Vector3; zoom: number } | null = null
	const step = new Vector3()

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

			if (!focusTo && step.lengthSq() < 1e-10 && Math.abs(goal.zoom - camera.zoom) < 1e-3) restore = null
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
		 * (x вправо, y вверх). `null` возвращает камеру как было до наезда.
		 */
		focus(point: Vec3 | null, zoom = 1, at = { x: 0, y: 0 }) {
			if (!point) {
				focusTo = null

				return
			}

			restore ??= { target: controls.target.clone(), zoom: camera.zoom }
			const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
			const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
			const target = new Vector3(...point)
				.addScaledVector(right, (-at.x * (camera.right - camera.left)) / zoom)
				.addScaledVector(up, (-at.y * (camera.top - camera.bottom)) / zoom)

			focusTo = { target, zoom }
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
