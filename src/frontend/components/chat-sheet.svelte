<!--
	Чат со справочником: человек описывает боль, ассистент отвечает по статьям (src/backend/chat).
	На телефоне -- лист на весь экран, на десктопе -- панель справа. Переписка живёт только
	в памяти страницы, а вебвизор её не видит: в ней симптомы
-->
<script lang="ts">
	import { ArrowUp, FileText, RotateCcw, Siren, X } from 'lucide-static'

	import {
		chatStatus,
		forgetSession,
		mergeAlarms,
		sendReply,
		type ChatCard,
		type ChatEvent,
		type ChatFailure,
		type ChatFlags,
	} from '#frontend/lib/chat-client.ts'
	import { chatMarkdown, type ChatInline } from '#frontend/lib/chat-markdown.ts'
	import { metrikaGoal } from '#frontend/lib/metrika.ts'

	let {
		open,
		sport,
		onclose,
	}: {
		open: boolean
		/** Спорт страницы, slug: ассистент подставит его в поиск. */
		sport?: string
		onclose: () => void
	} = $props()

	type Turn = {
		question: string
		step?: 'red-flags' | 'search' | 'article'
		flags: ChatFlags
		cards: ChatCard[]
		text?: string
		failure?: ChatFailure
		pending: boolean
	}

	const TURNS = 4

	const STEPS = {
		'red-flags': 'Проверяю тревожные признаки…',
		search: 'Ищу похожие травмы…',
		article: 'Читаю статью…',
	}

	const FAILURES: Record<ChatFailure, string> = {
		rate: 'Слишком много вопросов подряд. Подождите минуту и спросите снова.',
		closed: 'Ассистент на сегодня всё, вернётся завтра. Пока можно поискать по справочнику.',
		turns: 'В этом диалоге вопросов больше нельзя. Откройте статью или начните новый диалог.',
		cost: 'В этом диалоге вопросов больше нельзя. Откройте статью или начните новый диалог.',
		expired: 'Диалог закончился: прошло больше получаса. Начните новый.',
		busy: 'Предыдущий ответ ещё готовится.',
		unavailable: 'Не получилось ответить. Попробуйте чуть позже или найдите травму через поиск.',
	}

	const EXAMPLES = ['Болит колено после бега', 'Потянул спину на становой', 'Подвернул голеностоп']

	const URGENCY = { call: 'Скорая 103 или 112', today: 'Сегодня в травмпункт', soon: 'К врачу в ближайшие дни' }

	let turns = $state<Turn[]>([])
	let session = $state<string>()
	let left = $state(TURNS)
	let draft = $state('')
	let agreed = $state(false)
	let closed = $state(false)
	let field = $state<HTMLTextAreaElement>()
	let feed = $state<HTMLElement>()
	let sheet = $state<HTMLElement>()

	const busy = $derived(turns.at(-1)?.pending ?? false)
	const over = $derived(left <= 0)

	// Лист живёт в <body>: так ему не мешают transform и overflow предков, а токены сцены на body
	const portal = (node: HTMLElement) => {
		document.body.append(node)

		return () => node.remove()
	}

	$effect(() => {
		if (!open) return

		chatStatus().then((status) => (closed = !status.open))
		metrikaGoal('chat-open')

		// Фон под листом не прокручивается; клавиатура телефона сжимает лист, а не уводит поле
		const scroll = document.documentElement.style.overflow
		const viewport = window.visualViewport
		const fit = () => sheet?.style.setProperty('--chat-height', `${viewport?.height ?? window.innerHeight}px`)

		document.documentElement.style.overflow = 'hidden'
		fit()

		viewport?.addEventListener('resize', fit)

		;(agreed ? field : sheet?.querySelector<HTMLElement>('[data-autofocus]'))?.focus()

		return () => {
			document.documentElement.style.overflow = scroll
			viewport?.removeEventListener('resize', fit)
		}
	})

	const scrollDown = () => requestAnimationFrame(() => feed?.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' }))

	function apply(turn: Turn, event: ChatEvent) {
		if (event.type === 'session') session = event.id
		else if (event.type === 'status') turn.step = event.step
		else if (event.type === 'alarms') {
			turn.flags = [...turn.flags, ...event.flags]

			if (event.flags.some((f) => f.alarms.some((a) => a.urgency !== 'soon'))) metrikaGoal('chat-alarm')
		} else if (event.type === 'cards')
			turn.cards = [...turn.cards, ...event.cards.filter((c) => !turn.cards.some((k) => k.slug === c.slug))]
		else if (event.type === 'text') turn.text = event.text
		else if (event.type === 'done') left = event.turnsLeft
		else {
			turn.failure = event.reason

			if (event.reason === 'closed') closed = true

			if (event.reason === 'expired') session = undefined

			if (event.reason === 'turns' || event.reason === 'cost') left = 0
		}
	}

	async function send(text = draft) {
		const question = text.trim()

		if (!question || busy || over || closed) return

		draft = ''
		turns.push({ question, flags: [], cards: [], pending: true })

		const turn = turns.at(-1)!

		metrikaGoal('chat-send')
		scrollDown()

		for await (const event of sendReply({ message: question, session, sport })) {
			apply(turn, event)
			scrollDown()
		}

		turn.pending = false
		field?.focus()
	}

	function restart() {
		if (session) forgetSession(session)

		turns = []
		session = undefined
		left = TURNS
		field?.focus()
	}

	function keydown(event: KeyboardEvent) {
		// На телефоне Enter -- перенос строки, отправка кнопкой; с клавиатурой Enter отправляет
		if (event.key === 'Enter' && !event.shiftKey && matchMedia('(hover: hover)').matches) {
			event.preventDefault()
			send()
		}
	}

	function agree() {
		agreed = true
		requestAnimationFrame(() => field?.focus())
	}

	// Поле растёт с текстом до четырёх строк, дальше прокручивается
	const grow = (node: HTMLTextAreaElement) => {
		const fit = () => {
			node.style.height = 'auto'
			node.style.height = `${Math.min(node.scrollHeight, 4 * 22 + 20)}px`
		}

		node.addEventListener('input', fit)

		return () => node.removeEventListener('input', fit)
	}
</script>

{#snippet line(inline: ChatInline[])}
	{#each inline as part, p (p)}
		{#if part.type === 'strong'}<strong>{part.text}</strong>
		{:else if part.type === 'link'}<a
				class="chat__link"
				href={part.href}
				target={new URL(part.href).origin === location.origin ? undefined : '_blank'}
				rel="noopener">{part.text}</a
			>
		{:else}{part.text}{/if}
	{/each}
{/snippet}

<svelte:window onkeydown={(event) => open && event.key === 'Escape' && onclose()} />

<div
	class="chat"
	class:chat--open={open}
	role="dialog"
	aria-modal="true"
	aria-labelledby="chat-title"
	hidden={!open}
	bind:this={sheet}
	{@attach portal}
>
	<header class="chat__head">
		<h2 class="chat__title" id="chat-title">Описать своими словами</h2>
		{#if turns.length}
			<button class="chat__icon-button" type="button" aria-label="Новый диалог" onclick={restart}
				><span class="chat__icon" aria-hidden="true">{@html RotateCcw}</span></button
			>
		{/if}
		<button class="chat__icon-button" type="button" aria-label="Закрыть" onclick={onclose}
			><span class="chat__icon" aria-hidden="true">{@html X}</span></button
		>
	</header>

	<!-- Лента с симптомами: вебвизор Метрики пишет вместо неё пустое место -->
	<div class="chat__feed ym-hide-content" bind:this={feed} aria-live="polite">
		{#if !turns.length}
			<div class="chat__intro">
				<p class="chat__para">
					Опишите, что болит и&nbsp;как это случилось. Ассистент сначала проверит тревожные признаки, потом
					подберёт статьи справочника.
				</p>
				<p class="chat__para chat__muted">
					Это справка по&nbsp;статьям, а&nbsp;не&nbsp;диагноз. Статьи пока черновики: врач их ещё
					не&nbsp;проверил.
				</p>
				{#if closed}
					<p class="chat__notice">{FAILURES.closed}</p>
				{:else if !agreed}
					<div class="chat__consent">
						<p class="chat__para chat__para--small">
							Не пишите имя и&nbsp;контакты. Для ответа текст уходит через OpenRouter (США) к&nbsp;модели
							Claude, у&nbsp;нас он не&nbsp;сохраняется.
						</p>
						<button class="chat__primary" type="button" data-autofocus onclick={agree}>Понятно</button>
					</div>
				{:else}
					<ul class="chat__examples" aria-label="Примеры">
						{#each EXAMPLES as example (example)}
							<li>
								<button class="chat__example" type="button" onclick={() => send(example)}
									>{example}</button
								>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		{#each turns as turn, index (index)}
			{@const alarms = mergeAlarms(turn.flags)}
			{@const urgent = alarms.filter((a) => a.urgency !== 'soon')}
			{@const later = alarms.filter((a) => a.urgency === 'soon')}
			<p class="chat__question">{turn.question}</p>
			<div class="chat__answer">
				{#if urgent.length}
					<ul class="chat__alarms" aria-label="Когда сразу к врачу">
						{#each urgent as alarm (alarm.text)}
							<li class="chat__alarm chat__alarm--{alarm.urgency}">
								<span class="chat__alarm-action"
									><span class="chat__icon chat__icon--small" aria-hidden="true">{@html Siren}</span
									>{URGENCY[alarm.urgency]}</span
								>
								<span>{alarm.text}</span>
							</li>
						{/each}
					</ul>
				{/if}
				{#if later.length}
					<details class="chat__later">
						<summary class="chat__later-toggle">{URGENCY.soon}: ещё {later.length}</summary>
						<ul class="chat__later-list">
							{#each later as alarm (alarm.text)}
								<li>{alarm.text}</li>
							{/each}
						</ul>
					</details>
				{/if}

				{#if turn.text}
					<div class="chat__text">
						{#each chatMarkdown(turn.text) as block, b (b)}
							{#if block.type === 'paragraph'}
								<p class="chat__para">{@render line(block.inline)}</p>
							{:else if block.ordered}
								<ol class="chat__list">
									{#each block.items as item, i (i)}<li>{@render line(item)}</li>{/each}
								</ol>
							{:else}
								<ul class="chat__list">
									{#each block.items as item, i (i)}<li>{@render line(item)}</li>{/each}
								</ul>
							{/if}
						{/each}
					</div>
				{:else if turn.pending}
					<p class="chat__status" role="status">{turn.step ? STEPS[turn.step] : 'Думаю…'}</p>
				{/if}

				{#if turn.cards.length && !turn.pending}
					<ul class="chat__cards" aria-label="Статьи">
						{#each turn.cards as card (card.slug)}
							<li>
								<a class="chat__card" href={card.url}>
									<span class="chat__icon chat__icon--small" aria-hidden="true">{@html FileText}</span
									>
									<span class="chat__card-title">{card.title}</span>
									{#if card.draft}<span class="chat__draft" title="Врач ещё не проверил"
											>черновик</span
										>{/if}
								</a>
							</li>
						{/each}
					</ul>
				{/if}

				{#if turn.failure}
					<p class="chat__notice" role="alert">{FAILURES[turn.failure]}</p>
				{/if}
			</div>
		{/each}

		{#if over && !busy}
			<p class="chat__notice">
				{FAILURES.turns}
				<button class="chat__link-button" type="button" onclick={restart}>Новый диалог</button>
			</p>
		{/if}
	</div>

	<footer class="chat__foot">
		<p class="chat__disclaimer">
			Справка, а&nbsp;не&nbsp;диагноз. Сильная боль, деформация, онемение, удар по&nbsp;голове&nbsp;— сразу 103
			или&nbsp;112.
		</p>
		<form
			class="chat__form"
			onsubmit={(event) => {
				event.preventDefault()
				send()
			}}
		>
			<!-- ym-disable-keys: вебвизор пишет звёздочки вместо набранного, в нём симптомы -->
			<textarea
				class="chat__input ym-disable-keys"
				rows="1"
				maxlength="1000"
				placeholder={closed ? 'Вернётся завтра' : 'Что болит и как это случилось'}
				aria-label="Ваш вопрос"
				disabled={!agreed || closed || over}
				bind:value={draft}
				bind:this={field}
				onkeydown={keydown}
				{@attach grow}></textarea>
			<button
				class="chat__send"
				type="submit"
				aria-label="Отправить"
				disabled={!draft.trim() || busy || !agreed || closed || over}
				><span class="chat__icon" aria-hidden="true">{@html ArrowUp}</span></button
			>
		</form>
	</footer>
</div>

<style>
	.chat {
		--chat-height: 100dvh;

		position: fixed;
		z-index: 60;
		inset: 0 0 auto;
		display: flex;
		flex-direction: column;
		height: var(--chat-height);
		padding-top: env(safe-area-inset-top);
		font-family: var(--a-font);
		color: var(--a-fg);
		background: var(--a-page);

		@media (--md) {
			inset: 16px 16px auto auto;
			width: min(420px, calc(100vw - 32px));
			height: min(720px, calc(var(--chat-height) - 32px));
			padding-top: 0;
			border-radius: 22px;
			box-shadow:
				0 0 0 1px var(--a-sep),
				0 24px 60px rgb(0 0 0 / 18%);
		}

		&[hidden] {
			display: none;
		}

		&__head {
			display: flex;
			gap: 4px;
			align-items: center;
			padding: 10px 8px 10px 20px;
			border-bottom: 1px solid var(--a-sep);
		}

		&__title {
			flex: 1;
			margin: 0;
			font-size: 17px;
			font-weight: 600;
		}

		&__icon {
			display: inline-flex;
			flex: none;
			width: 20px;
			height: 20px;

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				width: 100%;
				height: 100%;
			}

			&--small {
				width: 16px;
				height: 16px;
			}
		}

		&__icon-button {
			cursor: pointer;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 40px;
			height: 40px;
			border: 0;
			border-radius: 50%;
			color: var(--a-fg2);
			background: none;

			&:hover {
				color: var(--a-fg);
				background: var(--a-fill);
			}
		}

		&__feed {
			scrollbar-width: thin;
			overflow-y: auto;
			overscroll-behavior: contain;
			flex: 1;
			padding: 16px 20px 8px;
			font-size: 16px;
			line-height: 1.45;
		}

		&__intro {
			display: grid;
			gap: 12px;
		}

		&__para {
			margin: 0 0 8px;

			.chat__intro & {
				margin: 0;
			}

			&--small {
				font-size: 15px;
			}
		}

		&__list {
			margin: 0 0 8px;
			padding-left: 20px;
		}

		&__link {
			color: var(--a-blue);
		}

		&__muted,
		&__disclaimer {
			color: var(--a-fg2);
		}

		&__consent {
			display: grid;
			gap: 12px;
			justify-items: start;
			padding: 14px 16px;
			border-radius: 14px;
			background: var(--a-fill);
		}

		&__primary {
			cursor: pointer;
			padding: 8px 18px;
			border: 0;
			border-radius: 999px;
			font: inherit;
			font-weight: 600;
			color: var(--a-on-blue);
			background: var(--a-blue);
		}

		&__examples {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			margin: 0;
			padding: 0;
			list-style: none;
		}

		&__example {
			cursor: pointer;
			padding: 7px 14px;
			border: 1px solid var(--a-sep);
			border-radius: 999px;
			font: inherit;
			font-size: 15px;
			color: var(--a-fg);
			background: none;

			&:hover {
				background: var(--a-fill);
			}
		}

		&__question {
			width: fit-content;
			max-width: 85%;
			margin: 16px 0 10px auto;
			padding: 8px 14px;
			border-radius: 18px 18px 4px;
			color: var(--a-on-blue);
			overflow-wrap: anywhere;
			white-space: pre-wrap;
			background: var(--a-blue);
		}

		&__answer {
			display: grid;
			gap: 10px;
		}

		&__alarms {
			display: grid;
			gap: 6px;
			margin: 0;
			padding: 0;
			list-style: none;
		}

		&__alarm {
			display: grid;
			gap: 2px;
			padding: 10px 12px;
			border-left: 3px solid var(--a-red);
			border-radius: 10px;
			font-size: 15px;
			background: var(--a-fill);

			&--call {
				background: color-mix(in srgb, var(--a-red) 14%, transparent);
			}
		}

		&__alarm-action {
			display: inline-flex;
			gap: 6px;
			align-items: center;
			font-size: 13px;
			font-weight: 600;
			color: var(--a-red);
		}

		&__later {
			font-size: 15px;
			color: var(--a-fg2);
		}

		&__later-toggle {
			cursor: pointer;
		}

		&__later-list {
			margin: 6px 0 0;
			padding-left: 18px;
		}

		&__text {
			overflow-wrap: anywhere;
		}

		&__status {
			margin: 0;
			color: var(--a-fg2);
			animation: chat-pulse 1.4s ease-in-out infinite;

			@media (--reduced-motion) {
				animation: none;
			}
		}

		&__cards {
			display: grid;
			gap: 6px;
			margin: 0;
			padding: 0;
			list-style: none;
		}

		&__card {
			display: flex;
			gap: 8px;
			align-items: center;
			padding: 10px 12px;
			border: 1px solid var(--a-sep);
			border-radius: 12px;
			font-size: 15px;
			color: var(--a-fg);
			text-decoration: none;

			&:hover {
				background: var(--a-fill);
			}
		}

		&__card-title {
			flex: 1;
		}

		&__draft {
			flex: none;
			padding: 2px 8px;
			border-radius: 999px;
			font-size: 12px;
			color: var(--a-fg2);
			background: var(--a-fill);
		}

		&__notice {
			margin: 8px 0 0;
			padding: 10px 12px;
			border-radius: 12px;
			font-size: 15px;
			background: var(--a-fill);
		}

		&__link-button {
			cursor: pointer;
			padding: 0;
			border: 0;
			font: inherit;
			font-weight: 600;
			color: var(--a-blue);
			background: none;
		}

		&__foot {
			display: grid;
			gap: 8px;
			padding: 8px 12px calc(10px + env(safe-area-inset-bottom));
			border-top: 1px solid var(--a-sep);
		}

		&__disclaimer {
			margin: 0 8px;
			font-size: 12px;
			line-height: 1.35;
		}

		&__form {
			display: flex;
			gap: 8px;
			align-items: flex-end;
		}

		&__input {
			resize: none;
			flex: 1;
			min-height: 44px;
			padding: 11px 16px;
			border: 1px solid var(--a-sep);
			border-radius: 22px;

			/* 16px и больше: иначе iOS увеличивает страницу при фокусе */
			font: inherit;
			font-size: 16px;
			line-height: 22px;
			color: var(--a-fg);
			background: var(--a-bg);

			&:disabled {
				opacity: 0.6;
			}
		}

		&__send {
			cursor: pointer;
			display: inline-flex;
			flex: none;
			align-items: center;
			justify-content: center;
			width: 44px;
			height: 44px;
			border: 0;
			border-radius: 50%;
			color: var(--a-on-blue);
			background: var(--a-blue);

			&:disabled {
				cursor: default;
				opacity: 0.35;
			}
		}
	}

	@keyframes chat-pulse {
		50% {
			opacity: 0.45;
		}
	}
</style>
