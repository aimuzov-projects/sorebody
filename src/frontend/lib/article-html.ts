import {
	ArrowRight,
	ChartColumn,
	Dumbbell,
	Footprints,
	Info,
	Repeat,
	ShieldCheck,
	Stethoscope,
	TriangleAlert,
} from 'lucide-static'
import { ELEMENT_NODE, parse, renderSync, TEXT_NODE } from 'ultrahtml'

type Node = { type: number; name?: string; value?: string; attributes?: Record<string, string>; children?: Node[] }
type Element = Node & { name: string; attributes: Record<string, string>; children: Node[] }

/**
 * Разделы статьи в порядке шаблона (его держит тест контента). По тексту заголовка раздел
 * получает id для оглавления и иконку Lucide.
 */
export const SECTIONS = [
	{ id: 'what', title: 'Что это', icon: Info },
	{ id: 'frequency', title: 'Как часто в кроссфите', icon: ChartColumn },
	{ id: 'mechanism', title: 'Механизм и движения', icon: Dumbbell },
	{ id: 'symptoms', title: 'Симптомы', icon: Stethoscope },
	{ id: 'urgent', title: 'Когда сразу к врачу', icon: TriangleAlert },
	{ id: 'first-steps', title: 'Первые шаги', icon: Footprints },
	{ id: 'adapt', title: 'Как адаптировать тренировки', icon: Repeat },
	{ id: 'prevention', title: 'Профилактика', icon: ShieldCheck },
] as const

export type Section = (typeof SECTIONS)[number]

const PUBMED = /^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/?$/

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
 */
export function enhanceArticle(html: string, sources: { label: string }[]) {
	const doc = parse(html) as Element
	const out: Node[] = []
	const found: Section[] = []
	let current: Element | null = null

	for (const node of doc.children) {
		if (isElement(node, 'h2')) {
			const title = textOf(node).trim()
			const section = SECTIONS.find((s) => s.title === title)

			if (!section) throw new Error(`article-html: неизвестный раздел «${title}»`)

			found.push(section)

			current = el(
				'section',
				{
					class: `article-section article-section--${section.id}`,
					id: section.id,
					'aria-labelledby': `${section.id}-title`,
				},
				[
					el('h2', { class: 'article-section__title', id: `${section.id}-title` }, [
						icon(section.icon, 'article-section__icon'),
						text(title),
					]),
				],
			)

			out.push(current)
		} else if (current) current.children.push(node)
		else out.push(node)
	}

	doc.children = out

	for (const section of out) {
		if (!isElement(section, 'section')) continue

		const id = section.attributes.id

		walk(section, (parent) => groupCites(parent, sources))

		if (id === 'adapt')
			walk(section, (parent) => parent.children.forEach((li) => isElement(li, 'li') && splitSwap(li)))

		if (id === 'frequency') walk(section, highlightPercents)
	}

	return { html: renderSync(doc as never), sections: found }
}

function walk(node: Element, visit: (parent: Element) => void) {
	visit(node)

	for (const child of node.children) if (isElement(child)) walk(child, visit)
}

const isCite = (node: Node | undefined): node is Element =>
	isElement(node, 'a') && PUBMED.test(node.attributes.href ?? '') && /^\d+$/.test(textOf(node).trim())

/**
 * Сноски `(N)` и `(N, M)`: ссылки на PubMed с номером источника, в скобках, через запятую.
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

/** "Вместо X → Y" (или через тире) -- пара "было → стало". Разделитель ищем только в тексте строки. */
function splitSwap(li: Element) {
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
		el('span', { class: 'swap__was' }, [el('span', { class: 'swap__label' }, [text('Вместо')]), text(' '), ...was]),
		icon(ArrowRight, 'swap__arrow'),
		el('span', { class: 'swap__now' }, [el('span', { class: 'swap__hint' }, [text('Лучше: ')]), ...now]),
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
