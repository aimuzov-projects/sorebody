import { injuryFocus, type InjuryFocus, type Zone } from './zones.ts'

/**
 * Маркер травмы раскрытой зоны, по одному на травму. `number` -- номер строки списка, по нему
 * маркер на модели сверяется со строкой. `shift` -- сдвиг по экрану в шагах `MARK_SHIFT`:
 * у травм с одним местом маркеры встают в ряд, а не склеивают номера.
 */
export type Mark = { key: string; focus: InjuryFocus; slug: string; number: number; shift: number }

/** Шаг между маркерами с одним местом, px: кружок 20px вырастает в текущем до 24px, плюс кольцо пульса. */
export const MARK_SHIFT = 30

/** Маркеры травм зоны в порядке списка: номер -- место в списке, ряд -- у совпавших мест. */
export function layoutMarks(zone: Zone, index: number, slugs: readonly string[]): Mark[] {
	const marks = slugs.map((slug, i) => ({
		key: slug,
		focus: injuryFocus(zone, index, slug),
		slug,
		number: i + 1,
		shift: 0,
	}))
	const place = (mark: Mark) => mark.focus.position.map((v) => v.toFixed(3)).join()

	for (const mark of marks) {
		const same = marks.filter((other) => place(other) === place(mark))

		mark.shift = same.indexOf(mark) - (same.length - 1) / 2
	}

	return marks
}
