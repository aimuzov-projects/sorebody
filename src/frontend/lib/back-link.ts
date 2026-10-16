/**
 * Стрелка «Назад» в шапке лонгрида (`[data-back]`, ссылка на главную). Пришли со страницы
 * сайта -- возвращает туда же, с её прокруткой; иначе срабатывает как обычная ссылка.
 */
export function initBackLink() {
	document.querySelector('[data-back]')?.addEventListener('click', (event) => {
		if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) {
			event.preventDefault()
			history.back()
		}
	})
}
