import { Box3, Color, Group, MathUtils, Matrix4, Mesh, Object3D, PerspectiveCamera, Scene, Vector3 } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { IMAGE_HEIGHT, IMAGE_WIDTH } from '#frontend/lib/article-image.ts'

import { LAYERS, partIds } from './detail.ts'
import { BONE_RIM, createDissolveMaterial, MUSCLE_RIM, type ShaderExtra } from './dissolve.ts'
import { jointAngle, rigPose, type ModelRig } from './rig.ts'
import { createRenderer, createStudioLights, disposeTree, muscleColor, watchTheme } from './studio.ts'

export type ModelViewer = Awaited<ReturnType<typeof createModelViewer>>

/** Угол камеры по вертикали в кадре иллюстрации, градусы. */
const FOV = 28
/** Тангенс половины угла по горизонтали в том же кадре. */
const WIDE_HALF = Math.tan(MathUtils.degToRad(FOV / 2)) * (IMAGE_WIDTH / IMAGE_HEIGHT)
/**
 * Доля ширины широкого кадра, которая влезает в узкий (телефон). Не вся: иначе модель мелкая
 * и тонет в пустом месте сверху и снизу; движущаяся кость при этом уходит за край.
 */
const NARROW_SHARE = 0.5
/** Цвет сухожилий: белёсый, как на иллюстрациях статьи. */
const TENDON = '#ece4d6'

/**
 * Подсвеченная структура не мышечного слоя: связки, хрящ и сухожилия и так светлые, и одно лишь
 * побледнение остальных их не выделило бы -- красим её насыщенным цветом слоя.
 */
const HIT: Record<string, string> = {
	ligaments: '#2f62c9',
	cartilage: '#2f62c9',
	tendons: '#2f62c9',
	eye: '#2f62c9',
	nerves: '#d29a00',
	// Зубы -- единственные кости с названиями частей: подсвеченный резец тёплый на белых соседях
	bones: '#d9963a',
	brain: '#c65a4b',
}

function hitShader(color: string): ShaderExtra {
	return {
		key: 'model-hit',
		uniforms: { uHitColor: { value: new Color(color) } },
		fragmentCommon: 'uniform vec3 uHitColor;',
		color: 'if (hit > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, uHitColor, 0.7 * uHighlight / 0.45);',
	}
}

/** Два дополнения шейдера в одно: поворот по весу и подсветка. */
function joinShaders(a: ShaderExtra | undefined, b: ShaderExtra | undefined): ShaderExtra | undefined {
	if (!a || !b) return a ?? b

	const glue = (x?: string, y?: string) => [x, y].filter(Boolean).join('\n')

	return {
		key: `${a.key}+${b.key}`,
		uniforms: { ...a.uniforms, ...b.uniforms },
		vertexCommon: glue(a.vertexCommon, b.vertexCommon),
		normal: glue(a.normal, b.normal),
		position: glue(a.position, b.position),
		fragmentCommon: glue(a.fragmentCommon, b.fragmentCommon),
		color: glue(a.color, b.color),
	}
}

/**
 * Мышцы и связки с весом подвижной кости (`_WEIGHT`, scripts/model/rig.mjs): вершина поворачивается
 * вокруг центра сустава на его угол, умноженный на вес. Не смешивание двух положений: так сухожилие,
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
 * 3D-модель в статье по описателю из GLB (scripts/model/rigs/<name>.json): кости, мышцы, связки,
 * сосуды и нервы. Модель крутят мышью или пальцем, `setMotion()` двигает суставы (scene/rig.ts).
 * `highlight` -- названия структур травмы: они остаются цветными, остальные бледнеют. `direction` --
 * откуда смотреть, если не так, как в описателе: с той же стороны, что иллюстрация статьи.
 * Кадр рисуется, только когда что-то сдвинулось.
 */
export async function createModelViewer(
	canvas: HTMLCanvasElement,
	modelUrl: string,
	highlight: string[] = [],
	direction?: [number, number, number],
) {
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
	const rig = gltf.scene.userData.rig as ModelRig
	const nodes = new Map<string, Mesh>()

	gltf.scene.traverse((obj) => {
		if (obj instanceof Mesh) nodes.set(obj.name, obj)
	})

	const bones = createDissolveMaterial(LAYERS.bones, BONE_RIM, 0.5)
	const muscles: ReturnType<typeof createDissolveMaterial>[] = []
	const named: ReturnType<typeof createDissolveMaterial>[] = []
	const rigged: { extra: ShaderExtra; joint: string }[] = []
	const joints = new Map(rig.joints.map((joint) => [joint.name, joint]))

	// Кости и мышцы -- в группах суставов: группа несёт поворот, а узел внутри -- свой сдвиг
	// и масштаб от квантования (build.mjs). Без сустава группа стоит на месте
	const frames = new Map(rig.joints.map((joint) => [joint.name, new Group()]))

	for (const frame of frames.values()) {
		frame.matrixAutoUpdate = false
		scene.add(frame)
	}

	const lit = new Set<string>()

	for (const [name, mesh] of nodes) {
		const group = rig.groups[name]
		const layer = group?.layer ?? 'bones'
		const parts: string[] | undefined = mesh.userData.parts

		mesh.geometry.computeVertexNormals()

		if (layer === 'bones' && !parts) mesh.material = bones.material
		else {
			const weighted = group?.weighted && joints.get(group.weighted.joint)
			let extra: ShaderExtra | undefined

			if (weighted) {
				// Центр и ось -- в координатах меша: вершины квантованы, их масштабирует узел
				const toLocal = new Matrix4().copy(mesh.matrix).invert()

				extra = rigShader(
					new Vector3(...weighted.pivot).applyMatrix4(toLocal),
					new Vector3(...weighted.axis).transformDirection(toLocal),
				)

				rigged.push({ extra, joint: weighted.name })
			}

			const color = layer === 'muscles' ? muscleColor() : (LAYERS[layer] ?? LAYERS.bones)

			if (parts && HIT[layer]) extra = joinShaders(extra, hitShader(HIT[layer]))

			const material = createDissolveMaterial(
				color,
				layer === 'muscles' ? MUSCLE_RIM : BONE_RIM,
				0.78,
				!!parts,
				extra,
			)
			const ids = partIds(parts, highlight)

			material.uniforms.uParts.value = ids

			if (ids.some((id) => id > 0)) lit.add(name)

			mesh.material = material.material

			if (layer === 'muscles') muscles.push(material)

			if (parts) named.push(material)
		}

		if (group?.toggle) mesh.visible = group.toggle.visible

		;(group?.joint && frames.get(group.joint) ? frames.get(group.joint)! : scene).add(mesh)
	}

	// Подсветка травмы: бледнеют все структуры с названиями, кроме названных; если ни одной
	// из них в модели нет -- не бледнеет никто
	for (const material of named) material.uniforms.uHighlight.value = lit.size ? 0.45 : 0

	const view = rig.view
	const focus = new Box3().setFromObject(nodes.get(view.focus) ?? scene)
	const toward = view.toward && joints.get(view.toward)
	const target = focus.getCenter(new Vector3())

	if (toward) target.lerp(new Vector3(...toward.pivot), 0.5)

	const size = focus.getSize(new Vector3()).length()
	const controls = new OrbitControls(camera, canvas)

	canvas.style.removeProperty('cursor')

	camera.position
		.copy(target)
		.add(new Vector3(...(direction ?? view.direction)).normalize().multiplyScalar(size * view.distance))

	controls.target.copy(target)
	controls.enablePan = false
	controls.enableDamping = true
	controls.minDistance = size * 1.2
	controls.maxDistance = size * view.distance * 1.5
	controls.update()

	let dirty = true
	let rendered = 0

	controls.addEventListener('change', () => (dirty = true))

	const stopTheme = watchTheme(() => {
		for (const { material } of muscles) material.color.set(muscleColor())

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
		// В узком кадре (телефон) угол по вертикали растёт, чтобы по ширине влезала
		// почти вся модель широкого кадра, а не только её середина
		camera.fov = Math.max(FOV, MathUtils.radToDeg(2 * Math.atan((WIDE_HALF * NARROW_SHARE) / camera.aspect)))
		camera.updateProjectionMatrix()
		dirty = true
	}

	resize()
	renderer.setAnimationLoop(loop)

	const toggles = Object.entries(rig.groups).flatMap(([name, group]) =>
		group.toggle && nodes.has(name) ? [{ name, ...group.toggle }] : [],
	)

	return {
		title: rig.title,
		about: rig.about,
		motion: rig.motion,
		toggles,
		resize,
		/** Движение модели на `deg` градусов: суставы делят угол по своим долям. */
		setMotion(deg: number) {
			const pose = rigPose(rig, deg)

			for (const [name, frame] of frames) {
				frame.matrix.copy(pose.get(name)!)
				// Без matrixAutoUpdate three.js сам не узнает, что матрица группы сменилась
				frame.matrixWorldNeedsUpdate = true
			}

			for (const { extra, joint } of rigged)
				extra.uniforms.uRigAngle.value = MathUtils.degToRad(jointAngle(rig, joints.get(joint)!, deg))

			dirty = true
		},
		/** Показать или спрятать группу с тумблером (дельтовидная поверх манжеты). */
		setVisible(name: string, on: boolean) {
			const mesh = nodes.get(name)

			if (mesh) mesh.visible = on

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
