/**
 * Значок другого названия у заголовка статьи (`[data-alias]`) и его всплывашка
 * (`[data-alias-tip]`, popover). Мышь открывает её наведением, клавиатура -- фокусом, палец --
 * тапом; клик закрепляет, Esc и тап мимо закрывают сами (popover="auto"). Подсказка в верхнем
 * слое, место под значком ставим сами и обновляем при прокрутке. Возвращает функцию снятия.
 */
export function initAliasTip(root: Element, scroller: HTMLElement | Window) {
	const button = root.querySelector<HTMLButtonElement>('[data-alias]')
	const tip = root.querySelector<HTMLElement>('[data-alias-tip]')

	if (!button || !tip) return () => {}

	let pinned = false
	// Открыта ли подсказка до нажатия: тап мимо popover="auto" закрывает её уже на pointerdown
	let wasOpen = false
	const isOpen = () => tip.matches(':popover-open')

	const place = () => {
		if (!isOpen()) return

		const rect = button.getBoundingClientRect()
		const width = tip.offsetWidth
		const max = document.documentElement.clientWidth - width - 16

		tip.style.top = `${rect.bottom + 8}px`
		tip.style.left = `${Math.max(16, Math.min(rect.left - 12, max))}px`
	}

	const show = () => {
		if (!isOpen()) tip.showPopover()

		place()
	}

	const hide = () => {
		if (isOpen()) tip.hidePopover()
	}

	const onEnter = (event: PointerEvent) => event.pointerType === 'mouse' && show()
	const onLeave = (event: PointerEvent) => event.pointerType === 'mouse' && !pinned && hide()
	const onFocus = () => button.matches(':focus-visible') && show()
	const onBlur = () => !pinned && hide()
	const onDown = () => {
		wasOpen = isOpen()
	}

	// Мышью над значком подсказка уже открыта: клик её закрепляет, второй -- закрывает
	const onClick = () => {
		if (wasOpen && pinned) {
			pinned = false
			hide()
		} else {
			pinned = true
			show()
		}
	}

	const onToggle = (event: Event) => {
		const open = (event as ToggleEvent).newState === 'open'

		button.setAttribute('aria-expanded', String(open))

		if (!open) pinned = false
	}

	button.addEventListener('pointerenter', onEnter)
	button.addEventListener('pointerleave', onLeave)
	button.addEventListener('focus', onFocus)
	button.addEventListener('blur', onBlur)
	button.addEventListener('pointerdown', onDown)
	button.addEventListener('click', onClick)
	tip.addEventListener('toggle', onToggle)
	scroller.addEventListener('scroll', place, { passive: true })
	addEventListener('resize', place)

	return () => {
		hide()
		button.removeEventListener('pointerenter', onEnter)
		button.removeEventListener('pointerleave', onLeave)
		button.removeEventListener('focus', onFocus)
		button.removeEventListener('blur', onBlur)
		button.removeEventListener('pointerdown', onDown)
		button.removeEventListener('click', onClick)
		tip.removeEventListener('toggle', onToggle)
		scroller.removeEventListener('scroll', place)
		removeEventListener('resize', place)
	}
}
