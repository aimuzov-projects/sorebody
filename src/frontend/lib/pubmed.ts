const LINK = /https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)\//g

export function pubmedUrl(pmid: string) {
	return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
}

/** PMID из ссылок на PubMed в тексте статьи, в порядке первого упоминания. */
export function citedPmids(markdown: string) {
	return [...new Set([...markdown.matchAll(LINK)].map((m) => m[1]!))]
}
