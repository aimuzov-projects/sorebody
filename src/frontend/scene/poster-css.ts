/**
 * Место постера фигуры в серверном HTML (components/scene-poster.astro), пока JS сцены не
 * загрузился. Это кадр сцены (scene/frame.ts), записанный в CSS: окно -- размер контейнера
 * `.body3d__start` (`cqw`, `cqh`), он стоит `fixed` на всё окно, как и сцена. На широком экране --
 * projectBox, на телефоне главной -- fitShift по полосе `.body3d__start-band`.
 */
import { createHash } from 'node:crypto'

import { FIT_FILL, FRAME, homeShift, NARROW, viewExtent, type Box } from './frame.ts'
import poster from './poster.json' with { type: 'json' }

/** Сдвиг кадра широкого экрана: homeShift от любой ширины не меньше порога 700. */
export const WIDE_SHIFT = homeShift(700)

/** frameScale в единицах контейнера: процент высоты или ширины на метр модели. */
const scale = (s: number) => `min(${100 / FRAME / s}cqh, ${100 / (FRAME * NARROW * s)}cqw)`

/**
 * Прямоугольник постера как `calc` от размера контейнера. Те же слагаемые, что в projectBox:
 * доля окна до центра орбиты плюс метры модели в пикселях кадра.
 */
export function posterGeometry(box: Box, shift = WIDE_SHIFT) {
	const extent = viewExtent(box)
	const metres = (m: number) => `${m} * ${scale(shift.s)}`

	return {
		left: `calc(${(0.5 + shift.x) * 100}cqw + ${metres(extent.left)})`,
		top: `calc(${(0.5 - shift.y) * 100}cqh - ${metres(extent.top)})`,
		width: `calc(${metres(extent.right - extent.left)})`,
		height: `calc(${metres(extent.top - extent.bottom)})`,
	}
}

/**
 * fitShift через высоту фигуры на экране: она -- меньшее из высоты без масштаба и `FIT_FILL`
 * полос, центр -- в середине полосы, ось -- посередине окна. Остальное -- доли этой высоты.
 */
export function phoneTerms(box: Box) {
	const extent = viewExtent(box)
	const tall = extent.top - extent.bottom

	return { tall, width: (extent.right - extent.left) / tall, left: extent.left / tall }
}

/**
 * То же на телефоне главной. Полоса между шапкой и шторкой -- `--start-top` и `--start-sheet`
 * (components/scene-poster.astro), по ней же сцена считает fitShift.
 */
function phoneGeometry(box: Box) {
	const terms = phoneTerms(box)
	const free = '(100cqh - var(--start-sheet) - var(--start-top))'

	return {
		'--poster-h': `min(${terms.tall} * ${scale(1)}, ${FIT_FILL} * ${free})`,
		left: `calc(50cqw + ${terms.left} * var(--poster-h))`,
		top: `calc(var(--start-top) + (${free} - var(--poster-h)) / 2)`,
		width: `calc(${terms.width} * var(--poster-h))`,
		height: 'var(--poster-h)',
	}
}

const rule = (selector: string, geometry: Record<string, string>) =>
	`${selector}{${Object.entries(geometry)
		.map(([key, value]) => `${key}:${value}`)
		.join(';')}}`

/**
 * Inline-стиль постера: base.astro вставляет такие сам и кладёт хеш в CSP. Порог 700 -- тот же,
 * что у кадра в body-3d.svelte.
 */
export const POSTER_CSS = [
	rule('.body3d__poster-image', posterGeometry(poster.box as Box)),
	`@container (width < 700px){${rule('.body3d__start--home .body3d__poster-image', phoneGeometry(poster.box as Box))}}`,
].join('')

/**
 * Постер в разметке скрыт: без JS сцены не будет, и он лёг бы на список травм из `<noscript>`.
 * Скрипт сразу за ним открывает его до первой отрисовки, если адрес ведёт на общий план. Хеш
 * зоны или статьи и `?region=` (сцена заменит его хешем) начинают с другого кадра. Там же индекс
 * из серверного HTML прячет класс `scene-placed` на `<html>`: иначе до JS сцены он мелькал бы
 * под зоной или статьёй. Снимает класс сцена (components/body-3d.svelte).
 */
export const POSTER_REVEAL =
	"if(!location.hash&&!/[?&]region=/.test(location.search))document.querySelector('.body3d__poster').hidden=false;else document.documentElement.classList.add('scene-placed')"

const sha = (code: string): `sha256-${string}` => `sha256-${createHash('sha256').update(code).digest('base64')}`

/**
 * Хеши стиля и скрипта постера для CSP. Ставит их frontmatter страницы: к телу, где стоит
 * постер, `<meta>` с CSP уже отрисован, и хеш из компонента до него не доходит.
 */
export const POSTER_CSP = { style: sha(POSTER_CSS), script: sha(POSTER_REVEAL) }
