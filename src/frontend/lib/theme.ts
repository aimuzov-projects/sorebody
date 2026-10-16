import { Monitor, Moon, Sun } from 'lucide-static'

/**
 * Тема сайта: как в системе, светлая или тёмная. Выбор лежит в localStorage и до отрисовки
 * ставится на `<html data-theme>` (скрипт THEME_BOOT в layouts/base.astro); без выбора
 * атрибута нет и тему ведёт prefers-color-scheme. В Mini App тему задаёт Telegram,
 * переключатель там скрыт.
 */
export type Theme = 'auto' | 'light' | 'dark'

const KEY = 'wodcare:theme'

export const THEME_BOOT =
	`try{var t=localStorage.getItem('${KEY}');` +
	"if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}"

const CHOICES: [Theme, string, string][] = [
	['auto', 'Как в системе', Monitor],
	['light', 'Светлая', Sun],
	['dark', 'Тёмная', Moon],
]

/** Разметка переключателя строкой: общая для подвала (Astro) и индекса главной (Svelte). */
export function themeSwitchHtml() {
	const options = CHOICES.map(
		([value, label, icon]) =>
			`<button class="theme-switch__option" type="button" data-theme-choice="${value}" ` +
			`aria-pressed="${value === 'auto'}" aria-label="${label}" title="${label}">${icon}</button>`,
	)

	return `<div class="theme-switch" role="group" aria-label="Тема">${options.join('')}</div>`
}

function current(): Theme {
	const theme = document.documentElement.dataset.theme

	return theme === 'light' || theme === 'dark' ? theme : 'auto'
}

/** Отметить выбранную тему на переключателях внутри `root`, и на вставленных позже. */
export function syncThemeSwitches(root: ParentNode = document) {
	const theme = current()

	for (const button of root.querySelectorAll<HTMLElement>('[data-theme-choice]'))
		button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme))
}

/** Клики ловим на документе: переключатель может прийти позже, со статьёй на главной. */
export function initThemeSwitch() {
	document.addEventListener('click', (event) => {
		const button = (event.target as Element).closest<HTMLElement>('[data-theme-choice]')
		const theme = button?.dataset.themeChoice as Theme | undefined

		if (!theme) return

		if (theme === 'auto') delete document.documentElement.dataset.theme
		else document.documentElement.dataset.theme = theme

		try {
			if (theme === 'auto') localStorage.removeItem(KEY)
			else localStorage.setItem(KEY, theme)
		} catch {
			// Хранилище недоступно (приватный режим): тема держится до перезагрузки
		}

		syncThemeSwitches()
	})

	syncThemeSwitches()
}
