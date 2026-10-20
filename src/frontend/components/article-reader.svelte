<!--
	Статья поверх модели главной: её страница грузится целиком, в ридер встаёт main.
	Сцену прячет и будит родитель (body-3d.svelte), здесь -- загрузка, чтение и "Назад".
-->
<script lang="ts">
	import { mount, onDestroy, tick, unmount, untrack, type Snippet } from 'svelte'

	import { ChevronLeft, CloudOff, TextQuote } from 'lucide-static'

	import BarLead from '#frontend/components/bar-lead.svelte'
	import SiteHeader from '#frontend/components/site-header.svelte'
	import SportSwitch from '#frontend/components/sport-switch.svelte'
	import { sportHome, sportOf, type SportSlug } from '#frontend/data/sports.ts'
	import { fadeUp } from '#frontend/lib/fade-up.ts'
	import { initReading } from '#frontend/lib/reading.ts'
	import { currentSection } from '#frontend/lib/sport-switch.ts'
	import { splitTitle } from '#frontend/lib/title.ts'

	type Props = {
		injury: { slug: string; title: string; summary: string }
		sport: string
		/** Раздел, на котором открыть статью после загрузки: его читали, когда сменили спорт. */
		section?: string
		/** Статья из адреса стоит на месте с первого кадра, открытая потом -- проявляется. */
		instant: boolean
		reduceMotion: boolean
		onback: () => void
		/**
		 * «Разбор ‹в …›»: другой спорт выбран прямо в статье, сцена меняет его на месте. Без него
		 * (страница элемента) -- обычный переход на статью спорта.
		 */
		onsport?: (sport: { slug: string; href: string }, section?: string) => void
		footer?: Snippet
	}

	let { injury, sport, section, instant, reduceMotion, onback, onsport, footer }: Props = $props()

	let status = $state<'loading' | 'ready' | 'error'>('loading')
	/**
	 * Разбор другого спорта той же травмы грузится поверх показанной статьи: она стоит до подмены,
	 * а не уступает место заготовке без строки «Разбор» -- иначе селект пропадал, и текст прыгал.
	 */
	let reloading = $state(false)
	/** Травма, чья статья сейчас в теле ридера. */
	let shown: string | undefined
	let body = $state<HTMLDivElement>()
	let reader = $state<HTMLElement>()
	let progressBar = $state<HTMLElement>()
	let stopReading: (() => void) | undefined
	/** Номер последней загрузки: ответ, пришедший после перехода к другой статье, отбрасываем. */
	let loadToken = 0
	let destroyed = false

	/** Выбор спорта в статье: острова Astro во вставленном HTML не оживают, монтируем сами. */
	let switches: ReturnType<typeof mount>[] = []

	function unmountSwitches() {
		for (const app of switches) void unmount(app)

		switches = []
	}

	function mountSwitches(root: HTMLElement) {
		unmountSwitches()

		switches = [...root.querySelectorAll<HTMLElement>('[data-sport-switch]')].map((target) => {
			const props = JSON.parse(target.dataset.sportSwitch ?? '{}')

			target.replaceChildren()

			// Как выбор спорта в заголовке главной: сцена остаётся, разбор -- с того же раздела
			const onchoose =
				onsport &&
				((choice: { slug: string; href: string }) => onsport(choice, reader && currentSection(reader)))

			return mount(SportSwitch, { target, props: { ...props, onchoose } })
		})
	}

	/**
	 * Ширина своей полосы прокрутки ридера -- в `--reader-bar`, на неё страница статьи заходит
	 * под полосу (стили `&__page`). Мерим саму полосу, а не место под полосу окна: их ширина
	 * совпадает не всегда, при скрытых полосах место у окна остаётся, а полоса ридера нулевая.
	 * Полоса появляется, когда статья догрузится, и меняется с масштабом: пересчёт по размеру.
	 */
	$effect(() => {
		const el = reader

		if (!el) return

		const measure = () => el.style.setProperty('--reader-bar', `${el.offsetWidth - el.clientWidth}px`)
		const observer = new ResizeObserver(measure)

		observer.observe(el)

		return () => observer.disconnect()
	})

	$effect(() => {
		const slug = injury.slug

		// Только от травмы: load читает status, и без untrack ошибка загрузки перезапускала её по кругу
		untrack(() => void load(slug))
	})

	// Компонент уходит, когда статья догаснет: переключатели и чтение снимаем тогда же
	onDestroy(() => {
		destroyed = true
		loadToken++
		stopReading?.()
		unmountSwitches()
	})

	async function load(slug: string) {
		const token = ++loadToken

		if (status === 'ready' && shown === slug) reloading = true
		else status = 'loading'

		try {
			const response = await fetch(`/${sport}/${slug}/`)

			if (!response.ok) throw new Error(`HTTP ${response.status}`)

			// Разбираем только main: стили из head страницы статьи Chrome сверяет с CSP этой
			// страницы даже в инертном документе DOMParser и сыплет ошибками в консоль
			const html = await response.text()
			const from = html.indexOf('<main')
			const to = html.lastIndexOf('</main>')

			if (from < 0 || to < from) throw new Error('no <main> in article page')

			const doc = new DOMParser().parseFromString(html.slice(from, to + '</main>'.length), 'text/html')
			const main = doc.querySelector('main')

			if (!main) throw new Error('no <main> in article page')

			// Чипы зоны и частоты в полноэкранной статье лишние
			main.querySelector('.article__meta')?.remove()
			await tick()

			if (token !== loadToken || destroyed || !body || !reader) return

			// Второй main на странице не нужен: те же классы и содержимое, но в div
			const root = document.createElement('div')

			root.className = main.className
			root.append(...[...main.childNodes].map((node) => document.importNode(node, true)))
			stopReading?.()
			body.replaceChildren(root)
			shown = slug
			mountSwitches(root)
			reader.scrollTo(0, 0)
			stopReading = initReading(root, reader, progressBar ?? null)
			status = 'ready'
			reloading = false
			await tick()

			// К разделу -- когда статья уже показана: пока она грузится, тело скрыто и прокрутке
			// не за что зацепиться. Раздел читаем без подписки, перезагружать статью из-за него не нужно
			const anchor = untrack(() => section)

			if (anchor) root.querySelector(`#${CSS.escape(anchor)}`)?.scrollIntoView({ block: 'start' })

			// Фокус -- на статью, а не на стрелку: скринридер начинает с неё, а у кнопки нет
			// рамки фокуса, которую браузер рисовал при программном переводе
			reader.focus({ preventScroll: true })
		} catch (error) {
			if (token !== loadToken || destroyed) return

			console.error(error)
			status = 'error'
			reloading = false
			shown = undefined
		}
	}
</script>

<!--
	global: ридер уходит вместе с {#if} родителя, а локальный outro
	в сборке тогда не играет. Ловит e2e deeplink про переключатель спорта
-->
<article
	class="reader"
	tabindex="-1"
	bind:this={reader}
	transition:fadeUp|global={{ rise: 0, instant, reduceMotion }}
	aria-label={injury.title}
	aria-busy={status === 'loading' || reloading}
>
	<div class="reader__progress" aria-hidden="true">
		<span class="reader__progress-bar" bind:this={progressBar}></span>
	</div>
	<!-- Шире прокрутки на место под полосу окна: см. .reader__page -->
	<div class="reader__page">
		<SiteHeader>
			<button class="reader__back" type="button" aria-label="Назад" title="Назад" onclick={onback}
				><span class="reader__back-icon" aria-hidden="true">{@html ChevronLeft}</span></button
			>
			<!-- Логотип и маленький заголовок, который проявляется по мере прокрутки. Пока статья
			     грузится, прокручивать нечего, и без скрытия он стоял бы над тем же названием.
			     Логотип ведёт на эту же главную: закрывает статью, как "Назад" -->
			<BarLead
				title={splitTitle(injury.title).name}
				home={sportHome(sport as SportSlug)}
				titleHidden={status !== 'ready'}
				onhome={onback}
			/>
		</SiteHeader>
		{#if status === 'loading'}
			<!-- Пока статья грузится -- её начало из тех же классов: название и "Коротко" уже известны
			     из списка и сразу стоят на своих местах. Подмена на загруженную статью их не сдвигает -->
			<div class="reader__body" aria-hidden="true">
				<div class="article">
					<header class="article__hero">
						<h1 class="article__title">{splitTitle(injury.title).name}</h1>
						<!-- Строка «Разбор» той же высоты, что в статье: «Коротко» под ней не подскакивает -->
						<div class="article__sport">
							Разбор <span class="article__sport-phrase">{sportOf(sport as SportSlug).phrase}</span>
						</div>
						<div class="article__summary">
							<p class="article__summary-label">
								<span class="article__summary-icon">{@html TextQuote}</span>Коротко
							</p>
							<p class="article__summary-text">{injury.summary}</p>
						</div>
					</header>
				</div>
			</div>
		{:else if status === 'error'}
			<div class="reader__failed" role="alert">
				<span class="reader__failed-icon" aria-hidden="true">{@html CloudOff}</span>
				<p class="reader__failed-title">Статья не загрузилась</p>
				<p class="reader__failed-text">
					«{splitTitle(injury.title).name}» не открылась: похоже, пропала связь. Попробуйте ещё раз или
					откройте статью отдельной страницей.
				</p>
				<div class="reader__failed-actions">
					<button
						type="button"
						class="reader__action reader__action--main"
						onclick={() => void load(injury.slug)}
					>
						Попробовать ещё раз<span
							class="reader__action-mark reader__action-mark--retry"
							aria-hidden="true">↻</span
						>
					</button>
					<a class="reader__action" href="/{sport}/{injury.slug}/">
						Открыть отдельно<span class="reader__action-mark" aria-hidden="true">→</span>
					</a>
				</div>
			</div>
		{/if}
		<div class="reader__body" bind:this={body} hidden={status !== 'ready'}></div>
		{#if footer && status === 'ready'}{@render footer()}{/if}
	</div>
</article>

<style>
	/* Статья на весь экран на чистом фоне; верхний край растворяется под кнопкой "Назад" */
	.reader {
		/* Фон шапки статьи -- цвет её страницы */
		--site-header-bg: var(--a-page);
		position: fixed;
		z-index: 2;
		inset: 0;
		overflow-x: hidden;
		overflow-y: auto;

		overscroll-behavior: contain;
		background: var(--a-page);

		@media (prefers-reduced-motion: reduce) {
			&__action-mark {
				transition: none;
			}
		}

		&:focus {
			outline: none;
		}

		&__back {
			cursor: pointer;
			/* Подложка 32px на стрелке и 8px до маленького заголовка: он стоит по тексту пунктов
			   оглавления, а подложка под него не заходит. Зона нажатия добрана ::before влево и
			   по высоте, к заголовку она не тянется */
			position: relative;
			display: inline-grid;
			place-items: center;
			width: var(--back-size);
			height: var(--back-size);
			margin: 0 var(--back-gap) 0 calc(-1 * var(--back-pull));
			padding: 0;
			border: 0;
			border-radius: 50%;
			color: var(--a-blue);
			background: none;
			transition: background 0.3s var(--a-ease);

			&::before {
				content: '';
				position: absolute;
				inset: -6px 0 -6px -6px;
			}

			:global([data-telegram]) & {
				display: none;
			}

			&:hover {
				background: var(--a-fill);
			}

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				/* Внутрь круга: снаружи рамка подходила бы к заголовку ближе 8px */
				outline-offset: -2px;
			}
		}

		&__back-icon {
			display: inline-flex;
			width: 28px;
			height: 28px;

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				/* Оптическая поправка влево, как у .article-bar__back */
				translate: -6% 0;
				width: 100%;
				height: 100%;
				stroke-width: 2.2;
			}
		}

		/* Статья не загрузилась: по центру экрана знак в мягком круге цвета спорта, пояснение
		   и два выхода -- повторить здесь или открыть отдельную страницу */
		&__failed {
			display: grid;
			align-content: center;
			justify-items: center;
			max-width: 480px;
			min-height: 70dvh;
			margin: 0 auto;
			padding: 24px;
			text-align: center;
		}

		&__failed-icon {
			display: grid;
			place-items: center;
			width: 72px;
			height: 72px;
			margin-bottom: 20px;
			border-radius: 50%;
			color: var(--a-blue);
			background: color-mix(in srgb, var(--a-blue) 10%, transparent);
			box-shadow: 0 0 0 10px color-mix(in srgb, var(--a-blue) 5%, transparent);

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				width: 32px;
				height: 32px;
				stroke-width: 1.6;
			}
		}

		&__failed-title {
			margin: 0;
			font-size: 24px;
			font-weight: 700;
			line-height: 1.2;
			color: var(--a-fg);
			letter-spacing: -0.01em;
		}

		&__failed-text {
			margin: 10px 0 0;
			font-size: 16px;
			line-height: 1.45;
			color: var(--a-fg2);
			text-wrap: pretty;
		}

		&__failed-actions {
			display: flex;
			flex-wrap: wrap;
			gap: 4px 8px;
			justify-content: center;
			margin-top: 20px;
		}

		/* Действия -- как строки списка травм (injury-list.svelte): жирный текст и знак цветом
		   спорта, который при наведении сдвигается. Подложка при наведении -- как у "‹" в шапке.
		   Главное действие -- "Попробовать ещё раз", оно целиком цветом спорта */
		&__action {
			cursor: pointer;
			display: inline-flex;
			align-items: center;
			min-height: 44px;
			padding: 0 14px;
			border: 0;
			border-radius: 999px;
			font: inherit;
			font-size: 17px;
			font-weight: 600;
			color: var(--a-fg);
			text-decoration: none;
			background: none;
			transition: background 0.3s ease;

			&:hover {
				background: color-mix(in srgb, var(--a-fg) 7%, transparent);
			}

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: -2px;
			}

			&--main {
				color: var(--a-blue);
			}
		}

		&__action-mark {
			display: inline-block;
			margin-left: 6px;
			font-weight: 400;
			color: var(--a-blue);
			transition: transform 0.35s var(--a-ease);
		}

		&__action:is(:hover, :focus-visible) &__action-mark {
			transform: translateX(4px);
		}

		&__action:is(:hover, :focus-visible) &__action-mark--retry {
			transform: rotate(180deg);
		}

		/* Саму статью оформляет общий styles/article.css, тот же, что у отдельной страницы */
		&__body {
			padding-bottom: 40px;

			/* Под липкой шапкой статье меньше верхнего отступа. Оглавление и якоря разделов
			   отступают от шапки сами: --header-clear в styles/global.css */
			& :global(.article) {
				padding-top: 8px;
			}

			/* Название и "Коротко" стоят с начала загрузки, пришедшее следом проявляется: иначе
			   текст выскакивал разом, будто страница рендерится кусками. backwards, а не both:
			   после конца анимация не держит opacity и не мешает липкому оглавлению */
			& :global(.article__hero > :not(.article__title, .article__summary)),
			& :global(.article > :not(.article__hero)) {
				animation: fade-in 0.5s var(--a-ease) backwards;
			}
		}

		/* Подвал приходит вместе со статьёй и проявляется с ней */
		& :global(.footer) {
			animation: fade-in 0.5s var(--a-ease) backwards;
		}

		/* На главной у окна нет своей прокрутки, но место под его полосу держится
		   (scrollbar.css из infra-site-kit), так что ридер шириной с отдельную страницу.
		   Своя полоса ридера отнимала бы у колонки ещё её ширину, и текст стоял бы левее, чем
		   на отдельной странице. Содержимое заходит под эту полосу на её ширину (--reader-bar
		   из скрипта выше): там только поля, а раскладка та же, что у отдельной страницы */
		&__page {
			margin-right: calc(-1 * var(--reader-bar, 0px));
		}

		/* Полоса прогресса чтения: тонкая, у верхнего края, рядом с "Назад". Над шапкой
		   (у неё z-index 10): под ней полосу размывал backdrop-filter */
		&__progress {
			pointer-events: none;
			position: fixed;
			z-index: 11;
			top: var(--tg-top);
			right: 0;
			left: 0;
			height: 3px;
		}

		&__progress-bar {
			transform-origin: left;
			transform: scaleX(0);
			display: block;
			height: 100%;
			background: linear-gradient(to right, transparent, var(--a-blue) 30%);
			transition: transform 0.15s linear;

			@media (--reduced-motion) {
				transition: none;
			}
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}
</style>
