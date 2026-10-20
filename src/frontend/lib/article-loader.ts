/**
 * Страницы статей для ридера главной (components/article-reader.svelte). Сцена начинает грузить
 * статью, едва на её ссылку навели, и к клику ответ обычно уже здесь: заготовка статьи почти не
 * видна. Неудачу не запоминаем: «Попробовать ещё раз» спросит снова.
 */
export function createArticleLoader(fetcher: typeof fetch = fetch) {
	const cache = new Map<string, Promise<string>>()

	return function load(url: string) {
		let hit = cache.get(url)

		if (!hit) {
			hit = fetcher(url).then((r) => {
				if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)

				return r.text()
			})

			hit.catch(() => cache.delete(url))
			cache.set(url, hit)
		}

		return hit
	}
}

export const loadArticle = createArticleLoader()

/** Курсор задержался на ссылке: столько ждём, чтобы не грузить всё, над чем он пролетел. */
const HOVER_DELAY = 80

/**
 * Префетч статей по ссылкам внутри `root`: курсор задержался, фокус или касание. `isArticle` решает,
 * ведёт ли адрес на статью. С включённой экономией трафика не грузим ничего заранее.
 */
export function prefetchArticles(root: HTMLElement, isArticle: (path: string) => boolean) {
	if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return () => {}

	let timer: ReturnType<typeof setTimeout> | undefined

	const linkOf = (event: Event) => {
		const link = (event.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href]')

		return link && link.origin === location.origin && isArticle(link.pathname) ? link : null
	}
	const now = (event: Event) => {
		const link = linkOf(event)

		if (link) loadArticle(link.pathname).catch(() => {})
	}
	const over = (event: PointerEvent) => {
		const link = linkOf(event)

		clearTimeout(timer)

		if (link && event.pointerType !== 'touch')
			timer = setTimeout(() => loadArticle(link.pathname).catch(() => {}), HOVER_DELAY)
	}
	const out = () => clearTimeout(timer)

	root.addEventListener('pointerover', over)
	root.addEventListener('pointerout', out)
	root.addEventListener('focusin', now)
	root.addEventListener('touchstart', now, { passive: true })

	return () => {
		clearTimeout(timer)
		root.removeEventListener('pointerover', over)
		root.removeEventListener('pointerout', out)
		root.removeEventListener('focusin', now)
		root.removeEventListener('touchstart', now)
	}
}
