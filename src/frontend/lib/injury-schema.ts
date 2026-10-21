import { z } from 'astro/zod'

import { FREQUENCY_SLUGS } from '#frontend/data/frequency.ts'
import { REGION_SLUGS } from '#frontend/data/regions.ts'
import { URGENCY } from '#frontend/data/urgency.ts'
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

/** Сноски блока: номера источников из `sources` того же файла, как `[N]` в тексте. */
const citeSchema = z.array(z.number().int().min(1)).default([])

const blockId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)

/** Шкала восстановления. В тексте ставится маркером `<div data-timeline="id"></div>`. */
export const timelineSchema = z.strictObject({
	id: blockId,
	title: z.string().min(3),
	phases: z
		.array(
			z.strictObject({
				/** Срок фазы: "0–2 недели", "с 9 месяцев". */
				when: z.string().min(2).max(40),
				title: z.string().min(3).max(60),
				text: z.string().min(10).max(260),
				cite: citeSchema,
			}),
		)
		.min(2)
		.max(6),
	caption: z.string().min(10).optional(),
})

export type Timeline = z.infer<typeof timelineSchema>

/** Развилка из двух-трёх вариантов. В тексте -- маркер `<div data-compare="id"></div>`. */
export const compareSchema = z.strictObject({
	id: blockId,
	title: z.string().min(3),
	options: z
		.array(
			z.strictObject({
				title: z.string().min(3).max(60),
				points: z.array(z.string().min(3).max(160)).min(1).max(5),
				/** Ключевая доля варианта пиктограммой "N из 10": процент и что за ним. */
				share: z
					.strictObject({ percent: z.number().min(0).max(100), label: z.string().min(10).max(120) })
					.optional(),
			}),
		)
		.min(2)
		.max(3),
	caption: z.string().min(10).optional(),
	cite: citeSchema,
})

export type Compare = z.infer<typeof compareSchema>

/** Крупная цифра с фразой. В тексте -- маркер `<div data-stat="id"></div>`. */
export const statSchema = z.strictObject({
	id: blockId,
	value: z.string().min(1).max(12),
	text: z.string().min(10).max(200),
	cite: citeSchema,
})

export type Stat = z.infer<typeof statSchema>

/**
 * Схема "опасно / безопасно" из готовых рисунков (lib/article-blocks.ts), подпись -- своя.
 * В тексте -- маркер `<div data-diagram="id"></div>`.
 */
export const diagramSchema = z.strictObject({
	id: blockId,
	kind: z.enum(['knee-valgus']),
	caption: z.string().min(10).max(220),
})

export type Diagram = z.infer<typeof diagramSchema>

/**
 * Самопроверка "Мне к врачу?" на своей странице `/injuries/<slug>/check/`: признаки из раздела
 * "Когда сразу к врачу", у каждого -- его срочность. Читатель отмечает, что у него есть, и
 * видит самую срочную. В статье на неё ведёт ссылка из того же раздела.
 */
const selfCheckSchema = z
	.array(z.strictObject({ text: z.string().min(10).max(160), urgency: z.enum(URGENCY) }))
	.min(2)
	// Больше восьми: в статьях о кисти, лице и паховой боли тревожных признаков столько и есть
	.max(10)

export type SelfCheck = z.infer<typeof selfCheckSchema>

/** Блоки, общие для общей части и линзы. */
const blocks = {
	timelines: z.array(timelineSchema).default([]),
	compares: z.array(compareSchema).default([]),
	stats: z.array(statSchema).default([]),
	diagrams: z.array(diagramSchema).default([]),
}

/**
 * "Коротко" в шапке общей части: три-четыре факта, которые нужны раньше всей статьи.
 * `kind` выбирает значок: срок, врач, тревожный признак, прогноз.
 */
const briefSchema = z
	.array(
		z.strictObject({
			kind: z.enum(['time', 'doctor', 'alert', 'outlook']),
			label: z.string().min(2).max(24),
			text: z.string().min(3).max(110),
		}),
	)
	.max(4)
	.default([])

export type Brief = z.infer<typeof briefSchema>

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
			// 3D-модель той же области: в углу иллюстрации кнопка, по ней фото сменяет модель
			// (public/model/rig/<name>.glb, scripts/model/rig.py)
			model: z
				.strictObject({
					name: z.string().regex(/^[a-z0-9-]+$/),
					// Названия структур травмы, как в BodyParts3D и Z-Anatomy без стороны: остаются цветными
					highlight: z.array(z.string().min(3)).default([]),
					// Группы модели, видимые сразу или спрятанные сразу, вопреки описателю (rigs/<name>.json)
					show: z.array(z.string()).default([]),
					hide: z.array(z.string()).default([]),
					// Откуда смотрит камера: x наружу у левой стороны, y вверх, z вперёд. Без него -- из описателя
					direction: z.tuple([z.number(), z.number(), z.number()]).optional(),
					// Добавка к (i) модели: чего в ней нет или что упрощено именно для этой травмы
					note: z.string().min(10).optional(),
				})
				.optional(),
		}),
	),
	charts: chartsSchema,
	...blocks,
	brief: briefSchema,
	/** "Что запомнить" в конце статьи: две-три мысли, с которыми читатель уходит. Без цифр -- цифры со сносками в тексте. */
	selfCheck: selfCheckSchema.optional(),
	takeaways: z.array(z.string().min(20).max(180)).max(3).default([]),
	/**
	 * Кто из врачей и когда проверил текст. Есть только у статьи без черновика: на странице --
	 * пометка "Проверено врачом" в шапке.
	 */
	review: z.strictObject({ by: z.string().min(5), date: z.iso.date() }).optional(),
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
	...blocks,
	sources: sourcesSchema,
	draft: draftSchema,
})
