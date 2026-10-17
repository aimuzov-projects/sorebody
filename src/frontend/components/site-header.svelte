<script lang="ts">
	import type { Snippet } from 'svelte'

	type Props = {
		children?: Snippet
		/**
		 * Над 3D-сценой: шапка висит поверх, без фона и не ловит мышь мимо своих ссылок, чтобы
		 * сцену можно было крутить и под ней. Без него -- липкая шапка лонгрида с фоном,
		 * растворяющимся вниз.
		 */
		floating?: boolean
	}

	let { children, floating = false }: Props = $props()
</script>

<!-- Шапка сайта, одна на всех страницах: слева на линии левой колонки -- «‹» с маленьким
     заголовком в статье и на about или логотип на сцене. Справа место под переключатель темы:
     он фиксирован в углу окна на той же строке (theme-toggle.astro) -->
<header class="site-header" class:site-header--floating={floating}>
	{@render children?.()}
</header>

<style>
	/* Высота и поля одни для всех страниц: токены каркаса в styles/global.css */
	.site-header {
		--header-fade: 20px;
		/* Мягкий край рисуется ниже самой шапки, на её высоту и раскладку страницы не влияет */
		--header-tail: 28px;
		--header-bg: var(--site-header-bg, var(--bg));

		position: sticky;
		z-index: 10;
		top: 0;
		display: flex;
		align-items: center;
		/* body -- flex-колонка: ширину задаём явно, иначе шапка сжалась бы по содержимому */
		width: 100%;
		min-height: calc(var(--theme-toggle-top) + var(--header-row) + var(--header-fade));
		padding: var(--theme-toggle-top) var(--theme-toggle-room) var(--header-fade) var(--frame-x);

		/* Фон полупрозрачный, чтобы под ним читалось размытие. Под строкой шапки контент
		   не обрывается: фон гаснет вниз по плавной кривой
		   (smoothstep, без резкого перепада у линейного градиента), а под ним -- размытие,
		   которое сходит на нет к низу. Где backdrop-filter нет, остаётся один градиент */
		&::before,
		&::after {
			pointer-events: none;
			content: '';
			position: absolute;
			z-index: -1;
			inset: 0 0 calc(-1 * var(--header-tail));
		}

		&::before {
			/* Размытие сходит на нет с середины шапки по той же smoothstep-кривой, что и фон:
			   с резким краем оно читалось полосой поверх сцены */
			--blur-from: 40%;
			--blur-fade: calc(100% - var(--blur-from));
			-webkit-backdrop-filter: blur(6px);
			backdrop-filter: blur(6px);

			mask-image: linear-gradient(
				to bottom,
				#000000 var(--blur-from),
				rgb(0 0 0 / 84%) calc(var(--blur-from) + var(--blur-fade) * 0.25),
				rgb(0 0 0 / 50%) calc(var(--blur-from) + var(--blur-fade) * 0.5),
				rgb(0 0 0 / 16%) calc(var(--blur-from) + var(--blur-fade) * 0.75),
				transparent
			);

			@media (prefers-reduced-transparency: reduce) {
				display: none;
			}
		}

		&::after {
			--fade-from: calc(100% - var(--header-fade) - var(--header-tail));
			--fade: calc(var(--header-fade) + var(--header-tail));

			background: linear-gradient(
				to bottom,
				color-mix(in srgb, var(--header-bg) 72%, transparent) var(--fade-from),
				color-mix(in srgb, var(--header-bg) 60%, transparent) calc(var(--fade-from) + var(--fade) * 0.25),
				color-mix(in srgb, var(--header-bg) 36%, transparent) calc(var(--fade-from) + var(--fade) * 0.5),
				color-mix(in srgb, var(--header-bg) 12%, transparent) calc(var(--fade-from) + var(--fade) * 0.75),
				transparent
			);
		}
	}

	/* Над сценой -- как подвал сцены (.scene-footer в body-3d.svelte), только зеркально:
	   без размытия, оно мылило голову фигуры. Полупрозрачный фон плотнее всего у верхнего
	   края и сходит на нет чуть ниже строки шапки */
	.site-header--floating {
		--header-fade: 0px;
		--header-tail: 12px;

		pointer-events: none;
		position: absolute;
		z-index: 3;
		right: 0;
		left: 0;

		&::before {
			display: none;
		}

		/* Спад начинается от самого края и идёт без плато: с плотной серединой граница
		   читалась полосой поперёк фигуры */
		&::after {
			background: linear-gradient(
				to bottom,
				color-mix(in srgb, var(--header-bg) 82%, transparent),
				color-mix(in srgb, var(--header-bg) 74%, transparent) 10%,
				color-mix(in srgb, var(--header-bg) 62%, transparent) 22%,
				color-mix(in srgb, var(--header-bg) 48%, transparent) 35%,
				color-mix(in srgb, var(--header-bg) 33%, transparent) 50%,
				color-mix(in srgb, var(--header-bg) 20%, transparent) 65%,
				color-mix(in srgb, var(--header-bg) 9%, transparent) 80%,
				color-mix(in srgb, var(--header-bg) 3%, transparent) 92%,
				transparent
			);
		}

		& > :global(*) {
			pointer-events: auto;
		}
	}
</style>
