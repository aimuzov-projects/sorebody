const KEY = 'reading-place'
/** Сколько страниц помнить: хватает на обычную глубину истории, sessionStorage не пухнет. */
const LIMIT = 20

type Place = { id: string; offset: number }

function readPlaces(): Record<string, Place> {
	try {
		return JSON.parse(sessionStorage.getItem(KEY) ?? '{}')
	} catch {
		return {}
	}
}

function writePlaces(places: Record<string, Place>) {
	const recent = Object.entries(places).slice(-LIMIT)

	try {
		sessionStorage.setItem(KEY, JSON.stringify(Object.fromEntries(recent)))
	} catch {
		// Приватный режим или квота: вернутся в начало статьи, как раньше
	}
}

/**
 * Место чтения для возврата "Назад". Статью поверх модели браузер не восстанавливает:
 * она прокручивает свой контейнер и при возврате грузится заново. Уходя, запоминаем
 * раздел у верха экрана и сдвиг от него, вернулись по истории -- ставим туда же.
 * Раздел, а не пиксели: картинки и модель догружаются и сдвигают всё ниже.
 * Возвращает функцию снятия.
 */
export function keepReadingPlace(root: Element, scroller: HTMLElement | Window, sections: Element[]) {
	const box = scroller instanceof Window ? document.documentElement : scroller
	const top = () => (scroller instanceof Window ? 0 : scroller.getBoundingClientRect().top)
	const key = location.href

	const save = () => {
		const section = sections.findLast((s) => s.getBoundingClientRect().top <= top() + 1)

		if (!section?.id || !root.isConnected) return

		const places = readPlaces()

		delete places[key]
		places[key] = { id: section.id, offset: top() - section.getBoundingClientRect().top }
		writePlaces(places)
	}

	addEventListener('pagehide', save)

	const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
	const places = readPlaces()
	const place = places[key]
	const target = place && root.querySelector(`#${CSS.escape(place.id)}`)
	let touched = false
	const touch = () => (touched = true)
	const restore = () => {
		if (!touched && target) box.scrollTop += target.getBoundingClientRect().top - top() + place.offset
	}

	// Только при возврате по истории: открыли статью заново -- читают с начала
	if (navigation?.type === 'back_forward' && target) {
		// Одноразово: статью поверх модели могут открыть ещё раз, уже без "Назад"
		delete places[key]
		writePlaces(places)

		// Сам читатель двинул страницу -- больше не трогаем
		for (const type of ['wheel', 'touchstart', 'keydown']) scroller.addEventListener(type, touch, { passive: true })

		requestAnimationFrame(restore)

		if (document.readyState !== 'complete') addEventListener('load', restore, { once: true })
	}

	return () => {
		removeEventListener('pagehide', save)
		removeEventListener('load', restore)

		for (const type of ['wheel', 'touchstart', 'keydown']) scroller.removeEventListener(type, touch)
	}
}
