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
		/рвётся<sup class="cite"><a class="cite__link" href="https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/1\/" aria-label="Источник 1: Knapik 2022" data-hint="Knapik 2022">1<\/a><\/sup>\./,
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

test('numbers a footnote inside inline markup before the one after it', () => {
	const { sources: ordered } = enhance({
		what: `<p>a <strong>x (${pubmed(1, 1)})</strong> b (${pubmed(2, 2)})</p>`,
	})

	assert.deepEqual(
		ordered.map((s) => s.label),
		['Knapik 2022', 'Ángel Rodríguez 2022'],
	)
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

test('urgent signs become rows with an icon, a call for an ambulance stands out', () => {
	const { html } = enhance({
		urgent: '<ul><li>Не наступить на ногу</li><li>Стопа холодная — сразу скорая (103/112)</li></ul>',
	})

	assert.match(
		html,
		/<li class="alarm"><span class="alarm__icon" aria-hidden="true"><svg[^]*?<span class="alarm__text">Не наступить/,
	)

	assert.match(html, /<li class="alarm alarm--call">/)
})

test('first steps become a numbered list of steps, nested lists stay plain', () => {
	const { html } = enhance({
		'first-steps': '<ol><li><strong>Стоп.</strong> Закончить<ul><li>вложенный</li></ul></li></ol>',
	})

	assert.match(html, /<ol class="steps"><li class="step"><strong>Стоп\.<\/strong>/)
	assert.match(html, /<ul><li>вложенный<\/li><\/ul>/)
})

test('an abbreviation gets a tip on its first mention in each section only', () => {
	const { html } = enhance({
		what: '<p>МРТ и снова МРТ, а <a href="/x/">МРТ</a> в ссылке</p>',
		diagnosis: '<p>МРТ</p>',
	})
	const what = html.slice(html.indexOf('id="what"'), html.indexOf('id="symptoms"'))

	assert.equal(what.match(/class="abbr"/g)?.length, 1)

	assert.match(
		what,
		/<button class="abbr" type="button" aria-expanded="false" aria-controls="abbr-what-1" data-tip-for="abbr-what-1">МРТ<\/button><span class="tip" id="abbr-what-1" popover="auto">Магнитно-резонансная томография<\/span>/,
	)

	assert.match(html, /data-tip-for="abbr-diagnosis-1"/)
})

test('an abbreviation inside a longer word is left alone', () => {
	const { html } = enhance({ what: '<p>МРТ-исследование и ДИАГНОЗ</p>' })

	assert.match(html, /МРТ<\/button>/)
	assert.doesNotMatch(html, /ДИ<\/button>/)
})

test('ambulance numbers become tel links, a study size does not', () => {
	const { html } = enhance({ urgent: '<ul><li>Сразу скорая (103 или 112), а не 103 тяжёлых случая</li></ul>' })

	assert.match(
		html,
		/<span class="calls"><span class="calls__icon" aria-hidden="true"><svg[^]*?<\/span>\(<a class="calls__number" href="tel:103" aria-label="Позвонить 103">103<\/a> или <a class="calls__number" href="tel:112"/,
	)

	assert.match(html, /а не 103 тяжёлых/)
})

test('a cite hint names the kind of work behind it', () => {
	const guideline = { url: 'https://cr.minzdrav.gov.ru/view-cr/691_2', label: 'Минздрав 2024' }
	const { html } = enhanceArticle(
		[{ kind: 'injury', html: `<h2>Что это</h2><p>Текст (<a href="${guideline.url}">1</a>).</p>` }],
		{ sources: [guideline] },
	)

	assert.match(html, /data-hint="Минздрав 2024 · клиническая рекомендация"/)
})

test('a cite hint does not repeat the kind of work its label already names', () => {
	const guideline = {
		url: 'https://cr.minzdrav.gov.ru/view-cr/691_2',
		label: 'Минздрав 2024, клинические рекомендации',
	}
	const { html } = enhanceArticle(
		[{ kind: 'injury', html: `<h2>Что это</h2><p>Текст (<a href="${guideline.url}">1</a>).</p>` }],
		{ sources: [guideline] },
	)

	assert.match(html, /data-hint="Минздрав 2024, клинические рекомендации"/)
})

test('a medical term gets a tip in any form, once per section', () => {
	const { html } = enhance({ what: '<p>Квадрицепса мало, квадрицепс слабый, остеоартроз и артроз</p>' })

	assert.match(
		html,
		/<button class="abbr"[^>]*>Квадрицепса<\/button><span class="tip"[^>]*>Квадрицепс: четырёхглавая/,
	)

	assert.doesNotMatch(html, /квадрицепс<\/button>/)
	assert.match(html, /остеоартроз<\/button>/)
	assert.match(html, />артроз<\/button>/)
})

test('urgent care links to the self-check page when there is one', () => {
	const html = (checkHref?: string) =>
		enhanceArticle(parts(), { sources, sport: crossfit, ...(checkHref ? { checkHref } : {}) }).html

	assert.match(
		html('/injuries/acl-tear/check/'),
		/<div class="check-callout">[^]*<a class="check-callout__button" href="\/injuries\/acl-tear\/check\/">/,
	)

	assert.doesNotMatch(html(), /check-callout/)
})

test('punctuation right after an explained word stays on its line', () => {
	const { html } = enhance({ what: '<p>Включить квадрицепс. И снова МРТ, потом</p>' })

	assert.match(html, /<span class="abbr-glue"><button class="abbr"[^>]*>квадрицепс<\/button>\.<\/span>/)
	assert.match(html, /<span class="abbr-glue"><button class="abbr"[^>]*>МРТ<\/button>,<\/span>/)
})
