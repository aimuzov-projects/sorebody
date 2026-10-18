/** Рендерер WebGL рисует процессором, а не видеокартой: сцена на нём тормозит. */
export function isSoftwareRenderer(name: string) {
	return /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(name)
}

export type WebGLSupport = 'none' | 'software' | 'gpu'

/**
 * Чем браузер рисует WebGL: видеокартой, процессором или никак. Контекст с
 * `failIfMajorPerformanceCaveat` браузер не даёт, когда сам считает отрисовку медленной, --
 * тогда пробуем без него, чтобы отличить медленный WebGL от отсутствующего
 */
export function probeWebGL(canvas = () => document.createElement('canvas')): WebGLSupport {
	const fast = context(canvas(), { failIfMajorPerformanceCaveat: true })

	if (fast) return isSoftwareRenderer(release(fast)) ? 'software' : 'gpu'

	const slow = context(canvas(), {})

	if (!slow) return 'none'

	release(slow)

	return 'software'
}

function context(canvas: HTMLCanvasElement, options: WebGLContextAttributes) {
	return (canvas.getContext('webgl2', options) ?? canvas.getContext('webgl', options)) as WebGLRenderingContext | null
}

/** Имя рендерера и сразу отпускаем пробный контекст: их число на странице ограничено. */
function release(gl: WebGLRenderingContext) {
	const info = gl.getExtension('WEBGL_debug_renderer_info')
	const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''

	gl.getExtension('WEBGL_lose_context')?.loseContext()

	return name
}
