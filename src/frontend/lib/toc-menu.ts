/**
 * Меню разделов на узком экране (components/toc-menu.astro): кнопке -- `aria-expanded` по
 * состоянию popover, выбор пункта закрывает меню. Прокрутку к разделу делает lib/reading.ts.
 * Возвращает функцию снятия.
 */
export function initTocMenu(root: Element) {
	const button = root.querySelector<HTMLButtonElement>('[data-toc-menu] button')
	const panel = root.querySelector<HTMLElement>('[data-toc-menu] [popover]')

	if (!button || !panel) return () => {}

	const onToggle = (event: Event) => {
		button.setAttribute('aria-expanded', String((event as ToggleEvent).newState === 'open'))
	}
	const onClick = (event: Event) => {
		if ((event.target as Element).closest('a')) panel.hidePopover()
	}

	panel.addEventListener('toggle', onToggle)
	panel.addEventListener('click', onClick)

	return () => {
		panel.removeEventListener('toggle', onToggle)
		panel.removeEventListener('click', onClick)
	}
}
