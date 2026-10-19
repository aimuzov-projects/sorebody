<script lang="ts">
	import Logo from '#frontend/components/logo.svelte'

	type Props = {
		/** Маленький заголовок, который проявляется в шапке по мере прокрутки. */
		title: string
		/** Главная спорта страницы: туда ведёт логотип, как и стрелка "Назад". */
		home: string
		/** Пока статья в ридере грузится, прокручивать нечего: заголовок прячем совсем. */
		titleHidden?: boolean
		/** В ридере на главной логотип не уходит со страницы, а закрывает статью, как "Назад". */
		onhome?: () => void
	}

	let { title, home, titleHidden = false, onhome }: Props = $props()

	function onclick(event: MouseEvent) {
		if (!onhome || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

		event.preventDefault()
		onhome()
	}
</script>

<!-- Логотип и маленький заголовок в одной ячейке за стрелкой "Назад": вверху страницы виден
     логотип, по мере прокрутки он гаснет, а на его месте проявляется заголовок. Стили и
     привязка к прокрутке -- в styles/article.css, рядом со стрелкой и заголовком -->
<span class="article-bar__lead">
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -- клик
	     ловим на обёртке, сама ссылка внутри и с клавиатуры даёт тот же click -->
	<span class="article-bar__logo" onclickcapture={onclick}>
		<Logo href={home} label="Sorebody, на главную" />
	</span>
	<p class="article-bar__title" aria-hidden="true" style:visibility={titleHidden ? 'hidden' : null}>
		{title}
	</p>
</span>
