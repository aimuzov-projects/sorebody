/**
 * Библиография статьи PubMed для списка источников: авторы, название, журнал, год, тип работы,
 * DOI и открытый полный текст на PMC. Лежит в data/pubmed.json, пишет её
 * scripts/sources/fetch.mjs. Тест контента ловит PMID без записи и записи без PMID.
 */
export type PubmedMeta = {
	/** Первый автор и "et al", если авторов больше. */
	authors: string
	title: string
	/** Сокращённое название журнала, как в PubMed. */
	journal: string
	year: string
	/** Типы публикации из PubMed, например `Meta-Analysis`, `Journal Article`. */
	types: string[]
	doi?: string
	/** PMC id, только если полный текст уже открыт (эмбарго прошло на момент выгрузки). */
	pmcid?: string
}

/**
 * Тип работы по-русски. Порядок -- от сильного типа к слабому: у метаанализа в PubMed обычно
 * стоят и `Systematic Review`, и `Review`, показываем самый говорящий. `Journal Article` и прочие
 * общие типы подписи не дают.
 */
const WORK_TYPES: [string, string][] = [
	['Practice Guideline', 'клиническое руководство'],
	['Guideline', 'руководство'],
	['Consensus Statement', 'консенсус'],
	['Consensus Development Conference', 'консенсус'],
	['Network Meta-Analysis', 'сетевой метаанализ'],
	['Meta-Analysis', 'метаанализ'],
	['Systematic Review', 'систематический обзор'],
	['Scoping Review', 'обзор литературы'],
	['Randomized Controlled Trial', 'РКИ'],
	['Clinical Trial', 'клиническое исследование'],
	['Observational Study', 'наблюдательное исследование'],
	['Case Reports', 'описание случая'],
	['Editorial', 'редакционная статья'],
	['Letter', 'письмо в журнал'],
	['Comment', 'комментарий'],
	['Review', 'обзор'],
]

export function workType(types: string[]) {
	return WORK_TYPES.find(([type]) => types.includes(type))?.[1]
}

export const pmcUrl = (pmcid: string) => `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`

export const doiUrl = (doi: string) => `https://doi.org/${doi}`

/** "Dahmen J, et al. Название. BMJ Open Sport Exerc Med, 2023" */
export function citation(meta: PubmedMeta) {
	const title = meta.title.replace(/\.$/, '')

	return `${meta.authors}. ${title}. ${meta.journal}, ${meta.year}`
}
