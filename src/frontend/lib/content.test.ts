import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { test } from 'node:test'
import { parse } from 'yaml'

import { FREQUENCY_SLUGS } from '#frontend/data/frequency.ts'
import { REGIONS } from '#frontend/data/regions.ts'
import { SPORTS } from '#frontend/data/sports.ts'

import { INJURY_HEADINGS, LENS_HEADINGS } from './article-html.ts'
import { IMAGE_HEIGHT, IMAGE_VARIANTS, IMAGE_WIDTH, imageVariant } from './article-image.ts'
import { atlasSrc } from './atlas.ts'
import { injuryPage } from './injury-page.ts'
import { injurySchema, lensSchema } from './injury-schema.ts'
import { footnotes, sourceHref } from './sources.ts'
import { sportWordsIn } from './sport-words.ts'

const CONTENT = new URL('../content/', import.meta.url)
const PUBLIC = new URL('../../../public', import.meta.url)
const RESIZE = 'node scripts/images/resize.mjs'
/** Хеши оригиналов, с которых сняты копии для srcset: пишет их scripts/images/resize.mjs. */
const variantHashes: Record<string, string> = JSON.parse(
	readFileSync(new URL('../data/image-variants.json', import.meta.url), 'utf8'),
)

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

	// Сноски блоков -- номера по sources файла, как [N] в тексте
	const blockCites: number[] = [
		...(data.timelines ?? []).flatMap((t: { phases: { cite?: number[] }[] }) =>
			t.phases.flatMap((p) => p.cite ?? []),
		),
		...[...(data.compares ?? []), ...(data.stats ?? [])].flatMap((b: { cite?: number[] }) => b.cite ?? []),
	]

	test(`${name}: every cited source is listed in sources and every source is cited`, () => {
		const cited = new Set([...footnotes(body).map((f) => f.key), ...blockCites.map((n) => keys[n - 1] ?? `#${n}`)])
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

	test(`${name}: every block marker has data and every block is placed`, () => {
		const fields = {
			chart: 'charts',
			timeline: 'timelines',
			compare: 'compares',
			stat: 'stats',
			diagram: 'diagrams',
		}

		for (const [kind, field] of Object.entries(fields)) {
			const placed = [...body.matchAll(new RegExp(`<div data-${kind}="([^"]+)"></div>`, 'g'))].map((m) => m[1])
			const defined = (data[field] ?? []).map((c: { id: string }) => c.id)

			assert.deepEqual([...placed].sort(), [...defined].sort(), field)
		}
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

	// "Проверено врачом" на черновике -- неправда в шапке статьи
	test(`${slug}: a reviewed article is not a draft`, () => {
		if (data.review) assert.equal(data.draft, false)
	})

	checkDoc(slug, doc, INJURY_HEADINGS)

	test(`${slug}: images, their atlas plates and 3D models exist in public/`, () => {
		for (const { src, atlas, model } of data.images) {
			assert.ok(existsSync(new URL(`.${src}`, `${PUBLIC}/`)), src)

			if (atlas) assert.ok(existsSync(new URL(`.${atlasSrc(atlas.file)}`, `${PUBLIC}/`)), atlas.file)

			if (model) assert.ok(existsSync(new URL(`./model/rig/${model.name}.glb`, `${PUBLIC}/`)), model.name)
		}
	})

	// Опечатка в show или hide молча ничего бы не показала и не спрятала
	test(`${slug}: groups the article shows or hides are in its 3D model`, () => {
		for (const { model } of data.images) {
			if (!model) continue

			const glb = readFileSync(new URL(`./model/rig/${model.name}.glb`, `${PUBLIC}/`))
			const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'))
			const groups = Object.keys(json.scenes[0].extras.rig.groups)

			for (const name of [...(model.show ?? []), ...(model.hide ?? [])])
				assert.ok(groups.includes(name), `${model.name}: ${name}`)
		}
	})

	test(`${slug}: images are 1200x669 JPEG or WebP with alpha`, () => {
		for (const { src } of data.images) {
			const file = readFileSync(new URL(`.${src}`, `${PUBLIC}/`))
			const size = src.endsWith('.webp') ? webpSize(file) : jpegSize(file)

			assert.deepEqual(size, { width: IMAGE_WIDTH, height: IMAGE_HEIGHT }, src)
		}
	})

	// Копии для srcset собирает scripts/images/resize.mjs: без копии телефон получит 404 вместо картинки
	test(`${slug}: every image has its srcset variants`, () => {
		for (const { src } of data.images)
			for (const width of IMAGE_VARIANTS) {
				const variant = imageVariant(src, width)
				const path = new URL(`.${variant}`, `${PUBLIC}/`)

				assert.ok(existsSync(path), `${variant}: нет копии, запусти ${RESIZE}`)

				const file = readFileSync(path)
				const size = variant.endsWith('.webp') ? webpSize(file) : jpegSize(file)

				assert.equal(size.width, width, variant)
				assert.ok(Math.abs(size.height - (IMAGE_HEIGHT * width) / IMAGE_WIDTH) <= 1, variant)
			}
	})

	// Оригинал заменили на месте, а копии остались от старого: размеры у них те же, ловим по хешу
	test(`${slug}: srcset variants are cut from the current original`, () => {
		for (const { src } of data.images) {
			const hash = createHash('sha256')
				.update(readFileSync(new URL(`.${src}`, `${PUBLIC}/`)))
				.digest('hex')

			assert.equal(variantHashes[basename(src)], hash, `${src}: копии устарели, запусти ${RESIZE}`)
		}
	})

	test(`${slug}: has a lens in at least one sport`, () => {
		assert.ok(lenses.some(({ docs }) => docs.some((l) => l.slug === slug)))
	})

	test(`${slug}: the common part speaks of no particular sport`, () => {
		// Сноски и подписи источников не в счёт: «опрос кроссфитеров» в подписи -- не текст статьи
		const prose = doc.body.replace(/\[\d+\]\([^)]*\)/g, '')
		const captions = [
			...data.images.flatMap((i: { alt: string; caption: string }) => [i.alt, i.caption]),
			...(data.charts ?? []).flatMap((c: { title: string; caption: string }) => [c.title, c.caption]),
			// Тексты блоков -- тоже текст статьи; сериализуем целиком, ключи слов спорта не содержат
			...['timelines', 'compares', 'stats', 'brief', 'takeaways', 'diagrams', 'selfCheck'].map((field) =>
				JSON.stringify(data[field] ?? []),
			),
		]

		assert.deepEqual(sportWordsIn([prose, ...captions].join('\n')), [])
	})
}

// Библиографию источников (data/pubmed.json) пишет scripts/sources/fetch.mjs: без записи
// источник в статье останется голым PMID, а запись без ссылок -- мусор в файле
test('data/pubmed.json covers every PMID in the articles and nothing else', () => {
	const fetchScript = 'node scripts/sources/fetch.mjs'
	const meta: Record<string, unknown> = JSON.parse(
		readFileSync(new URL('../data/pubmed.json', import.meta.url), 'utf8'),
	)
	const cited = new Set(
		[...injuries, ...lenses.flatMap((l) => l.docs)].flatMap(({ data }) =>
			(data.sources as { pmid?: string }[]).flatMap((s) => (s.pmid ? [s.pmid] : [])),
		),
	)

	assert.deepEqual(
		[...cited].filter((pmid) => !(pmid in meta)),
		[],
		`нет выходных данных, запусти ${fetchScript}`,
	)

	assert.deepEqual(
		Object.keys(meta).filter((pmid) => !cited.has(pmid)),
		[],
		`лишние записи, запусти ${fetchScript}`,
	)
})

// Картинку убрали из статьи или переименовали, а файл и его копии остались лежать в public
test('public/injuries holds only the article images and their srcset variants', () => {
	const used = injuries.flatMap(({ data }) => data.images.map(({ src }: { src: string }) => src))
	const expected = new Set(used.flatMap((src) => [src, ...IMAGE_VARIANTS.map((w) => imageVariant(src, w))]))
	const files = readdirSync(new URL('injuries/', `${PUBLIC}/`), { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => `/injuries/${entry.name}`)

	assert.deepEqual(
		files.filter((file) => !expected.has(file)),
		[],
		'не нужны ни одной статье',
	)

	assert.deepEqual(
		Object.keys(variantHashes).filter((file) => !used.includes(`/injuries/${file}`)),
		[],
		`в data/image-variants.json лишние картинки, запусти ${RESIZE}`,
	)
})

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

// Ссылку на травму в тексте сборка ведёт на страницу разбора (lib/injury-page.ts), но только
// в виде `/injuries/<slug>/`. Иначе ссылка осталась бы как есть и могла увести на переадресацию
test('internal links in the content lead to a page, not to a redirect', () => {
	const sportsOf = (slug: string) =>
		lenses.filter(({ docs }) => docs.some((d) => d.slug === slug)).map(({ sport }) => sport.slug)
	// Страницы, где выходит текст файла: общая часть -- в каждом спорте и на общей странице
	const docs = [
		...injuries.map((doc) => ({ doc, name: doc.slug, on: [...sportsOf(doc.slug), undefined] })),
		...lenses.flatMap(({ sport, docs }) =>
			docs.map((doc) => ({ doc, name: `${sport.slug}/${doc.slug}`, on: [sport.slug] })),
		),
	]

	for (const { doc, name, on } of docs)
		for (const [, href] of doc.body.matchAll(/\]\((\/[^)\s]*)\)/g)) {
			const slug = href!.match(/^\/injuries\/([a-z0-9-]+)\/(#[a-z0-9-]+)?$/)?.[1]

			assert.ok(slug, `${name}: ${href} -- ссылка на травму пишется как /injuries/<slug>/`)

			assert.ok(
				injuries.some((i) => i.slug === slug),
				`${name}: ${href} -- нет такой травмы`,
			)

			for (const sport of on) {
				const page = injuryPage(slug, sportsOf(slug), sport)

				assert.ok(
					page !== `/injuries/${slug}/` || sportsOf(slug).length !== 1,
					`${name}: ${href} -- переадресация`,
				)
			}
		}
})

test('every region has at least one injury once the reference is complete', { skip: injuries.length < 29 }, () => {
	const used = new Set(injuries.map((a) => a.data.region))

	assert.deepEqual(
		REGIONS.filter((r) => !used.has(r.slug)).map((r) => r.slug),
		[],
	)
})

// Зоны общие: голову добавил падел, но травма лица из кроссфита тоже в ней
test('crossfit has injuries in the head zone, and padel in the shin zone', () => {
	const regionsOf = (slug: string) =>
		new Set(
			lenses
				.find(({ sport }) => sport.slug === slug)!
				.docs.map((d) => injuries.find((i) => i.slug === d.slug)?.data.region),
		)

	assert.ok(regionsOf('crossfit').has('head'))
	assert.ok(regionsOf('padel').has('shin'))
})
