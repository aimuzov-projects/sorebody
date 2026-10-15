import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'yaml'

import { REGIONS } from '#frontend/data/regions.ts'

import { injurySchema } from './injury-schema.ts'
import { citedPmids } from './pubmed.ts'

const DIR = new URL('../content/injuries/', import.meta.url)
const PUBLIC = new URL('../../../public', import.meta.url)

/** Статьи как есть на диске: Astro в `node --test` недоступен, frontmatter разбираем сами. */
const articles = readdirSync(DIR)
	.filter((f) => f.endsWith('.md'))
	.map((file) => {
		const raw = readFileSync(new URL(file, DIR), 'utf8')
		const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)

		assert.ok(match, `${file}: нет frontmatter между строками «---»`)

		const [, front = '', body = ''] = match

		return { slug: file.replace(/\.md$/, ''), data: parseFrontmatter(file, front), body }
	})

function parseFrontmatter(file: string, front: string) {
	try {
		return parse(front)
	} catch (error) {
		throw new Error(`${file}: frontmatter не разбирается как YAML`, { cause: error })
	}
}

/** Ссылки Markdown `[текст](url)`: для сносок на PubMed текст — номер источника в `sources`. */
const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g

const REQUIRED_SECTIONS = [
	'## Что это',
	'## Как часто в кроссфите',
	'## Механизм и движения',
	'## Симптомы',
	'## Когда сразу к врачу',
	'## Первые шаги',
	'## Как адаптировать тренировки',
	'## Профилактика',
]

test('there is at least one article', () => {
	assert.ok(articles.length > 0)
})

for (const { slug, data, body } of articles) {
	test(`${slug}: slug is kebab-case`, () => {
		assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/)
	})

	test(`${slug}: frontmatter matches the schema`, () => {
		const result = injurySchema.safeParse(data)

		assert.ok(result.success, JSON.stringify(result.error?.issues))
	})

	test(`${slug}: body has exactly the template sections in order`, () => {
		const headings = body.split('\n').filter((line) => line.startsWith('## '))

		assert.deepEqual(headings, REQUIRED_SECTIONS)
	})

	test(`${slug}: every cited PMID is listed in sources and every source is cited`, () => {
		const cited = new Set(citedPmids(body))
		const listed = new Set<string>(data.sources.map((s: { pmid: string }) => s.pmid))

		assert.deepEqual(
			[...cited].filter((p) => !listed.has(p)),
			[],
			'цитируется, но нет в sources',
		)

		assert.deepEqual(
			[...listed].filter((p) => !cited.has(p)),
			[],
			'в sources, но не цитируется',
		)
	})

	test(`${slug}: footnote number matches the source position`, () => {
		const pmids: string[] = data.sources.map((s: { pmid: string }) => s.pmid)

		for (const [link, text, url] of body.matchAll(LINK)) {
			const [pmid] = citedPmids(url!)

			if (pmid)
				assert.equal(text, String(pmids.indexOf(pmid) + 1), `${link}: номер не совпадает с позицией в sources`)
		}
	})

	test(`${slug}: images exist in public/`, () => {
		for (const { src } of data.images) assert.ok(existsSync(new URL(`.${src}`, `${PUBLIC}/`)), src)
	})
}

test('every region has at least one article once the reference is complete', { skip: articles.length < 29 }, () => {
	const used = new Set(articles.map((a) => a.data.region))

	assert.deepEqual(
		REGIONS.filter((r) => !used.has(r.slug)).map((r) => r.slug),
		[],
	)
})
