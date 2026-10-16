/**
 * Стрелка «Назад» в шапке лонгрида (`[data-back]`, ссылка на главную). Пришли со страницы
 * сайта -- возвращает туда же, с её прокруткой; иначе срабатывает как обычная ссылка.
 *
 * Сноски и якоря меняют хеш и кладут записи в историю той же страницы: одного шага назад
 * мало, их пропускаем. Если за полторы секунды страница так и не ушла (истории сайта нет),
 * уходим по ссылке.
 *
 * Esc делает то же, что стрелка, как на сцене главной. Открытую подсказку он сначала закрывает,
 * а в поле ввода не трогает.
 */
export function initBackLink() {
	const link = document.querySelector<HTMLAnchorElement>('[data-back]')

	link?.addEventListener('click', (event) => {
		if (!document.referrer || new URL(document.referrer).origin !== location.origin || history.length < 2) return

		event.preventDefault()

		const path = location.pathname
		let left = false
		const skipOwn = () => location.pathname === path && history.back()

		addEventListener('pagehide', () => (left = true), { once: true })
		addEventListener('popstate', skipOwn)
		history.back()

		setTimeout(() => {
			removeEventListener('popstate', skipOwn)

			if (!left && location.pathname === path) location.assign(link.href)
		}, 1500)
	})

	addEventListener('keydown', (event) => {
		if (event.key !== 'Escape' || event.defaultPrevented || !link) return

		if (document.querySelector(':popover-open')) return

		if ((event.target as Element).closest?.('input, textarea, select, [contenteditable]')) return

		link.click()
	})
}
