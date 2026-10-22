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
	| { type: 'cards'; cards: { slug: string; title: string; url: string }[] }

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
			const cards = hits.map(({ slug, title, url }) => ({ slug, title, url }))

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

	/** Хост сайта: ссылки на него в ответе разрешены всегда. */
	const site = new URL(tools.catalog().site).host
	const titles = new Map(tools.listInjuries().map((i) => [i.slug, i.title]))

	/**
	 * Подпись ссылки на статью: заголовок травмы, а для раздела -- ещё и его название.
	 * Адрес -- `/<спорт или injuries>/<slug>/#<раздел>`; чужой адрес -- без подписи.
	 */
	function title(url: URL) {
		const [first, slug] = url.pathname.split('/').filter(Boolean)
		const name = slug && titles.get(slug)
		const id = url.hash.slice(1)

		if (!name || !id) return name || undefined

		const sport = first === 'injuries' ? undefined : first
		let article: ReturnType<Tools['getArticle']>

		// У травмы может не быть разбора этого спорта: тогда разделы общей части
		try {
			article = tools.getArticle({ slug, sport })
		} catch {
			article = tools.getArticle({ slug })
		}

		const section = [...article.sections, ...(article.lens?.sections ?? [])].find((s) => s.id === id)

		return section ? `${name} — ${section.title.charAt(0).toLowerCase()}${section.title.slice(1)}` : name
	}

	return { definitions, run, site, title }
}
