import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'

import { buildKnowledge } from '#frontend/lib/knowledge.ts'

/**
 * База знаний для бэкенда (src/backend/knowledge): статьи простым текстом по разделам.
 * Бэкенд берёт её из сборки, а не разбирает Markdown сам: так схема и разделы
 * живут в одном месте.
 */
export const GET: APIRoute = async ({ site }) =>
	Response.json(buildKnowledge(String(site), await getCollection('injuries'), await getCollection('lenses')))
