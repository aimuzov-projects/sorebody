const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Пункт ченжлога в HTML: текст экранирован, ссылки `[текст](/путь)` становятся `<a>`. */
export function itemHtml(item: string) {
	let html = ''
	let from = 0

	for (const m of item.matchAll(LINK)) {
		html += escape(item.slice(from, m.index)) + `<a href="${escape(m[2]!)}">${escape(m[1]!)}</a>`
		from = m.index + m[0].length
	}

	return html + escape(item.slice(from))
}

/** Пути всех ссылок пункта, для проверки, что страницы существуют. */
export const itemLinks = (item: string) => [...item.matchAll(LINK)].map((m) => m[2]!)

/** "18 октября 2026" из `2026-10-18`. */
export const releaseDate = (date: string) =>
	new Date(`${date}T00:00:00Z`)
		.toLocaleDateString('ru-RU', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC',
		})
		.replace(/\s*г\.$/, '')
