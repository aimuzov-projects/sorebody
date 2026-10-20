import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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

/** Адрес 3D-модели для статьи (`public/model/rig/`) с версией по её файлу, как у фигуры. */
export function rigUrl(name: string) {
	const file = `rig/${name}.glb`
	const hash = createHash('sha256').update(readFileSync(join(DIR, file)))

	return `/model/${file}?v=${hash.digest('hex').slice(0, 12)}`
}
