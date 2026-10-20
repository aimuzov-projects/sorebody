// 3D-модель статьи из готовой фигуры главной: описатель с `fromGlb` (rigs/body-muscles.json) берёт
// public/model/<fromGlb>, выбрасывает меши из `drop` (кожу) и пишет описание модели в extras сцены,
// как build.mjs по `rig`. Мышцы фигуры уже перестроены remesh.py и несут `_PART`.
// usage: node rig-body.mjs <rigs/name.json> <public/model dir> <out.glb>
import fs from 'node:fs'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { prune } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

const [descPath, modelDir, outPath] = process.argv.slice(2)
const desc = JSON.parse(fs.readFileSync(descPath, 'utf8'))

await MeshoptDecoder.ready
await MeshoptEncoder.ready

const io = new NodeIO()
	.registerExtensions(ALL_EXTENSIONS)
	.registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
const doc = await io.read(path.join(modelDir, desc.fromGlb))

for (const node of doc.getRoot().listNodes())
	if (desc.drop.includes(node.getName())) {
		node.getMesh()?.dispose()
		node.dispose()
	}

await doc.transform(prune())

const [scene] = doc.getRoot().listScenes()
const groups = Object.fromEntries(desc.groups.map(({ name, ...group }) => [name, group]))

scene.setExtras({
	rig: { title: desc.title, joints: [], groups, motion: null, view: desc.view, about: desc.about },
})

await io.write(outPath, doc)
console.log('written', outPath, fs.statSync(outPath).size)
