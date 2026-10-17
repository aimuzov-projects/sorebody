type TipOptions = {
	/** Колонка, за края которой подсказка не выходит: заголовок статьи, индекс главной. */
	column: Element
	/** Липкая шапка сверху: над значком подсказка встаёт, только если не залезает под неё. */
	bar?: Element | null
	/** Кто прокручивается вместе со значком: подсказку двигаем следом. */
	scroller?: HTMLElement | Window
	/** Клик закрепляет подсказку и открывает её с пальца. Для ссылки -- нет, клик ведёт по ней. */
	pinOnClick?: boolean
	/** Справа от значка, если там хватает места: большая карточка не влезает над ним. */
	side?: 'right'
}

/**
 * Подсказка к значку в языке сайта: без рамки, в верхнем слое (popover="auto": Esc и
 * тап мимо закрывают её сами). Мышь держит её, пока она над значком или подсказкой,
 * клавиатура открывает фокусом. Встаёт над значком, без места до шапки -- под ним,
 * не шире колонки и экрана. Возвращает функцию снятия.
 */
export function attachTip(
	button: HTMLElement,
	tip: HTMLElement,
	{ column, bar = null, scroller = window, pinOnClick = false, side }: TipOptions,
) {
	let pinned = false
	// Мышь ушла со значка: даём ей дойти до подсказки, там в карточке бывает ссылка
	let leaving = 0
	// Мышь лишь пролетает над значком по пути к соседней подсказке: та не должна закрыться
	let opening = 0
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
		const left = rect.right + 4

		if (side === 'right' && left + width <= viewport - 16) {
			const bottom = document.documentElement.clientHeight - 8

			tip.dataset.side = 'right'
			tip.style.top = `${Math.max(top, Math.min(rect.top + rect.height / 2 - height / 2, bottom - height))}px`
			tip.style.left = `${left}px`

			return
		}

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

	const onEnter = (event: PointerEvent) => {
		if (event.pointerType !== 'mouse') return

		clearTimeout(leaving)
		clearTimeout(opening)

		if (isOpen()) return

		opening = window.setTimeout(show, 150)
	}

	// Мышь ушла и со значка, и с подсказки -- закрываем, даже закреплённую кликом
	const onLeave = (event: PointerEvent) => {
		if (event.pointerType !== 'mouse') return

		clearTimeout(opening)
		clearTimeout(leaving)
		leaving = window.setTimeout(hide, 200)
	}

	const onTipEnter = (event: PointerEvent) => event.pointerType === 'mouse' && clearTimeout(leaving)
	const onFocus = () => button.matches(':focus-visible') && show()

	// Фокус ушёл со значка и подсказки; Tab со значка на ссылку внутри неё -- не уход
	const onFocusOut = (event: FocusEvent) => {
		const to = event.relatedTarget as Node | null

		if (to && (to === button || tip.contains(to))) return

		hide()
	}
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
	button.addEventListener('focusout', onFocusOut)

	if (pinOnClick) {
		button.addEventListener('pointerdown', onDown)
		button.addEventListener('click', onClick)
	}

	tip.addEventListener('toggle', onToggle)
	tip.addEventListener('focusout', onFocusOut)
	tip.addEventListener('pointerenter', onTipEnter)
	tip.addEventListener('pointerleave', onLeave)
	// Гравюра атласа грузится лениво, уже в открытой карточке: с ней та вырастает и встаёт иначе
	tip.addEventListener('load', place, true)
	scroller.addEventListener('scroll', place, { passive: true })
	addEventListener('resize', place)

	return () => {
		clearTimeout(leaving)
		clearTimeout(opening)
		hide()
		tip.removeEventListener('pointerenter', onTipEnter)
		tip.removeEventListener('pointerleave', onLeave)
		tip.removeEventListener('load', place, true)
		button.removeEventListener('pointerenter', onEnter)
		button.removeEventListener('pointerleave', onLeave)
		button.removeEventListener('focus', onFocus)
		button.removeEventListener('focusout', onFocusOut)
		tip.removeEventListener('focusout', onFocusOut)
		button.removeEventListener('pointerdown', onDown)
		button.removeEventListener('click', onClick)
		tip.removeEventListener('toggle', onToggle)
		scroller.removeEventListener('scroll', place)
		removeEventListener('resize', place)
	}
}

/**
 * Подсказки статьи: другое название у заголовка, пометка "от нейросети" и таблица
 * атласа у подписи каждой иллюстрации. Кнопка называет id своей подсказки в
 * `data-tip-for`. Шапка над статьёй (.site-header): на отдельной странице -- шапка
 * сайта, поверх сцены -- своя у reader.
 */
export function initArticleTips(root: Element, scroller: HTMLElement | Window) {
	const bar = root.closest('.reader')?.querySelector('.site-header') ?? document.querySelector('.site-header')
	const stops = [...root.querySelectorAll<HTMLElement>('[data-tip-for]')].flatMap((button) => {
		const tip = root.querySelector<HTMLElement>(`#${button.dataset.tipFor}`)

		if (!tip) return []

		return [
			attachTip(button, tip, {
				column: button.closest('h1, figcaption') ?? button,
				bar,
				scroller,
				pinOnClick: true,
				side: tip.classList.contains('tip--atlas') ? 'right' : undefined,
			}),
		]
	})

	return () => stops.forEach((stop) => stop())
}
