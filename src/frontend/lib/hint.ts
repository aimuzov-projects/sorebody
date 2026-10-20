import { pageWidth } from '#frontend/lib/page-gutter.ts'

const SELECTOR = '[data-hint]'

/**
 * Короткая подпись к значку или ссылке из `data-hint`: та же плашка, что у подсказок статьи
 * (.tip), но одна на всю страницу и только для глаз -- подпись уже есть в aria-label или в тексте.
 * Делегирование на document: элементы, которые дорисовал Svelte, работают без подключения.
 * Показывается мышью и фокусом с клавиатуры; с пальца не нужна: после касания она так и висела
 * бы до следующего тапа. Встаёт над элементом, у верха окна -- под ним, не шире экрана.
 */
export function initHints() {
	const tip = document.createElement('span')

	tip.className = 'tip tip--hint'
	tip.popover = 'manual'
	tip.setAttribute('aria-hidden', 'true')
	document.body.append(tip)

	let target: HTMLElement | null = null
	let opening = 0

	const isOpen = () => tip.matches(':popover-open')

	const place = () => {
		if (!target || !isOpen()) return

		const rect = target.getBoundingClientRect()
		const { width, height } = tip.getBoundingClientRect()
		const above = rect.top - height - 8 >= 4
		const left = rect.left + rect.width / 2 - width / 2

		tip.dataset.side = above ? 'top' : 'bottom'
		tip.style.top = `${above ? rect.top - height - 8 : rect.bottom + 8}px`
		tip.style.left = `${Math.max(16, Math.min(left, pageWidth() - 16 - width))}px`
	}

	// Открытая подсказка следит за подписью: кнопка темы меняет её по клику
	const sync = () => {
		tip.textContent = target?.dataset.hint ?? ''
		place()
	}
	const watcher = new MutationObserver(sync)

	const hide = () => {
		clearTimeout(opening)
		watcher.disconnect()
		target = null

		if (isOpen()) tip.hidePopover()
	}

	const show = (element: HTMLElement) => {
		clearTimeout(opening)
		target = element
		watcher.disconnect()
		watcher.observe(element, { attributeFilter: ['data-hint'] })

		if (!isOpen()) tip.showPopover()

		sync()
	}

	const hintOf = (node: EventTarget | null) => (node instanceof Element ? node.closest<HTMLElement>(SELECTOR) : null)

	document.addEventListener('pointerover', (event) => {
		if (event.pointerType !== 'mouse') return

		const element = hintOf(event.target)

		if (!element || element === target) return

		clearTimeout(opening)
		opening = window.setTimeout(() => show(element), 150)
	})

	document.addEventListener('pointerout', (event) => {
		if (event.pointerType !== 'mouse') return

		const element = hintOf(event.target)

		// Переход между детьми одного элемента -- не уход с него
		if (element && element !== hintOf(event.relatedTarget)) hide()
	})

	document.addEventListener('focusin', (event) => {
		const element = hintOf(event.target)

		if (element?.matches(':focus-visible')) show(element)
	})

	document.addEventListener('focusout', (event) => hintOf(event.target) === target && hide())
	addEventListener('keydown', (event) => event.key === 'Escape' && hide())
	addEventListener('scroll', place, { capture: true, passive: true })
	addEventListener('resize', place)
}
