import { site } from '#frontend/data/site.ts'

/** Счётчик: `ym(id, метод, ...аргументы метода)`. */
type Ym = (id: number, method: 'hit' | 'reachGoal', ...args: unknown[]) => void

/**
 * Просмотр страницы, на которую сайт перешёл без перезагрузки (`history.pushState`): сам счётчик
 * видит только полные загрузки. Вызывать сразу после смены адреса и `document.title`, передав
 * адрес, с которого ушли. Без счётчика (dev, e2e) -- ничего не делает.
 */
export function metrikaHit(referer: string, win: { ym?: Ym; location: Location; document: Document } = window) {
	win.ym?.(site.metrikaId, 'hit', win.location.href, { title: win.document.title, referer })
}

/**
 * Цель Метрики: событие, долю которого хотим видеть в отчётах. Счётчик грузится лениво, до него
 * вызовы ждут в очереди `ym`. Без счётчика -- ничего не делает.
 */
export function metrikaGoal(goal: string, win: { ym?: Ym; document?: Document } = window) {
	win.ym?.(site.metrikaId, 'reachGoal', goal)
}
