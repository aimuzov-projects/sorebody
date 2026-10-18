import { pageTitle } from '#frontend/lib/title.ts'

/**
 * Спорты по slug для смены спорта на месте. Свой спорт уже в странице, другие --
 * статикой `/<sport>/scene.json` (pages/[sport]/scene.json.ts). Неудачу не запоминаем:
 * следующий выбор спросит снова.
 */
export function createSportLoader<T>(own: { slug: string; data: T }, fetcher: typeof fetch = fetch) {
	const cache = new Map<string, Promise<T>>([[own.slug, Promise.resolve(own.data)]])

	return function load(slug: string) {
		let hit = cache.get(slug)

		if (!hit) {
			hit = fetcher(`/${slug}/scene.json`).then((r) => {
				if (!r.ok) throw new Error(`${r.url}: ${r.status}`)

				return r.json() as Promise<T>
			})

			hit.catch(() => cache.delete(slug))
			cache.set(slug, hit)
		}

		return hit
	}
}

/**
 * Ответ нужен, только если за время ожидания не случилось ни нового запроса, ни смены
 * адреса (посетитель успел открыть зону). `start` -- проверка для одного запроса.
 */
export function createRequestGuard(href: () => string) {
	let token = 0

	return {
		start() {
			const own = ++token
			const from = href()

			return { current: () => own === token && href() === from, latest: () => own === token }
		},
		/** Отменить ожидающие запросы, например при переходе по истории в том же спорте. */
		cancel() {
			token++
		},
	}
}

type HeadSport = { slug: string; heading: string; description: string; home: string }

/**
 * Заголовки страницы после смены спорта на месте -- как у полной загрузки его главной: `<title>`,
 * описание, og-метки, canonical, `data-sport` и скрытый `h1` (видимый -- в острове).
 */
export function applySportHead(doc: Document, sport: HeadSport) {
	const head = doc.head
	const title = pageTitle(sport.heading)
	const canonical = head.querySelector<HTMLLinkElement>('link[rel="canonical"]')

	doc.documentElement.dataset.sport = sport.slug
	doc.title = title
	head.querySelector('meta[name="description"]')?.setAttribute('content', sport.description)
	head.querySelector('meta[property="og:description"]')?.setAttribute('content', sport.description)
	head.querySelector('meta[property="og:title"]')?.setAttribute('content', title)

	if (canonical) {
		canonical.href = new URL(sport.home, canonical.href).href
		head.querySelector('meta[property="og:url"]')?.setAttribute('content', canonical.href)
	}

	const heading = doc.querySelector('.scene-page__title')

	if (heading) heading.textContent = sport.heading
}
