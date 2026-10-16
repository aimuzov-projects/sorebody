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
	import { onMount, tick } from 'svelte'

	import { PersonStanding, Search } from 'lucide-static'

	import { initReading } from '#frontend/lib/reading.ts'
	import { BACK_EVENT, STEP_EVENT } from '#frontend/lib/telegram-events.ts'
	import type { BodyScene } from '#frontend/scene/body-scene.ts'
	import type { Zone } from '#frontend/scene/zones.ts'

	type Props = {
		zones: Zone[]
		whole: Zone
		/** Движения, которые встречаются хотя бы в одной статье: варианты фильтра. */
		movements: { slug: string; title: string }[]
		modelUrl: string
	}
	type Injury = Zone['injuries'][number]

	let { zones, whole, movements, modelUrl }: Props = $props()

	const FREQUENCIES = [
		['all', 'Все'],
		['common', 'Частые'],
		['rare', 'Редкие'],
	] as const

	/** Фильтры индекса. Они же решают, какие травмы видны в списке зоны и какие точки горят на модели. */
	let query = $state('')
	let frequency = $state<'all' | 'common' | 'rare'>('all')
	let movement = $state('')

	const normalize = (s: string) => s.toLowerCase().replaceAll('ё', 'е').trim()

	function matches(injury: Injury) {
		const q = normalize(query)

		return (
			(frequency === 'all' || injury.rare === (frequency === 'rare')) &&
			(!movement || injury.movements.includes(movement)) &&
			(!q || normalize(`${injury.title} ${injury.titleEn} ${injury.summary}`).includes(q))
		)
	}

	const allZones = $derived([...zones, whole])
	const filtering = $derived(query.trim() !== '' || frequency !== 'all' || movement !== '')
	const counts = $derived(new Map(allZones.map((zone) => [zone, zone.injuries.filter(matches).length])))
	const results = $derived(
		query.trim()
			? allZones.flatMap((zone) => zone.injuries.filter(matches).map((injury) => ({ zone, injury })))
			: [],
	)

	/** Зона, на строку которой навели в индексе: её точки на модели подсвечиваются. */
	let highlighted = $state.raw<Zone | null>(null)

	function setHighlight(zone: Zone | null) {
		highlighted = zone
		body?.glow(zone === whole)
	}

	/** Радиус "магнита" вокруг точки зоны, пиксели. */
	const PICK_PX = 56
	/** Сколько гаснет сцена перед статьёй; после этого рендер останавливается. */
	const SCENE_FADE_MS = 450

	let wrap: HTMLDivElement
	let canvas: HTMLCanvasElement
	let body: BodyScene | undefined
	let status = $state<'loading' | 'ready' | 'error'>('loading')
	let fps = $state(0)
	const showFps = typeof location !== 'undefined' && new URLSearchParams(location.search).has('fps')
	const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

	type Spot = { zone: Zone; index: number; x: number; y: number; visible: boolean }

	const spots: Spot[] = $derived(
		zones.flatMap((zone) => zone.points.map((_, index) => ({ zone, index, x: 0, y: 0, visible: true }))),
	)
	let spotEls = $state<HTMLButtonElement[]>([])

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
	let backButton = $state<HTMLButtonElement>()
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
		document.documentElement.dataset.step = article ? 'article' : open ? 'zone' : 'scene'
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

		// Под статьёй держим её зону раскрытой: "Назад" вернёт к тому же списку и кадру
		if (open?.zone !== place.zone) showZone(place.zone, 0)

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

		if (level === 0) return

		if (level > baseLevel) {
			history.back()

			return
		}

		// Зону берём из адреса статьи: модель могла ещё не загрузиться и не раскрыть её
		const parent =
			place.level === 2
				? zoneHash(place.zone, open?.zone === place.zone ? open.index : 0)
				: location.pathname + location.search

		history.replaceState(null, '', parent)
		baseLevel = level - 1
		sync()
	}

	onMount(() => {
		// Ссылка «/?region=knee» со страницы статьи открывает список зоны
		const region = new URLSearchParams(location.search).get('region')
		const regionZone = allZones.find((zone) => zone.slug === region)

		if (regionZone && !location.hash)
			history.replaceState(null, '', `${location.pathname}${zoneHash(regionZone, 0)}`)

		baseLevel = parseHash().level
		sync()
		window.addEventListener('popstate', sync)
		// Кнопка «назад» Telegram в Mini App поднимает на шаг так же, как своя «Назад»
		window.addEventListener(BACK_EVENT, up)

		let disposed = false
		let frames = 0
		let fpsFrom = performance.now()
		const mod = import('#frontend/scene/body-scene.ts')
		const ready = mod.then(async ({ createBodyScene }) => {
			const scene = await createBodyScene(canvas, modelUrl)

			if (disposed) return scene.dispose()

			body = scene
			scene.resize()

			scene.onFrame = () => {
				placeSpots()

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
			homeFrame()

			if (sceneHidden) scene.pause(true)
		})

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

		if (body) body.controls.autoRotate = !spot
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
		setHighlight(null)
		open = { zone, index, side }
		focusOpen()
	}

	/** Камера к раскрытой зоне. Отдельно от `showZone`: список работает и до загрузки модели, и без WebGL. */
	function focusOpen() {
		if (!body || !open) return

		const point = open.zone.points[open.index]
		const at = open.side === 'bottom' ? { x: 0, y: 0.14 } : { x: open.side === 'left' ? 0.12 : -0.12, y: 0 }

		body.frame(0, 0)
		body.dissolve(point.position, open.zone.radius)
		body.controls.autoRotate = false
		body.controls.enabled = false
		body.focus(point.position, clamp(0.3 / open.zone.radius, 1, 2.4), at, point.view)
	}

	function closeZone() {
		if (!open) return

		open = null
		hovered = null

		if (!body) return

		body.dissolve(null)
		body.focus(null)
		body.controls.enabled = true
		body.controls.autoRotate = true
		homeFrame()
	}

	/** Кадр главной: фигура правее индекса, на телефоне -- выше нижней панели. */
	function homeFrame() {
		if (!body || open) return

		if (wrap.clientWidth < 700) body.frame(0, 0.27, 1.9)
		else body.frame(0.17, 0)
	}

	/** Статья на весь экран: сцена гаснет, потом рендер встаёт целиком, а не рисует под текстом. */
	function showArticle(injury: Injury) {
		if (article?.slug === injury.slug) return

		article = injury
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
			backButton?.focus({ preventScroll: true })
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

<div
	class="body3d"
	class:body3d--open={open}
	class:body3d--hidden={sceneHidden}
	class:body3d--hot={hovered && !open}
	bind:this={wrap}
	onpointermove={onPointerMove}
	onpointerdown={onPointerDown}
	onpointerup={onPointerUp}
	onpointerleave={() => !open && hover(null)}
	role="presentation"
>
	<canvas class="body3d__canvas" bind:this={canvas} aria-label="Фигура человека: выберите зону тела"></canvas>

	{#if status !== 'ready' && !open}
		<p class="body3d__status">
			{status === 'loading'
				? 'Загружаем модель…'
				: 'Не получилось показать 3D: ваш браузер не поддерживает WebGL.'}
		</p>
	{/if}

	{#each spots as spot, i (i)}
		<button
			class="body3d__spot"
			class:body3d__spot--hover={hovered === spot || highlighted === spot.zone}
			class:body3d__spot--empty={counts.get(spot.zone) === 0}
			bind:this={spotEls[i]}
			type="button"
			hidden={status !== 'ready'}
			aria-label="{spot.zone.label}: {counts.get(spot.zone)} {plural(counts.get(spot.zone) ?? 0)}"
			onclick={() => openZone(spot.zone, spot.index)}
			onfocus={() => hover(spot)}
		>
			<span class="body3d__spot-dot"></span>
			<span class="body3d__spot-count" aria-hidden="true">{counts.get(spot.zone)}</span>
		</button>
	{/each}

	<!-- Индекс главной: поиск, фильтры и зоны. Наведение на зону подсвечивает её точки на модели -->
	<aside class="index" class:index--away={open} aria-label="Поиск и зоны тела">
		<header class="index__head">
			<p class="index__brand">Wodcare</p>
			<p class="index__title" aria-hidden="true">Травмы в кроссфите</p>
		</header>
		<label class="index__search">
			<span class="index__icon" aria-hidden="true">{@html Search}</span>
			<input
				class="index__input"
				type="search"
				placeholder="ПКС, плечо, рабдо…"
				aria-label="Поиск по травмам"
				bind:value={query}
			/>
		</label>
		<div class="index__filters">
			<div class="index__freq" role="group" aria-label="Частота">
				{#each FREQUENCIES as [value, label] (value)}
					<button
						class="index__chip"
						type="button"
						aria-pressed={frequency === value}
						onclick={() => (frequency = value)}>{label}</button
					>
				{/each}
			</div>
			<label class="index__movement">
				<span class="index__movement-label">Движение</span>
				<select class="index__select" bind:value={movement}>
					<option value="">любое</option>
					{#each movements as m (m.slug)}
						<option value={m.slug}>{m.title}</option>
					{/each}
				</select>
			</label>
		</div>
		{#if query.trim()}
			<ul class="index__results" aria-live="polite">
				{#each results as { zone, injury } (injury.slug)}
					<li>
						<a
							class="index__result"
							href="/injuries/{injury.slug}/"
							onclick={(event) => onItemClick(event, injury)}
						>
							<span class="index__result-title">{injury.title}</span>
							<span class="index__result-zone">{zone.label}</span>
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
					<li class="index__zone-row" class:index__zone-row--whole={zone === whole}>
						<button
							class="index__zone"
							type="button"
							disabled={count === 0}
							onclick={() => openZone(zone, 0)}
							onpointerenter={() => setHighlight(zone)}
							onpointerleave={() => setHighlight(null)}
							onfocus={() => setHighlight(zone)}
							onblur={() => setHighlight(null)}
						>
							{#if zone === whole}<span class="index__icon" aria-hidden="true"
									>{@html PersonStanding}</span
								>{/if}
							<span class="index__zone-label">{zone.label}</span>
							<span class="index__count">{count}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		<p class="index__foot">
			<a class="index__link" href="/about/">О справочнике</a> · справка не заменяет консультацию врача
		</p>
	</aside>

	{#if open}
		{@const total = open.zone.injuries.length}
		{@const shown = open.zone.injuries.filter(matches)}
		<section class="zone zone--{open.side}" aria-label={open.zone.label}>
			<header class="zone__head">
				<button class="zone__back" type="button" onclick={up}><span aria-hidden="true">←</span> Назад</button>
				<h2 class="zone__title">{open.zone.label}</h2>
				<p class="zone__count">
					{filtering
						? `${shown.length} из ${total} ${plural(total)} по фильтру`
						: `${total} ${plural(total)}`}
				</p>
			</header>
			<ul class="zone__list">
				{#each shown as injury, i (injury.slug)}
					{@const [head, tail] = splitLastWord(injury.title)}
					<li class="zone__row" style:--i={i}>
						<a
							class="zone__item"
							href="/injuries/{injury.slug}/"
							onclick={(event) => onItemClick(event, injury)}
						>
							<span class="zone__name">
								{head}<span class="zone__tail"
									>{tail}<span class="zone__arrow" aria-hidden="true">→</span></span
								>
							</span>
							<span class="zone__summary">
								{#if injury.rare}<span class="zone__rare">Редко ·</span>{/if}
								{injury.summary}
							</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if showFps}
		<output class="body3d__fps">{fps} fps</output>
	{/if}
</div>

{#if article}
	<article
		class="reader"
		bind:this={readerElement}
		transition:fadeUp
		aria-label={article.title}
		aria-busy={articleStatus === 'loading'}
	>
		<div class="reader__progress" aria-hidden="true">
			<span class="reader__progress-bar" bind:this={progressBar}></span>
		</div>
		<div class="reader__bar">
			<button class="reader__back" type="button" bind:this={backButton} onclick={up}>
				<span aria-hidden="true">←</span> Назад
			</button>
		</div>
		{#if articleStatus === 'loading'}
			<p class="reader__status">Загружаем статью…</p>
		{:else if articleStatus === 'error'}
			<p class="reader__status">
				Не получилось загрузить статью. <a href="/injuries/{article.slug}/">Открыть отдельно</a>
			</p>
		{/if}
		<div class="reader__body" bind:this={articleBody} hidden={articleStatus !== 'ready'}></div>
	</article>
{/if}

<style>
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

			&:active {
				cursor: grabbing;
			}
		}

		/* Курсор рядом с точкой зоны: клик раскроет её */
		&--hot &__canvas {
			cursor: pointer;
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

			&:global([data-hidden='true']) {
				pointer-events: none;
				opacity: 0;
			}

			/* Под фильтр в зоне ничего не попало: точка гаснет и не нажимается */
			&--empty {
				pointer-events: none;
				opacity: 0;
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
				transform 0.4s var(--a-ease),
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

		&__spot--hover &__spot-dot {
			transform: scale(1.2);
			box-shadow:
				0 0 0 3px var(--a-blue),
				0 2px 8px rgb(0 0 0 / 25%);
		}

		/* Сколько травм зоны проходит фильтр -- цифра справа от точки. Цвет один для обеих тем:
		   цифра почти всегда лежит на белой фигуре, а не на фоне */
		&__spot-count {
			pointer-events: none;
			position: absolute;
			top: 50%;
			left: 30px;
			transform: translateY(-50%);
			font-size: 13px;
			font-weight: 600;
			font-variant-numeric: tabular-nums;
			color: #6e6e73;
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
		left: 6vw;
		display: flex;
		flex-direction: column;
		gap: 20px;
		width: min(380px, 32vw);
		padding-top: calc(max(32px, 7dvh) + var(--tg-top));
		transition:
			opacity 0.45s var(--a-ease),
			transform 0.45s var(--a-ease);

		@media (width < 700px) {
			top: auto;
			right: 0;
			left: 0;
			gap: 14px;
			width: auto;
			max-height: 56dvh;
			padding: 28px 20px calc(max(16px, env(safe-area-inset-bottom)) + var(--tg-bottom));

			&::before {
				inset: -40px 0 0;
				background: linear-gradient(to top, var(--a-bg) 70%, transparent);
			}

			&--away {
				transform: translateY(16px);
			}
		}

		@media (width < 700px) {
			/* На телефоне зоны -- строка с горизонтальной прокруткой, края гаснут маской */
			&__zones {
				overflow: auto hidden;
				display: flex;
				flex: none;
				gap: 22px;
				padding: 4px 0;
				mask-image: linear-gradient(to right, #000000 85%, transparent);
			}

			&__results {
				max-height: 26dvh;
				padding-bottom: 32px;
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
			left: -6vw;
			background: linear-gradient(to right, var(--a-bg) 60%, transparent);
		}

		&--away {
			pointer-events: none;
			transform: translateX(-16px);
			opacity: 0;

			@media (--reduced-motion) {
				transform: none;
			}
		}

		&__head {
			display: grid;
			gap: 2px;
		}

		&__brand {
			margin: 0;
			font-size: 15px;
			font-weight: 600;
			color: var(--a-fg2);
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

		/* Поле поиска без рамки: снизу тонкая линия, гаснущая к краям, при фокусе -- синяя */
		&__search {
			display: flex;
			gap: 10px;
			align-items: center;
			padding: 8px 0 10px;
			background: linear-gradient(to right, transparent, var(--a-sep) 12%, var(--a-sep) 88%, transparent) bottom /
				100% 1px no-repeat;
			transition: background-size 0.3s var(--a-ease);

			&:focus-within {
				background-image: linear-gradient(
					to right,
					transparent,
					var(--a-blue) 12%,
					var(--a-blue) 88%,
					transparent
				);
			}
		}

		&__input {
			flex: 1;
			min-width: 0;
			padding: 0;
			border: 0;
			font: inherit;
			font-size: 19px;
			color: var(--a-fg);
			background: none;
			outline: none;

			&::placeholder {
				color: var(--a-fg2);
				opacity: 0.8;
			}
		}

		&__filters {
			display: flex;
			flex-wrap: wrap;
			gap: 8px 20px;
			align-items: baseline;
		}

		/* Частота: слова через точку, выбранное -- основным цветом и жирнее */
		&__freq {
			display: flex;
			gap: 14px;
		}

		&__chip {
			cursor: pointer;
			padding: 2px 0;
			border: 0;
			font: inherit;
			font-size: 16px;
			color: var(--a-fg2);
			background: none;
			transition: color 0.3s var(--a-ease);

			&[aria-pressed='true'] {
				font-weight: 600;
				color: var(--a-fg);
			}

			&:hover {
				color: var(--a-fg);
			}

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: 2px;
			}
		}

		&__movement {
			display: inline-flex;
			gap: 6px;
			align-items: baseline;
			font-size: 16px;
			color: var(--a-fg2);
		}

		&__select {
			cursor: pointer;
			max-width: 220px;
			padding: 2px 0;
			border: 0;
			font: inherit;
			color: var(--a-blue);
			text-overflow: ellipsis;
			appearance: none;
			background: none;

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: 2px;
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
			padding: 12px 0 18dvh;
			list-style: none;
			mask-image: linear-gradient(to bottom, transparent, #000000 16px, #000000 calc(100% - 96px), transparent);
		}

		&__zone-row--whole {
			margin-top: 18px;

			@media (width < 700px) {
				margin-top: 0;
			}
		}

		&__zone {
			cursor: pointer;
			display: flex;
			gap: 10px;
			align-items: center;
			width: 100%;
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
				padding: 6px 0;
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

		&__count {
			margin-left: auto;
			font-size: 15px;
			font-weight: 500;
			font-variant-numeric: tabular-nums;
			color: var(--a-fg2);

			@media (width < 700px) {
				margin-left: 0;
			}
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

		&__foot {
			margin: 0 0 24px;
			font-size: 13px;
			color: var(--a-fg2);

			@media (width < 700px) {
				display: none;
			}
		}

		&__link {
			color: var(--a-blue);
			text-decoration: none;
		}
	}

	/* Список зоны в свободной половине экрана. Подложки нет: фон сцены растворяется
	   к центру градиентом, строки гаснут к краям скролла маской */
	.zone {
		position: absolute;
		top: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		width: min(440px, calc(50vw - 32px - 4vw));
		animation: fade-in 0.5s var(--a-ease) both;

		/* Наведённая строка остаётся, остальные отходят на второй план. Условие -- курсор
		   на самой строке, а не на списке: в пустом отступе под строками гасло всё сразу,
		   а на телефоне после тапа залипало. Поэтому и только для мыши */
		@media (hover: hover) {
			&__list:has(&__item:hover) &__item:not(:hover) {
				opacity: 0.4;
			}
		}

		&::before {
			pointer-events: none;
			content: '';
			position: absolute;
			z-index: -1;
			top: 0;
			bottom: 0;
		}

		/* Колонка вплотную к зоне: зона у центра экрана, список начинается сразу за ним.
		   Подложка под текстом растворяется к зоне градиентом и уходит до края экрана */
		&--left {
			right: calc(50% + 32px);

			&::before {
				right: -3vw;
				left: -50vw;
				background: linear-gradient(to left, transparent, var(--a-bg) 5vw);
			}
		}

		&--right {
			left: calc(50% + 32px);

			&::before {
				right: -50vw;
				left: -3vw;
				background: linear-gradient(to right, transparent, var(--a-bg) 5vw);
			}
		}

		/* Телефон: шапка прибита к верху, строки -- в нижней половине под зоной */
		&--bottom {
			right: 0;
			left: 0;
			width: auto;
			padding-inline: 24px;

			&::before {
				inset: 0;
				background:
					linear-gradient(to bottom, var(--a-bg) 14%, transparent 26%),
					linear-gradient(to top, var(--a-bg) 46%, transparent 62%);
			}
		}

		&__head {
			flex: none;
			padding-top: calc(max(32px, 7dvh) + var(--tg-top));
		}

		&__back {
			cursor: pointer;
			margin: 0 0 16px -2px;

			padding: 4px 2px;
			border: 0;
			font: inherit;
			color: var(--a-blue);
			background: none;
			transition: opacity 0.3s var(--a-ease);

			/* В Mini App своя «Назад» не нужна: у Telegram есть системная кнопка */
			:global([data-telegram]) & {
				display: none;
			}

			&:hover {
				opacity: 0.7;
			}

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: 2px;
			}
		}

		&__title {
			margin: 0;
			font-size: clamp(32px, 4vw, 48px);
			font-weight: 700;
			line-height: 1.08;
			letter-spacing: -0.03em;
		}

		&__count {
			margin: 6px 0 0;
			font-size: 17px;
			color: var(--a-fg2);
		}

		/* Скроллятся только строки, к краям они гаснут маской, а не обрезаются */
		&__list {
			scrollbar-width: none;
			overflow-y: auto;
			overscroll-behavior: contain;
			flex: 1;
			margin: 12px 0 0;
			padding: 28px 0 22dvh;
			list-style: none;
			mask-image: linear-gradient(to bottom, transparent, #000000 36px, #000000 calc(100% - 120px), transparent);
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

		&__item {
			display: grid;
			gap: 4px;
			padding: 14px 0;
			color: var(--a-fg);
			text-decoration: none;
			transition:
				opacity 0.35s var(--a-ease),
				color 0.35s var(--a-ease);

			&:focus-visible {
				color: var(--a-blue);
				outline: none;
			}
		}

		&__list:has(&__item:focus-visible) &__item:not(:focus-visible) {
			opacity: 0.4;
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

		/* Редкие травмы отмечены словом, а не цветной точкой: точка читалась как уведомление */
		&__rare {
			font-weight: 600;
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
		position: fixed;
		z-index: 2;
		inset: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		background: var(--a-page);

		&__bar {
			position: sticky;
			z-index: 1;
			top: 0;
			max-width: 1052px;
			margin: 0 auto;
			padding: calc(20px + var(--tg-top)) 24px 20px;
			background: linear-gradient(to bottom, var(--a-page) 55%, transparent);
		}

		&__back {
			cursor: pointer;
			margin-left: -2px;

			padding: 4px 2px;
			border: 0;
			font: inherit;
			font-size: 17px;
			color: var(--a-blue);
			background: none;
			transition: opacity 0.3s var(--a-ease);

			:global([data-telegram]) & {
				display: none;
			}

			&:hover {
				opacity: 0.7;
			}

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: 2px;
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

			/* Под липкой полосой с "Назад": статье меньше верхнего отступа, оглавлению и
			   якорям разделов -- запас на её высоту */
			& :global(.article) {
				padding-top: 8px;
			}

			& :global(.article__toc) {
				top: calc(76px + var(--tg-top));
			}

			& :global(.article-section) {
				scroll-margin-top: calc(84px + var(--tg-top));
			}
		}

		/* Полоса прогресса чтения: тонкая, у верхнего края, рядом с "Назад" */
		&__progress {
			pointer-events: none;
			position: fixed;
			z-index: 2;
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
