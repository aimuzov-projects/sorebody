<!--
	Вход в чат со справочником. Кнопки нет, пока чат не включён для этого посетителя
	(lib/chat-flag.ts); лист чата грузится отдельным куском по первому нажатию и после
	закрытия остаётся в памяти, чтобы переписка дожила до следующего открытия
-->
<script lang="ts">
	import { MessageCircle } from 'lucide-static'
	import { onMount, type Component } from 'svelte'

	import { chatAvailable } from '#frontend/lib/chat-flag.ts'

	let {
		sport,
		variant = 'row',
	}: {
		/** Спорт страницы, slug. */
		sport?: string
		/** `row` -- рядом с поиском, `empty` -- в подсказке «ничего не нашлось». */
		variant?: 'row' | 'empty'
	} = $props()

	let available = $state(false)
	let open = $state(false)
	let Sheet = $state<Component<{ open: boolean; sport?: string; onclose: () => void }>>()
	let button = $state<HTMLButtonElement>()

	onMount(() => {
		let storage: Storage | undefined

		// Закрытый sessionStorage бросает уже на обращении к нему
		try {
			storage = sessionStorage
		} catch {}

		available = chatAvailable({ root: document.documentElement, search: location.search, storage })
	})

	async function show() {
		Sheet ??= (await import('#frontend/components/chat-sheet.svelte')).default
		open = true
	}

	function close() {
		open = false
		button?.focus()
	}
</script>

{#if available}
	<button class="chat-entry chat-entry--{variant}" type="button" bind:this={button} onclick={show}>
		<span class="chat-entry__icon" aria-hidden="true">{@html MessageCircle}</span>
		{variant === 'empty' ? 'Описать боль своими словами' : 'Описать своими словами'}
	</button>
{/if}

{#if Sheet}
	<Sheet {open} {sport} onclose={close} />
{/if}

<style>
	.chat-entry {
		cursor: pointer;
		display: inline-flex;
		gap: 6px;
		align-items: center;
		padding: 0;
		border: 0;
		font: inherit;
		font-size: 15px;
		font-weight: 600;
		color: var(--a-blue);
		background: none;

		&:hover {
			text-decoration: underline;
		}

		&--row {
			margin: 8px 0 4px;
		}

		&--empty {
			margin-top: 12px;
		}

		&__icon {
			display: inline-flex;
			width: 18px;
			height: 18px;

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				width: 100%;
				height: 100%;
			}
		}
	}
</style>
