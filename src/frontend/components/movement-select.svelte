<!--
	Выбор движения в индексе главной: подпись и значение цветом спорта, список -- popup-select.
	Первый пункт -- «любое», пустое значение, со звёздочкой: «что угодно».
-->
<script lang="ts">
	import { Asterisk } from 'lucide-static'

	import PopupSelect from '#frontend/components/popup-select.svelte'
	import { type ElementIcon, MOVEMENT_ICONS } from '#frontend/data/movement-icons.ts'

	type Option = { slug: string; title: string }

	let {
		options,
		value = $bindable(''),
		label,
		empty,
	}: { options: Option[]; value: string; label: string; empty: string } = $props()

	const id = $props.id()
</script>

<div class="mselect">
	<span class="mselect__label" id="{id}-label">{label}</span>
	<PopupSelect
		options={[
			{ slug: '', title: empty, icon: Asterisk },
			...options.map((o) => ({ ...o, icon: MOVEMENT_ICONS[o.slug as ElementIcon] })),
		]}
		{value}
		onchoose={(slug) => (value = slug)}
		labelledby="{id}-label"
	/>
</div>

<style>
	.mselect {
		display: inline-flex;
		gap: 6px;
		align-items: baseline;
		font-size: 16px;
		color: var(--a-fg2);
	}
</style>
