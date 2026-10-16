<!--
	Выбор движения в индексе главной: подпись, значение синим и всплывающий список вместо
	нативного select. Клавиатура как у select: стрелки, Home/End, Enter, Escape, поиск по
	первым буквам. Список открывается вниз, а если места нет -- вверх (на телефоне индекс внизу).
-->
<script lang="ts">
	import { tick } from 'svelte'

	import { Check, ChevronDown } from 'lucide-static'

	type Option = { slug: string; title: string }

	let {
		options,
		value = $bindable(''),
		label,
		empty,
	}: { options: Option[]; value: string; label: string; empty: string } = $props()

	const id = $props.id()
	const all = $derived([{ slug: '', title: empty }, ...options])
	const current = $derived(all.find((o) => o.slug === value) ?? all[0])

	let open = $state(false)
	let up = $state(false)
	let active = $state(0)
	let root: HTMLDivElement
	let button: HTMLButtonElement
	let list = $state<HTMLUListElement>()
	let typed = ''
	let typedTimer: ReturnType<typeof setTimeout> | undefined

	const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

	async function show() {
		const box = button.getBoundingClientRect()

		up = innerHeight - box.bottom < 300 && box.top > innerHeight - box.bottom
		active = Math.max(0, all.indexOf(current))
		open = true
		await tick()
		list?.focus({ preventScroll: true })
		scrollToActive()
	}

	function hide(refocus = true) {
		open = false

		if (refocus) button.focus({ preventScroll: true })
	}

	function choose(index: number) {
		value = all[index].slug
		hide()
	}

	function scrollToActive() {
		list?.querySelector(`#${CSS.escape(`${id}-${active}`)}`)?.scrollIntoView({ block: 'nearest' })
	}

	function move(to: number) {
		active = Math.min(all.length - 1, Math.max(0, to))
		scrollToActive()
	}

	function onButtonKey(event: KeyboardEvent) {
		if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
			event.preventDefault()
			void show()
		}
	}

	function onListKey(event: KeyboardEvent) {
		const keys: Record<string, () => void> = {
			ArrowDown: () => move(active + 1),
			ArrowUp: () => move(active - 1),
			Home: () => move(0),
			End: () => move(all.length - 1),
			PageDown: () => move(active + 8),
			PageUp: () => move(active - 8),
			Enter: () => choose(active),
			' ': () => choose(active),
			Escape: () => hide(),
		}

		if (event.key === 'Tab') return hide(false)

		const action = keys[event.key]

		if (action) {
			event.preventDefault()
			action()

			return
		}

		// Поиск по первым буквам, как у нативного select
		if (event.key.length !== 1 || event.metaKey || event.ctrlKey) return

		clearTimeout(typedTimer)
		typed += event.key.toLowerCase()
		typedTimer = setTimeout(() => (typed = ''), 600)

		const found = all.findIndex((o) => o.title.toLowerCase().startsWith(typed))

		if (found >= 0) move(found)
	}

	// Клик мимо списка закрывает его, фокус при этом не перехватываем
	function onWindowPointer(event: PointerEvent) {
		if (open && !root.contains(event.target as Node)) hide(false)
	}

	function pop(node: HTMLElement) {
		return {
			duration: reduceMotion ? 120 : 220,
			tick: (t: number) => {
				node.style.opacity = String(t)
				node.style.transform = reduceMotion || t === 1 ? '' : `translateY(${(1 - t) * (up ? 6 : -6)}px)`
			},
		}
	}
</script>

<svelte:window onpointerdown={onWindowPointer} />

<div class="mselect" bind:this={root}>
	<span class="mselect__label" id="{id}-label">{label}</span>
	<button
		class="mselect__button"
		id="{id}-button"
		type="button"
		bind:this={button}
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-controls="{id}-list"
		aria-labelledby="{id}-label {id}-button"
		onclick={() => (open ? hide() : show())}
		onkeydown={onButtonKey}
	>
		{current.title}
		<span class="mselect__chevron" class:mselect__chevron--open={open} aria-hidden="true">{@html ChevronDown}</span>
	</button>

	{#if open}
		<ul
			class="mselect__list"
			class:mselect__list--up={up}
			id="{id}-list"
			role="listbox"
			tabindex="0"
			aria-labelledby="{id}-label"
			aria-activedescendant="{id}-{active}"
			bind:this={list}
			onkeydown={onListKey}
			transition:pop
		>
			{#each all as option, i (option.slug)}
				<!-- Клавиатуру ведёт сам список через aria-activedescendant, у строк только мышь -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					class="mselect__option"
					class:mselect__option--active={i === active}
					id="{id}-{i}"
					role="option"
					aria-selected={option === current}
					onpointermove={() => (active = i)}
					onclick={() => choose(i)}
				>
					<span class="mselect__check" aria-hidden="true"
						>{#if option === current}{@html Check}{/if}</span
					>
					{option.title}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	/* Список без рамки: подложка светлее фона и мягкая тень */
	.mselect {
		position: relative;
		display: inline-flex;
		gap: 6px;
		align-items: baseline;
		font-size: 16px;
		color: var(--a-fg2);

		&__button {
			cursor: pointer;
			display: inline-flex;
			gap: 4px;
			align-items: center;
			max-width: 240px;
			padding: 2px 0;
			border: 0;
			font: inherit;
			color: var(--a-blue);
			background: none;
			transition: opacity 0.3s var(--a-ease);

			&:hover {
				opacity: 0.75;
			}

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: 2px;
			}
		}

		&__chevron {
			display: inline-flex;
			width: 16px;
			height: 16px;
			transition: transform 0.3s var(--a-ease);

			&--open {
				transform: rotate(180deg);
			}
		}

		&__list {
			scrollbar-width: none;
			position: absolute;
			z-index: 5;
			top: calc(100% + 8px);
			left: -12px;
			overflow-y: auto;
			overscroll-behavior: contain;
			width: max-content;
			min-width: 220px;
			max-width: min(320px, calc(100vw - 40px));
			max-height: min(340px, 48dvh);
			margin: 0;
			padding: 6px;
			border-radius: 16px;
			list-style: none;
			background: var(--a-pop);
			outline: none;
			box-shadow:
				0 18px 48px rgb(0 0 0 / 16%),
				0 2px 8px rgb(0 0 0 / 8%);

			&--up {
				top: auto;
				bottom: calc(100% + 8px);
			}
		}

		&__option {
			cursor: pointer;
			display: flex;
			gap: 8px;
			align-items: center;
			padding: 8px 12px 8px 8px;
			border-radius: 10px;
			font-size: 16px;
			line-height: 1.3;
			color: var(--a-fg);
			transition: background 0.15s var(--a-ease);

			&--active {
				background: var(--a-fill);
			}

			&[aria-selected='true'] {
				font-weight: 600;
				color: var(--a-blue);
			}
		}

		&__check {
			display: inline-flex;
			flex: none;
			width: 16px;
			height: 16px;
		}

		&__chevron,
		&__check {
			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				width: 100%;
				height: 100%;
				stroke-width: 2;
			}
		}
	}
</style>
