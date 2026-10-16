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

	/** Радиус "магнита" вокруг точки зоны, пиксели. */
	const PICK_PX = 56

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

	// raw: иначе Svelte обернёт точку в прокси и сравнение hovered === spot всегда ложно
	let hovered = $state.raw<Spot | null>(null)

	/** Травмы зоны: панель со списком справа, на узком экране -- шторка снизу. */
	let open = $state<{ zone: LabZone; point: LabZone['points'][number]; layout: 'list' | 'sheet' } | null>(null)

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

	/**
	 * Наведение только подсвечивает точку и придерживает автоповорот, чтобы цель не уезжала
	 * из-под курсора. Зона раскрывается лишь по клику, тапу или Enter на точке.
	 */
	function hover(spot: Spot | null) {
		if (open || spot === hovered) return

		hovered = spot

		if (body) body.controls.autoRotate = !spot
	}

	function openMenu(spot: Spot | null, zone = spot?.zone) {
		if (!zone || !body) return

		const point = spot ? zone.points[spot.index] : zone.points[0]

		body.dissolve(point.position, zone.radius)
		body.controls.autoRotate = false
		body.controls.enabled = false
		// Камера наезжает на зону и ставит её левее центра, справа список. На телефоне
		// зона уходит в верхнюю пятую часть экрана, под ней шторка
		const layout = wrap.clientWidth < 700 ? 'sheet' : 'list'

		body.focus(
			point.position,
			clamp(0.3 / zone.radius, 1, 2.4),
			layout === 'sheet' ? { x: 0, y: 0.3 } : { x: -0.2, y: 0 },
		)

		open = { zone, point, layout }
	}

	function closeMenu() {
		open = null
		hovered = null

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
		if (event.pointerType !== 'mouse' || status !== 'ready' || article || open || event.buttons) return

		const { x, y } = local(event)

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

		// Список ловит клики сам, клик по сцене мимо него закрывает
		if (open) {
			if (!(event.target as Element).closest('.picker')) closeMenu()

			return
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

	/** Ссылка в списке открывает статью поверх сцены; с модификаторами -- как обычная ссылка. */
	function onItemClick(event: MouseEvent, injury: { slug: string; title: string }) {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

		event.preventDefault()
		pickInjury(injury)
	}
</script>

<svelte:window onkeydown={onKey} />

<div
	class="body3d"
	class:body3d--open={open}
	class:body3d--receded={article}
	class:body3d--hot={hovered && !open}
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
		<nav class="picker picker--{open.layout}" aria-label={open.zone.label}>
			<header class="picker__head">
				<strong class="picker__zone">{open.zone.label}</strong>
				<span class="picker__count">{open.zone.injuries.length} {plural(open.zone.injuries.length)}</span>
				<button class="picker__close" type="button" aria-label="Закрыть" onclick={closeMenu}>×</button>
			</header>
			<ul class="picker__list">
				{#each open.zone.injuries as injury (injury.slug)}
					<li>
						<a
							class="picker__item"
							href="/injuries/{injury.slug}/"
							onclick={(event) => onItemClick(event, injury)}
						>
							<span class="picker__title">{injury.title}</span>
							<span class="picker__summary">{injury.summary}</span>
						</a>
					</li>
				{/each}
			</ul>
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

		/* Курсор рядом с точкой зоны: клик раскроет её */
		&--hot &__canvas {
			cursor: pointer;
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

	/* Список травм зоны: панель справа на десктопе, шторка снизу на телефоне */
	.picker {
		position: absolute;
		overflow-y: auto;
		overscroll-behavior: contain;
		border: 1px solid #ffffff99;
		background: #faf8f5d9;
		backdrop-filter: blur(18px) saturate(1.2);
		box-shadow: 0 24px 80px #2b221a2e;

		&--list {
			top: 50%;
			right: 4vw;
			transform: translateY(-50%);
			width: min(400px, 36vw);
			max-height: 82dvh;
			border-radius: 20px;
			animation: list-in 0.4s cubic-bezier(0.22, 0.8, 0.25, 1) both;
		}

		&--sheet {
			right: 0;
			bottom: 0;
			left: 0;
			max-height: 56dvh;
			border-radius: 20px 20px 0 0;
			animation: sheet-in 0.4s cubic-bezier(0.22, 0.8, 0.25, 1) both;
		}

		&__head {
			position: sticky;
			top: 0;
			display: flex;
			gap: 8px;
			align-items: baseline;
			padding: 14px 16px 10px 20px;
			border-bottom: 1px solid #00000010;
			background: #faf8f5;
		}

		&__zone {
			font-size: 1.05rem;
		}

		&__count {
			font-size: 0.85rem;
			color: var(--muted);
		}

		&__close {
			cursor: pointer;
			margin-left: auto;
			padding: 0 6px;
			border: 0;
			font-size: 1.4rem;
			line-height: 1;
			color: var(--muted);
			background: none;
		}

		&__list {
			margin: 0;
			padding: 0;
			list-style: none;
		}

		&__item {
			display: grid;
			gap: 4px;
			padding: 12px 20px;
			border-bottom: 1px solid #0000000a;
			color: var(--fg);
			text-decoration: none;

			&:hover,
			&:focus-visible {
				background: #ffffffb3;
			}
		}

		&__title {
			font-weight: 600;
			line-height: 1.25;
		}

		&__summary {
			font-size: 0.85rem;
			line-height: 1.35;
			color: var(--muted);
		}
	}

	@keyframes list-in {
		from {
			transform: translate(24px, -50%);
			opacity: 0;
		}
	}

	@keyframes sheet-in {
		from {
			transform: translateY(40px);
			opacity: 0;
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
</style>
