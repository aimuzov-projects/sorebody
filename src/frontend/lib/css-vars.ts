import type { Attachment } from 'svelte/attachments'

/**
 * CSS-переменные элемента из JS, вместо `style:--x`. Сцену рисует и сервер, а `style:` в его
 * HTML -- атрибут `style`, который CSP страницы блокирует. Из JS переменные ставятся и при CSP.
 */
export function cssVars(vars: Record<`--${string}`, string | number>): Attachment<HTMLElement> {
	return (node) => {
		for (const [name, value] of Object.entries(vars)) node.style.setProperty(name, String(value))
	}
}
