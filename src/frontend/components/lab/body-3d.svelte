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

	import type { BodyScene } from '#frontend/lab/body-scene.ts'
	import type { LabZone } from '#frontend/lab/zones.ts'

	type Props = { zones: LabZone[]; whole: LabZone; modelUrl: string }
	type Injury = LabZone['injuries'][number]

	let { zones, whole, modelUrl }: Props = $props()

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

	type Spot = { zone: LabZone; index: number; x: number; y: number; visible: boolean }

	const spots: Spot[] = $derived(
		zones.flatMap((zone) => zone.points.map((_, index) => ({ zone, index, x: 0, y: 0, visible: true }))),
	)
	let spotEls = $state<HTMLButtonElement[]>([])

	// raw: иначе Svelte обернёт точку в прокси и сравнение hovered === spot всегда ложно
	let hovered = $state.raw<Spot | null>(null)

	/** Раскрытая зона. `side` -- где стоит список: в свободной от зоны половине экрана. */
	let open = $state.raw<{ zone: LabZone; index: number; side: 'left' | 'right' | 'bottom' } | null>(null)
	let article = $state.raw<Injury | null>(null)
	let articleStatus = $state<'loading' | 'ready' | 'error'>('loading')
	let articleBody = $state<HTMLDivElement>()
	let backButton = $state<HTMLButtonElement>()
	let sceneHidden = $state(false)
	let loadToken = 0
	let sleepTimer: ReturnType<typeof setTimeout> | undefined

	/**
	 * Адрес -- источник правды, три уровня: сцена (без хеша), зона `#zone=knee:0`, статья
	 * `#meniscus-tear`. "Назад" и системная кнопка браузера поднимаются на уровень вверх.
	 * Записи выше `baseLevel` положили в историю мы сами, ниже -- пришли со ссылкой.
	 */
	type Place = { level: 0 } | { level: 1; zone: LabZone; index: number } | { level: 2; zone: LabZone; injury: Injury }

	let baseLevel = 0

	function zoneHash(zone: LabZone, index: number) {
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

	function openZone(zone: LabZone, index: number) {
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
		baseLevel = parseHash().level
		sync()
		window.addEventListener('popstate', sync)

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
			// Адрес мог открыть зону или статью до того, как модель загрузилась
			sync()

			if (sceneHidden) scene.pause(true)
		})

		ready.catch((error) => {
			console.error(error)
			status = 'error'
		})

		const resizer = new ResizeObserver(() => body?.resize())

		resizer.observe(canvas)
		// Вне экрана и под статьёй сцена не рисует, чтобы не греть телефон
		const visibility = new IntersectionObserver(([entry]) => body?.pause(!entry.isIntersecting || sceneHidden))

		visibility.observe(canvas)

		return () => {
			window.removeEventListener('popstate', sync)
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

	/**
	 * Раскрыть зону и поставить список в свободную от неё половину экрана: зона справа --
	 * список слева, и наоборот. Камера сдвигает зону на другую сторону. На узком экране
	 * свободной половины нет: зона уходит наверх, список -- в нижнюю половину.
	 */
	function showZone(zone: LabZone, index: number) {
		if (!body) return

		if (open?.zone === zone && open.index === index) return

		const point = zone.points[index]
		const w = wrap.clientWidth
		const side = w < 700 ? 'bottom' : body.project(point.position).x > w / 2 ? 'left' : 'right'
		const at = side === 'bottom' ? { x: 0, y: 0.26 } : { x: side === 'left' ? 0.24 : -0.24, y: 0 }

		hovered = null
		body.dissolve(point.position, zone.radius)
		body.controls.autoRotate = false
		body.controls.enabled = false
		body.focus(point.position, clamp(0.3 / zone.radius, 1, 2.4), at)
		open = { zone, index, side }
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
			main.querySelector('.injury__meta')?.remove()
			await tick()

			if (token !== loadToken || !articleBody) return

			articleBody.replaceChildren(document.importNode(main, true))
			articleBody.parentElement?.scrollTo(0, 0)
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
			onclick={() => openZone(spot.zone, spot.index)}
			onfocus={() => hover(spot)}
		>
			<span class="body3d__spot-dot"></span>
		</button>
	{/each}

	<button class="body3d__whole" type="button" hidden={status !== 'ready'} onclick={() => openZone(whole, 0)}>
		{whole.label}
	</button>

	{#if open}
		{@const count = open.zone.injuries.length}
		<section class="zone zone--{open.side}" aria-label={open.zone.label}>
			<header class="zone__head">
				<button class="zone__back" type="button" onclick={up}><span aria-hidden="true">←</span> Назад</button>
				<h2 class="zone__title">{open.zone.label}</h2>
				<p class="zone__count">{count} {plural(count)}</p>
			</header>
			<ul class="zone__list">
				{#each open.zone.injuries as injury, i (injury.slug)}
					{@const [head, tail] = splitLastWord(injury.title)}
					<li class="zone__row" style:--i={i}>
						<a
							class="zone__item"
							href="/injuries/{injury.slug}/"
							onclick={(event) => onItemClick(event, injury)}
						>
							<span class="zone__name">
								{#if injury.rare}
									<span class="zone__rare" title="Редкая травма"></span>
									<span class="zone__hidden">Редкая:</span>
								{/if}
								{head}<span class="zone__tail"
									>{tail}<span class="zone__arrow" aria-hidden="true">→</span></span
								>
							</span>
							<span class="zone__summary">{injury.summary}</span>
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
	<article class="reader" transition:fadeUp aria-label={article.title} aria-busy={articleStatus === 'loading'}>
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
	/* Токены (--a-*) объявлены на body в pages/lab/3d.astro, тёмная тема -- там же.
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
			transition: opacity 0.4s var(--a-ease);

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
			bottom: 32px;
			left: 50%;
			transform: translateX(-50%);
			padding: 8px 12px;
			border: 0;
			font: inherit;
			font-size: 17px;
			color: var(--a-blue);
			background: none;
			transition: opacity 0.4s var(--a-ease);

			&:hover {
				opacity: 0.7;
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

	/* Список зоны в свободной половине экрана. Подложки нет: фон сцены растворяется
	   к центру градиентом, строки гаснут к краям скролла маской */
	.zone {
		position: absolute;
		top: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		width: min(440px, 40vw);
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
			inset: 0 -14vw;
		}

		&--left {
			left: 6vw;

			&::before {
				background: linear-gradient(to right, var(--a-bg) 45%, transparent);
			}
		}

		&--right {
			right: 6vw;

			&::before {
				background: linear-gradient(to left, var(--a-bg) 45%, transparent);
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
			padding-top: max(32px, 7dvh);
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

		&__rare {
			display: inline-block;
			width: 7px;
			height: 7px;
			margin-right: 8px;
			border-radius: 50%;
			vertical-align: 3px;
			background: var(--a-red);
		}

		&__hidden {
			position: absolute;
			overflow: hidden;
			width: 1px;
			height: 1px;
			white-space: nowrap;
			clip-path: inset(50%);
		}

		&__summary {
			overflow: hidden;
			font-size: 15px;
			line-height: 1.4;
			color: var(--a-fg2);
			text-overflow: ellipsis;
			letter-spacing: -0.01em;
			white-space: nowrap;
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
			max-width: 728px;
			margin: 0 auto;
			padding: 20px 24px 36px;
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

		/* Разметка статьи приходит с /injuries/<slug>/ без её scoped-стилей, задаём здесь */
		&__body {
			max-width: 728px;
			margin: 0 auto;
			padding: 0 24px 120px;

			& :global(.injury) {
				display: grid;
				gap: 28px;
				max-width: none;
				padding: 0;
			}

			/* У заголовков статьи нет своих классов, а разметку правит не эта страница */
			/* stylelint-disable-next-line selector-max-type */
			& :global(h1) {
				margin: 0;
				font-size: clamp(36px, 6vw, 56px);
				font-weight: 700;
				line-height: 1.07;
				letter-spacing: -0.03em;
			}

			/* stylelint-disable-next-line selector-max-type */
			& :global(h2) {
				margin: 40px 0 0;
				font-size: 28px;
				font-weight: 600;
				line-height: 1.14;
				letter-spacing: -0.02em;
			}

			/* stylelint-disable-next-line selector-max-type */
			& :global(a) {
				color: var(--a-blue);
				text-decoration: none;
				transition: opacity 0.3s var(--a-ease);
			}

			/* stylelint-disable-next-line selector-max-type */
			& :global(a:hover) {
				opacity: 0.7;
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

			& :global(.injury__caption) {
				margin-top: 12px;
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
				gap: 8px 24px;
				padding: 0;
				list-style: none;
			}

			& :global(.injury__sources) {
				font-size: 14px;
				color: var(--a-fg2);
			}

			& :global(.disclaimer) {
				margin-top: 24px;
				font-size: 15px;
				color: var(--a-fg2);
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
