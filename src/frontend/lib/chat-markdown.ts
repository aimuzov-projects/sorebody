/** Кусок строки ответа: текст, жирный или ссылка. */
export type ChatInline =
	{ type: 'text'; text: string } | { type: 'strong'; text: string } | { type: 'link'; text: string; href: string }

/** Абзац или список -- больше ответу чата не нужно, промпт просит без заголовков. */
export type ChatBlock =
	{ type: 'paragraph'; inline: ChatInline[] } | { type: 'list'; ordered: boolean; items: ChatInline[][] }

// Ссылка в разметке (https или путь на сайте, такие шлёт сервер), жирный и голый адрес --
// в одном проходе, кто встретился раньше
const INLINE = /\[([^\]\n]+)\]\((https:\/\/[^\s)]+|\/(?!\/)[^\s)]*)\)|\*\*([^*\n]+)\*\*|(https:\/\/[^\s<>()[\]"'«»]+)/g
const TRAILING = /[.,;:!?]+$/
const ITEM = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/

/** Голый адрес покороче: хост и путь без протокола и последней косой черты. */
const short = (url: string) => url.replace(/^https:\/\//, '').replace(/\/$/, '')

function inline(line: string): ChatInline[] {
	const out: ChatInline[] = []
	let last = 0

	const text = (value: string) => {
		if (!value) return

		const prev = out.at(-1)

		if (prev?.type === 'text') prev.text += value
		else out.push({ type: 'text', text: value })
	}

	for (const match of line.matchAll(INLINE)) {
		const [whole, label, href, bold, bare] = match

		text(line.slice(last, match.index))
		last = match.index + whole.length

		if (href) out.push({ type: 'link', text: label!, href })
		else if (bold) out.push({ type: 'strong', text: bold })
		else if (bare) {
			const url = bare.replace(TRAILING, '')

			out.push({ type: 'link', text: short(url), href: url })
			text(bare.slice(url.length))
		}
	}

	text(line.slice(last))

	return out
}

/**
 * Ответ модели в блоки для Svelte -- без `{@html}`: что бы модель ни прислала, на странице это
 * текст. Ссылки -- только https и пути на сайте; какие адреса разрешены, решил сервер.
 */
export function chatMarkdown(source: string): ChatBlock[] {
	const blocks: ChatBlock[] = []
	let paragraph: string[] = []

	const flush = () => {
		if (paragraph.length) blocks.push({ type: 'paragraph', inline: inline(paragraph.join(' ')) })

		paragraph = []
	}

	for (const raw of source.split('\n')) {
		const line = raw.replace(/^#+\s+/, '').trim()
		const item = line.match(ITEM)

		if (!line) {
			flush()
			continue
		}

		if (item) {
			flush()

			const ordered = Boolean(item[2])
			const prev = blocks.at(-1)
			const content = inline(item[3]!)

			if (prev?.type === 'list' && prev.ordered === ordered) prev.items.push(content)
			else blocks.push({ type: 'list', ordered, items: [content] })

			continue
		}

		paragraph.push(line)
	}

	flush()

	return blocks
}
