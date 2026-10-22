/**
 * Переход: проявиться со сдвигом снизу, при reduced motion -- только прозрачностью.
 * `rise` -- насколько снизу, `instant` -- без анимации: статья из адреса стоит на месте
 * с первого кадра.
 * Через `tick`, а не `css`: `css` вставляет тег стилей, а CSP сайта такое блокирует.
 */
export function fadeUp(node: HTMLElement, { rise = 24, instant = false, reduceMotion = false } = {}) {
	if (instant) return { duration: 0 }

	return {
		duration: reduceMotion ? 250 : 550,
		delay: reduceMotion ? 0 : 120,
		// Близко к cubic-bezier(0.25, 1, 0.5, 1) из CSS: быстрый старт, мягкая посадка
		easing: (t: number) => 1 - (1 - t) ** 4,
		tick: (t: number) => {
			node.style.opacity = String(t)
			// Без сдвига transform не ставим: с ним fixed-потомки (строка чата в ридере)
			// встали бы от ридера, а не от окна, и уехали бы вместе с прокруткой
			node.style.transform = reduceMotion || !rise || t === 1 ? '' : `translateY(${(1 - t) * rise}px)`
		},
	}
}
