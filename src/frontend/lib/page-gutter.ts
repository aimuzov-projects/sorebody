/**
 * Ширина места под полосу прокрутки окна -- в `--page-gutter` на `<html>`. Место держит
 * `scrollbar-gutter: stable` (styles/global.css), а в CSS его ширины не узнать: `100vw`
 * его уже не включает. Нужна статье на главной: у неё своя прокрутка, и без поправки
 * колонка текста стояла бы левее, чем на отдельной странице (article-reader.svelte).
 * При полосах поверх контента (macOS, телефоны) -- 0. При масштабе страницы ширина
 * полосы в CSS-пикселях меняется, поэтому пересчёт на resize.
 */
export function initPageGutter() {
	const root = document.documentElement

	const measure = () => {
		// По body, а не по clientWidth у <html>: на главной overflow: hidden у body уходит окну,
		// и Chrome тогда отдаёт clientWidth без вычета места под полосу. При щипковом масштабе
		// на телефоне innerWidth бывает меньше ширины body -- отсюда max
		const width = document.body.getBoundingClientRect().width

		root.style.setProperty('--page-gutter', `${Math.max(0, Math.round(innerWidth - width))}px`)
	}

	measure()
	addEventListener('resize', measure)
}
