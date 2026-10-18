/** Рендерер WebGL рисует процессором, а не видеокартой: сцена на нём тормозит. */
export function isSoftwareRenderer(name: string) {
	return /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(name)
}

/**
 * WebGL без видеокарты или его нет вовсе. Контекст с `failIfMajorPerformanceCaveat` браузер
 * не даёт, когда сам считает отрисовку медленной, остальное ловит имя рендерера
 */
export function softwareWebGL() {
	const canvas = document.createElement('canvas')
	const options = { failIfMajorPerformanceCaveat: true }
	const gl = (canvas.getContext('webgl2', options) ??
		canvas.getContext('webgl', options)) as WebGLRenderingContext | null

	if (!gl) return true

	const info = gl.getExtension('WEBGL_debug_renderer_info')
	const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''

	// Пробный контекст отпускаем сразу: их число на странице ограничено
	gl.getExtension('WEBGL_lose_context')?.loseContext()

	return isSoftwareRenderer(name)
}
