/**
 * Таблица из "Анатомии Грея" (1918, общественное достояние), с которой сверена
 * иллюстрация. Копия лежит у нас в public, ссылка ведёт на страницу файла в
 * Wikimedia Commons.
 */
export type Atlas = { file: string; caption: string }

/** Имя файла, как в Commons: Gray347.png. */
export const ATLAS_FILE = /^Gray\d+[a-z]?\.png$/

export const atlasSrc = (file: string) => `/injuries/atlas/${file}`

export const atlasUrl = (file: string) => `https://commons.wikimedia.org/wiki/File:${file}`
