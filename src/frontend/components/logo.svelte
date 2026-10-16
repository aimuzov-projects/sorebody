<script lang="ts">
	type Props = {
		/** Ссылка, если логотип ведёт куда-то; без неё -- просто знак с названием. */
		href?: string
	}

	let { href }: Props = $props()

	// Маска «w» своя у каждого логотипа на странице: id в SVG общие на весь документ
	const uid = $props.id()
	const mask = `logo-w-${uid}`
</script>

<!-- Знак -- гиря: ушко -- повёрнутая «c», в теле вырезана скруглённая «w». Слово рядом: «wod»
     цветом текста, «care» и ушко серым. Наведение и фокус перекрашивают серое в акцент -->
<svelte:element this={href ? 'a' : 'span'} class="logo" {href} role={href ? undefined : 'img'} aria-label="Wodcare">
	<svg class="logo__mark" viewBox="0 0 32 32" aria-hidden="true">
		<mask id={mask}>
			<rect width="32" height="32" fill="#ffffff" />
			<path
				d="M9.6 17.4 L12 24.4 L16 18.6 L20 24.4 L22.4 17.4"
				fill="none"
				stroke="#000000"
				stroke-width="3"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</mask>
		<path
			class="logo__ear"
			d="M9 13.8 C7.8 6.4 11.2 2.8 16 2.8 C20.8 2.8 24.2 6.4 23 13.8"
			fill="none"
			stroke-width="4.6"
			stroke-linecap="round"
		/>
		<path
			class="logo__body"
			d="M10 30.4 C6 28 4.2 24.6 4.2 20.6 C4.2 14.2 9.4 9.4 16 9.4 C22.6 9.4 27.8 14.2 27.8 20.6 C27.8 24.6 26 28 22 30.4 C20 31.2 12 31.2 10 30.4 Z"
			mask="url(#{mask})"
		/>
	</svg>
	<span class="logo__word" aria-hidden="true"
		><span class="logo__wod">wod</span><span class="logo__care">care</span></span
	>
</svelte:element>

<style>
	/* Цвета -- токены сцены из styles/scene.css: --a-fg для «wod» и тела, --a-care для «care»
	   и ушка, на наведении -- --a-blue. Шрифт скруглённый системный, без веб-шрифтов */
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
		flex: none;
		width: 26px;
		height: 26px;
		/* Знак чуть ниже середины строки: гиря стоит на базовой линии слова */
		margin-top: -3px;
	}

	.logo__body {
		fill: var(--a-logo);
		transition: fill 0.4s var(--a-ease);
	}

	.logo__ear {
		stroke: var(--a-care);
		transition: stroke 0.4s var(--a-ease);
	}

	.logo__wod,
	.logo__care {
		transition: color 0.4s var(--a-ease);
	}

	.logo__care {
		color: var(--a-care);
	}

	/* Наведение на сам логотип-ссылку или на ссылку, в которую он вложен, красит весь знак и слово */
	.logo:is(:hover, :focus-visible) .logo__body,
	:global(.logo-host:is(:hover, :focus-visible)) .logo__body {
		fill: var(--a-blue);
	}

	.logo:is(:hover, :focus-visible) .logo__ear,
	:global(.logo-host:is(:hover, :focus-visible)) .logo__ear {
		stroke: var(--a-blue);
	}

	.logo:is(:hover, :focus-visible) :is(.logo__wod, .logo__care),
	:global(.logo-host:is(:hover, :focus-visible)) :is(.logo__wod, .logo__care) {
		color: var(--a-blue);
	}

	@media (prefers-reduced-motion: reduce) {
		.logo__body,
		.logo__ear,
		.logo__wod,
		.logo__care {
			transition: none;
		}
	}
</style>
