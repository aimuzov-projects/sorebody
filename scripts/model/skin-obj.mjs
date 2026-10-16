// Кожа из public/model/body.glb в OBJ, в мировых координатах сцены (метры, Y вверх): исходник для
// shorts.py. Зависит только от three из зависимостей сайта.
//   node scripts/model/skin-obj.mjs public/model/body.glb skin.obj
import { readFileSync, writeFileSync } from 'node:fs'
import { Vector3 } from 'three'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const [input, output] = process.argv.slice(2)
const buf = readFileSync(input)

new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(
	buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
	'',
	(gltf) => {
		gltf.scene.updateMatrixWorld(true)
		const skin = gltf.scene.getObjectByName('skin')
		const position = skin.geometry.attributes.position
		const index = skin.geometry.index
		const v = new Vector3()
		const lines = []

		for (let i = 0; i < position.count; i++) {
			v.fromBufferAttribute(position, i).applyMatrix4(skin.matrixWorld)
			lines.push(`v ${v.x.toFixed(5)} ${v.y.toFixed(5)} ${v.z.toFixed(5)}`)
		}

		for (let i = 0; i < index.count; i += 3)
			lines.push(`f ${index.getX(i) + 1} ${index.getX(i + 1) + 1} ${index.getX(i + 2) + 1}`)

		writeFileSync(output, lines.join('\n') + '\n')
		console.log(`skin: ${position.count} vertices, ${index.count / 3} triangles -> ${output}`)
	},
	(error) => {
		console.error(error)
		process.exit(1)
	},
)
