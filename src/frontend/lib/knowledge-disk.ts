import { readdirSync, readFileSync } from 'node:fs'
import { parse } from 'yaml'

import { buildKnowledge } from './knowledge.ts'

const CONTENT = new URL('../content/', import.meta.url)

/** Файлы папки записями коллекции: в `node --test` Astro недоступен, frontmatter разбираем сами. */
function entries(dir: string, prefix = '') {
	return readdirSync(new URL(dir, CONTENT))
		.filter((file) => file.endsWith('.md'))
		.map((file) => {
			const [, front = '', body = ''] = readFileSync(new URL(dir + file, CONTENT), 'utf8').match(
				/^---\n([\s\S]*?)\n---\n([\s\S]*)$/,
			)!

			return { id: prefix + file.replace(/\.md$/, ''), data: parse(front), body }
		})
}

/** База знаний прямо из `content/`, как её соберёт сайт: для тестов поиска и инструментов. */
export function diskKnowledge() {
	const sports = readdirSync(new URL('sports/', CONTENT))

	return buildKnowledge(
		'https://sorebody.aimuzov.online/',
		entries('injuries/'),
		sports.flatMap((sport) => entries(`sports/${sport}/`, `${sport}/`)),
	)
}
