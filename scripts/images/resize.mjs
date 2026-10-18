// Уменьшенные копии иллюстраций статей для srcset (lib/article-image.ts). Запускать после того,
// как в public/injuries появилась или поменялась картинка: тест контента не пропустит статью,
// у которой копий нет или они другой ширины.
//
// usage: node scripts/images/resize.mjs
// Нужен ImageMagick (`magick`). Пересобирает копии всех картинок, вывод одинаковый от запуска
// к запуску, так что в git меняются только копии изменившихся оригиналов.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { IMAGE_VARIANTS, imageVariant } from '#frontend/lib/article-image.ts'

const dir = fileURLToPath(new URL('../../public/injuries/', import.meta.url))
const variant = /-\d+w\.[a-z]+$/
const originals = fs.readdirSync(dir).filter((file) => /\.(webp|jpe?g)$/.test(file) && !variant.test(file))

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
