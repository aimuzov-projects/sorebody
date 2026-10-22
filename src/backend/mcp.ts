import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

import { INSTRUCTIONS, TOOLS } from './knowledge/schema.ts'
import { KnowledgeError, type knowledgeTools } from './knowledge/tools.ts'

type Tools = ReturnType<typeof knowledgeTools>

/**
 * Ответ инструмента: JSON текстом. Ошибка базы -- `isError`, а не исключение,
 * чтобы модель увидела текст ошибки и исправила аргументы.
 */
function answer(run: () => unknown) {
	try {
		return { content: [{ type: 'text' as const, text: JSON.stringify(run()) }] }
	} catch (error) {
		if (error instanceof KnowledgeError)
			return { content: [{ type: 'text' as const, text: error.message }], isError: true }

		throw error
	}
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }

/**
 * MCP-сервер Sorebody над инструментами базы: только чтение, без модели на нашей
 * стороне -- рассуждает модель клиента. Для HTTP без сессий сервер свой на каждый
 * запрос, создаётся он дёшево.
 */
export function mcpServer(tools: Tools, version: string) {
	const server = new McpServer({ name: 'sorebody', title: 'Sorebody', version }, { instructions: INSTRUCTIONS })

	server.registerTool('search_injuries', { ...TOOLS.search_injuries, annotations: READ_ONLY }, (args) =>
		answer(() => tools.searchInjuries(args)),
	)

	server.registerTool('get_article', { ...TOOLS.get_article, annotations: READ_ONLY }, (args) =>
		answer(() => tools.getArticle(args)),
	)

	server.registerTool('get_red_flags', { ...TOOLS.get_red_flags, annotations: READ_ONLY }, (args) =>
		answer(() => tools.getRedFlags(args)),
	)

	server.registerTool('list_injuries', { ...TOOLS.list_injuries, annotations: READ_ONLY }, (args) =>
		answer(() => tools.listInjuries(args)),
	)

	server.registerTool('get_catalog', { ...TOOLS.get_catalog, annotations: READ_ONLY }, () =>
		answer(() => tools.catalog()),
	)

	server.registerPrompt(
		'sorebody_triage',
		{
			title: 'Разобрать жалобу',
			description:
				'Разобрать, что болит, по базе Sorebody: тревожные признаки, похожие травмы, что делать сейчас.',
			argsSchema: z.object({
				complaint: z.string().describe('Что болит и как это случилось'),
				sport: z.string().optional().describe('Каким спортом занимается'),
			}),
		},
		({ complaint, sport: kind }) => ({
			messages: [
				{
					role: 'user' as const,
					content: {
						type: 'text' as const,
						text: `${INSTRUCTIONS}\n\nЖалоба${kind ? ` (спорт: ${kind})` : ''}: ${complaint}`,
					},
				},
			],
		}),
	)

	return server
}
