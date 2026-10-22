import * as z from 'zod/v4'

/**
 * Как пользоваться базой: публичный MCP отдаёт это модели клиента вместе со списком
 * инструментов, чат на сайте кладёт в системный промпт. Справка, а не диагноз.
 */
export const INSTRUCTIONS = `Sorebody -- справочник спортивных травм на русском: кроссфит, падел, футбол, бег, баскетбол.
Статьи написаны по исследованиям PubMed и клиническим рекомендациям. Это справка, а не диагноз.

Когда человек описывает боль или травму:
1. Сначала тревожные признаки: get_red_flags по травме или по зоне тела. Если признак есть,
   прямо скажи, что делать: скорая 103/112, травмпункт сегодня или врач в ближайшие дни.
2. Потом search_injuries по описанию своими словами и get_article с нужными разделами.
3. Не ставь диагноз: «похоже на…», «стоит исключить…». Опирайся только на тексты базы,
   давай ссылки на статьи (url) и источники.
4. Если подходящей статьи нет -- так и скажи и посоветуй врача.`

const region = z.string().optional().describe('Зона тела, slug из get_catalog: knee, shoulder, lumbar…')

const sport = z
	.string()
	.optional()
	.describe('Спорт, slug из get_catalog: crossfit, padel, football, running, basketball')

/**
 * Названия, описания и схемы аргументов инструментов базы: одни для MCP и чата,
 * чтобы модели по обе стороны видели одно и то же. Обработчики у каждого свои.
 */
export const TOOLS = {
	search_injuries: {
		title: 'Найти травмы',
		description:
			'Травмы, похожие на описание: что болит, как случилось, какие ощущения. Лучшие совпадения первыми, с кратким описанием и адресом статьи.',
		inputSchema: z.object({
			query: z
				.string()
				.min(2)
				.max(500)
				.describe('Описание своими словами, по-русски: «хлопнуло в колене на приземлении»'),
			region,
			sport,
			element: z
				.string()
				.optional()
				.describe('Движение или ситуация спорта, slug из get_catalog; только вместе с sport'),
			limit: z.number().int().min(1).max(10).optional().describe('Сколько травм вернуть, по умолчанию 5'),
		}),
	},

	get_article: {
		title: 'Статья о травме',
		description:
			'Текст статьи по разделам: what, symptoms, urgent, first-steps, specialist, diagnosis, treatment, return, prevention; со спортом -- ещё его frequency, mechanism, adapt. Сноски (N) -- номера в sources той же части.',
		inputSchema: z.object({
			slug: z.string().describe('Slug травмы из search_injuries или list_injuries'),
			sport,
			sections: z.array(z.string()).optional().describe('Только эти разделы; без них -- вся статья'),
		}),
	},

	get_red_flags: {
		title: 'Когда сразу к врачу',
		description:
			'Тревожные признаки и насколько срочно к врачу: для одной травмы (slug) или для всех травм зоны тела (region), когда ясно только, где болит.',
		inputSchema: z.object({ slug: z.string().optional().describe('Slug травмы'), region }),
	},

	list_injuries: {
		title: 'Каталог травм',
		description:
			'Все травмы базы, по зоне тела, спорту и движению спорта. Со спортом -- насколько травма в нём часта.',
		inputSchema: z.object({
			region,
			sport,
			element: z.string().optional().describe('Движение спорта, slug из get_catalog; только вместе с sport'),
		}),
	},

	get_catalog: {
		title: 'Зоны и спорты',
		description: 'Справочники для фильтров: зоны тела, спорты и их движения со slug и названиями.',
	},
} as const
