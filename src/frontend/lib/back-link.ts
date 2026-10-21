/**
 * Стрелка «Назад» в шапке лонгрида (`[data-back]`, ссылка на главную) и маленький заголовок
 * рядом с ней. Пришли со страницы сайта -- возвращают туда же, с её прокруткой; иначе
 * срабатывают как обычная ссылка.
 *
 * Сноски и якоря меняют хеш и кладут записи в историю той же страницы: одного шага назад
 * мало, их пропускаем. Если за полторы секунды страница так и не ушла (истории сайта нет),
 * уходим по ссылке.
 *
 * Esc делает то же, что стрелка, как на сцене главной. Открытую подсказку он сначала закрывает,
 * а в поле ввода не трогает.
 */
export function initBackLink() {
	const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-back]')]
	const [link] = links

	for (const back of links) back.addEventListener('click', (event) => goBack(event, back.href))

	// Ссылка вперёд на страницу, откуда пришли (`[data-back-if-from]`, "в статье" у самопроверки),
	// тоже шаг назад: иначе в истории копится статья поверх статьи
	for (const ahead of document.querySelectorAll<HTMLAnchorElement>('[data-back-if-from]'))
		ahead.addEventListener('click', (event) => {
			if (document.referrer && new URL(document.referrer).pathname === ahead.pathname) goBack(event, ahead.href)
		})

	function goBack(event: MouseEvent, href: string) {
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

			if (!left && location.pathname === path) location.assign(href)
		}, 1500)
	}

	addEventListener('keydown', (event) => {
		if (event.key !== 'Escape' || event.defaultPrevented || !link) return

		// Её закроет сам браузер. Подсказка темы ручная, Esc её не закрывает -- она не в счёт
		if (document.querySelector('[popover="auto"]:popover-open')) return

		if ((event.target as Element).closest?.('input, textarea, select, [contenteditable]')) return

		link.click()
	})
}
