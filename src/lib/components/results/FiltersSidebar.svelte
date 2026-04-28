<script lang="ts">
	import Select from '$lib/components/ui/Select.svelte';
	import ButtonClear from '$lib/components/ui/ButtonClear.svelte';

	type Option = { value: string; label: string };

	interface Props {
		flaggedTotal: number;
		filteredTotal: number;
		isFiltered: boolean;
		overviewUoaOptions: Option[];
		overviewSelectedUoas: string[] | null;
		selectedPrelimKeys: string[] | null;
		PRELIM_KEYS: readonly string[];
		prelimOptions: Option[];
		metadataCols: string[];
		groupByCol: string | null;
		groupByOptions: Option[];
		selectedGroupValues: string[];
		onoverviewuoaschange: (v: string | string[]) => void;
		onprelimkeyschange: (v: string | string[]) => void;
		ongroupbycol: (v: string | null) => void;
		ongroupvalueschange: (v: string | string[]) => void;
		onclearfilters: () => void;
	}

	let {
		flaggedTotal,
		filteredTotal,
		isFiltered,
		overviewUoaOptions,
		overviewSelectedUoas,
		selectedPrelimKeys,
		PRELIM_KEYS,
		prelimOptions,
		metadataCols,
		groupByCol,
		groupByOptions,
		selectedGroupValues,
		onoverviewuoaschange,
		onprelimkeyschange,
		ongroupbycol,
		ongroupvalueschange,
		onclearfilters
	}: Props = $props();
</script>

<div class="card-body gap-4">
	<div class="mb-2">
		<h2 class="card-title text-sm font-semibold uppercase">
			Focus on specific UoAs or preliminary flags
		</h2>
		<p class="text-base-content/75 mt-1 text-sm">
			Use these filters to subset UoAs or preliminary flags (or additional filter columns).
		</p>
		<p class="text-base-content/75 text-sm">
			Filters apply across these sections: Overview, Systems, and Metrics.
		</p>
	</div>

	<Select
		label="Units of analysis"
		options={overviewUoaOptions}
		selected={overviewSelectedUoas ?? overviewUoaOptions.map((o) => o.value)}
		placeholder="All UOAs"
		onchange={onoverviewuoaschange}
	/>

	<Select
		label="Preliminary flag"
		options={prelimOptions}
		selected={selectedPrelimKeys ?? [...PRELIM_KEYS]}
		placeholder="All flags"
		onchange={onprelimkeyschange}
	/>

	{#if metadataCols.length > 0}
		<Select
			label="Filter by column"
			selected={groupByCol ?? ''}
			placeholder="(no extra filter)"
			options={metadataCols.map((c) => ({ value: c, label: c }))}
			onchange={(v) => ongroupbycol((Array.isArray(v) ? v[0] : v) || null)}
		/>

		{#if groupByCol !== null && groupByOptions.length > 0}
			<Select
				label="Filter values"
				options={groupByOptions}
				selected={selectedGroupValues}
				placeholder="Select values…"
				onchange={ongroupvalueschange}
			/>
		{/if}
	{/if}

	<p class="text-base-content/75 text-xs">
		<strong class="text-base-content">{filteredTotal}</strong> / {flaggedTotal} UOAs shown
	</p>

	{#if isFiltered}
		<ButtonClear label="Clear filters" onclick={onclearfilters} widthClass="w-full" />
	{/if}
</div>
