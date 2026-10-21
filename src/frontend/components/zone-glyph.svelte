<!--
	Зона травмы значком: фигурка человека, точка -- на месте зоны. Подпись зоны в строке результата
	поиска занимала вторую строку, значок встаёт в одну с названием. Своя фигурка, а не
	person-standing из lucide: у той прямые руки, и плечо, локоть и кисть сливались в одну точку
-->
<script lang="ts">
	import type { Region } from '#frontend/data/regions.ts'

	let { region, label }: { region: Region; label: string } = $props()

	/** Центр точки зоны в координатах фигурки. «Всё тело» точки не ставит: горит вся фигурка. */
	const SPOTS: Record<Exclude<Region, 'other'>, [number, number]> = {
		head: [12, 3.5],
		neck: [12, 7],
		shoulder: [8.5, 7.5],
		elbow: [6.5, 11],
		'wrist-hand': [6, 15],
		lumbar: [12, 12],
		'hip-groin': [10.5, 15],
		knee: [9.5, 19],
		shin: [9.5, 21.5],
		'ankle-foot': [9.5, 24],
	}

	const spot = $derived(region === 'other' ? undefined : SPOTS[region])
</script>

<svg class="glyph" class:glyph--whole={!spot} viewBox="4 0 16 26" role="img" aria-label={label}>
	<g class="glyph__body">
		<circle cx="12" cy="3.5" r="2" />
		<path d="M12 6v8M12 7H8.5L6.5 11 6 15M12 7h3.5l2 4 .5 4M12 14h-1.5l-1 5v5M12 14h1.5l1 5v5" />
	</g>
	{#if spot}<circle class="glyph__spot" cx={spot[0]} cy={spot[1]} r="2.2" />{/if}
</svg>

<style>
	.glyph {
		flex: none;
		width: 16px;
		height: 26px;
	}

	.glyph__body {
		opacity: 0.55;
		fill: none;
		stroke: var(--a-fg2);
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.5;
	}

	.glyph--whole .glyph__body {
		opacity: 1;
		stroke: var(--a-blue);
	}

	.glyph__spot {
		fill: var(--a-blue);
		stroke: var(--a-bg);
		stroke-width: 1;
	}
</style>
