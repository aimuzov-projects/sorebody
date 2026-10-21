import { readFileSync } from 'node:fs'

/**
 * Версия сайта из `package.json`: её видят клиенты MCP. Файл лежит и в образе
 * бэкенда, рядом с `src`.
 */
export const VERSION: string = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version
