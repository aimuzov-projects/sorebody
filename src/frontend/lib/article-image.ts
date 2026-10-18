/** Все иллюстрации статей -- 1200 на 669, это ширина оригинала в srcset. */
export const IMAGE_WIDTH = 1200
export const IMAGE_HEIGHT = 669

/**
 * Уменьшенные копии для телефонов и узких окон. Лежат рядом с оригиналом, собирает их
 * scripts/images/resize.mjs, тест контента проверяет, что каждая на месте и нужной ширины.
 */
export const IMAGE_VARIANTS = [600, 900] as const

/**
 * Ширина картинки в статье: на телефоне колонка минус поля `.article` (20px с боков), до 900px --
 * колонка 680px или окно минус поля 24px, шире -- колонка с выносом на 48px в обе стороны
 * (`.article__figure`). Ридер на главной открывает ту же статью во весь экран, ширины те же.
 */
export const IMAGE_SIZES = '(min-width: 900px) 776px, (min-width: 600px) min(680px, 100vw - 48px), calc(100vw - 40px)'

/** Имя копии, а не оригинала: кончается на `-<ширина>w`. */
export const VARIANT_FILE = /-\d+w\.[a-z]+$/

/** Адрес копии шириной `width`: `/injuries/knee-01.webp` → `/injuries/knee-01-600w.webp`. */
export const imageVariant = (src: string, width: number) => src.replace(/(\.[a-z]+)$/, `-${width}w$1`)

export const imageSrcset = (src: string) =>
	[...IMAGE_VARIANTS.map((w) => `${imageVariant(src, w)} ${w}w`), `${src} ${IMAGE_WIDTH}w`].join(', ')
