/** Через сколько миллисекунд плашка «Ссылка скопирована» уходит. */
const TOAST_MS = 2000

/**
 * Ссылка на раздел статьи: клик по заголовку раздела или по значку рядом с ним ставит хеш раздела
 * в адрес и копирует ссылку. Поверх модели статья живёт под своим путём (scene/place.ts), хеш
 * раздела сцена не читает. Возвращает функцию снятия.
 */
export function initSectionLinks(root: Element) {
	let toast: HTMLElement | undefined
	let timer: ReturnType<typeof setTimeout> | undefined

	const say = (message: string) => {
		// В body, а не в статье: у ридера поверх модели свой слой, fixed внутри него уехал бы
		if (!toast) {
			toast = document.createElement('p')
			toast.className = 'copy-toast'
			toast.setAttribute('role', 'status')
			document.body.append(toast)
		}

		toast.textContent = message
		toast.dataset.shown = ''
		clearTimeout(timer)
		timer = setTimeout(() => delete toast?.dataset.shown, TOAST_MS)
	}

	const onClick = (event: Event) => {
		const heading = (event.target as Element).closest('.article-section__title')
		const section = heading?.closest('.article-section')

		// Выделяли текст заголовка, а не нажимали на него
		if (!section || (getSelection()?.toString() && !(event.target as Element).closest('button'))) return

		history.replaceState(history.state, '', `#${section.id}`)

		// Без буфера (HTTP, запрет вебвью) ссылка всё равно уже в адресной строке
		const copied = navigator.clipboard ? navigator.clipboard.writeText(location.href) : Promise.reject()

		copied.then(
			() => say('Ссылка скопирована'),
			() => say('Ссылка на раздел — в адресной строке'),
		)
	}

	root.addEventListener('click', onClick)

	return () => {
		root.removeEventListener('click', onClick)
		clearTimeout(timer)
		toast?.remove()
	}
}
