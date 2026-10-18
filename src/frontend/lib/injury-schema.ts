import { z } from 'astro/zod'

import { FREQUENCY_SLUGS } from '#frontend/data/frequency.ts'
import { REGION_SLUGS } from '#frontend/data/regions.ts'
import { ATLAS_FILE } from '#frontend/lib/atlas.ts'
import { guidelineSite } from '#frontend/lib/sources.ts'

const chartSchema = z
	.strictObject({
		id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
		title: z.string().min(3),
		/** Подписи строк внутри каждого ряда, например возрастные группы. */
		groups: z.array(z.string().min(1)).min(1),
		rows: z
			.array(
				z.strictObject({
					label: z.string().min(3),
					/** Проценты, по одному на группу. */
					values: z.array(z.number().min(0).max(100)),
				}),
			)
			.min(1),
		caption: z.string().min(10),
	})
	.refine((chart) => chart.rows.every((row) => row.values.length === chart.groups.length), {
		message: 'в каждом ряду столько значений, сколько групп',
	})

export type Chart = z.infer<typeof chartSchema>

/** Пиктограммы "N из 10". В тексте ставятся маркером `<div data-chart="id"></div>`. */
const chartsSchema = z.array(chartSchema).default([])

/** Статья PubMed по PMID или рекомендация по ссылке с сайта из `GUIDELINE_SITES`. */
const sourcesSchema = z
	.array(
		z.union([
			z.strictObject({ pmid: z.string().regex(/^\d{6,9}$/), label: z.string().min(3) }),
			z.strictObject({
				url: z.string().refine((url) => guidelineSite(url) !== undefined, 'сайт рекомендаций не из списка'),
				label: z.string().min(3),
			}),
		]),
	)
	.min(1)

/** Черновик: врач текст не проверял. На сайте не показывается, это пометка для редактуры. */
const draftSchema = z.boolean()

/**
 * Frontmatter общей части травмы (`content/injuries`): что верно в любом спорте. Общая для
 * `content.config.ts` и тестов контента, чтобы правила не разъехались. Строгая: glob-лоадер
 * берёт id из поля `slug`, если оно есть, — slug травмы только имя файла.
 */
export const injurySchema = z.strictObject({
	title: z.string().min(3),
	titleEn: z.string().min(3),
	region: z.enum(REGION_SLUGS),
	images: z.array(
		z.object({
			// .webp -- иллюстрация с прозрачным фоном, без подложки
			src: z.string().regex(/^\/injuries\/[a-z0-9-]+\.(jpg|webp)$/),
			alt: z.string().min(10),
			caption: z.string().min(10),
			atlas: z.strictObject({ file: z.string().regex(ATLAS_FILE), caption: z.string().min(10) }).optional(),
		}),
	),
	charts: chartsSchema,
	sources: sourcesSchema,
	draft: draftSchema,
})

/**
 * Frontmatter линзы (`content/sports/<sport>/<slug>.md`): травма глазами одного спорта, slug --
 * как у общей части. Элементы сверяет со списком спорта сборка (lib/catalog.ts) и тест контента:
 * спорта из пути файла схема не видит.
 */
export const lensSchema = z.strictObject({
	frequency: z.enum(FREQUENCY_SLUGS),
	elements: z.array(z.string().regex(/^[a-z]+(-[a-z]+)*$/)),
	/** Одна фраза для карточки и `meta description` в этом спорте. */
	summary: z.string().min(20).max(220),
	charts: chartsSchema,
	sources: sourcesSchema,
	draft: draftSchema,
})
