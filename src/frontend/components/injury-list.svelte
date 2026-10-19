<!--
	Список травм: в раскрытой зоне и в списке движения. Номер строки -- тот же,
	что на маркере травмы на модели. `where` -- зона перед описанием, когда в списке
	травмы разных зон
-->
<script lang="ts" module>
	/** Последнее слово отдельно: его склеиваем со стрелкой, чтобы она не уезжала одна на новую строку. */
	function splitLastWord(text: string) {
		const at = text.lastIndexOf(' ') + 1

		return [text.slice(0, at), text.slice(at)]
	}
</script>

<script lang="ts">
	import { Diamond } from 'lucide-static'

	import { splitTitle } from '#frontend/lib/title.ts'
	import type { Zone } from '#frontend/scene/zones.ts'

	type Injury = Zone['injuries'][number]

	let {
		rows,
		current,
		sport,
		class: className = '',
		onaccent,
		onscroll,
		onpick,
	}: {
		rows: { injury: Injury; where: string }[]
		/** Текущая строка: к ней подъехала камера. */
		current: Injury | null | undefined
		sport: string
		class?: string
		/** Наведение или фокус на строке; `pointer` отличает мышь от клавиатуры. */
		onaccent: (i: number, on: boolean, pointer: boolean) => void
		onscroll: (event: Event) => void
		onpick: (event: MouseEvent, injury: Injury) => void
	} = $props()
</script>

<ul class="zone__list {className}" {onscroll}>
	{#each rows as { injury, where }, i (injury.slug)}
		<!-- Без другого названия в скобках: его показывает статья, а поиск ищет по полному -->
		{@const [head, tail] = splitLastWord(splitTitle(injury.title).name)}
		<li class="zone__row" style:--i={i}>
			<a
				class="zone__item"
				class:zone__item--current={current === injury}
				href="/{sport}/{injury.slug}/"
				data-slug={injury.slug}
				onclick={(event) => onpick(event, injury)}
				onpointerenter={(event) => event.pointerType !== 'touch' && onaccent(i, true, true)}
				onpointerleave={(event) => event.pointerType !== 'touch' && onaccent(i, false, true)}
				onfocus={() => onaccent(i, true, false)}
				onblur={() => onaccent(i, false, false)}
			>
				<span class="zone__num" aria-hidden="true">{i + 1}</span>
				<span class="zone__name">
					{head}<span class="zone__tail">{tail}<span class="zone__arrow" aria-hidden="true">→</span></span>
				</span>
				<span class="zone__summary">
					{#if where}<span class="zone__where">{where}</span> ·
					{/if}
					{#if injury.frequency === 'rare'}<span class="zone__rare"
							><span class="zone__rare-icon" aria-hidden="true">{@html Diamond}</span>Редко</span
						>
						·
					{/if}
					{injury.summary}
				</span>
			</a>
		</li>
	{/each}
</ul>

<style>
	.zone {
		/* Скроллятся только строки, к краям они гаснут маской, а не обрезаются */
		&__list {
			scrollbar-width: none;
			overflow-y: auto;
			overscroll-behavior: contain;
			flex: 1;
			/* Поля по бокам -- место под подложку строк: прокрутка обрезает всё за краем списка */
			margin: 12px -14px 0;
			padding: 14px 14px 22dvh;
			list-style: none;
			mask-image: linear-gradient(to bottom, transparent, #000000 18px, #000000 calc(100% - 120px), transparent);
		}

		&__row {
			animation: row-in 0.55s var(--a-ease) both;
			animation-delay: calc(120ms + var(--i) * 45ms);

			@media (--reduced-motion) {
				animation-name: fade-in;
			}
		}

		/* Номер слева -- тот же, что на маркере травмы на модели. Сетка общая с заголовком:
		   номер по центру под стрелкой «назад», текст на линии названия зоны. Подложка выходит
		   за них полями, а не сдвигает: строки стоят на месте, когда она появляется */
		&__item {
			display: grid;
			grid-template-columns: 28px 1fr;
			row-gap: 4px;
			column-gap: 16px;
			margin-inline: -14px;
			padding: 14px 14px 14px 8px;
			border-radius: 16px;
			color: var(--a-fg);
			text-decoration: none;
			transition: background 0.35s var(--a-ease);

			&:focus-visible {
				outline: 2px solid var(--a-blue);
				outline-offset: -2px;
			}
		}

		&__num {
			display: grid;
			grid-row: span 2;
			place-items: center;
			width: 28px;
			height: 28px;
			margin-top: -1px;
			border-radius: 50%;
			font-size: 15px;
			font-weight: 600;
			font-variant-numeric: tabular-nums;
			color: var(--a-blue);
			box-shadow: inset 0 0 0 1.5px var(--a-blue);
			transition:
				color 0.35s var(--a-ease),
				background 0.35s var(--a-ease);
		}

		/* Текущая строка -- та, к которой подъехала камера: наведение мышью, на таче строка
		   у центра списка. Остальные не гаснут, текущая выделена номером и подложкой */
		&__item--current {
			background: var(--a-fill);
		}

		&__item--current &__num {
			color: var(--a-on-blue);
			background: var(--a-blue);
		}

		/* Стрелка после названия: видно, что строка -- ссылка */
		&__tail {
			white-space: nowrap;
		}

		&__arrow {
			display: inline-block;
			margin-left: 6px;
			font-weight: 400;
			color: var(--a-blue);
			transition: transform 0.35s var(--a-ease);
		}

		&__item:hover &__arrow,
		&__item:focus-visible &__arrow {
			transform: translateX(4px);
		}

		&__name {
			font-size: 20px;
			font-weight: 600;
			line-height: 1.25;
			letter-spacing: -0.02em;
		}

		/* Зона травмы в списке движения: там травмы разных зон идут подряд */
		&__where {
			font-weight: 600;
			color: var(--a-fg);
		}

		/* Редкие травмы отмечены словом, а не цветной точкой: точка читалась как уведомление */
		&__rare {
			display: inline-flex;
			gap: 4px;
			align-items: center;
			font-weight: 600;
			color: var(--rare);
		}

		&__rare-icon {
			display: inline-flex;
			width: 12px;
			height: 12px;

			/* stylelint-disable-next-line selector-max-type -- SVG из lucide-static приходит без класса */
			& :global(svg) {
				width: 100%;
				height: 100%;
				fill: currentcolor;
			}
		}

		/* Описание целиком, без многоточия: строка и так ссылка, это видно по стрелке */
		&__summary {
			font-size: 15px;
			line-height: 1.45;
			color: var(--a-fg2);
			letter-spacing: -0.01em;
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}

	@keyframes row-in {
		from {
			transform: translateY(12px);
			opacity: 0;
		}
	}
</style>
