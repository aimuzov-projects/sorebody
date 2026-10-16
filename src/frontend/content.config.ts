import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'

import { injurySchema } from '#frontend/lib/injury-schema.ts'

const injuries = defineCollection({
	loader: glob({ pattern: '*.md', base: './src/frontend/content/injuries' }),
	schema: injurySchema,
})

export const collections = { injuries }
