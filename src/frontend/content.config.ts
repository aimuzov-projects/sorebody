import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'

import { injurySchema, lensSchema } from '#frontend/lib/injury-schema.ts'

/** Общие части травм: одна на травму, для любого спорта. */
const injuries = defineCollection({
	loader: glob({ pattern: '*.md', base: './src/frontend/content/injuries' }),
	schema: injurySchema,
})

/** Линзы спортов: id -- `<sport>/<slug>`, slug совпадает со slug общей части. */
const lenses = defineCollection({
	loader: glob({ pattern: '*/*.md', base: './src/frontend/content/sports' }),
	schema: lensSchema,
})

export const collections = { injuries, lenses }
