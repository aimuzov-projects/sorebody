import { z } from 'astro/zod'

import { MOVEMENT_SLUGS } from '#frontend/data/movements.ts'
import { REGION_SLUGS } from '#frontend/data/regions.ts'

/** Frontmatter статьи. Общая для `content.config.ts` и тестов контента, чтобы правила не разъехались. */
export const injurySchema = z.object({
	title: z.string().min(3),
	titleEn: z.string().min(3),
	region: z.enum(REGION_SLUGS),
	frequency: z.enum(['common', 'rare']),
	movements: z.array(z.enum(MOVEMENT_SLUGS)),
	/** Одна фраза для карточки и `meta description`. */
	summary: z.string().min(20).max(220),
	images: z.array(
		z.object({
			src: z.string().regex(/^\/injuries\/[a-z0-9-]+\.jpg$/),
			alt: z.string().min(10),
			caption: z.string().min(10),
		}),
	),
	sources: z.array(z.object({ pmid: z.string().regex(/^\d{6,9}$/), label: z.string().min(3) })).min(1),
	/** Черновик: врач статью не проверял. На странице показывается плашка. */
	draft: z.boolean(),
})

export type InjuryData = z.infer<typeof injurySchema>
