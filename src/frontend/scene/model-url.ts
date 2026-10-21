import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

const DIR = join(process.cwd(), 'public/model')

let url: string | undefined

/**
 * Адрес модели с версией: `/model/body.glb?v=<хеш>`. Хеш считается на сборке сайта по фигуре
 * и всем детальным кускам, страница добавляет ту же версию к кускам (scene/detail.ts). Так
 * обновлённая модель сама получает новый адрес, и nginx может отдавать её с вечным кэшем
 * (deploy/nginx.conf): забыть поднять версию руками нельзя.
 */
export function modelUrl() {
	if (url) return url

	const hash = createHash('sha256')
	const files = ['body.glb', ...readdirSync(join(DIR, 'detail')).map((file) => `detail/${file}`)].sort()

	for (const file of files) hash.update(file).update(readFileSync(join(DIR, file)))

	url = `/model/body.glb?v=${hash.digest('hex').slice(0, 12)}`

	return url
}

/** Адрес файла `public/model/<file>` с версией по его содержимому. */
function versioned(file: string) {
	const hash = createHash('sha256').update(readFileSync(join(DIR, file)))

	return `/model/${file}?v=${hash.digest('hex').slice(0, 12)}`
}

/** Адрес 3D-модели для статьи (`public/model/rig/`) с версией по её файлу, как у фигуры. */
export function rigUrl(name: string) {
	return versioned(`rig/${name}.glb`)
}

const POSTERS = ['light-wide', 'light-narrow', 'dark-wide', 'dark-narrow'] as const

/**
 * Снимки модели иллюстрации (scripts/model/posters.mjs): светлая и тёмная тема, широкий и узкий
 * кадр. Лежат под моделью, пока она грузится. Ключ -- имя файла иллюстрации; хоть одного снимка
 * нет -- `undefined`.
 */
export function posterUrls(imageSrc: string) {
	const key = basename(imageSrc, extname(imageSrc))
	const file = (kind: string) => `rig/poster/${key}-${kind}.webp`

	if (!POSTERS.every((kind) => existsSync(join(DIR, file(kind))))) return undefined

	return Object.fromEntries(POSTERS.map((kind) => [kind, versioned(file(kind))])) as Record<
		(typeof POSTERS)[number],
		string
	>
}
