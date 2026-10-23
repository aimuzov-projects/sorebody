import { plural } from './plural.ts'
import { citedPmids, pubmedUrl } from './pubmed.ts'

type SiteKind = 'guideline' | 'statistics'

/**
 * Источники вне PubMed. Ключ -- хост, `name` -- подпись вместо "PMID" в списке источников.
 * `guideline` -- клинические и полевые рекомендации, `statistics` -- ежегодные отчёты горной
 * полиции и спасателей о несчастных случаях. Обзоры Cochrane, консенсусы BJSM и рекомендации
 * WMS есть в PubMed, их цитируем по PMID.
 */
const SITES: Record<string, { name: string; kind: SiteKind }> = {
	'cr.minzdrav.gov.ru': { name: 'Минздрав России', kind: 'guideline' },
	'bestpractice.bmj.com': { name: 'BMJ Best Practice', kind: 'guideline' },
	'cks.nice.org.uk': { name: 'NICE CKS', kind: 'guideline' },
	'www.nice.org.uk': { name: 'NICE', kind: 'guideline' },
	// Рекомендации Американской академии хирургов-ортопедов (AAOS): в PubMed их нет
	'www.orthoguidelines.org': { name: 'AAOS', kind: 'guideline' },
	// Медкомиссии UIAA и ICAR: рекомендации для гор, в PubMed большей части нет
	'www.theuiaa.org': { name: 'UIAA', kind: 'guideline' },
	'www.alpine-rescue.org': { name: 'ICAR', kind: 'guideline' },
	// Регистры несчастных случаев в горах: считают вызовы и погибших, а не диагнозы
	'alpinesicherheit.at': { name: 'ÖKAS', kind: 'statistics' },
	'www.bmi.gv.at': { name: 'Альпийская полиция Австрии', kind: 'statistics' },
	'www.sac-cas.ch': { name: 'SAC', kind: 'statistics' },
	'alpenverein.de': { name: 'DAV', kind: 'statistics' },
	'www.mountain.rescue.org.uk': { name: 'MREW', kind: 'statistics' },
}

export type Source = { pmid: string; label: string } | { url: string; label: string }

function site(url: string) {
	if (!URL.canParse(url)) return undefined

	const { protocol, host } = new URL(url)

	return protocol === 'https:' ? SITES[host] : undefined
}

/** Название сайта источника по https-ссылке, если хост в списке. */
export const guidelineSite = (url: string) => site(url)?.name

const KIND_FORMS: Record<SiteKind, [string, string, string]> = {
	guideline: ['клиническая рекомендация', 'клинические рекомендации', 'клинических рекомендаций'],
	statistics: ['отчёт горной статистики', 'отчёта горной статистики', 'отчётов горной статистики'],
}

/**
 * Из чего состоит список источников -- строка под свёрнутым заголовком: "18 работ из PubMed,
 * 2 клинические рекомендации и 1 отчёт горной статистики".
 */
export function sourcesSummary(sources: Source[]) {
	const count = (kind: SiteKind) => sources.filter((s) => 'url' in s && site(s.url)?.kind === kind).length
	const papers = sources.filter((s) => 'pmid' in s).length
	const parts = [
		papers && `${papers} ${plural(papers, ['работа', 'работы', 'работ'])} из PubMed`,
		...(Object.keys(KIND_FORMS) as SiteKind[]).map((kind) => {
			const n = count(kind)

			return n && `${n} ${plural(n, KIND_FORMS[kind])}`
		}),
	].filter(Boolean)

	return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} и ${parts.at(-1)}` : parts.join('')
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
