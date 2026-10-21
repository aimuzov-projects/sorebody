/**
 * Кнопка "Распечатать памятку" в разделе "Когда сразу к врачу": на бумагу уходят только
 * название, тревожные признаки, первые шаги и "Что запомнить" -- лист на стену зала или в
 * аптечку. Что прятать, решает печатный стиль по `data-print="memo"` (styles/article.css).
 * Кнопка в разметке скрыта: без JS она бы ничего не делала. Возвращает функцию снятия.
 */
export function initPrintMemo(root: Element) {
	const buttons = root.querySelectorAll<HTMLButtonElement>('[data-print-memo]')
	const html = document.documentElement

	const onClick = () => {
		html.dataset.print = 'memo'
		addEventListener('afterprint', () => delete html.dataset.print, { once: true })
		print()
	}

	for (const button of buttons) {
		button.hidden = false
		button.addEventListener('click', onClick)
	}

	return () => buttons.forEach((button) => button.removeEventListener('click', onClick))
}
