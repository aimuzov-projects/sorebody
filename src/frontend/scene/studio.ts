import {
	AmbientLight,
	DirectionalLight,
	HemisphereLight,
	Mesh,
	NeutralToneMapping,
	SRGBColorSpace,
	WebGLRenderer,
	type Object3D,
} from 'three'

type Vec3 = [number, number, number]

/** Общее для сцены главной и 3D-модели в статье: рендерер, студийный свет, тема и освобождение. */
export function createRenderer(canvas: HTMLCanvasElement) {
	const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })

	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
	renderer.outputColorSpace = SRGBColorSpace
	renderer.toneMapping = NeutralToneMapping

	return renderer
}

/**
 * Студийный свет продуктового рендера: мягкий верхний, ключ спереди-слева, заполняющий
 * справа и контровой сзади, чтобы силуэт отделялся от фона.
 */
export function createStudioLights() {
	const lights: Object3D[] = [new HemisphereLight('#ffffff', '#d4d4d9', 1.25), new AmbientLight('#ffffff', 0.2)]

	const directional: [string, number, Vec3][] = [
		['#ffffff', 2.1, [-1.6, 3, 2.8]],
		['#f2f4f8', 0.7, [2.8, 1.2, 1.4]],
		['#ffffff', 1.5, [0.4, 2.2, -3.2]],
	]

	for (const [color, intensity, [x, y, z]] of directional) {
		const light = new DirectionalLight(color, intensity)

		light.position.set(x, y, z)
		lights.push(light)
	}

	return lights
}

/** Освободить геометрию и материалы всех мешей под `root`: renderer.dispose() их не трогает. */
export function disposeTree(root: Object3D) {
	root.traverse((obj) => {
		if (!(obj instanceof Mesh)) return

		obj.geometry.dispose()

		for (const material of [obj.material].flat()) material.dispose()
	})
}

/** Красный мышц: в тёмной теме глубже, чтобы не светился на тёмном фоне. Тема -- `<html data-theme>` или система. */
export function muscleColor() {
	const theme = document.documentElement.dataset.theme
	const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches

	return dark ? '#a3392f' : '#c65a4b'
}

/** Следить за сменой темы: переключатель сайта (`data-theme`) и системная. Возвращает функцию снятия. */
export function watchTheme(onChange: () => void) {
	const darkScheme = matchMedia('(prefers-color-scheme: dark)')
	const observer = new MutationObserver(onChange)

	observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
	darkScheme.addEventListener('change', onChange)

	return () => {
		observer.disconnect()
		darkScheme.removeEventListener('change', onChange)
	}
}
