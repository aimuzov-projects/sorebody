// Адрес до пробела или скобки; точку, запятую и прочее в конце отрезаем отдельно: это конец фразы
const URL_RE = /https?:\/\/[^\s<>()[\]"'«»]+/g
const TRAILING = /[.,;:!?]+$/

const MD_LINK = /\[([^\]\n]*)\]\((\S+?)\)/g

/** Адреса из текста, без знаков препинания в конце. */
export const urlsIn = (text: string) => (text.match(URL_RE) ?? []).map((url) => url.replace(TRAILING, ''))

/**
 * Ссылки в ответе модели -- только на сайт и на адреса из ответов инструментов этого диалога.
 * Чужая ссылка в Markdown становится просто текстом, голый чужой адрес убирается: модель могли
 * уговорить подсунуть ссылку, а виджет показывает ответ от имени сайта.
 */
export function keepKnownLinks(text: string, { site, known }: { site: string; known: Set<string> }) {
	const allowed = (url: string) => {
		try {
			return new URL(url).host === site || known.has(url)
		} catch {
			return false
		}
	}

	return text
		.replace(MD_LINK, (whole, label: string, url: string) => (allowed(url) ? whole : label))
		.replace(URL_RE, (match) => {
			const url = match.replace(TRAILING, '')

			return allowed(url) ? match : match.slice(url.length)
		})
}
