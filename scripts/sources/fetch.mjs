// Библиография статей PubMed для списка источников (lib/pubmed-meta.ts). Запускать после того,
// как в статьях появился новый PMID: тест контента не пропустит PMID, которого нет в
// data/pubmed.json, и запись, на которую больше никто не ссылается.
//
// usage: node scripts/sources/fetch.mjs
// Берёт PMID из frontmatter всех статей и линз и запрашивает их в E-utilities (esummary) пачками.
// Файл пересобирается целиком, ключи по порядку, так что в git меняются только новые записи
// и те, что поправили в самом PubMed.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'
import { parse } from 'yaml'

const content = fileURLToPath(new URL('../../src/frontend/content/', import.meta.url))
const out = fileURLToPath(new URL('../../src/frontend/data/pubmed.json', import.meta.url))
const ESUMMARY = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi'
// Без ключа API E-utilities пускает три запроса в секунду
const PAUSE = 400
const BATCH = 200

const files = fs.readdirSync(content, { recursive: true }).filter((file) => file.endsWith('.md'))
const pmidsOf = (file) => {
	const front = fs.readFileSync(path.join(content, file), 'utf8').match(/^---\n([\s\S]*?)\n---\n/)?.[1]

	return (parse(front ?? '')?.sources ?? []).flatMap((s) => (s.pmid ? [String(s.pmid)] : []))
}
const pmids = [...new Set(files.flatMap(pmidsOf))].sort((a, b) => Number(a) - Number(b))

const today = new Date().toISOString().slice(0, 10).replaceAll('-', '/')
const meta = {}

for (let i = 0; i < pmids.length; i += BATCH) {
	const ids = pmids.slice(i, i + BATCH)
	const response = await fetch(ESUMMARY, {
		method: 'POST',
		body: new URLSearchParams({ db: 'pubmed', retmode: 'json', id: ids.join(',') }),
	})

	if (!response.ok) throw new Error(`esummary: ${response.status}`)

	const { result } = await response.json()

	for (const id of ids) {
		const doc = result[id]

		if (!doc || doc.error) throw new Error(`esummary: нет записи для PMID ${id}`)

		const authors = doc.authors.filter((a) => a.authtype === 'Author').map((a) => a.name)
		const idOf = (type) => doc.articleids.find((a) => a.idtype === type)?.value
		// Полный текст на PMC бывает под эмбарго до даты pmc-release
		const release = doc.history.find((h) => h.pubstatus === 'pmc-release')?.date.slice(0, 10)
		const pmcid = idOf('pmc') && (!release || release <= today) ? idOf('pmc') : undefined

		meta[id] = {
			authors: authors.length > 1 ? `${authors[0]}, et al` : (authors[0] ?? doc.sortfirstauthor),
			// В названиях бывает разметка: <i>, <sup>
			title: doc.title.replace(/<[^>]+>/g, '').trim(),
			journal: doc.source,
			year: doc.pubdate.slice(0, 4),
			types: doc.pubtype,
			// Тип работы надёжен только после индексации в MEDLINE: у свежих записей "as supplied by
			// publisher" и "in process" он неполный, метаанализ там бывает просто Review
			...(doc.recordstatus === 'PubMed - indexed for MEDLINE' && { medline: true }),
			...(idOf('doi') && { doi: idOf('doi') }),
			...(pmcid && { pmcid }),
		}
	}

	await new Promise((resolve) => setTimeout(resolve, PAUSE))
}

// Через prettier, иначе format:check в CI не пропустит файл
fs.writeFileSync(
	out,
	await format(JSON.stringify(meta), { ...(await resolveConfig(out, { editorconfig: true })), filepath: out }),
)

console.log(`${pmids.length} PMID → ${path.relative(process.cwd(), out)}`)
