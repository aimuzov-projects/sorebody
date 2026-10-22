import type { Knowledge, KnowledgeInjury } from '#shared/knowledge.ts'

import { terms } from './text.ts'

/**
 * Вес поля в поиске: совпадение в названии травмы значит больше, чем то же слово в разделе
 * о лечении. Разделы, где описано, что человек чувствует, весят больше остальных: вопросы
 * посетителей обычно о симптомах.
 */
const WEIGHT = { title: 3, region: 2, summary: 2, elements: 2, symptoms: 1.5, text: 1 }

const SYMPTOM_SECTIONS = new Set(['what', 'symptoms', 'urgent', 'mechanism'])

/** Совпадение по началу слова ("коленн" на "колен") весит меньше точного. */
const PREFIX_WEIGHT = 0.6

/** Короче начало слишком многое находит: по "бол" -- и боль, и болезнь, и большой. */
const MIN_PREFIX = 4

// Насыщение частоты слова как обычно в BM25, а поправка на длину статьи
// слабее обычных 0.75: длинные статьи у нас о серьёзном (сотрясение,
// тепловой удар), их нельзя топить за длину
const K1 = 1.2
const B = 0.5

type Doc = { injury: KnowledgeInjury; tf: Map<string, number>; length: number }

type Hit = { injury: KnowledgeInjury; score: number }

export type SearchIndex = { search: (query: string, filter?: (injury: KnowledgeInjury) => boolean) => Hit[] }

/**
 * Поиск по травмам BM25 с весами полей.
 *
 * Документ -- травма целиком: общая часть и линзы всех спортов, зона тела
 * и названия движений словами, чтобы "болит колено на тумбе" находило
 * травмы колена с элементом "Прыжки на тумбу".
 *
 * База маленькая, индекс строится в памяти за раз.
 */
export function searchIndex(knowledge: Knowledge): SearchIndex {
	const regions = new Map(knowledge.regions.map((r) => [r.slug, r.label]))
	const elements = new Map(
		knowledge.sports.flatMap((s) => s.elements.map((e) => [`${s.slug}/${e.slug}`, `${e.title} ${e.titleEn}`])),
	)
	const sports = new Map(knowledge.sports.map((s) => [s.slug, s.title]))

	const docs: Doc[] = knowledge.injuries.map((injury) => {
		const tf = new Map<string, number>()
		let length = 0
		const add = (text: string, weight: number) => {
			for (const term of terms(text)) {
				tf.set(term, (tf.get(term) ?? 0) + weight)
				length += weight
			}
		}

		// В slug -- английские сокращения, которых нет в названии: acl-tear, labral-tear-slap
		add(`${injury.title} ${injury.titleEn} ${injury.slug.replaceAll('-', ' ')}`, WEIGHT.title)
		add(regions.get(injury.region) ?? '', WEIGHT.region)
		add(injury.brief.map((b) => b.text).join(' '), WEIGHT.summary)
		add(injury.takeaways.join(' '), WEIGHT.text)
		add(injury.selfCheck.map((a) => a.text).join(' '), WEIGHT.symptoms)

		for (const section of injury.sections)
			add(section.text, SYMPTOM_SECTIONS.has(section.id) ? WEIGHT.symptoms : WEIGHT.text)

		for (const lens of injury.lenses) {
			add(`${sports.get(lens.sport) ?? ''} ${lens.summary}`, WEIGHT.summary)
			add(lens.elements.map((e) => elements.get(`${lens.sport}/${e}`) ?? '').join(' '), WEIGHT.elements)

			for (const section of lens.sections)
				add(section.text, SYMPTOM_SECTIONS.has(section.id) ? WEIGHT.symptoms : WEIGHT.text)
		}

		return { injury, tf, length }
	})

	const average = docs.reduce((sum, d) => sum + d.length, 0) / docs.length
	const vocabulary = [...new Set(docs.flatMap((d) => [...d.tf.keys()]))]
	const frequency = new Map<string, number>()

	for (const doc of docs) for (const term of doc.tf.keys()) frequency.set(term, (frequency.get(term) ?? 0) + 1)

	const idf = (term: string) => {
		const n = frequency.get(term) ?? 0

		return Math.log(1 + (docs.length - n + 0.5) / (n + 0.5))
	}

	/** Слова словаря, на которые похоже слово запроса: само оно и те, что с него начинаются. */
	const expand = (term: string): [string, number][] =>
		term.length < MIN_PREFIX
			? [[term, 1]]
			: vocabulary.flatMap((word): [string, number][] =>
					word === term ? [[word, 1]] : word.startsWith(term) ? [[word, PREFIX_WEIGHT]] : [],
				)

	return {
		search(query, filter = () => true) {
			const expanded = [...new Set(terms(query))].map(expand)

			return docs
				.filter((doc) => filter(doc.injury))
				.map((doc) => {
					// Из похожих слов берём лучшее: "колен" и "коленн" в одной статье -- одно совпадение
					const score = expanded.reduce((sum, variants) => {
						const best = Math.max(
							0,
							...variants.map(([term, weight]) => {
								const tf = doc.tf.get(term) ?? 0

								return (
									(weight * idf(term) * tf * (K1 + 1)) /
									(tf + K1 * (1 - B + (B * doc.length) / average))
								)
							}),
						)

						return sum + best
					}, 0)

					return { injury: doc.injury, score }
				})
				.filter((hit) => hit.score > 0)
				.sort((a, b) => b.score - a.score)
		},
	}
}
