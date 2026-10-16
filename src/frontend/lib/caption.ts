/** Пометка, которой кончается подпись каждой иллюстрации: в разметке она идёт отдельным чипом. */
export const GENERATED_NOTE = 'Схематичная иллюстрация, сгенерирована нейросетью.'

/**
 * Подпись иллюстрации по частям: заголовок рисунка до первого двоеточия («Плечо спереди»),
 * сам текст и пометка, что картинка от нейросети. Frontmatter остаётся целым: подпись делится
 * при выводе, и без двоеточия или без пометки она просто идёт текстом.
 */
export function splitCaption(caption: string): { title?: string; text: string; generated: boolean } {
	const trimmed = caption.trim()
	const generated = trimmed.endsWith(GENERATED_NOTE)
	const body = generated ? trimmed.slice(0, -GENERATED_NOTE.length).trim() : trimmed
	const colon = body.indexOf(':')

	// Двоеточие далеко от начала -- уже не заголовок рисунка, а часть фразы
	if (colon > 0 && colon <= 40)
		return { title: body.slice(0, colon).trim(), text: body.slice(colon + 1).trim(), generated }

	return { text: body, generated }
}
