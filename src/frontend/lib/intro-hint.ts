/**
 * Подсказка "как пользоваться моделью" на главной показывается один раз: закрыл её или открыл
 * зону -- больше не всплывает. Отметка в localStorage; где он недоступен (приватный режим,
 * запрет cookie, WebView Telegram) и бросает, подсказку просто не прячем навсегда.
 */
const INTRO_HINT_KEY = 'wodcare:intro-hint'

type Store = Pick<Storage, 'getItem' | 'setItem'>

/** Хранилище -- функцией: в Safari с запретом cookie бросает уже само обращение к localStorage. */
const local = () => globalThis.localStorage as Store | undefined

export function introHintSeen(store: () => Store | undefined = local) {
	try {
		return store()?.getItem(INTRO_HINT_KEY) === 'seen'
	} catch {
		return false
	}
}

export function markIntroHintSeen(store: () => Store | undefined = local) {
	try {
		store()?.setItem(INTRO_HINT_KEY, 'seen')
	} catch {
		// Без хранилища подсказка всплывёт и в следующий раз: это не ошибка
	}
}
