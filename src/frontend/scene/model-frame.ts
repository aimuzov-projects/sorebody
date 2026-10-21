import { IMAGE_HEIGHT, IMAGE_WIDTH } from '#frontend/lib/article-image.ts'

// Кадр камеры 3D-модели статьи (scene/model-viewer.ts) без three.js: его же повторяет снимок
// модели, который лежит под ней, пока она грузится (components/figure-3d.svelte)

/** Угол камеры по вертикали в кадре иллюстрации, градусы. */
export const FOV = 28
/** Тангенс половины угла по горизонтали в том же кадре. */
export const WIDE_HALF = Math.tan(((FOV / 2) * Math.PI) / 180) * (IMAGE_WIDTH / IMAGE_HEIGHT)
/**
 * Доля ширины широкого кадра, которая влезает в узкий (телефон). Не вся: иначе модель мелкая
 * и тонет в пустом месте сверху и снизу; движущаяся кость при этом уходит за край.
 */
export const NARROW_SHARE = 0.5

/**
 * Окно уже этого (ширина к высоте) -- узкий кадр: угол камеры растёт, чтобы по ширине влезала
 * доля NARROW_SHARE широкого кадра. Шире -- угол по вертикали FOV.
 */
export const NARROW_BELOW = (WIDE_HALF * NARROW_SHARE) / Math.tan(((FOV / 2) * Math.PI) / 180)
