<!--
	Кнопка со значением и всплывающий список вместо нативного select: фильтр движения в индексе
	главной и выбор спорта в заголовках. Клавиатура как у select: стрелки, Home/End, Enter, Escape,
	поиск по первым буквам. Стрелки только двигают подсветку, выбор -- Enter или клик: выбор спорта
	уводит на другую страницу, и случайная стрелка не должна туда переходить. Список открывается
	вниз, а если места нет -- вверх (на телефоне индекс внизу). Цвета -- токены сцены, на странице
	статьи их нет, там -- общие токены сайта. Если хоть у одного пункта есть иконка, колонка иконок
	есть у всех: пункт без неё стоит в одну линию с остальными.
-->
<script lang="ts">
	import { tick, type Snippet } from 'svelte'

	import { ChevronDown } from 'lucide-static'

	import { pageWidth } from '#frontend/lib/page-gutter.ts'

	/** `icon` -- SVG из lucide-static. */
	type Option = { slug: string; title: string; icon?: string }

	let {
		options,
		value,
		onchoose,
		labelledby,
		size = 'filter',
		face,
	}: {
		options: Option[]
		value: string
		/** Выбран пункт: клик или Enter. Тот же, что был, тоже приходит сюда -- решает вызывающий. */
		onchoose: (slug: string) => void
		/** id подписи: кнопка читается как «подпись, значение». */
		labelledby: string
		/** `filter` -- строка фильтра, `title` -- заголовок главной, `lead` -- строка под названием статьи. */
		size?: 'filter' | 'title' | 'lead'
		/** Что видно на кнопке; по умолчанию -- название выбранного пункта. */
		face?: Snippet<[Option]>
	} = $props()

	const id = $props.id()
	const current = $derived(options.find((o) => o.slug === value) ?? options[0])
	const withIcons = $derived(options.some((o) => o.icon))

	let open = $state(false)
	let up = $state(false)
	let active = $state(0)
	let root: HTMLDivElement
	let button: HTMLButtonElement
	let list = $state<HTMLUListElement>()
	/** Насколько список сдвинут влево, чтобы не уйти за правый край экрана. */
	let nudge = $state(0)
	let typed = ''
	let typedTimer: ReturnType<typeof setTimeout> | undefined

	/** Поле от края экрана, за которое список не заходит. */
	const EDGE = 16

	const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

	async function show() {
		const box = button.getBoundingClientRect()

		up = innerHeight - box.bottom < 300 && box.top > innerHeight - box.bottom
		active = Math.max(0, options.indexOf(current))
		nudge = 0
		open = true
		await tick()
		fitList()
		list?.focus({ preventScroll: true })
		scrollToActive()
	}

	// Список растёт вправо от кнопки, а кнопка на телефоне стоит посреди строки: длинные
	// пункты уводили его за край экрана. Сдвигаем влево, но не дальше левого поля. Замер
	// с уже стоящим сдвигом, поэтому повторный только поправляет его
	function fitList() {
		if (!list) return

		const { left, right } = list.getBoundingClientRect()
		const over = right - (pageWidth() - EDGE)

		nudge = Math.max(0, nudge + Math.min(over, left - EDGE))
	}

	// Остров на телефоне раскрывается с масштабом: список, открытый сразу, мерился сжатым
	function onWindowAnimationEnd(event: AnimationEvent) {
		if (open && (event.target as Element).contains(root)) fitList()
	}

	function hide(refocus = true) {
		open = false

		if (refocus) button.focus({ preventScroll: true })
	}

	function choose(index: number) {
		hide()
		onchoose(options[index].slug)
	}

	// Прокрутка только внутри списка: scrollIntoView двигал бы и страницу, а статья по ней узнаёт,
	// какой раздел читают
	function scrollToActive() {
		const item = list?.querySelector<HTMLElement>(`#${CSS.escape(`${id}-${active}`)}`)

		if (!list || !item) return

		if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop
		else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight)
			list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight
	}

	function move(to: number) {
		active = Math.min(options.length - 1, Math.max(0, to))
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
			End: () => move(options.length - 1),
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

		const found = options.findIndex((o) => o.title.toLowerCase().startsWith(typed))

		if (found >= 0) move(found)
	}

	// Клик мимо списка закрывает его, фокус при этом не перехватываем
	function onWindowPointer(event: PointerEvent) {
		if (open && !root.contains(event.target as Node)) hide(false)
	}

	// Страница вернулась из bfcache после перехода по пункту: список закрыт, как до выбора
	function onPageShow(event: PageTransitionEvent) {
		if (event.persisted) open = false
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

<svelte:window onpointerdown={onWindowPointer} onpageshow={onPageShow} onanimationend={onWindowAnimationEnd} />

<div class="pselect pselect--{size}" bind:this={root}>
	<button
		class="pselect__button"
		id="{id}-button"
		type="button"
		bind:this={button}
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-controls="{id}-list"
		aria-labelledby="{labelledby} {id}-button"
		onclick={() => (open ? hide() : show())}
		onkeydown={onButtonKey}
	>
		{#if face}{@render face(current)}{:else}{current.title}{/if}<span
			class="pselect__chevron"
			class:pselect__chevron--open={open}
			aria-hidden="true">{@html ChevronDown}</span
		>
	</button>

	{#if open}
		<ul
			class="pselect__list"
			class:pselect__list--up={up}
			style:translate={nudge ? `${-nudge}px 0` : undefined}
			id="{id}-list"
			role="listbox"
			tabindex="0"
			aria-labelledby={labelledby}
			aria-activedescendant="{id}-{active}"
			bind:this={list}
			onkeydown={onListKey}
			transition:pop
		>
			{#each options as option, i (option.slug)}
				<!-- Клавиатуру ведёт сам список через aria-activedescendant, у строк только мышь -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					class="pselect__option"
					class:pselect__option--active={i === active}
					id="{id}-{i}"
					role="option"
					aria-selected={option === current}
					onpointermove={() => (active = i)}
					onclick={() => choose(i)}
				>
					{#if withIcons}
						<span class="pselect__icon" aria-hidden="true">{@html option.icon ?? ''}</span>
					{/if}
					{option.title}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	/* Список без рамки: подложка светлее фона и мягкая тень */
	.pselect {
		--pselect-accent: var(--a-blue, var(--accent));
		--pselect-ease: var(--a-ease, cubic-bezier(0.25, 1, 0.5, 1));

		position: relative;
		display: inline-flex;

		&__button {
			cursor: pointer;
			display: inline-flex;
			gap: 4px;
			align-items: center;
			max-width: 240px;
			padding: 2px 0;
			border: 0;
			font: inherit;
			color: var(--pselect-accent);
			letter-spacing: inherit;
			background: none;
			transition: opacity 0.3s var(--pselect-ease);

			&:hover {
				opacity: 0.75;
			}

			&:focus-visible {
				border-radius: 6px;
				outline: 2px solid var(--pselect-accent);
				outline-offset: 2px;
			}
		}

		&__chevron {
			display: inline-flex;
			flex: none;
			width: 16px;
			height: 16px;
			transition: transform 0.3s var(--pselect-ease);

			&--open {
				transform: rotate(180deg);
			}
		}

		/* Фраза спорта в заголовке: кнопка -- та же строка заголовка, без своих полей */
		&--title &__button,
		&--lead &__button {
			max-width: none;
			padding: 0;
			white-space: nowrap;
		}

		&--title &__chevron {
			width: 0.6em;
			height: 0.6em;
			margin-left: 0.05em;
		}

		&--lead &__chevron {
			width: 0.8em;
			height: 0.8em;
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
			font-size: 16px;
			font-weight: 400;
			letter-spacing: normal;
			list-style: none;
			background: var(--a-pop, var(--bg));
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
			padding: 8px 12px;
			border-radius: 10px;
			font-size: 16px;
			line-height: 1.3;
			color: var(--a-fg, var(--fg));
			transition: background 0.15s var(--pselect-ease);

			&--active {
				background: var(--a-fill, var(--surface));
			}

			/* Выбранный -- жирный и цвета акцента, без галочки: фон занят подсветкой стрелок и мыши */
			&[aria-selected='true'] {
				font-weight: 600;
				color: var(--pselect-accent);
			}
		}

		/* Иконка приглушена, у выбранного пункта -- цвета акцента, как текст */
		&__icon {
			display: inline-flex;
			flex: none;
			width: 18px;
			height: 18px;
			color: var(--a-fg2, var(--muted));
		}

		&__option[aria-selected='true'] &__icon {
			color: inherit;
		}

		&__chevron,
		&__icon {
			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				width: 100%;
				height: 100%;
				stroke-width: 2;
			}
		}

		/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
		&--title &__chevron :global(svg) {
			stroke-width: 3;
		}
	}
</style>
