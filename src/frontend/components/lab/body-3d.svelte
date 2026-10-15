<script lang="ts" module>
	function plural(n: number) {
		const mod10 = n % 10
		const mod100 = n % 100

		if (mod10 === 1 && mod100 !== 11) return 'травма'

		if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'травмы'

		return 'травм'
	}
</script>

<script lang="ts">
	import { onMount, tick } from 'svelte'

	import type { BodyScene } from '#frontend/lab/body-scene.ts'
	import type { LabZone } from '#frontend/lab/zones.ts'

	type Props = { zones: LabZone[]; whole: LabZone; modelUrl: string }

	let { zones, whole, modelUrl }: Props = $props()

	/** Выдержка наведения до раскрытия меню: сначала растворяется ткань, потом меню. */
	const HOVER_OPEN_MS = 450
	/** Радиус "магнита" вокруг точки зоны, пиксели. */
	const PICK_PX = 56
	const RING_OUTER = 150
	const RING_INNER = 62

	let wrap: HTMLDivElement
	let canvas: HTMLCanvasElement
	let body: BodyScene | undefined
	let status = $state<'loading' | 'ready' | 'error'>('loading')
	let fps = $state(0)
	const showFps = typeof location !== 'undefined' && new URLSearchParams(location.search).has('fps')

	type Spot = { zone: LabZone; index: number; x: number; y: number; visible: boolean }

	const spots: Spot[] = $derived(
		zones.flatMap((zone) => zone.points.map((_, index) => ({ zone, index, x: 0, y: 0, visible: true }))),
	)
	let spotEls = $state<HTMLButtonElement[]>([])

	let hovered = $state<Spot | null>(null)
	let open = $state<{ zone: LabZone; point: LabZone['points'][number]; x: number; y: number } | null>(null)
	let activeSector = $state(-1)
	let hoverTimer: ReturnType<typeof setTimeout> | undefined

	type Article = { zone: LabZone; point: LabZone['points'][number]; slug: string; title: string }

	let article = $state<Article | null>(null)
	let articleStatus = $state<'loading' | 'ready' | 'error'>('loading')
	let articleBody = $state<HTMLDivElement>()
	let closeButton = $state<HTMLButtonElement>()
	// Своя запись в истории: тогда крестик и Esc закрывают статью через history.back()
	let pushed = false
	let loadToken = 0
	const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

	onMount(() => {
		openFromHash()
		window.addEventListener('popstate', openFromHash)

		let disposed = false
		let frames = 0
		let fpsFrom = performance.now()
		const mod = import('#frontend/lab/body-scene.ts')
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

			if (article) recede(article)
		})

		ready.catch((error) => {
			console.error(error)
			status = 'error'
		})

		const resizer = new ResizeObserver(() => body?.resize())

		resizer.observe(canvas)
		// Вне экрана сцена не рисует, чтобы не греть телефон
		const visibility = new IntersectionObserver(([entry]) => body?.pause(!entry.isIntersecting))

		visibility.observe(canvas)

		return () => {
			window.removeEventListener('popstate', openFromHash)
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
			spot.visible = body.facing(point.normal) > -0.3
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

	function hover(spot: Spot | null) {
		if (open || spot === hovered) return

		hovered = spot
		clearTimeout(hoverTimer)

		if (!body) return

		if (!spot) {
			body.dissolve(null)
			body.controls.autoRotate = true

			return
		}

		const point = spot.zone.points[spot.index]

		body.dissolve(point.position, spot.zone.radius)
		body.controls.autoRotate = false
		hoverTimer = setTimeout(() => openMenu(spot), HOVER_OPEN_MS)
	}

	function openMenu(spot: Spot | null, zone = spot?.zone) {
		if (!zone || !body) return

		clearTimeout(hoverTimer)
		const point = spot ? zone.points[spot.index] : zone.points[0]

		body.dissolve(point.position, zone.radius)
		body.controls.autoRotate = false
		body.controls.enabled = false
		const { width: w, height: h } = wrap.getBoundingClientRect()
		const margin = RING_OUTER + 8
		// Камера наезжает на зону и ставит её левее центра, кольцо встаёт справа.
		// На узком экране сбоку места нет: зона уходит наверх, кольцо -- вниз
		const wide = w >= 2 * margin + 260
		const at = wide ? { x: -0.16, y: 0 } : { x: 0, y: 0.5 - 150 / h }

		body.focus(point.position, clamp(0.3 / zone.radius, 1, 2.4), at)

		open = wide
			? { zone, point, x: clamp(w / 2 + at.x * w + RING_OUTER + 90, margin, w - margin), y: h / 2 }
			: { zone, point, x: w / 2, y: h - margin }

		activeSector = -1
	}

	function closeMenu() {
		open = null
		hovered = null
		activeSector = -1

		if (!body) return

		body.dissolve(null)
		body.focus(null)
		body.controls.enabled = true
		body.controls.autoRotate = true
	}

	function findInjury(slug: string) {
		for (const zone of [...zones, whole]) {
			const injury = zone.injuries.find((i) => i.slug === slug)

			if (injury) return { zone, injury }
		}
	}

	/** Хеш адреса -- источник правды: статья открыта, пока в нём её slug. */
	function openFromHash() {
		const found = findInjury(decodeURIComponent(location.hash.slice(1)))

		if (found) {
			const point = article?.zone === found.zone ? article.point : found.zone.points[0]

			openArticle(found.zone, point, found.injury, false)
		} else if (article) {
			pushed = false
			closeArticle()
		}
	}

	function openArticle(
		zone: LabZone,
		point: LabZone['points'][number],
		injury: { slug: string; title: string },
		push = true,
	) {
		if (article?.slug === injury.slug) return

		clearTimeout(hoverTimer)
		open = null
		hovered = null
		article = { zone, point, ...injury }

		if (push) {
			history.pushState(null, '', `#${injury.slug}`)
			pushed = true
		}

		recede(article)
		void loadArticle(injury.slug)
	}

	/** Сцена уходит вглубь: зона остаётся раскрытой, камера отъезжает, фигура медленно крутится. */
	function recede({ zone, point }: Article) {
		if (!body) return

		const { width: w } = wrap.getBoundingClientRect()

		body.dissolve(point.position, zone.radius)
		body.controls.enabled = false
		body.controls.autoRotate = true
		body.controls.autoRotateSpeed = 0.35

		if (reduceMotion) return body.focus(null)

		// Широкий экран: панель справа, фигура видна слева. Телефон: зона в полоске над панелью
		if (w >= 1000) body.focus([0, 0.9, 0], 0.9, { x: -0.34, y: 0 })
		else if (w < 600) body.focus(point.position, 1.6, { x: 0, y: 0.44 })
		else body.focus([0, 0.9, 0], 0.85)
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

			await tick()

			if (token !== loadToken || !articleBody) return

			articleBody.replaceChildren(document.importNode(main, true))
			articleBody.parentElement?.scrollTo(0, 0)
			articleStatus = 'ready'
			closeButton?.focus({ preventScroll: true })
		} catch (error) {
			if (token !== loadToken) return

			console.error(error)
			articleStatus = 'error'
		}
	}

	/** Крестик и Esc: если запись в истории наша -- назад, popstate закроет статью. */
	function requestCloseArticle() {
		if (pushed) {
			history.back()

			return
		}

		history.replaceState(null, '', location.pathname + location.search)
		closeArticle()
	}

	function closeArticle() {
		article = null
		loadToken++

		if (!body) return

		body.controls.autoRotateSpeed = 0.6
		closeMenu()
	}

	/**
	 * Панель выезжает снизу; при reduced motion только проявляется. Через `tick`, а не `css`:
	 * `css` вставляет в страницу тег стилей с keyframes, а CSP сайта такое блокирует.
	 */
	function panelIn(node: HTMLElement) {
		return {
			duration: reduceMotion ? 200 : 520,
			easing: (t: number) => 1 - (1 - t) ** 3,
			tick: (t: number) => {
				node.style.opacity = String(t)
				node.style.transform = reduceMotion || t === 1 ? '' : `translateY(${(1 - t) * 56}px)`
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
		if (event.pointerType !== 'mouse' || status !== 'ready' || article) return

		const { x, y } = local(event)

		if (open) {
			const d = Math.hypot(x - open.x, y - open.y)

			activeSector = d > RING_INNER * 0.6 && d < RING_OUTER + 30 ? sectorAt(x - open.x, y - open.y) : -1

			return
		}

		if (event.buttons) return

		hover(nearest(x, y, PICK_PX))
	}

	let downAt: { x: number; y: number } | null = null

	function onPointerDown(event: PointerEvent) {
		downAt = local(event)
	}

	function onPointerUp(event: PointerEvent) {
		if (!downAt || status !== 'ready') return

		const { x, y } = local(event)
		const moved = Math.hypot(x - downAt.x, y - downAt.y) > 8

		downAt = null

		if (moved) return

		// Видимый край сцены за панелью работает как подложка: клик по нему закрывает статью
		if (article) return requestCloseArticle()

		if (open) {
			// Ссылка сама откроет статью, остальное кольцо -- тоже сектор, мимо кольца -- закрыть
			if ((event.target as Element).closest('a')) return

			const d = Math.hypot(x - open.x, y - open.y)

			if (d > RING_INNER * 0.6 && d < RING_OUTER + 30) {
				const injury = open.zone.injuries[sectorAt(x - open.x, y - open.y)]

				if (injury) pickInjury(injury)

				return
			}

			return closeMenu()
		}

		if (event.target !== canvas) return

		const spot = nearest(x, y, event.pointerType === 'mouse' ? PICK_PX : PICK_PX * 1.3)

		if (spot) openMenu(spot)
	}

	function onKey(event: KeyboardEvent) {
		if (event.key !== 'Escape') return

		if (article) requestCloseArticle()
		else if (open) closeMenu()
	}

	function pickInjury(injury: { slug: string; title: string }) {
		if (!open) return

		openArticle(open.zone, open.point, injury)
	}

	/** Ссылка в кольце открывает статью поверх сцены; с модификаторами -- как обычная ссылка. */
	function onItemClick(event: MouseEvent, injury: { slug: string; title: string }) {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

		event.preventDefault()
		pickInjury(injury)
	}

	function sectorAt(dx: number, dy: number) {
		const n = open!.zone.injuries.length
		const angle = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI)

		return Math.floor(((angle + Math.PI / n) % (2 * Math.PI)) / ((2 * Math.PI) / n))
	}

	/** Кольцевой сектор i из n; сектор 0 смотрит вверх. */
	function sectorPath(i: number, n: number) {
		const gap = n > 1 ? 0.035 : 0
		const step = (2 * Math.PI) / n
		const a0 = i * step - step / 2 + gap
		const a1 = i * step + step / 2 - gap
		const pt = (r: number, a: number) => `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`
		const large = a1 - a0 > Math.PI ? 1 : 0

		if (n === 1)
			return `M 0 ${-RING_OUTER} A ${RING_OUTER} ${RING_OUTER} 0 1 1 0 ${RING_OUTER} A ${RING_OUTER} ${RING_OUTER} 0 1 1 0 ${-RING_OUTER} M 0 ${-RING_INNER} A ${RING_INNER} ${RING_INNER} 0 1 0 0 ${RING_INNER} A ${RING_INNER} ${RING_INNER} 0 1 0 0 ${-RING_INNER} Z`

		return `M ${pt(RING_OUTER, a0)} A ${RING_OUTER} ${RING_OUTER} 0 ${large} 1 ${pt(RING_OUTER, a1)} L ${pt(RING_INNER, a1)} A ${RING_INNER} ${RING_INNER} 0 ${large} 0 ${pt(RING_INNER, a0)} Z`
	}

	function labelPos(i: number, n: number) {
		const a = (i * 2 * Math.PI) / n
		const r = n === 1 ? (RING_OUTER + RING_INNER) / 2 : (RING_OUTER + RING_INNER) / 2 + 4

		return { x: r * Math.sin(a), y: n === 1 ? -r : -r * Math.cos(a) }
	}

	/** Короткая подпись для сектора: без уточнений в скобках. */
	function short(title: string) {
		return title.replace(/\s*\(.*\)\s*$/, '')
	}
</script>

<svelte:window onkeydown={onKey} />

<div
	class="body3d"
	class:body3d--open={open}
	class:body3d--receded={article}
	bind:this={wrap}
	onpointermove={onPointerMove}
	onpointerdown={onPointerDown}
	onpointerup={onPointerUp}
	onpointerleave={() => !open && hover(null)}
	role="presentation"
>
	<canvas class="body3d__canvas" bind:this={canvas} aria-label="Фигура человека: наведите на зону тела"></canvas>

	{#if status !== 'ready'}
		<p class="body3d__status">
			{status === 'loading'
				? 'Загружаем модель…'
				: 'Не получилось показать 3D: ваш браузер не поддерживает WebGL.'}
		</p>
	{/if}

	{#each spots as spot, i (i)}
		<button
			class="body3d__spot"
			class:body3d__spot--hover={hovered === spot}
			bind:this={spotEls[i]}
			type="button"
			hidden={status !== 'ready'}
			aria-label={spot.zone.label}
			onclick={() => openMenu(spot)}
			onfocus={() => hover(spot)}
		>
			<span class="body3d__spot-dot"></span>
		</button>
	{/each}

	<button class="body3d__whole" type="button" hidden={status !== 'ready'} onclick={() => openMenu(null, whole)}>
		{whole.label}
	</button>

	{#if open}
		{@const n = open.zone.injuries.length}
		{@const active = open.zone.injuries[activeSector]}
		<nav class="body3d__menu" style:left="{open.x}px" style:top="{open.y}px" aria-label={open.zone.label}>
			<svg
				class="body3d__ring"
				viewBox="{-RING_OUTER - 2} {-RING_OUTER - 2} {RING_OUTER * 2 + 4} {RING_OUTER * 2 + 4}"
				aria-hidden="true"
			>
				{#each open.zone.injuries as _, i (i)}
					<path
						class="body3d__sector"
						class:body3d__sector--active={i === activeSector}
						d={sectorPath(i, n)}
					/>
				{/each}
			</svg>
			{#each open.zone.injuries as injury, i (injury.slug)}
				{@const pos = labelPos(i, n)}
				<a
					class="body3d__item"
					class:body3d__item--active={i === activeSector}
					href="/injuries/{injury.slug}/"
					onclick={(event) => onItemClick(event, injury)}
					style:transform="translate(calc({pos.x}px - 50%), calc({pos.y}px - 50%))"
					style:--delay="{i * 30}ms"
					onfocus={() => (activeSector = i)}
				>
					{short(injury.title)}
				</a>
			{/each}
			<div class="body3d__center">
				<strong class="body3d__center-title">{open.zone.label}</strong>
				<span>{active ? active.title : `${n} ${plural(n)}`}</span>
			</div>
		</nav>
	{/if}

	{#if showFps}
		<output class="body3d__fps">{fps} fps</output>
	{/if}
</div>

{#if article}
	<section class="panel" transition:panelIn aria-label={article.title} aria-busy={articleStatus === 'loading'}>
		<header class="panel__bar">
			<a class="panel__standalone" href="/injuries/{article.slug}/">Открыть отдельной страницей</a>
			<button class="panel__close" type="button" bind:this={closeButton} onclick={requestCloseArticle}>
				<span class="panel__close-icon" aria-hidden="true">×</span>
				<span class="panel__close-label">Закрыть</span>
			</button>
		</header>
		{#if articleStatus === 'loading'}
			<p class="panel__status">Загружаем статью…</p>
		{:else if articleStatus === 'error'}
			<p class="panel__status">
				Не получилось загрузить статью. <a href="/injuries/{article.slug}/">Открыть отдельно</a>
			</p>
		{/if}
		<div class="panel__body" bind:this={articleBody} hidden={articleStatus !== 'ready'}></div>
	</section>
{/if}

<style>
	.body3d {
		--porcelain-bg: #ebe8e3;
		--rim: #d98a4e;
		touch-action: pan-y;
		user-select: none;

		position: fixed;
		inset: 0;
		overflow: hidden;
		background: radial-gradient(ellipse at 50% 40%, #f6f4f0 0%, var(--porcelain-bg) 70%);

		&__canvas {
			cursor: grab;
			display: block;
			width: 100%;
			height: 100%;
			transition:
				transform 0.8s cubic-bezier(0.22, 0.8, 0.25, 1),
				filter 0.8s ease,
				opacity 0.4s ease;

			&:active {
				cursor: grabbing;
			}
		}

		/* Сцена под статьёй: отъехала, уменьшилась, размылась и потемнела */
		&--receded &__canvas {
			cursor: default;
			transform: scale(0.82);
			filter: blur(3px) brightness(0.86) saturate(0.9);

			@media (--below-sm) {
				transform: scale(0.94);
				filter: blur(1.5px) brightness(0.9);
			}

			@media (--reduced-motion) {
				transform: none;
				opacity: 0.5;
				filter: none;
				transition: opacity 0.2s ease;
			}
		}

		&--receded &__spot,
		&--receded &__whole {
			pointer-events: none;
			opacity: 0;
		}

		&__status {
			position: absolute;
			inset: 0;
			display: grid;
			place-items: center;
			margin: 0;
			padding: 24px;
			color: var(--muted);
			text-align: center;
		}

		&__spot {
			cursor: pointer;
			position: absolute;
			top: 0;
			left: 0;
			display: grid;
			place-items: center;
			width: 36px;
			height: 36px;
			margin: -18px 0 0 -18px;
			padding: 0;
			border: 0;
			background: none;
			transition: opacity 0.2s;

			&:global([data-hidden='true']) {
				pointer-events: none;
				opacity: 0;
			}

			&:focus-visible {
				border-radius: 50%;
				outline: 2px solid var(--accent);
			}
		}

		&__spot-dot {
			width: 10px;
			height: 10px;
			border-radius: 50%;
			background: var(--rim);
			box-shadow: 0 0 0 5px color-mix(in srgb, var(--rim) 25%, transparent);
			transition: transform 0.2s;
		}

		&__spot--hover &__spot-dot {
			transform: scale(1.4);
		}

		&--open &__spot,
		&--open &__whole {
			pointer-events: none;
			opacity: 0;
		}

		&__whole {
			cursor: pointer;
			position: absolute;
			bottom: 16px;
			left: 50%;
			transform: translateX(-50%);
			padding: 8px 16px;
			border: 1px solid #d8d2c8;
			border-radius: 999px;
			font: inherit;
			font-size: 0.9rem;
			color: var(--fg);
			background: #f8f6f2cc;
		}

		&__menu {
			position: absolute;
			width: 0;
			height: 0;
			animation: ring-in 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
		}

		&__ring {
			position: absolute;
			top: -152px;
			left: -152px;
			overflow: visible;
			width: 304px;
			height: 304px;
		}

		&__sector {
			fill: #1d1d1fd9;
			stroke: #ffffff26;
			stroke-width: 1;
			transition: fill 0.15s;
		}

		&__sector--active {
			fill: var(--rim);
		}

		&__item {
			position: absolute;
			top: 0;
			left: 0;
			overflow: hidden;
			display: -webkit-box;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 3;
			line-clamp: 3;
			width: 92px;
			font-size: 0.72rem;
			line-height: 1.2;
			hyphens: auto;
			color: #f5f1ea;
			text-align: center;
			text-decoration: none;
			animation: item-in 0.25s both;
			animation-delay: var(--delay);

			&:focus-visible {
				border-radius: 4px;
				outline: 2px solid #fff;
			}
		}

		&__item--active {
			color: #fff;
		}

		&__center {
			position: absolute;
			top: 0;
			left: 0;
			transform: translate(-50%, -50%);
			display: grid;
			gap: 2px;
			width: 112px;
			font-size: 0.7rem;
			line-height: 1.2;
			color: var(--fg);
			text-align: center;

			&-title {
				font-size: 0.8rem;
			}
		}

		&__fps {
			position: absolute;
			top: 10px;
			left: 12px;
			font:
				600 0.8rem/1 ui-monospace,
				monospace;
			color: var(--muted);
		}
	}

	/* Стекло поверх ушедшей вглубь сцены. Широкий экран: справа, фигура видна слева.
	   Средний: по центру. Телефон: почти весь экран, сверху полоска сцены */
	.panel {
		position: fixed;
		z-index: 2;
		inset: 4dvh 4vw 4dvh auto;
		overflow-y: auto;
		overscroll-behavior: contain;
		width: min(720px, 56vw);
		border: 1px solid #ffffff99;
		border-radius: 20px;
		background: #faf8f5b3;
		backdrop-filter: blur(18px) saturate(1.2);
		box-shadow: 0 24px 80px #2b221a33;

		@media (--below-lg) {
			inset-inline: 0;
			width: min(720px, 92vw);
			margin-inline: auto;
		}

		@media (--below-sm) {
			inset: 16dvh 0 0;
			width: auto;
			border-radius: 20px 20px 0 0;
		}

		&__bar {
			position: sticky;
			z-index: 1;
			top: 0;
			display: flex;
			gap: 12px;
			align-items: center;
			justify-content: space-between;
			padding: 12px 16px 12px 24px;
			border-bottom: 1px solid #00000010;
			font-size: 0.85rem;
			background: #faf8f5d9;
			backdrop-filter: blur(12px);
		}

		&__standalone {
			color: var(--muted);
		}

		&__close {
			cursor: pointer;
			display: inline-flex;
			gap: 6px;
			align-items: center;
			padding: 6px 12px;
			border: 1px solid #d8d2c8;
			border-radius: 999px;
			font: inherit;
			color: var(--fg);
			background: #ffffffcc;
		}

		&__close-icon {
			font-size: 1.2rem;
			line-height: 1;
		}

		&__status {
			margin: 0;
			padding: 32px 24px;
			color: var(--muted);
		}

		/* Разметка статьи приходит с /injuries/<slug>/ без её scoped-стилей, повторяем главное */
		&__body {
			padding: 8px 24px 32px;

			& :global(.injury) {
				display: grid;
				gap: 18px;
				max-width: none;
				padding: 0;
			}

			/* У заголовка статьи нет своего класса, а разметку правит не эта страница */
			/* stylelint-disable-next-line selector-max-type */
			& :global(h1) {
				margin: 0;
				font-size: clamp(1.6rem, 4vw, 2.2rem);
				line-height: 1.15;
			}

			& :global(.injury__meta) {
				display: flex;
				flex-wrap: wrap;
				gap: 8px;
				align-items: center;
				margin: 0;
				font-size: 0.9rem;
			}

			& :global(.injury__lead) {
				margin: 0;
				font-size: 1.1rem;
				color: var(--muted);
			}

			& :global(.injury__figure) {
				margin: 0;
			}

			& :global(.injury__image) {
				border-radius: 12px;
				background: #ffffff;
			}

			& :global(.injury__caption) {
				margin-top: 6px;
				font-size: 0.85rem;
				color: var(--muted);
			}

			& :global(.injury__movements) {
				display: flex;
				flex-wrap: wrap;
				gap: 8px 16px;
				padding: 0;
				list-style: none;
			}

			& :global(.injury__sources) {
				font-size: 0.9rem;
			}

			& :global(.badge) {
				padding: 2px 8px;
				border-radius: 999px;
				font-size: 0.8rem;
				background: var(--surface);
			}

			& :global(.badge--rare) {
				color: #ffffff;
				background: var(--danger);
			}

			& :global(.disclaimer) {
				padding: 12px 16px;
				border-radius: 12px;
				font-size: 0.9rem;
				color: var(--muted);
				background: #ffffff99;
			}
		}
	}

	@keyframes ring-in {
		from {
			transform: scale(0.6) rotate(-20deg);
			opacity: 0;
		}
	}

	@keyframes item-in {
		from {
			opacity: 0;
		}
	}
</style>
