<script lang="ts">
	import Logo from '#frontend/components/logo.svelte'

	type Props = {
		/** Маленький заголовок, который проявляется в шапке по мере прокрутки. */
		title: string
		/** Главная спорта страницы: туда ведут логотип и заголовок, как и стрелка "Назад". */
		home: string
		/** Пока статья в ридере грузится, прокручивать нечего: заголовок прячем совсем. */
		titleHidden?: boolean
		/** В ридере на главной логотип и заголовок не уходят со страницы, а закрывают статью, как "Назад". */
		onhome?: () => void
	}

	let { title, home, titleHidden = false, onhome }: Props = $props()

	function onclick(event: MouseEvent) {
		if (!onhome || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

		if (!(event.target as Element).closest('a')) return

		event.preventDefault()
		onhome()
	}
</script>

<!-- Логотип и маленький заголовок в одной ячейке за стрелкой "Назад": вверху страницы виден
     логотип, по мере прокрутки он гаснет, а на его месте проявляется заголовок. Стили и
     привязка к прокрутке -- в styles/article.css, рядом со стрелкой и заголовком -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -- клик
     ловим на обёртке, ссылки внутри и с клавиатуры дают тот же click -->
<span class="article-bar__lead" onclickcapture={onclick}>
	<span class="article-bar__logo">
		<Logo href={home} label="Sorebody, на главную" />
	</span>
	<!-- Заголовок -- та же стрелка "Назад" (data-back, lib/back-link.ts) под рукой. Для
	     скринридера и Tab он повтор стрелки, поэтому скрыт от них -->
	<a
		class="article-bar__title"
		href={home}
		title="Назад"
		tabindex="-1"
		aria-hidden="true"
		data-back
		hidden={titleHidden}
	>
		{title}
	</a>
</span>
