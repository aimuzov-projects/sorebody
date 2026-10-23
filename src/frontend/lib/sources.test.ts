import assert from 'node:assert/strict'
import { test } from 'node:test'

import { injurySchema } from './injury-schema.ts'
import { citeKey, footnotes, guidelineSite, sourceHref, sourceSite, sourcesSummary } from './sources.ts'

const MINZDRAV = 'https://cr.minzdrav.gov.ru/preview-cr/667_1'

test('guidelineSite knows listed hosts over https only', () => {
	assert.equal(guidelineSite(MINZDRAV), 'Минздрав России')
	assert.equal(guidelineSite('https://bestpractice.bmj.com/topics/en-gb/582'), 'BMJ Best Practice')
	assert.equal(guidelineSite('https://www.orthoguidelines.org/topic?id=1042'), 'AAOS')
	assert.equal(guidelineSite('http://cks.nice.org.uk/topics/back-pain/'), undefined)
	assert.equal(guidelineSite('https://example.com/guide'), undefined)
	assert.equal(guidelineSite('not a url'), undefined)
})

test('citeKey makes PubMed links canonical and keeps guideline links as is', () => {
	assert.equal(citeKey('https://www.ncbi.nlm.nih.gov/pubmed/35278328'), 'https://pubmed.ncbi.nlm.nih.gov/35278328/')
	assert.equal(citeKey(MINZDRAV), MINZDRAV)
	assert.equal(citeKey('https://example.com/'), undefined)
})

test('footnotes finds PubMed and guideline links in order, skipping other links', () => {
	const md = `Часто ([1](https://pubmed.ncbi.nlm.nih.gov/35278328/), [2](${MINZDRAV})), см. [сайт](https://example.com/).`

	assert.deepEqual(footnotes(md), [
		{ text: '1', key: 'https://pubmed.ncbi.nlm.nih.gov/35278328/' },
		{ text: '2', key: MINZDRAV },
	])
})

test('sourceHref and sourceSite label both kinds of sources', () => {
	const pubmed = { pmid: '35278328', label: 'Knapik 2022' }
	const guideline = { url: MINZDRAV, label: 'Клинические рекомендации' }

	assert.equal(sourceHref(pubmed), 'https://pubmed.ncbi.nlm.nih.gov/35278328/')
	assert.equal(sourceSite(pubmed), 'PMID 35278328')
	assert.equal(sourceHref(guideline), MINZDRAV)
	assert.equal(sourceSite(guideline), 'Минздрав России')
})

const article = {
	title: 'Разрыв мениска',
	titleEn: 'Meniscus tear',
	region: 'knee',
	prompts: ['Колено заклинило в приседе', 'Щелчок в колене на развороте', 'Нужна ли операция на мениске?'],
	images: [],
	draft: true,
}

test('schema accepts guideline sources from listed sites only', () => {
	const parse = (url: string) => injurySchema.safeParse({ ...article, sources: [{ url, label: 'Рекомендации' }] })

	assert.equal(parse(MINZDRAV).success, true)
	assert.equal(parse('https://example.com/guide').success, false)
})

test('schema rejects a source with both pmid and url', () => {
	const sources = [{ pmid: '35278328', url: MINZDRAV, label: 'Смесь' }]

	assert.equal(injurySchema.safeParse({ ...article, sources }).success, false)
})

test('sourcesSummary counts PubMed papers and guidelines with Russian plural forms', () => {
	const papers = (n: number) => Array.from({ length: n }, (_, i) => ({ pmid: String(10000000 + i), label: 'x' }))
	const guide = { url: MINZDRAV, label: 'КР' }

	assert.equal(sourcesSummary(papers(1)), '1 работа из PubMed')
	assert.equal(sourcesSummary(papers(3)), '3 работы из PubMed')
	assert.equal(sourcesSummary(papers(11)), '11 работ из PubMed')
	assert.equal(sourcesSummary(papers(21)), '21 работа из PubMed')
	assert.equal(sourcesSummary([...papers(12), guide]), '12 работ из PubMed и 1 клиническая рекомендация')
	assert.equal(sourcesSummary([guide, guide]), '2 клинические рекомендации')

	assert.equal(
		sourcesSummary([...papers(5), guide, guide, guide, guide, guide]),
		'5 работ из PubMed и 5 клинических рекомендаций',
	)
})

const OEKAS = 'https://alpinesicherheit.at/wp-content/uploads/2025/04/OeKAS-PA-Jahresrueckblick-2024_korrigiert-2.pdf'
const UIAA = 'https://www.theuiaa.org/documents/mountainmedicine/English_UIAA_MedCom_RecNo11_Hikingsticks2021_V1-1.pdf'

test('mountain rescue statistics and UIAA are accepted sources', () => {
	assert.equal(guidelineSite(OEKAS), 'ÖKAS')
	assert.equal(guidelineSite('https://www.sac-cas.ch/fileadmin/x.pdf'), 'SAC')
	assert.equal(guidelineSite(UIAA), 'UIAA')
	assert.equal(citeKey(OEKAS), OEKAS)
})

test('sourcesSummary counts mountain statistics apart from guidelines', () => {
	const paper = { pmid: '35278328', label: 'x' }
	const uiaa = { url: UIAA, label: 'UIAA' }
	const oekas = { url: OEKAS, label: 'ÖKAS' }

	assert.equal(sourcesSummary([oekas]), '1 отчёт горной статистики')
	assert.equal(
		sourcesSummary([paper, uiaa, oekas, oekas]),
		'1 работа из PubMed, 1 клиническая рекомендация и 2 отчёта горной статистики',
	)
})
