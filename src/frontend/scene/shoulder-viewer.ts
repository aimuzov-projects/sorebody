import { Box3, Color, Group, MathUtils, Matrix4, Mesh, Object3D, PerspectiveCamera, Scene, Vector3 } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { IMAGE_HEIGHT, IMAGE_WIDTH } from '#frontend/lib/article-image.ts'

import { partIds } from './detail.ts'
import { BONE_RIM, createDissolveMaterial, MUSCLE_RIM, type ShaderExtra } from './dissolve.ts'
import { rigPose, type ShoulderRig } from './rig.ts'
import { createRenderer, createStudioLights, disposeTree, muscleColor, watchTheme } from './studio.ts'

export type ShoulderViewer = Awaited<ReturnType<typeof createShoulderViewer>>

/** Угол камеры по вертикали в кадре иллюстрации, градусы. */
const FOV = 28
/** Тангенс половины угла по горизонтали в том же кадре. */
const WIDE_HALF = Math.tan(MathUtils.degToRad(FOV / 2)) * (IMAGE_WIDTH / IMAGE_HEIGHT)
/**
 * Доля ширины широкого кадра, которая влезает в узкий (телефон). Не вся: иначе плечо мелкое
 * и тонет в пустом месте сверху и снизу; поднятая рука при этом уходит за край.
 */
const NARROW_SHARE = 0.5
/** Цвет сухожилий: белёсый, как на иллюстрациях статьи. */
const TENDON = '#ece4d6'
/** Мышца травмы в статье о манжете: остальные бледнеют, она остаётся красной. */
const INJURY = ['supraspinatus']

/**
 * Мышцы с весом плечевой кости (`_WEIGHT`, scripts/model/rig.mjs): вершина поворачивается вокруг
 * центра головки на угол сустава, умноженный на вес. Не смешивание двух положений: так сухожилие,
 * огибающее головку, сохраняет радиус и не проваливается в кость. Нормаль и волокна -- тем же поворотом.
 */
function rigShader(head: Vector3, axis: Vector3): ShaderExtra {
	return {
		key: 'shoulder-rig',
		uniforms: {
			uRigHead: { value: head },
			uRigAxis: { value: axis },
			uRigAngle: { value: 0 },
			uTendonColor: { value: new Color(TENDON) },
		},
		vertexCommon: `
attribute float _weight;
attribute float _tendon;
uniform vec3 uRigHead;
uniform vec3 uRigAxis;
uniform float uRigAngle;
varying float vTendon;
mat3 rigRotation(float a) {
	vec3 k = uRigAxis;
	float c = cos(a);
	float s = sin(a);
	float t = 1.0 - c;
	return mat3(
		t * k.x * k.x + c, t * k.x * k.y + s * k.z, t * k.x * k.z - s * k.y,
		t * k.x * k.y - s * k.z, t * k.y * k.y + c, t * k.y * k.z + s * k.x,
		t * k.x * k.z + s * k.y, t * k.y * k.z - s * k.x, t * k.z * k.z + c
	);
}`,
		normal: `mat3 rigR = rigRotation(uRigAngle * _weight);
objectNormal = rigR * objectNormal;`,
		position: `transformed = uRigHead + rigR * (transformed - uRigHead);
#ifdef MUSCLE
vFiber = rigR * vFiber;
#endif
vTendon = _tendon;`,
		fragmentCommon: `
uniform vec3 uTendonColor;
varying float vTendon;`,
		color: 'diffuseColor.rgb = mix(diffuseColor.rgb, uTendonColor, smoothstep(0.15, 0.85, vTendon));',
	}
}

/**
 * 3D-модель правого плеча в статье: кости, мышцы манжеты и дельтовидная (scripts/model/rig.py).
 * Модель крутят мышью или пальцем, `setElevation()` поднимает руку с лопаточно-плечевым ритмом
 * (scene/rig.ts). Кадр рисуется, только когда что-то сдвинулось.
 */
export async function createShoulderViewer(canvas: HTMLCanvasElement, modelUrl: string) {
	const renderer = createRenderer(canvas)
	const scene = new Scene()
	const camera = new PerspectiveCamera(FOV, 1, 0.01, 10)

	// Свет едет с камерой: модель крутят со всех сторон, и спина не должна уходить в тень
	scene.add(camera)

	for (const light of createStudioLights()) {
		camera.add(light)

		if ('target' in light && light.target instanceof Object3D) {
			camera.add(light.target)
			light.target.position.set(0, 0, -1)
		}
	}

	const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
	const gltf = await loader.loadAsync(modelUrl).catch((error: unknown) => {
		renderer.dispose()

		throw error
	})
	const rig = gltf.scene.userData.rig as ShoulderRig
	const nodes = new Map<string, Mesh>()

	gltf.scene.traverse((obj) => {
		if (obj instanceof Mesh) nodes.set(obj.name, obj)
	})

	const bones = createDissolveMaterial('#efe7da', BONE_RIM, 0.5)
	const weighted: ReturnType<typeof createDissolveMaterial>[] = []
	const rigged: ShaderExtra[] = []

	// Кости и мышцы -- в группах суставов: группа несёт поворот, а узел внутри -- свой сдвиг
	// и масштаб от квантования (build.mjs)
	const clavicle = new Group()
	const scapula = new Group()
	const humerus = new Group()

	const groups: Record<string, Group> = { clavicle, scapula, humerus }

	for (const group of [clavicle, scapula, humerus]) {
		group.matrixAutoUpdate = false
		scene.add(group)
	}

	for (const [name, mesh] of nodes) {
		mesh.geometry.computeVertexNormals()

		if (name === 'muscles' || name === 'deltoid') {
			// Центр и ось -- в координатах меша: вершины квантованы, их масштабирует узел
			const toLocal = new Matrix4().copy(mesh.matrix).invert()
			const extra = rigShader(
				new Vector3(...rig.head).applyMatrix4(toLocal),
				new Vector3(...rig.ghAxis).transformDirection(toLocal),
			)
			const material = createDissolveMaterial(muscleColor(), MUSCLE_RIM, 0.78, true, extra)

			material.uniforms.uParts.value = partIds(mesh.userData.parts, INJURY)
			material.uniforms.uHighlight.value = 0.45
			mesh.material = material.material
			weighted.push(material)
			rigged.push(extra)
			scapula.add(mesh)
		} else {
			mesh.material = bones.material

			groups[name]?.add(mesh)
		}
	}

	const deltoid = nodes.get('deltoid')

	if (deltoid) deltoid.visible = false

	// Камера сзади и чуть сбоку, как на иллюстрации; центр орбиты -- между головкой и лопаткой
	const box = new Box3().setFromObject(nodes.get('scapula') ?? scene)
	const target = box.getCenter(new Vector3()).lerp(new Vector3(...rig.head), 0.5)
	const size = box.getSize(new Vector3()).length()
	const controls = new OrbitControls(camera, canvas)

	canvas.style.removeProperty('cursor')
	camera.position.copy(target).add(new Vector3(-0.35, 0.15, -1).normalize().multiplyScalar(size * 3.4))
	controls.target.copy(target)
	controls.enablePan = false
	controls.enableDamping = true
	controls.minDistance = size * 1.2
	controls.maxDistance = size * 5
	controls.update()

	let dirty = true
	let rendered = 0

	controls.addEventListener('change', () => (dirty = true))

	const stopTheme = watchTheme(() => {
		for (const { material } of weighted) material.color.set(muscleColor())

		dirty = true
	})

	function loop() {
		if (!controls.update() && !dirty) return

		dirty = false
		rendered++
		renderer.render(scene, camera)
	}

	function resize() {
		const { clientWidth: w, clientHeight: h } = canvas

		if (!w || !h) return

		renderer.setSize(w, h, false)
		camera.aspect = w / h
		// В узком кадре (телефон, 4:5) угол по вертикали растёт, чтобы по ширине влезала
		// почти вся модель широкого кадра, а не только её середина
		camera.fov = Math.max(FOV, MathUtils.radToDeg(2 * Math.atan((WIDE_HALF * NARROW_SHARE) / camera.aspect)))
		camera.updateProjectionMatrix()
		dirty = true
	}

	resize()
	renderer.setAnimationLoop(loop)

	return {
		resize,
		/** Поднять руку на `deg` градусов от опущенной: сустав и лопатка делят угол по ритму. */
		setElevation(deg: number) {
			const pose = rigPose(rig, deg)

			clavicle.matrix.copy(pose.clavicle)
			scapula.matrix.copy(pose.scapula)
			humerus.matrix.copy(pose.humerus)

			// Без matrixAutoUpdate three.js сам не узнает, что матрица группы сменилась
			for (const group of [clavicle, scapula, humerus]) group.matrixWorldNeedsUpdate = true

			for (const { uniforms } of rigged) uniforms.uRigAngle.value = pose.gh

			dirty = true
		},
		/** Показать дельтовидную мышцу поверх манжеты. */
		setDeltoid(on: boolean) {
			if (deltoid) deltoid.visible = on

			dirty = true
		},
		/** Сколько кадров нарисовано: для автотестов. */
		get rendered() {
			return rendered
		},
		pause(paused: boolean) {
			dirty = true
			renderer.setAnimationLoop(paused ? null : loop)
		},
		dispose() {
			stopTheme()
			renderer.setAnimationLoop(null)
			controls.dispose()
			disposeTree(scene)
			renderer.dispose()
			// Контекст отдаём сразу: на телефоне их мало, а на главной под статьёй живёт сцена фигуры
			renderer.forceContextLoss()
		},
	}
}
