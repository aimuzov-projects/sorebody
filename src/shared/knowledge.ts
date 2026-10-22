/**
 * База знаний для бэкенда: статьи сайта простым текстом, по разделам.
 * Собирает её сборка сайта в `/knowledge.json` (src/frontend/pages/knowledge.json.ts),
 * читают поиск и инструменты агента (src/backend/knowledge).
 *
 * Адреса страниц -- пути от корня сайта, полный адрес даёт `site`.
 */
export type Knowledge = {
	site: string
	regions: { slug: string; label: string }[]
	sports: { slug: string; title: string; elements: { slug: string; title: string; titleEn: string }[] }[]
	injuries: KnowledgeInjury[]
}

/** Раздел статьи: id как в оглавлении страницы, Markdown без разметки блоков, сноски -- `(N)`. */
export type KnowledgeSection = { id: string; title: string; text: string }

/** Источник под номером `n`: так на него ссылаются сноски разделов того же файла. */
export type KnowledgeSource = { n: number; label: string; href: string }

/** Признак из самопроверки "Мне к врачу?": call -- скорая, today -- сегодня, soon -- в ближайшие дни. */
type KnowledgeAlarm = { text: string; urgency: 'call' | 'today' | 'soon' }

/** Общая часть травмы и её линзы спортов. */
export type KnowledgeInjury = {
	slug: string
	title: string
	titleEn: string
	region: string
	url: string
	brief: { label: string; text: string }[]
	takeaways: string[]
	selfCheck: KnowledgeAlarm[]
	sections: KnowledgeSection[]
	sources: KnowledgeSource[]
	lenses: KnowledgeLens[]
}

/** Травма глазами спорта: у линзы свои разделы и своя нумерация источников. */
type KnowledgeLens = {
	sport: string
	url: string
	frequency: string
	elements: string[]
	summary: string
	sections: KnowledgeSection[]
	sources: KnowledgeSource[]
}
