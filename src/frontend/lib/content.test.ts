import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'yaml'

import { FREQUENCY_SLUGS } from '#frontend/data/frequency.ts'
import { REGIONS } from '#frontend/data/regions.ts'
import { SPORTS } from '#frontend/data/sports.ts'

import { INJURY_HEADINGS, LENS_HEADINGS } from './article-html.ts'
import { atlasSrc } from './atlas.ts'
import { injurySchema, lensSchema } from './injury-schema.ts'
import { footnotes, sourceHref } from './sources.ts'

const CONTENT = new URL('../content/', import.meta.url)
const PUBLIC = new URL('../../../public', import.meta.url)

type Doc = { slug: string; data: Record<string, any>; body: string; headings: string[] }

/** Файлы как есть на диске: Astro в `node --test` недоступен, frontmatter разбираем сами. */
function readDocs(dir: URL): Doc[] {
	return readdirSync(dir)
		.filter((f) => f.endsWith('.md'))
		.map((file) => {
			const raw = readFileSync(new URL(file, dir), 'utf8')
			const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)

			assert.ok(match, `${file}: нет frontmatter между строками «---»`)

			const [, front = '', body = ''] = match
			const headings = body.split('\n').filter((line) => line.startsWith('## '))

			return { slug: file.replace(/\.md$/, ''), data: parseFrontmatter(file, front), body, headings }
		})
}

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

const injuries = readDocs(new URL('injuries/', CONTENT))
const sportDirs = readdirSync(new URL('sports/', CONTENT))
const lenses = SPORTS.map((sport) => ({
	sport,
	docs: existsSync(new URL(`sports/${sport.slug}/`, CONTENT))
		? readDocs(new URL(`sports/${sport.slug}/`, CONTENT))
		: [],
}))

/** Заголовки файла -- шаблон по порядку: обязательные все, необязательные можно пропустить. */
function assertHeadings(headings: string[], template: typeof INJURY_HEADINGS) {
	const kept = template.filter((h) => !h.optional || headings.includes(`## ${h.title}`))

	assert.deepEqual(
		headings,
		kept.map((h) => `## ${h.title}`),
	)
}

/** Проверки, общие для общей части и линзы: сноски, графики и шаблон разделов. */
function checkDoc(name: string, { data, body, headings }: Doc, template: typeof INJURY_HEADINGS) {
	test(`${name}: body has the template sections in order`, () => assertHeadings(headings, template))

	// Ключ источника -- ссылка: каноническая на PubMed или ссылка рекомендации
	const keys: string[] = (data.sources ?? []).map(sourceHref)

	test(`${name}: every cited source is listed in sources and every source is cited`, () => {
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

	// На странице номера сквозные (lib/article-html.ts), в файле -- по его собственному sources
	test(`${name}: footnote number matches the source position in this file`, () => {
		for (const { text, key } of footnotes(body))
			assert.equal(text, String(keys.indexOf(key) + 1), `${key}: номер не совпадает с позицией в sources`)
	})

	test(`${name}: every chart marker has data and every chart is placed`, () => {
		const placed = [...body.matchAll(/<div data-chart="([^"]+)"><\/div>/g)].map((m) => m[1])
		const defined = (data.charts ?? []).map((c: { id: string }) => c.id)

		assert.deepEqual([...placed].sort(), [...defined].sort())
	})
}

test('there is at least one injury', () => {
	assert.ok(injuries.length > 0)
})

for (const doc of injuries) {
	const { slug, data } = doc

	test(`${slug}: slug is kebab-case`, () => {
		assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/)
	})

	test(`${slug}: frontmatter matches the injury schema`, () => {
		const result = injurySchema.safeParse(data)

		assert.ok(result.success, JSON.stringify(result.error?.issues))
	})

	checkDoc(slug, doc, INJURY_HEADINGS)

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

	test(`${slug}: has a lens in at least one sport`, () => {
		assert.ok(lenses.some(({ docs }) => docs.some((l) => l.slug === slug)))
	})
}

test('every folder in content/sports is a sport from data/sports.ts', () => {
	assert.deepEqual(
		sportDirs.filter((dir) => !SPORTS.some((s) => s.slug === dir)),
		[],
	)
})

for (const { sport, docs } of lenses) {
	const elements = new Set<string>(sport.elements.map((e) => e.slug))

	for (const doc of docs) {
		const name = `${sport.slug}/${doc.slug}`
		const injury = injuries.find((i) => i.slug === doc.slug)

		test(`${name}: frontmatter matches the lens schema`, () => {
			const result = lensSchema.safeParse(doc.data)

			assert.ok(result.success, JSON.stringify(result.error?.issues))
		})

		test(`${name}: has the common part of the injury`, () => {
			assert.ok(injury, `нет content/injuries/${doc.slug}.md`)
		})

		test(`${name}: elements are from the sport list`, () => {
			assert.deepEqual(
				(doc.data.elements ?? []).filter((e: string) => !elements.has(e)),
				[],
			)
		})

		checkDoc(name, doc, LENS_HEADINGS)

		// Необязательные разделы: на странице спорта их собирают обе части, хоть одна не пуста
		test(`${name}: the sport page has return and prevention from at least one part`, () => {
			for (const id of ['return', 'prevention'] as const) {
				const has = (template: typeof INJURY_HEADINGS, headings: string[] = []) =>
					headings.includes(`## ${template.find((h) => h.id === id)!.title}`)

				assert.ok(has(INJURY_HEADINGS, injury?.headings) || has(LENS_HEADINGS, doc.headings), id)
			}
		})
	}

	test(`${sport.slug}: frequencyOrder lists every injury of the sport once`, () => {
		assert.deepEqual([...sport.frequencyOrder].sort(), docs.map((d) => d.slug).sort())
	})

	test(`${sport.slug}: frequencyOrder goes from common to rare without mixing levels`, () => {
		const level = (slug: string) => FREQUENCY_SLUGS.indexOf(docs.find((d) => d.slug === slug)?.data.frequency)
		const levels = sport.frequencyOrder.map(level)

		assert.deepEqual(
			levels,
			[...levels].sort((a, b) => a - b),
		)
	})
}

test('every region has at least one injury once the reference is complete', { skip: injuries.length < 29 }, () => {
	const used = new Set(injuries.map((a) => a.data.region))

	assert.deepEqual(
		REGIONS.filter((r) => !used.has(r.slug)).map((r) => r.slug),
		[],
	)
})
