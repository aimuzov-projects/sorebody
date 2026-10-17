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

const LABEL: Record<Theme, string> = { auto: 'как в системе', light: 'светлая', dark: 'тёмная' }
const ENABLE: Record<Scheme, string> = { light: 'Включить светлую', dark: 'Включить тёмную' }

/**
 * Клик всегда переворачивает видимую схему, иначе из "как в системе" можно было попасть
 * в ту же схему, и клик выглядел пустым. Если новая схема совпала с системной, это снова
 * "как в системе", а не выбор, прибитый к localStorage.
 */
function nextTheme(theme: Theme, system: Scheme): Theme {
	const next = (theme === 'auto' ? system : theme) === 'dark' ? 'light' : 'dark'

	return next === system ? 'auto' : next
}

/** Действие следующего клика. Без `system` (на сервере) считаем систему светлой. */
export function themeAction(theme: Theme, system: Scheme = 'light') {
	const next = nextTheme(theme, system)

	return next === 'auto' ? 'Вернуть как в системе' : ENABLE[next]
}

export const themeLabel = (theme: Theme, system?: Scheme) => `Тема: ${LABEL[theme]}. ${themeAction(theme, system)}`

function current(): Theme {
	const theme = document.documentElement.dataset.theme

	return theme === 'light' || theme === 'dark' ? theme : 'auto'
}

const media = () => matchMedia('(prefers-color-scheme: dark)')
const systemScheme = (): Scheme => (media().matches ? 'dark' : 'light')

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
		button.setAttribute('aria-label', themeLabel(current(), systemScheme()))

		if (tip) tip.textContent = themeAction(current(), systemScheme())

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
		const theme = nextTheme(current(), systemScheme())

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

	// Круг по умолчанию показывает противоположную схему, ровно её и даст клик
	themePeek(button)
	// Подпись зависит от системной схемы, а та может смениться, пока страница открыта
	media().addEventListener('change', sync)

	// Копия страницы в круге подсмотра заполняется заново при каждой смене схемы
	new MutationObserver((records) => {
		for (const { target } of records)
			if (target instanceof Element && target.matches('.theme-peek')) copyCanvases(target)
	}).observe(document.body, { childList: true, subtree: true })

	sync()
}
