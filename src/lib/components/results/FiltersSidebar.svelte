<script lang="ts">
	import Select from '$lib/components/ui/Select.svelte';
	import ButtonClear from '$lib/components/ui/ButtonClear.svelte';

	type Option = { value: string; label: string };

	interface Props {
		flaggedTotal: number;
		filteredTotal: number;
		isFiltered: boolean;
		uoaOptions: Option[];
		selectedUoas: string[] | null;
		selectedPrelimKeys: string[] | null;
		prelimOptions: Option[];
		metadataCols: string[];
		groupByCol: string | null;
		groupByOptions: Option[];
		selectedGroupValues: string[] | null;
		dropdownClass?: string;
		selectClass?: string;
		onuoaschange: (v: string | string[]) => void;
		onprelimkeyschange: (v: string | string[]) => void;
		ongroupbycol: (v: string | null) => void;
		ongroupvalueschange: (v: string | string[]) => void;
		onclearfilters: () => void;
	}

	let {
		flaggedTotal,
		filteredTotal,
		isFiltered,
		uoaOptions,
		selectedUoas,
		selectedPrelimKeys,
		prelimOptions,
		metadataCols,
		groupByCol,
		groupByOptions,
		selectedGroupValues,
		dropdownClass = 'w-full',
		selectClass = '',
		onuoaschange,
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
			Filters apply to charts and other dropdowns across all sections.
		</p>
	</div>

	<Select
		{dropdownClass}
		class={selectClass}
		label="Units of analysis"
		options={uoaOptions}
		selected={selectedUoas}
		multiple={true}
		placeholder="All UOAs"
		unitLabel="UoAs"
		onchange={onuoaschange}
	/>

	<Select
		{dropdownClass}
		class={selectClass}
		label="Preliminary flag"
		options={prelimOptions}
		selected={selectedPrelimKeys}
		multiple={true}
		placeholder="All flags"
		unitLabel="flags"
		onchange={onprelimkeyschange}
	/>

	{#if metadataCols.length > 0}
		<Select
			{dropdownClass}
			class={selectClass}
			label="Filter by column"
			selected={groupByCol ?? ''}
			placeholder="(no extra filter)"
			options={metadataCols.map((c) => ({ value: c, label: c }))}
			onchange={(v) => ongroupbycol((Array.isArray(v) ? v[0] : v) || null)}
		/>

		{#if groupByCol !== null && groupByOptions.length > 0}
			<Select
				{dropdownClass}
				class={selectClass}
				label="Filter values"
				options={groupByOptions}
				selected={selectedGroupValues}
				multiple={true}
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
