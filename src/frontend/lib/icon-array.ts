import type { Chart } from './injury-schema.ts'

const ICONS = 10
const ICON = 24
const GAP = 4

/** Фигурка человека в квадрате 24×24: голова и плечи. */
const PERSON = 'M12 2.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM4 21.5c0-4.4 3.6-8 8-8s8 3.6 8 8Z'

/** Сколько фигурок из десяти закрасить: 84% -- восемь, 85% -- девять. */
export function filledIcons(percent: number) {
	return Math.round(percent / (100 / ICONS))
}

function escape(text: string) {
	return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function iconsSvg(filled: number) {
	const width = ICONS * ICON + (ICONS - 1) * GAP
	const icons = Array.from({ length: ICONS }, (_, i) => {
		const state = i < filled ? 'on' : 'off'

		return `<path class="icon-array__icon icon-array__icon--${state}" transform="translate(${i * (ICON + GAP)} 0)" d="${PERSON}"/>`
	})

	return `<svg class="icon-array__icons" viewBox="0 0 ${width} ${ICON}" aria-hidden="true">${icons.join('')}</svg>`
}

/**
 * HTML пиктограммы для вставки в статью. Подписи и числа -- обычный текст, поэтому скринридер
 * прочитает "20 лет, 3 из 10, 30%", а SVG с фигурками от него скрыт.
 */
export function iconArrayHtml(chart: Chart) {
	const rows = chart.rows.map((row) => {
		const lines = chart.groups.map((group, i) => {
			const percent = row.values[i]!

			return (
				`<div class="icon-array__line">` +
				`<span class="icon-array__group">${escape(group)}</span>` +
				iconsSvg(filledIcons(percent)) +
				`<span class="icon-array__value">${filledIcons(percent)} из ${ICONS} · ${String(percent).replace('.', ',')}%</span>` +
				`</div>`
			)
		})

		return `<div class="icon-array__row"><p class="icon-array__label">${escape(row.label)}</p>${lines.join('')}</div>`
	})

	return (
		`<figure class="icon-array">` +
		`<p class="icon-array__title">${escape(chart.title)}</p>` +
		rows.join('') +
		`<figcaption class="icon-array__caption">${escape(chart.caption)}</figcaption>` +
		`</figure>`
	)
}
