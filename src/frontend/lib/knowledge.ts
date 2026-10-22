import { REGIONS } from '#frontend/data/regions.ts'
import { sportArticle, SPORTS } from '#frontend/data/sports.ts'
import type { Knowledge, KnowledgeInjury, KnowledgeSection, KnowledgeSource } from '#shared/knowledge.ts'

import { INJURY_HEADINGS, LENS_HEADINGS } from './article-html.ts'
import { injuryPage } from './injury-page.ts'
import { citeKey, sourceHref, type Source } from './sources.ts'

/** Запись коллекции: и из `getCollection`, и прочитанная с диска в тестах. */
type Entry = { id: string; data: Record<string, any>; body?: string }

/**
 * Маркер блока в тексте (`<div data-chart="id"></div>`), бывает и с отступом внутри пункта
 * списка. Сами блоки -- во frontmatter, текста в маркере нет.
 */
const BLOCK = /^[ \t]*<div data-[a-z]+="[a-z0-9-]+"><\/div>\n?/gm

/** Ссылка-сноска `[N](url)`: в тексте для агента остаётся номер, скобки вокруг уже есть. */
const CITE = /\[(\d+)\]\(([^)\s]+)\)/g

/**
 * Markdown статьи -- разделами по заголовкам `## `. Неизвестный заголовок роняет сборку, как и
 * у страницы (lib/article-html.ts): разделы файла держит тест контента.
 */
export function markdownSections(body: string, headings: typeof INJURY_HEADINGS): KnowledgeSection[] {
	const sections: KnowledgeSection[] = []

	for (const chunk of body.split(/^## /m).slice(1)) {
		const [title = '', ...rest] = chunk.split('\n')
		const heading = headings.find((h) => h.title === title.trim())

		if (!heading) throw new Error(`knowledge: неизвестный раздел «${title.trim()}»`)

		const text = rest
			.join('\n')
			.replace(BLOCK, '')
			.replace(CITE, (link, n: string, url: string) => (citeKey(url) ? n : link))
			.trim()

		sections.push({ id: heading.id, title: heading.title, text })
	}

	return sections
}

const sourcesOf = (sources: Source[]): KnowledgeSource[] =>
	sources.map((source, i) => ({ n: i + 1, label: source.label, href: sourceHref(source) }))

/**
 * База знаний из коллекций: общие части травм с линзами всех спортов, где они есть, и справочники
 * зон и спортов. Адреса -- те же, что у страниц сайта.
 */
export function buildKnowledge(site: string, injuries: Entry[], lenses: Entry[]): Knowledge {
	const bySlug = new Map<string, Entry[]>()

	for (const lens of lenses) {
		const slug = lens.id.split('/').at(-1)!

		bySlug.set(slug, [...(bySlug.get(slug) ?? []), lens])
	}

	return {
		site,
		regions: REGIONS.map(({ slug, label }) => ({ slug, label })),
		sports: SPORTS.map(({ slug, title, elements }) => ({
			slug,
			title,
			elements: elements.map((e) => ({ slug: e.slug, title: e.title, titleEn: e.titleEn })),
		})),
		injuries: injuries.map(({ id: slug, data, body = '' }): KnowledgeInjury => {
			// Линзы -- в порядке SPORTS, как и переключатель спорта на странице
			const own = SPORTS.flatMap((sport) => {
				const lens = bySlug.get(slug)?.find((l) => l.id === `${sport.slug}/${slug}`)

				return lens ? [{ sport: sport.slug, lens }] : []
			})

			return {
				slug,
				title: data.title,
				titleEn: data.titleEn,
				region: data.region,
				url: injuryPage(
					slug,
					own.map((l) => l.sport),
				),
				draft: data.draft,
				brief: (data.brief ?? []).map(({ label, text }: { label: string; text: string }) => ({ label, text })),
				takeaways: data.takeaways ?? [],
				selfCheck: data.selfCheck ?? [],
				sections: markdownSections(body, INJURY_HEADINGS),
				sources: sourcesOf(data.sources),
				lenses: own.map(({ sport, lens }) => ({
					sport,
					url: sportArticle(sport, slug),
					frequency: lens.data.frequency,
					elements: lens.data.elements,
					summary: lens.data.summary,
					sections: markdownSections(lens.body ?? '', LENS_HEADINGS),
					sources: sourcesOf(lens.data.sources),
				})),
			}
		}),
	}
}
