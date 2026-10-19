<!--
	Раскрытая зона: заголовок со стрелкой назад, включённые фильтры и список её травм.
	На десктопе колонка с внешней стороны тела, на телефоне строки в нижней половине экрана
-->
<script lang="ts">
	import { ChevronLeft, FunnelX } from 'lucide-static'

	import { plural } from '#frontend/lib/plural.ts'
	import type { activeFilterChips } from '#frontend/scene/filters.ts'
	import type { Zone } from '#frontend/scene/zones.ts'

	import InjuryList from '#frontend/components/injury-list.svelte'

	type Injury = Zone['injuries'][number]

	let {
		zone,
		side,
		injuries,
		filtering,
		chips,
		current,
		sport,
		onback,
		onreset,
		onaccent,
		onscroll,
		onpick,
	}: {
		zone: Zone
		side: 'left' | 'right' | 'bottom'
		/** Травмы зоны под фильтры. */
		injuries: Injury[]
		filtering: boolean
		chips: ReturnType<typeof activeFilterChips>
		current: Injury | null
		sport: string
		onback: () => void
		onreset: () => void
		onaccent: (injury: Injury | null) => void
		onscroll: (event: Event) => void
		onpick: (event: MouseEvent, injury: Injury) => void
	} = $props()

	const total = $derived(zone.injuries.length)
</script>

<section class="zone zone--{side}" aria-label={zone.label}>
	<header class="zone__head">
		<div class="zone__heading">
			<button class="zone__back" type="button" aria-label="Назад" title="Назад" onclick={onback}
				><span class="zone__back-icon" aria-hidden="true">{@html ChevronLeft}</span></button
			>
			<h2 class="zone__title" style:--chars={zone.label.length}>{zone.label}</h2>
		</div>
		{#if filtering}
			<div class="zone__filters">
				<button
					class="zone__reset"
					type="button"
					aria-label="Сбросить фильтры"
					title="Сбросить фильтры"
					onclick={onreset}><span class="zone__reset-icon" aria-hidden="true">{@html FunnelX}</span></button
				>
				<p class="zone__filter">{injuries.length} из {total} {plural(total)}</p>
				<ul class="zone__tags" aria-label="Фильтры">
					{#each chips as filter (filter.key)}
						<!-- Текст запроса вебвизор Метрики не пишет: в поиске бывают симптомы -->
						<li class="zone__tag" class:ym-hide-content={filter.key === 'query'}>
							<span class="zone__tag-icon zone__tag-icon--{filter.tone || 'plain'}" aria-hidden="true"
								>{@html filter.icon}</span
							>{filter.label}
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</header>
	<InjuryList
		rows={injuries.map((injury) => ({ injury, where: '' }))}
		{current}
		{sport}
		onaccent={(i, on) => onaccent(on ? injuries[i] : null)}
		{onscroll}
		{onpick}
	/>
</section>

<style>
	/* Список зоны в свободной половине экрана. Подложка полупрозрачная с размытием, как
	   у шапки, и растворяется к центру градиентом; строки гаснут к краям скролла маской */
	.zone {
		/* Своя стопка: подложка с z-index -1 иначе уходит под canvas сцены и размывать ей нечего */
		isolation: isolate;
		position: absolute;
		top: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		width: min(440px, calc(50vw - 32px - 4vw));
		/* backwards, а не both: анимация прозрачности, которая держится после конца, делает
		   колонку корнем для backdrop-filter, и подложка размывала бы только саму себя */
		animation: fade-in 0.5s var(--a-ease) backwards;

		&::before {
			pointer-events: none;
			content: '';
			position: absolute;
			z-index: -1;
			top: 0;
			bottom: 0;
		}

		/* Колонка сразу за серединой экрана, фигура -- в середине другой половины. Подложка уходит
		   до края экрана, а к фигуре растворяется по smoothstep: прозрачная за 48 px до текста,
		   почти сплошная у его края. На фигуру и точку зоны она не заходит */
		&--left {
			right: calc(50% + 32px);

			&::before {
				right: -48px;
				left: -50vw;
				background: color-mix(in srgb, var(--a-bg) 72%, transparent);
				-webkit-backdrop-filter: blur(12px);
				backdrop-filter: blur(12px);
				mask-image: linear-gradient(
					to left,
					rgb(0 0 0 / 0%) 0px,
					rgb(0 0 0 / 7%) 12px,
					rgb(0 0 0 / 26%) 24px,
					rgb(0 0 0 / 50%) 36px,
					rgb(0 0 0 / 74%) 48px,
					rgb(0 0 0 / 93%) 60px,
					rgb(0 0 0 / 100%) 72px
				);
			}
		}

		&--right {
			left: calc(50% + 32px);

			&::before {
				right: -50vw;
				left: -48px;
				background: color-mix(in srgb, var(--a-bg) 72%, transparent);
				-webkit-backdrop-filter: blur(12px);
				backdrop-filter: blur(12px);
				mask-image: linear-gradient(
					to right,
					rgb(0 0 0 / 0%) 0px,
					rgb(0 0 0 / 7%) 12px,
					rgb(0 0 0 / 26%) 24px,
					rgb(0 0 0 / 50%) 36px,
					rgb(0 0 0 / 74%) 48px,
					rgb(0 0 0 / 93%) 60px,
					rgb(0 0 0 / 100%) 72px
				);
			}
		}

		/* Телефон: шапка прибита к верху, строки -- в нижней половине под зоной */
		&--bottom {
			/* Колонка на весь экран, а модель видна между шапкой и строками: жест там должен
			   доходить до сцены, иначе зону не повернуть. Касания ловят только шапка и список */
			pointer-events: none;
			/* Над шапкой сцены: заголовок зоны стоит в её строке, и её дымка мутила его */
			z-index: 4;
			right: 0;
			left: 0;
			width: auto;
			padding-inline: 24px;

			& .zone__head,
			& :global(.zone__list) {
				pointer-events: auto;
			}

			/* Под строками та же подложка, что у колонки на десктопе: полупрозрачная, с размытием,
			   к зоне растворяется по smoothstep. Сверху своей подложки нет: там тот же
			   полупрозрачный край шапки сцены, и модель видна под заголовком */
			&::before {
				inset: 0;
				background: color-mix(in srgb, var(--a-bg) 72%, transparent);
				-webkit-backdrop-filter: blur(12px);
				backdrop-filter: blur(12px);
				mask-image: linear-gradient(
					to top,
					rgb(0 0 0 / 100%) 44%,
					rgb(0 0 0 / 93%) 47.7%,
					rgb(0 0 0 / 74%) 51.3%,
					rgb(0 0 0 / 50%) 55%,
					rgb(0 0 0 / 26%) 58.7%,
					rgb(0 0 0 / 7%) 62.3%,
					rgb(0 0 0 / 0%) 66%
				);
			}
		}

		&__head {
			flex: none;
			/* Под шапкой сцены и ниже её мягкого края: на высоте заголовка индекса крупный
			   заголовок зоны тонул в градиенте шапки */
			padding-top: calc(var(--theme-toggle-top) + var(--header-row) + 40px);

			/* На телефоне заголовок зоны встаёт в строку шапки вместо логотипа, справа от него --
			   переключатель темы: крупный заголовок под шапкой съедал треть экрана над зоной */
			.zone--bottom & {
				padding-top: calc(var(--theme-toggle-top) + (var(--header-row) - 44px) / 2);
				padding-right: calc(var(--theme-toggle-room) - 24px);
			}
		}

		/* «Назад» -- стрелка в строке заголовка, без подписи: место на шапке дороже слова */
		&__heading {
			container-type: inline-size;
			display: flex;
			gap: 6px;
			align-items: center;
			margin-left: -12px;
		}

		&__back {
			cursor: pointer;
			display: inline-grid;
			flex: none;
			place-items: center;
			width: 44px;
			height: 44px;
			padding: 0;
			border: 0;
			border-radius: 50%;
			color: var(--a-blue);
			background: none;
			transition:
				opacity 0.3s var(--a-ease),
				background 0.3s var(--a-ease);

			/* В Mini App своя «Назад» не нужна: у Telegram есть системная кнопка */
			:global([data-telegram]) & {
				display: none;
			}

			&:hover {
				background: var(--a-fill);
			}

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: 2px;
			}
		}

		&__back-icon {
			display: inline-flex;
			width: 34px;
			height: 34px;

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				/* Оптическая поправка влево, как у .article-bar__back */
				translate: -6% 0;
				width: 100%;
				height: 100%;
				stroke-width: 2.4;
			}
		}

		&__title {
			margin: 0;
			/* Длинное название зоны («Голеностоп и стопа») мельчает, чтобы встать в одну строку
			   рядом со стрелкой: средний знак этого жирного начертания с разрядкой -0,015 em -- около 0,575 em.
			   Короткие остаются крупными, перенос остаётся запасным вариантом */
			font-size: min(clamp(32px, 4vw, 48px), calc((100cqi - 48px) / (var(--chars, 1) * 0.575)));
			font-weight: 700;
			line-height: 1.08;
			letter-spacing: -0.015em;

			/* В строке шапки -- кегль под её высоту */
			.zone--bottom & {
				font-size: min(28px, calc((100cqi - 48px) / (var(--chars, 1) * 0.575)));
			}
		}

		/* Под фильтром список неполный: слева, под стрелкой "Назад", -- сброс иконкой, дальше
		   счётчик синей таблеткой и включённые фильтры чипами */
		&__filters {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			align-items: center;
			margin: 10px 0 0 -12px;
			font-size: 15px;
		}

		&__reset {
			cursor: pointer;
			display: inline-grid;
			flex: none;
			place-items: center;
			width: 44px;
			height: 32px;
			padding: 0;
			border: 0;
			border-radius: 999px;
			color: var(--a-blue);
			background: none;
			transition: background 0.3s var(--a-ease);

			&:hover {
				background: var(--a-fill);
			}

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: 2px;
			}
		}

		&__reset-icon,
		&__tag-icon {
			display: inline-flex;

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				width: 100%;
				height: 100%;
			}
		}

		&__reset-icon {
			width: 20px;
			height: 20px;
		}

		&__filter {
			margin: 0;
			padding: 4px 12px;
			border-radius: 999px;
			font-weight: 600;
			font-variant-numeric: tabular-nums;
			color: var(--a-blue);
			white-space: nowrap;
			background: color-mix(in srgb, var(--a-blue) 13%, var(--a-bg));
		}

		&__tags {
			display: contents;
		}

		&__tag {
			display: inline-flex;
			gap: 6px;
			align-items: center;
			padding: 4px 12px 4px 10px;
			border-radius: 999px;
			color: var(--a-fg);
			white-space: nowrap;
			list-style: none;
			background: color-mix(in srgb, var(--a-fg) 7%, var(--a-bg));
		}

		&__tag-icon {
			width: 15px;
			height: 15px;
			color: var(--a-fg2);

			/* Частота -- залитым знаком в своём цвете, как в переключателе индекса */
			&--common,
			&--uncommon,
			&--rare {
				width: 10px;
				height: 10px;

				/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
				& :global(svg) {
					fill: currentcolor;
				}
			}

			&--common {
				color: var(--common);
			}

			&--uncommon {
				color: var(--uncommon);
			}

			&--rare {
				color: var(--rare);
			}
		}

		/* На телефоне строки прилипают к верху списка, текущая травма -- прилипшая. Снизу запас почти
		   на высоту списка: иначе последние строки до верха не доезжали и стать текущими не могли */
		&--bottom :global(.zone__list) {
			scroll-padding-top: 14px;
			scroll-snap-type: y mandatory;
			flex: none;
			height: 50dvh;
			margin-top: auto;
			padding-bottom: calc(50dvh - 140px);
		}

		&--bottom :global(.zone__row) {
			scroll-snap-align: start;
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}
</style>
