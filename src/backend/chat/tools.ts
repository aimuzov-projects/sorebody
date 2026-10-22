import * as z from 'zod/v4'

import { TOOLS } from '#backend/knowledge/schema.ts'
import { KnowledgeError, type knowledgeTools } from '#backend/knowledge/tools.ts'

type Tools = ReturnType<typeof knowledgeTools>

/** Чату хватает трёх инструментов: каталог он знает из промпта, список травм ему не нужен. */
const NAMES = ['get_red_flags', 'search_injuries', 'get_article'] as const

type Name = (typeof NAMES)[number]

/** Что из ответа инструмента виджет рисует сам, не дожидаясь пересказа модели. */
export type ToolEvent =
	| { type: 'alarms'; flags: ReturnType<Tools['getRedFlags']> }
	| { type: 'cards'; cards: { slug: string; title: string; url: string; draft: boolean }[] }

const isName = (name: string): name is Name => (NAMES as readonly string[]).includes(name)

/**
 * Инструменты базы для чата в формате OpenAI-совместимого API. Отличия от MCP: признаки --
 * без текста раздела, статья -- только по разделам. Так дешевле, а полный текст человек
 * прочитает по ссылке.
 */
export function chatTools(tools: Tools) {
	const definitions = NAMES.map((name) => ({
		type: 'function' as const,
		function: {
			name,
			description: TOOLS[name].description,
			parameters: z.toJSONSchema(TOOLS[name].inputSchema),
		},
	}))

	function call(name: Name, args: unknown): { result: unknown; event?: ToolEvent } {
		if (name === 'get_red_flags') {
			const flags = tools.getRedFlags({ ...TOOLS.get_red_flags.inputSchema.parse(args), brief: true })

			return { result: flags, event: { type: 'alarms', flags } }
		}

		if (name === 'search_injuries') {
			const hits = tools.searchInjuries(TOOLS.search_injuries.inputSchema.parse(args))
			const cards = hits.map(({ slug, title, url, draft }) => ({ slug, title, url, draft }))

			return { result: hits, event: { type: 'cards', cards } }
		}

		const query = TOOLS.get_article.inputSchema.parse(args)

		if (!query.sections?.length)
			throw new KnowledgeError('Укажи sections: в чате статья отдаётся только по разделам')

		return { result: tools.getArticle(query) }
	}

	/**
	 * Вызов по имени и аргументам от модели. Ошибка в аргументах -- текст для модели, чтобы
	 * она исправилась, а не исключение: аргументы пишет она.
	 */
	function run(name: string, raw: string): { content: string; event?: ToolEvent } {
		try {
			if (!isName(name)) throw new KnowledgeError(`Нет инструмента ${name}. Есть: ${NAMES.join(', ')}`)

			const { result, event } = call(name, JSON.parse(raw || '{}'))

			return { content: JSON.stringify(result), event }
		} catch (error) {
			if (error instanceof KnowledgeError || error instanceof z.ZodError || error instanceof SyntaxError)
				return { content: `Ошибка: ${error.message}` }

			throw error
		}
	}

	return { definitions, run }
}
