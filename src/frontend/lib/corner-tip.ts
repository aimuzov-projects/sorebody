/**
 * Подсказка под значком в правом верхнем углу: «О справочнике», «Что нового», тема.
 * Значки стоят у края экрана, поэтому подсказка прижата к правому краю значка. Показывается
 * мышью и фокусом с клавиатуры; с пальца не нужна: после касания она так и висела бы до
 * следующего тапа, а ссылка всё равно уводит со страницы. Возвращает функцию, которая
 * переставляет открытую подсказку, если значок или её текст поменялись.
 */
export function attachCornerTip(target: HTMLElement, tip: HTMLElement) {
	const place = () => {
		if (!tip.matches(':popover-open')) return

		const rect = target.getBoundingClientRect()

		tip.style.top = `${rect.bottom + 2}px`
		tip.style.right = `${document.documentElement.clientWidth - rect.right}px`
	}

	const show = () => {
		tip.showPopover()
		place()
	}

	const hide = () => {
		if (tip.matches(':popover-open')) tip.hidePopover()
	}

	target.addEventListener('pointerenter', (event) => event.pointerType !== 'touch' && show())
	target.addEventListener('pointerleave', hide)
	target.addEventListener('focus', () => target.matches(':focus-visible') && show())
	target.addEventListener('blur', hide)
	addEventListener('scroll', place, { capture: true, passive: true })
	addEventListener('resize', place)

	return place
}

/** Подсказки ссылок в углу (`corner-link.astro`): текст -- подпись ссылки. */
export function initCornerLinks() {
	for (const link of document.querySelectorAll<HTMLElement>('[data-corner-link]')) {
		const tip = link.nextElementSibling

		if (tip instanceof HTMLElement && tip.matches('[data-corner-tip]')) attachCornerTip(link, tip)
	}
}
