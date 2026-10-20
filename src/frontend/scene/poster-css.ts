/**
 * Место постера фигуры в серверном HTML (components/scene-poster.astro), пока JS сцены не
 * загрузился. Это projectBox (scene/frame.ts) кадра широкого экрана, записанный в CSS: окно --
 * размер контейнера `.body3d__poster` (`cqw`, `cqh`), он стоит `fixed` на всё окно, как и сцена.
 * На телефоне кадр подгоняется под шторку индекса (fitShift), а её рисует сцена: там постер
 * встаёт только с ней.
 */
import { createHash } from 'node:crypto'

import { FRAME, homeShift, NARROW, viewExtent, type Box } from './frame.ts'
import poster from './poster.json' with { type: 'json' }

/** Сдвиг кадра широкого экрана: homeShift от любой ширины не меньше порога 700. */
export const WIDE_SHIFT = homeShift(700)

/**
 * Прямоугольник постера как `calc` от размера контейнера. Те же слагаемые, что в projectBox:
 * доля окна до центра орбиты плюс метры модели в пикселях кадра.
 */
export function posterGeometry(box: Box, shift = WIDE_SHIFT) {
	const extent = viewExtent(box)
	// frameScale в единицах контейнера: процент высоты или ширины на метр модели
	const scale = `min(${100 / FRAME / shift.s}cqh, ${100 / (FRAME * NARROW * shift.s)}cqw)`
	const metres = (m: number) => `${m} * ${scale}`

	return {
		left: `calc(${(0.5 + shift.x) * 100}cqw + ${metres(extent.left)})`,
		top: `calc(${(0.5 - shift.y) * 100}cqh - ${metres(extent.top)})`,
		width: `calc(${metres(extent.right - extent.left)})`,
		height: `calc(${metres(extent.top - extent.bottom)})`,
	}
}

const geometry = posterGeometry(poster.box as Box)

/** Inline-стиль постера: base.astro вставляет такие сам и кладёт хеш в CSP. */
export const POSTER_CSS = `.body3d__poster-image{${Object.entries(geometry)
	.map(([key, value]) => `${key}:${value}`)
	.join(';')}}`

/**
 * Постер в разметке скрыт: без JS сцены не будет, и он лёг бы на список травм из `<noscript>`.
 * Скрипт сразу за ним открывает его до первой отрисовки, если адрес ведёт на общий план. Хеш
 * зоны или статьи и `?region=` (сцена заменит его хешем) начинают с другого кадра.
 */
export const POSTER_REVEAL =
	"if(!location.hash&&!/[?&]region=/.test(location.search))document.querySelector('.body3d__poster').hidden=false"

const sha = (code: string): `sha256-${string}` => `sha256-${createHash('sha256').update(code).digest('base64')}`

/**
 * Хеши стиля и скрипта постера для CSP. Ставит их frontmatter страницы: к телу, где стоит
 * постер, `<meta>` с CSP уже отрисован, и хеш из компонента до него не доходит.
 */
export const POSTER_CSP = { style: sha(POSTER_CSS), script: sha(POSTER_REVEAL) }
