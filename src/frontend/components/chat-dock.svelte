<!--
	Чат по статье: поле вопроса прилеплено к низу экрана шириной в колонку текста, под ним
	размытая подложка. Фокус в поле накрывает статью размытием, поверх в той же колонке идёт
	диалог. Переписка живёт только в памяти страницы, а вебвизор её не видит: в ней симптомы
-->
<script lang="ts">
	import { ArrowUp, RotateCcw, X } from 'lucide-static'
	import { onMount } from 'svelte'

	import ChatAnswer from '#frontend/components/chat-answer.svelte'
	import { chatStatus, forgetSession, sendReply, type ChatEvent } from '#frontend/lib/chat-client.ts'
	import { chatAvailable } from '#frontend/lib/chat-flag.ts'
	import { CHAT_FAILURES, CHAT_TURNS, type ChatTurn } from '#frontend/lib/chat-texts.ts'
	import { metrikaGoal } from '#frontend/lib/metrika.ts'

	let {
		injury,
		sport,
		column,
	}: {
		/** Статья, которую читают: ассистент знает, о чём вопрос. */
		injury: { slug: string; title: string }
		/** Спорт страницы, slug. */
		sport?: string
		/** Колонка текста, по ней строка берёт ширину; без неё -- `.article__body` страницы. */
		column?: () => HTMLElement | null | undefined
	} = $props()

	const EXAMPLES = ['Как понять, что это у меня?', 'К какому врачу идти?', 'Когда можно тренироваться?']

	let available = $state(false)
	let open = $state(false)
	let closed = $state(false)
	let turns = $state<ChatTurn[]>([])
	let session = $state<string>()
	let left = $state(CHAT_TURNS)
	let draft = $state('')
	let field = $state<HTMLTextAreaElement>()
	let feed = $state<HTMLElement>()
	let bar = $state<HTMLElement>()
	let place = $state({ left: 0, width: 0 })

	const busy = $derived(turns.at(-1)?.pending ?? false)
	const over = $derived(left <= 0)

	onMount(() => {
		let storage: Storage | undefined

		// Закрытый sessionStorage бросает уже на обращении к нему
		try {
			storage = sessionStorage
		} catch {}

		available = chatAvailable({ root: document.documentElement, search: location.search, storage })
	})

	// Строка и диалог живут в <body>: так им не мешают transform и overflow
	// ридера на главной
	const portal = (node: HTMLElement) => {
		document.body.append(node)

		return () => node.remove()
	}

	// Ширина и край -- как у колонки текста: на десктопе её сдвигает оглавление,
	// на телефоне она во всю ширину
	$effect(() => {
		if (!available) return

		const target = column?.() ?? document.querySelector<HTMLElement>('.article__body')

		if (!target) return

		const measure = () => {
			const rect = target.getBoundingClientRect()

			place = { left: rect.left, width: rect.width }
		}
		const observer = new ResizeObserver(measure)

		measure()
		observer.observe(target)
		addEventListener('resize', measure)

		return () => {
			observer.disconnect()
			removeEventListener('resize', measure)
		}
	})

	// Под строкой страница освобождает место: кнопка оглавления встаёт выше,
	// низ статьи не прячется
	$effect(() => {
		if (!available || !bar) return

		const root = document.documentElement
		const observer = new ResizeObserver(() =>
			root.style.setProperty('--chat-dock-lift', `${bar!.offsetHeight + 8}px`),
		)

		observer.observe(bar)

		return () => {
			observer.disconnect()
			root.style.removeProperty('--chat-dock-lift')
		}
	})

	// Клавиатура телефона: строка поднимается над ней, а не прячется под неё
	$effect(() => {
		const viewport = window.visualViewport

		if (!available || !viewport) return

		const lift = () =>
			bar?.style.setProperty('--keyboard', `${Math.max(0, innerHeight - viewport.height - viewport.offsetTop)}px`)

		viewport.addEventListener('resize', lift)
		viewport.addEventListener('scroll', lift)

		return () => {
			viewport.removeEventListener('resize', lift)
			viewport.removeEventListener('scroll', lift)
		}
	})

	// Открытый диалог: фон не прокручивается, статус чата проверяем заново
	$effect(() => {
		if (!open) return

		const root = document.documentElement
		const overflow = root.style.overflow

		root.style.overflow = 'hidden'
		chatStatus().then((status) => (closed = !status.open))
		metrikaGoal('chat-open')

		return () => {
			root.style.overflow = overflow
		}
	})

	const scrollDown = () => requestAnimationFrame(() => feed?.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' }))

	function apply(turn: ChatTurn, event: ChatEvent) {
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

		open = true
		draft = ''
		turns.push({ question, flags: [], cards: [], pending: true })

		const turn = turns.at(-1)!

		metrikaGoal('chat-send')
		scrollDown()

		for await (const event of sendReply({ message: question, session, sport, article: injury.slug })) {
			apply(turn, event)
			scrollDown()
		}

		turn.pending = false
	}

	function restart() {
		if (session) forgetSession(session)

		turns = []
		session = undefined
		left = CHAT_TURNS
		field?.focus()
	}

	function close() {
		open = false
		field?.blur()
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') return close()

		// На телефоне Enter -- перенос строки, отправка кнопкой; с клавиатурой Enter отправляет
		if (event.key === 'Enter' && !event.shiftKey && matchMedia('(hover: hover)').matches) {
			event.preventDefault()
			send()
		}
	}

	// Поле растёт с текстом до четырёх строк, дальше прокручивается
	const grow = (node: HTMLTextAreaElement) => {
		const fit = () => {
			node.style.height = 'auto'
			node.style.height = `${Math.min(node.scrollHeight, 4 * 22 + 22)}px`
		}

		node.addEventListener('input', fit)

		return () => node.removeEventListener('input', fit)
	}
</script>

<svelte:window onkeydown={(event) => open && event.key === 'Escape' && close()} />

{#if available}
	<div
		class="dock"
		class:dock--open={open}
		style:--dock-left="{place.left}px"
		style:--dock-width="{place.width}px"
		{@attach portal}
	>
		<!-- Нажатие мимо колонки сворачивает диалог обратно в строку -->
		<div
			class="dock__veil"
			role="presentation"
			onclick={(event) => event.target === event.currentTarget && close()}
		>
			<section
				class="dock__feed ym-hide-content"
				aria-label="Вопрос по статье"
				aria-live="polite"
				bind:this={feed}
				onclick={(event) => event.target === event.currentTarget && close()}
				role="presentation"
			>
				<header class="dock__intro">
					<div class="dock__intro-head">
						<p class="dock__intro-title">Вопрос по справочнику</p>
						{#if turns.length}
							<button class="dock__icon-button" type="button" aria-label="Новый диалог" onclick={restart}
								><span class="dock__icon" aria-hidden="true">{@html RotateCcw}</span></button
							>
						{/if}
						<button class="dock__icon-button" type="button" aria-label="Вернуться к статье" onclick={close}
							><span class="dock__icon" aria-hidden="true">{@html X}</span></button
						>
					</div>
					<p class="dock__para">
						Опишите своими словами, что болит и&nbsp;как это случилось, или спросите про «{injury.title}».
						Ассистент сначала проверит тревожные признаки, потом ответит по&nbsp;статьям справочника&nbsp;—
						только по&nbsp;ним.
					</p>
					<p class="dock__para dock__para--note">
						Это справка, а&nbsp;не&nbsp;диагноз, статьи пока не&nbsp;проверены врачом. Сильная боль,
						деформация, онемение, удар по&nbsp;голове&nbsp;— сразу 103 или&nbsp;112.
					</p>
					<p class="dock__para dock__para--note">
						Не пишите имя и&nbsp;контакты. Для ответа текст уходит через OpenRouter (США) к&nbsp;модели
						Claude, у&nbsp;нас он не&nbsp;сохраняется. Отправляя вопрос, вы с&nbsp;этим соглашаетесь.
					</p>
					{#if closed}
						<p class="dock__notice">{CHAT_FAILURES.closed}</p>
					{:else if !turns.length}
						<ul class="dock__examples" aria-label="Примеры вопросов">
							{#each EXAMPLES as example (example)}
								<li>
									<button class="dock__example" type="button" onclick={() => send(example)}
										>{example}</button
									>
								</li>
							{/each}
						</ul>
					{/if}
				</header>

				{#each turns as turn, index (index)}
					<ChatAnswer {turn} />
				{/each}

				{#if over && !busy}
					<p class="dock__notice">
						{CHAT_FAILURES.turns}
						<button class="dock__link-button" type="button" onclick={restart}>Новый диалог</button>
					</p>
				{/if}
			</section>
		</div>

		<div class="dock__shade" aria-hidden="true"></div>

		<form
			class="dock__bar"
			bind:this={bar}
			onsubmit={(event) => {
				event.preventDefault()
				send()
			}}
		>
			<!-- ym-disable-keys: вебвизор пишет звёздочки вместо набранного, в нём симптомы -->
			<textarea
				class="dock__input ym-disable-keys"
				rows="1"
				maxlength="1000"
				placeholder={closed ? 'Ассистент вернётся завтра' : 'Спросите о боли или травме'}
				aria-label="Вопрос по справочнику"
				disabled={closed || over}
				bind:value={draft}
				bind:this={field}
				onfocus={() => (open = true)}
				onkeydown={keydown}
				{@attach grow}></textarea>
			<button
				class="dock__send"
				type="submit"
				aria-label="Отправить"
				disabled={!draft.trim() || busy || closed || over}
				><span class="dock__icon" aria-hidden="true">{@html ArrowUp}</span></button
			>
		</form>
	</div>
{/if}

<style>
	.dock {
		/* Над шапкой сайта (10), оглавлением (20) и ридером главной */
		--dock-z: 40;
		--dock-gap: 12px;

		font-family: -apple-system, blinkmacsystemfont, 'SF Pro Text', system-ui, sans-serif;
		color: var(--fg);

		@media print {
			display: none;
		}

		/* Размытая статья под диалогом: видна, но не мешает читать ответ */
		&__veil {
			position: fixed;
			z-index: var(--dock-z);
			inset: 0;
			visibility: hidden;
			opacity: 0;
			background: color-mix(in srgb, var(--bg) 72%, transparent);
			backdrop-filter: blur(18px) saturate(1.2);
			transition:
				opacity 0.25s ease,
				visibility 0.25s;

			@media (--reduced-motion) {
				transition: none;
			}

			.dock--open & {
				visibility: visible;
				opacity: 1;
			}
		}

		&__feed {
			scrollbar-width: none;
			position: absolute;
			top: 0;
			bottom: 0;
			left: var(--dock-left);
			overflow-y: auto;
			overscroll-behavior: contain;
			width: var(--dock-width);
			padding: calc(24px + env(safe-area-inset-top)) 0 calc(var(--chat-dock-lift, 80px) + 24px);
			font-size: 16px;
			line-height: 1.45;
		}

		&__intro {
			display: grid;
			gap: 10px;
			padding-bottom: 16px;
			border-bottom: 1px solid color-mix(in srgb, var(--fg) 10%, transparent);
		}

		&__intro-head {
			display: flex;
			gap: 4px;
			align-items: center;
		}

		&__intro-title {
			flex: 1;
			margin: 0;
			font-size: 20px;
			font-weight: 650;
			letter-spacing: -0.02em;
		}

		&__para {
			margin: 0;

			&--note {
				font-size: 14px;
				color: var(--muted);
			}
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
			color: var(--muted);
			background: none;

			&:hover {
				color: var(--fg);
				background: color-mix(in srgb, var(--fg) 6%, transparent);
			}
		}

		&__examples {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			margin: 4px 0 0;
			padding: 0;
			list-style: none;
		}

		&__example {
			cursor: pointer;
			padding: 7px 14px;
			border: 1px solid color-mix(in srgb, var(--fg) 12%, transparent);
			border-radius: 999px;
			font: inherit;
			font-size: 15px;
			color: var(--fg);
			background: var(--bg);

			&:hover {
				background: color-mix(in srgb, var(--fg) 5%, var(--bg));
			}
		}

		&__notice {
			margin: 12px 0 0;
			padding: 10px 12px;
			border-radius: 12px;
			font-size: 15px;
			background: color-mix(in srgb, var(--fg) 5%, transparent);
		}

		&__link-button {
			cursor: pointer;
			padding: 0;
			border: 0;
			font: inherit;
			font-weight: 600;
			color: var(--accent);
			background: none;
		}

		/* Подложка под строкой: статья под ней размывается и гаснет, текст не спорит с полем */
		&__shade {
			pointer-events: none;
			position: fixed;
			z-index: calc(var(--dock-z) - 2);
			right: 0;
			bottom: 0;
			left: 0;
			height: calc(var(--chat-dock-lift, 80px) + 24px);
			background: linear-gradient(to top, var(--bg) 35%, color-mix(in srgb, var(--bg) 0%, transparent));
			backdrop-filter: blur(6px);
			mask-image: linear-gradient(to top, #000000 55%, transparent);

			.dock--open & {
				display: none;
			}
		}

		&__bar {
			position: fixed;
			z-index: calc(var(--dock-z) + 1);
			bottom: calc(var(--keyboard, 0px) + max(var(--dock-gap), env(safe-area-inset-bottom)));
			left: var(--dock-left);
			display: flex;
			gap: 8px;
			align-items: flex-end;
			width: var(--dock-width);
			padding: 6px;
			border: 1px solid color-mix(in srgb, var(--fg) 10%, transparent);
			border-radius: 26px;
			background: var(--bg);
			box-shadow: 0 8px 28px rgb(0 0 0 / 10%);
		}

		&__input {
			resize: none;
			flex: 1;
			min-height: 40px;
			padding: 9px 4px 9px 12px;
			border: 0;

			/* 16px и больше: иначе iOS увеличивает страницу при фокусе */
			font: inherit;
			font-size: 16px;
			line-height: 22px;
			color: var(--fg);
			background: none;

			&:focus {
				outline: none;
			}

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
			width: 40px;
			height: 40px;
			border: 0;
			border-radius: 50%;
			color: var(--on-accent);
			background: var(--accent);

			&:disabled {
				cursor: default;
				opacity: 0.3;
			}
		}

		&__bar:has(&__input:focus-visible) {
			outline: 2px solid var(--accent);
			outline-offset: 2px;
		}
	}
</style>
