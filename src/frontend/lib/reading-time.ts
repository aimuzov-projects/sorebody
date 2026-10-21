/** Слов в минуту: русский научно-популярный текст со сносками читают медленнее художественного. */
const WORDS_PER_MINUTE = 160

/** Минуты чтения Markdown: без адресов ссылок, маркеров блоков и разметки, не меньше одной. */
export function readingMinutes(markdown: string) {
	const words = markdown
		.replace(/\]\([^)]*\)/g, ']')
		.replace(/<[^>]+>/g, ' ')
		.match(/[\p{L}\p{N}]+/gu)

	return Math.max(1, Math.round((words?.length ?? 0) / WORDS_PER_MINUTE))
}
