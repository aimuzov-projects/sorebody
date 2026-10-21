<script lang="ts">
	import { ChevronLeft, Pause, Play } from 'lucide-static'
	import { onDestroy, onMount } from 'svelte'

	import { INFO_DOT } from '#frontend/lib/icons.ts'
	import { MAX_ELEVATION } from '#frontend/scene/rig.ts'
	import type { ShoulderViewer } from '#frontend/scene/shoulder-viewer.ts'

	type Props = {
		modelUrl: string
		/** Закрыть просят: стрелка «Назад», Esc. Сам диалог закрывает lib/figure-3d.ts, вместе с историей. */
		onclose: () => void
	}

	let { modelUrl, onclose }: Props = $props()

	/** Полный цикл «поднять и опустить», мс. */
	const CYCLE = 5000
	const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

	let dialog: HTMLDialogElement
	let canvas: HTMLCanvasElement
	let viewer: ShoulderViewer | undefined
	let status = $state<'loading' | 'ready' | 'error'>('loading')
	let angle = $state(0)
	// Без анимаций в системе рука сама не ходит, только ползунком
	let playing = $state(!reduceMotion)
	let deltoid = $state(false)
	let frame = 0
	let startedAt = 0

	// Угол читаем до viewer?.: пока модели нет, optional chaining не читал бы его, и эффект
	// ни на что бы не подписался
	$effect(() => {
		const deg = angle

		viewer?.setElevation(deg)
	})

	$effect(() => {
		const on = deltoid

		viewer?.setDeltoid(on)
	})

	function tick(now: number) {
		frame = requestAnimationFrame(tick)
		const t = (now - startedAt) / CYCLE

		angle = Math.round((MAX_ELEVATION / 2) * (1 - Math.cos(2 * Math.PI * t)) * 10) / 10
	}

	function play() {
		// Цикл продолжается с текущего угла, а не прыгает в ноль
		const phase = Math.acos(1 - angle / (MAX_ELEVATION / 2)) / (2 * Math.PI)

		startedAt = performance.now() - phase * CYCLE
		frame = requestAnimationFrame(tick)
	}

	function toggle() {
		playing = !playing
		cancelAnimationFrame(frame)

		if (playing) play()
	}

	function drag() {
		playing = false
		cancelAnimationFrame(frame)
	}

	// Esc закрывает только модель: дальше он ушёл бы стрелке «Назад» статьи (lib/back-link.ts)
	// и сцене главной, и вместе с моделью закрылась бы статья
	function onKey(event: KeyboardEvent) {
		if (event.key !== 'Escape') return

		event.stopPropagation()

		// Открытую подсказку браузер закроет сам, модель -- следующим нажатием
		if (dialog.querySelector(':popover-open')) return

		event.preventDefault()
		onclose()
	}

	let resizeWatch: ResizeObserver | undefined

	onMount(async () => {
		dialog.showModal()

		try {
			const { createShoulderViewer } = await import('#frontend/scene/shoulder-viewer.ts')

			viewer = await createShoulderViewer(canvas, modelUrl)
		} catch (error) {
			console.error('3D-модель не загрузилась', error)
			status = 'error'

			return
		}

		viewer.setElevation(angle)
		viewer.setDeltoid(deltoid)
		resizeWatch = new ResizeObserver(() => viewer?.resize())
		resizeWatch.observe(canvas)
		status = 'ready'

		if (playing) play()
	})

	onDestroy(() => {
		cancelAnimationFrame(frame)
		resizeWatch?.disconnect()
		viewer?.dispose()
	})
</script>

<!-- Полный экран поверх страницы: на телефоне в кадр фото модель не помещалась -->
<dialog class="figure3d" bind:this={dialog} data-status={status} aria-label="3D-модель плеча" onkeydown={onKey}>
	<canvas
		bind:this={canvas}
		class="figure3d__canvas"
		aria-label="3D-модель правого плеча сзади: лопатка, ключица, плечевая кость и мышцы вращательной манжеты. Перетащите, чтобы повернуть"
	></canvas>

	{#if status === 'loading'}
		<p class="figure3d__status">Загружаем 3D-модель…</p>
	{:else if status === 'error'}
		<p class="figure3d__status">Не получилось загрузить 3D-модель</p>
	{/if}

	<button class="figure3d__back" type="button" aria-label="Назад" onclick={onclose}>{@html ChevronLeft}</button>

	<button class="figure3d__info" type="button" aria-label="О модели" popovertarget="figure3d-about">
		{@html INFO_DOT}
	</button>
	<p class="figure3d__about" id="figure3d-about" popover="auto">
		Модель: BodyParts3D, CC BY-SA 2.1 JP. Движение упрощено: кости поворачиваются как жёсткие тела
	</p>

	<div class="figure3d__bottom">
		<div class="figure3d__controls">
			<button
				class="figure3d__play"
				type="button"
				aria-label={playing ? 'Остановить подъём руки' : 'Поднять руку'}
				aria-pressed={playing}
				onclick={toggle}
				disabled={status !== 'ready'}
			>
				<span class="figure3d__icon" aria-hidden="true">{@html playing ? Pause : Play}</span>
			</button>
			<label class="figure3d__range" style:--fill="{(angle / MAX_ELEVATION) * 100}%">
				<span class="figure3d__visually-hidden">Подъём руки, градусы</span>
				<input
					class="figure3d__slider"
					type="range"
					min="0"
					max={MAX_ELEVATION}
					step="1"
					bind:value={angle}
					oninput={drag}
					disabled={status !== 'ready'}
				/>
				<span class="figure3d__degrees" aria-hidden="true">{Math.round(angle)}°</span>
			</label>
			<button
				class="figure3d__chip"
				type="button"
				aria-pressed={deltoid}
				onclick={() => (deltoid = !deltoid)}
				disabled={status !== 'ready'}
			>
				Дельтовидная
			</button>
		</div>
	</div>
</dialog>

<style>
	.figure3d {
		overscroll-behavior: contain;
		width: 100%;
		max-width: none;
		height: 100%;
		max-height: none;
		margin: 0;
		padding: 0;
		border: 0;
		color: var(--fg);
		background: var(--bg);

		&::backdrop {
			background: var(--bg);
		}
	}

	/* Под открытой моделью страница не прокручивается */
	:global(html:has(.figure3d[open])) {
		overflow: hidden;
	}

	.figure3d__canvas {
		touch-action: none;
		cursor: grab;
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;

		&:active {
			cursor: grabbing;
		}
	}

	.figure3d__status {
		position: absolute;
		top: 50%;
		left: 50%;
		translate: -50% -50%;
		margin: 0;
		font-size: 14px;
		color: var(--muted);
	}

	/* Стрелка как в шапке статьи (article-bar__back): акцентная «<» в круге, подложка на наведении */
	.figure3d__back {
		cursor: pointer;
		position: absolute;
		top: max(12px, env(safe-area-inset-top));
		left: max(12px, env(safe-area-inset-left));
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		color: var(--accent);
		background: none;
		transition: background 0.3s ease;

		&:hover {
			background: color-mix(in srgb, var(--fg) 7%, transparent);
		}

		/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
		& :global(svg) {
			/* Открытая сторона «<» пустая, и в круге стрелка на глаз уходит вправо */
			translate: -6% 0;
			width: 28px;
			height: 28px;
			stroke-width: 2.2;
		}
	}

	/* Тихий значок «i», как у других названий в заголовке статьи (article__alias) */
	.figure3d__info {
		cursor: pointer;
		position: absolute;
		top: max(12px, env(safe-area-inset-top));
		right: max(12px, env(safe-area-inset-right));
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		padding: 10px;
		border: 0;
		border-radius: 50%;
		color: color-mix(in srgb, var(--muted) 70%, transparent);
		background: none;
		transition: color 0.3s var(--article-ease);

		&:hover {
			color: var(--fg);
		}

		/* stylelint-disable-next-line selector-max-type -- SVG значка приходит строкой из lib/icons.ts */
		& :global(svg) {
			width: 20px;
			height: 20px;
		}
	}

	.figure3d__about {
		inset: auto;
		top: calc(max(12px, env(safe-area-inset-top)) + 44px);
		right: max(12px, env(safe-area-inset-right));
		max-width: min(300px, calc(100% - 24px));
		margin: 0;
		padding: 10px 14px;
		border: 0;
		border-radius: 12px;
		font-size: 13px;
		line-height: 1.5;
		color: var(--fg);
		background: var(--bg);
		box-shadow:
			0 8px 24px rgb(0 0 0 / 14%),
			inset 0 0 0 1px color-mix(in srgb, var(--fg) 8%, transparent);
	}

	.figure3d__bottom {
		pointer-events: none;
		position: absolute;
		right: 0;
		bottom: max(16px, env(safe-area-inset-bottom));
		left: 0;
		display: grid;
		gap: 8px;
		justify-items: center;
		padding-inline: 12px;
	}

	/* Панель управления -- одна таблетка, как переключатели сайта: подложка поверхности,
	   выбранное залито акцентом */
	.figure3d__controls {
		pointer-events: auto;
		display: flex;
		gap: 4px;
		align-items: center;
		max-width: 100%;
		padding: 4px;
		border-radius: 999px;
		font-size: 14px;
		background: color-mix(in srgb, var(--bg) 72%, transparent);
		backdrop-filter: blur(12px);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fg) 8%, transparent);

		/* В одну строку на телефоне панель не влезает: сверху запуск и ползунок во всю ширину,
		   под ними чип */
		@media (--below-sm) {
			flex-wrap: wrap;
			justify-content: center;
			width: 100%;
			border-radius: 22px;
		}
	}

	.figure3d__play {
		cursor: pointer;
		display: grid;
		flex: none;
		place-items: center;
		width: 36px;
		height: 36px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		color: var(--bg);
		background: var(--accent);
		transition: opacity 0.3s var(--article-ease);

		&:hover:not(:disabled) {
			opacity: 0.85;
		}
	}

	.figure3d__icon {
		display: inline-flex;
		width: 16px;
		height: 16px;
	}

	.figure3d__range {
		display: inline-flex;
		gap: 8px;
		align-items: center;
		padding: 0 6px 0 10px;
		color: var(--fg);

		@media (--below-sm) {
			flex: 1 1 calc(100% - 44px);
		}
	}

	/* Дорожка: пройденная часть -- акцентом до бегунка (--fill), остальное -- подложкой */
	.figure3d__slider {
		cursor: pointer;
		width: 200px;
		height: 4px;
		margin: 0;
		border-radius: 999px;
		appearance: none;
		background: linear-gradient(
			to right,
			var(--accent) var(--fill),
			color-mix(in srgb, var(--fg) 14%, transparent) var(--fill)
		);

		@media (--below-sm) {
			flex: 1;
			width: auto;
		}

		&::-webkit-slider-thumb {
			width: 18px;
			height: 18px;
			border: 0;
			border-radius: 50%;
			appearance: none;
			background: var(--accent);
			box-shadow: 0 0 0 3px var(--bg);
		}

		&::-moz-range-thumb {
			width: 18px;
			height: 18px;
			border: 0;
			border-radius: 50%;
			background: var(--accent);
			box-shadow: 0 0 0 3px var(--bg);
		}

		&:disabled {
			cursor: default;
			opacity: 0.5;
		}
	}

	.figure3d__degrees {
		min-width: 3.2em;
		font-variant-numeric: tabular-nums;
		color: var(--muted);
		text-align: right;
	}

	/* Чип как в переключателе частоты: нажатый залит акцентом */
	.figure3d__chip {
		cursor: pointer;
		display: inline-flex;
		gap: 6px;
		align-items: center;
		padding: 8px 14px;
		border: 0;
		border-radius: 999px;
		font: inherit;
		font-weight: 500;
		color: var(--fg);
		white-space: nowrap;
		background: transparent;
		transition:
			color 0.3s var(--article-ease),
			background 0.3s var(--article-ease);

		&:hover:not(:disabled, [aria-pressed='true']) {
			background: color-mix(in srgb, var(--fg) 8%, transparent);
		}

		&[aria-pressed='true'] {
			color: var(--bg);
			background: var(--accent);
		}

		&:disabled {
			cursor: default;
			opacity: 0.5;
		}
	}

	.figure3d__back,
	.figure3d__info,
	.figure3d__play,
	.figure3d__chip,
	.figure3d__slider {
		&:focus-visible {
			outline: 2px solid var(--accent);
			outline-offset: 2px;
		}
	}

	.figure3d__visually-hidden {
		position: absolute;
		overflow: hidden;
		width: 1px;
		height: 1px;
		white-space: nowrap;
		clip-path: inset(50%);
	}
</style>
