import { readFileSync } from 'node:fs'

import type { Knowledge } from '#shared/knowledge.ts'

/**
 * База знаний из сборки сайта: `dist/knowledge.json`, в образе бэкенда -- рядом
 * с кодом.
 */
export function loadKnowledge(path = process.env.KNOWLEDGE ?? 'dist/knowledge.json'): Knowledge {
	return JSON.parse(readFileSync(path, 'utf8'))
}
