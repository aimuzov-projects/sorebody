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

	// Название-вопрос: точку после знака вопроса не дописываем
	assert.equal(
		citation({
			authors: 'Hutchison AM, et al',
			title: 'What is the best clinical test for Achilles tendinopathy?',
			journal: 'Foot Ankle Surg',
			year: '2013',
			types: [],
		}),
		'Hutchison AM, et al. What is the best clinical test for Achilles tendinopathy? Foot Ankle Surg, 2013',
	)

	assert.equal(
		citation({ authors: 'Smith J', title: 'Plain title', journal: 'J', year: '2020', types: [] }),
		'Smith J. Plain title. J, 2020',
	)
})

test('full text and DOI links', () => {
	assert.equal(pmcUrl('PMC10277135'), 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10277135/')
	assert.equal(doiUrl('10.1136/bmjsem-2023-001607'), 'https://doi.org/10.1136/bmjsem-2023-001607')
})

test('a PubMed source links to PubMed, the open full text and the DOI', () => {
	// Dahmen 2023 лежит в data/pubmed.json: открытый полный текст и DOI у него есть
	const details = sourceDetails({ pmid: '37337550', label: 'Dahmen 2023, систематический обзор' })

	assert.match(details.citation ?? '', /^Dahmen J, et al\. .+\. BMJ Open Sport Exerc Med, 2023$/)

	assert.deepEqual(
		details.links.map((l) => [l.label, l.ariaLabel]),
		[
			['PMID 37337550', undefined],
			['Полный текст', 'Полный текст, Dahmen 2023'],
			['DOI', 'DOI, Dahmen 2023'],
		],
	)
})

test('work type is shown only for records indexed in MEDLINE', () => {
	// Knapik 2022 проиндексирован: метаанализ
	assert.equal(sourceDetails({ pmid: '35278328', label: 'Knapik 2022' }).type, 'метаанализ')
	// Baur 2025 ещё не проиндексирован: PubMed пока зовёт его Review, хотя это метаанализ
	assert.equal(sourceDetails({ pmid: '40807174', label: 'Baur 2025' }).type, undefined)
})

test('a guideline source links only to its site', () => {
	const details = sourceDetails({ url: 'https://www.nice.org.uk/guidance/ng232', label: 'NICE NG232' })

	assert.deepEqual(details, { links: [{ label: 'NICE', href: 'https://www.nice.org.uk/guidance/ng232' }] })
})
