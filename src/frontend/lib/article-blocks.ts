import { CalendarClock, Check, CircleCheck, Hospital, Lightbulb, Phone, Siren } from 'lucide-static'

import { filledIcons, iconsSvg } from './icon-array.ts'
import type { Compare, Diagram, SelfCheck, Stat, Timeline } from './injury-schema.ts'
import { sourceHref, type Source } from './sources.ts'

function escape(text: string) {
	return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

/**
 * Сноска блока -- в той же форме, что в Markdown: "(N)" ссылкой на источник по номеру в `sources`
 * файла. Дальше её, как и сноски текста, перенумерует и поднимет над строкой lib/article-html.ts.
 */
function cites(numbers: number[], sources: Source[]) {
	if (numbers.length === 0) return ''

	const links = numbers.map((n) => {
		const source = sources[n - 1]

		if (!source) throw new Error(`article-blocks: сноска ${n}, а источников ${sources.length}`)

		return `<a href="${escape(sourceHref(source))}">${n}</a>`
	})

	return ` (${links.join(', ')})`
}

/** Шкала восстановления: фазы по порядку, у каждой срок, название и что в ней можно. */
export function timelineHtml(timeline: Timeline, sources: Source[]) {
	const phases = timeline.phases.map(
		(phase) =>
			`<li class="timeline__phase">` +
			`<p class="timeline__when">${escape(phase.when)}</p>` +
			`<p class="timeline__title">${escape(phase.title)}</p>` +
			`<p class="timeline__text">${escape(phase.text)}${cites(phase.cite, sources)}</p>` +
			`</li>`,
	)

	return (
		`<figure class="timeline">` +
		`<p class="timeline__heading">${escape(timeline.title)}</p>` +
		`<ol class="timeline__phases">${phases.join('')}</ol>` +
		(timeline.caption ? `<figcaption class="timeline__caption">${escape(timeline.caption)}</figcaption>` : '') +
		`</figure>`
	)
}

/**
 * Развилка: узел с названием и линии к вариантам, у каждого -- пункты, по которым их сравнивают,
 * и, если есть, ключевая доля пиктограммой "N из 10".
 */
export function compareHtml(compare: Compare, sources: Source[]) {
	const options = compare.options.map(
		(option) =>
			`<div class="compare__option">` +
			`<p class="compare__title">${escape(option.title)}</p>` +
			`<ul class="compare__points">${option.points.map((p) => `<li>${escape(p)}</li>`).join('')}</ul>` +
			(option.share
				? `<p class="compare__share">${iconsSvg(filledIcons(option.share.percent))}` +
					`<span class="compare__share-text"><strong>${filledIcons(option.share.percent)} из 10</strong> ${escape(option.share.label)}</span></p>`
				: '') +
			`</div>`,
	)

	// Развилка: узел с названием сверху, от него линии к вариантам (рисует CSS)
	return (
		`<figure class="compare">` +
		`<p class="compare__heading"><span class="compare__node">${escape(compare.title)}</span></p>` +
		`<div class="compare__options compare__options--${compare.options.length}">${options.join('')}</div>` +
		(compare.caption
			? `<figcaption class="compare__caption">${escape(compare.caption)}${cites(compare.cite, sources)}</figcaption>`
			: '') +
		`</figure>`
	)
}

/** Крупная цифра: одно число на полэкрана и фраза, что за ним стоит. */
export function statHtml(stat: Stat, sources: Source[]) {
	return (
		`<figure class="big-stat">` +
		`<p class="big-stat__value">${escape(stat.value)}</p>` +
		`<figcaption class="big-stat__text">${escape(stat.text)}${cites(stat.cite, sources)}</figcaption>` +
		`</figure>`
	)
}

type Leg = { hip: [number, number]; knee: [number, number]; ankle: [number, number]; toe: number }

/** Нога спереди: бедро, голень и стопа линиями, суставы точками. `toe` -- куда смотрит носок по x. */
function legSvg({ hip, knee, ankle, toe }: Leg) {
	const point = ([x, y]: [number, number]) => `<circle class="diagram__joint" cx="${x}" cy="${y}" r="5"/>`

	return (
		`<polyline class="diagram__leg" points="${hip.join(',')} ${knee.join(',')} ${ankle.join(',')} ${toe},${ankle[1] + 6}"/>` +
		point(hip) +
		point(knee) +
		point(ankle)
	)
}

/** Пара ног спереди: таз линией, у каждого колена -- пунктир от бедра к стопе, по которому видно, ушло ли оно внутрь. */
function legsSvg(legs: [Leg, Leg]) {
	const guides = legs.map(
		({ hip, ankle }) =>
			`<line class="diagram__guide" x1="${hip[0]}" y1="${hip[1]}" x2="${ankle[0]}" y2="${ankle[1]}"/>`,
	)

	return (
		`<svg class="diagram__figure" viewBox="0 0 160 200" aria-hidden="true">` +
		`<line class="diagram__pelvis" x1="${legs[0].hip[0]}" y1="${legs[0].hip[1]}" x2="${legs[1].hip[0]}" y2="${legs[1].hip[1]}"/>` +
		guides.join('') +
		legs.map(legSvg).join('') +
		`</svg>`
	)
}

/** Рисунки схем: что опасно и как правильно, по паре ног спереди. */
const DIAGRAMS: Record<Diagram['kind'], { bad: [string, [Leg, Leg]]; good: [string, [Leg, Leg]] }> = {
	'knee-valgus': {
		bad: [
			'Колени уходят внутрь',
			[
				{ hip: [50, 30], knee: [70, 105], ankle: [48, 178], toe: 30 },
				{ hip: [110, 30], knee: [90, 105], ankle: [112, 178], toe: 130 },
			],
		],
		good: [
			'Колени над стопами',
			[
				{ hip: [50, 30], knee: [48, 105], ankle: [50, 178], toe: 34 },
				{ hip: [110, 30], knee: [112, 105], ankle: [110, 178], toe: 126 },
			],
		],
	},
}

/** Схема "опасно / безопасно": два рисунка рядом с подписями и общая подпись под ними. */
export function diagramHtml(diagram: Diagram) {
	const { bad, good } = DIAGRAMS[diagram.kind]
	const side = (kind: 'bad' | 'good', [label, legs]: [string, [Leg, Leg]]) =>
		`<div class="diagram__side diagram__side--${kind}">` +
		legsSvg(legs) +
		`<p class="diagram__label">${kind === 'bad' ? 'Опасно' : 'Безопасно'}: ${escape(label.toLowerCase())}</p>` +
		`</div>`

	return (
		`<figure class="diagram">` +
		`<div class="diagram__sides">${side('bad', bad)}${side('good', good)}</div>` +
		// Подпись -- главная практическая мысль схемы, поэтому плашкой со значком, а не мелким серым
		`<figcaption class="diagram__caption"><span class="diagram__caption-icon" aria-hidden="true">${Lightbulb}</span>` +
		`<span>${escape(diagram.caption)}</span></figcaption>` +
		`</figure>`
	)
}

/**
 * Кнопка звонка в карточке скорой: на телефоне -- набор номера в одно касание. На кнопке трубка
 * и номер крупно, "Позвонить" -- в подписи для скринридера: целиком в две кнопки на телефоне не влезало.
 */
const callButton = (n: string) =>
	`<a class="verdict__call" href="tel:${n}" aria-label="Позвонить ${n}"><span class="verdict__call-icon" aria-hidden="true">${Phone}</span>${n}</a>`

/**
 * Ответ для самого срочного отмеченного признака: значок, заголовок, что делать. У скорой --
 * ещё кнопки звонка. Тексты общие для всех травм: что делать до врача -- в статье.
 */
const VERDICTS = {
	call: {
		icon: Siren,
		title: 'Сразу скорая',
		text: 'Звоните прямо сейчас, не ждите, пока станет хуже.',
		extra: `<div class="verdict__calls">${callButton('103')}${callButton('112')}</div>`,
	},
	today: {
		icon: Hospital,
		title: 'Сегодня же к врачу',
		text: 'В травмпункт или к травматологу, не откладывая до завтра.',
	},
	soon: {
		icon: CalendarClock,
		title: 'К врачу в ближайшие дни',
		text: 'Запишитесь к травматологу-ортопеду. До визита — первые шаги из статьи.',
	},
	none: {
		icon: CircleCheck,
		title: 'Тревожных признаков нет',
		text: 'Если боль не проходит или сомневаетесь — покажитесь врачу.',
	},
}

/**
 * Самопроверка "Мне к врачу?": признаки карточками-переключателями, рядом ответ для самого
 * срочного. Все ответы в разметке, lib/self-check.ts показывает нужный. Без JS блок скрыт:
 * признаки есть списком в статье.
 */
export function selfCheckHtml(items: SelfCheck) {
	const boxes = items.map(
		(item, i) =>
			`<label class="self-check__item">` +
			`<input class="self-check__box" type="checkbox" name="sign" value="${i}" data-urgency="${item.urgency}">` +
			`<span class="self-check__mark" aria-hidden="true">${Check}</span>` +
			`<span class="self-check__text">${escape(item.text)}</span>` +
			`</label>`,
	)
	// Текст ответов свой, не из статьи: экранировать нечего, а у скорой в нём ссылки
	// Полоска для телефона: тот же вывод одной строкой, ведёт к полной карточке (lib/self-check.ts
	// прячет её, пока карточка на экране). Для скринридера дубль не нужен
	const bar = Object.entries(VERDICTS).map(
		([level, verdict]) =>
			`<a class="verdict-bar verdict-bar--${level}" href="#self-check-result" data-verdict="${level}"${level === 'none' ? '' : ' hidden'}>` +
			`<span class="verdict-bar__icon">${verdict.icon}</span>` +
			`<span class="verdict-bar__title">${verdict.title}</span>` +
			`</a>`,
	)
	const verdicts = Object.entries(VERDICTS).map(
		([level, verdict]) =>
			`<div class="verdict verdict--${level}" data-verdict="${level}"${level === 'none' ? '' : ' hidden'}>` +
			`<span class="verdict__icon" aria-hidden="true">${verdict.icon}</span>` +
			`<p class="verdict__title">${verdict.title}</p>` +
			`<p class="verdict__text">${verdict.text}</p>` +
			('extra' in verdict ? verdict.extra : '') +
			`</div>`,
	)

	return (
		`<fieldset class="self-check" data-self-check hidden>` +
		`<legend class="self-check__title">Что у вас сейчас?</legend>` +
		`<div class="self-check__layout">` +
		`<div class="self-check__items">${boxes.join('')}</div>` +
		`<div class="self-check__result" id="self-check-result">` +
		`<div aria-live="polite">${verdicts.join('')}</div>` +
		`<p class="self-check__note">Это подсказка, а не диагноз: при сомнениях — к врачу.</p>` +
		`</div>` +
		`</div>` +
		`<div class="self-check__bar" aria-hidden="true" data-self-check-bar hidden>${bar.join('')}</div>` +
		`</fieldset>`
	)
}
