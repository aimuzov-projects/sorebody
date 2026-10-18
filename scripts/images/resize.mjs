// Уменьшенные копии иллюстраций статей для srcset (lib/article-image.ts). Запускать после того,
// как в public/injuries появилась или поменялась картинка: тест контента не пропустит статью,
// у которой копий нет, они другой ширины или сняты с прежней версии оригинала. Версию тест
// узнаёт по хешам оригиналов в data/image-variants.json, их пишет этот же скрипт.
//
// usage: node scripts/images/resize.mjs
// Нужен ImageMagick (`magick`). Пересобирает копии всех картинок, вывод одинаковый от запуска
// к запуску, так что в git меняются только копии изменившихся оригиналов.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { IMAGE_VARIANTS, imageVariant, VARIANT_FILE } from '#frontend/lib/article-image.ts'

const dir = fileURLToPath(new URL('../../public/injuries/', import.meta.url))
const manifest = fileURLToPath(new URL('../../src/frontend/data/image-variants.json', import.meta.url))
const originals = fs
	.readdirSync(dir)
	.filter((file) => /\.(webp|jpe?g)$/.test(file) && !VARIANT_FILE.test(file))
	.sort()

for (const file of originals)
	for (const width of IMAGE_VARIANTS) {
		const out = imageVariant(file, width)

		// Качество 86 на уменьшенной копии не отличить от оригинала (92) на глаз, а весит она
		// заметно меньше; альфа вырезанных иллюстраций -- 90, как у постера главной
		execFileSync('magick', [
			`${dir}${file}`,
			'-resize',
			`${width}x`,
			'-quality',
			'86',
			'-define',
			'webp:alpha-quality=90',
			'-define',
			'webp:method=6',
			'-strip',
			`${dir}${out}`,
		])

		console.log(out)
	}

const hashes = Object.fromEntries(
	originals.map((file) => [
		file,
		createHash('sha256')
			.update(fs.readFileSync(`${dir}${file}`))
			.digest('hex'),
	]),
)

fs.writeFileSync(manifest, `${JSON.stringify(hashes, null, '\t')}\n`)
