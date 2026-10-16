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

		position: sticky;
		z-index: 10;
		top: 0;
		display: flex;
		align-items: center;
		/* body -- flex-колонка: ширину задаём явно, иначе шапка сжалась бы по содержимому */
		width: 100%;
		min-height: calc(var(--theme-toggle-top) + var(--header-row) + var(--header-fade));
		padding: var(--theme-toggle-top) var(--theme-toggle-room) var(--header-fade) var(--frame-x);
		background: linear-gradient(to bottom, var(--site-header-bg, var(--bg)) 62%, transparent);
	}

	.site-header--floating {
		--header-fade: 0px;

		pointer-events: none;
		position: absolute;
		z-index: 3;
		right: 0;
		left: 0;
		background: none;

		& > :global(*) {
			pointer-events: auto;
		}
	}
</style>
