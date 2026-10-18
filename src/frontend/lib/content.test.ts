import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'yaml'

import { REGIONS } from '#frontend/data/regions.ts'

import { atlasSrc } from './atlas.ts'
import { injurySchema } from './injury-schema.ts'
import { footnotes, sourceHref } from './sources.ts'

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

/** Размер JPEG из заголовка: идём по маркерам до SOF0/SOF2, где лежат высота и ширина. */
function jpegSize(buffer: Buffer) {
	assert.equal(buffer.readUInt16BE(0), 0xffd8, 'не JPEG')

	let offset = 2

	while (offset + 9 < buffer.length) {
		assert.equal(buffer[offset], 0xff, 'битый маркер JPEG')

		const marker = buffer[offset + 1]!

		if (marker === 0xc0 || marker === 0xc2)
			return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) }

		offset += 2 + buffer.readUInt16BE(offset + 2)
	}

	assert.fail('в JPEG нет SOF0/SOF2')
}

/**
 * Размер WebP с прозрачным фоном: такой файл -- расширенный (чанк VP8X) с флагом альфы,
 * ширина и высота в нём -- 24-битные числа «минус один».
 */
function webpSize(buffer: Buffer) {
	assert.equal(buffer.toString('ascii', 0, 4), 'RIFF', 'не WebP')
	assert.equal(buffer.toString('ascii', 8, 12), 'WEBP', 'не WebP')
	assert.equal(buffer.toString('ascii', 12, 16), 'VP8X', 'WebP без расширенного заголовка, значит без альфы')
	assert.ok(buffer[20]! & 0x10, 'WebP без альфа-канала')

	return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 }
}

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

	// Ключ источника -- ссылка: каноническая на PubMed или ссылка рекомендации
	const keys: string[] = data.sources.map(sourceHref)

	test(`${slug}: every cited source is listed in sources and every source is cited`, () => {
		const cited = new Set(footnotes(body).map((f) => f.key))
		const listed = new Set(keys)

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
		for (const { text, key } of footnotes(body))
			assert.equal(text, String(keys.indexOf(key) + 1), `${key}: номер не совпадает с позицией в sources`)
	})

	test(`${slug}: every chart marker has data and every chart is placed`, () => {
		const placed = [...body.matchAll(/<div data-chart="([^"]+)"><\/div>/g)].map((m) => m[1])
		const defined = (data.charts ?? []).map((c: { id: string }) => c.id)

		assert.deepEqual([...placed].sort(), [...defined].sort())
	})

	test(`${slug}: images and their atlas plates exist in public/`, () => {
		for (const { src, atlas } of data.images) {
			assert.ok(existsSync(new URL(`.${src}`, `${PUBLIC}/`)), src)

			if (atlas) assert.ok(existsSync(new URL(`.${atlasSrc(atlas.file)}`, `${PUBLIC}/`)), atlas.file)
		}
	})

	test(`${slug}: images are 1200x669 JPEG or WebP with alpha`, () => {
		for (const { src } of data.images) {
			const file = readFileSync(new URL(`.${src}`, `${PUBLIC}/`))
			const size = src.endsWith('.webp') ? webpSize(file) : jpegSize(file)

			assert.deepEqual(size, { width: 1200, height: 669 }, src)
		}
	})
}

test('every region has at least one article once the reference is complete', { skip: articles.length < 29 }, () => {
	const used = new Set(articles.map((a) => a.data.region))

	assert.deepEqual(
		REGIONS.filter((r) => !used.has(r.slug)).map((r) => r.slug),
		[],
	)
})
