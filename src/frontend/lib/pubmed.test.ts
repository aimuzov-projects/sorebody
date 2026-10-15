import assert from 'node:assert/strict'
import { test } from 'node:test'

import { injurySchema } from './injury-schema.ts'
import { citedPmids, pubmedUrl } from './pubmed.ts'

test('pubmedUrl builds a canonical PubMed link', () => {
	assert.equal(pubmedUrl('35278328'), 'https://pubmed.ncbi.nlm.nih.gov/35278328/')
})

test('citedPmids finds every PubMed link in Markdown, once', () => {
	const md =
		'Часто ([1](https://pubmed.ncbi.nlm.nih.gov/35278328/)), см. [2](https://pubmed.ncbi.nlm.nih.gov/31688179/) и снова [1](https://pubmed.ncbi.nlm.nih.gov/35278328/).'

	assert.deepEqual(citedPmids(md), ['35278328', '31688179'])
})

test('citedPmids finds links without trailing slash, with query and legacy ncbi form', () => {
	const md =
		'[1](https://pubmed.ncbi.nlm.nih.gov/11111111) [2](https://pubmed.ncbi.nlm.nih.gov/22222222/?from_term=x) [3](https://www.ncbi.nlm.nih.gov/pubmed/33333333)'

	assert.deepEqual(citedPmids(md), ['11111111', '22222222', '33333333'])
})

const valid = {
	title: 'Разрыв мениска',
	titleEn: 'Meniscus tear',
	region: 'knee',
	frequency: 'common',
	movements: ['squat'],
	summary: 'Надрыв хрящевой прокладки колена.',
	images: [],
	sources: [{ pmid: '35278328', label: 'Knapik 2022, метаанализ' }],
	draft: true,
}

test('schema accepts a complete article', () => {
	assert.equal(injurySchema.safeParse(valid).success, true)
})

test('schema rejects an article without sources or with an unknown movement', () => {
	assert.equal(injurySchema.safeParse({ ...valid, sources: [] }).success, false)
	assert.equal(injurySchema.safeParse({ ...valid, movements: ['yoga'] }).success, false)
	assert.equal(injurySchema.safeParse({ ...valid, region: 'neck' }).success, false)
})

test('schema rejects malformed pmid', () => {
	for (const pmid of ['abc', '123', 35278328]) {
		assert.equal(injurySchema.safeParse({ ...valid, sources: [{ pmid, label: 'Источник' }] }).success, false)
	}
})

test('schema rejects unknown fields, including slug: the slug is the file name', () => {
	assert.equal(injurySchema.safeParse({ ...valid, slug: 'meniscus' }).success, false)
	assert.equal(injurySchema.safeParse({ ...valid, tags: ['knee'] }).success, false)
})
