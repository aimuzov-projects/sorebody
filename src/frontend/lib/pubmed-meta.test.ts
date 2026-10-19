import assert from 'node:assert/strict'
import { test } from 'node:test'

import { citation, doiUrl, pmcUrl, workType } from './pubmed-meta.ts'
import { sourceDetails } from './source-details.ts'

test('work type is the most telling one PubMed gives', () => {
	assert.equal(workType(['Meta-Analysis', 'Systematic Review', 'Review', 'Journal Article']), 'метаанализ')
	assert.equal(workType(['Systematic Review', 'Journal Article']), 'систематический обзор')
	assert.equal(workType(['Network Meta-Analysis', 'Meta-Analysis']), 'сетевой метаанализ')
	assert.equal(workType(['Consensus Statement', 'Review']), 'консенсус')
	assert.equal(workType(['Journal Article', 'Comparative Study']), undefined)
})

test('citation joins authors, title, journal and year without a doubled full stop', () => {
	assert.equal(
		citation({
			authors: 'Dahmen J, et al',
			title: 'Incidence of injuries in padel: a systematic review.',
			journal: 'BMJ Open Sport Exerc Med',
			year: '2023',
			types: [],
		}),
		'Dahmen J, et al. Incidence of injuries in padel: a systematic review. BMJ Open Sport Exerc Med, 2023',
	)
})

test('full text and DOI links', () => {
	assert.equal(pmcUrl('PMC10277135'), 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10277135/')
	assert.equal(doiUrl('10.1136/bmjsem-2023-001607'), 'https://doi.org/10.1136/bmjsem-2023-001607')
})

test('a PubMed source links to PubMed, the open full text and the DOI', () => {
	// Dahmen 2023 лежит в data/pubmed.json: открытый полный текст и DOI у него есть
	const details = sourceDetails({ pmid: '37337550', label: 'Dahmen 2023' })

	assert.equal(details.type, 'систематический обзор')
	assert.match(details.citation ?? '', /^Dahmen J, et al\. .+\. BMJ Open Sport Exerc Med, 2023$/)

	assert.deepEqual(
		details.links.map((l) => l.label),
		['PMID 37337550', 'Полный текст', 'DOI'],
	)
})

test('a guideline source links only to its site', () => {
	const details = sourceDetails({ url: 'https://www.nice.org.uk/guidance/ng232', label: 'NICE NG232' })

	assert.deepEqual(details, { links: [{ label: 'NICE', href: 'https://www.nice.org.uk/guidance/ng232' }] })
})
