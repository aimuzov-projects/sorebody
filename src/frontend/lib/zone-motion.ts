/**
 * Анимации списка зон при смене спорта и фильтров. Через `tick`, а не `css`: `css` вставляет тег
 * стилей, а CSP сайта такое блокирует (см. fade-up.ts). При reduced motion -- без движения.
 */

/** Мягкая посадка, близко к cubic-bezier(0.25, 1, 0.5, 1) из CSS. */
const settle = (t: number) => 1 - (1 - t) ** 4

/** Переход: строка проявляется с небольшим подъёмом снизу, `delay` -- очередь в волне по списку. */
export function appear(node: HTMLElement, { delay = 0, reduceMotion = false } = {}) {
	if (reduceMotion) return { duration: 0 }

	return {
		delay,
		duration: 420,
		easing: settle,
		tick: (t: number) => {
			node.style.opacity = String(t)
			node.style.transform = t === 1 ? '' : `translateY(${(1 - t) * 8}px)`
		},
	}
}

/** Перестановка: строка, сменившая место (на телефоне и колонку), плавно доезжает до нового. */
export function move(node: HTMLElement, { from, to }: { from: DOMRect; to: DOMRect }, { reduceMotion = false } = {}) {
	const dx = from.left - to.left
	const dy = from.top - to.top

	if (reduceMotion || (!dx && !dy)) return { duration: 0 }

	return {
		duration: 480,
		easing: settle,
		tick: (t: number) => {
			node.style.transform = t === 1 ? '' : `translate(${(1 - t) * dx}px, ${(1 - t) * dy}px)`
		},
	}
}

/** Уход: зона, которой нет у нового спорта, быстро гаснет. */
export function drop(node: HTMLElement, { reduceMotion = false } = {}) {
	return {
		duration: reduceMotion ? 0 : 180,
		tick: (t: number) => {
			node.style.opacity = String(t)
		},
	}
}

/**
 * Высота элемента плавно идёт за содержимым: строк стало меньше или больше -- шторка на телефоне
 * не прыгает. Высота ставится явно и меряется с `auto`: при явной высоте `scrollHeight` не видит,
 * что содержимое уменьшилось.
 */
export function smoothHeight(node: HTMLElement, reduceMotion = false) {
	if (reduceMotion) return

	/** Высота до изменения: к моменту, когда сработал MutationObserver, раскладка уже новая. */
	let current = node.offsetHeight
	let moving = false

	const fit = () => {
		node.style.height = 'auto'

		const next = node.offsetHeight

		node.style.height = ''

		if (next === current) return

		node.style.height = `${current}px`
		node.style.overflow = 'hidden'
		// Принудительная раскладка: без неё браузер склеит две высоты и перехода не будет
		void node.offsetHeight
		node.style.transition = 'height 0.45s cubic-bezier(0.25, 1, 0.5, 1)'
		node.style.height = `${next}px`
		current = next
		moving = true
	}

	const done = (event: TransitionEvent) => {
		if (event.target !== node || event.propertyName !== 'height') return

		node.style.transition = ''
		node.style.height = ''
		node.style.overflow = ''
		moving = false
	}

	const mutations = new MutationObserver(fit)
	// Высота меняется и без правки списка (поворот экрана, шрифт догрузился): запоминаем её
	const sizes = new ResizeObserver(() => {
		if (!moving) current = node.offsetHeight
	})

	mutations.observe(node, { childList: true, subtree: true, characterData: true })
	sizes.observe(node)
	node.addEventListener('transitionend', done)

	return () => {
		mutations.disconnect()
		sizes.disconnect()
		node.removeEventListener('transitionend', done)
	}
}
