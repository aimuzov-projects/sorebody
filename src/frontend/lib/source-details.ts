import pubmed from '#frontend/data/pubmed.json' with { type: 'json' }

import { citation, doiUrl, pmcUrl, workType, type PubmedMeta } from './pubmed-meta.ts'
import { pubmedUrl } from './pubmed.ts'
import { sourceSite, type Source } from './sources.ts'

const META: Record<string, PubmedMeta | undefined> = pubmed

/**
 * Что показать под нашей подписью источника. У статьи PubMed -- библиография, тип работы
 * и ссылки на PubMed, открытый полный текст и DOI, у рекомендации -- ссылка на её сайт.
 * Отдельный модуль, чтобы data/pubmed.json не попал в клиентский код.
 */
export function sourceDetails(source: Source) {
	if (!('pmid' in source)) return { links: [{ label: sourceSite(source), href: source.url }] }

	const meta = META[source.pmid]
	const links: { label: string; href: string; ariaLabel?: string }[] = [
		{ label: sourceSite(source), href: pubmedUrl(source.pmid) },
	]

	if (!meta) return { links }

	// "Полный текст" и "DOI" одинаковы у всех источников: скринридеру называем, чьи они
	const whose = source.label.split(',')[0]

	if (meta.pmcid) links.push({ label: 'Полный текст', href: pmcUrl(meta.pmcid), ariaLabel: `Полный текст, ${whose}` })

	if (meta.doi) links.push({ label: 'DOI', href: doiUrl(meta.doi), ariaLabel: `DOI, ${whose}` })

	return { citation: citation(meta), type: meta.medline ? workType(meta.types) : undefined, links }
}
