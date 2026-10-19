/** Сколько источников видно в свёрнутом списке: первый целиком, второй тает в фон. */
export const SOURCES_PEEK = 2

/**
 * Сворачивает список источников до первых двух с кнопкой "Ещё N источников". Остальные скрыты
 * через `hidden="until-found"`: поиск по странице их находит, и список раскрывается сам (там,
 * где браузер это умеет). Перед печатью список раскрывается. Возвращает функцию, которая всё снимает.
 */
export function initSourcesPeek(root: Element) {
	const section = root.querySelector<HTMLElement>('[data-sources]')
	const button = section?.querySelector<HTMLButtonElement>('.article__sources-more')
	const rest = [...(section?.querySelectorAll<HTMLElement>('.article__source') ?? [])].slice(SOURCES_PEEK)

	if (!section || !button || !rest.length) return () => {}

	const expand = () => {
		section.removeAttribute('data-collapsed')
		button.hidden = true
		button.setAttribute('aria-expanded', 'true')

		for (const item of rest) item.hidden = false

		removeEventListener('beforeprint', expand)
	}

	section.dataset.collapsed = ''
	button.hidden = false
	button.setAttribute('aria-expanded', 'false')

	for (const item of rest) item.setAttribute('hidden', 'until-found')

	button.addEventListener('click', expand)
	section.addEventListener('beforematch', expand)
	addEventListener('beforeprint', expand)

	return () => {
		button.removeEventListener('click', expand)
		section.removeEventListener('beforematch', expand)
		removeEventListener('beforeprint', expand)
	}
}
