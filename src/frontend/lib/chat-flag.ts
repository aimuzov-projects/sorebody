const PREVIEW_KEY = 'sorebody:chat'

type Env = {
	root: { dataset: DOMStringMap }
	search: string
	storage?: Pick<Storage, 'getItem' | 'setItem'>
}

/**
 * Показывать ли вход в чат. Режим задаёт сборка (`CHAT` в layouts/base.astro): `on` -- всем,
 * `preview` -- только открывшим сайт с `?chat=1`, для тихого запуска; метка живёт до конца
 * вкладки. В Telegram Mini App чата нет: так решил владелец.
 */
export function chatAvailable({ root, search, storage }: Env) {
	if (root.dataset.telegram !== undefined) return false

	if (root.dataset.chat === 'on') return true

	if (root.dataset.chat !== 'preview') return false

	try {
		if (new URLSearchParams(search).get('chat') === '1') storage?.setItem(PREVIEW_KEY, '1')

		return storage?.getItem(PREVIEW_KEY) === '1'
	} catch {
		// sessionStorage бывает закрыт: тогда метка держится только в адресе
		return new URLSearchParams(search).get('chat') === '1'
	}
}
