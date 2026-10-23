<!--
	Чат по статье: поле вопроса в нижней строке статьи (.article__dock в article.css), которая
	липнет к низу экрана шириной в колонку текста, под ним размытая подложка. Фокус в поле накрывает статью размытием, поверх в той же колонке идёт
	диалог. Переписка живёт только в памяти страницы, а вебвизор её не видит: в ней симптомы
-->
<script lang="ts">
	import { ChevronLeft, CornerDownLeft, RotateCcw } from 'lucide-static'
	import { onMount } from 'svelte'

	import ChatAnswer from '#frontend/components/chat-answer.svelte'
	import SiteHeader from '#frontend/components/site-header.svelte'
	import { chatStatus, forgetSession, sendReply, type ChatEvent } from '#frontend/lib/chat-client.ts'
	import { chatAvailable } from '#frontend/lib/chat-flag.ts'
	import { chat } from '#frontend/lib/chat-state.svelte.ts'
	import { CHAT_FAILURES, CHAT_TURNS, type ChatTurn } from '#frontend/lib/chat-texts.ts'
	import { metrikaGoal } from '#frontend/lib/metrika.ts'

	let {
		injury,
		sport,
		host,
		enabled = typeof document !== 'undefined' && document.documentElement.dataset.chat === 'on',
	}: {
		/** Статья, которую читают: ассистент знает, о чём вопрос. */
		injury: { slug: string; title: string }
		/** Спорт страницы, slug. */
		sport?: string
		/** Нижняя строка статьи в ридере главной: поле встаёт в неё перед кнопкой оглавления. */
		host?: () => HTMLElement | null | undefined
		/**
		 * Чат включён всем (`CHAT=on`): строка есть уже в разметке страницы и видна с первого
		 * кадра, а поле до скрипта выключено. Включённый только по метке `?chat=1` выясняется
		 * в браузере.
		 */
		enabled?: boolean
	} = $props()

	const EXAMPLES = ['Как понять, что это у меня?', 'К какому врачу идти?', 'Когда можно тренироваться?']

	/** Скрипт запущен и чат здесь доступен: до этого поле видно, но выключено. */
	let available = $state(false)
	let open = $state(false)
	let draft = $state('')
	let field = $state<HTMLTextAreaElement>()
	let feed = $state<HTMLElement>()
	let bar = $state<HTMLElement>()

	const busy = $derived(chat.turns.at(-1)?.pending ?? false)
	const over = $derived(chat.left <= 0)

	onMount(() => {
		let storage: Storage | undefined

		// Закрытый sessionStorage бросает уже на обращении к нему
		try {
			storage = sessionStorage
		} catch {}

		available = chatAvailable({ root: document.documentElement, search: location.search, storage })
	})

	// В ридере главной строка статьи пришла из её страницы без скрипта: поле переезжает в неё
	const portal = (node: HTMLElement) => {
		host?.()?.prepend(node)
	}

	/** Подсказка в пустом поле, пока в нём ничего не происходит. */
	const PROMPT = 'Спросите о боли'

	let hint = $state(PROMPT)

	// Пустое поле будто кто-то заполняет: печатает с запинками, задумывается, стирает и пробует
	// другой вопрос. Вопросы -- про эту статью: строке статьи их дают данные травмы (prompts).
	// Начинает и заканчивает своей подсказкой. Пока поле в фокусе, в нём текст или анимации
	// выключены -- обычная подсказка
	$effect(() => {
		if (!available || open || draft || chat.closed || over) return

		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

		const drafts: string[] = JSON.parse(bar?.closest<HTMLElement>('.article__dock')?.dataset.prompts ?? '[]')

		if (!drafts.length) return

		let timer: ReturnType<typeof setTimeout>
		let stopped = false
		const wait = (ms: number) => new Promise((resolve) => (timer = setTimeout(resolve, ms)))
		const type = async (text: string) => {
			for (let n = hint.length + 1; n <= text.length && !stopped; n++) {
				hint = text.slice(0, n)

				// Между словами -- подольше, иногда задумывается посреди фразы
				await wait(
					text[n - 1] === ' '
						? 120 + Math.random() * (Math.random() < 0.2 ? 700 : 120)
						: 45 + Math.random() * 70,
				)
			}
		}
		const erase = async () => {
			while (hint && !stopped) {
				hint = hint.slice(0, -1)
				await wait(28)
			}
		}

		;(async () => {
			await wait(2500)

			for (let i = 0; !stopped; i = (i + 1) % drafts.length) {
				await erase()
				await wait(400)
				await type(drafts[i]!)
				await wait(1800)
				await erase()
				await wait(500)
				await type(PROMPT)
				await wait(4000)
			}
		})()

		return () => {
			stopped = true
			clearTimeout(timer)
			hint = PROMPT
		}
	})

	// Клавиатура телефона: строка статьи поднимается над ней, а не прячется под неё
	$effect(() => {
		const viewport = window.visualViewport
		const row = bar?.closest<HTMLElement>('.article__dock')

		if (!available || !viewport || !row) return

		const lift = () =>
			row.style.setProperty('--keyboard', `${Math.max(0, innerHeight - viewport.height - viewport.offsetTop)}px`)

		viewport.addEventListener('resize', lift)
		viewport.addEventListener('scroll', lift)

		return () => {
			viewport.removeEventListener('resize', lift)
			viewport.removeEventListener('scroll', lift)
			row.style.removeProperty('--keyboard')
		}
	})

	// Открытый диалог: фон не прокручивается, статус чата проверяем заново
	$effect(() => {
		if (!open) return

		// Прокручивается ридер главной, а на отдельной странице -- сам документ
		const root = bar?.closest<HTMLElement>('.reader') ?? document.documentElement
		const row = bar?.closest<HTMLElement>('.article__dock')
		const overflow = root.style.overflow

		// В конце статьи строка стоит на своём месте, выше низа экрана, и поле висело бы посреди
		// диалога. Статью под размытием чуть откатываем назад: строка снова липнет к низу
		if (row) {
			const rest = innerHeight - parseFloat(getComputedStyle(row).bottom) - row.getBoundingClientRect().bottom

			if (rest > 1) root.scrollBy({ top: -rest })
		}

		root.style.overflow = 'hidden'
		chatStatus().then((status) => (chat.closed = !status.open))
		metrikaGoal('chat-open')

		return () => {
			root.style.overflow = overflow
		}
	})

	const scrollDown = () => requestAnimationFrame(() => feed?.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' }))

	function apply(turn: ChatTurn, event: ChatEvent) {
		if (event.type === 'session') chat.session = event.id
		else if (event.type === 'status') turn.step = event.step
		else if (event.type === 'alarms') {
			turn.flags = [...turn.flags, ...event.flags]

			if (event.flags.some((f) => f.alarms.some((a) => a.urgency !== 'soon'))) metrikaGoal('chat-alarm')
		} else if (event.type === 'cards')
			turn.cards = [...turn.cards, ...event.cards.filter((c) => !turn.cards.some((k) => k.slug === c.slug))]
		else if (event.type === 'text') turn.text = event.text
		else if (event.type === 'done') chat.left = event.turnsLeft
		else {
			turn.failure = event.reason

			if (event.reason === 'closed') chat.closed = true

			if (event.reason === 'expired') chat.session = undefined

			if (event.reason === 'turns' || event.reason === 'cost') chat.left = 0
		}
	}

	async function send(text = draft) {
		const question = text.trim()

		if (!question || busy || over || chat.closed) return

		open = true
		draft = ''
		chat.turns.push({ question, flags: [], cards: [], pending: true })

		const turn = chat.turns.at(-1)!

		metrikaGoal('chat-send')
		scrollDown()

		for await (const event of sendReply({
			message: question,
			session: chat.session,
			sport,
			article: injury.slug,
		})) {
			apply(turn, event)
			scrollDown()
		}

		turn.pending = false
	}

	/** Последний сегмент пути -- slug травмы: `/crossfit/acl-tear/` и `/injuries/acl-tear/` -- одна статья. */
	const slugOf = (path: string) => path.split('/').filter(Boolean).at(-1)

	/**
	 * Ссылка из ответа открывается на этой же странице. Раздел читаемой статьи -- плавная прокрутка
	 * к нему. Другая статья на главной -- в ридере: сцена (body-3d.svelte) берёт её из адреса по
	 * popstate, как при "Назад", а переписка живёт в общем состоянии. С отдельной страницы --
	 * обычный переход в той же вкладке.
	 */
	function follow(event: MouseEvent, href: string) {
		const url = new URL(href, location.href)

		// Чужой сайт и клик с модификатором -- как обычно: новая вкладка, окно
		const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey

		if (url.origin !== location.origin || event.button !== 0 || modified) return

		event.preventDefault()
		close()

		if (slugOf(url.pathname) === slugOf(location.pathname)) {
			const id = decodeURIComponent(url.hash.slice(1))

			if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

			return
		}

		// Ридер главной открывает только статьи своего спорта: со статьёй другого спорта сцена
		// не находила её и уходила на главную. Её и общую /injuries/ -- обычным переходом
		const sport = (path: string) => path.split('/').find(Boolean)

		if (document.documentElement.dataset.step && sport(url.pathname) === sport(location.pathname)) {
			history.pushState(null, '', `${url.pathname}${location.search}`)
			dispatchEvent(new PopStateEvent('popstate'))

			return
		}

		location.assign(url)
	}

	function restart() {
		if (chat.session) forgetSession(chat.session)

		chat.turns = []
		chat.session = undefined
		chat.left = CHAT_TURNS
		field?.focus()
	}

	function close() {
		open = false
		field?.blur()
	}

	// Esc при открытом чате сворачивает его. Дальше событие не идёт: сайт считает Esc кнопкой
	// "Назад" (lib/back-link.ts) и увёл бы со статьи, если фокус не в поле ввода
	function escape(event: KeyboardEvent) {
		if (!open || event.key !== 'Escape') return

		event.preventDefault()
		event.stopPropagation()
		close()
	}

	function keydown(event: KeyboardEvent) {
		// Enter отправляет и на телефоне, перенос строки -- Shift+Enter. Enter, которым набор
		// иероглифов или подсказка клавиатуры подтверждают слово, -- не отправка
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault()
			send()
		}
	}

	// Поле растёт с текстом до четырёх строк, дальше прокручивается
	const grow = (node: HTMLTextAreaElement) => {
		const fit = () => {
			node.style.height = 'auto'
			node.style.height = `${Math.min(node.scrollHeight, 4 * 22 + 14)}px`
		}

		node.addEventListener('input', fit)

		return () => node.removeEventListener('input', fit)
	}
</script>

{#snippet welcome()}
	<div class="dock__welcome">
		<p class="dock__para">
			Опишите своими словами, что болит и&nbsp;как это случилось, или спросите про «{injury.title}». Ассистент
			сначала проверит тревожные признаки, потом ответит по&nbsp;статьям справочника&nbsp;— только по&nbsp;ним.
		</p>
		{#if chat.closed}
			<p class="dock__notice">{CHAT_FAILURES.closed}</p>
		{:else if !chat.turns.length}
			<ul class="dock__examples" aria-label="Примеры вопросов">
				{#each EXAMPLES as example (example)}
					<li>
						<button class="dock__example" type="button" onclick={() => send(example)}>{example}</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/snippet}

{#snippet disclaimer()}
	<div class="dock__disclaimer">
		<p class="dock__para dock__para--note">
			Это справка, а&nbsp;не&nbsp;диагноз. Сильная боль, деформация, онемение, удар по&nbsp;голове&nbsp;— сразу
			103 или&nbsp;112.
		</p>
		<p class="dock__para dock__para--note">
			Не пишите имя и&nbsp;контакты. Вопрос обрабатывает нейросеть на&nbsp;серверах в&nbsp;США, у&nbsp;нас текст
			не&nbsp;сохраняется. <a href="/about/#data">Подробнее о&nbsp;данных</a>. Отправляя вопрос, вы с&nbsp;этим
			соглашаетесь.
		</p>
	</div>
{/snippet}

<svelte:window onkeydowncapture={escape} />

{#if enabled || available}
	<div class="dock" class:dock--open={open} {@attach portal}>
		<div class="dock__veil">
			<!-- Шапка та же, что у статьи: стрелка "Назад" сворачивает чат обратно в строку -->
			<SiteHeader>
				<button class="article-bar__back dock__back" type="button" aria-label="Назад к статье" onclick={close}
					>{@html ChevronLeft}</button
				>
				<p class="dock__title">Ассистент</p>
				{#if chat.turns.length}
					<button
						class="dock__restart"
						type="button"
						aria-label="Новый диалог"
						data-hint="Новый диалог"
						onclick={restart}><span class="dock__icon" aria-hidden="true">{@html RotateCcw}</span></button
					>
				{/if}
			</SiteHeader>

			<!-- Дисклеймер -- слева, на месте оглавления статьи; на узком экране он над диалогом -->
			<aside class="dock__aside" aria-label="Важно">
				{@render disclaimer()}
			</aside>

			<section
				class="dock__feed ym-hide-content"
				aria-label="Вопрос по статье"
				aria-live="polite"
				bind:this={feed}
			>
				{@render welcome()}

				<div class="dock__intro-inline">
					{@render disclaimer()}
				</div>

				{#each chat.turns as turn, index (index)}
					<ChatAnswer {turn} onlink={follow} />
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
				class:dock__input--waiting={!available}
				rows="1"
				maxlength="1000"
				enterkeyhint="send"
				placeholder={chat.closed ? 'Ассистент вернётся завтра' : hint}
				aria-label="Вопрос по справочнику"
				disabled={!available || chat.closed || over}
				bind:value={draft}
				bind:this={field}
				onfocus={() => (open = true)}
				onkeydown={keydown}
				{@attach grow}></textarea>
			<button
				class="dock__send"
				type="submit"
				aria-label="Отправить"
				disabled={!available || !draft.trim() || busy || chat.closed || over}
				><span class="dock__send-icon" aria-hidden="true">{@html CornerDownLeft}</span></button
			>
		</form>
	</div>
{/if}

<style>
	/* Сам блок в раскладке не участвует: поле -- в ряду строки статьи рядом с кнопкой оглавления,
	   размытие и подложка -- fixed поверх. Слои -- внутри строки статьи (z-index 40 в article.css) */
	.dock {
		/* Колонка диалога -- та же, что у текста статьи (article.css): 680px с полями страницы,
		   на широком экране правее бокового оглавления. Проценты -- от окна: размытие fixed */
		--dock-column: min(680px, 100% - 48px);
		--dock-left: calc((100% - var(--dock-column)) / 2);
		--dock-width: var(--dock-column);
		/* Строка поля высотой 44px над отступом снизу: под ней подложка, над ней конец ленты */
		--dock-clear: calc(max(16px, env(safe-area-inset-bottom)) + 44px);

		display: contents;
		font-family: -apple-system, blinkmacsystemfont, 'SF Pro Text', system-ui, sans-serif;
		color: var(--fg);

		@media (width < 600px) {
			--dock-column: calc(100% - 40px);
		}

		@media (width >= 1100px) {
			--dock-left: calc((100% - 1052px) / 2 + 348px);
		}

		@media print {
			display: none;
		}

		/* В Mini App Telegram чата нет: признак ставит скрипт в <head> (layouts/base.astro) */
		:global(:root[data-telegram]) & {
			display: none;
		}

		/* Размытая статья под диалогом: видна, но не мешает читать ответ */
		&__veil {
			position: fixed;
			z-index: 1;
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

		/* Шапка -- как у статьи, лента и сайдбар начинаются под ней */
		/* Значки темы в углу остаются под размытием: место под них в шапке отдаём заголовку */
		&__veil > :global(.site-header) {
			position: absolute;
			top: 0;
			left: 0;
			padding-right: var(--frame-x);
		}

		&__back {
			cursor: pointer;
			padding: 0;
			border: 0;
			background: none;
		}

		&__restart {
			cursor: pointer;
			display: inline-grid;
			flex: none;
			place-items: center;
			width: var(--back-size);
			height: var(--back-size);
			margin-left: auto;
			padding: 0;
			border: 0;
			border-radius: 50%;
			color: var(--muted);
			background: none;
			transition:
				color 0.3s ease,
				background 0.3s ease;

			&:hover {
				color: var(--fg);
				background: color-mix(in srgb, var(--fg) 7%, transparent);
			}

			&:focus-visible {
				outline: 2px solid var(--accent);
				outline-offset: -2px;
			}
		}

		&__title {
			overflow: hidden;
			min-width: 0;
			margin: 0;
			font-size: 17px;
			font-weight: 600;
			text-overflow: ellipsis;
			letter-spacing: -0.02em;
			white-space: nowrap;
		}

		&__feed {
			scrollbar-width: none;
			position: absolute;
			top: var(--header-clear);
			bottom: 0;
			left: var(--dock-left);
			overflow-y: auto;
			overscroll-behavior: contain;
			width: var(--dock-width);
			padding: 8px 0 calc(var(--dock-clear) + 32px);
			font-size: 16px;
			line-height: 1.45;
		}

		/* Сайдбар -- колонка оглавления статьи: 260px и 64px до текста (styles/article.css) */
		&__aside {
			position: absolute;
			top: var(--header-clear);
			left: calc(var(--dock-left) - 64px - 260px);
			display: none;
			width: 260px;
			padding-top: 8px;
			font-size: 15px;
			line-height: 1.45;

			@media (width >= 1100px) {
				display: block;
			}
		}

		&__intro-inline {
			margin-top: 12px;

			@media (width >= 1100px) {
				display: none;
			}
		}

		&__welcome,
		&__disclaimer {
			display: grid;
			gap: 10px;
			justify-items: start;
		}

		&__welcome {
			padding-bottom: 16px;
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

		/* Подложка под строкой: статья под ней размывается и гаснет, текст не спорит с полем.
		   Едет вместе со строкой статьи: от неё вверх на 24px, вниз до края экрана, вбок -- на поля
		   страницы, как картинки статьи (article.css), и не дальше: иначе страница ездила бы вбок.
		   На телефоне поле во всю ширину экрана, шире -- края гаснут. Ниже поля и кнопки
		   оглавления: её подложка размывала бы их */
		&__shade {
			--shade-side: 20px;

			pointer-events: none;
			position: absolute;
			z-index: -1;
			inset: -24px calc(-1 * var(--shade-side)) calc(-1 * var(--dock-bottom, 16px));
			background: linear-gradient(to top, var(--bg) 35%, color-mix(in srgb, var(--bg) 0%, transparent));
			backdrop-filter: blur(6px);
			mask-image: linear-gradient(to top, #000000 55%, transparent);

			@media (width >= 600px) {
				--shade-side: 24px;

				mask-image:
					linear-gradient(to top, #000000 55%, transparent),
					linear-gradient(
						to right,
						transparent,
						#000000 var(--shade-side),
						#000000 calc(100% - var(--shade-side)),
						transparent
					);
				mask-composite: intersect;
			}

			@media (width >= 900px) {
				--shade-side: 48px;
			}

			/* В открытом чате -- поверх размытия статьи: лента так же гаснет под полем, как статья */
			.dock--open & {
				z-index: 1;
			}
		}

		/* Строка -- таблетка, как панель просмотрщика 3D (figure-3d.svelte): стеклянная подложка,
		   тонкая обводка, круглая кнопка цветом акцента. Ширину даёт ряд: свёрнутая строка
		   уступает место кнопке оглавления, в открытом чате та уходит (styles/toc-menu.css).
		   Над размытием открытого чата */
		&__bar {
			position: relative;
			z-index: 2;
			display: flex;
			flex: 1;
			gap: 4px;
			align-items: flex-end;
			min-width: 0;
			padding: 4px;
			border-radius: 22px;
			background: color-mix(in srgb, var(--bg) 72%, transparent);
			backdrop-filter: blur(12px);
			box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fg) 8%, transparent);
		}

		&__input {
			resize: none;
			flex: 1;
			min-height: 36px;
			padding: 7px 4px 7px 12px;
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

			/* До скрипта поле выключено, но выглядит как обычно: иначе оно мигало бы при включении */
			&:disabled:not(&--waiting) {
				opacity: 0.6;
			}
		}

		&__send {
			cursor: pointer;
			display: inline-flex;
			flex: none;
			align-items: center;
			justify-content: center;
			width: 36px;
			height: 36px;
			border: 0;
			border-radius: 50%;
			/* Заливка -- как у кнопки 3D и меню разделов: без спорта (общая страница /injuries/)
			   это градиент бренда, а не графитовый --accent */
			color: var(--on-accent);
			background: var(--accent-fill);
			transition: opacity 0.3s ease;

			&:hover:not(:disabled) {
				opacity: 0.85;
			}

			&:disabled {
				cursor: default;
				opacity: 0.3;
			}
		}

		&__send-icon {
			display: inline-flex;
			width: 16px;
			height: 16px;

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				width: 100%;
				height: 100%;
			}
		}

		&__bar:has(&__input:focus-visible) {
			outline: 2px solid var(--accent);
			outline-offset: 2px;
		}
	}
</style>
