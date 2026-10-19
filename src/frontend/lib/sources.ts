import { plural } from './plural.ts'
import { citedPmids, pubmedUrl } from './pubmed.ts'

/**
 * Источники вне PubMed: клинические рекомендации и справочники для врачей. Ключ -- хост,
 * значение -- подпись вместо "PMID" в списке источников. Обзоры Cochrane и консенсусы BJSM
 * есть в PubMed, их цитируем по PMID.
 */
const GUIDELINE_SITES: Record<string, string> = {
	'cr.minzdrav.gov.ru': 'Минздрав России',
	'bestpractice.bmj.com': 'BMJ Best Practice',
	'cks.nice.org.uk': 'NICE CKS',
	'www.nice.org.uk': 'NICE',
	// Рекомендации Американской академии хирургов-ортопедов (AAOS): в PubMed их нет
	'www.orthoguidelines.org': 'AAOS',
}

export type Source = { pmid: string; label: string } | { url: string; label: string }

/** Сайт рекомендации по https-ссылке, если хост в списке. */
export function guidelineSite(url: string) {
	if (!URL.canParse(url)) return undefined

	const { protocol, host } = new URL(url)

	return protocol === 'https:' ? GUIDELINE_SITES[host] : undefined
}

/**
 * Из чего состоит список источников -- строка под свёрнутым заголовком: "18 работ из PubMed
 * и 2 клинические рекомендации".
 */
export function sourcesSummary(sources: Source[]) {
	const papers = sources.filter((s) => 'pmid' in s).length
	const guidelines = sources.length - papers

	return [
		papers && `${papers} ${plural(papers, ['работа', 'работы', 'работ'])} из PubMed`,
		guidelines &&
			`${guidelines} ${plural(guidelines, ['клиническая рекомендация', 'клинические рекомендации', 'клинических рекомендаций'])}`,
	]
		.filter(Boolean)
		.join(' и ')
}

export const sourceHref = (source: Source) => ('pmid' in source ? pubmedUrl(source.pmid) : source.url)

/** Подпись ссылки в списке источников: "PMID 123" или название сайта. */
export const sourceSite = (source: Source) =>
	'pmid' in source ? `PMID ${source.pmid}` : (guidelineSite(source.url) ?? new URL(source.url).host)

/**
 * Ключ сноски для сверки с `sources`: у PubMed -- каноническая ссылка (ссылки в тексте бывают
 * без слэша и в старой форме ncbi), у рекомендации -- сама ссылка, как в `sources`.
 */
export function citeKey(url: string) {
	const [pmid] = citedPmids(url)

	if (pmid) return pubmedUrl(pmid)

	return guidelineSite(url) ? url : undefined
}

/** Ссылки Markdown `[текст](url)`. */
const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g

/** Сноски из Markdown: номер и ключ источника, в порядке появления в тексте. */
export const footnotes = (markdown: string) =>
	[...markdown.matchAll(LINK)].flatMap(([, text = '', url = '']) => {
		const key = citeKey(url)

		return key ? [{ text, key }] : []
	})
