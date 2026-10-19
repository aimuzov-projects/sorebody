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

/**
 * Сдвиг окна кадра на главной: фигура правее индекса, на телефоне выше нижней панели.
 * Порог 700 -- тот же, что `width < 700px` в body-3d.svelte.
 */
export function homeShift(width: number) {
	return width < 700 ? { x: 0, y: 0.27, s: 1.9 } : { x: 0.17, y: 0, s: 1 }
}

/**
 * Кадр главной на телефоне по свободной полосе между шапкой и шторкой (`top`, `bottom` --
 * пиксели от верха окна). С постоянным сдвигом фигура стояла мелкой на любом экране: на
 * высоком телефоне и под шторкой без поиска над ней оставалась пустота. Фигура по высоте
 * больше полосы в `FIT_FILL` раз (голова заходит на шапку, ноги -- на шторку), но не крупнее
 * кадра без масштаба: на высоком телефоне она бы иначе разрослась на весь экран.
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

/**
 * Высота фигуры в долях свободной полосы. Больше 1 -- фигура крупнее полосы: на низком телефоне
 * полоса узкая, а места по бокам и под прозрачными шапкой и шторкой хватает. Подбирается на глаз.
 */
export const FIT_FILL = 1.3

/**
 * Кадр рендера постера: по центру и чуть мельче, чтобы коробка с тенью целиком влезла в окно.
 * Картинку фигуры сдвиг кадра не меняет, только переносит и масштабирует.
 */
export const POSTER_SHIFT = { x: 0, y: 0, s: 1.15 }

export type Box = { min: [number, number, number]; max: [number, number, number] }

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

/** Уже стольких пикселей справа от головы подсказка рассыпалась бы на четыре-шесть строк. */
const HINT_SIDE_MIN = 160

/** Ещё уже -- рассыпается совсем, и крестик лезет за край: туда не ставим вовсе. */
export const HINT_SIDE_LAST = 110
/** Высота подсказки в одну строку. */
export const HINT_HEIGHT = 38
/** Зазор от центра точки стопы до подсказки: сама точка и её кольцо при наведении. */
const SPOT_GAP = 14

export type HintPlace = {
	/** Сбоку от головы -- левый край, под ногами -- ось фигуры. */
	x: number
	/** Верх подсказки. */
	y: number
	/** Сбоку -- ширина до края окна, под ногами -- место до `floor`. */
	room: number
	side: boolean
}

/**
 * Место подсказки первого визита на общем плане, по тем же числам камеры, что и постер.
 * Над головой нет места под строкой шапки, а зону "Голова" и её точку закрывать нельзя.
 * Поэтому на широком экране -- справа от головы, вровень с макушкой. Узко там -- под ногами,
 * если между точкой стопы и `floor` (верх подвала сцены) влезает строка. Не влезает и там --
 * снова сбоку, пока там хоть что-то есть. На телефоне -- всегда под ногами, `floor` там --
 * верх заголовка шторки.
 */
export function placeHint(
	{ figure, head, ankles }: { figure: Box; head: Box; ankles: Box },
	width: number,
	height: number,
	shift: { x: number; y: number; s: number },
	floor: number,
): HintPlace {
	const body = projectBox(figure, width, height, shift)
	const feet = body.top + body.height * 0.95
	const axis = body.left + body.width / 2

	// Ноги крупной фигуры заходят на шторку: подсказка не опускается ниже её заголовка
	if (width < 700) {
		const y = Math.min(feet, floor - HINT_HEIGHT)

		return { x: axis, y, room: floor - y, side: false }
	}

	const top = projectBox(head, width, height, shift)
	const left = top.left + top.width + 16
	const room = width - 16 - left
	// В строку подсказка занимает около 330px. Уже -- сразу в две ровные строки по 210px: иначе
	// плашка тянулась на всё место, а перенос оставлял справа пустоту
	const side = { x: left, y: top.top, room: room < 340 ? Math.min(room, 210) : room, side: true }

	if (room >= HINT_SIDE_MIN) return side

	const ankle = projectBox(ankles, width, height, shift)
	const below = ankle.top + ankle.height + SPOT_GAP

	if (floor - HINT_HEIGHT >= below) {
		const y = Math.max(below, Math.min(feet, floor - HINT_HEIGHT))

		return { x: axis, y, room: floor - y, side: false }
	}

	if (room >= HINT_SIDE_LAST) return side

	return { x: axis, y: feet, room: floor - feet, side: false }
}
