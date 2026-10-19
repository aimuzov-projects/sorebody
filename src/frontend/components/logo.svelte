<script lang="ts">
	type Props = {
		/** Ссылка, если логотип ведёт куда-то; без неё -- просто знак с названием. */
		href?: string
	}

	let { href }: Props = $props()
</script>

<!-- Знак -- "точка боли": закрашенный кружок в кольце, как маркер раскрытой зоны на модели.
     Слово рядом: "sore" цветом текста, "body" и знак -- цветом спорта. Наведение и фокус
     запускают пульс: от кольца расходится и гаснет его копия -->
<svelte:element this={href ? 'a' : 'span'} class="logo" {href} role={href ? undefined : 'img'} aria-label="Sorebody">
	<svg class="logo__mark" viewBox="0 0 32 32" aria-hidden="true">
		<circle class="logo__dot" cx="16" cy="16" r="7.5" />
		<circle class="logo__ring" cx="16" cy="16" r="12.75" />
		<circle class="logo__ring logo__echo" cx="16" cy="16" r="12.75" />
	</svg>
	<span class="logo__word" aria-hidden="true"
		><span class="logo__sore">sore</span><span class="logo__body">body</span></span
	>
</svelte:element>

<style>
	/* Цвета -- токены сцены из styles/scene.css: --a-fg для "sore", --a-logo для "body" и знака
	   (цвет спорта, на странице без спорта -- градиент бренда). Шрифт скруглённый системный, без веб-шрифтов */
	.logo {
		display: inline-flex;
		gap: 6px;
		align-items: center;
		font-family: ui-rounded, 'SF Pro Rounded', system-ui, sans-serif;
		font-size: 19px;
		font-weight: 700;
		line-height: 1;
		color: var(--a-fg);
		text-decoration: none;
		letter-spacing: -0.02em;

		&:focus-visible {
			border-radius: 6px;
			outline: 2px solid var(--a-blue);
			outline-offset: 4px;
		}
	}

	.logo__mark {
		overflow: visible;
		flex: none;
		width: 24px;
		height: 24px;
		color: var(--a-logo);
		transition: color 0.4s var(--a-ease);
	}

	.logo__dot {
		fill: currentcolor;
	}

	.logo__ring {
		transform-origin: 16px 16px;
		fill: none;
		stroke: currentcolor;
		stroke-width: 2.5;
	}

	.logo__echo {
		opacity: 0;
	}

	.logo__body {
		color: var(--a-logo);
		transition: color 0.4s var(--a-ease);
	}

	/* Без спорта знак и "body" -- градиентом бренда (lib/brand-gradient.ts): знак градиентом из
	   <svg class="brand-paint"> в base.astro, слово -- фоном под текстом. Логотип -- знак, а не
	   текст для чтения, поэтому градиент остаётся и в Telegram */
	:global(:root:not([data-sport])) .logo__dot {
		fill: url('#brand-logo') currentcolor;
	}

	:global(:root:not([data-sport])) .logo__ring {
		stroke: url('#brand-logo') currentcolor;
	}

	@supports (background-clip: text) or (-webkit-background-clip: text) {
		:global(:root:not([data-sport])) .logo__body {
			color: transparent;
			background-image: var(--brand-gradient);
			-webkit-background-clip: text;
			background-clip: text;
		}
	}

	/* В режиме высокого контраста -- системный цвет, на печати фон под текстом не печатается */
	@media (forced-colors: active), print {
		:global(:root:not([data-sport])) .logo__dot {
			fill: currentcolor;
		}

		:global(:root:not([data-sport])) .logo__ring {
			stroke: currentcolor;
		}

		:global(:root:not([data-sport])) .logo__body {
			color: currentcolor;
			background: none;
		}
	}

	/* Наведение на сам логотип-ссылку или на ссылку, в которую он вложен: кольцо пульсирует,
	   как точка зоны под курсором на модели */
	.logo:is(:hover, :focus-visible) .logo__echo,
	:global(.logo-host:is(:hover, :focus-visible)) .logo__echo {
		animation: logo-pulse 1.6s var(--a-ease) infinite;
	}

	@keyframes logo-pulse {
		0% {
			transform: scale(1);
			opacity: 0.6;
		}

		100% {
			transform: scale(1.45);
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.logo__mark,
		.logo__body {
			transition: none;
		}

		.logo:is(:hover, :focus-visible) .logo__echo,
		:global(.logo-host:is(:hover, :focus-visible)) .logo__echo {
			animation: none;
		}
	}
</style>
