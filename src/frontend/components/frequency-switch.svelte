<!--
	Переключатель частоты в индексе главной: "Все" и три уровня со своим цветом и знаком.
	Выбранное положение -- общая таблетка-подложка, она переезжает к новому выбору.
-->
<script lang="ts">
	import { untrack } from 'svelte'

	import { Shapes } from 'lucide-static'

	import { ALL_FREQUENCIES_HINT, FREQUENCIES, type Frequency } from '#frontend/data/frequency.ts'

	let { value = $bindable('all') }: { value: 'all' | Frequency } = $props()

	/** У каждого уровня частоты свой знак и цвет, как легенда к списку. */
	const FREQUENCY_CHIPS = [
		['all', 'Все', Shapes, ALL_FREQUENCIES_HINT],
		...FREQUENCIES.map((f) => [f.slug, f.label, f.icon, f.hint] as const),
	] as const

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
		const chip = freqChips[FREQUENCY_CHIPS.findIndex(([chipValue]) => chipValue === value)]

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
		void value
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
</script>

<div
	class="index__freq index__freq--{value}"
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
	{#each FREQUENCY_CHIPS as [chip, label, icon, hint], i (chip)}
		<button
			bind:this={freqChips[i]}
			class="index__chip index__chip--{chip}"
			type="button"
			aria-pressed={value === chip}
			data-hint={hint}
			onclick={() => (value = chip)}
			><span class="index__chip-icon" aria-hidden="true">{@html icon}</span><span class="index__chip-label"
				>{label}</span
			></button
		>
	{/each}
</div>

<style>
	/* Классы из .index: остров индекса на телефоне (body-3d.svelte) растит по ним
	   чипы под палец, e2e находят чипы по ним же */
	.index {
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
	}
</style>
