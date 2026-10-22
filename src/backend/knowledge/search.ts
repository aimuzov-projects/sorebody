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

/**
 * Симптомы, которые люди и статьи называют разными словами: "хрустнуло" в вопросе --
 * это "хлопок" и "щелчок" в статье, "опухло" -- "отёк". Группа -- начала основ: слово
 * запроса с таким началом ищется по всем словам базы с любым началом группы.
 */
const SYMPTOMS = [
	['хлоп', 'хруст', 'щелк', 'щелч', 'треск', 'тресн'],
	['отек', 'опух', 'припух'],
	['онеме', 'немее', 'немел'],
]

/** Синоним из группы весит меньше слова самого запроса, но больше совпадения по началу. */
const SYNONYM_WEIGHT = 0.8

/**
 * Во сколько раз поднять травмы зоны, которую запрос назвал словом из справочника:
 * "щелчок в колене" -- про колено, хотя щелчок бывает и в паху, и в плече.
 */
const REGION_BOOST = 2

// Насыщение частоты слова как обычно в BM25, а поправка на длину статьи
// слабее обычных 0.75: длинные статьи у нас о серьёзном (сотрясение,
// тепловой удар), их нельзя топить за длину
const K1 = 1.2
const B = 0.5

type Doc = { injury: KnowledgeInjury; tf: Map<string, number>; length: number }

/** Слово словаря для слова запроса: вес совпадения и редкость слова (IDF). */
type Variant = [word: string, weight: number, rarity: number]

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

	// Слова названий зон: "Таз, бедро и пах" -- таз, бедр, пах
	const regionTerms = new Map(knowledge.regions.map((r) => [r.slug, terms(r.label)]))
	const average = docs.reduce((sum, d) => sum + d.length, 0) / docs.length
	const vocabulary = [...new Set(docs.flatMap((d) => [...d.tf.keys()]))]
	const frequency = new Map<string, number>()

	for (const doc of docs) for (const term of doc.tf.keys()) frequency.set(term, (frequency.get(term) ?? 0) + 1)

	const idf = (term: string) => {
		const n = frequency.get(term) ?? 0

		return Math.log(1 + (docs.length - n + 0.5) / (n + 0.5))
	}

	/**
	 * Редкость синонимов -- одна на всю группу: по статьям, где есть хоть одно из них.
	 * Иначе редкое "щелкающ" из статьи о бедре весило бы больше "колена".
	 */
	const groupIdf = (words: string[]) => {
		const n = docs.filter((doc) => words.some((word) => doc.tf.has(word))).length

		return Math.log(1 + (docs.length - n + 0.5) / (n + 0.5))
	}

	/**
	 * Слова словаря, на которые похоже слово запроса, с весом и редкостью: само оно, те,
	 * что с него начинаются, и синонимы симптома из `SYMPTOMS`.
	 */
	const expand = (term: string): Variant[] => {
		if (term.length < MIN_PREFIX) return [[term, 1, idf(term)]]

		const group = SYMPTOMS.find((g) => g.some((start) => term.startsWith(start))) ?? []
		const own = vocabulary.filter((word) => word.startsWith(term))
		const synonyms = vocabulary.filter(
			(word) => !word.startsWith(term) && group.some((start) => word.startsWith(start)),
		)
		const shared = groupIdf(synonyms)

		return [
			...own.map((word): Variant => [word, word === term ? 1 : PREFIX_WEIGHT, idf(word)]),
			...synonyms.map((word): Variant => [word, SYNONYM_WEIGHT, shared]),
		]
	}

	return {
		search(query, filter = () => true) {
			const words = [...new Set(terms(query))]
			const expanded = words.map(expand)
			const named = new Set(
				[...regionTerms].filter(([, list]) => list.some((t) => words.includes(t))).map(([slug]) => slug),
			)

			return docs
				.filter((doc) => filter(doc.injury))
				.map((doc) => {
					// Из похожих слов берём лучшее: "колен" и "коленн" в одной статье -- одно совпадение
					const score = expanded.reduce((sum, variants) => {
						const best = Math.max(
							0,
							...variants.map(([term, weight, rarity]) => {
								const tf = doc.tf.get(term) ?? 0

								return (
									(weight * rarity * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * doc.length) / average))
								)
							}),
						)

						return sum + best
					}, 0)

					return { injury: doc.injury, score: named.has(doc.injury.region) ? score * REGION_BOOST : score }
				})
				.filter((hit) => hit.score > 0)
				.sort((a, b) => b.score - a.score)
		},
	}
}
