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
	import { flushSync, mount, onMount, tick, unmount, untrack, type Snippet } from 'svelte'

	import {
		ChevronDown,
		ChevronLeft,
		Diamond,
		FunnelX,
		PersonStanding,
		Search,
		Shapes,
		TextQuote,
		X,
	} from 'lucide-static'

	import { FREQUENCIES, frequencyOf, type Frequency } from '#frontend/data/frequency.ts'
	import { type ElementIcon, MOVEMENT_ICONS } from '#frontend/data/movement-icons.ts'
	import { normalize } from '#frontend/lib/filter.ts'
	import { INFO_DOT } from '#frontend/lib/icons.ts'
	import { introHintSeen, markIntroHintSeen } from '#frontend/lib/intro-hint.ts'
	import { initReading } from '#frontend/lib/reading.ts'
	import { attachTip } from '#frontend/lib/tip.ts'
	import { pageTitle, splitTitle } from '#frontend/lib/title.ts'
	import { BACK_EVENT, STEP_EVENT } from '#frontend/lib/telegram-events.ts'
	import Logo from '#frontend/components/logo.svelte'
	import MovementSelect from '#frontend/components/movement-select.svelte'
	import SearchField from '#frontend/components/search-field.svelte'
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

	/** У каждого уровня частоты свой знак и цвет, как легенда к списку. */
	const FREQUENCY_CHIPS = [
		['all', 'Все', Shapes],
		...FREQUENCIES.map((f) => [f.slug, f.label, f.icon] as const),
	] as const

	/** Фильтры индекса. Они же решают, какие травмы видны в списке зоны и какие точки горят на модели. */
	let query = $state('')
	let frequency = $state<'all' | Frequency>('all')
	let movement = $state('')

	function matches(injury: Injury) {
		const q = normalize(query)
		const only = movementPage?.slug ?? movement

		return (
			(frequency === 'all' || injury.frequency === frequency) &&
			(!only || injury.movements.includes(only)) &&
			(!q || normalize(`${injury.title} ${injury.titleEn} ${injury.summary}`).includes(q))
		)
	}

	// «Всё тело» без травм спорта в индексе не показываем, как и пустые зоны (scene/zones.ts)
	const allZones = $derived(whole.injuries.length > 0 ? [...zones, whole] : zones)
	const filtering = $derived(query.trim() !== '' || frequency !== 'all' || movement !== '')
	/**
	 * Включённые фильтры для шапки раскрытой зоны: каждый своим чипом и со своим знаком --
	 * частота своим знаком в её цвете, движение его иконкой, поиск лупой.
	 */
	const activeFilters = $derived(
		[
			query.trim() && { key: 'query', label: `«${query.trim()}»`, icon: Search, tone: '' },
			frequency !== 'all' && {
				key: 'frequency',
				label: frequencyOf(frequency).label,
				icon: frequencyOf(frequency).icon,
				tone: frequency,
			},
			movement && {
				key: 'movement',
				label: movements.find((m) => m.slug === movement)?.title ?? movement,
				icon: MOVEMENT_ICONS[movement as ElementIcon] ?? '',
				tone: '',
			},
		].filter((f) => f !== false && f !== ''),
	)

	function resetFilters() {
		query = ''
		frequency = 'all'
		movement = ''
	}

	/**
	 * Подложка выбранной частоты одна на весь переключатель и переезжает под выбранный чип.
	 * Края берём у самого чипа: подписи разной длины, а кегль идёт за шириной колонки.
	 * Едет она только при смене выбора; пересчёт от размеров (первая отрисовка, ресайз, остров
	 * на телефоне раскрылся из `display: none`) ставит её на место без движения.
	 *
	 * Переезд мультяшный: передний край убегает первым, задний догоняет с перелётом внутрь,
	 * и таблетка тянется, а потом пружинит. По высоте её на растяжении чуть сплющивает.
	 */
	let freqGroup = $state<HTMLDivElement>()
	let freqThumb = $state<HTMLSpanElement>()
	let freqChips = $state<HTMLButtonElement[]>([])
	let thumb = $state({ left: 0, right: 0, width: 0 })
	let thumbMoves = $state<'forward' | 'backward' | null>(null)

	const THUMB_SQUASH: Keyframe[] = [
		{ scale: '1 1' },
		{ scale: '1 0.84', offset: 0.35 },
		{ scale: '1 1.06', offset: 0.7 },
		{ scale: '1 1' },
	]

	function placeThumb(moves: boolean) {
		const chip = freqChips[FREQUENCY_CHIPS.findIndex(([value]) => value === frequency)]

		if (!chip?.offsetWidth || !freqGroup) return

		const left = chip.offsetLeft
		const width = chip.offsetWidth
		const right = freqGroup.clientWidth - left - width

		if (left === thumb.left && width === thumb.width) return

		thumbMoves = moves && thumb.width > 0 ? (left > thumb.left ? 'forward' : 'backward') : null
		thumb = { left, right, width }

		if (thumbMoves && !matchMedia('(prefers-reduced-motion: reduce)').matches)
			freqThumb?.animate(THUMB_SQUASH, { duration: 520, easing: 'ease-out' })
	}

	$effect(() => {
		void frequency
		// Сама подложка в зависимостях не нужна: эффект пишет её и иначе перезапускал бы себя
		untrack(() => placeThumb(true))
	})

	$effect(() => {
		if (!freqGroup) return

		const resizer = new ResizeObserver(() => placeThumb(false))

		resizer.observe(freqGroup)

		for (const chip of freqChips) resizer.observe(chip)

		return () => resizer.disconnect()
	})

	/** Остров поиска и фильтров на телефоне: раскрыт или свёрнут в таблетку. */
	let toolsOpen = $state(false)
	let toolsPanel = $state<HTMLDivElement>()
	/** Высота клавиатуры над низом окна: iOS не сжимает под неё окно, и раскрытый остров уходил бы под неё. */
	let keyboard = $state(0)

	function openTools() {
		// Синхронно, ещё в обработчике нажатия: иначе iOS не поднимет клавиатуру по focus()
		flushSync(() => (toolsOpen = true))
		toolsPanel?.querySelector('input')?.focus()
	}

	function closeTools() {
		toolsOpen = false

		;(document.activeElement as HTMLElement | null)?.blur()
	}

	function onToolsKey(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !toolsOpen) return

		event.stopPropagation()
		closeTools()
	}

	$effect(() => {
		const viewport = window.visualViewport

		if (!toolsOpen || !viewport) return

		const update = () => (keyboard = Math.max(0, innerHeight - viewport.height - viewport.offsetTop))

		update()
		viewport.addEventListener('resize', update)
		viewport.addEventListener('scroll', update)

		return () => {
			viewport.removeEventListener('resize', update)
			viewport.removeEventListener('scroll', update)
			keyboard = 0
		}
	})

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
		const shift = startShift(innerWidth, innerHeight)

		posterRect = projectBox(poster.box as never, innerWidth, innerHeight, shift)

		// Пол подсказки: на телефоне -- заголовок шторки (не лечь на селект спорта), шире --
		// подвал сцены (не лечь на ссылки подписи)
		const floor = wrap?.querySelector(innerWidth < 700 ? '.index__title--home' : '.scene-footer .footer')

		hintPlace = placeHint(
			{ figure: poster.box as Box, head: HEAD_BOX, ankles: ANKLES_BOX },
			innerWidth,
			innerHeight,
			shift,
			(floor?.getBoundingClientRect().top ?? innerHeight) - 8,
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
	let article = $state.raw<Injury | null>(null)
	let articleStatus = $state<'loading' | 'ready' | 'error'>('loading')
	let articleBody = $state<HTMLDivElement>()
	let readerElement = $state<HTMLElement>()
	let progressBar = $state<HTMLElement>()
	let stopReading: (() => void) | undefined
	let sceneHidden = $state(false)
	/** Номер последней загрузки статьи: ответ, пришедший после перехода к другой, отбрасываем. */
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
		let hash: string

		// Битый процент-эскейп (`/#%`) бросает URIError и валит onMount -- считаем, что хеша нет
		try {
			hash = decodeURIComponent(location.hash.slice(1))
		} catch {
			return { level: 0 }
		}

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

	/** Значок «О справочнике» у названия сайта: подсказка мышью и с клавиатуры, тап просто ведёт на about. */
	let aboutLink = $state<HTMLAnchorElement>()
	let aboutTip = $state<HTMLElement>()

	$effect(() => {
		if (aboutLink && aboutTip)
			return attachTip(aboutLink, aboutTip, { column: aboutLink.closest('.site-header') ?? aboutLink })
	})

	/** Последняя закрытая зона и сторона тела: выбор спорта виден только на общем плане. */
	let lastZone: { zone: Zone; index: number } | null = null

	/**
	 * Данные спортов по slug. Свой спорт уже в странице, другие -- статикой `/<sport>/scene.json`
	 * (pages/[sport]/scene.json.ts): тянуть их в каждую главную дороже, чем догрузить по запросу.
	 */
	const sportData = new Map<string, Promise<SportData>>(untrack(() => [[data.sport.slug, Promise.resolve(data)]]))

	function loadSport(slug: string) {
		let hit = sportData.get(slug)

		if (!hit) {
			hit = fetch(`/${slug}/scene.json`).then((r) => {
				if (!r.ok) throw new Error(`${r.url}: ${r.status}`)

				return r.json()
			})

			// Неудачу не запоминаем: следующий выбор спросит снова
			hit.catch(() => sportData.delete(slug))
			sportData.set(slug, hit)
		}

		return hit
	}

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

	/** Номер последней смены спорта: данные, пришедшие после следующей смены, отбрасываем. */
	let sportToken = 0
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
		const token = ++sportToken
		const href = location.href
		const current = () => token === sportToken && location.href === href

		sportLoading = true

		try {
			const next = await loadSport(slug)

			return current() ? next : null
		} catch (error) {
			if (current()) throw error

			return null
		} finally {
			if (token === sportToken) sportLoading = false
		}
	}

	/**
	 * Сменить спорт на месте: данные, заголовки страницы, `data-sport` и цвет. Сцена и модель
	 * остаются, фильтры и прокрутка списка зон сбрасываются, как при загрузке страницы.
	 */
	function applySport(next: SportData) {
		hideArticle()
		closeZone()
		hovered = null
		lead = null
		setHighlight(null)
		resetFilters()
		data = next

		const root = document.documentElement
		const head = document.head
		const title = pageTitle(next.sport.heading)
		const canonical = head.querySelector<HTMLLinkElement>('link[rel="canonical"]')

		root.dataset.sport = next.sport.slug
		document.title = title
		head.querySelector('meta[name="description"]')?.setAttribute('content', next.sport.description)
		head.querySelector('meta[property="og:description"]')?.setAttribute('content', next.sport.description)
		head.querySelector('meta[property="og:title"]')?.setAttribute('content', title)

		if (canonical) {
			canonical.href = new URL(next.sport.home, canonical.href).href
			head.querySelector('meta[property="og:url"]')?.setAttribute('content', canonical.href)
		}

		// Видимый заголовок -- в острове, скрытый h1 для скринридера -- в разметке Astro
		const heading = document.querySelector('.scene-page__title')

		if (heading) heading.textContent = next.sport.heading

		// Цвет акцента перетекает сам (global.css), подсветка модели -- тут. Модели ещё нет --
		// её подсветку поставит onMount по текущему спорту
		body?.glowColor(next.sport.glow, reduceMotion)
		sportAnnounce = next.sport.heading

		if (zonesList) zonesList.scrollTop = 0

		// Шторка на телефоне с другим спортом другой высоты: место подсказки и фигуры -- заново
		void tick().then(placePoster)
	}

	/**
	 * Выбран другой спорт в заголовке -- смена на месте, адрес -- его главная. Последняя зона едет
	 * вместе со стороной: смотрел левое плечо в кроссфите -- видишь левое плечо в паделе. Нет у
	 * спорта такой зоны -- открывается сцена целиком. Данные не пришли -- обычный переход.
	 */
	async function switchSport(target: { slug: string; href: string }) {
		let next: SportData | null

		try {
			next = await fetchSport(target.slug)
		} catch (error) {
			console.error(error)

			const recent = open ?? lastZone

			location.assign(recent ? `${target.href}?region=${recent.zone.slug}:${recent.index}` : target.href)

			return
		}

		if (!next) return

		// Зону берём после загрузки: она могла смениться, пока данные шли
		const recent = open ?? lastZone

		applySport(next)

		const zone = recent ? allZones.find((z) => z.slug === recent.zone.slug) : undefined
		const index = recent && zone?.points[recent.index] ? recent.index : 0

		// Как после перехода по ссылке: зона из адреса, «Назад» в ней закрывает её заменой адреса
		history.pushState(null, '', zone ? `${target.href}${zoneHash(zone, index)}` : target.href)
		baseLevel = parseHash().level
		sync()
	}

	/** Спорт по адресу главной: `/` и `/crossfit/` -- кроссфит, `/padel/` -- падел. */
	function sportAt(pathname: string) {
		const path = pathname.replace(/\/?$/, '/')

		return sport.sports.find((s) => s.href === path || `/${s.slug}/` === path)?.slug
	}

	/** «Назад» и «Вперёд»: адрес другого спорта -- сначала спорт, потом зона и статья из хеша. */
	function onHistory() {
		const slug = movementPage ? undefined : sportAt(location.pathname)

		if (!slug || slug === sport.slug) {
			sportToken++
			sportLoading = false
			sync()

			return
		}

		fetchSport(slug).then(
			(next) => {
				if (!next) return

				applySport(next)
				baseLevel = parseHash().level
				sync()
			},
			(error) => {
				console.error(error)
				// Без данных спорта страницу по этому адресу отдаст сервер
				location.reload()
			},
		)
	}

	/** Выбор спорта в статье поверх модели: острова Astro во вставленном HTML не оживают, монтируем сами. */
	let articleSwitches: ReturnType<typeof mount>[] = []

	function mountSportSwitches(root: HTMLElement) {
		for (const app of articleSwitches) void unmount(app)

		articleSwitches = [...root.querySelectorAll<HTMLElement>('[data-sport-switch]')].map((target) => {
			const props = JSON.parse(target.dataset.sportSwitch ?? '{}')

			target.replaceChildren()

			return mount(SportSwitch, { target, props })
		})
	}

	/** Ссылка «/?region=knee» (или «knee:1» -- с точкой зоны) со страницы статьи открывает список зоны. */
	function openRegion() {
		const [region, point] = (new URLSearchParams(location.search).get('region') ?? '').split(':')
		const regionZone = allZones.find((zone) => zone.slug === region)
		const index = regionZone?.points[Number(point)] ? Number(point) : 0

		if (regionZone && !location.hash)
			history.replaceState(null, '', `${location.pathname}${zoneHash(regionZone, index)}`)
	}

	// Зона и статья из адреса -- сразу в первом кадре. Из onMount главная успевала
	// отрисоваться: её список уезжал, а статья проявлялась, хотя её никто не открывал
	openRegion()
	sync()

	/** Компонент смонтирован: статья, открытая с этого момента, проявляется (`fadeUp`). */
	let mounted = false

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

		// Постер -- только для общего плана: зона или статья по адресу начинаются с другого кадра
		if (!location.hash) {
			placePoster()
			void document.fonts?.ready.then(placePoster)
			window.addEventListener('resize', placePoster)
			hintShown = !movementPage && !introHintSeen()
		}

		sync()
		window.addEventListener('popstate', onHistory)
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
				const scene = await createBodyScene(canvas, modelUrl, sport.glow)

				if (disposed) return scene.dispose()

				body = scene
				// Подсказка стоит по стартовому кадру: повернули или приблизили фигуру -- точки
				// уходят под неё. Прячем до конца визита, но увиденной не отмечаем: покрутить
				// модель не значит узнать про точки, в следующий раз подсказка всплывёт снова
				scene.controls.addEventListener('start', () => (hintShown = false))
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

						// Постер гаснет за 0.3s (`.body3d__poster`), из DOM убираем с запасом после этого
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

			window.removeEventListener('popstate', onHistory)
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

		// У парной зоны подпись левой точки -- слева от неё, наружу от тела: справа она ложилась
		// на правую точку и её цифру, особенно у таза и колен на телефоне
		for (const [i, spot] of spots.entries()) {
			const twin = spots.find((other) => other.zone === spot.zone && other !== spot)

			spotEls[i]?.toggleAttribute('data-left', twin !== undefined && spot.x < twin.x)
		}

		for (const [i, mark] of marks.entries()) {
			const el = markEls[i]

			if (!el) continue

			const p = body.project(mark.focus.position)

			el.style.transform = `translate(${p.x + mark.shift * MARK_SHIFT}px, ${p.y}px)`
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

		lastZone = { zone: open.zone, index: open.index }
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
		// На телефоне общий план -- карта зон над панелью: щипок увеличивал фигуру под шапку и
		// панель. Крупный план даёт раскрытая зона
		body.controls.enableZoom = wrap.clientWidth >= 700
	}

	/** Статья на весь экран: сцена гаснет, потом рендер встаёт целиком, а не рисует под текстом. */
	function showArticle(injury: Injury) {
		if (article?.slug === injury.slug) return

		article = injury
		toolsOpen = false
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
			const response = await fetch(`/${sport.slug}/${slug}/`)

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

			// Чипы зоны и частоты в полноэкранной статье лишние
			main.querySelector('.article__meta')?.remove()
			await tick()

			if (token !== loadToken || !articleBody || !readerElement) return

			// Второй main на странице не нужен: те же классы и содержимое, но в div
			const root = document.createElement('div')

			root.className = main.className
			root.append(...[...main.childNodes].map((node) => document.importNode(node, true)))
			stopReading?.()
			articleBody.replaceChildren(root)
			mountSportSwitches(root)
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
	 * `rise` -- насколько снизу: подсказке на телефоне сдвиг не нужен, снизу у неё заголовок шторки.
	 * Через `tick`, а не `css`: `css` вставляет тег стилей, а CSP сайта такое блокирует.
	 */
	function fadeUp(node: HTMLElement, { rise = 24 } = {}) {
		// Статья из адреса стоит на месте с первого кадра: mount у Astro проигрывает и вход
		if (!mounted) return { duration: 0 }

		return {
			duration: reduceMotion ? 250 : 550,
			delay: reduceMotion ? 0 : 120,
			// Близко к cubic-bezier(0.25, 1, 0.5, 1) из CSS: быстрый старт, мягкая посадка
			easing: (t: number) => 1 - (1 - t) ** 4,
			tick: (t: number) => {
				node.style.opacity = String(t)
				node.style.transform = reduceMotion || t === 1 ? '' : `translateY(${(1 - t) * rise}px)`
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
			href="/{sport.slug}/{injury.slug}/"
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
				{#if injury.frequency === 'rare'}<span class="zone__rare"
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

	<!-- Место -- placeHint (scene/frame.ts): справа от головы или под ногами -->
	{#if hintShown && posterRect}
		<p
			class="body3d__hint"
			class:body3d__hint--below={!hintPlace.side}
			style:--hint-x="{hintPlace.x}px"
			style:--hint-y="{hintPlace.y}px"
			style:--hint-room="{hintPlace.room}px"
			transition:fadeUp={{ rise: innerWidth < 700 ? 0 : 24 }}
		>
			Нажмите на точку — откроются травмы зоны
			<button class="body3d__hint-close" type="button" aria-label="Закрыть подсказку" onclick={dismissHint}
				>{@html X}</button
			>
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

	<!-- Индекс: на странице движения -- его травмы, на главной -- поиск, фильтры и зоны.
	     Наведение на строку подсвечивает её зону на модели -->
	{#if movementPage}
		{@const total = movementInjuries.length}
		<aside class="index" class:index--away={open} inert={!!open} aria-label="Травмы движения">
			<header class="index__head">
				<!-- В Mini App путь на главную -- системная кнопка «назад» Telegram -->
				<a class="index__home" href={sport.home}
					><span class="index__home-arrow" aria-hidden="true">←</span>Все травмы</a
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
					<span aria-hidden="true">Травмы&nbsp;</span>{#if sport.sports.length > 1}<SportSwitch
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
			<!-- Поиск и фильтры. На десктопе обёртки прозрачны для раскладки, на телефоне это остров
			     внизу экрана: свёрнутым он показывает включённые фильтры, по нажатию раскрывается -->
			<div
				class="index__tools"
				class:index__tools--open={toolsOpen}
				style:--keyboard="{keyboard}px"
				onkeydown={onToolsKey}
				role="presentation"
			>
				<!-- Фон под раскрытым островом: гасит и чуть размывает экран, тап по нему сворачивает остров -->
				<div class="index__scrim" onclick={closeTools} role="presentation"></div>
				<div class="index__island">
					<button
						class="index__island-open"
						type="button"
						aria-expanded={toolsOpen}
						aria-controls="index-tools"
						onclick={openTools}
					>
						<span class="index__island-icon" aria-hidden="true">{@html Search}</span>
						<span class="index__island-label"
							>{activeFilters.length
								? activeFilters.map((f) => f.label).join(' · ')
								: 'Поиск и фильтры'}</span
						>
					</button>
					{#if filtering}
						<button
							class="index__island-reset"
							type="button"
							aria-label="Сбросить фильтры"
							onclick={resetFilters}
							><span class="index__island-icon" aria-hidden="true">{@html X}</span></button
						>
					{/if}
				</div>
				<div class="index__panel" id="index-tools" bind:this={toolsPanel}>
					<div class="index__search-row">
						<SearchField bind:value={query} placeholder="Травма или часть тела" label="Поиск по травмам" />
						<button
							class="index__panel-close"
							type="button"
							aria-label="Свернуть поиск"
							onclick={closeTools}
							><span class="index__island-icon" aria-hidden="true">{@html ChevronDown}</span></button
						>
					</div>
					<div class="index__filters">
						<div
							class="index__freq index__freq--{frequency}"
							class:index__freq--forward={thumbMoves === 'forward'}
							class:index__freq--backward={thumbMoves === 'backward'}
							role="group"
							aria-label="Частота"
							bind:this={freqGroup}
							style:--thumb-left="{thumb.left}px"
							style:--thumb-right="{thumb.right}px"
						>
							<span
								bind:this={freqThumb}
								class="index__freq-thumb"
								class:index__freq-thumb--placed={thumb.width > 0}
								aria-hidden="true"
							></span>
							{#each FREQUENCY_CHIPS as [value, label, icon], i (value)}
								<button
									bind:this={freqChips[i]}
									class="index__chip index__chip--{value}"
									type="button"
									aria-pressed={frequency === value}
									title={label}
									onclick={() => (frequency = value)}
									><span class="index__chip-icon" aria-hidden="true">{@html icon}</span><span
										class="index__chip-label">{label}</span
									></button
								>
							{/each}
						</div>
						<MovementSelect
							options={movements}
							bind:value={movement}
							label={sport.elementLabel}
							empty="любое"
						/>
					</div>
					{#if query.trim()}
						<ul class="index__results" aria-live="polite">
							{#each results as { zone, injury } (injury.slug)}
								{@const { name, alias } = splitTitle(injury.title)}
								<li>
									<a
										class="index__result"
										href="/{sport.slug}/{injury.slug}/"
										onclick={(event) => onItemClick(event, injury)}
									>
										<span class="index__result-title">{name}</span>
										<span class="index__result-zone"
											>{alias ? `${zone.label} · ${alias}` : zone.label}</span
										>
									</a>
								</li>
							{:else}
								<li class="index__empty">Ничего не нашлось</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
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
			<!-- Маленький заголовок проявляется по мере прокрутки, стили в styles/article.css. Пока
			     статья грузится, прокручивать нечего, и без visibility он стоял над тем же названием -->
			<p
				class="article-bar__title"
				aria-hidden="true"
				style:visibility={articleStatus === 'ready' ? null : 'hidden'}
			>
				{splitTitle(article.title).name}
			</p>
		</SiteHeader>
		{#if articleStatus === 'loading'}
			<!-- Пока статья грузится -- её начало из тех же классов: название и "Коротко" уже известны
			     из списка и сразу стоят на своих местах. Подмена на загруженную статью их не сдвигает -->
			<div class="reader__body" aria-hidden="true">
				<div class="article">
					<header class="article__hero">
						<h1 class="article__title">{splitTitle(article.title).name}</h1>
						<div class="article__summary">
							<p class="article__summary-label">
								<span class="article__summary-icon">{@html TextQuote}</span>Коротко
							</p>
							<p class="article__summary-text">{article.summary}</p>
						</div>
					</header>
				</div>
			</div>
		{:else if articleStatus === 'error'}
			<p class="reader__status">
				Не получилось загрузить статью. <a href="/{sport.slug}/{article.slug}/">Открыть отдельно</a>
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
			&:has(.index__tools) {
				padding-bottom: calc(max(16px, env(safe-area-inset-bottom)) + var(--tg-bottom) + 64px);
			}
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

		/* Что за сайт -- под заголовком главной, тише его и не шире колонки */
		&__lead {
			max-width: 34ch;
			margin: 10px 0 0;
			font-size: 16px;
			line-height: 1.4;
			color: var(--a-fg2);

			@media (width < 700px) {
				margin-top: 4px;
				font-size: 14px;
			}
		}

		&__lead-link {
			color: var(--a-blue);
			text-decoration: none;

			&:hover {
				text-decoration: underline;
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

		/* Контейнер для частоты: она перестраивается по ширине колонки, а не экрана */
		&__filters {
			container-type: inline-size;
			display: flex;
			flex-wrap: wrap;
			gap: 12px 20px;
			align-items: center;
		}

		/* Остров поиска и фильтров. На десктопе обёртки не участвуют в раскладке: поле, фильтры
		   и результаты стоят в колонке, как стояли */
		&__tools,
		&__panel,
		&__search-row {
			display: contents;
		}

		&__island,
		&__panel-close,
		&__scrim {
			display: none;
		}

		/* Под запросом на десктопе зоны уступают место результатам */
		&__zones--searching {
			@media (width >= 700px) {
				display: none;
			}
		}

		/* Частота -- переключатель из четырёх положений во всю ширину колонки: общая подложка без
		   рамки, невыбранные положения -- подпись в цвете уровня, выбранное -- залитая таблетка
		   со знаком. Кегль идёт за шириной колонки (cqi от &__filters): влезает и в остров на 320px */
		&__freq {
			--thumb: var(--a-fg);

			position: relative;
			display: flex;
			gap: 2px;
			width: 100%;
			padding: 3px;
			border-radius: 999px;
			font-size: clamp(11px, 5.2cqi, 15px);
			background: var(--a-fill);

			&--common {
				--thumb: var(--common);
			}

			&--uncommon {
				--thumb: var(--uncommon);
			}

			&--rare {
				--thumb: var(--rare);
			}
		}

		/* Залитая таблетка выбранного положения -- одна на весь переключатель, лежит под чипами.
		   Края ставит скрипт по выбранному чипу. Едет и перекрашивается только при смене выбора,
		   подпись и знак чипа меняются с ней в такт. Края едут порознь: передний быстро и без
		   перелёта (у крайнего чипа таблетка не вылезет за переключатель), задний с задержкой
		   и перелётом внутрь -- таблетка тянется и пружинит */
		&__freq-thumb {
			--lead: 0.26s cubic-bezier(0.3, 0.7, 0.4, 1);
			--trail: 0.46s cubic-bezier(0.34, 1.5, 0.64, 1) 0.07s;

			position: absolute;
			top: 3px;
			right: var(--thumb-right);
			bottom: 3px;
			left: var(--thumb-left);
			border-radius: 999px;
			opacity: 0;
			background: var(--thumb);

			&--placed {
				opacity: 1;
			}
		}

		&__freq--forward &__freq-thumb {
			transition:
				right var(--lead),
				left var(--trail),
				background-color 0.35s var(--a-ease);
		}

		&__freq--backward &__freq-thumb {
			transition:
				left var(--lead),
				right var(--trail),
				background-color 0.35s var(--a-ease);
		}

		&__freq--forward &__freq-thumb,
		&__freq--backward &__freq-thumb {
			@media (--reduced-motion) {
				transition: none;
			}
		}

		/* Знак и подпись лежат в одной ячейке, ширину чипа держит подпись: у выбранного она
		   прозрачна, а знак встаёт на её место. Ширина чипа от выбора не зависит -- соседи не
		   прыгают. Подпись остаётся именем кнопки и всплывает в title */
		&__chip {
			--chip: var(--a-fg);

			cursor: pointer;
			position: relative;
			display: inline-grid;
			flex: 1 1 auto;
			place-items: center;
			padding: 0.34em 0.6em;
			border: 0;
			border-radius: 999px;
			font: inherit;
			color: var(--chip);
			background: transparent;
			transition:
				color 0.35s var(--a-ease),
				background 0.3s var(--a-ease);

			@media (--reduced-motion) {
				transition: none;
			}

			/* Каждый уровень частоты в своём цвете: подпись в нём, выбранный залит им */
			&--common {
				--chip: var(--common);
			}

			&--uncommon {
				--chip: var(--uncommon);
			}

			&--rare {
				--chip: var(--rare);
			}

			/* Фон выбранного рисует общая подложка под чипами */
			&[aria-pressed='true'] {
				color: var(--a-bg);
			}

			&:hover:not([aria-pressed='true']) {
				background: color-mix(in srgb, var(--chip) 12%, transparent);
			}

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: 2px;
			}
		}

		&__chip-icon,
		&__chip-label {
			grid-area: 1 / 1;
			transition:
				opacity 0.35s var(--a-ease),
				scale 0.35s var(--a-ease);

			@media (--reduced-motion) {
				transition: none;
			}
		}

		&__chip-label {
			white-space: nowrap;
		}

		&__chip-icon {
			scale: 0.6;
			display: inline-flex;
			width: 1em;
			height: 1em;
			opacity: 0;

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				width: 100%;
				height: 100%;
				fill: currentcolor;
			}
		}

		&__chip[aria-pressed='true'] &__chip-icon {
			scale: 1;
			opacity: 1;
		}

		&__chip[aria-pressed='true'] &__chip-label {
			opacity: 0;
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
			letter-spacing: -0.02em;
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

	/* Телефон: таблетка по центру над нижним краем, в зоне большого пальца. Шторке остаются
	   заголовок и зоны, модели -- больше места */
	@media (width < 700px) {
		.index__tools {
			position: fixed;
			z-index: 5;
			bottom: calc(max(16px, env(safe-area-inset-bottom)) + var(--tg-bottom) + var(--keyboard, 0px));
			left: 50%;
			translate: -50% 0;
			display: block;
			max-width: calc(100% - 32px);
		}

		.index__island,
		.index__panel {
			border-radius: 999px;
			background: color-mix(in srgb, var(--a-bg) 72%, transparent);
			-webkit-backdrop-filter: blur(12px);
			backdrop-filter: blur(12px);
			box-shadow:
				0 8px 24px rgb(0 0 0 / 18%),
				inset 0 0 0 1px var(--a-fill);
		}

		.index__island {
			display: flex;
			gap: 2px;
			align-items: center;
			padding: 4px;
		}

		.index__island-open,
		.index__island-reset {
			cursor: pointer;
			display: inline-flex;
			flex: none;
			gap: 8px;
			align-items: center;
			justify-content: center;
			height: 40px;
			border: 0;
			border-radius: 999px;
			font: inherit;
			font-size: 15px;
			font-weight: 600;
			color: var(--a-fg);
			background: none;

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: -2px;
			}
		}

		.index__island-open {
			flex: 1 1 auto;
			min-width: 0;
			padding: 0 16px 0 14px;
		}

		.index__island-reset {
			width: 40px;
			color: var(--a-fg2);
			background: var(--a-fill);
		}

		.index__island-label {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.index__island-icon {
			display: inline-flex;
			flex: none;
			width: 18px;
			height: 18px;

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				width: 100%;
				height: 100%;
				stroke-width: 2.2;
			}
		}

		.index__panel {
			display: none;
		}

		/* Раскрытый остров -- карточка во всю ширину: результаты, под ними поле с фокусом и фильтры.
		   Карточка прижата к низу и растёт вверх: поле стоит у клавиатуры и не уезжает, когда
		   появляются результаты, а до них дотягивается палец, без прокрутки под клавиатуру */
		.index__tools--open {
			right: 12px;
			left: 12px;
			translate: none;
			max-width: none;

			& .index__island {
				display: none;
			}

			& .index__panel {
				transform-origin: 50% 100%;
				display: flex;
				flex-direction: column;
				gap: 14px;
				max-height: calc(
					100dvh - var(--keyboard, 0px) - var(--theme-toggle-top) - var(--header-row) - 32px -
						max(16px, env(safe-area-inset-bottom)) - var(--tg-bottom)
				);
				padding: 8px 12px 16px 16px;
				border-radius: 24px;
				animation: island-grow 0.3s var(--a-ease) both;

				@media (--reduced-motion) {
					animation-name: fade-in;
				}
			}

			& .index__results {
				flex: 1 1 auto;
				order: -1;
				min-height: 0;
				max-height: none;
				margin-top: 8px;
				padding-bottom: 4px;
			}

			/* Под карточкой экран гаснет и чуть размывается: внимание на поиске, а модель и шторка
			   уходят на второй план. Слой внутри острова, под карточкой, но поверх всей сцены */
			& .index__scrim {
				position: fixed;
				z-index: -1;
				inset: 0;
				display: block;
				background: color-mix(in srgb, var(--a-bg) 45%, transparent);
				-webkit-backdrop-filter: blur(6px);
				backdrop-filter: blur(6px);
				animation: fade-in 0.3s var(--a-ease) both;

				@media (prefers-reduced-transparency: reduce) {
					backdrop-filter: none;
				}
			}

			/* Результаты в острове -- одной строкой и мельче: над клавиатурой места мало, а часть
			   тела видна по самому названию */
			& .index__result {
				padding: 8px 0;
			}

			& .index__result-title {
				overflow: hidden;
				min-width: 0;
				font-size: 16px;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			& .index__result-zone {
				display: none;
			}

			/* Свернуть -- иконкой в строке поиска, а не кнопкой "Готово" отдельной строкой внизу:
			   карточка ниже на эту строку */
			& .index__search-row {
				display: flex;
				gap: 6px;
				align-items: center;

				/* Корень SearchField -- чужой компонент: без :global селектор получал наш хэш и не
				   срабатывал, поле стояло по ширине текста */
				& > :global(:first-child) {
					flex: 1;
					min-width: 0;
				}
			}

			& .index__panel-close {
				cursor: pointer;
				display: inline-grid;
				flex: none;
				place-items: center;
				width: 40px;
				height: 40px;
				padding: 0;
				border: 0;
				border-radius: 50%;
				color: var(--a-fg2);
				background: var(--a-fill);

				&:focus-visible {
					outline: 2px solid var(--a-blue);
					outline-offset: 2px;
				}
			}

			/* Чипы частоты под палец: не меньше 40 на 40 */
			& .index__chip {
				min-width: 40px;
				min-height: 40px;
			}

			& .index__filters :global(.pselect__button) {
				min-height: 40px;
			}
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

			/* Под строками та же подложка, что у колонки на десктопе: полупрозрачная, с размытием,
			   к зоне растворяется по smoothstep. Сверху своей подложки нет: там тот же
			   полупрозрачный край шапки сцены, и модель видна под заголовком */
			&::before {
				inset: 0;
				background: color-mix(in srgb, var(--a-bg) 72%, transparent);
				-webkit-backdrop-filter: blur(12px);
				backdrop-filter: blur(12px);
				mask-image: linear-gradient(
					to top,
					rgb(0 0 0 / 100%) 44%,
					rgb(0 0 0 / 93%) 47.7%,
					rgb(0 0 0 / 74%) 51.3%,
					rgb(0 0 0 / 50%) 55%,
					rgb(0 0 0 / 26%) 58.7%,
					rgb(0 0 0 / 7%) 62.3%,
					rgb(0 0 0 / 0%) 66%
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
			&--uncommon,
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

			&--uncommon {
				color: var(--uncommon);
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

		/* На телефоне строки прилипают к верху списка, текущая травма -- прилипшая. Снизу запас почти
		   на высоту списка: иначе последние строки до верха не доезжали и стать текущими не могли */
		&--bottom &__list {
			scroll-padding-top: 14px;
			scroll-snap-type: y mandatory;
			flex: none;
			height: 50dvh;
			margin-top: auto;
			padding-bottom: calc(50dvh - 140px);
		}

		&--bottom &__row {
			scroll-snap-align: start;
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
			color: var(--a-on-blue);
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

			/* Название и "Коротко" стоят с начала загрузки, пришедшее следом проявляется: иначе
			   текст выскакивал разом, будто страница рендерится кусками. backwards, а не both:
			   после конца анимация не держит opacity и не мешает липкому оглавлению */
			& :global(.article__hero > :not(.article__title, .article__summary)),
			& :global(.article > :not(.article__hero)) {
				animation: fade-in 0.5s var(--a-ease) backwards;
			}
		}

		/* Подвал приходит вместе со статьёй и проявляется с ней */
		& :global(.footer) {
			animation: fade-in 0.5s var(--a-ease) backwards;
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

	@keyframes island-grow {
		from {
			transform: scale(0.94);
			opacity: 0;
		}
	}
</style>
