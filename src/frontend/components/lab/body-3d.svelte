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
	import { onMount } from 'svelte'

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
	let open = $state<{ zone: LabZone; x: number; y: number } | null>(null)
	let activeSector = $state(-1)
	let hoverTimer: ReturnType<typeof setTimeout> | undefined

	onMount(() => {
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
			? { zone, x: clamp(w / 2 + at.x * w + RING_OUTER + 90, margin, w - margin), y: h / 2 }
			: { zone, x: w / 2, y: h - margin }

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

	function clamp(v: number, min: number, max: number) {
		return Math.max(min, Math.min(max, v))
	}

	function local(event: PointerEvent) {
		const rect = wrap.getBoundingClientRect()

		return { x: event.clientX - rect.left, y: event.clientY - rect.top }
	}

	function onPointerMove(event: PointerEvent) {
		if (event.pointerType !== 'mouse' || status !== 'ready') return

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

		if (open) {
			// Ссылка сама откроет статью, остальное кольцо -- тоже сектор, мимо кольца -- закрыть
			if ((event.target as Element).closest('a')) return

			const d = Math.hypot(x - open.x, y - open.y)

			if (d > RING_INNER * 0.6 && d < RING_OUTER + 30) {
				const injury = open.zone.injuries[sectorAt(x - open.x, y - open.y)]

				if (injury) location.assign(`/injuries/${injury.slug}/`)

				return
			}

			return closeMenu()
		}

		if (event.target !== canvas) return

		const spot = nearest(x, y, event.pointerType === 'mouse' ? PICK_PX : PICK_PX * 1.3)

		if (spot) openMenu(spot)
	}

	function onKey(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) closeMenu()
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

<style>
	.body3d {
		--porcelain-bg: #ebe8e3;
		--rim: #d98a4e;
		touch-action: pan-y;
		user-select: none;

		position: relative;
		overflow: hidden;
		height: min(82dvh, 760px);
		min-height: 520px;
		border-radius: 24px;
		background: radial-gradient(ellipse at 50% 40%, #f6f4f0 0%, var(--porcelain-bg) 70%);

		&__canvas {
			cursor: grab;
			display: block;
			width: 100%;
			height: 100%;

			&:active {
				cursor: grabbing;
			}
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
