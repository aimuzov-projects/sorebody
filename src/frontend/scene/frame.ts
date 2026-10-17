/**
 * Кадр сцены на старте: камера, окно и сдвиг фигуры. Один источник для сцены
 * (body-scene.ts), для постера, который стоит на месте фигуры до загрузки модели,
 * и для скрипта, который этот постер рендерит (scripts/poster). Без three: модуль
 * нужен и в рантайме до загрузки сцены, и в node.
 */

/** Высота кадра в метрах модели: фигура 1,72 м плюс поля. */
export const FRAME = 2.0
/** Уже этого соотношения сторон фигура упирается в ширину кадра, а не в высоту. */
export const NARROW = 0.62
/** Центр орбиты: ось тела на высоте таза. */
export const TARGET_Y = 0.9
/** Наклон камеры главной от вертикали: чуть сверху, как у продуктового снимка. */
export const POLAR_DEG = 73
/** Стартовый азимут: от лица (+Z) к левому боку (+X), три четверти. */
export const AZIMUTH_DEG = 37.4

/** Сдвиг окна кадра на главной: фигура правее индекса, на телефоне выше нижней панели. */
export function homeShift(width: number) {
	return width < 700 ? { x: 0, y: 0.27, s: 1.9 } : { x: 0.17, y: 0, s: 1 }
}

/**
 * Кадр главной на телефоне по свободной полосе между шапкой и шторкой (`top`, `bottom` --
 * пиксели от верха окна). С постоянным сдвигом фигура стояла мелкой на любом экране: на
 * высоком телефоне и под шторкой без поиска над ней оставалась пустота. Фигура заполняет
 * полосу по высоте, но не крупнее кадра без масштаба.
 */
export function fitShift(box: Box, width: number, height: number, top: number, bottom: number) {
	const base = projectBox(box, width, height, { x: 0, y: 0, s: 1 })
	const free = bottom - top
	const s = Math.max(1, base.height / (free * FIT_FILL))
	// Центр коробки после масштаба встаёт в середину полосы
	const centre = height / 2 + (base.top + base.height / 2 - height / 2) / s
	const y = (centre - (top + free / 2)) / height

	return { x: 0, y, s }
}

/** Доля свободной полосы, которую занимает фигура: остальное -- поля под подписи у точек. */
const FIT_FILL = 0.9

/**
 * Кадр рендера постера: по центру и чуть мельче, чтобы коробка с тенью целиком влезла в окно.
 * Картинку фигуры сдвиг кадра не меняет, только переносит и масштабирует.
 */
export const POSTER_SHIFT = { x: 0, y: 0, s: 1.15 }

type Box = { min: [number, number, number]; max: [number, number, number] }

/**
 * Прямоугольник на экране, куда ортокамера стартового кадра проецирует коробку `box`
 * (метры модели). По нему встаёт постер: он отрендерен ровно по проекции той же коробки.
 */
export function projectBox(box: Box, width: number, height: number, shift = homeShift(width)) {
	const polar = (POLAR_DEG * Math.PI) / 180
	const azimuth = (AZIMUTH_DEG * Math.PI) / 180
	// Направление на камеру и оси экрана в мире: вправо -- горизонтально, вверх -- по наклону
	const toCamera = [Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth)]
	const right = [toCamera[2], 0, -toCamera[0]]
	const rightLength = Math.hypot(...right)

	right.forEach((v, i) => (right[i] = v / rightLength))

	const up = [
		toCamera[1] * right[2] - toCamera[2] * right[1],
		toCamera[2] * right[0] - toCamera[0] * right[2],
		toCamera[0] * right[1] - toCamera[1] * right[0],
	]
	const half = (width / height < NARROW ? (FRAME * NARROW) / (width / height) : FRAME) / 2
	const w = half * (width / height) * shift.s
	const h = half * shift.s
	const dx = shift.x * 2 * w
	const dy = shift.y * 2 * h
	let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]

	for (const x of [box.min[0], box.max[0]])
		for (const y of [box.min[1], box.max[1]])
			for (const z of [box.min[2], box.max[2]]) {
				const p = [x, y - TARGET_Y, z]
				const u = p[0] * right[0] + p[1] * right[1] + p[2] * right[2]
				const v = p[0] * up[0] + p[1] * up[1] + p[2] * up[2]
				const sx = ((u + w + dx) / (2 * w)) * width
				const sy = ((h - dy - v) / (2 * h)) * height

				x0 = Math.min(x0, sx)
				x1 = Math.max(x1, sx)
				y0 = Math.min(y0, sy)
				y1 = Math.max(y1, sy)
			}

	return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 }
}
