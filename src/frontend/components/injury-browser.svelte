<script lang="ts">
	import BodyMap from '#frontend/components/body-map.svelte'
	import { MOVEMENTS, type Movement } from '#frontend/data/movements.ts'
	import { REGION_SLUGS, regionLabel, type Region } from '#frontend/data/regions.ts'
	import { filterInjuries, type InjuryListItem } from '#frontend/lib/filter.ts'

	let { injuries }: { injuries: InjuryListItem[] } = $props()

	let region = $state<Region>()
	let frequency = $state<'common' | 'rare'>()
	let movement = $state<Movement>()
	let query = $state('')

	// Ссылка «/?region=knee» со страницы статьи сразу открывает список зоны.
	$effect(() => {
		const fromUrl = new URLSearchParams(location.search).get('region')

		if (fromUrl && (REGION_SLUGS as string[]).includes(fromUrl)) region = fromUrl as Region
	})

	/** Зона живёт и в адресе, чтобы выбор можно было скопировать ссылкой и пережить перезагрузку. */
	function selectRegion(next?: Region) {
		region = next
		const url = new URL(location.href)

		if (next) url.searchParams.set('region', next)
		else url.searchParams.delete('region')

		history.replaceState(history.state, '', url)
	}

	function reset() {
		selectRegion(undefined)
		frequency = undefined
		movement = undefined
		query = ''
	}

	const visible = $derived(filterInjuries(injuries, { region, frequency, movement, query }))
	const counts = $derived(
		injuries.reduce<Partial<Record<Region, number>>>(
			(acc, i) => ({ ...acc, [i.region]: (acc[i.region] ?? 0) + 1 }),
			{},
		),
	)
	const usedMovements = $derived(MOVEMENTS.filter((m) => injuries.some((i) => i.movements.includes(m.slug))))
</script>

<div class="browser">
	<BodyMap selected={region} {counts} onselect={selectRegion} />

	<div class="browser__list">
		<div class="browser__filters">
			<input
				class="browser__search"
				type="search"
				placeholder="Поиск: ПКС, плечо, rhabdo…"
				aria-label="Поиск по травмам"
				bind:value={query}
			/>
			<select class="browser__select" aria-label="Частота" bind:value={frequency}>
				<option value={undefined}>Любая частота</option>
				<option value="common">Частые</option>
				<option value="rare">Редкие, но опасные</option>
			</select>
			<select class="browser__select" aria-label="Движение" bind:value={movement}>
				<option value={undefined}>Любое движение</option>
				{#each usedMovements as m (m.slug)}
					<option value={m.slug}>{m.title}</option>
				{/each}
			</select>
		</div>

		<div class="browser__status">
			<p class="browser__count" aria-live="polite">
				{region ? `${regionLabel(region)}: ` : ''}{visible.length} из {injuries.length}
			</p>
			{#if region || frequency || movement || query}
				<button class="browser__reset" type="button" onclick={reset}>Сбросить</button>
			{/if}
		</div>

		<ul class="browser__cards">
			{#each visible as i (i.slug)}
				<li>
					<a class="card" href={`/injuries/${i.slug}/`}>
						<span class="card__region"
							>{regionLabel(i.region)}{i.frequency === 'rare' ? ' · редко' : ''}</span
						>
						<strong class="card__title">{i.title}</strong>
						<span class="card__summary">{i.summary}</span>
					</a>
				</li>
			{/each}
		</ul>
	</div>
</div>

<style>
	.browser {
		display: grid;
		gap: 24px;

		@media (--md) and (--scripting) {
			grid-template-columns: 240px 1fr;
			align-items: start;
		}

		&__filters {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;

			/* Без скриптов фильтры мертвы, остаётся полный список ссылок. */
			@media (--no-scripting) {
				display: none;
			}
		}

		&__search {
			flex: 1 1 220px;
		}

		&__search,
		&__select {
			padding: 8px 12px;
			border: 1px solid var(--surface);
			border-radius: 10px;
			font: inherit;
			background: var(--bg);
		}

		&__status {
			display: flex;
			gap: 12px;
			align-items: center;
		}

		&__count {
			margin: 0;
			color: var(--muted);
		}

		&__reset {
			cursor: pointer;
			border: 0;
			font: inherit;
			color: var(--accent);
			background: none;
		}

		&__cards {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
			gap: 12px;
			padding: 0;
			list-style: none;
		}
	}

	/* Повторяет components/injury-card.astro: остров Svelte не может отрисовать Astro-компонент. */
	.card {
		display: grid;
		gap: 6px;
		height: 100%;
		padding: 16px;
		border-radius: 12px;
		color: inherit;
		text-decoration: none;
		background: var(--surface);

		&:hover .card__title {
			color: var(--accent);
		}

		&__region,
		&__summary {
			font-size: 0.85rem;
			color: var(--muted);
		}
	}
</style>
