<!--
	Выбор спорта во фразе заголовка: «Травмы ‹в паделе ▾›» на главной, «Разбор ‹в кроссфите ▾›»
	в статье. Кнопка -- сама фраза спорта, список -- как у фильтра движения (popup-select).
	Скринридер читает «Вид спорта, Падел». Переход -- только по явному выбору другого спорта.
	Без `onchoose` (остров отдельной страницы статьи) -- на статью спорта к разделу, который сейчас
	читают. Спорт -- настройка, а не шаг: адрес заменяется, «Назад» ведёт туда, откуда пришли.
-->
<script lang="ts">
	import PopupSelect from '#frontend/components/popup-select.svelte'
	import { SPORT_ICONS } from '#frontend/data/sport-icons.ts'
	import type { SportSlug } from '#frontend/data/sports.ts'
	import { currentSection } from '#frontend/lib/sport-switch.ts'

	type SportOption = { slug: string; title: string; phrase: string; href: string }

	let {
		sports,
		value,
		size,
		onchoose,
	}: {
		sports: SportOption[]
		value: string
		size: 'title' | 'lead'
		onchoose?: (sport: SportOption) => void
	} = $props()

	const id = $props.id()

	/** Барабан один раз за визит прокручивается к текущему спорту: так видно, что спорт можно сменить. */
	let spin = $state(false)

	$effect(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

		try {
			if (sessionStorage.getItem('sport-switch-spun')) return

			sessionStorage.setItem('sport-switch-spun', '1')
		} catch {
			// Хранилище закрыто: крутим каждый раз
		}

		spin = true
	})

	function choose(slug: string) {
		const target = sports.find((s) => s.slug === slug)

		if (!target || slug === value) return

		if (onchoose) return onchoose(target)

		const section = currentSection(document)

		// Адрес заменяется, и у новой страницы referrer -- свой сайт: стрелка «Назад» (back-link)
		// решила бы, что пришли с сайта, и ушла бы в поисковик. Пришли извне -- referrer не отдаём
		if (!document.referrer || new URL(document.referrer).origin !== location.origin)
			document.head.append(
				Object.assign(document.createElement('meta'), { name: 'referrer', content: 'no-referrer' }),
			)

		location.replace(section ? `${target.href}#${section}` : target.href)
	}
</script>

<span class="sswitch__label" id="{id}-label">Вид спорта</span><PopupSelect
	options={sports.map((s) => ({ ...s, icon: SPORT_ICONS[s.slug as SportSlug] }))}
	{value}
	onchoose={choose}
	labelledby="{id}-label"
	{size}
>
	{#snippet face(option)}
		{@const index = sports.findIndex((s) => s.slug === option.slug)}
		{@const phrase = (shift: number) =>
			sports[(index + shift + sports.length) % sports.length].phrase.replaceAll(' ', ' ')}
		<!-- Барабан: соседние спорты выглядывают сверху и снизу -- видно, что значение одно из списка.
			Соседи -- псевдоэлементы: чистая декорация, без текста в дереве доступности -->
		<span
			class="sswitch__reel"
			class:sswitch__reel--spin={spin}
			data-prev={phrase(-1)}
			data-next={phrase(1)}
			aria-hidden="true">{phrase(0)}</span
		><span class="sswitch__label">{option.title}</span>
	{/snippet}
</PopupSelect>

<style>
	/* Подпись и название спорта -- для скринридера, на экране их роль играет фраза */
	.sswitch__label {
		position: absolute;
		overflow: hidden;
		width: 1px;
		height: 1px;
		white-space: nowrap;
		clip-path: inset(50%);
	}

	.sswitch__reel {
		position: relative;
		display: inline-block;
	}

	/* Соседи на барабане: бледнее, мельче и наклонены от зрителя, как грани вращающегося цилиндра */
	.sswitch__reel::before,
	.sswitch__reel::after {
		pointer-events: none;
		position: absolute;
		left: 0;
		white-space: nowrap;
		opacity: 0.25;
		transition: opacity 0.3s ease;
	}

	.sswitch__reel::before {
		content: attr(data-prev);
		bottom: 82%;
		transform-origin: left bottom;
		transform: perspective(400px) rotateX(32deg) scale(0.8);
		mask-image: linear-gradient(to top, #000 30%, transparent);
	}

	.sswitch__reel::after {
		content: attr(data-next);
		top: 82%;
		transform-origin: left top;
		transform: perspective(400px) rotateX(-32deg) scale(0.8);
		mask-image: linear-gradient(to bottom, #000 30%, transparent);
	}

	:global(.pselect__button:hover) .sswitch__reel::before,
	:global(.pselect__button:hover) .sswitch__reel::after {
		opacity: 0.4;
	}

	/* Подсказка при первом показе: барабан докручивается снизу до текущего спорта */
	.sswitch__reel--spin {
		animation: sswitch-spin 0.9s cubic-bezier(0.34, 1.4, 0.64, 1) 0.5s both;
	}

	@keyframes sswitch-spin {
		from {
			transform: translateY(1.2em);
		}

		to {
			transform: none;
		}
	}
</style>
