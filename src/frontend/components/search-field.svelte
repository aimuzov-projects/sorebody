<script lang="ts">
	import { Search, X } from 'lucide-static'

	type Props = {
		value: string
		/**
		 * Стиль поля. `a` -- минимальный: тонкая линия разделителя, в фокусе от лупы проявляется
		 * короткий синий отрезок. `b` -- поле на мягкой подложке, в фокусе вокруг неё свечение.
		 */
		variant?: 'a' | 'b'
		placeholder?: string
		label: string
	}

	let { value = $bindable(), variant = 'a', placeholder = '', label }: Props = $props()

	let input: HTMLInputElement

	function clear() {
		value = ''
		input.focus()
	}

	/** Esc в поле стирает запрос; пустое поле отдаёт Esc сцене, где он поднимает на уровень вверх. */
	function onKey(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !value) return

		event.preventDefault()
		event.stopPropagation()
		value = ''
	}

	/** «/» с клавиатуры ставит курсор в поиск, как на GitHub и в документации, -- если не печатают в другом поле. */
	function onWindowKey(event: KeyboardEvent) {
		if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return

		const target = event.target as HTMLElement

		if (target.isContentEditable || target.closest('input, textarea, select')) return

		event.preventDefault()
		input.focus()
	}
</script>

<svelte:window onkeydown={onWindowKey} />

<label class="search search--{variant}" class:search--filled={value}>
	<span class="search__icon" aria-hidden="true">{@html Search}</span>
	<input
		class="search__input"
		type="search"
		enterkeyhint="search"
		autocomplete="off"
		spellcheck="false"
		{placeholder}
		aria-label={label}
		bind:this={input}
		bind:value
		onkeydown={onKey}
	/>
	<!-- Подсказка клавиши: только там, где есть клавиатура и курсор, и пока поле пустое -->
	<kbd class="search__key" aria-hidden="true">/</kbd>
	<button class="search__clear" type="button" aria-label="Очистить поиск" onclick={clear}
		><span class="search__clear-icon" aria-hidden="true">{@html X}</span></button
	>
</label>

<style>
	/* Поле поиска индекса главной. Нативный крестик type=search спрятан: он жирный, синий и в
	   каждом браузере свой. Вместо него -- свой тихий кружок, который проявляется с текстом */
	.search {
		--search-ease: cubic-bezier(0.25, 1, 0.5, 1);

		position: relative;
		display: flex;
		gap: 10px;
		align-items: center;
		padding: 8px 0 10px;

		/* Вариант A: линия цвета разделителя, края растворяются. В фокусе поверх неё от лупы
		   проявляется короткий синий отрезок, который тоже гаснет к концу */
		&--a::before,
		&--a::after {
			pointer-events: none;
			content: '';
			position: absolute;
			right: 0;
			bottom: 0;
			left: 0;
			height: 1px;
		}

		&--a::before {
			background: linear-gradient(to right, transparent, var(--a-sep) 8%, var(--a-sep) 85%, transparent);
		}

		&--a::after {
			transform-origin: left;
			transform: scaleX(0.4);
			opacity: 0;
			background: linear-gradient(to right, transparent, var(--a-blue) 6%, transparent 45%);
			transition:
				opacity 0.35s var(--search-ease),
				transform 0.5s var(--search-ease);

			@media (prefers-reduced-motion: reduce) {
				transform: none;
				transition: opacity 0.2s ease;
			}
		}

		&--a:focus-within::after {
			transform: none;
			opacity: 1;
		}

		/* Вариант B: мягкая подложка без рамки, в фокусе -- светлее и с размытым свечением */
		&--b {
			padding: 10px 12px 10px 14px;
			border-radius: 14px;
			background: var(--a-fill);
			transition:
				background 0.3s var(--search-ease),
				box-shadow 0.3s var(--search-ease);

			&:focus-within {
				background: color-mix(in srgb, var(--a-fill) 60%, var(--a-bg));
				box-shadow: 0 6px 28px color-mix(in srgb, var(--a-blue) 22%, transparent);
			}
		}

		&__icon {
			display: inline-flex;
			flex: none;
			width: 20px;
			height: 20px;
			color: var(--a-fg2);
			transition: color 0.3s var(--search-ease);

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				width: 100%;
				height: 100%;
				stroke-width: 1.75;
			}
		}

		&:focus-within &__icon {
			color: var(--a-fg);
		}

		&__input {
			flex: 1;
			min-width: 0;
			padding: 0;
			border: 0;
			font: inherit;
			font-size: 19px;
			color: var(--a-fg);
			appearance: none;
			background: none;
			outline: none;

			&::placeholder {
				color: var(--a-fg2);
				opacity: 0.8;
			}

			/* Свой крестик вместо системного: WebKit и Blink рисуют его через этот псевдоэлемент */
			&::-webkit-search-cancel-button,
			&::-webkit-search-decoration {
				appearance: none;
			}
		}

		/* Клавиша «/»: тонкая плашка, только с мышью и пока поле пустое и не в фокусе */
		&__key {
			display: none;
			flex: none;
			place-items: center;
			min-width: 22px;
			height: 22px;
			padding: 0 6px;
			border-radius: 6px;
			font: inherit;
			font-size: 13px;
			font-weight: 500;
			color: var(--a-fg2);
			background: var(--a-fill);
			transition: opacity 0.25s var(--search-ease);

			@media (hover: hover) and (pointer: fine) {
				display: inline-grid;
			}
		}

		&:focus-within &__key,
		&--filled &__key {
			opacity: 0;
		}

		&--filled &__key {
			display: none;
		}

		/* Очистка: кружок 18px в приглушённом цвете с тонким крестиком цвета фона. Проявляется
		   с текстом; зона нажатия 44 на 44 -- невидимым ::before */
		&__clear {
			cursor: pointer;
			position: relative;
			display: none;
			flex: none;
			place-items: center;
			width: 18px;
			height: 18px;
			margin-right: 2px;
			padding: 0;
			border: 0;
			border-radius: 50%;
			color: var(--a-bg);
			background: color-mix(in srgb, var(--a-fg2) 55%, transparent);
			transition: background 0.25s var(--search-ease);
			animation: clear-in 0.3s var(--search-ease);

			@media (prefers-reduced-motion: reduce) {
				animation-name: clear-fade;
			}

			&::before {
				content: '';
				position: absolute;
				inset: -13px;
			}

			&:hover {
				background: color-mix(in srgb, var(--a-fg2) 85%, transparent);
			}

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: 2px;
			}
		}

		&--filled &__clear {
			display: grid;
		}

		&__clear-icon {
			display: inline-flex;
			width: 12px;
			height: 12px;

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				width: 100%;
				height: 100%;
				stroke-width: 2.25;
			}
		}
	}

	@keyframes clear-in {
		from {
			transform: scale(0.6);
			opacity: 0;
		}
	}

	@keyframes clear-fade {
		from {
			opacity: 0;
		}
	}
</style>
