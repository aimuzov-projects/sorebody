<script lang="ts">
	import { onMount, tick, untrack, type Snippet } from 'svelte'

	import { PersonStanding, X } from 'lucide-static'

	import type { Frequency } from '#frontend/data/frequency.ts'
	import { introHintSeen, markIntroHintSeen } from '#frontend/lib/intro-hint.ts'
	import { metrikaGoal, metrikaHit } from '#frontend/lib/metrika.ts'
	import { recalledSport, rememberSport } from '#frontend/lib/sport-memory.ts'
	import { fadeUp } from '#frontend/lib/fade-up.ts'
	import { plural } from '#frontend/lib/plural.ts'
	import { BACK_EVENT, STEP_EVENT } from '#frontend/lib/telegram-events.ts'
	import IndexTools from '#frontend/components/index-tools.svelte'
	import ArticleReader from '#frontend/components/article-reader.svelte'
	import InjuryList from '#frontend/components/injury-list.svelte'
	import ZonePanel from '#frontend/components/zone-panel.svelte'
	import Logo from '#frontend/components/logo.svelte'
	import SiteHeader from '#frontend/components/site-header.svelte'
	import SportSwitch from '#frontend/components/sport-switch.svelte'
	import type { BodyScene } from '#frontend/scene/body-scene.ts'
	import type { SceneSport } from '#frontend/scene/scene-data.ts'
	import {
		fitShift,
		homeShift,
		placeHint,
		POSTER_SHIFT,
		projectBox,
		type Box,
		type HintPlace,
	} from '#frontend/scene/frame.ts'
	import { probeWebGL } from '#frontend/scene/gpu.ts'
	import {
		activeFilterChips,
		emptySearch,
		isFiltering,
		litZone,
		matchesFilters,
		zoneEntries,
	} from '#frontend/scene/filters.ts'
	import { parseHash as parsePlace, regionPlace, sportAt, zoneHash } from '#frontend/scene/place.ts'
	import { applySportHead, createRequestGuard, createSportLoader } from '#frontend/scene/sport-loader.ts'
	import poster from '#frontend/scene/poster.json'
	import { layoutMarks, MARK_SHIFT, type Mark } from '#frontend/scene/marks.ts'
	import { ANKLES_BOX, HEAD_BOX, injuryFocus, injuryLayer, type Zone } from '#frontend/scene/zones.ts'

	type Props = {
		zones: Zone[]
		whole: Zone
		/** Движения, которые встречаются хотя бы в одной статье: варианты фильтра. */
		movements: { slug: string; title: string }[]
		modelUrl: string
		/** Спорт сцены: адреса статей и главной, подписи и цвет подсветки модели. */
		sport: SceneSport
		/** Подвал сайта из Astro: встаёт под статьёй поверх модели, как на отдельной странице. */
		footer?: Snippet
		/**
		 * Страница движения: вместо индекса -- шапка движения и его травмы, фильтр по движению
		 * закреплён, точки зон с этими травмами крупнее и пульсируют, остальные приглушены.
		 */
		movementPage?: { slug: string; title: string; titleEn: string }
	}
	type Injury = Zone['injuries'][number]
	/** Всё, что у сцены от спорта. На главной меняется при выборе другого спорта, модель остаётся. */
	type SportData = Pick<Props, 'zones' | 'whole' | 'movements' | 'sport'>

	let { modelUrl, footer, movementPage, ...initial }: Props = $props()

	let data = $state.raw<SportData>(untrack(() => ({ ...initial })))

	const zones = $derived(data.zones)
	const whole = $derived(data.whole)
	const movements = $derived(data.movements)
	const sport = $derived(data.sport)

	/** Фильтры индекса. Они же решают, какие травмы видны в списке зоны и какие точки горят на модели. */
	let query = $state('')
	let frequency = $state<'all' | Frequency>('all')
	let movement = $state('')

	// Проверки фильтров -- scene/filters.ts. На странице движения его фильтр задан страницей
	function matches(injury: Injury) {
		return matchesFilters(injury, { query, frequency, movement: movementPage?.slug ?? movement })
	}

	// «Всё тело» без травм спорта в индексе не показываем, как и пустые зоны (scene/zones.ts)
	const allZones = $derived(whole.injuries.length > 0 ? [...zones, whole] : zones)
	const filtering = $derived(isFiltering({ query, frequency, movement }))
	const activeFilters = $derived(activeFilterChips({ query, frequency, movement }, movements))

	function resetFilters() {
		query = ''
		loosenFilters()
	}

	/** Запрос остаётся: его результаты отсекли частота и движение. */
	function loosenFilters() {
		frequency = 'all'
		movement = ''
	}

	/** Остров поиска и фильтров на телефоне раскрыт (components/index-tools.svelte). */
	let toolsOpen = $state(false)

	const counts = $derived(new Map(allZones.map((zone) => [zone, zone.injuries.filter(matches).length])))
	const results = $derived(query.trim() ? zoneEntries(allZones, matches) : [])
	const empty = $derived(
		query.trim() && results.length === 0 ? emptySearch(allZones, { query, frequency, movement }) : null,
	)
	/** Травмы движения по зонам сверху вниз, в порядке индекса главной. */
	const movementInjuries = $derived(movementPage ? zoneEntries(allZones, matches) : [])

	/** Зона, на строку которой навели в индексе: её точки на модели подсвечиваются. */
	let highlighted = $state.raw<Zone | null>(null)

	function setHighlight(zone: Zone | null) {
		highlighted = zone
		body?.glow(zone === whole)
		tintZone(zone && zone !== whole ? zone : null)
	}

	/** Зона под курсором -- пятном цвета спорта на коже, к краю в серый, как свечение «Всего тела». */
	function tintZone(zone: Zone | null) {
		body?.tint(zone?.points.map((p) => p.position) ?? null, zone ? zone.radius * 1.5 : 0)
	}

	/**
	 * Наведение (или фокус) на строку зоны в индексе: точки зоны крупнее, остальные
	 * притушены, камера подъезжает к зоне, но не раскрывает её. Камера отвечает с задержкой,
	 * чтобы при быстром проходе по строкам не металась. На таче только подсветка.
	 */
	let previewTimer: ReturnType<typeof setTimeout> | undefined

	// Фильтр сменили, пока курсор или фокус на зоне, и она опустела: подсветку снимаем сразу,
	// а не при следующем движении мыши
	$effect(() => {
		const current = counts

		untrack(() => {
			if (highlighted && !litZone(highlighted, current)) previewZone(null, false)

			if (hovered && !litZone(hovered.zone, current)) hover(null)
		})
	})

	function previewZone(target: Zone | null, pointer = true) {
		const zone = litZone(target, counts)

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
		// Под статьёй модель замерла: строка теряет курсор и фокус, но кадр остаётся
		if (open || article) return

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

		framed = lead?.injury ?? null

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
		// NOTE: 700 -- тот же порог, что у `@media (width < 700px)` в стилях ниже:
		// кадр и раскладка меняются вместе, поэтому числа держим одинаковыми.
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
	/** WebGL без видеокарты: сцену не грузим, пока её не включат кнопкой (`startScene`, из onMount). */
	let lite = $state(false)
	let loadScene = () => {}

	function startScene() {
		lite = false
		loadScene()
	}

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
	/** Флаги адреса (`?poster`, `?scene`, `?lite`) на входе: openRegion заменит адрес хешем зоны. */
	const flags = new URLSearchParams(location.search)
	const posterMode = flags.has('poster')

	/**
	 * Сдвиг кадра главной. На телефоне фигура заполняет полосу между шапкой и шторкой: её высота
	 * зависит от экрана и от того, что в шторке, поэтому меряем по месту. offsetTop, а не
	 * getBoundingClientRect: шторка, уходящая при раскрытой зоне, сдвинута transform
	 */
	function startShift(width: number, height: number) {
		const header = wrap?.querySelector<HTMLElement>('.site-header')
		const index = wrap?.querySelector<HTMLElement>('.index')

		if (width >= 700 || !header || !index) return homeShift(width)

		return fitShift(poster.box as never, width, height, header.offsetHeight, index.offsetTop)
	}

	function placePoster() {
		// По сцене, как и живая модель: окно шире на место под полосу прокрутки (scrollbar.css из infra-site-kit)
		const width = wrap?.clientWidth || innerWidth
		const height = wrap?.clientHeight || innerHeight
		const shift = startShift(width, height)

		posterRect = projectBox(poster.box as never, width, height, shift)

		// Пол подсказки: на телефоне -- заголовок шторки (не лечь на селект спорта), шире --
		// подвал сцены (не лечь на ссылки подписи)
		const floor = wrap?.querySelector(width < 700 ? '.index__title--home' : '.scene-footer .footer')

		hintPlace = placeHint(
			{ figure: poster.box as Box, head: HEAD_BOX, ankles: ANKLES_BOX },
			width,
			height,
			shift,
			(floor?.getBoundingClientRect().top ?? height) - 8,
		)
	}

	/** Место подсказки первого визита (scene/frame.ts). Шрифт догрузился позже -- меряем снова. */
	let hintPlace = $state<HintPlace>({ x: 0, y: 0, room: Infinity, side: false })

	/**
	 * Подсказка первого визита "как пользоваться моделью": у фигуры, пока посетитель не закроет
	 * её или не откроет зону. Только на главной и только с общего плана (место берём у постера)
	 */
	let hintShown = $state(false)

	function dismissHint() {
		hintShown = false
		markIntroHintSeen()
	}

	$effect(() => {
		if (hintShown && (open || article)) dismissHint()
	})

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

	/** Маркеры раскрытой зоны или единственный маркер травмы на странице движения. */
	const marks: Mark[] = $derived.by(() => {
		if (!open) {
			if (!lead) return []

			const focus = injuryFocus(lead.zone, lead.index, lead.injury.slug)
			const number = movementInjuries.findIndex((entry) => entry.injury === lead?.injury) + 1

			return [{ key: 'lead', focus, slug: lead.injury.slug, number, shift: 0 }]
		}

		return layoutMarks(
			open.zone,
			open.index,
			open.zone.injuries.filter(matches).map((injury) => injury.slug),
		)
	})
	let markEls = $state<HTMLSpanElement[]>([])

	// raw: иначе Svelte обернёт точку в прокси и сравнение hovered === spot всегда ложно
	let hovered = $state.raw<Spot | null>(null)

	/** Раскрытая зона. `side` -- где стоит список: в свободной от зоны половине экрана. */
	let open = $state.raw<{ zone: Zone; index: number; side: 'left' | 'right' | 'bottom' } | null>(null)
	/** Статья поверх модели (components/article-reader.svelte). */
	let article = $state.raw<Injury | null>(null)
	/** Раздел, который читали, когда в статье сменили спорт: ридер откроет разбор на нём. */
	let articleSection = $state<string>()
	let sceneHidden = $state(false)
	let sleepTimer: ReturnType<typeof setTimeout> | undefined

	/**
	 * Три уровня адреса (scene/place.ts): сцена, зона, статья. "Назад" и системная кнопка браузера
	 * поднимаются на уровень вверх. Записи выше `baseLevel` положили в историю мы сами, ниже --
	 * пришли со ссылкой.
	 */
	let baseLevel = 0

	function parseHash() {
		return parsePlace(location.hash, [...zones, whole])
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
			if (movementPage) location.assign(sport.home)

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

	// Данные других спортов догружаем по запросу (scene/sport-loader.ts): тянуть их в каждую
	// главную дороже
	const loadSport = createSportLoader<SportData>(untrack(() => ({ slug: data.sport.slug, data })))

	/** Курсор или фокус у выбора спорта: данные других спортов начинаем грузить заранее. */
	function prefetchSports(node: HTMLElement) {
		const prefetch = () => {
			for (const other of sport.sports) if (other.slug !== sport.slug) loadSport(other.slug).catch(() => {})
		}

		node.addEventListener('pointerenter', prefetch)
		node.addEventListener('focusin', prefetch)

		return () => {
			node.removeEventListener('pointerenter', prefetch)
			node.removeEventListener('focusin', prefetch)
		}
	}

	/** Данные, пришедшие после следующей смены спорта или смены адреса, отбрасываем. */
	const sportRequests = createRequestGuard(() => location.href)
	/** Спорт, данные которого ждём: кнопка выбора спорта показывает загрузку. */
	let sportLoading = $state(false)
	/** Объявление скринридеру после смены спорта на месте: «Травмы в паделе». */
	let sportAnnounce = $state('')
	let zonesList = $state<HTMLUListElement>()

	/**
	 * Данные спорта, если за время загрузки ничего не случилось: ни нового выбора спорта, ни
	 * смены адреса (посетитель успел открыть зону). Иначе `null`: такой результат уже не к месту.
	 * Ошибка загрузки -- исключением, но тоже только для актуального запроса.
	 */
	async function fetchSport(slug: string) {
		const request = sportRequests.start()

		sportLoading = true

		try {
			const next = await loadSport(slug)

			return request.current() ? next : null
		} catch (error) {
			if (request.current()) throw error

			return null
		} finally {
			if (request.latest()) sportLoading = false
		}
	}

	/**
	 * Сменить спорт на месте: данные, заголовки страницы, `data-sport` и цвет. Сцена и модель
	 * остаются, фильтры и прокрутка списка зон сбрасываются, как при загрузке страницы. Открытая
	 * статья может остаться: в ней сменится только разбор.
	 */
	function applySport(next: SportData, keepArticle = false) {
		if (!keepArticle) hideArticle()

		closeZone()
		hovered = null
		lead = null
		setHighlight(null)
		resetFilters()
		data = next
		applySportHead(document, next.sport)
		rememberSport(next.sport.slug)

		// Цвет акцента перетекает сам (global.css), подсветка модели -- тут. Модели ещё нет --
		// её подсветку поставит onMount по текущему спорту
		body?.glowColor(next.sport.glow, reduceMotion)
		sportAnnounce = next.sport.heading

		if (zonesList) zonesList.scrollTop = 0

		// Шторка на телефоне с другим спортом другой высоты: место подсказки и фигуры -- заново
		void tick().then(placePoster)
	}

	/**
	 * Выбран другой спорт -- в заголовке («Травмы ‹в …›») или в открытой статье («Разбор ‹в …›»).
	 * Спорт -- настройка, а не шаг: новой записи в истории нет, текущая переписывается на адрес
	 * нового спорта, а прошлые шаги при возврате открываются в нём же (onHistory). Поэтому
	 * «Назад» на странице и в браузере ведут в одно место.
	 *
	 * Статья остаётся открытой, сменяется разбор, раздел (`section`) -- тот, что читали. С общего
	 * плана -- общий план нового спорта: зоны, которые уже закрыли, сами не открываются. Данные не
	 * пришли -- обычный переход, тоже без нового шага.
	 */
	async function switchSport(target: { slug: string; href: string }, section?: string) {
		const home = sport.sports.find((s) => s.slug === target.slug)?.href

		if (!home) return

		const reading = article
		let next: SportData | null

		try {
			next = await fetchSport(target.slug)
		} catch (error) {
			console.error(error)
			// Из статьи `target.href` -- её страница в выбранном спорте, из заголовка -- его главная
			location.replace(reading ? `${target.href}${section ? `#${section}` : ''}` : home)

			return
		}

		if (!next) return

		const from = location.href

		if (reading && article?.slug === reading.slug) {
			applySport(next, true)
			articleSection = section
			history.replaceState(null, '', `${home}#${reading.slug}`)
			sync()
			metrikaHit(from)

			return
		}

		applySport(next)
		history.replaceState(null, '', home)
		sync()
		metrikaHit(from)
	}

	/**
	 * «Назад» и «Вперёд»: прошлые шаги -- в текущем спорте. Запись другого спорта осталась от
	 * шагов до его смены (switchSport): переписываем её путь на главную текущего, хеш с зоной или
	 * статьёй -- тот же. Зоны или статьи нет у этого спорта -- откроется общий план.
	 */
	function onHistory() {
		const slug = movementPage ? undefined : sportAt(location.pathname, sport.sports)

		sportRequests.cancel()
		sportLoading = false

		if (slug && slug !== sport.slug) {
			history.replaceState(history.state, '', `${sport.home}${location.search}${location.hash}`)
			dropDeadHash()
		}

		sync()
	}

	/**
	 * Зоны или статьи из хеша у этого спорта нет: шаг без хеша, а не мёртвая запись. Такой хеш
	 * приходит, когда спорт сменили после шага, а с ним общий план остался бы без постера.
	 */
	function dropDeadHash() {
		if (parseHash().level === 0 && location.hash && !location.hash.startsWith('#tgWebApp'))
			history.replaceState(history.state, '', `${location.pathname}${location.search}`)
	}

	/**
	 * Страница вернулась из кеша «Назад» (bfcache) такой, какой её оставили, а спорт с тех пор
	 * могли выбрать другой, на другой странице: переключаемся на него на месте, без нового шага.
	 */
	async function onPageShow(event: PageTransitionEvent) {
		const chosen = event.persisted && !movementPage ? recalledSport() : null
		const home = chosen && chosen !== sport.slug ? sport.sports.find((s) => s.slug === chosen)?.href : undefined

		if (!home) return

		const next = await fetchSport(chosen!).catch(() => null)

		if (!next) return

		const from = location.href

		applySport(next, !!article)
		history.replaceState(history.state, '', `${home}${location.search}${location.hash}`)
		dropDeadHash()
		sync()
		metrikaHit(from)
	}

	/** Ссылка «/?region=knee» со страницы статьи открывает список зоны: адрес -- сразу хеш зоны. */
	function openRegion() {
		const region = regionPlace(location.search, allZones)

		if (region && !location.hash)
			history.replaceState(null, '', `${location.pathname}${zoneHash(region.zone, region.index)}`)
	}

	// Зона и статья из адреса -- сразу в первом кадре. Из onMount главная успевала
	// отрисоваться: её список уезжал, а статья проявлялась, хотя её никто не открывал
	openRegion()
	// Главная, на которую ушли из `<head>` за выбранным спортом (lib/sport-memory.ts), получает
	// хеш прежнего спорта как есть
	dropDeadHash()
	sync()

	/** Компонент смонтирован: статья, открытая с этого момента, проявляется (`fadeUp`). */
	let mounted = $state(false)

	onMount(() => {
		mounted = true

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

		baseLevel = parseHash().level

		// `?scene` включает сцену и под автотестом, и на медленном WebGL. Рендер постера (`?poster`)
		// её требует
		const forced = posterMode || flags.has('scene')
		// Под автотестом (axe, проверка страниц) сцену не запускаем: в CI её рисует программный
		// WebGL, и страница с ней занимает у axe десятки секунд. Остаются постер и разметка
		const automated = navigator.webdriver && !forced
		const webgl = automated || forced || flags.has('lite') ? 'gpu' : probeWebGL()

		// Без видеокарты сцена на секунды занимает процессор и тормозит всю страницу: остаются
		// постер и индекс, 3D включается кнопкой. `?lite` -- этот режим на любом устройстве.
		// Цель в Метрике -- чтобы видеть, у какой доли посетителей он включается
		lite = flags.has('lite') || webgl === 'software'

		if (lite) metrikaGoal('scene-lite')

		// Без WebGL вовсе -- сразу сообщение, код сцены не грузим
		if (webgl === 'none') status = 'error'

		// Постер -- только для общего плана: зона или статья по адресу начинаются с другого кадра.
		// Без сцены кадр всегда общий: постер и плашка нужны и после «Назад» из зоны по ссылке
		if (!location.hash || lite) {
			placePoster()
			void document.fonts?.ready.then(placePoster)
		}

		if (!location.hash && !lite) hintShown = !movementPage && !introHintSeen()

		sync()
		window.addEventListener('popstate', onHistory)
		window.addEventListener('pageshow', onPageShow)
		// Кнопка «назад» Telegram в Mini App поднимает на шаг так же, как своя «Назад»
		window.addEventListener(BACK_EVENT, up)

		let disposed = false
		let frames = 0
		let fpsFrom = performance.now()

		loadScene = load

		// Код сцены -- сотни килобайт: сначала кадр с постером и индексом, потом он
		if (!automated && !lite && webgl !== 'none') requestAnimationFrame(() => setTimeout(load))

		function load() {
			const ready = import('#frontend/scene/body-scene.ts').then(async ({ createBodyScene }) => {
				const scene = await createBodyScene(canvas, modelUrl, sport.glow)

				if (disposed) return scene.dispose()

				body = scene
				// Подсказка стоит по стартовому кадру: повернули или приблизили фигуру -- точки
				// уходят под неё. Прячем до конца визита, но увиденной не отмечаем: покрутить
				// модель не значит узнать про точки, в следующий раз подсказка всплывёт снова
				scene.controls.addEventListener('start', () => (hintShown = false))

				// Общий план телефона -- карта зон над шторкой: отпустили щипок -- фигура встаёт обратно
				scene.controls.addEventListener('end', () => {
					if (!open && wrap.clientWidth < 700) scene.settleZoom()
				})

				// Спорт могли сменить, пока модель грузилась: подсветка -- цветом текущего
				scene.glowColor(sport.glow, true)
				scene.resize()

				// Автотесты проверяют подсветку модели (e2e/sports.spec.ts)
				if (navigator.webdriver) Object.assign(window, { bodyScene: scene })

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

						// Постер уходит в тот же кадр, в каком встаёт модель, без перехода: они совпадают, а
						// гаснущий постер клал свою тень поверх тени модели, и под ногами было две тени
						posterShown = false
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
			})

			ready.catch((error) => {
				console.error(error)
				status = 'error'
			})
		}

		// Постер -- по тому же размеру сцены, что и модель. По resize окна он отставал: ширина
		// сцены меняется и без него, например когда пропадает полоса прокрутки, и модель вставала
		// на полосу прокрутки левее или правее постера
		const resizer = new ResizeObserver(() => {
			body?.resize()
			homeFrame()

			if (posterShown && posterRect) placePoster()
		})

		resizer.observe(canvas)
		// Вне экрана и под статьёй сцена не рисует, чтобы не греть телефон
		const visibility = new IntersectionObserver(([entry]) => body?.pause(!entry.isIntersecting || sceneHidden))

		visibility.observe(canvas)

		return () => {
			for (const type of ['wheel', 'gesturestart', 'gesturechange']) wrap.removeEventListener(type, stopPageZoom)

			window.removeEventListener('popstate', onHistory)
			window.removeEventListener('pageshow', onPageShow)
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
			setData(el, 'hidden', String(!spot.visible))
		}

		// У парной зоны подпись левой точки -- слева от неё, наружу от тела: справа она ложилась
		// на правую точку и её цифру, особенно у таза и колен на телефоне
		for (const [i, spot] of spots.entries()) {
			const twin = spots.find((other) => other.zone === spot.zone && other !== spot)

			const left = twin !== undefined && spot.x < twin.x

			if (spotEls[i] && spotEls[i].hasAttribute('data-left') !== left)
				spotEls[i].toggleAttribute('data-left', left)
		}

		for (const [i, mark] of marks.entries()) {
			const el = markEls[i]

			if (!el) continue

			const p = body.project(mark.focus.position)

			el.style.transform = `translate(${p.x + mark.shift * MARK_SHIFT}px, ${p.y}px)`
			setData(el, 'hidden', String(body.facing(mark.focus.normal) < -0.05))
		}
	}

	/**
	 * Пишем data-атрибут, только если значение другое: он в селекторах, и даже та же
	 * запись каждый кадр заставляла браузер заново считать стили точек
	 */
	function setData(el: HTMLElement, key: string, value: string) {
		if (el.dataset[key] !== value) el.dataset[key] = value
	}

	function nearest(x: number, y: number, radius: number) {
		let best: Spot | null = null
		let bestD = radius

		for (const spot of spots) {
			if (!spot.visible || !litZone(spot.zone, counts)) continue

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
	function hover(target: Spot | null) {
		const spot = target && litZone(target.zone, counts) ? target : null

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

		// До монтирования (зона из адреса) сцены ещё нет, а она во всё окно
		const width = wrap ? wrap.clientWidth : innerWidth
		const side = width < 700 ? 'bottom' : zone.points[index].position[0] >= 0 ? 'right' : 'left'

		toolsOpen = false
		hovered = null
		lead = null
		setHighlight(null)
		clearTimeout(previewTimer)
		clearAccent()
		open = { zone, index, side }
		focusOpen()

		// На телефоне текущая травма -- прилипшая к верху строка, и при открытии это первая: маркер
		// и камера сразу показывают, о чём верхняя строка
		if (side === 'bottom' && noHover) setAccent(zone.injuries.find(matches) ?? null)
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

		framed = accent
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
		if (!open || article || accent === injury) return

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
			const style = getComputedStyle(list)
			// Список зоны на телефоне прилипает строками к верху: текущая -- прилипшая. Без прилипания
			// (список движения) -- строка у линии на 40% высоты
			const snap = style.scrollSnapType !== 'none'
			const line = snap ? box.top + (parseFloat(style.scrollPaddingTop) || 0) : box.top + box.height * 0.4
			let best: HTMLElement | undefined
			let bestD = Infinity

			for (const item of list.querySelectorAll<HTMLElement>('[data-slug]')) {
				const r = item.getBoundingClientRect()
				const d = Math.abs((snap ? r.top : r.top + r.height / 2) - line)

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

		const { x, y, s } = posterMode ? POSTER_SHIFT : startShift(wrap.clientWidth, wrap.clientHeight)

		body.frame(x, y, s, instant)
	}

	/** Статья на весь экран: сцена гаснет, потом рендер встаёт целиком, а не рисует под текстом. */
	function showArticle(injury: Injury) {
		// Та же травма из данных другого спорта: открыта, меняется только разбор
		if (article?.slug === injury.slug) {
			article = injury

			return
		}

		article = injury
		articleSection = undefined
		toolsOpen = false
		// Модель замирает в том кадре, в котором её застала статья: облёт к общему плану под
		// гаснущей сценой подтормаживал открытие. Камера, не успевшая доехать до травмы, тоже стоит
		clearTimeout(accentTimer)
		clearTimeout(previewTimer)
		sceneHidden = true
		clearTimeout(sleepTimer)
		sleepTimer = setTimeout(() => sceneHidden && body?.pause(true), reduceMotion ? 0 : SCENE_FADE_MS)
	}

	function hideArticle() {
		if (!article) return

		article = null
		articleSection = undefined
		sceneHidden = false
		clearTimeout(sleepTimer)
		body?.pause(false)
		void tick().then(settle)
	}

	/** Травма, к которой камера уже подъехала (`focusOpen`, `focusLead`). */
	let framed: Injury | null = null
	/** Где мышь, по всему окну: над статьёй строки под ней курсора не видят. */
	let pointerAt: { x: number; y: number } | null = null

	/**
	 * После статьи: курсор всё ещё над строкой той же травмы -- кадр остаётся как был, иначе модель
	 * плавно возвращается ко всем травмам. На таче курсора нет, акцент -- у строки, на которой стоял
	 * список, и он не меняется.
	 */
	function settle() {
		if (article) return

		const current = open ? accent : lead?.injury

		if (!current) return

		if (noHover || slugAt(pointerAt) === current.slug) {
			// Статью открыли раньше, чем камера доехала до травмы: доезжает сейчас
			if (framed !== current) {
				if (open) focusOpen(true)
				else focusLead()
			}

			return
		}

		if (open) setAccent(null)
		else previewInjury(null, false)
	}

	/** Строка травмы в списке сцены под точкой, даже если сверху ещё гаснет статья. */
	function slugAt(point: { x: number; y: number } | null) {
		if (!point || !wrap) return undefined

		const row = document
			.elementsFromPoint(point.x, point.y)
			.find((el): el is HTMLElement => el instanceof HTMLElement && !!el.dataset.slug && wrap.contains(el))

		return row?.dataset.slug
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
		// Сдвиг больше 8px -- это поворот модели, а не клик
		const moved = Math.hypot(x - downAt.x, y - downAt.y) > 8

		downAt = null

		if (moved) return

		// Список ловит клики сам. Клик по маркеру травмы делает её текущей, мимо маркеров мышью --
		// на уровень вверх. На таче тап мимо ничего не делает: модель крутят пальцем, а случайный тап
		// не должен закрывать зону, назад ведёт стрелка
		if (open) {
			// Только простой клик по самой сцене: правая кнопка, клик с модификатором или по шапке
			// с подсказками зону не закрывают
			if (event.target !== canvas || event.button !== 0) return

			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

			const mark = nearestMark(event.clientX, event.clientY, event.pointerType === 'mouse' ? 24 : 36)

			if (mark) pickInjury(mark.slug)
			else if (event.pointerType === 'mouse') up()

			return
		}

		if (event.target !== canvas) return

		const spot = nearest(x, y, event.pointerType === 'mouse' ? PICK_PX : PICK_PX * 1.3)

		if (spot) openZone(spot.zone, spot.index)
	}

	/** Маркер травмы ближе `radius` пикселей к точке в координатах окна. */
	function nearestMark(x: number, y: number, radius: number) {
		let best: Mark | undefined
		let bestD = radius

		for (const [i, mark] of marks.entries()) {
			const el = markEls[i]

			if (!el || el.hidden || el.dataset.hidden === 'true') continue

			const r = el.getBoundingClientRect()
			const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y)

			if (d < bestD) {
				best = mark
				bestD = d
			}
		}

		return best
	}

	/** Травма с маркера: она текущая, а список подъезжает к её строке. */
	function pickInjury(slug: string) {
		const injury = open?.zone.injuries.find((i) => i.slug === slug)

		if (!injury) return

		setAccent(injury)

		const list = wrap.querySelector<HTMLElement>('.zone__list')
		const row = list?.querySelector(`[data-slug="${CSS.escape(slug)}"]`)?.closest('li')

		if (!list || !row) return

		// Сам список, а не scrollIntoView: тот докручивал и колонку с overflow: hidden, и она уезжала
		const top = row.getBoundingClientRect().top - list.getBoundingClientRect().top
		const pad = parseFloat(getComputedStyle(list).scrollPaddingTop) || 0

		list.scrollTo({ top: list.scrollTop + top - pad, behavior: reduceMotion ? 'auto' : 'smooth' })
	}

	function onKey(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !(article || open)) return

		// Открытую подсказку браузер закроет сам, на уровень вверх -- следующим нажатием
		if (document.querySelector('[popover="auto"]:popover-open')) return

		up()
	}

	/** Ссылка в списке открывает статью на месте; с модификаторами -- как обычная ссылка. */
	function onItemClick(event: MouseEvent, injury: Injury) {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

		event.preventDefault()
		openArticle(injury)
	}
</script>

<svelte:window
	onkeydown={onKey}
	onpointermove={(event) =>
		(pointerAt = event.pointerType === 'touch' ? null : { x: event.clientX, y: event.clientY })}
/>

<div
	class="body3d"
	class:body3d--open={open}
	class:body3d--hidden={sceneHidden}
	class:body3d--hot={hovered && !open}
	class:body3d--movement={movementPage}
	class:body3d--live={live}
	class:body3d--posted={!!posterRect && status !== 'error'}
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
		<picture class="body3d__poster" aria-hidden="true">
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

	<!-- Место -- placeHint (scene/frame.ts): справа от головы или под ногами -->
	{#if hintShown && posterRect}
		<p
			class="body3d__hint"
			class:body3d__hint--below={!hintPlace.side}
			style:--hint-x="{hintPlace.x}px"
			style:--hint-y="{hintPlace.y}px"
			style:--hint-room="{hintPlace.room}px"
			transition:fadeUp={{ rise: innerWidth < 700 ? 0 : 24, instant: !mounted, reduceMotion }}
		>
			Нажмите на точку — откроются травмы зоны
			<button class="body3d__hint-close" type="button" aria-label="Закрыть подсказку" onclick={dismissHint}
				>{@html X}</button
			>
		</p>
	{/if}

	<!-- Медленный WebGL: на месте подсказки -- кнопка, включающая 3D. Зоны открываются из индекса -->
	{#if lite && !open}
		<p
			class="body3d__hint body3d__lite"
			class:body3d__hint--below={posterRect && !hintPlace.side}
			class:body3d__lite--corner={!posterRect}
			style:--hint-x="{hintPlace.x}px"
			style:--hint-y="{hintPlace.y}px"
			style:--hint-room="{hintPlace.room}px"
		>
			Устройство рисует 3D медленно, поэтому модель на паузе
			<button class="body3d__lite-start" type="button" onclick={startScene}>Включить 3D</button>
		</p>
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
			tabindex={counts.get(spot.zone) === 0 ? -1 : undefined}
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
			class:body3d__mark--accent={mark.key === 'lead' || accent?.slug === mark.slug}
			class:body3d__mark--dim={accent && accent.slug !== mark.slug}
			bind:this={markEls[i]}
			hidden={!live}
			aria-hidden="true"
		>
			<span class="body3d__mark-dot">{mark.number}</span>
		</span>
	{/each}

	<!-- Шапка сцены -- та же, что у статей: на месте «‹» логотип, просто знак без ссылки.
	     На about ведёт (i) справа, из base.astro -->
	<SiteHeader floating>
		<div class="index__brand-row" class:index__brand-row--away={open?.side === 'bottom'}>
			<Logo />
		</div>
	</SiteHeader>

	<!-- Индекс: на странице движения -- его травмы, на главной -- поиск, фильтры и зоны.
	     Наведение на строку подсвечивает её зону на модели -->
	{#if movementPage}
		{@const total = movementInjuries.length}
		<aside class="index" class:index--away={open} inert={!!open} aria-label="Боль на движении">
			<header class="index__head">
				<!-- В Mini App путь на главную -- системная кнопка «назад» Telegram -->
				<a class="index__home" href={sport.home}
					><span class="index__home-arrow" aria-hidden="true">←</span>Вся боль</a
				>
				<p class="index__title" aria-hidden="true">{movementPage.title}</p>
				<p class="index__sub">
					<span lang="en">{movementPage.titleEn}</span>
					{#if total}<span class="index__total">{total} {plural(total)}</span>{/if}
				</p>
			</header>
			{#if total}
				<InjuryList
					class="index__injuries"
					rows={movementInjuries.map((entry) => ({ injury: entry.injury, where: entry.zone.label }))}
					current={lead?.injury}
					sport={sport.slug}
					onaccent={(i, on, pointer) => previewInjury(on ? movementInjuries[i] : null, pointer)}
					onscroll={onListScroll}
					onpick={onItemClick}
				/>
			{:else}
				<div class="index__none">
					<p class="index__none-title">Статей пока нет</p>
					<p class="index__none-text">
						Про боль на этом движении ещё не написали. Остальное — <a
							class="index__none-link"
							href={sport.home}>на главной</a
						>.
					</p>
				</div>
			{/if}
		</aside>
	{:else}
		<aside class="index" class:index--away={open} inert={!!open} aria-label="Поиск и зоны тела">
			<header class="index__head">
				<!-- «Травмы ‹в паделе ▾›»: фраза спорта -- кнопка списка спортов, как у фильтра движения -->
				<div
					class="index__title index__title--home"
					class:index__title--loading={sportLoading}
					aria-busy={sportLoading}
					{@attach prefetchSports}
				>
					<span aria-hidden="true">Боль </span>{#if sport.sports.length > 1}<SportSwitch
							sports={sport.sports}
							value={sport.slug}
							size="title"
							onchoose={switchSport}
						/>{:else}<span class="index__sport" aria-hidden="true">{sport.phrase.replaceAll(' ', ' ')}</span
						>{/if}
				</div>
				<!-- Спорт сменили на месте: фокус остаётся на кнопке, о новом спорте скажет скринридер -->
				<p class="index__announce" aria-live="polite">{sportAnnounce}</p>
				<!-- Кто попал на главную впервые: что за сайт; ссылка в тексте ведёт на about -->
				<p class="index__lead">
					Разбираемся, что болит после тренировки или игры, когда пора к врачу и как тренироваться дальше.
					Всё <a class="index__lead-link" href="/about/">по исследованиям</a>, а не по слухам.
				</p>
			</header>
			<IndexTools
				bind:query
				bind:frequency
				bind:movement
				bind:open={toolsOpen}
				{movements}
				elementLabel={sport.elementLabel}
				chips={activeFilters}
				{filtering}
				{results}
				{empty}
				sport={sport.slug}
				onreset={resetFilters}
				onloosen={loosenFilters}
				onpick={onItemClick}
			/>
			<!-- Под запросом на десктопе зоны уступают место результатам, на телефоне результаты в острове -->
			<ul class="index__zones" class:index__zones--searching={query.trim()} bind:this={zonesList}>
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
		</aside>
	{/if}

	{#if open}
		<ZonePanel
			zone={open.zone}
			side={open.side}
			injuries={open.zone.injuries.filter(matches)}
			{filtering}
			chips={activeFilters}
			current={accent}
			sport={sport.slug}
			onback={up}
			onreset={resetFilters}
			onaccent={setAccent}
			onscroll={onListScroll}
			onpick={onItemClick}
		/>
	{/if}

	<!-- Подвал на десктопе -- строкой внизу сцены по сетке шапки: от левой колонки до линии
	     значка темы. На телефоне на главной его нет: место под шапкой отдано индексу -->
	{#if footer}<div class="scene-footer">{@render footer()}</div>{/if}

	{#if showFps}
		<output class="body3d__fps">{fps} fps</output>
	{/if}
</div>

{#if article}
	<ArticleReader
		injury={article}
		sport={sport.slug}
		section={articleSection}
		instant={!mounted}
		{reduceMotion}
		onback={up}
		onsport={movementPage ? undefined : switchSport}
		{footer}
	/>
{/if}

<style>
	/* Длина нижнего затухания списков на главной; регистрация нужна, чтобы её можно было
	   плавно анимировать и чтобы без анимации она была нулём */
	@property --zones-fade {
		syntax: '<length>';
		inherits: false;
		initial-value: 0px;
	}

	@keyframes sport-loading {
		to {
			opacity: 0.45;
		}
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

		/* После постера канвас встаёт сразу, без проявления: постер уходит в тот же кадр, и фигура
		   не мигает. При плавной смене на середине перехода сквозь фигуру просвечивал фон */
		&--posted &__canvas {
			transition: none;
		}

		/* У точек и меток свой display: без этого атрибут hidden их не прятал */
		&__spot[hidden],
		&__mark[hidden] {
			display: none;
		}

		/* Постер стоит на месте фигуры, пока канвас прозрачный, и уходит с её первым кадром */
		&__poster {
			pointer-events: none;
			position: absolute;
			inset: 0;
		}

		&__poster-image {
			position: absolute;
			max-width: none;
		}

		&--open &__spot {
			pointer-events: none;
			opacity: 0;
		}

		/* Подсказка первого визита: стеклянная плашка как у острова поиска на телефоне
		   (.index__island). Место -- из hintPlace. На широком экране левый край справа от головы,
		   верх вровень с макушкой, но не выше строки шапки: там "Что нового" и тема. Не влезает
		   в строку -- переносится, радиус держит форму и у двух-трёх строк */
		&__hint {
			position: absolute;
			z-index: 4;
			top: max(var(--hint-y), calc(var(--theme-toggle-top) + var(--header-row) + 8px));
			left: var(--hint-x);
			display: flex;
			gap: 4px;
			/* Крестик у первой строки, а не посередине нескольких */
			align-items: flex-start;
			width: max-content;
			max-width: var(--hint-room);
			margin: 0;
			padding: 10px 6px 10px 14px;
			border-radius: 19px;
			/* На узком планшете места справа от головы 120-180px: кегль чуть меньше, строк меньше */
			font-size: clamp(12.5px, var(--hint-room) * 0.075, 14px);
			font-weight: 500;
			line-height: 1.3;
			color: var(--a-fg);
			/* В две строки поровну: одно "зоны" на второй строке смотрелось обрывком */
			text-wrap: balance;
			background: color-mix(in srgb, var(--a-bg) 72%, transparent);
			-webkit-backdrop-filter: blur(12px);
			backdrop-filter: blur(12px);
			box-shadow:
				0 8px 24px rgb(0 0 0 / 18%),
				inset 0 0 0 1px var(--a-fill);

			/* Без размытия полупрозрачный фон пропускал бы фигуру сквозь текст: подложка плотнее */
			@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
				background: color-mix(in srgb, var(--a-bg) 94%, transparent);
			}

			@media (prefers-reduced-transparency: reduce) {
				background: color-mix(in srgb, var(--a-fg) 6%, var(--a-bg));
				-webkit-backdrop-filter: none;
				backdrop-filter: none;
			}

			/* Под ногами по оси фигуры: на телефоне и на узком планшете. Низ не ниже пола
			   (заголовок шторки или подвал): --hint-room -- место до него, 100% -- своя высота */
			&--below {
				top: var(--hint-y);
				translate: -50% min(0px, calc(var(--hint-room) - 100%));
				max-width: calc(100vw - 32px);
				font-size: 14px;
			}
		}

		&__hint-close {
			cursor: pointer;
			position: relative;
			display: grid;
			flex: none;
			place-items: center;
			width: 26px;
			height: 26px;
			/* Центр крестика -- на середине первой строки (1.3em), выше плашки он не раздувает */
			margin-block: calc((1.3em - 26px) / 2);
			padding: 0;
			border: 0;
			border-radius: 50%;
			color: var(--a-fg2);
			background: none;
			transition:
				color 0.3s var(--a-ease),
				background 0.3s var(--a-ease);

			/* Зона нажатия 44 на 44 */
			&::before {
				content: '';
				position: absolute;
				inset: -9px;
			}

			&:hover {
				color: var(--a-fg);
				background: var(--a-fill);
			}

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: 2px;
			}

			/* stylelint-disable-next-line selector-max-type -- SVG приходит строкой без класса */
			& :global(svg) {
				width: 16px;
				height: 16px;
			}
		}

		/* Плашка медленного WebGL: та же, что у подсказки, кнопка -- под текстом */
		&__lite {
			flex-direction: column;
			gap: 8px;
			align-items: flex-start;
			padding: 12px 14px;
		}

		/* Места фигуры ещё не знаем: плашка в правом верхнем углу под шапкой */
		&__lite--corner {
			top: calc(var(--theme-toggle-top) + var(--header-row) + 8px);
			right: var(--theme-toggle-right);
			left: auto;
		}

		&__lite-start {
			cursor: pointer;
			padding: 6px 14px;
			border: 0;
			border-radius: 999px;
			font: inherit;
			color: var(--a-on-blue);
			background: var(--a-blue);
			transition: filter 0.3s var(--a-ease);

			&:hover {
				filter: brightness(1.1);
			}

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: 2px;
			}
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

		/* Маркер травмы -- кружок с номером строки списка */
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
			/* Подложка белая в обеих темах, поэтому цифра -- акцентом светлой темы: яркий лайм
			   тёмной темы на белом не читается */
			color: var(--accent-light);
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
			color: var(--a-on-blue);
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

		/* Левая точка парной зоны: подпись зеркально, по другую сторону от точки */
		&__spot:global([data-left]) &__spot-count {
			right: 36px;
			left: auto;
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

		/* На невысоком экране вместе с плотными строками зон (&__zone): список без прокрутки.
		   С запасом под шрифт шире SF (Windows, Linux): лид под заголовком там в три строки */
		@media (width >= 700px) and (height < 820px) {
			gap: 12px;
		}

		@media (width < 700px) {
			top: auto;
			right: 0;
			left: 0;
			gap: 10px;
			width: auto;
			max-height: 56dvh;
			padding: 20px 20px calc(max(16px, env(safe-area-inset-bottom)) + var(--tg-bottom));

			/* Под строками место под остров поиска: он висит над нижним краем поверх шторки */
			&:has(:global(.index__tools)) {
				padding-bottom: calc(max(16px, env(safe-area-inset-bottom)) + var(--tg-bottom) + 64px);
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

		&__brand-row {
			isolation: isolate;
			position: relative;
			display: flex;
			gap: 8px;
			align-items: center;
			justify-self: start;
			/* Логотип там же, где у статьи за «‹» (токены в styles/global.css): переход со сцены
			   на статью и обратно его не двигает */
			margin-left: var(--back-room);

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

			/* В раскрытой зоне на телефоне строку шапки занимает стрелка назад с названием зоны */
			&--away {
				pointer-events: none;
				visibility: hidden;
				opacity: 0;
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

		/* Что за сайт -- под заголовком главной, тише его и не шире колонки */
		&__lead {
			max-width: 36ch;
			margin: 10px 0 0;
			font-size: 16px;
			line-height: 1.4;
			color: var(--a-fg2);

			@media (width < 700px) {
				margin-top: 4px;
				font-size: 14px;
			}
		}

		/* Ссылка на раздел сайта -- плашкой, как внутренние ссылки в статье (styles/article.css) */
		&__lead-link {
			padding: 0 0.4em;
			border-radius: 0.3em;
			color: var(--a-blue);
			text-decoration: none;
			background-image: linear-gradient(
				color-mix(in srgb, var(--a-blue) 8%, transparent),
				color-mix(in srgb, var(--a-blue) 8%, transparent)
			);
			-webkit-box-decoration-break: clone;
			box-decoration-break: clone;
			transition:
				color 0.2s var(--a-ease),
				background-color 0.2s var(--a-ease);

			&:hover {
				color: var(--a-on-blue);
				background-color: var(--a-blue);
			}

			&:focus-visible {
				border-radius: 4px;
				outline: 2px solid var(--a-blue);
				outline-offset: 2px;
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
		   Двойной класс перебивает отступы строк зоны (injury-list.svelte) */
		& :global(.index__injuries.zone__list) {
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
			letter-spacing: 0;
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
			letter-spacing: -0.015em;

			@media (width < 700px) {
				font-size: 26px;
			}
		}

		/* Фраза спорта в заголовке, когда спорт один и выбирать не из чего */
		&__sport {
			color: var(--a-blue);
		}

		/* Заголовок главной -- одной строкой: в две он съедал у списка зон строку и на ноутбуке
		   список уходил под скролл. Строка шириной около 9.4em, колонка -- min(380px, 32vw):
		   кегль тянется за колонкой, 39px на широком экране */
		&__announce {
			position: absolute;
			overflow: hidden;
			width: 1px;
			height: 1px;
			white-space: nowrap;
			clip-path: inset(50%);
		}

		/* Данные спорта ещё грузятся: фраза спорта мерцает. С задержкой, чтобы быстрая загрузка
		   не мигала */
		&__title--loading :global(.pselect__button) {
			animation: sport-loading 1s ease-in-out 150ms infinite alternate;

			@media (prefers-reduced-motion: reduce) {
				opacity: 0.6;
				animation: none;
			}
		}

		&__title--home {
			/* Список спортов раскрывается поверх подводки и фильтров под заголовком */
			position: relative;
			z-index: 6;
			font-size: clamp(22px, 3.1vw, 39px);
			white-space: nowrap;

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

		/* Под запросом на десктопе зоны уступают место результатам */
		&__zones--searching {
			@media (width >= 700px) {
				display: none;
			}
		}

		/* Зоны: скроллится только список, края гаснут маской. Так же у результатов поиска
		   (index-tools.svelte) */
		&__zones {
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

			@media (width >= 700px) and (height < 820px) {
				padding-bottom: 8px;
			}

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
		   правила, иначе его прокрутка и маска перебивают перенос. На десктопе список -- контейнер
		   по высоте: строки уплотняются, только когда не влезают (&__zone) */
		&__zones {
			@media (width >= 700px) {
				container: zones / size;
			}

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
			letter-spacing: 0;
			white-space: nowrap;
			background: none;
			transition:
				color 0.3s var(--a-ease),
				opacity 0.3s var(--a-ease);

			/* Строки плотнее, только когда десять строк (все зоны и «Всё тело») иначе не влезают
			   в список без прокрутки: сперва меньше поля, потом и интерлиньяж. Пороги -- высота
			   десяти строк каждой ступени */
			@container zones (height < 493px) {
				padding: 4px 0;
			}

			@container zones (height < 392px) {
				padding: 2px 0;
				line-height: 1.25;
			}

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
</style>
