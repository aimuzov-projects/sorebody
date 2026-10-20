/**
 * Свайп вправо на сенсорном экране -- то же, что «Назад» на странице: нажимает видимую стрелку
 * (ридер, панель зоны, шапка лонгрида), поэтому ведёт туда же, куда она. Нет видимой стрелки
 * (главная, Telegram со своей кнопкой) -- свайп ничего не делает.
 *
 * Touch-события, а не pointer: на pointer браузер, забрав жест под прокрутку, шлёт pointercancel,
 * и конца свайпа не видно. Не считаются жесты с модели (там её вращают), из горизонтальной
 * прокрутки и полей ввода, а также от самого левого края: там iOS листает историю сам, и шаг
 * назад случился бы дважды.
 */

/** Стрелки «Назад» по старшинству: ридер лежит поверх зоны, зона -- поверх сцены. */
const BACK = ['.reader__back', '.zone__back', '.article-bar__back']

/** Сколько нужно протянуть вправо и во сколько раз больше, чем по вертикали. */
const DISTANCE = 80
const RATIO = 2
/** Дольше -- это уже не свайп, а неторопливое перетаскивание. */
const MAX_TIME = 700
/** Полоса у левого края, которую оставляем системному жесту. */
const EDGE = 24

const isScroller = (el: Element) => {
	const { overflowX } = getComputedStyle(el)

	return (overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth
}

function ignored(target: EventTarget | null) {
	if (!(target instanceof Element)) return true

	if (target.closest('canvas, input, textarea, select, [contenteditable]')) return true

	for (let el: Element | null = target; el && el !== document.body; el = el.parentElement)
		if (isScroller(el)) return true

	return false
}

const visible = (el: HTMLElement) => el.checkVisibility({ visibilityProperty: true }) && el.getClientRects().length > 0

function backControl() {
	for (const selector of BACK) {
		const found = [...document.querySelectorAll<HTMLElement>(selector)].find(visible)

		if (found) return found
	}

	return null
}

export function initSwipeBack() {
	let start: { x: number; y: number; time: number } | null = null

	document.addEventListener(
		'touchstart',
		(event) => {
			const touch = event.touches[0]

			start =
				event.touches.length === 1 && touch && touch.clientX > EDGE && !ignored(event.target)
					? { x: touch.clientX, y: touch.clientY, time: event.timeStamp }
					: null
		},
		{ passive: true },
	)

	document.addEventListener(
		'touchend',
		(event) => {
			const touch = event.changedTouches[0]
			const from = start

			start = null

			if (!from || !touch || event.timeStamp - from.time > MAX_TIME) return

			const dx = touch.clientX - from.x
			const dy = Math.abs(touch.clientY - from.y)

			if (dx < DISTANCE || dx < dy * RATIO) return

			// Выделяли текст пальцем -- это не свайп
			if (!document.getSelection()?.isCollapsed) return

			backControl()?.click()
		},
		{ passive: true },
	)

	document.addEventListener('touchcancel', () => (start = null), { passive: true })
}
