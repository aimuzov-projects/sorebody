import { initFigure3d } from './figure-3d.ts'
import { initSourcesPeek } from './sources-peek.ts'
import { initArticleTips } from './tip.ts'
import { initTocMenu } from './toc-menu.ts'

/**
 * Чтение лонгрида: полоса прогресса сверху и активный раздел в оглавлении. Одно и то же
 * для отдельной страницы статьи (скроллится окно) и статьи поверх модели на главной
 * (скроллится свой контейнер). Возвращает функцию, которая всё снимает.
 */
export function initReading(root: Element, scroller: HTMLElement | Window, bar: HTMLElement | null) {
	const box = scroller instanceof Window ? document.documentElement : scroller
	const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
	const links = [...root.querySelectorAll<HTMLAnchorElement>('[data-toc] a')]
	const sections = links.flatMap((link) => root.querySelector(`#${CSS.escape(link.hash.slice(1))}`) ?? [])
	// Уход заголовка в шапку: там, где CSS умеет привязать анимацию к пути заголовка, он всё делает сам
	const titleByScript = !CSS.supports('(timeline-scope: none) and (animation-timeline: view())')
	const title = root.querySelector<HTMLElement>('.article__title')
	const header = (scroller instanceof Window ? document : scroller).querySelector<HTMLElement>('.site-header')
	let frame = 0

	// Сколько пикселей заголовок уже прошёл под строку шапки, как exit у view-timeline
	// в styles/article.css. Место заголовка -- без его же сдвига, иначе уход вверх ускорял бы сам себя
	const titleExit = () => {
		if (!title || !header) return 0

		const rowBottom = header.getBoundingClientRect().bottom - parseFloat(getComputedStyle(header).paddingBottom)
		const top = title.getBoundingClientRect().top - new DOMMatrix(getComputedStyle(title).transform).m42

		return rowBottom - top
	}
	const span = (p: number, from: number, to: number) => Math.min(1, Math.max(0, (p - from) / (to - from)))

	const update = () => {
		frame = 0
		const max = box.scrollHeight - box.clientHeight
		const y = box.scrollTop

		bar?.style.setProperty('transform', `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`)

		// Те же диапазоны, что animation-range в styles/article.css
		if (titleByScript) {
			const exit = titleExit()

			box.style.setProperty('--title-out', String(span(exit, 0, 60)))
			box.style.setProperty('--title-in', String(span(exit, 12, 48)))
			box.style.setProperty('--logo-out', String(span(exit, 0, 24)))
			box.style.setProperty('--logo-visibility', exit >= 24 ? 'hidden' : 'visible')
			box.style.setProperty('--title-visibility', exit > 12 ? 'visible' : 'hidden')
		}

		// Активный -- последний раздел, чей верх уже поднялся выше трети экрана
		const top = scroller instanceof Window ? 0 : scroller.getBoundingClientRect().top
		const line = top + box.clientHeight * 0.3
		const active = sections.findLast((s) => s.getBoundingClientRect().top <= line)
		// Шапка статьи (пункт "Начало") -- не раздел: пока читатель в ней, ни один пункт не текущий,
		// а сам пункт "Начало" прячет CSS по data-at-start
		const atStart = active?.id === 'start'

		root.toggleAttribute('data-at-start', atStart)

		for (const link of links) link.toggleAttribute('aria-current', !atStart && link.hash === `#${active?.id}`)
	}
	const onScroll = () => {
		frame ||= requestAnimationFrame(update)
	}

	scroller.addEventListener('scroll', onScroll, { passive: true })
	// Первый расчёт -- в следующем кадре: на главной статья в этот момент ещё скрыта, у всех
	// разделов нулевые координаты, и активным стал бы последний
	onScroll()

	// Переход к разделу -- из оглавления или ссылкой в тексте, как в пометке "Когда сразу к
	// врачу", -- плавной прокруткой и без смены хеша: на главной хеш ведёт навигацию между
	// сценой, зоной и статьёй, и `#urgent` открывал бы сцену вместо раздела
	const onClick = (event: Event) => {
		const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]')
		const target = link && root.querySelector(`#${CSS.escape(link.hash.slice(1))}`)

		if (!target) return

		event.preventDefault()
		target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
	}

	root.addEventListener('click', onClick)

	const stopTips = initArticleTips(root, scroller)
	const stopTocMenu = initTocMenu(root)
	const stopSourcesPeek = initSourcesPeek(root)
	const stopFigure3d = initFigure3d(root)

	return () => {
		stopTips()
		stopTocMenu()
		stopSourcesPeek()
		stopFigure3d()
		scroller.removeEventListener('scroll', onScroll)
		root.removeEventListener('click', onClick)
		cancelAnimationFrame(frame)
	}
}
