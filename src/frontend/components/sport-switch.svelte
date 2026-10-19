<!--
	Выбор спорта во фразе заголовка: «Травмы ‹в паделе ▾›» на главной, «Разбор ‹в кроссфите ▾›»
	в статье. Кнопка -- сама фраза спорта, список -- как у фильтра движения (popup-select).
	Скринридер читает «Вид спорта, Падел». Переход -- только по явному выбору другого спорта.
	Без `onchoose` (остров отдельной страницы статьи) -- на статью спорта к разделу, который сейчас
	читают. Спорт -- настройка, а не шаг: адрес заменяется, «Назад» ведёт туда, откуда пришли.
-->
<script lang="ts">
	import PopupSelect from '#frontend/components/popup-select.svelte'
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

		location.replace(section ? `${target.href}#${section}` : target.href)
	}
</script>

<span class="sswitch__label" id="{id}-label">Вид спорта</span><PopupSelect
	options={sports}
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
