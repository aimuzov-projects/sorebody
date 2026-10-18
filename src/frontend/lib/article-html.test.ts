import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sportOf } from '#frontend/data/sports.ts'

import {
	enhanceArticle,
	INJURY_HEADINGS,
	LENS_HEADINGS,
	SECTIONS,
	type ArticlePart,
	type SectionId,
} from './article-html.ts'

const crossfit = sportOf('crossfit')
const pubmed = (id: number, n: number) => `<a href="https://pubmed.ncbi.nlm.nih.gov/${id}/">${n}</a>`
const source = (id: number, label: string) => ({ pmid: String(id), label })
const sources = [source(1, 'Knapik 2022'), source(2, 'Ángel Rodríguez 2022'), source(3, 'Lenz 2024')]

type Texts = Partial<Record<SectionId, string>>

/** Части статьи, как их отдаёт Markdown: все разделы шаблона, по абзацу в каждом. */
function parts(injury: Texts = {}, lens: Texts = {}): ArticlePart[] {
	const html = (headings: typeof INJURY_HEADINGS, texts: Texts) =>
		headings.map((h) => `<h2 id="x">${h.title}</h2>\n${texts[h.id] ?? '<p>Текст.</p>'}\n`).join('')

	return [
		{ kind: 'injury', html: html(INJURY_HEADINGS, injury) },
		{ kind: 'lens', html: html(LENS_HEADINGS, lens) },
	]
}

const enhance = (injury: Texts = {}, lens: Texts = {}) =>
	enhanceArticle(parts(injury, lens), { sources, sport: crossfit })

test('wraps every section with its id and icon, in the order of the page', () => {
	const { html, sections } = enhance()

	assert.deepEqual(
		sections.map((s) => s.id),
		SECTIONS.map((s) => s.id),
	)

	for (const s of SECTIONS) {
		assert.match(html, new RegExp(`<section class="article-section article-section--${s.id}" id="${s.id}"`))

		assert.match(
			html,
			new RegExp(
				`<h2 class="article-section__title" id="${s.id}-title"><span class="article-section__icon" aria-hidden="true"><svg`,
			),
		)
	}
})

test('a sport page keeps the template order: urgent care first, then the path from doctor to return', () => {
	assert.deepEqual(
		enhance().sections.map((s) => s.title),
		[
			'Что это',
			'Как часто в кроссфите',
			'Механизм и движения',
			'Симптомы',
			'Когда сразу к врачу',
			'Первые шаги',
			'К какому врачу',
			'Диагностика',
			'Лечение',
			'Сроки возврата',
			'Как адаптировать тренировки',
			'Профилактика',
		],
	)
})

test('the common page has only the injury sections, with healing instead of return', () => {
	const { sections } = enhanceArticle(parts().slice(0, 1), { sources })

	assert.deepEqual(
		sections.map((s) => s.title),
		INJURY_HEADINGS.map((h) => h.title),
	)
})

test('a section from both parts reads the common text first, then the sport', () => {
	const { html } = enhance({ prevention: '<p>Общее.</p>' }, { prevention: '<p>В зале.</p>' })

	assert.match(html, /id="prevention"[\s\S]*<p>Общее\.<\/p>\s*<p>В зале\.<\/p>\s*<\/section>$/)
})

test('throws on an unknown section instead of guessing', () => {
	assert.throws(
		() => enhanceArticle([{ kind: 'injury', html: '<h2>Что-то новое</h2><p>x</p>' }], { sources }),
		/неизвестный раздел/,
	)

	// Раздел линзы в общей части -- тоже ошибка
	assert.throws(
		() => enhanceArticle([{ kind: 'injury', html: '<h2>Как часто</h2><p>x</p>' }], { sources }),
		/неизвестный раздел/,
	)
})

test('turns (N) and (N, M) footnotes into superscript links without brackets', () => {
	const { html } = enhance({
		what: `<p>Связка рвётся (${pubmed(1, 1)}). Чаще у женщин (${pubmed(1, 1)}, ${pubmed(2, 2)}).</p>`,
	})

	assert.match(
		html,
		/рвётся<sup class="cite"><a class="cite__link" href="https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/1\/" aria-label="Источник 1: Knapik 2022" data-tip="Knapik 2022">1<\/a><\/sup>\./,
	)

	assert.match(
		html,
		/женщин<sup class="cite"><a [^>]*>1<\/a>, <a [^>]*aria-label="Источник 2: Ángel Rodríguez 2022"[^>]*>2<\/a><\/sup>\./,
	)

	assert.doesNotMatch(html, /\(\s*<sup/)
})

test('numbers footnotes of both parts through the page by first mention', () => {
	// В линзе источник 3 -- первый в её sources, в общей части источник 2 -- первый в её
	const { html, sources: ordered } = enhance(
		{ what: `<p>Что (${pubmed(2, 1)}).</p>`, treatment: `<p>Лечат (${pubmed(3, 2)}).</p>` },
		{ frequency: `<p>Часто (${pubmed(3, 1)}).</p>` },
	)

	assert.deepEqual(
		ordered.map((s) => s.label),
		['Ángel Rodríguez 2022', 'Lenz 2024'],
	)

	assert.match(html, /Что<sup class="cite"><a [^>]*\/2\/"[^>]*>1<\/a>/)
	assert.match(html, /Часто<sup class="cite"><a [^>]*\/3\/"[^>]*>2<\/a>/)
	assert.match(html, /Лечат<sup class="cite"><a [^>]*\/3\/"[^>]*>2<\/a>/)
})

test('throws on a footnote to a source missing from sources', () => {
	assert.throws(() => enhance({ what: `<p>Что (${pubmed(9, 1)}).</p>` }), /нет в sources/)
})

test('points injury links of the common text to the sport article when there is one', () => {
	const { html } = enhanceArticle(
		parts({
			urgent: '<p><a href="/injuries/acl-tear/">ПКС</a>, <a href="/injuries/other#urgent">другое</a></p>',
		}),
		{ sources, sport: crossfit, injuryHref: (slug) => (slug === 'acl-tear' ? '/crossfit/acl-tear/' : undefined) },
	)

	assert.match(html, /<a href="\/crossfit\/acl-tear\/">ПКС<\/a>, <a href="\/injuries\/other#urgent">другое<\/a>/)
})

test('treats a guideline link as a footnote, an arbitrary link as plain text', () => {
	const guideline = '<a href="https://cr.minzdrav.gov.ru/preview-cr/667_1">1</a>'
	const other = '<a href="https://example.com/">1</a>'
	const { html } = enhanceArticle(
		[{ kind: 'injury', html: `<h2>Что это</h2><p>Шина (${guideline}). Сайт (${other}).</p>` }],
		{ sources: [{ url: 'https://cr.minzdrav.gov.ru/preview-cr/667_1', label: 'Минздрав' }] },
	)

	assert.match(html, /Шина<sup class="cite"><a class="cite__link" href="https:\/\/cr\.minzdrav\.gov\.ru\/[^"]+"/)
	assert.match(html, /Сайт \(<a href="https:\/\/example\.com\/">1<\/a>\)/)
})

test('splits "Вместо X → Y" and "Вместо X — Y" into was/now pairs', () => {
	const { html } = enhance(
		{},
		{
			adapt: '<ul><li>Вместо прыжков на тумбу → зашагивания</li><li>Вместо бега — гребля</li><li>Просто совет</li></ul>',
		},
	)

	assert.match(
		html,
		/<li class="swap"><span class="swap__was"><span class="swap__label"><span class="swap__mark"[^>]*><svg[\s\S]*?<\/span>Вместо<\/span> прыжков на тумбу<\/span><span class="swap__arrow"[^>]*><svg[\s\S]*?<\/span><span class="swap__now"><span class="swap__hint"><span class="swap__mark"[^>]*><svg[\s\S]*?<\/span>Лучше: <\/span>зашагивания<\/span><\/li>/,
	)

	assert.match(
		html,
		/<span class="swap__label"><span class="swap__mark"[^>]*><svg[\s\S]*?<\/span>Вместо<\/span> бега<\/span>[\s\S]*?<span class="swap__hint"><span class="swap__mark"[^>]*><svg[\s\S]*?<\/span>Лучше: <\/span>гребля<\/span>/,
	)

	assert.match(html, /<li>Просто совет<\/li>/)
})

test('marks swap labels with the movement icon, falling back to a cross and a check', () => {
	const { html } = enhance(
		{},
		{ adapt: '<ul><li>Вместо бега → гребля</li><li>Вместо серий без пауз → короткие подходы</li></ul>' },
	)
	const marks = [...html.matchAll(/class="swap__mark"[^>]*><svg\s+class="lucide (lucide-[\w-]+)"/g)].map((m) => m[1])

	assert.deepEqual(marks, ['lucide-footprints', 'lucide-waves-horizontal', 'lucide-circle-x', 'lucide-circle-check'])
})

test('highlights percents only in the frequency section', () => {
	const { html } = enhance(
		{ what: '<p>Около 30% случаев.</p>' },
		{ frequency: '<p>Колено -- 14% травм и 18,5 % по обзору.</p>' },
	)

	assert.match(html, /<strong class="stat">14%<\/strong> травм и <strong class="stat">18,5 %<\/strong>/)
	assert.match(html, /Около 30% случаев/)
})

test('highlights a percent range as a whole', () => {
	const { html } = enhance({}, { frequency: '<p>22,2–43,8% женщин, у мужчин 5 – 7 %; ещё 75%–93%.</p>' })

	assert.match(html, /<p><strong class="stat">22,2–43,8%<\/strong> женщин/)
	assert.match(html, /мужчин <strong class="stat">5 – 7 %<\/strong>;/)
	assert.match(html, /ещё <strong class="stat">75%–93%<\/strong>\./)
})
