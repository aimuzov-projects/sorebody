import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isSoftwareRenderer } from './gpu.ts'

test('программные рендереры WebGL распознаются, видеокарты -- нет', () => {
	for (const name of [
		'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
		'Google SwiftShader',
		'llvmpipe (LLVM 15.0.7, 256 bits)',
		'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)',
	])
		assert.equal(isSoftwareRenderer(name), true, name)

	for (const name of [
		'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)',
		'Apple GPU',
		'Adreno (TM) 640',
		'Mali-G78',
		'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
		'',
	])
		assert.equal(isSoftwareRenderer(name), false, name)
})
