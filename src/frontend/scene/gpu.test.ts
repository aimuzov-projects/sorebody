import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isSoftwareRenderer, probeWebGL } from './gpu.ts'

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

/**
 * Канвас, который отдаёт контекст по правилам браузера: с `failIfMajorPerformanceCaveat` --
 * только быстрый, без него -- любой. `renderer` null -- WebGL нет вовсе.
 */
function fakeCanvas(renderer: string | null, fast: boolean) {
	const lost: string[] = []
	const gl = {
		getExtension: (name: string) =>
			name === 'WEBGL_debug_renderer_info'
				? { UNMASKED_RENDERER_WEBGL: 1 }
				: { loseContext: () => lost.push(name) },
		getParameter: () => renderer,
	}
	const canvas = () =>
		({
			getContext: (_type: string, options: WebGLContextAttributes) =>
				renderer === null || (options.failIfMajorPerformanceCaveat && !fast) ? null : gl,
		}) as unknown as HTMLCanvasElement

	return { canvas, lost }
}

test('видеокарта -- gpu, пробный контекст отпущен', () => {
	const { canvas, lost } = fakeCanvas('Apple GPU', true)

	assert.equal(probeWebGL(canvas), 'gpu')
	assert.equal(lost.length, 1)
})

test('программный рендерер по имени -- software', () => {
	assert.equal(probeWebGL(fakeCanvas('Google SwiftShader', true).canvas), 'software')
})

test('браузер не даёт быстрый контекст, а обычный даёт -- software', () => {
	const { canvas, lost } = fakeCanvas('Adreno (TM) 640', false)

	assert.equal(probeWebGL(canvas), 'software')
	assert.equal(lost.length, 1)
})

test('контекста нет ни с каким параметром -- none', () => {
	assert.equal(probeWebGL(fakeCanvas(null, false).canvas), 'none')
})
