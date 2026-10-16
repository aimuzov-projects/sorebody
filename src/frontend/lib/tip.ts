type TipOptions = {
	/** Колонка, за края которой подсказка не выходит: заголовок статьи, индекс главной. */
	column: Element
	/** Липкая шапка сверху: над значком подсказка встаёт, только если не залезает под неё. */
	bar?: Element | null
	/** Кто прокручивается вместе со значком: подсказку двигаем следом. */
	scroller?: HTMLElement | Window
	/** Клик закрепляет подсказку и открывает её с пальца. Для ссылки -- нет, клик ведёт по ней. */
	pinOnClick?: boolean
}

/**
 * Подсказка к значку в языке сайта: без рамки, в верхнем слое (popover="auto", поэтому Esc
 * и тап мимо закрывают её сами). Мышь открывает её наведением, клавиатура -- фокусом. Место
 * ставим сами: над значком, а если сверху не хватает места до шапки -- под ним; по горизонтали
 * не шире колонки и экрана. Возвращает функцию снятия.
 */
export function attachTip(
	button: HTMLElement,
	tip: HTMLElement,
	{ column, bar = null, scroller = window, pinOnClick = false }: TipOptions,
) {
	let pinned = false
	// Открыта ли подсказка до нажатия: тап мимо popover="auto" закрывает её уже на pointerdown
	let wasOpen = false
	const isOpen = () => tip.matches(':popover-open')

	const hide = () => {
		if (isOpen()) tip.hidePopover()
	}

	const place = () => {
		if (!isOpen()) return

		const rect = button.getBoundingClientRect()
		// Без шапки подсказка может подняться почти к краю окна: над значком у верха экрана места мало
		const top = Math.max(4, bar?.getBoundingClientRect().bottom ?? 0)

		// Значок уехал под шапку -- подсказке не к чему крепиться
		if (bar && rect.top < top) return hide()

		const { width, height } = tip.getBoundingClientRect()
		const box = column.getBoundingClientRect()
		const viewport = document.documentElement.clientWidth
		const above = rect.top - height - 10 >= top
		const from = Math.max(16, box.left)
		const to = Math.min(viewport - 16, Math.max(box.right, from + width))

		tip.dataset.side = above ? 'top' : 'bottom'
		tip.style.top = `${above ? rect.top - height - 10 : rect.bottom + 10}px`
		tip.style.left = `${Math.max(from, Math.min(rect.left + rect.width / 2 - width / 2, to - width))}px`
	}

	const show = () => {
		if (!isOpen()) tip.showPopover()

		place()
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

		if (pinOnClick) button.setAttribute('aria-expanded', String(open))

		if (!open) pinned = false
	}

	button.addEventListener('pointerenter', onEnter)
	button.addEventListener('pointerleave', onLeave)
	button.addEventListener('focus', onFocus)
	button.addEventListener('blur', onBlur)

	if (pinOnClick) {
		button.addEventListener('pointerdown', onDown)
		button.addEventListener('click', onClick)
	}

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

/**
 * Значок другого названия у заголовка статьи (`[data-alias]`) и его подсказка
 * (`[data-alias-tip]`). Шапка над статьёй: на отдельной странице -- .article-bar, поверх
 * сцены -- полоса своего reader.
 */
export function initAliasTip(root: Element, scroller: HTMLElement | Window) {
	const button = root.querySelector<HTMLButtonElement>('[data-alias]')
	const tip = root.querySelector<HTMLElement>('[data-alias-tip]')

	if (!button || !tip) return () => {}

	const bar = root.closest('.reader')?.querySelector('.reader__bar') ?? document.querySelector('.article-bar')

	return attachTip(button, tip, { column: button.closest('h1') ?? button, bar, scroller, pinOnClick: true })
}
