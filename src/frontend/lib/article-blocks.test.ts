import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compareHtml, diagramHtml, selfCheckHtml, statHtml, timelineHtml } from './article-blocks.ts'
import { enhanceArticle } from './article-html.ts'

const sources = [
	{ pmid: '111111', label: 'Первый' },
	{ url: 'https://cr.minzdrav.gov.ru/view-cr/691_2', label: 'Минздрав' },
]

test('timeline lists the phases in order with their terms', () => {
	const html = timelineHtml(
		{
			id: 'rehab',
			title: 'Путь после <операции>',
			phases: [
				{ when: '0–2 недели', title: 'Покой', text: 'Вернуть разгибание колена.', cite: [] },
				{ when: 'с 9 месяцев', title: 'Спорт', text: 'Возврат после тестов силы.', cite: [1] },
			],
		},
		sources,
	)

	assert.deepEqual(
		[...html.matchAll(/timeline__when">([^<]+)</g)].map((m) => m[1]),
		['0–2 недели', 'с 9 месяцев'],
	)

	assert.match(html, /Путь после &lt;операции&gt;/)
	assert.match(html, /\(<a href="https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/111111\/">1<\/a>\)/)
	assert.doesNotMatch(html, /timeline__caption/)
})

test('a block cite past the sources list breaks the build', () => {
	assert.throws(
		() => statHtml({ id: 's', value: '−51%', text: 'Повторных травм меньше.', cite: [3] }, sources),
		/сноска 3/,
	)
})

test('compare puts every option with its points side by side', () => {
	const html = compareHtml(
		{
			id: 'paths',
			title: 'Две дороги',
			options: [
				{ title: 'Операция', points: ['Связку заменяют'] },
				{ title: 'Реабилитация', points: ['Без операции', 'Операция, если колено нестабильно'] },
			],
			caption: 'Выбирают врач и пациент вместе.',
			cite: [2],
		},
		sources,
	)

	assert.equal(html.match(/compare__option"/g)?.length, 2)
	assert.equal(html.match(/<li>/g)?.length, 3)
	assert.match(html, /compare__caption">Выбирают врач и пациент вместе\. \(<a href="https:\/\/cr\.minzdrav/)
})

test('block cites get the page numbering like the cites in the text', () => {
	const stat = statHtml({ id: 's', value: '−51%', text: 'Повторных травм меньше.', cite: [2] }, sources)
	const { html } = enhanceArticle([{ kind: 'injury', html: `<h2>Что это</h2>${stat}` }], { sources })

	assert.match(html, /<sup class="cite"><a class="cite__link" href="https:\/\/cr\.minzdrav[^"]+"[^>]*>1<\/a><\/sup>/)
})

test('a diagram shows the risky and the safe side with their labels', () => {
	const html = diagramHtml({ id: 'landing', kind: 'knee-valgus', caption: 'Колени над стопами, а не внутрь.' })

	assert.match(
		html,
		/diagram__side--bad[^]*Опасно: колени уходят внутрь[^]*diagram__side--good[^]*Безопасно: колени над стопами/,
	)

	assert.equal(html.match(/<svg /g)?.length, 2)
})

test('a self-check lists the signs and has an answer for every urgency, calm by default', () => {
	const html = selfCheckHtml([
		{ text: 'Стопа холодная и бледная', urgency: 'call' },
		{ text: 'Колено опухло за часы', urgency: 'soon' },
	])

	assert.equal(html.match(/type="checkbox"/g)?.length, 2)
	assert.match(html, /data-urgency="call"/)

	// Карточки ответа и полоска для телефона: у тех и других все уровни, видим спокойный
	for (const kind of ['verdict', 'verdict-bar'])
		assert.deepEqual(
			[
				...html.matchAll(new RegExp(`class="${kind} ${kind}--\\w+"[^>]*data-verdict="(\\w+)"( hidden)?`, 'g')),
			].map((m) => `${m[1]}${m[2] ? '' : ' shown'}`),
			['call', 'today', 'soon', 'none shown'],
			kind,
		)

	assert.match(html, /<a class="verdict__call" href="tel:103" aria-label="Позвонить 103">[^]*href="tel:112"/)
	assert.match(html, /<fieldset class="self-check" data-self-check hidden>/)
	assert.match(html, /<div class="self-check__bar" aria-hidden="true" data-self-check-bar hidden>/)
})
