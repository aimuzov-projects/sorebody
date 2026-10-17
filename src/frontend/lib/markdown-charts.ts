import type { HastPluginDefinition } from 'satteri'

import { iconArrayHtml } from './icon-array.ts'
import type { Chart } from './injury-schema.ts'

const MARKER = /^<div data-chart="([a-z0-9-]+)"><\/div>$/

/**
 * Заменяет маркер `<div data-chart="id"></div>` в статье на пиктограмму из `charts` во frontmatter.
 * HTML внутри Markdown Sätteri не разбирает, маркер приходит сырым узлом, его и ищем.
 * Маркер без данных роняет сборку: опечатка в id иначе тихо оставит в статье пустой блок.
 */
export const chartsPlugin: HastPluginDefinition = {
	name: 'wodcare-charts',
	raw(node, ctx) {
		const id = node.value.trim().match(MARKER)?.[1]

		if (id === undefined) return

		const charts: Chart[] = ctx.data.astro?.frontmatter['charts'] ?? []
		const chart = charts.find((c) => c.id === id)

		if (!chart) throw new Error(`${ctx.fileURL?.pathname}: нет графика «${id}» в charts`)

		ctx.replaceNode(node, { type: 'raw', value: iconArrayHtml(chart) })
	},
}
