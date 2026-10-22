import type { Knowledge, KnowledgeInjury, KnowledgeSection } from '#shared/knowledge.ts'

import { searchIndex } from './search.ts'

/** Ошибка в запросе к базе: неизвестная травма, зона или спорт. Агенту её текст отдаётся как есть. */
export class KnowledgeError extends Error {}

/** Что делать с признаком из самопроверки, словами для ответа. */
const URGENCY_LABEL = {
	call: 'сразу скорая (103/112)',
	today: 'сегодня в травмпункт',
	soon: 'к врачу в ближайшие дни',
} as const

const DEFAULT_LIMIT = 5

const MAX_LIMIT = 10

type Filter = { region?: string; sport?: string; element?: string }

/**
 * Инструменты над базой знаний: одни и те же для публичного MCP и чата на сайте.
 * Отдают простые объекты для JSON, адреса -- полные, на страницы сайта.
 *
 * Аргументы проверяют сами: их пишет модель, поэтому неизвестная зона или травма --
 * ошибка с подсказкой, а не пустой ответ.
 */
export function knowledgeTools(knowledge: Knowledge) {
	const index = searchIndex(knowledge)
	const injuries = new Map(knowledge.injuries.map((i) => [i.slug, i]))
	const href = (path: string) => new URL(path, knowledge.site).href

	const check = ({ region, sport, element }: Filter) => {
		if (region && !knowledge.regions.some((r) => r.slug === region))
			throw new KnowledgeError(`Нет зоны «${region}». Есть: ${knowledge.regions.map((r) => r.slug).join(', ')}`)

		const known = sport && knowledge.sports.find((s) => s.slug === sport)

		if (sport && !known)
			throw new KnowledgeError(`Нет спорта «${sport}». Есть: ${knowledge.sports.map((s) => s.slug).join(', ')}`)

		if (element && !sport) throw new KnowledgeError('Движение ищется только вместе со спортом')

		if (element && known && !known.elements.some((e) => e.slug === element))
			throw new KnowledgeError(
				`В спорте «${sport}» нет движения «${element}». Есть: ${known.elements.map((e) => e.slug).join(', ')}`,
			)
	}

	const matches =
		({ region, sport, element }: Filter) =>
		(injury: KnowledgeInjury) => {
			const lens = sport && injury.lenses.find((l) => l.sport === sport)

			return (
				(!region || injury.region === region) &&
				(!sport || Boolean(lens)) &&
				(!element || Boolean(lens && lens.elements.includes(element)))
			)
		}

	/** Адрес травмы: со спортом -- его разбор, если он есть, иначе общая страница. */
	const urlOf = (injury: KnowledgeInjury, sport?: string) =>
		href(injury.lenses.find((l) => l.sport === sport)?.url ?? injury.url)

	const get = (slug: string) => {
		const injury = injuries.get(slug)

		if (!injury) throw new KnowledgeError(`Нет травмы «${slug}». Найти slug поможет search_injuries`)

		return injury
	}

	const card = (injury: KnowledgeInjury, sport?: string) => ({
		slug: injury.slug,
		title: injury.title,
		region: injury.region,
		url: urlOf(injury, sport),
		sports: injury.lenses.map((l) => l.sport),
		summary: injury.lenses.find((l) => l.sport === sport)?.summary ?? injury.brief.map((b) => b.text).join('. '),
	})

	return {
		/** Травмы, похожие на описание: лучшие совпадения первыми. */
		searchInjuries({ query, limit = DEFAULT_LIMIT, ...filter }: Filter & { query: string; limit?: number }) {
			check(filter)

			return index
				.search(query, matches(filter))
				.slice(0, Math.min(limit, MAX_LIMIT))
				.map(({ injury }) => card(injury, filter.sport))
		},

		/**
		 * Статья травмы: общая часть и, со спортом, его линза.
		 *
		 * `sections` -- id разделов, чтобы не тянуть всю статью; без них -- все.
		 * Сноски `(N)` в разделах -- номера в `sources` той же части.
		 */
		getArticle({ slug, sport, sections }: { slug: string; sport?: string; sections?: string[] }) {
			check({ sport })

			const injury = get(slug)
			const lens = sport ? injury.lenses.find((l) => l.sport === sport) : undefined

			if (sport && !lens)
				throw new KnowledgeError(
					`У «${slug}» нет разбора для «${sport}». Есть: ${injury.lenses.map((l) => l.sport).join(', ') || 'нет'}`,
				)

			const pick = (list: KnowledgeSection[]) => (sections ? list.filter((s) => sections.includes(s.id)) : list)

			return {
				...card(injury, sport),
				titleEn: injury.titleEn,
				draft: injury.draft,
				brief: injury.brief,
				takeaways: injury.takeaways,
				sections: pick(injury.sections),
				sources: injury.sources,
				...(lens && {
					lens: {
						sport: lens.sport,
						frequency: lens.frequency,
						elements: lens.elements,
						sections: pick(lens.sections),
						sources: lens.sources,
					},
				}),
			}
		},

		/** Каталог травм: по зоне, спорту, движению спорта. */
		listInjuries(filter: Filter = {}) {
			check(filter)

			return knowledge.injuries.filter(matches(filter)).map((injury) => ({
				slug: injury.slug,
				title: injury.title,
				region: injury.region,
				url: urlOf(injury, filter.sport),
				...(filter.sport && { frequency: injury.lenses.find((l) => l.sport === filter.sport)!.frequency }),
			}))
		},

		/**
		 * Когда сразу к врачу: раздел статьи и признаки самопроверки со срочностью. Для одной травмы
		 * или для всех травм зоны -- когда ясно только, где болит.
		 *
		 * `brief` -- без текста раздела: чату на сайте хватает признаков и ссылки, а раздел по всей
		 * зоне -- самый дорогой ответ базы в токенах.
		 */
		getRedFlags({ slug, region, brief = false }: { slug?: string; region?: string; brief?: boolean }) {
			if (!slug === !region) throw new KnowledgeError('Нужна травма (slug) или зона (region), что-то одно')

			check({ region })

			const list = slug ? [get(slug)] : knowledge.injuries.filter((i) => i.region === region)

			return list.map((injury) => ({
				slug: injury.slug,
				title: injury.title,
				url: `${urlOf(injury)}#urgent`,
				...(!brief && { urgent: injury.sections.find((s) => s.id === 'urgent')?.text ?? '' }),
				alarms: injury.selfCheck.map((a) => ({ ...a, action: URGENCY_LABEL[a.urgency] })),
			}))
		},

		/** Справочники: зоны тела, спорты и их движения, сколько в базе травм. */
		catalog() {
			return {
				site: knowledge.site,
				injuries: knowledge.injuries.length,
				regions: knowledge.regions,
				sports: knowledge.sports,
			}
		},
	}
}
