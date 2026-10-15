<script lang="ts">
	import type { Region } from '#frontend/data/regions.ts'
	import { regionLabel } from '#frontend/data/regions.ts'

	type Props = { selected?: Region; counts: Partial<Record<Region, number>>; onselect: (region?: Region) => void }

	let { selected, counts, onselect }: Props = $props()

	/** Точки зон на силуэте спереди, координаты в системе viewBox 0 0 200 400. Зона «прочее» — кнопкой под схемой. */
	const SPOTS: { region: Region; points: [number, number][] }[] = [
		{
			region: 'shoulder',
			points: [
				[62, 92],
				[138, 92],
			],
		},
		{
			region: 'elbow',
			points: [
				[46, 160],
				[154, 160],
			],
		},
		{
			region: 'wrist-hand',
			points: [
				[36, 222],
				[164, 222],
			],
		},
		{ region: 'lumbar', points: [[100, 178]] },
		{ region: 'hip-groin', points: [[100, 214]] },
		{
			region: 'knee',
			points: [
				[82, 290],
				[118, 290],
			],
		},
		{
			region: 'ankle-foot',
			points: [
				[80, 370],
				[120, 370],
			],
		},
	]

	const toggle = (region: Region) => onselect(selected === region ? undefined : region)
</script>

<figure class="map">
	<svg class="map__svg" viewBox="0 0 200 400" role="group" aria-label="Схема тела: выберите зону">
		<g class="map__body" aria-hidden="true">
			<circle cx="100" cy="36" r="22" />
			<rect x="66" y="64" width="68" height="150" rx="26" />
			<rect x="36" y="76" width="22" height="150" rx="11" transform="rotate(8 47 76)" />
			<rect x="142" y="76" width="22" height="150" rx="11" transform="rotate(-8 153 76)" />
			<rect x="70" y="200" width="26" height="180" rx="13" />
			<rect x="104" y="200" width="26" height="180" rx="13" />
		</g>
		{#each SPOTS as spot (spot.region)}
			<g
				class="map__zone"
				class:map__zone--active={selected === spot.region}
				class:map__zone--empty={!counts[spot.region]}
				role="button"
				tabindex="0"
				aria-pressed={selected === spot.region}
				aria-label={`${regionLabel(spot.region)}, травм: ${counts[spot.region] ?? 0}`}
				onclick={() => toggle(spot.region)}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(spot.region))}
			>
				{#each spot.points as [cx, cy], i (i)}
					<circle {cx} {cy} r="13" />
				{/each}
			</g>
		{/each}
	</svg>
	<figcaption>
		<button class="map__other" type="button" aria-pressed={selected === 'other'} onclick={() => toggle('other')}>
			{regionLabel('other')} · {counts.other ?? 0}
		</button>
	</figcaption>
</figure>

<style>
	.map {
		display: grid;
		gap: 8px;
		justify-items: center;
		margin: 0;

		/* Без скриптов зоны не нажимаются, а полный список ниже и так виден. */
		@media (--no-scripting) {
			display: none;
		}

		&__svg {
			width: min(220px, 60vw);
			height: auto;

			/* На телефоне карта не съедает первый экран: под ней должен начинаться список. */
			@media (--below-md) {
				width: auto;
				height: 220px;
			}
		}

		&__body {
			fill: var(--surface);
		}

		&__zone {
			cursor: pointer;
			outline: none;
			fill: var(--accent);
			fill-opacity: 0.35;

			&:hover,
			&:focus-visible {
				fill-opacity: 0.6;
			}

			&:focus-visible {
				stroke: var(--fg);
				stroke-width: 2;
			}

			&--empty {
				fill: var(--muted);
				fill-opacity: 0.2;
			}

			/* Последним и с тем же весом, что у :hover и :focus-visible: выбранная зона заметна всегда, даже пустая. */
			&--active,
			&--active:hover,
			&--active:focus-visible {
				fill: var(--accent);
				fill-opacity: 0.9;
			}
		}

		&__other {
			cursor: pointer;
			padding: 6px 12px;
			border: 0;
			border-radius: 999px;
			font: inherit;
			background: var(--surface);

			&[aria-pressed='true'] {
				color: #ffffff;
				background: var(--accent);
			}
		}
	}
</style>
