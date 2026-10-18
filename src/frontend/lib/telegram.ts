/**
 * Внутри Telegram сайт подхватывает тему клиента и показывает системную кнопку «назад».
 * SDK грузится только если Telegram при открытии передал `tgWebAppData` или `tgWebAppPlatform` в хеше,
 * в обычном браузере модуль ничего не делает и не ходит на telegram.org.
 *
 * На главной и страницах движений шаги -- сцена, список зоны, статья -- ведёт сама сцена: пишет
 * текущий шаг в `<html data-step>` и шлёт событие `wodcare:step`. Кнопка «назад» видна везде,
 * кроме сцены главной, а нажатие уходит обратно событием `wodcare:back`: сцена поднимается на
 * шаг тем же путём, что и своя кнопка «Назад», которую в Mini App прячет атрибут `data-telegram`.
 * Со сцены движения шаг вверх -- главная.
 *
 * Акцент на странице спорта остаётся цветом спорта: он знак спорта на всём сайте, цвет ссылок
 * Telegram его не заменяет. Без спорта акцент -- графит, то есть цвет текста из темы Telegram.
 */
import { BACK_EVENT, STEP_EVENT } from './telegram-events.ts'

type WebApp = {
	initData: string
	themeParams: Record<string, string | undefined>
	ready(): void
	expand(): void
	isVersionAtLeast?(version: string): boolean
	requestFullscreen?(): void
	BackButton: { show(): void; hide(): void; onClick(cb: () => void): void }
}

const getApp = () => (window as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp

function init(app: WebApp | undefined) {
	if (!app?.initData) return

	const root = document.documentElement
	const theme = app.themeParams
	const vars: Record<string, string | undefined> = {
		'--bg': theme.bg_color,
		'--fg': theme.text_color,
		'--muted': theme.hint_color,
		'--accent': root.dataset.sport === undefined ? theme.text_color : undefined,
		'--surface': theme.secondary_bg_color,
	}

	for (const [name, value] of Object.entries(vars)) if (value) root.style.setProperty(name, value)

	root.dataset.telegram = ''

	if (document.body.classList.contains('scene-page')) {
		// Обработчик один: что делать по нажатию, решает сцена, она знает, откуда пришли
		const sync = () =>
			root.dataset.step && root.dataset.step !== 'scene' ? app.BackButton.show() : app.BackButton.hide()

		app.BackButton.onClick(() => window.dispatchEvent(new Event(BACK_EVENT)))
		window.addEventListener(STEP_EVENT, sync)
		sync()

		// Сцене нужен весь экран; полноэкранный режим есть с Bot API 8.0
		if (app.isVersionAtLeast?.('8.0')) app.requestFullscreen?.()
	} else {
		app.BackButton.show()
		app.BackButton.onClick(() => (history.length > 1 ? history.back() : location.assign('/')))
	}

	app.ready()
	app.expand()
}

const FLAG = 'wodcare:tg'

/** Хеш с параметрами Telegram есть только на первой странице, дальше помнит флаг в sessionStorage. */
function detectTelegram() {
	try {
		if (sessionStorage.getItem(FLAG)) return true
	} catch {
		// sessionStorage может бросать в приватном режиме -- остаётся только хеш.
	}

	if (!/tgWebApp(Data|Platform)=/.test(location.hash)) return false

	try {
		sessionStorage.setItem(FLAG, '1')
	} catch {
		// Не сохранилось -- следующая страница загрузится без SDK.
	}

	return true
}

if (detectTelegram()) {
	const sdk = document.createElement('script')

	sdk.src = 'https://telegram.org/js/telegram-web-app.js'
	sdk.addEventListener('load', () => init(getApp()), { once: true })
	document.head.append(sdk)
}
