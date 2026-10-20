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
		{@const sport = sports.find((s) => s.slug === option.slug)}
		<span aria-hidden="true">{sport?.phrase.replaceAll(' ', ' ')}</span><span class="sswitch__label"
			>{option.title}</span
		>
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
</style>
