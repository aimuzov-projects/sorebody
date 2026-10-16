import { themePeek, type Scheme } from '@aimuzov-projects/infra-site-kit/theme-peek.js'
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

/** Подсмотр темы из kit на каждой кнопке: круг с копией страницы в той схеме, что даст клик. */
const peeks = new Map<HTMLElement, () => void>()
const systemScheme = (): Scheme => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

function attachPeeks(root: ParentNode) {
	// Кнопки, ушедшие со страницы (статья на главной закрыта), отпускаем
	for (const [button, cleanup] of peeks) {
		if (button.isConnected) continue

		cleanup()
		peeks.delete(button)
	}

	for (const button of root.querySelectorAll<HTMLElement>('[data-theme-choice]')) {
		if (peeks.has(button) || button.closest('.theme-peek')) continue

		const choice = button.dataset.themeChoice as Theme
		const cleanup = themePeek(button, { target: () => (choice === 'auto' ? systemScheme() : choice) })

		if (cleanup) peeks.set(button, cleanup)
	}
}

/**
 * В копии страницы канвас 3D-модели пустой: cloneNode не переносит картинку. Кадр WebGL
 * живёт до конца кадра браузера, поэтому копируем его в своём requestAnimationFrame -- он
 * идёт после отрисовки сцены, -- и так каждый кадр, пока круг открыт: модель вертится.
 */
const copying = new WeakSet<Element>()

function copyCanvases(peek: Element) {
	if (copying.has(peek)) return

	copying.add(peek)

	const step = () => {
		if (!peek.isConnected) return copying.delete(peek)

		const sources = [...document.querySelectorAll('canvas')].filter((c) => !c.closest('.theme-peek'))

		peek.querySelectorAll('canvas').forEach((copy, i) => {
			const source = sources[i]

			const context = copy.getContext('2d')

			// Канвас сцены прозрачный: без очистки на копии копились бы прошлые кадры
			context?.clearRect(0, 0, copy.width, copy.height)

			if (source) context?.drawImage(source, 0, 0)
		})

		requestAnimationFrame(step)
	}

	requestAnimationFrame(step)
}

/** Отметить выбранную тему на переключателях внутри `root`, и на вставленных позже. */
export function syncThemeSwitches(root: ParentNode = document) {
	const theme = current()

	for (const button of root.querySelectorAll<HTMLElement>('[data-theme-choice]'))
		button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme))

	attachPeeks(root)
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

	// Копия страницы в круге подсмотра заполняется заново при каждой смене схемы
	new MutationObserver((records) => {
		for (const { target } of records)
			if (target instanceof Element && target.matches('.theme-peek')) copyCanvases(target)
	}).observe(document.body, { childList: true, subtree: true })

	syncThemeSwitches()
}
