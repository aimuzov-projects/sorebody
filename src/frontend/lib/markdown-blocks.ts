import type { HastPluginDefinition } from 'satteri'

import { compareHtml, diagramHtml, statHtml, timelineHtml } from './article-blocks.ts'
import { iconArrayHtml } from './icon-array.ts'
import { compareSchema, diagramSchema, statSchema, timelineSchema, type Chart } from './injury-schema.ts'
import type { Source } from './sources.ts'

/**
 * Блоки, которые ставятся в текст маркером: поле frontmatter с данными и как их рисовать.
 * Frontmatter здесь сырой, до схемы коллекции, поэтому значения по умолчанию добирает своя схема.
 */
const BLOCKS: Record<string, { field: string; html: (data: unknown, sources: Source[]) => string }> = {
	chart: { field: 'charts', html: (data) => iconArrayHtml(data as Chart) },
	timeline: { field: 'timelines', html: (data, sources) => timelineHtml(timelineSchema.parse(data), sources) },
	compare: { field: 'compares', html: (data, sources) => compareHtml(compareSchema.parse(data), sources) },
	stat: { field: 'stats', html: (data, sources) => statHtml(statSchema.parse(data), sources) },
	diagram: { field: 'diagrams', html: (data) => diagramHtml(diagramSchema.parse(data)) },
}

const MARKER = new RegExp(`^<div data-(${Object.keys(BLOCKS).join('|')})="([a-z0-9-]+)"></div>$`)

/**
 * Заменяет маркер вида `<div data-chart="id"></div>` в статье на блок из своего поля frontmatter:
 * пиктограмму, шкалу, развилку или крупную цифру. HTML внутри Markdown Sätteri не разбирает,
 * маркер приходит сырым узлом, его и ищем. Маркер без данных роняет сборку: опечатка в id иначе
 * тихо оставит в статье пустой блок.
 */
export const blocksPlugin: HastPluginDefinition = {
	name: 'sorebody-blocks',
	raw(node, ctx) {
		const [, kind, id] = node.value.trim().match(MARKER) ?? []

		if (kind === undefined || id === undefined) return

		const block = BLOCKS[kind]!
		const frontmatter = ctx.data.astro?.frontmatter ?? {}
		const items: { id: string }[] = frontmatter[block.field] ?? []
		const data = items.find((item) => item.id === id)

		if (!data) throw new Error(`${ctx.fileURL?.pathname}: нет блока «${id}» в ${block.field}`)

		ctx.replaceNode(node, { type: 'raw', value: block.html(data, frontmatter['sources'] ?? []) })
	},
}
