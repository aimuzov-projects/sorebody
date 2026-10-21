import {
	ArrowRight,
	Bandage,
	CalendarClock,
	ChartColumn,
	ChevronRight,
	CircleAlert,
	CircleCheck,
	CircleX,
	ClipboardCheck,
	Dumbbell,
	Footprints,
	Info,
	Phone,
	Printer,
	Repeat,
	ScanSearch,
	ShieldCheck,
	Siren,
	Stethoscope,
	TriangleAlert,
	UserRoundSearch,
} from 'lucide-static'
import { ELEMENT_NODE, parse, renderSync, TEXT_NODE } from 'ultrahtml'

import { ABBREVIATIONS, TERMS } from '#frontend/data/abbreviations.ts'
import { MOVEMENT_ICONS } from '#frontend/data/movement-icons.ts'
import type { Sport } from '#frontend/data/sports.ts'

import { movementIn } from './movement-match.ts'
import { sourceDetails } from './source-details.ts'
import { citeKey, sourceHref, type Source } from './sources.ts'

type Node = { type: number; name?: string; value?: string; attributes?: Record<string, string>; children?: Node[] }
type Element = Node & { name: string; attributes: Record<string, string>; children: Node[] }

/**
 * Разделы страницы травмы в порядке оглавления. Порядок задаёт код, а не файлы: страница спорта
 * склеивает общую часть и линзу, «Сроки возврата» и «Профилактика» собираются из обеих.
 */
export const SECTIONS = [
	{ id: 'what', icon: Info },
	{ id: 'frequency', icon: ChartColumn },
	{ id: 'mechanism', icon: Dumbbell },
	{ id: 'symptoms', icon: Stethoscope },
	{ id: 'urgent', icon: TriangleAlert },
	{ id: 'first-steps', icon: Footprints },
	{ id: 'specialist', icon: UserRoundSearch },
	{ id: 'diagnosis', icon: ScanSearch },
	{ id: 'treatment', icon: Bandage },
	{ id: 'return', icon: CalendarClock },
	{ id: 'adapt', icon: Repeat },
	{ id: 'prevention', icon: ShieldCheck },
] as const

export type SectionId = (typeof SECTIONS)[number]['id']

type Section = { id: SectionId; title: string; icon: string }

/**
 * Заголовки разделов в файлах: общей части и линзы, в порядке шаблона (его держит тест контента).
 * `optional` -- раздел, который может целиком жить в другой части: на странице спорта он
 * всё равно есть, если не пуст хотя бы в одной.
 */
export const INJURY_HEADINGS: { title: string; id: SectionId; optional?: true }[] = [
	{ title: 'Что это', id: 'what' },
	{ title: 'Симптомы', id: 'symptoms' },
	{ title: 'Когда сразу к врачу', id: 'urgent' },
	{ title: 'Первые шаги', id: 'first-steps' },
	{ title: 'К какому врачу', id: 'specialist' },
	{ title: 'Диагностика', id: 'diagnosis' },
	{ title: 'Лечение', id: 'treatment' },
	{ title: 'Сроки заживления', id: 'return', optional: true },
	{ title: 'Профилактика', id: 'prevention', optional: true },
]

export const LENS_HEADINGS: typeof INJURY_HEADINGS = [
	{ title: 'Как часто', id: 'frequency' },
	{ title: 'Механизм', id: 'mechanism' },
	{ title: 'Возврат в спорт', id: 'return', optional: true },
	{ title: 'Как адаптировать тренировки', id: 'adapt' },
	{ title: 'Профилактика', id: 'prevention', optional: true },
]

/** Заголовок раздела на странице: со спортом -- его фразы, без спорта -- как в общей части. */
function sectionTitle(id: SectionId, sport?: Sport) {
	if (id === 'frequency') return `Как часто ${sport?.phrase ?? ''}`.trim()

	if (id === 'mechanism') return sport?.mechanismTitle ?? 'Механизм'

	if (id === 'return') return sport ? 'Сроки возврата' : 'Сроки заживления'

	return [...INJURY_HEADINGS, ...LENS_HEADINGS].find((h) => h.id === id)!.title
}

/** Часть статьи: HTML файла и чья она. */
export type ArticlePart = { html: string; kind: 'injury' | 'lens' }

type Options = {
	sources: Source[]
	sport?: Sport
	/** Адрес травмы для ссылок `/injuries/<slug>/` в тексте: страница разбора без переадресаций (lib/injury-page.ts). */
	injuryHref?: (slug: string) => string | undefined
	/** Страница самопроверки "Мне к врачу?": ссылка на неё встаёт в конец "Когда сразу к врачу". */
	checkHref?: string
}

const text = (value: string): Node => ({ type: TEXT_NODE, value })

const el = (name: string, attributes: Record<string, string>, children: Node[] = []): Element => ({
	type: ELEMENT_NODE,
	name,
	attributes,
	children,
})

const isElement = (node: Node | undefined, name?: string): node is Element =>
	node?.type === ELEMENT_NODE && (!name || node.name === name)

const textOf = (node: Node): string =>
	node.type === TEXT_NODE ? (node.value ?? '') : (node.children ?? []).map(textOf).join('')

/** SVG-строку Lucide превращаем в узел дерева: иконка наследует цвет текста через currentColor. */
const icon = (svg: string, className: string) =>
	el('span', { class: className, 'aria-hidden': 'true' }, [parse(svg).children.find((n: Node) => isElement(n))])

/**
 * HTML тела статьи из Markdown -- в разметку лонгрида: разделы в `<section>` с иконкой у
 * заголовка, сноски `([N])` -- надстрочными ссылками, строки со стрелкой после "Вместо" --
 * парами "было/стало", проценты в разделе о частоте -- крупнее. Заодно отдаёт список разделов
 * для оглавления. Работает при сборке, в браузер уходит готовый HTML.
 *
 * Частей две: общая часть травмы и линза спорта, у каждой свои сноски с номерами по своему
 * `sources`. На странице номера сквозные, по первому упоминанию, и список источников один --
 * его функция и отдаёт вместе с разделами.
 */
export function enhanceArticle(parts: ArticlePart[], { sources, sport, injuryHref, checkHref }: Options) {
	const bodies = new Map<SectionId, Node[]>()

	for (const { html, kind } of parts) {
		const headings = kind === 'injury' ? INJURY_HEADINGS : LENS_HEADINGS
		let current: Node[] | undefined

		for (const node of (parse(html) as Element).children) {
			if (isElement(node, 'h2')) {
				const title = textOf(node).trim()
				const heading = headings.find((h) => h.title === title)

				if (!heading) throw new Error(`article-html: неизвестный раздел «${title}»`)

				current = bodies.get(heading.id) ?? []
				bodies.set(heading.id, current)
			} else if (current) current.push(node)
			else if (isElement(node)) throw new Error('article-html: текст до первого раздела')
		}
	}

	const found: Section[] = []
	const out = SECTIONS.flatMap(({ id, icon: svg }) => {
		const children = bodies.get(id)

		if (!children) return []

		const title = sectionTitle(id, sport)

		found.push({ id, title, icon: svg })

		return [
			el('section', { class: `article-section article-section--${id}`, id, 'aria-labelledby': `${id}-title` }, [
				el('h2', { class: 'article-section__title', id: `${id}-title` }, [
					icon(svg, 'article-section__icon'),
					text(title),
				]),
				...children,
			]),
		]
	})
	const doc = el('root', {}, out)
	const ordered = renumberCites(doc, sources)

	if (injuryHref) walk(doc, (parent) => parent.children.forEach((a) => isElement(a, 'a') && relink(a, injuryHref)))

	for (const section of out) {
		const id = section.attributes.id

		walk(section, (parent) => groupCites(parent, ordered))

		if (id === 'adapt')
			walk(section, (parent) => parent.children.forEach((li) => isElement(li, 'li') && splitSwap(li, sport)))

		if (id === 'frequency') walk(section, highlightPercents)

		if (id === 'urgent')
			walk(section, (parent) => parent.children.forEach((li) => isElement(li, 'li') && markAlarm(li)))

		// Кнопку оживляет lib/print-memo.ts, до того она скрыта. Она тихая и стоит сразу под
		// признаками, а плашка самопроверки -- главное действие раздела, она последней
		if (id === 'urgent')
			section.children.push(
				el('button', { class: 'memo-print', type: 'button', 'data-print-memo': '', hidden: '' }, [
					icon(Printer, 'memo-print__icon'),
					text('Распечатать памятку'),
				]),
			)

		if (id === 'urgent' && checkHref) section.children.push(checkCallout(checkHref))

		if (id === 'first-steps') section.children.forEach((list) => isList(list) && markSteps(list))

		walk(section, linkCalls)
		const seen = new Set<string>()

		walk(section, explain(id, seen, ABBREVIATION, abbreviation))
		walk(section, explain(id, seen, TERM, term))
	}

	return { html: out.map((section) => renderSync(section as never)).join(''), sections: found, sources: ordered }
}

/**
 * Сквозные номера сносок: источник получает номер при первом упоминании на странице. Отдаёт
 * источники в этом порядке. Сноска на источник, которого нет в списке, роняет сборку.
 */
function renumberCites(doc: Element, sources: Source[]) {
	const byKey = new Map(sources.map((s) => [sourceHref(s), s]))
	const order = new Map<string, number>()

	// Один проход в порядке документа: сноска внутри <strong> раньше сноски после него
	const visit = (node: Node) => {
		if (isCite(node)) {
			const key = citeKey(node.attributes.href!)!

			if (!byKey.has(key)) throw new Error(`article-html: сноска на ${key}, которого нет в sources`)

			if (!order.has(key)) order.set(key, order.size + 1)

			node.children = [text(String(order.get(key)))]
		} else if (isElement(node) && node.name !== 'sup') node.children.forEach(visit)
	}

	visit(doc)

	return [...order.keys()].map((key) => byKey.get(key)!)
}

/** Ссылка на травму из текста -- на страницу, которую назовёт `injuryHref`. */
function relink(link: Element, injuryHref: (slug: string) => string | undefined) {
	const slug = link.attributes.href?.match(/^\/injuries\/([a-z0-9-]+)\/?(#.*)?$/)

	if (!slug) return

	const href = injuryHref(slug[1]!)

	if (href) link.attributes.href = href + (slug[2] ?? '')
}

function walk(node: Element, visit: (parent: Element) => void) {
	visit(node)

	for (const child of node.children) if (isElement(child)) walk(child, visit)
}

const isCite = (node: Node | undefined): node is Element =>
	isElement(node, 'a') && citeKey(node.attributes.href ?? '') !== undefined && /^\d+$/.test(textOf(node).trim())

/**
 * Сноски `(N)` и `(N, M)`: ссылки на PubMed или рекомендацию с номером источника, в скобках, через запятую.
 * Группу меняем на `<sup>` без скобок; у ссылки подпись из списка источников для тултипа.
 */
function groupCites(parent: Element, sources: Source[]) {
	// Внутрь готовой сноски не заходим, иначе её ссылка обернётся заново
	if (parent.name === 'sup') return

	const kids = parent.children

	for (let i = 0; i < kids.length; i++) {
		if (!isCite(kids[i])) continue

		let end = i

		while (kids[end + 1]?.type === TEXT_NODE && /^,\s*$/.test(kids[end + 1]!.value ?? '') && isCite(kids[end + 2]))
			end += 2

		const links = kids.slice(i, end + 1).filter(isCite)
		const sup = el('sup', { class: 'cite' }, [])

		links.forEach((link, n) => {
			const num = Number(textOf(link).trim())
			const source = sources[num - 1]
			const label = source && citeHint(source)

			if (n) sup.children.push(text(', '))

			sup.children.push(
				el(
					'a',
					{
						class: 'cite__link',
						href: link.attributes.href!,
						'aria-label': `Источник ${num}${label ? `: ${label}` : ''}`,
						// Подпись и тип работы -- подсказкой при наведении (lib/hint.ts)
						...(label ? { 'data-hint': label } : {}),
					},
					[text(String(num))],
				),
			)
		})

		const before = kids[i - 1]
		const after = kids[end + 1]
		let from = i
		let to = end

		// Скобки вокруг сноски уходят: номер и так поднят над строкой
		if (
			before?.type === TEXT_NODE &&
			after?.type === TEXT_NODE &&
			before.value!.endsWith('(') &&
			after.value!.startsWith(')')
		) {
			before.value = before.value!.replace(/\s*\($/, '')
			after.value = after.value!.slice(1)

			if (!before.value) from = i - 1

			if (!after.value) to = end + 1
		}

		kids.splice(from, to - from + 1, sup)
		i = from
	}
}

/**
 * Значок у подписи половины пары: иконка движения спорта из текста, если оно в списке, иначе запасной.
 */
function markOf(nodes: Node[], fallback: string, sport?: Sport) {
	const movement = sport && movementIn(nodes.map(textOf).join(''), sport.slug)

	return movement ? MOVEMENT_ICONS[movement] : fallback
}

/** "Вместо X → Y" (или через тире) -- пара "было → стало". Разделитель ищем только в тексте строки. */
function splitSwap(li: Element, sport?: Sport) {
	const first = li.children[0]

	if (first?.type !== TEXT_NODE || !first.value!.startsWith('Вместо ')) return

	const at = li.children.findIndex((n) => n.type === TEXT_NODE && /\s(→|—)\s/.test(n.value!))

	if (at < 0) return

	const node = li.children[at]!
	const [, head = '', tail = ''] = node.value!.match(/^([\s\S]*?)\s(?:→|—)\s([\s\S]*)$/) ?? []
	const was = [...li.children.slice(0, at), text(head)]
	const now = [text(tail), ...li.children.slice(at + 1)]

	was[0] = text((was[0]!.value ?? '').replace(/^Вместо\s+/, ''))

	li.attributes.class = 'swap'

	li.children = [
		el('span', { class: 'swap__was' }, [
			el('span', { class: 'swap__label' }, [icon(markOf(was, CircleX, sport), 'swap__mark'), text('Вместо')]),
			text(' '),
			...was,
		]),
		icon(ArrowRight, 'swap__arrow'),
		el('span', { class: 'swap__now' }, [
			el('span', { class: 'swap__hint' }, [icon(markOf(now, CircleCheck, sport), 'swap__mark'), text('Лучше: ')]),
			...now,
		]),
	]
}

/** Процент или диапазон целиком: «14%», «18,5 %», «22,2–43,8%», «75%–93%». */
const PERCENT = /(\d+(?:[.,]\d+)?(?:\s?%?\s?[–—-]\s?\d+(?:[.,]\d+)?)?\s?%)/

/** Проценты в разделе о частоте -- крупнее и жирнее, кроме ссылок, сносок и уже выделенного текста. */
function highlightPercents(parent: Element) {
	if (parent.name === 'a' || parent.name === 'sup' || parent.name === 'strong') return

	// Крупная цифра из блока уже крупная, второй раз её не выделяем
	if (parent.attributes.class === 'big-stat__value') return

	parent.children = parent.children.flatMap((node) => {
		if (node.type !== TEXT_NODE || !/\d\s?%/.test(node.value!)) return [node]

		return (
			node
				.value!.split(PERCENT)
				// Нечётные куски -- то, что поймала группа в PERCENT
				.flatMap((part, i) =>
					!part ? [] : i % 2 ? [el('strong', { class: 'stat' }, [text(part)])] : [text(part)],
				)
		)
	})
}

const isList = (node: Node): node is Element => isElement(node, 'ul') || isElement(node, 'ol')

/** Признак повода для скорой: номер или само слово. Такой пункт -- отдельной красной плашкой. */
const CALL = /\b(103|112)\b|скор(ая|ую|ой)/i

/** Тревожный признак -- строкой со значком; повод для скорой -- сиреной и плашкой. */
function markAlarm(li: Element) {
	const call = CALL.test(textOf(li))

	li.attributes.class = call ? 'alarm alarm--call' : 'alarm'
	li.children = [icon(call ? Siren : CircleAlert, 'alarm__icon'), el('span', { class: 'alarm__text' }, li.children)]
}

/**
 * "Первые шаги" -- нумерованными шагами: номер рисует CSS по счётчику. Жирное начало пункта
 * становится заголовком шага, так в статье и пишем: "**Остановиться.** Не проверять колено...".
 */
function markSteps(list: Element) {
	list.attributes.class = 'steps'

	for (const li of list.children) if (isElement(li, 'li')) li.attributes.class = 'step'
}

/** Внутрь ссылок, сносок, заголовков и подписи раскрывашки разметку не вкладываем. */
const SKIP = new Set(['a', 'sup', 'h2', 'summary', 'button'])

/**
 * Куски текста по `pattern` -- в узлы `make`, остальной текст как был. В `pattern` одна
 * группа: нечётные куски после split -- то, что она поймала.
 */
function replaceText(parent: Element, pattern: RegExp, make: (match: string) => Node[]) {
	if (SKIP.has(parent.name) || parent.attributes.class === 'big-stat__value') return

	parent.children = parent.children.flatMap((node) => {
		if (node.type !== TEXT_NODE || !pattern.test(node.value!)) return [node]

		return node.value!.split(pattern).flatMap((part, i) => (!part ? [] : i % 2 ? make(part) : [text(part)]))
	})
}

/**
 * Пара номеров скорой "(103 или 112)", "103/112" -- одной группой без переносов: трубка, номера
 * ссылками tel:, скобки при них. С телефона звонок в одно касание. Номер без пары не трогаем:
 * "103 тяжёлых травмы" из исследования -- не звонок.
 */
function linkCalls(parent: Element) {
	replaceText(parent, /(\(?(?<!\d)(?:103|112)\s*(?:\/|или)\s*(?:103|112)(?!\d)\)?)/, (group) => [
		el('span', { class: 'calls' }, [
			icon(Phone, 'calls__icon'),
			...group.split(/(103|112)/).flatMap((part, i) =>
				!part
					? []
					: i % 2
						? [
								el(
									'a',
									{
										class: 'calls__number',
										href: `tel:${part}`,
										'aria-label': `Позвонить ${part}`,
									},
									[text(part)],
								),
							]
						: [text(part)],
			),
		]),
	])
}

/**
 * Знаки сразу за словом: кнопка -- отдельный блок в строке, и браузер переносил точку после
 * неё на новую строку одну. Знаки ловим вместе со словом и держим с ним без переноса.
 */
const TRAILING = '[.,:;!?)»…]*'

const PUNCTUATION = /[.,:;!?)»…]+$/

const ABBREVIATION = new RegExp(
	`(?<![\\p{L}\\p{N}])((?:${Object.keys(ABBREVIATIONS)
		.sort((a, b) => b.length - a.length)
		// Амперсанд в тексте после Markdown бывает и сущностью
		.map((key) => key.replaceAll('&', '&(?:amp;)?'))
		.join('|')})(?![\\p{L}\\p{N}])${TRAILING})`,
	'u',
)

/** Термин с любым окончанием: основа из `TERMS`, дальше буквы. Регистр не важен. */
const TERM = new RegExp(
	`(?<![\\p{L}\\p{N}])((?:${Object.keys(TERMS)
		.sort((a, b) => b.length - a.length)
		.join('|')})\\p{L}*${TRAILING})`,
	'iu',
)

type Explained = { key: string; text: string }

const abbreviation = (match: string): Explained => {
	const key = match.replace('&amp;', '&')

	return { key, text: ABBREVIATIONS[key]! }
}

const term = (match: string): Explained => {
	const key = Object.keys(TERMS)
		.sort((a, b) => b.length - a.length)
		.find((stem) => match.toLowerCase().startsWith(stem))!

	return { key, text: TERMS[key]! }
}

/**
 * Аббревиатура или термин -- кнопкой с расшифровкой в подсказке (lib/tip.ts открывает её и с
 * пальца). Только первое упоминание в разделе: читают и с середины по оглавлению, а подчёркивать
 * каждое МРТ в статье -- шум. `seen` -- уже объяснённое в этом разделе, общее для обоих проходов.
 */
function explain(section: string, seen: Set<string>, pattern: RegExp, lookup: (match: string) => Explained) {
	return (parent: Element) =>
		replaceText(parent, pattern, (found) => {
			const punctuation = found.match(PUNCTUATION)?.[0] ?? ''
			const match = found.slice(0, found.length - punctuation.length)
			const { key, text: tip } = lookup(match)

			if (seen.has(key)) return [text(found)]

			seen.add(key)

			const id = `abbr-${section}-${seen.size}`

			const button = el(
				'button',
				{
					class: 'abbr',
					type: 'button',
					'aria-expanded': 'false',
					'aria-controls': id,
					'data-tip-for': id,
				},
				[text(match)],
			)

			return [
				punctuation ? el('span', { class: 'abbr-glue' }, [button, text(punctuation)]) : button,
				el('span', { class: 'tip', id, popover: 'auto' }, [text(tip)]),
			]
		})
}

/**
 * Подпись сноски: наша подпись источника и насколько весома работа -- метаанализ, РКИ,
 * описание случая. У рекомендации с сайта тип известен и без PubMed.
 */
function citeHint(source: Source) {
	const type = 'pmid' in source ? sourceDetails(source).type : 'клиническая рекомендация'

	// Подпись часто сама говорит "метаанализ ..." -- тогда не повторяем. Сверяем по началу
	// слов: "клинические рекомендации" в подписи -- та же "клиническая рекомендация"
	const said = type?.split(' ').every((word) => source.label.toLowerCase().includes(word.slice(0, 7).toLowerCase()))

	return type && !said ? `${source.label} · ${type}` : source.label
}

/**
 * Плашка самопроверки: значок, вопрос крупно, что там делать -- мельче, справа кнопка-ссылка.
 * Ссылка -- только кнопка: вся плашка ссылкой попадала под оформление ссылок текста (градиент
 * бренда на страницах без спорта, global.css).
 */
function checkCallout(href: string) {
	return el('div', { class: 'check-callout' }, [
		icon(ClipboardCheck, 'check-callout__icon'),
		el('div', { class: 'check-callout__text' }, [
			el('p', { class: 'check-callout__title' }, [text('Мне к врачу?')]),
			el('p', { class: 'check-callout__lead' }, [
				text('Отметьте признаки, которые есть сейчас, — подскажем, насколько срочно'),
			]),
		]),
		el('a', { class: 'check-callout__button', href }, [
			text('Проверить себя'),
			icon(ChevronRight, 'check-callout__arrow'),
		]),
	])
}
