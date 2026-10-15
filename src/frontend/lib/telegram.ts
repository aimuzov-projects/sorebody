/**
 * Внутри Telegram сайт подхватывает тему клиента и показывает системную кнопку «назад».
 * SDK грузится только если Telegram при открытии передал `tgWebAppData` или `tgWebAppPlatform` в хеше,
 * в обычном браузере модуль ничего не делает и не ходит на telegram.org.
 */
type WebApp = {
	initData: string
	themeParams: Record<string, string | undefined>
	ready(): void
	expand(): void
	BackButton: { show(): void; hide(): void; onClick(cb: () => void): void }
}

const getApp = () => (window as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp

function init(app: WebApp | undefined) {
	if (!app?.initData) return

	const theme = app.themeParams
	const vars: Record<string, string | undefined> = {
		'--bg': theme.bg_color,
		'--fg': theme.text_color,
		'--muted': theme.hint_color,
		'--accent': theme.link_color,
		'--surface': theme.secondary_bg_color,
	}

	for (const [name, value] of Object.entries(vars)) if (value) document.documentElement.style.setProperty(name, value)

	if (location.pathname !== '/') {
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
