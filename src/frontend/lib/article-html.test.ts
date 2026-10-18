import assert from 'node:assert/strict'
import { test } from 'node:test'

import { enhanceArticle, SECTIONS } from './article-html.ts'

const pubmed = (id: number, n: number) => `<a href="https://pubmed.ncbi.nlm.nih.gov/${id}/">${n}</a>`
const sources = [{ label: 'Knapik 2022' }, { label: 'Ángel Rodríguez 2022' }]

/** Тело статьи, как его отдаёт Markdown: все разделы шаблона, по абзацу в каждом. */
function body(parts: Partial<Record<(typeof SECTIONS)[number]['id'], string>> = {}) {
	return SECTIONS.map((s) => `<h2 id="x">${s.title}</h2>\n${parts[s.id] ?? '<p>Текст.</p>'}\n`).join('')
}

test('wraps every template section with its id and icon', () => {
	const { html, sections } = enhanceArticle(body(), sources)

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

test('throws on an unknown section instead of guessing', () => {
	assert.throws(() => enhanceArticle('<h2>Что-то новое</h2><p>x</p>', sources), /неизвестный раздел/)
})

test('turns (N) and (N, M) footnotes into superscript links without brackets', () => {
	const { html } = enhanceArticle(
		body({ what: `<p>Связка рвётся (${pubmed(1, 1)}). Чаще у женщин (${pubmed(2, 1)}, ${pubmed(3, 2)}).</p>` }),
		sources,
	)

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

test('splits "Вместо X → Y" and "Вместо X — Y" into was/now pairs', () => {
	const { html } = enhanceArticle(
		body({
			adapt: '<ul><li>Вместо прыжков на тумбу → зашагивания</li><li>Вместо бега — гребля</li><li>Просто совет</li></ul>',
		}),
		sources,
	)

	assert.match(
		html,
		/<li class="swap"><span class="swap__was"><span class="swap__label">Вместо<\/span> прыжков на тумбу<\/span><span class="swap__arrow"[^>]*><svg[\s\S]*?<\/span><span class="swap__now"><span class="swap__hint">Лучше: <\/span>зашагивания<\/span><\/li>/,
	)

	assert.match(
		html,
		/<span class="swap__label">Вместо<\/span> бега<\/span>[\s\S]*?<span class="swap__hint">Лучше: <\/span>гребля<\/span>/,
	)

	assert.match(html, /<li>Просто совет<\/li>/)
})

test('highlights percents only in the frequency section', () => {
	const { html } = enhanceArticle(
		body({ frequency: '<p>Колено -- 14% травм и 18,5 % по обзору.</p>', what: '<p>Около 30% случаев.</p>' }),
		sources,
	)

	assert.match(html, /<strong class="stat">14%<\/strong> травм и <strong class="stat">18,5 %<\/strong>/)
	assert.match(html, /Около 30% случаев/)
})

test('highlights a percent range as a whole', () => {
	const { html } = enhanceArticle(
		body({ frequency: '<p>22,2–43,8% женщин, у мужчин 5 – 7 %; ещё 75%–93%.</p>' }),
		sources,
	)

	assert.match(html, /<p><strong class="stat">22,2–43,8%<\/strong> женщин/)
	assert.match(html, /мужчин <strong class="stat">5 – 7 %<\/strong>;/)
	assert.match(html, /ещё <strong class="stat">75%–93%<\/strong>\./)
})
