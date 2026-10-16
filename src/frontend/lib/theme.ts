import { themePeek, type Scheme } from '@aimuzov-projects/infra-site-kit/theme-peek.js'

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

/** Переключатель один и ходит по кругу, как во всех проектах: система, светлая, тёмная. */
const NEXT: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' }

export const THEME_VIEW: Record<Theme, { label: string; action: string }> = {
	auto: { label: 'как в системе', action: 'Включить светлую' },
	light: { label: 'светлая', action: 'Включить тёмную' },
	dark: { label: 'тёмная', action: 'Вернуть как в системе' },
}

export const themeLabel = (theme: Theme) => `Тема: ${THEME_VIEW[theme].label}. ${THEME_VIEW[theme].action}`

function current(): Theme {
	const theme = document.documentElement.dataset.theme

	return theme === 'light' || theme === 'dark' ? theme : 'auto'
}

const systemScheme = (): Scheme => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
const schemeOf = (theme: Theme): Scheme => (theme === 'auto' ? systemScheme() : theme)

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

/**
 * Иконку нужного состояния показывает CSS по `<html data-theme>`, так что она верна уже на
 * первой отрисовке. Скрипт ведёт клики, подпись для скринридера и подсмотр темы из kit:
 * круг показывает схему, которую даст следующий клик.
 */
export function initThemeToggle() {
	const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]')

	if (!button) return

	const tip = document.querySelector<HTMLElement>('[data-theme-tip]')

	/** Подсказка под значком, прижата к его правому краю: значок стоит у края экрана. */
	const place = () => {
		if (!tip?.matches(':popover-open')) return

		const rect = button.getBoundingClientRect()

		tip.style.top = `${rect.bottom + 2}px`
		tip.style.right = `${document.documentElement.clientWidth - rect.right}px`
	}

	const sync = () => {
		button.setAttribute('aria-label', themeLabel(current()))

		if (tip) tip.textContent = THEME_VIEW[current()].action

		place()
	}

	const showTip = () => {
		tip?.showPopover()
		sync()
	}

	const hideTip = () => {
		if (tip?.matches(':popover-open')) tip.hidePopover()
	}

	// С пальца подсказка не нужна: после касания она так и висела бы до следующего тапа
	button.addEventListener('pointerenter', (event) => event.pointerType !== 'touch' && showTip())
	button.addEventListener('pointerleave', hideTip)
	button.addEventListener('focus', () => button.matches(':focus-visible') && showTip())
	button.addEventListener('blur', hideTip)
	addEventListener('scroll', place, { capture: true, passive: true })
	addEventListener('resize', place)

	button.addEventListener('click', () => {
		const theme = NEXT[current()]

		if (theme === 'auto') delete document.documentElement.dataset.theme
		else document.documentElement.dataset.theme = theme

		try {
			if (theme === 'auto') localStorage.removeItem(KEY)
			else localStorage.setItem(KEY, theme)
		} catch {
			// Хранилище недоступно (приватный режим): тема держится до перезагрузки
		}

		sync()
	})

	// Следующий клик может не сменить схему (тёмная -> система в тёмной ОС): тогда круга нет
	themePeek(button, {
		target: (scheme) => {
			const next = schemeOf(NEXT[current()])

			return next === scheme ? undefined : next
		},
	})

	// Копия страницы в круге подсмотра заполняется заново при каждой смене схемы
	new MutationObserver((records) => {
		for (const { target } of records)
			if (target instanceof Element && target.matches('.theme-peek')) copyCanvases(target)
	}).observe(document.body, { childList: true, subtree: true })

	sync()
}
