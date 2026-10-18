import { site } from '#frontend/data/site.ts'

type Ym = (id: number, method: 'hit', url: string, options: { title: string; referer: string }) => void

/**
 * Просмотр страницы, на которую сайт перешёл без перезагрузки (`history.pushState`): сам счётчик
 * видит только полные загрузки. Вызывать сразу после смены адреса и `document.title`, передав
 * адрес, с которого ушли. Без счётчика (dev, e2e) -- ничего не делает.
 */
export function metrikaHit(referer: string, win: { ym?: Ym; location: Location; document: Document } = window) {
	win.ym?.(site.metrikaId, 'hit', win.location.href, { title: win.document.title, referer })
}
