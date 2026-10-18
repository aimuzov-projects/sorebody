import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test, type TestContext } from 'node:test'
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, Scene } from 'three'

import { createDetail, detailKey } from './detail.ts'
import { ANCHORS, INJURY_LAYER, injuryLayer, NO_DETAIL } from './zones.ts'

test('the chunk name follows the side of the body: left is +X, the spine is the center', () => {
	assert.equal(detailKey('knee', [0.081, 0.459, 0.011]), 'knee-left')
	assert.equal(detailKey('knee', [-0.081, 0.459, 0.011]), 'knee-right')
	assert.equal(detailKey('lumbar', [0, 1.066, -0.034]), 'lumbar-center')
})

test('every zone point has a chunk in public/model/detail', () => {
	const index = JSON.parse(readFileSync('public/model/detail/index.json', 'utf8'))

	for (const [slug, { points }] of Object.entries(ANCHORS)) {
		const key = (position: [number, number, number]) => detailKey(slug, position)

		for (const { position } of points)
			assert.equal(!!index[key(position)], !NO_DETAIL.has(slug as never), `${key(position)}: в NO_DETAIL или нет`)
	}
})

test('chunks are built around the same points and radii as the zones', () => {
	// scripts/model/detail.py: 'knee': ((0.081, 0.459, 0.011), 0.085),
	const script = readFileSync('scripts/model/detail.py', 'utf8')

	for (const [slug, { radius, points }] of Object.entries(ANCHORS)) {
		const [x, y, z] = points[0].position
		const line = `'${slug}': ((${x}, ${y}, ${z}), ${radius}),`

		assert.ok(script.includes(line), `${slug}: ${line}`)
	}
})

test('every injury layer points to a real injury, and its muscles are in the chunk of its zone', () => {
	const index = JSON.parse(readFileSync('public/model/detail/index.json', 'utf8'))

	for (const [slug, layer] of Object.entries(INJURY_LAYER)) {
		const article = readFileSync(`src/frontend/content/injuries/${slug}.md`, 'utf8')
		const region = article.match(/^region: *(\S+)/m)?.[1]

		assert.ok(region, slug)

		const names = Object.entries(index)
			.filter(([key]) => key.startsWith(`${region}-`))
			.flatMap(([, entry]) => (entry as { muscles: string[] }).muscles)

		for (const muscle of layer.muscles ?? [])
			assert.ok(
				names.some((name) => name.includes(muscle)),
				`${slug}: ${muscle} is not in ${region}`,
			)
	}
})

test('an injury without an entry keeps the muscles and highlights nothing', () => {
	assert.deepEqual(injuryLayer('no-such-injury'), { depth: 'muscle' })
	assert.equal(injuryLayer('acl-tear').depth, 'deep')
})

/** Кусок из одного меша: dispose() его геометрии отмечаем в `disposed`. */
function chunk(disposed: Set<string>, file: string) {
	const group = new Group()
	const geometry = new BufferGeometry()

	geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
	geometry.addEventListener('dispose', () => disposed.add(file))
	group.add(new Mesh(geometry))

	return group
}

/** Детали с подменой загрузчика и fetch: `index` отвечает за индекс, файлы из `failFirst` падают по разу. */
function setup(t: TestContext, index: () => Response, failFirst = new Set<string>()) {
	const loads: string[] = []
	const disposed = new Set<string>()
	const loader = {
		async loadAsync(url: string) {
			const file = url.replace(/^\/d\/|\.glb$/g, '')

			loads.push(file)

			if (failFirst.delete(file)) throw new Error(`${file}: 404`)

			return { scene: chunk(disposed, file) }
		},
	}
	const scene = new Scene()
	const detail = createDetail({
		scene,
		loader: loader as never,
		base: [],
		baseUrl: '/d/',
		lowPower: () => false,
		muscleColor: '#c65a4b',
	})

	t.mock.method(globalThis, 'fetch', async () => index())

	return { detail, scene, loads, disposed }
}

test('a failed chunk is not remembered: the next show loads it again', async (t) => {
	t.mock.method(console, 'error', () => {})
	const { detail, scene, loads } = setup(t, () => Response.json({ a: {} }), new Set(['a']))

	await detail.show('a', [0, 0, 0], 1)
	assert.equal(scene.children.length, 0)

	await detail.show('a', [0, 0, 0], 1)
	assert.deepEqual(loads, ['a', 'a'])
	assert.equal(scene.children.length, 1)
})

test('a failed index is not remembered: the next show asks for it again', async (t) => {
	t.mock.method(console, 'error', () => {})
	let calls = 0
	const { detail, scene } = setup(t, () =>
		++calls === 1 ? new Response(null, { status: 503 }) : Response.json({ a: {} }),
	)

	await detail.show('a', [0, 0, 0], 1)
	assert.equal(scene.children.length, 0)

	await detail.show('a', [0, 0, 0], 1)
	assert.equal(calls, 2)
	assert.equal(scene.children.length, 1)
})

test('a chunk evicted while shown is disposed once it leaves the scene', async (t) => {
	const keys = ['a', 'b', 'c', 'd', 'e']
	const { detail, disposed } = setup(t, () => Response.json(Object.fromEntries(keys.map((key) => [key, {}]))))

	await detail.show('a', [0, 0, 0], 1)

	for (const key of keys.slice(1)) await detail.prefetch(key)

	// «a» вытеснен из кэша, но ещё на сцене
	assert.equal(disposed.has('a'), false)

	await detail.show(null)
	assert.deepEqual([...disposed], ['a'])
})

test('dispose() frees shown and cached chunks and takes them off the scene', async (t) => {
	const { detail, scene, disposed } = setup(t, () => Response.json({ a: {}, b: {} }))

	await detail.show('a', [0, 0, 0], 1)
	await detail.prefetch('b')
	detail.dispose()
	await Promise.resolve()

	assert.equal(scene.children.length, 0)
	assert.deepEqual([...disposed].sort(), ['a', 'b'])
})
