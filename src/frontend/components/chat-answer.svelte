<!--
	Ответ чата на один вопрос: реплика модели, под ней свёрнутый список тревожных признаков из
	инструмента -- подходящие к описанию модель называет сама, полный список под рукой -- и статьи
-->
<script lang="ts">
	import { FileText, Siren, Sparkles } from 'lucide-static'

	import { mergeAlarms } from '#frontend/lib/chat-client.ts'
	import { chatMarkdown, type ChatInline } from '#frontend/lib/chat-markdown.ts'
	import { CHAT_FAILURES, CHAT_STEPS, CHAT_URGENCY, type ChatTurn } from '#frontend/lib/chat-texts.ts'

	let {
		turn,
		onlink,
	}: {
		turn: ChatTurn
		/** Клик по ссылке ответа или карточке: строка чата решает, как открыть статью. */
		onlink?: (event: MouseEvent, href: string) => void
	} = $props()

	const alarms = $derived(mergeAlarms(turn.flags))

	const external = (href: string) => new URL(href, location.href).origin !== location.origin
</script>

{#snippet line(inline: ChatInline[])}
	{#each inline as part, p (p)}
		{#if part.type === 'strong'}<strong>{part.text}</strong>
		{:else if part.type === 'link'}<a
				class="answer__link"
				href={part.href}
				onclick={(event) => onlink?.(event, part.href)}
				target={external(part.href) ? '_blank' : undefined}
				rel="noopener">{part.text}</a
			>
		{:else}{part.text}{/if}
	{/each}
{/snippet}

<p class="answer__question">{turn.question}</p>
<div class="answer">
	{#if turn.text}
		<div class="answer__text">
			{#each chatMarkdown(turn.text) as block, b (b)}
				{#if block.type === 'paragraph'}
					<p class="answer__para">{@render line(block.inline)}</p>
				{:else if block.ordered}
					<ol class="answer__list">
						{#each block.items as item, i (i)}<li>{@render line(item)}</li>{/each}
					</ol>
				{:else}
					<ul class="answer__list">
						{#each block.items as item, i (i)}<li>{@render line(item)}</li>{/each}
					</ul>
				{/if}
			{/each}
		</div>
	{:else if turn.pending}
		<!-- Как в нейрочатах: звёздочка пульсирует, по названию шага бежит блик -->
		<p class="answer__thinking" role="status">
			<span class="answer__spark" aria-hidden="true">{@html Sparkles}</span>
			<span class="answer__shimmer">{turn.step ? CHAT_STEPS[turn.step] : 'Думаю…'}</span>
		</p>
	{/if}

	{#if alarms.length && !turn.pending}
		<details class="answer__alarms">
			<summary class="answer__alarms-toggle"
				><span class="answer__icon" aria-hidden="true">{@html Siren}</span>Когда сразу к врачу · {alarms.length}</summary
			>
			<ul class="answer__alarms-list">
				{#each alarms as alarm (alarm.text)}
					<li class="answer__alarm">
						<span class="answer__alarm-action answer__alarm-action--{alarm.urgency}"
							>{CHAT_URGENCY[alarm.urgency]}</span
						>
						{alarm.text}
					</li>
				{/each}
			</ul>
		</details>
	{/if}

	{#if turn.cards.length && !turn.pending}
		<ul class="answer__cards" aria-label="Статьи">
			{#each turn.cards as card (card.slug)}
				<li>
					<a class="answer__card" href={card.url} onclick={(event) => onlink?.(event, card.url)}>
						<span class="answer__icon" aria-hidden="true">{@html FileText}</span>
						<span class="answer__card-title">{card.title}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	{#if turn.failure}
		<p class="answer__notice" role="alert">{CHAT_FAILURES[turn.failure]}</p>
	{/if}
</div>

<style>
	.answer {
		display: grid;
		gap: 10px;

		&__question {
			width: fit-content;
			max-width: 85%;
			margin: 24px 0 12px auto;
			padding: 8px 14px;
			border-radius: 18px 18px 4px;
			color: var(--on-accent);
			overflow-wrap: anywhere;
			white-space: pre-wrap;
			background: var(--accent);
		}

		&__icon {
			display: inline-flex;
			flex: none;
			width: 16px;
			height: 16px;

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				width: 100%;
				height: 100%;
			}
		}

		&__cards {
			display: grid;
			gap: 6px;
			margin: 0;
			padding: 0;
			list-style: none;
		}

		&__alarms {
			border-radius: 12px;
			font-size: 15px;
			background: color-mix(in srgb, var(--fg) 4%, transparent);
		}

		&__alarms-toggle {
			cursor: pointer;
			display: flex;
			gap: 8px;
			align-items: center;
			padding: 10px 12px;
			font-weight: 600;
			color: var(--danger);
		}

		&__alarms-list {
			display: grid;
			gap: 8px;
			margin: 0;
			padding: 0 12px 12px;
			list-style: none;
		}

		&__alarm {
			display: grid;
			gap: 2px;
		}

		&__alarm-action {
			font-size: 13px;
			font-weight: 600;
			color: var(--muted);

			&--call,
			&--today {
				color: var(--danger);
			}
		}

		&__text {
			overflow-wrap: anywhere;
		}

		&__para,
		&__list {
			margin: 0 0 8px;
		}

		&__list {
			padding-left: 20px;
		}

		&__link {
			color: var(--accent);
		}

		&__thinking {
			display: flex;
			gap: 8px;
			align-items: center;
			margin: 0;
		}

		&__spark {
			display: inline-flex;
			flex: none;
			width: 18px;
			height: 18px;
			color: var(--accent);
			animation: answer-spark 1.6s ease-in-out infinite;

			@media (--reduced-motion) {
				animation: none;
			}

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				width: 100%;
				height: 100%;
			}
		}

		/* Блик бежит по тексту слева направо: градиент шире текста и едет по нему */
		&__shimmer {
			color: transparent;
			background: linear-gradient(
					90deg,
					var(--muted) 0%,
					var(--muted) 35%,
					var(--fg) 50%,
					var(--muted) 65%,
					var(--muted) 100%
				)
				0 0 / 250% 100%;
			background-clip: text;
			animation: answer-shimmer 1.8s linear infinite;

			@media (--reduced-motion) {
				color: var(--muted);
				animation: none;
			}
		}

		&__card {
			display: flex;
			gap: 8px;
			align-items: center;
			padding: 10px 12px;
			border: 1px solid color-mix(in srgb, var(--fg) 10%, transparent);
			border-radius: 12px;
			font-size: 15px;
			color: var(--fg);
			text-decoration: none;

			&:hover {
				background: color-mix(in srgb, var(--fg) 5%, transparent);
			}
		}

		&__card-title {
			flex: 1;
		}

		&__notice {
			margin: 0;
			padding: 10px 12px;
			border-radius: 12px;
			font-size: 15px;
			background: color-mix(in srgb, var(--fg) 5%, transparent);
		}
	}

	@keyframes answer-spark {
		50% {
			transform: scale(0.82) rotate(12deg);
			opacity: 0.55;
		}
	}

	@keyframes answer-shimmer {
		from {
			background-position: 100% 0;
		}

		to {
			background-position: -50% 0;
		}
	}
</style>
