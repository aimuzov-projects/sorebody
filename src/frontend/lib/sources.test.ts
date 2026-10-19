import assert from 'node:assert/strict'
import { test } from 'node:test'

import { injurySchema } from './injury-schema.ts'
import { citeKey, footnotes, guidelineSite, sourceHref, sourceSite } from './sources.ts'

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
