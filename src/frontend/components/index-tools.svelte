<!--
	Поиск и фильтры индекса главной. На десктопе обёртки прозрачны для раскладки: поле, фильтры
	и результаты стоят в колонке индекса (body-3d.svelte). На телефоне это остров внизу экрана:
	свёрнутым он показывает включённые фильтры, по нажатию раскрывается
-->
<script lang="ts">
	import { ChevronDown, Search, X } from 'lucide-static'

	import type { Frequency } from '#frontend/data/frequency.ts'
	import { splitTitle } from '#frontend/lib/title.ts'
	import type { activeFilterChips, zoneEntries } from '#frontend/scene/filters.ts'
	import type { Zone } from '#frontend/scene/zones.ts'

	import FrequencySwitch from '#frontend/components/frequency-switch.svelte'
	import MovementSelect from '#frontend/components/movement-select.svelte'
	import SearchField from '#frontend/components/search-field.svelte'

	type Injury = Zone['injuries'][number]

	let {
		query = $bindable(''),
		frequency = $bindable('all'),
		movement = $bindable(''),
		open = $bindable(false),
		movements,
		elementLabel,
		chips,
		filtering,
		results,
		sport,
		onreset,
		onpick,
	}: {
		query: string
		frequency: 'all' | Frequency
		movement: string
		/**
		 * Остров на телефоне раскрыт, а не свёрнут в таблетку.
		 * Родитель сворачивает его, открывая зону или статью.
		 */
		open: boolean
		movements: { slug: string; title: string }[]
		elementLabel: string
		chips: ReturnType<typeof activeFilterChips>
		filtering: boolean
		results: ReturnType<typeof zoneEntries>
		sport: string
		onreset: () => void
		onpick: (event: MouseEvent, injury: Injury) => void
	} = $props()

	let toolsPanel = $state<HTMLDivElement>()
	/** Высота клавиатуры над низом окна: iOS не сжимает под неё окно, и раскрытый остров уходил бы под неё. */
	let keyboard = $state(0)

	// Поиск не фокусируем: на телефоне это поднимало клавиатуру, даже если искать не собирались
	function openTools() {
		open = true
	}

	function closeTools() {
		open = false

		;(document.activeElement as HTMLElement | null)?.blur()
	}

	function onToolsKey(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !open) return

		event.stopPropagation()
		closeTools()
	}

	$effect(() => {
		const viewport = window.visualViewport

		if (!open || !viewport) return

		const update = () => (keyboard = Math.max(0, innerHeight - viewport.height - viewport.offsetTop))

		update()
		viewport.addEventListener('resize', update)
		viewport.addEventListener('scroll', update)

		return () => {
			viewport.removeEventListener('resize', update)
			viewport.removeEventListener('scroll', update)
			keyboard = 0
		}
	})
</script>

<div
	class="index__tools"
	class:index__tools--open={open}
	style:--keyboard="{keyboard}px"
	onkeydown={onToolsKey}
	role="presentation"
>
	<!-- Фон под раскрытым островом: гасит и чуть размывает экран, тап по нему сворачивает остров -->
	<div class="index__scrim" onclick={closeTools} role="presentation"></div>
	<div class="index__island">
		<button
			class="index__island-open"
			type="button"
			aria-expanded={open}
			aria-controls="index-tools"
			onclick={openTools}
		>
			<span class="index__island-icon" aria-hidden="true">{@html Search}</span>
			<!-- В подписи бывает текст запроса: вебвизор её не пишет, как и поле поиска -->
			<span class="index__island-label" class:ym-hide-content={query.trim() !== ''}
				>{chips.length ? chips.map((f) => f.label).join(' · ') : 'Поиск и фильтры'}</span
			>
		</button>
		{#if filtering}
			<button class="index__island-reset" type="button" aria-label="Сбросить фильтры" onclick={onreset}
				><span class="index__island-icon" aria-hidden="true">{@html X}</span></button
			>
		{/if}
	</div>
	<div class="index__panel" id="index-tools" bind:this={toolsPanel}>
		<div class="index__search-row">
			<SearchField bind:value={query} placeholder="Боль или часть тела" label="Поиск по боли" />
			<button class="index__panel-close" type="button" aria-label="Свернуть поиск" onclick={closeTools}
				><span class="index__island-icon" aria-hidden="true">{@html ChevronDown}</span></button
			>
		</div>
		<div class="index__filters">
			<FrequencySwitch bind:value={frequency} />
			<MovementSelect options={movements} bind:value={movement} label={elementLabel} empty="любое" />
		</div>
		{#if query.trim()}
			<ul class="index__results" aria-live="polite">
				{#each results as { zone, injury } (injury.slug)}
					{@const { name, alias } = splitTitle(injury.title)}
					<li>
						<a
							class="index__result"
							href="/{sport}/{injury.slug}/"
							onclick={(event) => onpick(event, injury)}
						>
							<span class="index__result-title">{name}</span>
							<span class="index__result-zone">{alias ? `${zone.label} · ${alias}` : zone.label}</span>
						</a>
					</li>
				{:else}
					<li class="index__empty">Ничего не нашлось</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

<style>
	/* Затухание низа списка -- то же, что у зон в body-3d.svelte, с той же регистрацией */
	@property --zones-fade {
		syntax: '<length>';
		inherits: false;
		initial-value: 0px;
	}

	@keyframes zones-fade {
		0%,
		85% {
			--zones-fade: 56px;
		}

		100% {
			--zones-fade: 0px;
		}
	}

	.index {
		@media (width < 700px) {
			&__results {
				max-height: 26dvh;
				padding-bottom: 32px;
			}
		}

		/* Контейнер для частоты: она перестраивается по ширине колонки, а не экрана */
		&__filters {
			container-type: inline-size;
			display: flex;
			flex-wrap: wrap;
			gap: 12px 20px;
			align-items: center;
		}

		/* Остров поиска и фильтров. На десктопе обёртки не участвуют в раскладке: поле, фильтры
		   и результаты стоят в колонке, как стояли */
		&__tools,
		&__panel,
		&__search-row {
			display: contents;
		}

		&__island,
		&__panel-close,
		&__scrim {
			display: none;
		}

		/* Результаты поиска: скроллится только список, края гаснут маской -- как у зон в body-3d.svelte */
		&__results {
			scrollbar-width: none;
			overflow-y: auto;
			overscroll-behavior: contain;
			flex: 1;
			margin: 0;

			/* Сверху маске хватает нескольких пикселей: строки начинаются в ритме блоков выше, а не
			   через пустую полосу. Нижний отступ маленький, иначе список, который и так влезает,
			   начинает прокручиваться ради пустоты */
			padding: 2px 0 16px;
			list-style: none;
			mask-image: linear-gradient(
				to bottom,
				transparent,
				#000000 6px,
				#000000 calc(100% - var(--zones-fade)),
				transparent
			);

			@media (width >= 700px) and (height < 820px) {
				padding-bottom: 8px;
			}

			/* Строки столбцом сами несут поля по 9px: без поправки список отходит от фильтров дальше,
			   чем блоки индекса друг от друга */
			@media (width >= 700px) {
				margin-top: -8px;
			}

			/* Низ гаснет, только пока есть что докрутить: без переполнения таймлайн неактивен и
			   --zones-fade остаётся нулём, в конце прокрутки затухание уходит с последней строки.
			   Только отдельные свойства: краткую запись animation минификатор склеивает
			   с animation-timeline, и браузер выкидывает правило */
			@supports (animation-timeline: scroll()) {
				animation-name: zones-fade;
				animation-timing-function: linear;
				animation-fill-mode: both;
				animation-timeline: scroll(self);
			}
		}

		&__result {
			display: grid;
			gap: 2px;
			padding: 10px 0;
			color: var(--a-fg);
			text-decoration: none;
			transition: color 0.3s var(--a-ease);

			&:hover,
			&:focus-visible {
				color: var(--a-blue);
				outline: none;
			}
		}

		&__result-title {
			font-size: 18px;
			font-weight: 600;
			line-height: 1.3;
			letter-spacing: 0;
		}

		&__result-zone,
		&__empty {
			font-size: 14px;
			color: var(--a-fg2);
		}
	}

	/* Телефон: таблетка по центру над нижним краем, в зоне большого пальца. Шторке остаются
	   заголовок и зоны, модели -- больше места */
	@media (width < 700px) {
		.index__tools {
			position: fixed;
			z-index: 5;
			bottom: calc(max(16px, env(safe-area-inset-bottom)) + var(--tg-bottom) + var(--keyboard, 0px));
			left: 50%;
			translate: -50% 0;
			display: block;
			max-width: calc(100% - 32px);
		}

		.index__island,
		.index__panel {
			border-radius: 999px;
			background: color-mix(in srgb, var(--a-bg) 72%, transparent);
			-webkit-backdrop-filter: blur(12px);
			backdrop-filter: blur(12px);
			box-shadow:
				0 8px 24px rgb(0 0 0 / 18%),
				inset 0 0 0 1px var(--a-fill);
		}

		.index__island {
			display: flex;
			gap: 2px;
			align-items: center;
			padding: 4px;
		}

		.index__island-open,
		.index__island-reset {
			cursor: pointer;
			display: inline-flex;
			flex: none;
			gap: 8px;
			align-items: center;
			justify-content: center;
			height: 40px;
			border: 0;
			border-radius: 999px;
			font: inherit;
			font-size: 15px;
			font-weight: 600;
			color: var(--a-fg);
			background: none;

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: -2px;
			}
		}

		.index__island-open {
			flex: 1 1 auto;
			min-width: 0;
			padding: 0 16px 0 14px;
		}

		.index__island-reset {
			width: 40px;
			color: var(--a-fg2);
			background: var(--a-fill);
		}

		.index__island-label {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.index__island-icon {
			display: inline-flex;
			flex: none;
			width: 18px;
			height: 18px;

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				width: 100%;
				height: 100%;
				stroke-width: 2.2;
			}
		}

		.index__panel {
			display: none;
		}

		/* Раскрытый остров -- карточка во всю ширину: результаты, под ними поле с фокусом и фильтры.
		   Карточка прижата к низу и растёт вверх: поле стоит у клавиатуры и не уезжает, когда
		   появляются результаты, а до них дотягивается палец, без прокрутки под клавиатуру */
		.index__tools--open {
			/* Выше заголовка главной (z-index 6 ради списка спортов): карточка и фон под ней гасят
			   и его, а не только остальной экран */
			z-index: 7;
			right: 12px;
			left: 12px;
			translate: none;
			max-width: none;

			& .index__island {
				display: none;
			}

			& .index__panel {
				transform-origin: 50% 100%;
				display: flex;
				flex-direction: column;
				gap: 14px;
				max-height: calc(
					100dvh - var(--keyboard, 0px) - var(--theme-toggle-top) - var(--header-row) - 32px -
						max(16px, env(safe-area-inset-bottom)) - var(--tg-bottom)
				);
				padding: 8px 12px 16px 16px;
				border-radius: 24px;
				animation: island-grow 0.3s var(--a-ease) both;

				@media (--reduced-motion) {
					animation-name: fade-in;
				}
			}

			& .index__results {
				flex: 1 1 auto;
				order: -1;
				min-height: 0;
				max-height: none;
				margin-top: 8px;
				padding-bottom: 4px;
			}

			/* Под карточкой экран гаснет и чуть размывается: внимание на поиске, а модель и шторка
			   уходят на второй план. Слой внутри острова, под карточкой, но поверх всей сцены */
			& .index__scrim {
				position: fixed;
				z-index: -1;
				inset: 0;
				display: block;
				background: color-mix(in srgb, var(--a-bg) 45%, transparent);
				-webkit-backdrop-filter: blur(6px);
				backdrop-filter: blur(6px);
				animation: fade-in 0.3s var(--a-ease) both;

				@media (prefers-reduced-transparency: reduce) {
					backdrop-filter: none;
				}
			}

			/* Результаты в острове -- одной строкой и мельче: над клавиатурой места мало, а часть
			   тела видна по самому названию */
			& .index__result {
				padding: 8px 0;
			}

			& .index__result-title {
				overflow: hidden;
				min-width: 0;
				font-size: 16px;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			& .index__result-zone {
				display: none;
			}

			/* Свернуть -- иконкой в строке поиска, а не кнопкой "Готово" отдельной строкой внизу:
			   карточка ниже на эту строку */
			& .index__search-row {
				display: flex;
				gap: 6px;
				align-items: center;

				/* Корень SearchField -- чужой компонент: без :global селектор получал наш хэш и не
				   срабатывал, поле стояло по ширине текста */
				& > :global(:first-child) {
					flex: 1;
					min-width: 0;
				}
			}

			& .index__panel-close {
				cursor: pointer;
				display: inline-grid;
				flex: none;
				place-items: center;
				width: 40px;
				height: 40px;
				padding: 0;
				border: 0;
				border-radius: 50%;
				color: var(--a-fg2);
				background: var(--a-fill);

				&:focus-visible {
					outline: 2px solid var(--a-blue);
					outline-offset: 2px;
				}
			}

			/* Чипы частоты под палец: не меньше 40 на 40 */
			& :global(.index__chip) {
				min-width: 40px;
				min-height: 40px;
			}

			& .index__filters :global(.pselect__button) {
				min-height: 40px;
			}
		}
	}

	@keyframes island-grow {
		from {
			transform: scale(0.94);
			opacity: 0;
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}
</style>
