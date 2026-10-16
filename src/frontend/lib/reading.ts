import { initAliasTip } from './alias-tip.ts'

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
	// Уход заголовка в шапку: там, где CSS умеет привязать анимацию к прокрутке, он всё делает сам
	const titleByScript = !CSS.supports('animation-timeline: scroll()')
	let frame = 0

	const update = () => {
		frame = 0
		const max = box.scrollHeight - box.clientHeight
		const y = box.scrollTop

		bar?.style.setProperty('transform', `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`)

		// Те же диапазоны, что animation-range в styles/article.css
		if (titleByScript) {
			box.style.setProperty('--title-out', String(Math.min(1, y / 140)))
			box.style.setProperty('--title-in', String(Math.min(1, Math.max(0, (y - 80) / 80))))
		}

		// Активный -- последний раздел, чей верх уже поднялся выше трети экрана
		const top = scroller instanceof Window ? 0 : scroller.getBoundingClientRect().top
		const line = top + box.clientHeight * 0.3
		const active = sections.findLast((s) => s.getBoundingClientRect().top <= line)

		for (const link of links) link.toggleAttribute('aria-current', link.hash === `#${active?.id}`)
	}
	const onScroll = () => {
		frame ||= requestAnimationFrame(update)
	}

	scroller.addEventListener('scroll', onScroll, { passive: true })
	update()

	// Переход по оглавлению -- плавной прокруткой и без смены хеша: на главной хеш ведёт
	// навигацию между сценой, зоной и статьёй
	const onClick = (event: Event) => {
		const link = (event.target as Element).closest<HTMLAnchorElement>('[data-toc] a')
		const target = link && root.querySelector(`#${CSS.escape(link.hash.slice(1))}`)

		if (!target) return

		event.preventDefault()
		target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
	}

	root.addEventListener('click', onClick)

	const stopAliasTip = initAliasTip(root, scroller)

	return () => {
		stopAliasTip()
		scroller.removeEventListener('scroll', onScroll)
		root.removeEventListener('click', onClick)
		cancelAnimationFrame(frame)
	}
}
