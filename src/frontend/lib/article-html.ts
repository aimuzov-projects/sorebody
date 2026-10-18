import {
	ArrowRight,
	Bandage,
	CalendarClock,
	ChartColumn,
	CircleCheck,
	CircleX,
	Dumbbell,
	Footprints,
	Info,
	Repeat,
	ScanSearch,
	ShieldCheck,
	Stethoscope,
	TriangleAlert,
	UserRoundSearch,
} from 'lucide-static'
import { ELEMENT_NODE, parse, renderSync, TEXT_NODE } from 'ultrahtml'

import { MOVEMENT_ICONS } from '#frontend/data/movement-icons.ts'
import type { Sport } from '#frontend/data/sports.ts'

import { movementIn } from './movement-match.ts'
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
export function enhanceArticle(parts: ArticlePart[], { sources, sport, injuryHref }: Options) {
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
function groupCites(parent: Element, sources: { label: string }[]) {
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
			const label = sources[num - 1]?.label

			if (n) sup.children.push(text(', '))

			sup.children.push(
				el(
					'a',
					{
						class: 'cite__link',
						href: link.attributes.href!,
						'aria-label': `Источник ${num}${label ? `: ${label}` : ''}`,
						// Подпись источника -- тултипом при наведении (styles/article.css)
						...(label ? { 'data-tip': label } : {}),
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
 * Значок у подписи половины пары: иконка движения из текста, если оно в списке, иначе запасной.
 * Движения в тексте пока узнаются только кроссфитные.
 */
function markOf(nodes: Node[], fallback: string, sport?: Sport) {
	const movement = sport?.slug === 'crossfit' ? movementIn(nodes.map(textOf).join('')) : undefined

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
