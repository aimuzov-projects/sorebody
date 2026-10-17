<script lang="ts" module>
	function plural(n: number) {
		const mod10 = n % 10
		const mod100 = n % 100

		if (mod10 === 1 && mod100 !== 11) return 'травма'

		if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'травмы'

		return 'травм'
	}

	/** Последнее слово отдельно: его склеиваем со стрелкой, чтобы она не уезжала одна на новую строку. */
	function splitLastWord(text: string) {
		const at = text.lastIndexOf(' ') + 1

		return [text.slice(0, at), text.slice(at)]
	}
</script>

<script lang="ts">
	import { onMount, tick, type Snippet } from 'svelte'

	import { ChevronLeft, Circle, Diamond, FunnelX, PersonStanding, Search } from 'lucide-static'

	import { MOVEMENT_ICONS } from '#frontend/data/movement-icons.ts'
	import type { Movement } from '#frontend/data/movements.ts'
	import { normalize } from '#frontend/lib/filter.ts'
	import { INFO_DOT } from '#frontend/lib/icons.ts'
	import { initReading } from '#frontend/lib/reading.ts'
	import { attachTip } from '#frontend/lib/tip.ts'
	import { splitTitle } from '#frontend/lib/title.ts'
	import { BACK_EVENT, STEP_EVENT } from '#frontend/lib/telegram-events.ts'
	import Logo from '#frontend/components/logo.svelte'
	import MovementSelect from '#frontend/components/movement-select.svelte'
	import SearchField from '#frontend/components/search-field.svelte'
	import SiteHeader from '#frontend/components/site-header.svelte'
	import type { BodyScene } from '#frontend/scene/body-scene.ts'
	import { homeShift, POSTER_SHIFT, projectBox } from '#frontend/scene/frame.ts'
	import poster from '#frontend/scene/poster.json'
	import { injuryFocus, injuryLayer, type InjuryFocus, type Zone } from '#frontend/scene/zones.ts'

	type Props = {
		zones: Zone[]
		whole: Zone
		/** Движения, которые встречаются хотя бы в одной статье: варианты фильтра. */
		movements: { slug: string; title: string }[]
		modelUrl: string
		/** Подвал сайта из Astro: встаёт под статьёй поверх модели, как на отдельной странице. */
		footer?: Snippet
		/**
		 * Страница движения: вместо индекса -- шапка движения и его травмы, фильтр по движению
		 * закреплён, точки зон с этими травмами крупнее и пульсируют, остальные приглушены.
		 */
		movementPage?: { slug: string; title: string; titleEn: string }
	}
	type Injury = Zone['injuries'][number]

	let { zones, whole, movements, modelUrl, footer, movementPage }: Props = $props()

	/** Частота: у частых и редких свой знак и цвет (--common, --rare), как легенда к списку. */
	const FREQUENCIES = [
		['all', 'Все', ''],
		['common', 'Частые', Circle],
		['rare', 'Редкие', Diamond],
	] as const

	/** Фильтры индекса. Они же решают, какие травмы видны в списке зоны и какие точки горят на модели. */
	let query = $state('')
	let frequency = $state<'all' | 'common' | 'rare'>('all')
	let movement = $state('')

	function matches(injury: Injury) {
		const q = normalize(query)
		const only = movementPage?.slug ?? movement

		return (
			(frequency === 'all' || injury.rare === (frequency === 'rare')) &&
			(!only || injury.movements.includes(only)) &&
			(!q || normalize(`${injury.title} ${injury.titleEn} ${injury.summary}`).includes(q))
		)
	}

	const allZones = $derived([...zones, whole])
	const filtering = $derived(query.trim() !== '' || frequency !== 'all' || movement !== '')
	/**
	 * Включённые фильтры для шапки раскрытой зоны: каждый своим чипом и со своим знаком --
	 * частота кружком или ромбом в её цвете, движение его иконкой, поиск лупой.
	 */
	const activeFilters = $derived(
		[
			query.trim() && { key: 'query', label: `«${query.trim()}»`, icon: Search, tone: '' },
			frequency === 'common' && { key: 'frequency', label: 'Частые', icon: Circle, tone: 'common' },
			frequency === 'rare' && { key: 'frequency', label: 'Редкие', icon: Diamond, tone: 'rare' },
			movement && {
				key: 'movement',
				label: movements.find((m) => m.slug === movement)?.title ?? movement,
				icon: MOVEMENT_ICONS[movement as Movement] ?? '',
				tone: '',
			},
		].filter((f) => f !== false && f !== ''),
	)

	function resetFilters() {
		query = ''
		frequency = 'all'
		movement = ''
	}
	const counts = $derived(new Map(allZones.map((zone) => [zone, zone.injuries.filter(matches).length])))
	const results = $derived(
		query.trim()
			? allZones.flatMap((zone) => zone.injuries.filter(matches).map((injury) => ({ zone, injury })))
			: [],
	)
	/** Травмы движения по зонам сверху вниз, в порядке индекса главной. */
	const movementInjuries = $derived(
		movementPage
			? allZones.flatMap((zone) => zone.injuries.filter(matches).map((injury) => ({ zone, injury })))
			: [],
	)

	/** Зона, на строку которой навели в индексе: её точки на модели подсвечиваются. */
	let highlighted = $state.raw<Zone | null>(null)

	function setHighlight(zone: Zone | null) {
		highlighted = zone
		body?.glow(zone === whole)
		tintZone(zone && zone !== whole ? zone : null)
	}

	/** Зона под курсором -- голубым пятном на коже, к краю в серый, как свечение «Всего тела». */
	function tintZone(zone: Zone | null) {
		body?.tint(zone?.points.map((p) => p.position) ?? null, zone ? zone.radius * 1.5 : 0)
	}

	/**
	 * Наведение (или фокус) на строку зоны в индексе: точки зоны крупнее, остальные
	 * притушены, камера подъезжает к зоне, но не раскрывает её. Камера отвечает с задержкой,
	 * чтобы при быстром проходе по строкам не металась. На таче только подсветка.
	 */
	let previewTimer: ReturnType<typeof setTimeout> | undefined

	function previewZone(zone: Zone | null, pointer = true) {
		setHighlight(zone)
		clearTimeout(previewTimer)

		if (body && zone && zone !== whole) body.prefetchDetail(zone.slug, zone.points[facingIndex(zone)].position)

		if (pointer && noHover) return

		// Без движения камера стоит, но и автоповорот замирает: подсвеченная точка не уплывает
		if (reduceMotion) {
			if (body && !open) body.controls.autoRotate = !zone

			return
		}

		previewTimer = setTimeout(() => focusPreview(zone), zone ? 120 : 220)
	}

	/**
	 * Строка травмы на странице движения: как строка в раскрытой зоне, камера подъезжает к месту
	 * травмы, там встаёт её маркер, а точки зон отступают. Сторону парной зоны берём ту, что
	 * сейчас смотрит на камеру.
	 */
	let lead = $state.raw<{ zone: Zone; index: number; injury: Injury } | null>(null)

	function previewInjury(entry: { zone: Zone; injury: Injury } | null, pointer = true) {
		if (open) return

		lead = entry && { ...entry, index: body ? facingIndex(entry.zone) : 0 }
		setHighlight(entry?.zone ?? null)
		clearTimeout(previewTimer)

		if (pointer && noHover) return

		if (reduceMotion) {
			if (body) body.controls.autoRotate = !entry

			return
		}

		previewTimer = setTimeout(focusLead, entry ? 120 : 220)
	}

	function focusLead() {
		if (!body || open) return

		if (!lead) {
			body.focus(null)
			body.controls.autoRotate = true
			homeFrame()

			return
		}

		const target = injuryFocus(lead.zone, lead.index, lead.injury.slug)
		// Дальше, чем в раскрытой зоне: тело в кадре справа от списка, а не вплотную под ним
		const zoom = clamp(0.26 / lead.zone.radius, 1, 2.2) * Math.sqrt(target.zoom)
		// На телефоне список занимает низ: место травмы -- в середину свободной верхней части, а
		// фигура мельче, чтобы не наезжала на строки
		const phone = wrap.clientWidth < 700

		if (phone) body.frame(0, 0)

		body.controls.autoRotate = false

		body.focus(
			target.position,
			phone ? Math.min(zoom * 0.55, 1.4) : Math.min(zoom, 2.4),
			// Доли экрана: на десктопе -- там же, где на общем плане стоит фигура
			{ x: phone ? 0 : 0.17, y: phone ? 0.3 : 0 },
			target.view,
			true,
		)
	}

	/** Из двух точек парной зоны -- та, что сейчас смотрит на камеру. */
	function facingIndex(zone: Zone) {
		return zone.points.reduce(
			(best, point, i) => (body!.facing(point.normal) > body!.facing(zone.points[best].normal) ? i : best),
			0,
		)
	}

	function focusPreview(zone: Zone | null) {
		if (!body || open) return

		if (!zone || zone === whole) {
			body.focus(null)
			body.controls.autoRotate = true
			homeFrame()

			return
		}

		const point = zone.points[facingIndex(zone)]

		body.controls.autoRotate = false
		// Точка встаёт туда же, где на общем плане стоит фигура: в середину свободной части
		const at = wrap.clientWidth < 700 ? { x: 0, y: 0.27 } : { x: 0.17, y: 0 }

		body.focus(point.position, clamp(0.26 / zone.radius, 1, 2.2), at, point.view, true)
	}

	/** Радиус "магнита" вокруг точки зоны, пиксели. */
	const PICK_PX = 56
	/** Сколько гаснет сцена перед статьёй; после этого рендер останавливается. */
	const SCENE_FADE_MS = 450

	let wrap: HTMLDivElement
	let canvas: HTMLCanvasElement
	let body: BodyScene | undefined
	let status = $state<'loading' | 'ready' | 'error'>('loading')

	// --- Загрузка модели: силуэт-скелетон, затем фигура и точки ---
	/**
	 * Фигура нарисована с нужной камерой: только тогда видны канвас, точки и метки --
	 * до первого кадра их координаты ещё не посчитаны и они стояли в левом верхнем углу.
	 */
	let live = $state(false)
	/**
	 * Постер -- картинка фигуры из стартового кадра (scripts/poster). До загрузки модели он
	 * стоит ровно там, где появится фигура: место считается по тем же числам камеры. Нет, если
	 * адрес сразу открывает зону или статью: там первый кадр другой.
	 */
	let posterRect = $state<{ left: number; top: number; width: number; height: number } | null>(null)
	/** Постер ещё в DOM: после первого кадра он гаснет и уходит. */
	let posterShown = $state(true)

	/** `?poster` -- рендер постера скриптом: кадр POSTER_SHIFT, фигура не вертится. */
	const posterMode = typeof location !== 'undefined' && new URLSearchParams(location.search).has('poster')

	function placePoster() {
		posterRect = projectBox(poster.box as never, innerWidth, innerHeight, homeShift(innerWidth))
	}
	let fps = $state(0)
	const showFps = typeof location !== 'undefined' && new URLSearchParams(location.search).has('fps')
	const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

	type Spot = { zone: Zone; index: number; x: number; y: number; visible: boolean }

	const spots: Spot[] = $derived(
		zones.flatMap((zone) => zone.points.map((_, index) => ({ zone, index, x: 0, y: 0, visible: true }))),
	)
	let spotEls = $state<HTMLButtonElement[]>([])

	/**
	 * Травма, на строку которой навели в раскрытой зоне (на таче -- строка у центра списка):
	 * камера подъезжает к её месту, её маркер крупнее, остальные притушены.
	 */
	let accent = $state.raw<Injury | null>(null)
	let accentTimer: ReturnType<typeof setTimeout> | undefined
	let scrollTimer: ReturnType<typeof setTimeout> | undefined
	const noHover = typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches

	/**
	 * Маркеры травм раскрытой зоны: травмы с одним местом делят маркер. `numbers` -- номера
	 * строк списка, по ним маркер на модели сверяется со строкой.
	 */
	type Mark = { key: string; focus: InjuryFocus; slugs: string[]; numbers: number[] }

	const marks: Mark[] = $derived.by(() => {
		if (!open) {
			if (!lead) return []

			const focus = injuryFocus(lead.zone, lead.index, lead.injury.slug)
			const number = movementInjuries.findIndex((entry) => entry.injury === lead?.injury) + 1

			return [{ key: 'lead', focus, slugs: [lead.injury.slug], numbers: [number] }]
		}

		const byKey = new Map<string, Mark>()

		for (const [i, injury] of open.zone.injuries.filter(matches).entries()) {
			const focus = injuryFocus(open.zone, open.index, injury.slug)
			const key = focus.position.map((v) => v.toFixed(3)).join()
			const mark = byKey.get(key)

			if (mark) {
				mark.slugs.push(injury.slug)
				mark.numbers.push(i + 1)
			} else byKey.set(key, { key, focus, slugs: [injury.slug], numbers: [i + 1] })
		}

		return [...byKey.values()]
	})
	let markEls = $state<HTMLSpanElement[]>([])

	// raw: иначе Svelte обернёт точку в прокси и сравнение hovered === spot всегда ложно
	let hovered = $state.raw<Spot | null>(null)

	/** Раскрытая зона. `side` -- где стоит список: в свободной от зоны половине экрана. */
	let open = $state.raw<{ zone: Zone; index: number; side: 'left' | 'right' | 'bottom' } | null>(null)
	let article = $state.raw<Injury | null>(null)
	let articleStatus = $state<'loading' | 'ready' | 'error'>('loading')
	let articleBody = $state<HTMLDivElement>()
	let readerElement = $state<HTMLElement>()
	let progressBar = $state<HTMLElement>()
	let stopReading: (() => void) | undefined
	let sceneHidden = $state(false)
	let loadToken = 0
	let sleepTimer: ReturnType<typeof setTimeout> | undefined

	/**
	 * Адрес -- источник правды, три уровня: сцена (без хеша), зона `#zone=knee:0`, статья
	 * `#meniscus-tear`. "Назад" и системная кнопка браузера поднимаются на уровень вверх.
	 * Записи выше `baseLevel` положили в историю мы сами, ниже -- пришли со ссылкой.
	 */
	type Place = { level: 0 } | { level: 1; zone: Zone; index: number } | { level: 2; zone: Zone; injury: Injury }

	let baseLevel = 0

	function zoneHash(zone: Zone, index: number) {
		return `#zone=${zone.slug}:${index}`
	}

	function parseHash(): Place {
		const hash = decodeURIComponent(location.hash.slice(1))
		const zoneMatch = hash.match(/^zone=([\w-]+):(\d)$/)

		if (zoneMatch) {
			const zone = [...zones, whole].find((z) => z.slug === zoneMatch[1])
			const index = Number(zoneMatch[2])

			if (zone && zone.points[index]) return { level: 1, zone, index }
		}

		for (const zone of [...zones, whole]) {
			const injury = zone.injuries.find((i) => i.slug === hash)

			if (injury) return { level: 2, zone, injury }
		}

		return { level: 0 }
	}

	// Текущий шаг -- на <html> и событием: по нему Telegram показывает или прячет свою кнопку «назад»
	$effect(() => {
		// У сцены движения есть уровень выше -- главная, туда ведёт «назад» Telegram
		document.documentElement.dataset.step = article
			? 'article'
			: open
				? 'zone'
				: movementPage
					? 'movement'
					: 'scene'

		window.dispatchEvent(new Event(STEP_EVENT))
	})

	/** Привести экран к адресу: открыть или закрыть зону и статью. */
	function sync() {
		const place = parseHash()

		if (place.level === 0) {
			hideArticle()
			closeZone()

			return
		}

		if (place.level === 1) {
			hideArticle()
			showZone(place.zone, place.index)

			return
		}

		// Под статьёй держим её зону раскрытой: "Назад" вернёт к тому же списку и кадру. На странице
		// движения статью открывают из его списка, и "Назад" ведёт к нему, а не в зону
		if (open?.zone !== place.zone && !movementPage) showZone(place.zone, 0)

		showArticle(place.injury)
	}

	function openZone(zone: Zone, index: number) {
		history.pushState(null, '', zoneHash(zone, index))
		showZone(zone, index)
	}

	function openArticle(injury: Injury) {
		history.pushState(null, '', `#${injury.slug}`)
		showArticle(injury)
	}

	/** На уровень вверх: через history.back(), если запись наша, иначе заменой адреса. */
	function up() {
		const place = parseHash()
		const level = place.level

		// Выше сцены движения -- главная: сюда приходит только «назад» Telegram
		if (level === 0) {
			if (movementPage) location.assign('/')

			return
		}

		if (level > baseLevel) {
			history.back()

			return
		}

		// Зону берём из адреса статьи: модель могла ещё не загрузиться и не раскрыть её
		const parent =
			place.level === 2 && (!movementPage || open?.zone === place.zone)
				? zoneHash(place.zone, open?.zone === place.zone ? open.index : 0)
				: location.pathname + location.search

		history.replaceState(null, '', parent)
		baseLevel = level - 1
		sync()
	}

	/** Значок «О справочнике» у названия сайта: подсказка мышью и с клавиатуры, тап просто ведёт на about. */
	let aboutLink = $state<HTMLAnchorElement>()
	let aboutTip = $state<HTMLElement>()

	$effect(() => {
		if (aboutLink && aboutTip)
			return attachTip(aboutLink, aboutTip, { column: aboutLink.closest('.site-header') ?? aboutLink })
	})

	onMount(() => {
		// Щипок трекпада (wheel с ctrlKey) и жесты Safari над сценой масштабируют модель, а не
		// страницу: иначе вне канваса и у предела зума начинала расти вся вкладка
		const stopPageZoom = (event: Event) => {
			if (!(event instanceof WheelEvent) || event.ctrlKey) event.preventDefault()

			// Точки зон -- кнопки поверх канваса: колесо над ними тоже зумит модель
			if (event instanceof WheelEvent && (event.target as Element).closest('.body3d__spot'))
				canvas.dispatchEvent(new WheelEvent('wheel', event))
		}

		for (const type of ['wheel', 'gesturestart', 'gesturechange'])
			wrap.addEventListener(type, stopPageZoom, { passive: false })

		// Ссылка «/?region=knee» со страницы статьи открывает список зоны
		const region = new URLSearchParams(location.search).get('region')
		const regionZone = allZones.find((zone) => zone.slug === region)

		if (regionZone && !location.hash)
			history.replaceState(null, '', `${location.pathname}${zoneHash(regionZone, 0)}`)

		baseLevel = parseHash().level

		// Постер -- только для общего плана: зона или статья по адресу начинаются с другого кадра
		if (!location.hash) {
			placePoster()
			window.addEventListener('resize', placePoster)
		}

		sync()
		window.addEventListener('popstate', sync)
		// Кнопка «назад» Telegram в Mini App поднимает на шаг так же, как своя «Назад»
		window.addEventListener(BACK_EVENT, up)

		let disposed = false
		let frames = 0
		let fpsFrom = performance.now()
		// Под автотестом (axe, проверка страниц) сцену не запускаем: в CI её рисует программный WebGL,
		// и страница с ней занимает у axe десятки секунд. Остаётся постер и вся разметка.
		// `?scene` включает сцену и под автотестом, рендер постера (`?poster`) её требует
		const automated = navigator.webdriver && !posterMode && !new URLSearchParams(location.search).has('scene')
		const ready = (automated ? new Promise<never>(() => {}) : import('#frontend/scene/body-scene.ts')).then(
			async ({ createBodyScene }) => {
				const scene = await createBodyScene(canvas, modelUrl)

				if (disposed) return scene.dispose()

				body = scene
				scene.resize()

				scene.onFrame = () => {
					placeSpots()

					// Первый кадр с готовой камерой: точки уже на местах, можно показывать
					if (status === 'ready' && !live) {
						live = true

						// Рендер постера (scripts/poster): фигура замирает в стартовом кадре
						if (posterMode) {
							scene.controls.autoRotate = false
							Object.assign(window, { posterBounds: scene.bounds })
						}

						setTimeout(() => (posterShown = false), 400)
					}

					if (showFps) {
						frames++
						const now = performance.now()

						if (now - fpsFrom > 500) {
							fps = Math.round((frames * 1000) / (now - fpsFrom))
							frames = 0
							fpsFrom = now
						}
					}
				}

				status = 'ready'
				// Адрес мог открыть зону или статью до того, как модель загрузилась
				sync()
				focusOpen()
				homeFrame(true)

				if (sceneHidden) scene.pause(true)
			},
		)

		ready.catch((error) => {
			console.error(error)
			status = 'error'
		})

		const resizer = new ResizeObserver(() => {
			body?.resize()
			homeFrame()
		})

		resizer.observe(canvas)
		// Вне экрана и под статьёй сцена не рисует, чтобы не греть телефон
		const visibility = new IntersectionObserver(([entry]) => body?.pause(!entry.isIntersecting || sceneHidden))

		visibility.observe(canvas)

		return () => {
			window.removeEventListener('resize', placePoster)

			for (const type of ['wheel', 'gesturestart', 'gesturechange']) wrap.removeEventListener(type, stopPageZoom)

			window.removeEventListener('popstate', sync)
			window.removeEventListener(BACK_EVENT, up)
			clearTimeout(sleepTimer)
			disposed = true
			resizer.disconnect()
			visibility.disconnect()
			body?.dispose()
		}
	})

	function placeSpots() {
		if (!body) return

		for (const [i, spot] of spots.entries()) {
			const point = spot.zone.points[spot.index]
			const p = body.project(point.position)

			spot.x = p.x
			spot.y = p.y
			// Точки, повёрнутые от камеры, прячем: с обратной стороны тела их не нажать по ошибке
			spot.visible = body.facing(point.normal) > 0.05
			const el = spotEls[i]

			if (!el) continue

			el.style.transform = `translate(${p.x}px, ${p.y}px)`
			el.dataset.hidden = String(!spot.visible)
		}

		for (const [i, mark] of marks.entries()) {
			const el = markEls[i]

			if (!el) continue

			const p = body.project(mark.focus.position)

			el.style.transform = `translate(${p.x}px, ${p.y}px)`
			el.dataset.hidden = String(body.facing(mark.focus.normal) < -0.05)
		}
	}

	function nearest(x: number, y: number, radius: number) {
		let best: Spot | null = null
		let bestD = radius

		for (const spot of spots) {
			if (!spot.visible) continue

			const d = Math.hypot(spot.x - x, spot.y - y)

			if (d < bestD) {
				best = spot
				bestD = d
			}
		}

		return best
	}

	/**
	 * Наведение только подсвечивает точку и придерживает автоповорот, чтобы цель не уезжала
	 * из-под курсора. Зона раскрывается лишь по клику, тапу или Enter на точке.
	 */
	function hover(spot: Spot | null) {
		if (open || spot === hovered) return

		hovered = spot
		tintZone(spot?.zone ?? null)

		if (body) body.controls.autoRotate = !spot

		// Вероятно, зону сейчас откроют: её детальный кусок начинаем грузить заранее
		if (body && spot) body.prefetchDetail(spot.zone.slug, spot.zone.points[spot.index].position)
	}

	/**
	 * Раскрыть зону: камера облетает к её ракурсу, а список встаёт вплотную к зоне с внешней
	 * стороны тела -- у левой зоны справа, у правой слева, -- чтобы не закрывать фигуру.
	 * Зона у центра экрана, колонка начинается сразу за центром. На узком экране сбоку места
	 * нет: зона уходит наверх, список -- в нижнюю половину.
	 */
	function showZone(zone: Zone, index: number) {
		if (open?.zone === zone && open.index === index) return

		const side = wrap.clientWidth < 700 ? 'bottom' : zone.points[index].position[0] >= 0 ? 'right' : 'left'

		hovered = null
		lead = null
		setHighlight(null)
		clearTimeout(previewTimer)
		clearAccent()
		open = { zone, index, side }
		focusOpen()
	}

	/**
	 * Камера к раскрытой зоне, а при акценте -- ещё ближе, к месту травмы. Растворение остаётся
	 * на всю зону. Отдельно от `showZone`: список работает и до загрузки модели, и без WebGL.
	 */
	function focusOpen(spring = false) {
		if (!body || !open) return

		const point = open.zone.points[open.index]
		// Точка зоны -- ближе к списку, а не в середину свободной половины: зона на внешнем краю
		// тела, туловище уходит от неё в свободную половину и при середине не помещалось в экран.
		// Сдвигается окно камеры, а не модель: фигура вертится вокруг своей оси
		// Но и не вплотную: срез плеча при 0,1 заходил под размытую подложку списка
		const half = 0.19 + 8 / wrap.clientWidth
		const at = open.side === 'bottom' ? { x: 0, y: 0.2 } : { x: open.side === 'left' ? half : -half, y: 0 }
		// «Всё тело» на телефоне мельче: между шапкой и шторкой должна уместиться почти вся фигура
		const zoom = open.zone === whole && open.side === 'bottom' ? 0.6 : clamp(0.3 / open.zone.radius, 1, 2.4)

		const injury = accent ? injuryFocus(open.zone, open.index, accent.slug) : null

		body.frame(0, 0)
		// Место травмы бывает у края зоны или за ним (широчайшая, задняя поверхность бедра):
		// проём того же размера переезжает к нему: под точкой видно, на что она указывает
		// В зоне растворяется только кожа, видны мышцы. Травма глубже мышц (связка, мениск, диск,
		// нерв) раскрывает их малой сферой у места травмы, мышечная -- подсвечивает свои мышцы
		const layer = accent ? injuryLayer(accent.slug) : null

		body.dissolve(
			injury?.position ?? point.position,
			open.zone.radius,
			layer?.depth,
			layer?.peel,
			open.zone.slug === 'hip-groin',
		)

		body.highlight(layer?.depth === 'muscle' ? (layer.muscles ?? null) : null)
		// Связки, мениски, сосуды и нервы зоны -- отдельным куском, только когда зона открыта
		body.showDetail(open.zone === whole ? null : open.zone.slug, point.position, open.zone.radius)
		// Крутить и зумить можно и в раскрытой зоне: ракурс зоны -- лишь начальный кадр
		body.controls.autoRotate = false
		body.controls.enableZoom = true

		// При reduced motion камера не ездит за строками: акцент только на маркере и проёме
		const target = reduceMotion ? null : injury

		// На телефоне зона над списком и под шапкой: ближе 3,2 она уже заезжает под заголовок
		const maxZoom = open.side === 'bottom' ? 3.2 : 4.6

		if (target) body.focus(target.position, Math.min(zoom * target.zoom, maxZoom), at, target.view, true)
		else body.focus(point.position, zoom, at, point.view, spring)
	}

	/**
	 * Акцент на травме. Маркер откликается сразу, камера -- с короткой задержкой: курсор,
	 * проходящий по строкам, не дёргает её от каждой.
	 */
	function setAccent(injury: Injury | null) {
		if (!open || accent === injury) return

		accent = injury
		clearTimeout(accentTimer)
		accentTimer = setTimeout(() => focusOpen(true), injury ? 90 : 160)
	}

	function clearAccent() {
		accent = null
		clearTimeout(accentTimer)
		clearTimeout(scrollTimer)
	}

	/** Тач: ховера нет, акцент получает строка у центра видимой части списка, когда скролл затих. */
	function onListScroll(event: Event) {
		if (!noHover) return

		const list = event.currentTarget as HTMLElement

		clearTimeout(scrollTimer)

		scrollTimer = setTimeout(() => {
			const box = list.getBoundingClientRect()
			const middle = box.top + box.height * 0.4
			let best: HTMLElement | undefined
			let bestD = Infinity

			for (const item of list.querySelectorAll<HTMLElement>('[data-slug]')) {
				const r = item.getBoundingClientRect()
				const d = Math.abs(r.top + r.height / 2 - middle)

				if (d < bestD) {
					best = item
					bestD = d
				}
			}

			const slug = best?.dataset.slug

			if (open) setAccent(open.zone.injuries.find((i) => i.slug === slug) ?? null)
			else previewInjury(movementInjuries.find((entry) => entry.injury.slug === slug) ?? null, false)
		}, 180)
	}

	function closeZone() {
		if (!open) return

		open = null
		hovered = null
		clearAccent()

		if (!body) return

		body.dissolve(null)
		body.highlight(null)
		body.showDetail(null)
		body.focus(null)
		body.controls.enabled = true
		body.controls.autoRotate = true
		homeFrame()
	}

	/** Кадр главной: фигура правее индекса, на телефоне -- выше нижней панели. */
	function homeFrame(instant = false) {
		if (!body || open) return

		const { x, y, s } = posterMode ? POSTER_SHIFT : homeShift(wrap.clientWidth)

		body.frame(x, y, s, instant)
		// На телефоне общий план -- карта зон над панелью: щипок увеличивал фигуру под шапку и
		// панель. Крупный план даёт раскрытая зона
		body.controls.enableZoom = wrap.clientWidth >= 700
	}

	/** Статья на весь экран: сцена гаснет, потом рендер встаёт целиком, а не рисует под текстом. */
	function showArticle(injury: Injury) {
		if (article?.slug === injury.slug) return

		article = injury
		// Камера возвращается к кадру зоны, пока сцена скрыта: после статьи акцент начнётся заново
		accent = null
		focusOpen()
		sceneHidden = true
		clearTimeout(sleepTimer)
		sleepTimer = setTimeout(() => sceneHidden && body?.pause(true), reduceMotion ? 0 : SCENE_FADE_MS)
		void loadArticle(injury.slug)
	}

	function hideArticle() {
		if (!article) return

		article = null
		loadToken++
		stopReading?.()
		stopReading = undefined
		sceneHidden = false
		clearTimeout(sleepTimer)
		body?.pause(false)
	}

	async function loadArticle(slug: string) {
		const token = ++loadToken

		articleStatus = 'loading'

		try {
			const response = await fetch(`/injuries/${slug}/`)

			if (!response.ok) throw new Error(`HTTP ${response.status}`)

			// Разбираем только main: стили из head страницы статьи Chrome сверяет с CSP этой
			// страницы даже в инертном документе DOMParser и сыплет ошибками в консоль
			const html = await response.text()
			const from = html.indexOf('<main')
			const to = html.lastIndexOf('</main>')

			if (from < 0 || to < from) throw new Error('no <main> in article page')

			const doc = new DOMParser().parseFromString(html.slice(from, to + '</main>'.length), 'text/html')
			const main = doc.querySelector('main')

			if (!main) throw new Error('no <main> in article page')

			// Метка зоны и плашка черновика в полноэкранной статье лишние
			main.querySelector('.article__meta')?.remove()
			await tick()

			if (token !== loadToken || !articleBody || !readerElement) return

			// Второй main на странице не нужен: те же классы и содержимое, но в div
			const root = document.createElement('div')

			root.className = main.className
			root.append(...[...main.childNodes].map((node) => document.importNode(node, true)))
			stopReading?.()
			articleBody.replaceChildren(root)
			readerElement.scrollTo(0, 0)
			stopReading = initReading(root, readerElement, progressBar ?? null)
			articleStatus = 'ready'
			await tick()
			// Фокус -- на статью, а не на стрелку: скринридер начинает с неё, а у кнопки нет
			// рамки фокуса, которую браузер рисовал при программном переводе
			readerElement.focus({ preventScroll: true })
		} catch (error) {
			if (token !== loadToken) return

			console.error(error)
			articleStatus = 'error'
		}
	}

	/**
	 * Статья проявляется со сдвигом снизу, при reduced motion -- только прозрачностью.
	 * Через `tick`, а не `css`: `css` вставляет тег стилей, а CSP сайта такое блокирует.
	 */
	function fadeUp(node: HTMLElement) {
		return {
			duration: reduceMotion ? 250 : 550,
			delay: reduceMotion ? 0 : 120,
			// Близко к cubic-bezier(0.25, 1, 0.5, 1) из CSS: быстрый старт, мягкая посадка
			easing: (t: number) => 1 - (1 - t) ** 4,
			tick: (t: number) => {
				node.style.opacity = String(t)
				node.style.transform = reduceMotion || t === 1 ? '' : `translateY(${(1 - t) * 24}px)`
			},
		}
	}

	function clamp(v: number, min: number, max: number) {
		return Math.max(min, Math.min(max, v))
	}

	function local(event: PointerEvent) {
		const rect = wrap.getBoundingClientRect()

		return { x: event.clientX - rect.left, y: event.clientY - rect.top }
	}

	function onPointerMove(event: PointerEvent) {
		if (event.pointerType !== 'mouse' || status !== 'ready' || article || open || event.buttons) return

		const { x, y } = local(event)

		hover(nearest(x, y, PICK_PX))
	}

	let downAt: { x: number; y: number } | null = null

	function onPointerDown(event: PointerEvent) {
		downAt = local(event)
	}

	function onPointerUp(event: PointerEvent) {
		if (!downAt || status !== 'ready' || article) return

		const { x, y } = local(event)
		const moved = Math.hypot(x - downAt.x, y - downAt.y) > 8

		downAt = null

		if (moved) return

		// Список ловит клики сам, клик по сцене мимо него -- на уровень вверх
		if (open) {
			if (!(event.target as Element).closest('.zone')) up()

			return
		}

		if (event.target !== canvas) return

		const spot = nearest(x, y, event.pointerType === 'mouse' ? PICK_PX : PICK_PX * 1.3)

		if (spot) openZone(spot.zone, spot.index)
	}

	function onKey(event: KeyboardEvent) {
		if (event.key === 'Escape' && (article || open)) up()
	}

	/** Ссылка в списке открывает статью на месте; с модификаторами -- как обычная ссылка. */
	function onItemClick(event: MouseEvent, injury: Injury) {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

		event.preventDefault()
		openArticle(injury)
	}
</script>

<svelte:window onkeydown={onKey} />

<!-- Строка травмы: в раскрытой зоне и в списке движения. `zoneLabel` -- зона перед описанием,
     `onAccent` -- наведение или фокус на строке; `pointer` отличает мышь от клавиатуры -->
{#snippet injuryRow(
	injury: Injury,
	i: number,
	active: boolean,
	zoneLabel: string,
	onAccent: (on: boolean, pointer: boolean) => void,
)}
	<!-- Без другого названия в скобках: его показывает статья, а поиск ищет по полному -->
	{@const [head, tail] = splitLastWord(splitTitle(injury.title).name)}
	<li class="zone__row" style:--i={i}>
		<a
			class="zone__item"
			class:zone__item--current={active}
			href="/injuries/{injury.slug}/"
			data-slug={injury.slug}
			onclick={(event) => onItemClick(event, injury)}
			onpointerenter={(event) => event.pointerType !== 'touch' && onAccent(true, true)}
			onpointerleave={(event) => event.pointerType !== 'touch' && onAccent(false, true)}
			onfocus={() => onAccent(true, false)}
			onblur={() => onAccent(false, false)}
		>
			<span class="zone__num" aria-hidden="true">{i + 1}</span>
			<span class="zone__name">
				{head}<span class="zone__tail">{tail}<span class="zone__arrow" aria-hidden="true">→</span></span>
			</span>
			<span class="zone__summary">
				{#if zoneLabel}<span class="zone__where">{zoneLabel}</span> ·
				{/if}
				{#if injury.rare}<span class="zone__rare"
						><span class="zone__rare-icon" aria-hidden="true">{@html Diamond}</span>Редко</span
					>
					·
				{/if}
				{injury.summary}
			</span>
		</a>
	</li>
{/snippet}

<div
	class="body3d"
	class:body3d--open={open}
	class:body3d--hidden={sceneHidden}
	class:body3d--hot={hovered && !open}
	class:body3d--movement={movementPage}
	class:body3d--live={live}
	bind:this={wrap}
	onpointermove={onPointerMove}
	onpointerdown={onPointerDown}
	onpointerup={onPointerUp}
	onpointerleave={() => !open && hover(null)}
	role="presentation"
>
	<canvas class="body3d__canvas" bind:this={canvas} aria-label="Фигура человека: выберите зону тела"></canvas>

	<!-- Пока грузится модель, на месте фигуры -- её постер; с первым кадром он уступает канвасу -->
	{#if posterShown && posterRect && status !== 'error'}
		<picture class="body3d__poster" class:body3d__poster--out={live} aria-hidden="true">
			<source srcset="/model/poster.webp" type="image/webp" />
			<img
				class="body3d__poster-image"
				src="/model/poster.png"
				alt=""
				style:left="{posterRect.left}px"
				style:top="{posterRect.top}px"
				style:width="{posterRect.width}px"
				style:height="{posterRect.height}px"
			/>
		</picture>
	{/if}

	{#if status === 'error' && !open}
		<p class="body3d__status">Не получилось показать 3D: ваш браузер не поддерживает WebGL.</p>
	{/if}

	{#each spots as spot, i (i)}
		<button
			class="body3d__spot"
			class:body3d__spot--hover={!lead && (hovered === spot || highlighted === spot.zone)}
			class:body3d__spot--named={!lead && hovered === spot}
			class:body3d__spot--dim={lead || (highlighted && highlighted !== whole && highlighted !== spot.zone)}
			class:body3d__spot--key={movementPage && counts.get(spot.zone)}
			class:body3d__spot--empty={counts.get(spot.zone) === 0}
			bind:this={spotEls[i]}
			type="button"
			style:--i={i}
			hidden={!live}
			aria-label="{spot.zone.label}: {counts.get(spot.zone)} {plural(counts.get(spot.zone) ?? 0)}"
			onclick={() => openZone(spot.zone, spot.index)}
			onfocus={() => !noHover && hover(spot)}
		>
			<span class="body3d__spot-dot"></span>
			<span class="body3d__spot-count" aria-hidden="true"
				>{counts.get(spot.zone)}<span class="body3d__spot-more">
					{plural(counts.get(spot.zone) ?? 0)} · {spot.zone.label}</span
				></span
			>
		</button>
	{/each}

	{#each marks as mark, i (mark.key)}
		<span
			class="body3d__mark"
			class:body3d__mark--accent={mark.key === 'lead' || (accent && mark.slugs.includes(accent.slug))}
			class:body3d__mark--dim={accent && !mark.slugs.includes(accent.slug)}
			bind:this={markEls[i]}
			hidden={!live}
			aria-hidden="true"
		>
			<span class="body3d__mark-dot">{mark.numbers.join(',')}</span>
		</span>
	{/each}

	<!-- Шапка сцены -- та же, что у статей: на месте «‹» логотип с «i», ссылка на about (в Mini App
	     это единственный путь туда). Справа в той же строке -- переключатель темы из base.astro -->
	<SiteHeader floating>
		<a
			class="index__brand-row logo-host"
			class:index__brand-row--away={open?.side === 'bottom'}
			href="/about/"
			aria-label="Wodcare, о справочнике"
			aria-describedby="about-tip"
			bind:this={aboutLink}
		>
			<Logo />
			<span class="index__about" aria-hidden="true">{@html INFO_DOT}</span>
		</a>
		<span class="tip tip--compact" id="about-tip" popover="auto" bind:this={aboutTip}
			>Источники и как сделан справочник</span
		>
	</SiteHeader>

	<!-- Индекс главной: поиск, фильтры и зоны. Наведение на зону подсвечивает её точки на модели -->
	{#if movementPage}
		{@const total = movementInjuries.length}
		<aside class="index" class:index--away={open} aria-label="Травмы движения">
			<header class="index__head">
				<!-- В Mini App путь на главную -- системная кнопка «назад» Telegram -->
				<a class="index__home" href="/"><span class="index__home-arrow" aria-hidden="true">←</span>Все травмы</a
				>
				<p class="index__title" aria-hidden="true">{movementPage.title}</p>
				<p class="index__sub">
					<span lang="en">{movementPage.titleEn}</span>
					{#if total}<span class="index__total">{total} {plural(total)}</span>{/if}
				</p>
			</header>
			{#if total}
				<ul class="zone__list index__injuries" onscroll={onListScroll}>
					{#each movementInjuries as entry, i (entry.injury.slug)}
						{@render injuryRow(
							entry.injury,
							i,
							lead?.injury === entry.injury,
							entry.zone.label,
							(on, pointer) => previewInjury(on ? entry : null, pointer),
						)}
					{/each}
				</ul>
			{:else}
				<div class="index__none">
					<p class="index__none-title">Статей пока нет</p>
					<p class="index__none-text">
						Про травмы на этом движении ещё не написали. Остальные травмы — <a
							class="index__none-link"
							href="/">на главной</a
						>.
					</p>
				</div>
			{/if}
		</aside>
	{:else}
		<aside class="index" class:index--away={open} aria-label="Поиск и зоны тела">
			<header class="index__head">
				<p class="index__title" aria-hidden="true">Травмы в кроссфите</p>
			</header>
			<SearchField bind:value={query} placeholder="Травма или часть тела" label="Поиск по травмам" />
			<div class="index__filters">
				<div class="index__freq" role="group" aria-label="Частота">
					{#each FREQUENCIES as [value, label, icon] (value)}
						<button
							class="index__chip index__chip--{value}"
							type="button"
							aria-pressed={frequency === value}
							onclick={() => (frequency = value)}
							>{#if icon}<span class="index__chip-icon" aria-hidden="true">{@html icon}</span>{/if}<span
								class="index__chip-label"
								data-label={label}>{label}</span
							></button
						>
					{/each}
				</div>
				<MovementSelect options={movements} bind:value={movement} label="Движение" empty="любое" />
			</div>
			{#if query.trim()}
				<ul class="index__results" aria-live="polite">
					{#each results as { zone, injury } (injury.slug)}
						{@const { name, alias } = splitTitle(injury.title)}
						<li>
							<a
								class="index__result"
								href="/injuries/{injury.slug}/"
								onclick={(event) => onItemClick(event, injury)}
							>
								<span class="index__result-title">{name}</span>
								<span class="index__result-zone">{alias ? `${zone.label} · ${alias}` : zone.label}</span
								>
							</a>
						</li>
					{:else}
						<li class="index__empty">Ничего не нашлось</li>
					{/each}
				</ul>
			{:else}
				<ul class="index__zones">
					{#each allZones as zone (zone.slug)}
						{@const count = counts.get(zone) ?? 0}
						<li class="index__zone-row">
							<button
								class="index__zone"
								type="button"
								disabled={count === 0}
								onclick={() => openZone(zone, 0)}
								onpointerenter={(event) => event.pointerType !== 'touch' && previewZone(zone)}
								onpointerleave={(event) => event.pointerType !== 'touch' && previewZone(null)}
								onfocus={() => previewZone(zone, false)}
								onblur={() => previewZone(null, false)}
							>
								<span class="index__count">{count}</span>
								<span class="index__zone-label">{zone.label}</span>
								<!-- «Всё тело» -- такая же строка, человечек после названия тихо помечает её -->
								{#if zone === whole}<span class="index__icon" aria-hidden="true"
										>{@html PersonStanding}</span
									>{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</aside>
	{/if}

	{#if open}
		{@const total = open.zone.injuries.length}
		{@const shown = open.zone.injuries.filter(matches)}
		<section class="zone zone--{open.side}" aria-label={open.zone.label}>
			<header class="zone__head">
				<div class="zone__heading">
					<button class="zone__back" type="button" aria-label="Назад" title="Назад" onclick={up}
						><span class="zone__back-icon" aria-hidden="true">{@html ChevronLeft}</span></button
					>
					<h2 class="zone__title" style:--chars={open.zone.label.length}>{open.zone.label}</h2>
				</div>
				{#if filtering}
					<div class="zone__filters">
						<button
							class="zone__reset"
							type="button"
							aria-label="Сбросить фильтры"
							title="Сбросить фильтры"
							onclick={resetFilters}
							><span class="zone__reset-icon" aria-hidden="true">{@html FunnelX}</span></button
						>
						<p class="zone__filter">{shown.length} из {total} {plural(total)}</p>
						<ul class="zone__tags" aria-label="Фильтры">
							{#each activeFilters as filter (filter.key)}
								<li class="zone__tag">
									<span
										class="zone__tag-icon zone__tag-icon--{filter.tone || 'plain'}"
										aria-hidden="true">{@html filter.icon}</span
									>{filter.label}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</header>
			<ul class="zone__list" onscroll={onListScroll}>
				{#each shown as injury, i (injury.slug)}
					{@render injuryRow(injury, i, accent === injury, '', (on) => setAccent(on ? injury : null))}
				{/each}
			</ul>
		</section>
	{/if}

	<!-- Подвал на десктопе -- строкой внизу сцены по сетке шапки: от левой колонки до линии
	     значка темы. На телефоне на главной его нет: место под шапкой отдано индексу -->
	{#if footer}<div class="scene-footer">{@render footer()}</div>{/if}

	{#if showFps}
		<output class="body3d__fps">{fps} fps</output>
	{/if}
</div>

{#if article}
	<article
		class="reader"
		tabindex="-1"
		bind:this={readerElement}
		transition:fadeUp
		aria-label={article.title}
		aria-busy={articleStatus === 'loading'}
	>
		<div class="reader__progress" aria-hidden="true">
			<span class="reader__progress-bar" bind:this={progressBar}></span>
		</div>
		<SiteHeader>
			<button class="reader__back" type="button" aria-label="Назад" title="Назад" onclick={up}
				><span class="reader__back-icon" aria-hidden="true">{@html ChevronLeft}</span></button
			>
			<!-- Маленький заголовок проявляется по мере прокрутки, стили в styles/article.css -->
			<p class="article-bar__title" aria-hidden="true">{splitTitle(article.title).name}</p>
		</SiteHeader>
		{#if articleStatus === 'loading'}
			<p class="reader__status">Загружаем статью…</p>
		{:else if articleStatus === 'error'}
			<p class="reader__status">
				Не получилось загрузить статью. <a href="/injuries/{article.slug}/">Открыть отдельно</a>
			</p>
		{/if}
		<div class="reader__body" bind:this={articleBody} hidden={articleStatus !== 'ready'}></div>
		{#if footer && articleStatus === 'ready'}{@render footer()}{/if}
	</article>
{/if}

<style>
	/* Длина нижнего затухания списков на главной; регистрация нужна, чтобы её можно было
	   плавно анимировать и чтобы без анимации она была нулём */
	@property --zones-fade {
		syntax: '<length>';
		inherits: false;
		initial-value: 0px;
	}

	@keyframes zones-fade {
		0%,
		85% {
			--zones-fade: 56px;
		}

		100% {
			--zones-fade: 0px;
		}
	}

	/* Токены (--a-*) объявлены на body в pages/index.astro, тёмная тема -- там же.
	   Язык страницы: ни карточек, ни рамок, ни разделителей -- только прозрачность,
	   сдвиги и края, растворённые градиентом */
	.body3d {
		touch-action: pan-y;
		user-select: none;

		position: fixed;
		inset: 0;
		overflow: hidden;
		background: radial-gradient(ellipse 60% 70% at 50% 45%, var(--a-glow) 0%, var(--a-bg) 70%);
		transition:
			opacity 0.45s var(--a-ease),
			visibility 0s;

		/* Под статьёй сцену не видно вовсе: гаснет, потом скрывается, рендер стоит */
		&--hidden {
			visibility: hidden;
			opacity: 0;
			transition:
				opacity 0.45s var(--a-ease),
				visibility 0s 0.45s;
		}

		&__canvas {
			cursor: grab;
			display: block;
			width: 100%;
			height: 100%;
			opacity: 0;
			transition: opacity 0.3s var(--a-ease);

			&:active {
				cursor: grabbing;
			}
		}

		/* Курсор рядом с точкой зоны: клик раскроет её */
		&--hot &__canvas {
			cursor: pointer;
		}

		/* --- Загрузка: силуэт, потом фигура и каскадом точки --- */
		&--live &__canvas {
			opacity: 1;
		}

		/* У точек и меток свой display: без этого атрибут hidden их не прятал */
		&__spot[hidden],
		&__mark[hidden] {
			display: none;
		}

		/* Постер стоит поверх канваса, пока тот прозрачный, и гаснет вместе с его проявлением */
		&__poster {
			pointer-events: none;
			position: absolute;
			inset: 0;
			transition: opacity 0.3s var(--a-ease);

			&--out {
				opacity: 0;
			}
		}

		&__poster-image {
			position: absolute;
			max-width: none;
		}

		&--open &__spot {
			pointer-events: none;
			opacity: 0;
		}

		/* Загрузка или ошибка WebGL -- там, где стоит фигура: справа от индекса, на телефоне над ним */
		&__status {
			position: absolute;
			inset: 0 0 0 38vw;
			display: grid;
			place-items: center;
			margin: 0;
			padding: 24px;
			color: var(--a-fg2);
			text-align: center;

			@media (width < 700px) {
				inset: 0 0 56dvh;
			}
		}

		&__spot {
			cursor: pointer;
			position: absolute;
			top: 0;
			left: 0;
			display: grid;
			place-items: center;
			width: 40px;
			height: 40px;
			margin: -20px 0 0 -20px;
			padding: 0;
			border: 0;
			background: none;
			transition: opacity 0.4s var(--a-ease);
			/* Появляются каскадом, когда фигура уже на месте */
			animation: spot-in 0.5s var(--a-ease) calc(300ms + var(--i, 0) * 40ms) both;

			/* Навели на другую зону в индексе: эта точка отступает на второй план.
			   Выше правил скрытия, чтобы скрытая точка не проступала */
			&--dim {
				opacity: 0.25;
			}

			&:global([data-hidden='true']) {
				pointer-events: none;
				opacity: 0;
			}

			/* Под фильтр в зоне ничего не попало: точка гаснет и не нажимается */
			&--empty {
				pointer-events: none;
				opacity: 0;
			}

			/* На странице движения зоны без его травм не пропадают, а стоят приглушёнными:
			   видно, что остальное тело это движение почти не трогает */
			.body3d--movement &--empty:not(:global([data-hidden='true'])) {
				opacity: 0.22;
			}

			/* Ноль у приглушённой точки -- шум: и так видно, что травм тут нет */
			.body3d--movement &--empty .body3d__spot-count {
				display: none;
			}

			&:focus-visible {
				border-radius: 50%;
				outline: 2px solid var(--a-blue);
				outline-offset: -4px;
			}
		}

		/* Белая точка в тонком синем кольце и мягкий пульс вокруг */
		&__spot-dot {
			position: relative;
			width: 9px;
			height: 9px;
			border-radius: 50%;
			background: #ffffff;
			box-shadow:
				0 0 0 1.5px var(--a-blue),
				0 1px 4px rgb(0 0 0 / 25%);
			transition:
				transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1),
				box-shadow 0.4s var(--a-ease);

			&::after {
				content: '';
				position: absolute;
				inset: -7px;
				border: 1.5px solid var(--a-blue);
				border-radius: 50%;
				opacity: 0;
				animation: spot-pulse 2.4s var(--a-ease) infinite;

				@media (--reduced-motion) {
					animation: none;
				}
			}
		}

		/* Маркеры травм раскрытой зоны: такая же точка, но не кнопка. Строка под курсором
		   увеличивает свой маркер и включает пульс, остальные притушены */
		&__mark {
			pointer-events: none;
			position: absolute;
			top: 0;
			left: 0;
			display: grid;
			place-items: center;
			width: 40px;
			height: 40px;
			margin: -20px 0 0 -20px;
			transition: opacity 0.35s var(--a-ease);
			animation: fade-in 0.5s var(--a-ease) 0.3s both;

			&:global([data-hidden='true']) {
				opacity: 0;
			}

			/* Номера остальных маркеров читаются и рядом с текущим: по ним сверяют список */
			&--dim {
				opacity: 0.6;
			}
		}

		/* Маркер травмы -- кружок с номером строки списка, у общего места -- через запятую */
		&__mark-dot {
			position: relative;
			display: grid;
			place-items: center;
			min-width: 20px;
			height: 20px;
			padding: 0 5px;
			border-radius: 10px;
			font-size: 11px;
			font-weight: 700;
			font-variant-numeric: tabular-nums;
			line-height: 1;
			color: var(--a-blue);
			background: #ffffff;
			box-shadow:
				0 0 0 1.5px var(--a-blue),
				0 1px 4px rgb(0 0 0 / 25%);
			transition:
				transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1),
				color 0.35s var(--a-ease),
				background 0.35s var(--a-ease),
				box-shadow 0.45s var(--a-ease);

			&::after {
				content: '';
				position: absolute;
				inset: -6px;
				border: 1.5px solid var(--a-blue);
				border-radius: 16px;
				opacity: 0;
			}
		}

		&__mark--accent &__mark-dot {
			transform: scale(1.2);
			color: #ffffff;
			background: var(--a-blue);
			box-shadow:
				0 0 0 2px var(--a-blue),
				0 2px 8px rgb(0 0 0 / 25%);

			&::after {
				animation: spot-pulse 1.6s var(--a-ease) infinite;

				@media (--reduced-motion) {
					animation: none;
				}
			}
		}

		&__spot--hover &__spot-dot::after {
			animation-duration: 1.6s;
		}

		/* Зоны травм движения: точка крупнее, пульс чаще -- их видно с первого взгляда */
		&__spot--key &__spot-dot {
			transform: scale(1.35);
			box-shadow:
				0 0 0 2px var(--a-blue),
				0 2px 6px rgb(0 0 0 / 25%);

			&::after {
				animation-duration: 1.6s;
			}
		}

		&__spot--hover &__spot-dot {
			transform: scale(1.6);
			box-shadow:
				0 0 0 3px var(--a-blue),
				0 2px 8px rgb(0 0 0 / 25%);
		}

		/* Сколько травм зоны проходит фильтр -- цифра справа от точки. Цвет один для обеих тем:
		   цифра почти всегда лежит на белой фигуре, а не на фоне. Отступ -- за кольцом точки и
		   её пульсом, а мягкий белый ореол отделяет цифру от подсвеченной голубым кожи */
		&__spot-count {
			pointer-events: none;
			position: absolute;
			top: 50%;
			left: 36px;
			transform: translateY(-50%);
			/* В тёмной теме цифра в светлой таблетке: ореол на тёмном фоне давал серое пятно */
			padding: 0 5px;
			border-radius: 8px;
			font-size: 13px;
			font-weight: 700;
			font-variant-numeric: tabular-nums;
			color: #3a3a3c;
			text-shadow:
				0 0 3px #ffffff,
				0 0 6px #ffffff;
			white-space: nowrap;
			background: var(--a-spot-count-bg);
		}

		/* Сама по себе цифра непонятна: при наведении на точку она раскрывается в «8 травм · Плечо».
		   Только у той точки, что под курсором, а не у всех точек зоны и не от строки списка:
		   иначе подписи двух точек таза ложились друг на друга. Подпись -- поверх соседних точек
		   и на светлой подложке в обеих темах, чтобы их цифры не просвечивали сквозь текст */
		&__spot-more {
			display: none;
			/* Пробел после цифры: перенос строки в разметке Svelte съедает */
			margin-left: 0.3em;
			font-weight: 600;
		}

		&__spot--named {
			z-index: 1;
		}

		&__spot--named &__spot-count {
			background: rgb(255 255 255 / 92%);
		}

		&__spot--named &__spot-more {
			display: inline;
		}

		&__fps {
			position: absolute;
			top: 12px;
			left: 16px;
			font:
				600 12px/1 ui-monospace,
				monospace;
			color: var(--a-fg2);
		}
	}

	/* Индекс главной: колонка слева (на телефоне -- снизу) без подложки. Фон сцены растворяется
	   к фигуре градиентом, когда раскрыта зона, индекс уходит прозрачностью */
	.index {
		position: absolute;
		top: 0;
		bottom: 0;
		/* Левый край -- общая вертикаль каркаса (styles/global.css), как у оглавления статьи */
		left: var(--frame-x);
		display: flex;
		flex-direction: column;
		gap: 20px;
		width: min(380px, 32vw);
		padding-top: calc(var(--theme-toggle-top) + var(--header-row) + 16px);
		/* Снизу место под строку подвала сцены (.scene-footer): колонка на неё не наезжает */
		padding-bottom: 56px;
		transition:
			opacity 0.45s var(--a-ease),
			transform 0.45s var(--a-ease);

		@media (width < 700px) {
			top: auto;
			right: 0;
			left: 0;
			gap: 10px;
			width: auto;
			max-height: 56dvh;
			padding: 20px 20px calc(max(16px, env(safe-area-inset-bottom)) + var(--tg-bottom));
		}

		@media (width < 700px) {
			&__results {
				max-height: 26dvh;
				padding-bottom: 32px;
			}
		}

		/* На странице движения камера подъезжает к травме, и фигура заходит под список:
		   подложка индекса ложится поверх модели и растворяет её у строк */
		.body3d--movement & {
			z-index: 0;

			@media (width < 700px) {
				&::before {
					inset: -96px 0 0;
					background: linear-gradient(to top, var(--a-bg) calc(100% - 96px), transparent);
				}
			}
		}

		&::before {
			pointer-events: none;
			content: '';
			position: absolute;
			z-index: -1;
			top: 0;
			right: -8vw;
			bottom: 0;
			left: -50vw;
			background: linear-gradient(to right, var(--a-bg) 60%, transparent);

			/* Переопределения для телефона -- здесь, а не в блоке шторки выше: там их перебивало это
			   правило, и шторка получала боковую подложку с резким верхним краем поперёк ореола */
			@media (width < 700px) {
				inset: -40px 0 0;
				background: linear-gradient(to top, var(--a-bg) 70%, transparent);
			}
		}

		&--away {
			pointer-events: none;
			transform: translateX(-16px);
			opacity: 0;

			@media (width < 700px) {
				transform: translateY(16px);
			}

			@media (--reduced-motion) {
				transform: none;
			}
		}

		&__head {
			display: grid;
			gap: 2px;
		}

		/* Логотип и «i» -- одна ссылка на «О справочнике»: наведение на любую часть красит всё */
		&__brand-row {
			isolation: isolate;
			position: relative;
			display: flex;
			gap: 8px;
			align-items: center;
			justify-self: start;
			text-decoration: none;

			/* Под логотипом фигура: светлое лицо съедало серое «care». Под строкой лёгкая дымка
			   фона с размытием, плашкой с полукруглыми торцами */
			&::after {
				pointer-events: none;
				content: '';
				position: absolute;
				z-index: -1;
				inset: -8px -16px;
				border-radius: 999px;
				background: color-mix(in srgb, var(--a-bg) 15%, transparent);
				-webkit-backdrop-filter: blur(4px);
				backdrop-filter: blur(4px);

				@media (prefers-reduced-transparency: reduce) {
					backdrop-filter: none;
				}
			}

			&:focus-visible {
				border-radius: 6px;
				outline: 2px solid var(--a-blue);
				outline-offset: 4px;
			}

			/* В раскрытой зоне на телефоне строку шапки занимает стрелка назад с названием зоны */
			&--away {
				pointer-events: none;
				visibility: hidden;
				opacity: 0;
			}
		}

		/* Значок «О справочнике»: та же тихая «i», что у другого названия в статье. Сам 13px,
		   зона нажатия 44 на 44 -- невидимым ::before */
		&__about {
			position: relative;
			display: block;
			flex: none;
			width: 13px;
			height: 13px;
			border-radius: 50%;
			color: color-mix(in srgb, var(--a-fg2) 70%, transparent);
			transition: color 0.3s var(--a-ease);

			&::before {
				content: '';
				position: absolute;
				inset: -15.5px;
			}

			.index__brand-row:hover &,
			.index__brand-row:focus-visible & {
				color: var(--a-blue);
			}

			/* stylelint-disable-next-line selector-max-type -- SVG приходит строкой без класса */
			& :global(svg) {
				display: block;
				width: 100%;
				height: 100%;
			}
		}

		/* Путь со страницы движения на главную -- над заголовком, синей ссылкой со стрелкой */
		&__home {
			display: inline-flex;
			gap: 6px;
			align-items: baseline;
			justify-self: start;
			margin: 14px 0 6px;
			font-size: 17px;
			color: var(--a-blue);
			text-decoration: none;

			@media (width < 700px) {
				margin: 6px 0 2px;
				font-size: 15px;
			}

			:global([data-telegram]) & {
				display: none;
			}

			&:focus-visible {
				border-radius: 4px;
				outline: 2px solid var(--a-blue);
				outline-offset: 3px;
			}
		}

		&__home-arrow {
			transition: transform 0.35s var(--a-ease);
		}

		&__home:hover &__home-arrow {
			transform: translateX(-4px);
		}

		/* Английское название движения серым и число травм бейджем, как счётчик зоны */
		&__sub {
			display: flex;
			flex-wrap: wrap;
			gap: 6px 12px;
			align-items: center;
			margin: 6px 0 0;
			font-size: 19px;
			color: var(--a-fg2);

			@media (width < 700px) {
				margin-top: 2px;
				font-size: 16px;
			}
		}

		&__total {
			padding: 2px 10px;
			border-radius: 999px;
			font-size: 14px;
			font-weight: 600;
			font-variant-numeric: tabular-nums;
			color: var(--a-blue);
			letter-spacing: 0;
			background: color-mix(in srgb, var(--a-blue) 13%, var(--a-bg));
		}

		/* Список травм движения -- те же строки, что в раскрытой зоне, но в колонке индекса */
		/* Сдвиг вверх -- на высоту маски над первой строкой, иначе между шапкой и строками дыра.
		   Двойной класс перебивает отступы строк зоны, объявленные ниже */
		&__injuries.zone__list {
			margin-top: -12px;
			padding-top: 14px;

			@media (width < 700px) {
				margin-top: -22px;
				padding-bottom: 8dvh;
			}
		}

		/* Без статей: тихий текст на месте списка, без карточки и рамки */
		&__none {
			flex: 1;
			animation: fade-in 0.5s var(--a-ease) 0.15s both;
		}

		&__none-title {
			margin: 0 0 6px;
			font-size: 21px;
			font-weight: 600;
			letter-spacing: -0.02em;
		}

		&__none-text {
			max-width: 32ch;
			margin: 0;
			color: var(--a-fg2);
		}

		&__none-link {
			color: var(--a-blue);
			text-decoration: none;

			&:hover {
				text-decoration: underline;
			}
		}

		&__title {
			margin: 0;
			font-size: clamp(30px, 3.4vw, 44px);
			font-weight: 700;
			line-height: 1.08;
			letter-spacing: -0.03em;

			@media (width < 700px) {
				font-size: 26px;
			}
		}

		&__icon {
			display: inline-flex;
			flex: none;
			width: 20px;
			height: 20px;
			color: var(--a-fg2);

			/* SVG иконки приходит строкой из lucide-static, своего класса у него нет */
			/* stylelint-disable-next-line selector-max-type */
			& :global(svg) {
				width: 100%;
				height: 100%;
				stroke-width: 1.75;
			}
		}

		&__filters {
			display: flex;
			flex-wrap: wrap;
			gap: 12px 20px;
			align-items: center;
		}

		/* Частота -- переключатель из трёх положений: общая подложка без рамки, выбранное
		   положение -- залитая таблетка, его видно сразу, а не по жирности шрифта */
		&__freq {
			display: inline-flex;
			gap: 2px;
			padding: 3px;
			border-radius: 999px;
			background: var(--a-fill);
		}

		&__chip {
			--chip: var(--a-fg);

			cursor: pointer;
			display: inline-flex;
			gap: 6px;
			align-items: center;
			padding: 5px 14px;
			border: 0;
			border-radius: 999px;
			font: inherit;
			font-size: 15px;
			color: var(--a-fg2);
			background: transparent;
			transition:
				color 0.3s var(--a-ease),
				background 0.3s var(--a-ease);

			/* Частые и редкие -- каждая в своём цвете: знак в нём всегда, выбранная залита им */
			&--common {
				--chip: var(--common);
			}

			&--rare {
				--chip: var(--rare);
			}

			&[aria-pressed='true'] {
				font-weight: 600;
				color: var(--a-bg);
				background: var(--chip);
			}

			&:hover:not([aria-pressed='true']) {
				color: var(--a-fg);
			}

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: 2px;
			}
		}

		&__chip-icon {
			display: inline-flex;
			width: 11px;
			height: 11px;
			color: var(--chip);

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				width: 100%;
				height: 100%;
				fill: currentcolor;
			}
		}

		&__chip[aria-pressed='true'] &__chip-icon {
			color: inherit;
		}

		/* Выбранная подпись жирнее; невидимая жирная копия заранее держит ширину, чтобы фильтр не прыгал */
		&__chip-label {
			display: inline-flex;
			flex-direction: column;

			&::after {
				pointer-events: none;
				content: attr(data-label);
				user-select: none;
				overflow: hidden;
				height: 0;
				font-weight: 600;
				visibility: hidden;
			}
		}

		/* Зоны и результаты поиска: скроллится только список, края гаснут маской */
		&__zones,
		&__results {
			scrollbar-width: none;
			overflow-y: auto;
			overscroll-behavior: contain;
			flex: 1;
			margin: 0;

			/* Сверху маске хватает нескольких пикселей: строки начинаются в ритме блоков выше, а не
			   через пустую полосу. Нижний отступ маленький, иначе список, который и так влезает,
			   начинает прокручиваться ради пустоты */
			padding: 2px 0 16px;
			list-style: none;
			mask-image: linear-gradient(
				to bottom,
				transparent,
				#000000 6px,
				#000000 calc(100% - var(--zones-fade)),
				transparent
			);
			/* Строки столбцом сами несут поля по 9px: без поправки список отходит от фильтров дальше,
			   чем блоки индекса друг от друга */
			@media (width >= 700px) {
				margin-top: -8px;
			}

			/* Низ гаснет, только пока есть что докрутить: без переполнения таймлайн неактивен и
			   --zones-fade остаётся нулём, в конце прокрутки затухание уходит с последней строки.
			   Только отдельные свойства: краткую запись animation минификатор склеивает
			   с animation-timeline, и браузер выкидывает правило */
			@supports (animation-timeline: scroll()) {
				animation-name: zones-fade;
				animation-timing-function: linear;
				animation-fill-mode: both;
				animation-timeline: scroll(self);
			}
		}

		/* На телефоне зоны переносятся в несколько рядов: в прокручиваемой строке половина зон
		   пряталась за правым краем, и ничто не намекало, что строку можно листать. После общего
		   правила, иначе его прокрутка и маска перебивают перенос */
		&__zones {
			@media (width < 700px) {
				overflow: visible;
				display: flex;
				flex: none;
				flex-wrap: wrap;
				gap: 0 20px;
				padding: 0;
				mask-image: none;
				animation-name: none;
			}
		}

		&__zone {
			cursor: pointer;
			display: flex;
			gap: 10px;
			align-items: center;
			/* Наведение -- только по самой строке, а не по всей ширине колонки */
			width: fit-content;
			max-width: 100%;
			padding: 9px 0;
			border: 0;
			font: inherit;
			font-size: 21px;
			font-weight: 600;
			color: var(--a-fg);
			letter-spacing: -0.02em;
			white-space: nowrap;
			background: none;
			transition:
				color 0.3s var(--a-ease),
				opacity 0.3s var(--a-ease);

			@media (width < 700px) {
				padding: 3px 0;
				font-size: 17px;
			}

			&:hover:not(:disabled) {
				color: var(--a-blue);
			}

			&:focus-visible {
				color: var(--a-blue);
				outline: none;
			}

			&:disabled {
				cursor: default;
				opacity: 0.3;
			}
		}

		/* Сколько травм в зоне -- бейджем перед названием: числа стоят ровным столбцом */
		&__count {
			display: inline-grid;
			flex: none;
			place-items: center;
			min-width: 28px;
			height: 24px;
			padding: 0 7px;
			border-radius: 999px;
			font-size: 14px;
			font-weight: 600;
			font-variant-numeric: tabular-nums;
			color: var(--a-fg2);
			letter-spacing: 0;
			background: var(--a-fill);
		}

		&__result {
			display: grid;
			gap: 2px;
			padding: 10px 0;
			color: var(--a-fg);
			text-decoration: none;
			transition: color 0.3s var(--a-ease);

			&:hover,
			&:focus-visible {
				color: var(--a-blue);
				outline: none;
			}
		}

		&__result-title {
			font-size: 18px;
			font-weight: 600;
			line-height: 1.3;
			letter-spacing: -0.015em;
		}

		&__result-zone,
		&__empty {
			font-size: 14px;
			color: var(--a-fg2);
		}
	}

	/* Подвал сцены на десктопе: строка у нижнего края поверх сцены, без фона. Поля даёт сам
	   .footer -- те же токены, что у шапки. Мимо ссылок мышь проходит к сцене: модель можно
	   крутить и под подвалом */
	.scene-footer {
		/* Подложка без размытия: полупрозрачный фон гаснет вверх от самого края экрана, плотнее
		   всего у края, и сходит на нет без плато -- так же, как шапка над сценой */
		--footer-tail: 12px;
		--footer-bg: var(--bg);
		pointer-events: none;
		position: absolute;
		z-index: 1;
		right: 0;
		bottom: 0;
		left: 0;
		font-size: 13px;

		@media (width < 700px) {
			display: none;
		}

		&::after {
			pointer-events: none;
			content: '';
			position: absolute;
			z-index: -1;
			inset: calc(-1 * var(--footer-tail)) 0 0;
			background: linear-gradient(
				to top,
				color-mix(in srgb, var(--footer-bg) 58%, transparent),
				color-mix(in srgb, var(--footer-bg) 50%, transparent) 10%,
				color-mix(in srgb, var(--footer-bg) 40%, transparent) 22%,
				color-mix(in srgb, var(--footer-bg) 29%, transparent) 35%,
				color-mix(in srgb, var(--footer-bg) 18%, transparent) 50%,
				color-mix(in srgb, var(--footer-bg) 10%, transparent) 65%,
				color-mix(in srgb, var(--footer-bg) 4%, transparent) 80%,
				color-mix(in srgb, var(--footer-bg) 1%, transparent) 92%,
				transparent
			);
		}

		/* Текст ближе к основному цвету, чем --muted: серый терялся на фигуре и под градиентом */
		& :global(.footer) {
			padding-block: 0 max(16px, env(safe-area-inset-bottom, 0px));
			color: color-mix(in srgb, var(--a-fg) 60%, var(--a-fg2));
		}

		/* Подпись раскрывает ссылки по наведению на себя: без этого hover до неё не доходит.
		   Поля -- место под плашку текста: подпись обрезает всё за краем, чтобы прятать
		   выезжающую строку. Отрицательные отступы возвращают текст на прежнее место */
		& :global(.credit) {
			--pill-y: 6px;
			--pill-x: 12px;
			pointer-events: auto;
			width: calc(100% + 2 * var(--pill-x));
			margin: calc(-1 * var(--pill-y)) calc(-1 * var(--pill-x));
			padding: var(--pill-y) var(--pill-x);
		}

		& :global(.credit__peek) {
			inset: var(--pill-y) var(--pill-x);
		}

		/* Под текстом слева та же плашка, что под логотипом в шапке: светлая фигура
		   съедала серую подпись */
		& :global(.credit__group) {
			isolation: isolate;
			position: relative;

			&::after {
				pointer-events: none;
				content: '';
				position: absolute;
				z-index: -1;
				inset: calc(-1 * var(--pill-y)) calc(-1 * var(--pill-x));
				border-radius: 999px;
				background: color-mix(in srgb, var(--a-bg) 15%, transparent);
				-webkit-backdrop-filter: blur(4px);
				backdrop-filter: blur(4px);

				@media (prefers-reduced-transparency: reduce) {
					backdrop-filter: none;
				}
			}
		}

		/* stylelint-disable-next-line selector-max-type -- ссылки подписи из infra-site-kit без своего класса */
		& :global(a) {
			pointer-events: auto;
		}
	}

	/* Список зоны в свободной половине экрана. Подложка полупрозрачная с размытием, как
	   у шапки, и растворяется к центру градиентом; строки гаснут к краям скролла маской */
	.zone {
		/* Своя стопка: подложка с z-index -1 иначе уходит под canvas сцены и размывать ей нечего */
		isolation: isolate;
		position: absolute;
		top: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		width: min(440px, calc(50vw - 32px - 4vw));
		/* backwards, а не both: анимация прозрачности, которая держится после конца, делает
		   колонку корнем для backdrop-filter, и подложка размывала бы только саму себя */
		animation: fade-in 0.5s var(--a-ease) backwards;

		&::before {
			pointer-events: none;
			content: '';
			position: absolute;
			z-index: -1;
			top: 0;
			bottom: 0;
		}

		/* Колонка сразу за серединой экрана, фигура -- в середине другой половины. Подложка уходит
		   до края экрана, а к фигуре растворяется по smoothstep: прозрачная за 48 px до текста,
		   почти сплошная у его края. На фигуру и точку зоны она не заходит */
		&--left {
			right: calc(50% + 32px);

			&::before {
				right: -48px;
				left: -50vw;
				background: color-mix(in srgb, var(--a-bg) 72%, transparent);
				-webkit-backdrop-filter: blur(12px);
				backdrop-filter: blur(12px);
				mask-image: linear-gradient(
					to left,
					rgb(0 0 0 / 0%) 0px,
					rgb(0 0 0 / 7%) 12px,
					rgb(0 0 0 / 26%) 24px,
					rgb(0 0 0 / 50%) 36px,
					rgb(0 0 0 / 74%) 48px,
					rgb(0 0 0 / 93%) 60px,
					rgb(0 0 0 / 100%) 72px
				);
			}
		}

		&--right {
			left: calc(50% + 32px);

			&::before {
				right: -50vw;
				left: -48px;
				background: color-mix(in srgb, var(--a-bg) 72%, transparent);
				-webkit-backdrop-filter: blur(12px);
				backdrop-filter: blur(12px);
				mask-image: linear-gradient(
					to right,
					rgb(0 0 0 / 0%) 0px,
					rgb(0 0 0 / 7%) 12px,
					rgb(0 0 0 / 26%) 24px,
					rgb(0 0 0 / 50%) 36px,
					rgb(0 0 0 / 74%) 48px,
					rgb(0 0 0 / 93%) 60px,
					rgb(0 0 0 / 100%) 72px
				);
			}
		}

		/* Телефон: шапка прибита к верху, строки -- в нижней половине под зоной */
		&--bottom {
			/* Колонка на весь экран, а модель видна между шапкой и строками: жест там должен
			   доходить до сцены, иначе зону не повернуть. Касания ловят только шапка и список */
			pointer-events: none;
			/* Над шапкой сцены: заголовок зоны стоит в её строке, и её дымка мутила его */
			z-index: 4;
			right: 0;
			left: 0;
			width: auto;
			padding-inline: 24px;

			& .zone__head,
			& .zone__list {
				pointer-events: auto;
			}

			/* Шапка сверху и строки снизу на сплошном фоне, к зоне между ними фон
			   растворяется по smoothstep */
			&::before {
				inset: 0;
				background:
					linear-gradient(
						to bottom,
						color-mix(in srgb, var(--a-bg) 100%, transparent) 7%,
						color-mix(in srgb, var(--a-bg) 93%, transparent) 9.5%,
						color-mix(in srgb, var(--a-bg) 74%, transparent) 12%,
						color-mix(in srgb, var(--a-bg) 50%, transparent) 14.5%,
						color-mix(in srgb, var(--a-bg) 26%, transparent) 17%,
						color-mix(in srgb, var(--a-bg) 7%, transparent) 19.5%,
						color-mix(in srgb, var(--a-bg) 0%, transparent) 22%
					),
					linear-gradient(
						to top,
						color-mix(in srgb, var(--a-bg) 100%, transparent) 44%,
						color-mix(in srgb, var(--a-bg) 93%, transparent) 47.7%,
						color-mix(in srgb, var(--a-bg) 74%, transparent) 51.3%,
						color-mix(in srgb, var(--a-bg) 50%, transparent) 55%,
						color-mix(in srgb, var(--a-bg) 26%, transparent) 58.7%,
						color-mix(in srgb, var(--a-bg) 7%, transparent) 62.3%,
						color-mix(in srgb, var(--a-bg) 0%, transparent) 66%
					);
			}

			/* Под фильтром шапка выше на строку: фон под ней тянется дальше */
			&:has(.zone__filters)::before {
				background:
					linear-gradient(
						to bottom,
						color-mix(in srgb, var(--a-bg) 100%, transparent) 13%,
						color-mix(in srgb, var(--a-bg) 93%, transparent) 15.5%,
						color-mix(in srgb, var(--a-bg) 74%, transparent) 18%,
						color-mix(in srgb, var(--a-bg) 50%, transparent) 20.5%,
						color-mix(in srgb, var(--a-bg) 26%, transparent) 23%,
						color-mix(in srgb, var(--a-bg) 7%, transparent) 25.5%,
						color-mix(in srgb, var(--a-bg) 0%, transparent) 28%
					),
					linear-gradient(
						to top,
						color-mix(in srgb, var(--a-bg) 100%, transparent) 44%,
						color-mix(in srgb, var(--a-bg) 93%, transparent) 47.7%,
						color-mix(in srgb, var(--a-bg) 74%, transparent) 51.3%,
						color-mix(in srgb, var(--a-bg) 50%, transparent) 55%,
						color-mix(in srgb, var(--a-bg) 26%, transparent) 58.7%,
						color-mix(in srgb, var(--a-bg) 7%, transparent) 62.3%,
						color-mix(in srgb, var(--a-bg) 0%, transparent) 66%
					);
			}
		}

		&__head {
			flex: none;
			/* Под шапкой сцены и ниже её мягкого края: на высоте заголовка индекса крупный
			   заголовок зоны тонул в градиенте шапки */
			padding-top: calc(var(--theme-toggle-top) + var(--header-row) + 40px);

			/* На телефоне заголовок зоны встаёт в строку шапки вместо логотипа, справа от него --
			   переключатель темы: крупный заголовок под шапкой съедал треть экрана над зоной */
			.zone--bottom & {
				padding-top: calc(var(--theme-toggle-top) + (var(--header-row) - 44px) / 2);
				padding-right: calc(var(--theme-toggle-room) - 24px);
			}
		}

		/* «Назад» -- стрелка в строке заголовка, без подписи: место на шапке дороже слова */
		&__heading {
			container-type: inline-size;
			display: flex;
			gap: 6px;
			align-items: center;
			margin-left: -12px;
		}

		&__back {
			cursor: pointer;
			display: inline-grid;
			flex: none;
			place-items: center;
			width: 44px;
			height: 44px;
			padding: 0;
			border: 0;
			border-radius: 50%;
			color: var(--a-blue);
			background: none;
			transition:
				opacity 0.3s var(--a-ease),
				background 0.3s var(--a-ease);

			/* В Mini App своя «Назад» не нужна: у Telegram есть системная кнопка */
			:global([data-telegram]) & {
				display: none;
			}

			&:hover {
				background: var(--a-fill);
			}

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: 2px;
			}
		}

		&__back-icon {
			display: inline-flex;
			width: 34px;
			height: 34px;

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				/* Оптическая поправка влево, как у .article-bar__back */
				translate: -6% 0;
				width: 100%;
				height: 100%;
				stroke-width: 2.4;
			}
		}

		&__title {
			margin: 0;
			/* Длинное название зоны («Голеностоп и стопа») мельчает, чтобы встать в одну строку
			   рядом со стрелкой: средний знак этого жирного начертания -- около 0,56 em.
			   Короткие остаются крупными, перенос остаётся запасным вариантом */
			font-size: min(clamp(32px, 4vw, 48px), calc((100cqi - 48px) / (var(--chars, 1) * 0.56)));
			font-weight: 700;
			line-height: 1.08;
			letter-spacing: -0.03em;

			/* В строке шапки -- кегль под её высоту */
			.zone--bottom & {
				font-size: min(28px, calc((100cqi - 48px) / (var(--chars, 1) * 0.56)));
			}
		}

		/* Под фильтром список неполный: слева, под стрелкой "Назад", -- сброс иконкой, дальше
		   счётчик синей таблеткой и включённые фильтры чипами */
		&__filters {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			align-items: center;
			margin: 10px 0 0 -12px;
			font-size: 15px;
		}

		&__reset {
			cursor: pointer;
			display: inline-grid;
			flex: none;
			place-items: center;
			width: 44px;
			height: 32px;
			padding: 0;
			border: 0;
			border-radius: 999px;
			color: var(--a-blue);
			background: none;
			transition: background 0.3s var(--a-ease);

			&:hover {
				background: var(--a-fill);
			}

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: 2px;
			}
		}

		&__reset-icon,
		&__tag-icon {
			display: inline-flex;

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				width: 100%;
				height: 100%;
			}
		}

		&__reset-icon {
			width: 20px;
			height: 20px;
		}

		&__filter {
			margin: 0;
			padding: 4px 12px;
			border-radius: 999px;
			font-weight: 600;
			font-variant-numeric: tabular-nums;
			color: var(--a-blue);
			white-space: nowrap;
			background: color-mix(in srgb, var(--a-blue) 13%, var(--a-bg));
		}

		&__tags {
			display: contents;
		}

		&__tag {
			display: inline-flex;
			gap: 6px;
			align-items: center;
			padding: 4px 12px 4px 10px;
			border-radius: 999px;
			color: var(--a-fg);
			white-space: nowrap;
			list-style: none;
			background: color-mix(in srgb, var(--a-fg) 7%, var(--a-bg));
		}

		&__tag-icon {
			width: 15px;
			height: 15px;
			color: var(--a-fg2);

			/* Частота -- залитым знаком в своём цвете, как в переключателе индекса */
			&--common,
			&--rare {
				width: 10px;
				height: 10px;

				/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
				& :global(svg) {
					fill: currentcolor;
				}
			}

			&--common {
				color: var(--common);
			}

			&--rare {
				color: var(--rare);
			}
		}

		/* Скроллятся только строки, к краям они гаснут маской, а не обрезаются */
		&__list {
			scrollbar-width: none;
			overflow-y: auto;
			overscroll-behavior: contain;
			flex: 1;
			/* Поля по бокам -- место под подложку строк: прокрутка обрезает всё за краем списка */
			margin: 12px -14px 0;
			padding: 14px 14px 22dvh;
			list-style: none;
			mask-image: linear-gradient(to bottom, transparent, #000000 18px, #000000 calc(100% - 120px), transparent);
		}

		&--bottom &__list {
			flex: none;
			height: 50dvh;
			margin-top: auto;
			padding-bottom: 12dvh;
		}

		&__row {
			animation: row-in 0.55s var(--a-ease) both;
			animation-delay: calc(120ms + var(--i) * 45ms);

			@media (--reduced-motion) {
				animation-name: fade-in;
			}
		}

		/* Номер слева -- тот же, что на маркере травмы на модели. Сетка общая с заголовком:
		   номер по центру под стрелкой «назад», текст на линии названия зоны. Подложка выходит
		   за них полями, а не сдвигает: строки стоят на месте, когда она появляется */
		&__item {
			display: grid;
			grid-template-columns: 28px 1fr;
			row-gap: 4px;
			column-gap: 16px;
			margin-inline: -14px;
			padding: 14px 14px 14px 8px;
			border-radius: 16px;
			color: var(--a-fg);
			text-decoration: none;
			transition: background 0.35s var(--a-ease);

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: -2px;
			}
		}

		&__num {
			display: grid;
			grid-row: span 2;
			place-items: center;
			width: 28px;
			height: 28px;
			margin-top: -1px;
			border-radius: 50%;
			font-size: 15px;
			font-weight: 600;
			font-variant-numeric: tabular-nums;
			color: var(--a-blue);
			box-shadow: inset 0 0 0 1.5px var(--a-blue);
			transition:
				color 0.35s var(--a-ease),
				background 0.35s var(--a-ease);
		}

		/* Текущая строка -- та, к которой подъехала камера: наведение мышью, на таче строка
		   у центра списка. Остальные не гаснут, текущая выделена номером и подложкой */
		&__item--current {
			background: var(--a-fill);
		}

		&__item--current &__num {
			color: #ffffff;
			background: var(--a-blue);
		}

		/* Стрелка после названия: видно, что строка -- ссылка */
		&__tail {
			white-space: nowrap;
		}

		&__arrow {
			display: inline-block;
			margin-left: 6px;
			font-weight: 400;
			color: var(--a-blue);
			transition: transform 0.35s var(--a-ease);
		}

		&__item:hover &__arrow,
		&__item:focus-visible &__arrow {
			transform: translateX(4px);
		}

		&__name {
			font-size: 20px;
			font-weight: 600;
			line-height: 1.25;
			letter-spacing: -0.02em;
		}

		/* Зона травмы в списке движения: там травмы разных зон идут подряд */
		&__where {
			font-weight: 600;
			color: var(--a-fg);
		}

		/* Редкие травмы отмечены словом, а не цветной точкой: точка читалась как уведомление */
		&__rare {
			display: inline-flex;
			gap: 4px;
			align-items: center;
			font-weight: 600;
			color: var(--rare);
		}

		&__rare-icon {
			display: inline-flex;
			width: 12px;
			height: 12px;

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				width: 100%;
				height: 100%;
				fill: currentcolor;
			}
		}

		/* Описание целиком, без многоточия: строка и так ссылка, это видно по стрелке */
		&__summary {
			font-size: 15px;
			line-height: 1.45;
			color: var(--a-fg2);
			letter-spacing: -0.01em;
		}
	}

	/* Статья на весь экран на чистом фоне; верхний край растворяется под кнопкой "Назад" */
	.reader {
		/* Фон шапки статьи -- цвет её страницы */
		--site-header-bg: var(--a-page);
		position: fixed;
		z-index: 2;
		inset: 0;
		overflow-y: auto;

		overscroll-behavior: contain;
		background: var(--a-page);

		&:focus {
			outline: none;
		}

		&__back {
			cursor: pointer;
			/* Подложка 32px на стрелке и 8px до маленького заголовка: он стоит по тексту пунктов
			   оглавления, а подложка под него не заходит. Зона нажатия добрана ::before влево и
			   по высоте, к заголовку она не тянется */
			position: relative;
			display: inline-grid;
			place-items: center;
			width: 32px;
			height: 32px;
			margin: 0 8px 0 -12px;
			padding: 0;
			border: 0;
			border-radius: 50%;
			color: var(--a-blue);
			background: none;
			transition: background 0.3s var(--a-ease);

			&::before {
				content: '';
				position: absolute;
				inset: -6px 0 -6px -6px;
			}

			:global([data-telegram]) & {
				display: none;
			}

			&:hover {
				background: var(--a-fill);
			}

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				/* Внутрь круга: снаружи рамка подходила бы к заголовку ближе 8px */
				outline-offset: -2px;
			}
		}

		&__back-icon {
			display: inline-flex;
			width: 28px;
			height: 28px;

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				/* Оптическая поправка влево, как у .article-bar__back */
				translate: -6% 0;
				width: 100%;
				height: 100%;
				stroke-width: 2.2;
			}
		}

		&__status {
			max-width: 680px;
			margin: 0 auto;
			padding: 24px;
			color: var(--a-fg2);
		}

		/* Саму статью оформляет общий styles/article.css, тот же, что у отдельной страницы */
		&__body {
			padding-bottom: 40px;

			/* Под липкой шапкой статье меньше верхнего отступа. Оглавление и якоря разделов
			   отступают от шапки сами: --header-clear в styles/global.css */
			& :global(.article) {
				padding-top: 8px;
			}
		}

		/* Полоса прогресса чтения: тонкая, у верхнего края, рядом с "Назад". Над шапкой
		   (у неё z-index 10): под ней полосу размывал backdrop-filter */
		&__progress {
			pointer-events: none;
			position: fixed;
			z-index: 11;
			top: var(--tg-top);
			right: 0;
			left: 0;
			height: 3px;
		}

		&__progress-bar {
			transform-origin: left;
			transform: scaleX(0);
			display: block;
			height: 100%;
			background: linear-gradient(to right, transparent, var(--a-blue) 30%);
			transition: transform 0.15s linear;

			@media (--reduced-motion) {
				transition: none;
			}
		}
	}

	@keyframes spot-in {
		from {
			opacity: 0;
		}
	}

	@keyframes spot-pulse {
		0% {
			transform: scale(0.5);
			opacity: 0.7;
		}

		100% {
			transform: scale(1.6);
			opacity: 0;
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}

	@keyframes row-in {
		from {
			transform: translateY(12px);
			opacity: 0;
		}
	}
</style>
