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

		// Статья -- карточка по центру, фигура за ней видна по бокам. На телефоне карточка
		// почти во весь экран, а раскрытая зона остаётся в полоске сверху
		if (w < 600) body.focus(point.position, 1.6, { x: 0, y: 0.44 })
		else body.focus([0, 0.9, 0], 0.9)
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
			// Близко к cubic-bezier(0.25, 1, 0.5, 1) из CSS: быстрый старт, мягкая посадка
			easing: (t: number) => 1 - (1 - t) ** 4,
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
		{@const count = open.zone.injuries.length}
		<nav class="picker picker--{open.layout}" aria-label={open.zone.label}>
			{#if open.layout === 'sheet'}
				<span class="picker__grabber" aria-hidden="true"></span>
			{/if}
			<header class="picker__head">
				<div class="picker__heading">
					<h2 class="picker__zone">{open.zone.label}</h2>
					<p class="picker__count">{count} {plural(count)}</p>
				</div>
				<button class="picker__close" type="button" aria-label="Закрыть" onclick={closeMenu}>
					<span aria-hidden="true">×</span>
				</button>
			</header>
			<ul class="picker__group">
				{#each open.zone.injuries as injury (injury.slug)}
					<li class="picker__row">
						<a
							class="picker__item"
							href="/injuries/{injury.slug}/"
							onclick={(event) => onItemClick(event, injury)}
						>
							<span class="picker__text">
								<span class="picker__title">
									{injury.title}
									{#if injury.rare}<span class="picker__badge">Редко</span>{/if}
								</span>
								<span class="picker__summary">{injury.summary}</span>
							</span>
							<span class="picker__chevron" aria-hidden="true">›</span>
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
			<button
				class="panel__close"
				type="button"
				aria-label="Закрыть"
				bind:this={closeButton}
				onclick={requestCloseArticle}
			>
				<span aria-hidden="true">×</span>
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
	/* Токены (--a-*) объявлены на body в pages/lab/3d.astro, тёмная тема -- там же */
	.body3d {
		touch-action: pan-y;
		user-select: none;

		position: fixed;
		inset: 0;
		overflow: hidden;
		background: radial-gradient(ellipse 60% 70% at 50% 45%, var(--a-glow) 0%, var(--a-bg) 70%);

		&__canvas {
			cursor: grab;
			display: block;
			width: 100%;
			height: 100%;
			transition:
				transform 0.6s var(--a-ease),
				filter 0.6s var(--a-ease),
				opacity 0.4s ease;

			&:active {
				cursor: grabbing;
			}
		}

		/* Курсор рядом с точкой зоны: клик раскроет её */
		&--hot &__canvas {
			cursor: pointer;
		}

		/* Сцена под статьёй уходит назад, как карточка под модалкой iOS */
		&--receded &__canvas {
			cursor: default;
			transform: scale(0.92);
			filter: blur(6px) brightness(0.94);

			@media (prefers-color-scheme: dark) {
				filter: blur(6px) brightness(0.6);
			}

			@media (--below-sm) {
				transform: scale(0.96);
				filter: blur(3px);
			}

			@media (--reduced-motion) {
				transform: none;
				opacity: 0.4;
				filter: none;
				transition: opacity 0.2s ease;
			}
		}

		&--receded &__spot,
		&--receded &__whole,
		&--open &__spot,
		&--open &__whole {
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
			color: var(--a-fg2);
			text-align: center;
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
			transition: opacity 0.3s var(--a-ease);

			&:global([data-hidden='true']) {
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

		&__whole {
			cursor: pointer;
			position: absolute;
			bottom: 28px;
			left: 50%;
			transform: translateX(-50%);
			padding: 10px 20px;
			border: 0;
			border-radius: 980px;
			font: inherit;
			font-size: 15px;
			font-weight: 500;
			color: var(--a-blue);
			letter-spacing: -0.01em;
			background: var(--a-vibrancy);
			backdrop-filter: saturate(180%) blur(20px);
			box-shadow: var(--a-shadow);
			transition: opacity 0.3s var(--a-ease);

			&:hover {
				text-decoration: underline;
			}
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

	/* Список травм зоны: vibrancy-панель справа, на телефоне шторка; внутри -- группированный
	   список iOS со шевроном */
	.picker {
		position: absolute;
		overflow-y: auto;
		overscroll-behavior: contain;
		background: var(--a-vibrancy);
		backdrop-filter: saturate(180%) blur(20px);
		box-shadow: var(--a-shadow);

		&--list {
			top: 50%;
			right: 4vw;
			transform: translateY(-50%);
			width: min(420px, 38vw);
			max-height: 84dvh;
			border-radius: 22px;
			animation: list-in 0.55s var(--a-ease) both;
		}

		&--sheet {
			right: 0;
			bottom: 0;
			left: 0;
			max-height: 58dvh;
			border-radius: 22px 22px 0 0;
			animation: sheet-in 0.55s var(--a-ease) both;
		}

		&__grabber {
			display: block;
			width: 36px;
			height: 5px;
			margin: 8px auto 0;
			border-radius: 3px;
			background: var(--a-sep);
		}

		&__head {
			display: flex;
			gap: 12px;
			align-items: flex-start;
			justify-content: space-between;
			padding: 20px 20px 12px;
		}

		&__zone {
			margin: 0;
			font-size: 28px;
			font-weight: 700;
			line-height: 1.1;
			letter-spacing: -0.025em;
		}

		&__count {
			margin: 4px 0 0;
			font-size: 15px;
			color: var(--a-fg2);
		}

		&__close {
			cursor: pointer;
			display: grid;
			flex: none;
			place-items: center;
			width: 30px;
			height: 30px;
			padding: 0;
			border: 0;
			border-radius: 50%;
			font-size: 20px;
			line-height: 1;
			color: var(--a-fg2);
			background: var(--a-fill);

			&:hover {
				color: var(--a-fg);
			}
		}

		&__group {
			overflow: hidden;
			margin: 0 16px 16px;
			padding: 0;
			border-radius: 14px;
			list-style: none;
			background: var(--a-group);
		}

		/* Разделитель с отступом слева, как в iOS: у первой строки его нет */
		&__row + &__row &__item::before {
			content: '';
			position: absolute;
			top: 0;
			right: 0;
			left: 16px;
			height: 1px;
			background: var(--a-sep);
		}

		&__item {
			position: relative;
			display: grid;
			grid-template-columns: 1fr auto;
			gap: 12px;
			align-items: center;
			padding: 12px 14px 12px 16px;
			color: var(--a-fg);
			text-decoration: none;
			transition: background 0.2s;

			&:hover,
			&:focus-visible {
				background: var(--a-fill);
			}

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: -2px;
			}
		}

		&__text {
			display: grid;
			gap: 2px;
		}

		&__title {
			font-size: 17px;
			font-weight: 500;
			line-height: 1.3;
		}

		&__badge {
			display: inline-block;
			margin-left: 6px;
			padding: 1px 7px;
			border-radius: 980px;
			font-size: 12px;
			font-weight: 600;
			color: var(--a-red);
			letter-spacing: 0;
			vertical-align: 2px;
			background: color-mix(in srgb, var(--a-red) 12%, transparent);
		}

		&__summary {
			overflow: hidden;
			display: -webkit-box;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			font-size: 14px;
			line-height: 1.4;
			color: var(--a-fg2);
			letter-spacing: -0.01em;
		}

		&__chevron {
			font-size: 22px;
			line-height: 1;
			color: var(--a-fg2);
			opacity: 0.6;
		}
	}

	/* Статья -- модальная карточка поверх ушедшей назад сцены, колонка около 680 px */
	.panel {
		position: fixed;
		z-index: 2;
		inset: 5dvh 0 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		width: min(760px, calc(100vw - 48px));
		margin-inline: auto;
		border-radius: 22px 22px 0 0;
		background: var(--a-vibrancy);
		backdrop-filter: saturate(180%) blur(20px);
		box-shadow: var(--a-shadow);

		@media (--below-sm) {
			inset: 16dvh 0 0;
			width: auto;
		}

		&__bar {
			position: sticky;
			z-index: 1;
			top: 0;
			display: flex;
			gap: 12px;
			align-items: center;
			justify-content: space-between;
			padding: 14px 16px 14px 24px;
			font-size: 14px;
			background: var(--a-vibrancy);
			backdrop-filter: saturate(180%) blur(20px);
		}

		&__standalone {
			color: var(--a-blue);
			text-decoration: none;

			&:hover {
				text-decoration: underline;
			}
		}

		/* Круглая полупрозрачная кнопка с крестиком, как в модалках iOS */
		&__close {
			cursor: pointer;
			display: grid;
			flex: none;
			place-items: center;
			width: 32px;
			height: 32px;
			padding: 0;
			border: 0;
			border-radius: 50%;
			font-size: 22px;
			line-height: 1;
			color: var(--a-fg2);
			background: var(--a-fill);

			&:hover {
				color: var(--a-fg);
			}
		}

		&__status {
			max-width: 680px;
			margin: 0 auto;
			padding: 48px 24px;
			color: var(--a-fg2);
		}

		/* Разметка статьи приходит с /injuries/<slug>/ без её scoped-стилей, задаём здесь */
		&__body {
			max-width: 680px;
			margin: 0 auto;
			padding: 8px 24px 80px;

			& :global(.injury) {
				display: grid;
				gap: 24px;
				max-width: none;
				padding: 0;
			}

			/* У заголовков статьи нет своих классов, а разметку правит не эта страница */
			/* stylelint-disable-next-line selector-max-type */
			& :global(h1) {
				margin: 0;
				font-size: clamp(32px, 5vw, 48px);
				font-weight: 700;
				line-height: 1.08;
				letter-spacing: -0.03em;
			}

			/* stylelint-disable-next-line selector-max-type */
			& :global(h2) {
				margin: 32px 0 0;
				font-size: 28px;
				font-weight: 600;
				line-height: 1.14;
				letter-spacing: -0.02em;
			}

			/* stylelint-disable-next-line selector-max-type */
			& :global(a) {
				color: var(--a-blue);
				text-decoration: none;
			}

			/* stylelint-disable-next-line selector-max-type */
			& :global(a:hover) {
				text-decoration: underline;
			}

			& :global(.injury__meta) {
				display: flex;
				flex-wrap: wrap;
				gap: 8px;
				align-items: center;
				margin: 0;
				font-size: 15px;
			}

			& :global(.injury__lead) {
				margin: 0;
				font-size: 21px;
				line-height: 1.38;
				color: var(--a-fg2);
				letter-spacing: -0.015em;
			}

			& :global(.injury__figure) {
				margin: 8px 0;
			}

			& :global(.injury__image) {
				border-radius: 18px;
				background: #ffffff;
			}

			& :global(.injury__caption) {
				margin-top: 10px;
				font-size: 14px;
				color: var(--a-fg2);
			}

			& :global(.injury__body) {
				display: grid;
				gap: 4px;
			}

			& :global(.injury__movements) {
				display: flex;
				flex-wrap: wrap;
				gap: 8px 20px;
				padding: 0;
				list-style: none;
			}

			& :global(.injury__sources) {
				font-size: 14px;
				color: var(--a-fg2);
			}

			& :global(.badge) {
				padding: 2px 10px;
				border-radius: 980px;
				font-size: 12px;
				font-weight: 600;
				color: var(--a-fg2);
				letter-spacing: 0;
				background: var(--a-fill);
			}

			& :global(.badge--rare) {
				color: var(--a-red);
				background: color-mix(in srgb, var(--a-red) 12%, transparent);
			}

			& :global(.disclaimer) {
				margin-top: 24px;
				padding: 16px 20px;
				border-radius: 18px;
				font-size: 15px;
				color: var(--a-fg2);
				background: var(--a-group);
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

	@keyframes list-in {
		from {
			transform: translate(24px, -50%) scale(0.98);
			opacity: 0;
		}
	}

	@keyframes sheet-in {
		from {
			transform: translateY(48px);
			opacity: 0;
		}
	}
</style>
