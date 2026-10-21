import assert from 'node:assert/strict'
import { test } from 'node:test'

import { INJURY_HEADINGS } from './article-html.ts'
import { diskKnowledge } from './knowledge-disk.ts'
import { markdownSections } from './knowledge.ts'

test('markdownSections: разделы по заголовкам, без маркеров блоков, сноски -- номерами', () => {
	const body = [
		'## Что это',
		'',
		'Связка рвётся ([1](https://pubmed.ncbi.nlm.nih.gov/27039329/)), см. [мениск](/injuries/meniscus-tear/).',
		'',
		'<div data-chart="share"></div>',
		'',
		'## Симптомы',
		'',
		'- Хлопок',
	].join('\n')

	assert.deepEqual(markdownSections(body, INJURY_HEADINGS), [
		{ id: 'what', title: 'Что это', text: 'Связка рвётся (1), см. [мениск](/injuries/meniscus-tear/).' },
		{ id: 'symptoms', title: 'Симптомы', text: '- Хлопок' },
	])
})

test('markdownSections: неизвестный раздел роняет сборку', () => {
	assert.throws(() => markdownSections('## Прочее\n\nтекст', INJURY_HEADINGS), /неизвестный раздел «Прочее»/)
})

test('buildKnowledge: все травмы с разделами, линзы с адресами разборов', () => {
	const knowledge = diskKnowledge()
	const acl = knowledge.injuries.find((i) => i.slug === 'acl-tear')!

	assert.ok(knowledge.injuries.length > 40)
	assert.ok(knowledge.injuries.every((i) => i.sections.some((s) => s.id === 'urgent' && s.text.length > 20)))
	assert.ok(knowledge.injuries.every((i) => i.lenses.length > 0))
	assert.equal(acl.sources[0]!.href, 'https://pubmed.ncbi.nlm.nih.gov/27039329/')
	assert.equal(acl.lenses.find((l) => l.sport === 'crossfit')!.url, '/crossfit/acl-tear/')
	assert.ok(!JSON.stringify(knowledge).includes('<div data-'))
})
