<script lang="ts">
	import PrelimFlagDonut from '$lib/components/viz/PrelimFlagDonut.svelte';
	import UoaRankingTable from '$lib/components/viz/UoaRankingTable.svelte';
	import ChoroplethMap from '$lib/components/viz/ChoroplethMap.svelte';
	import UoaDetailPanel from '$lib/components/viz/UoaDetailPanel.svelte';
	import { adminFeaturesStore } from '$lib/stores/adminFeaturesStore.svelte';
	import Card from '$lib/components/ui/Card.svelte';

	type Row = Record<string, unknown>;
	type System = { id: string; label: string };

	interface Props {
		filteredFlagged: Row[];
		systems: System[];
		systemCodes: Map<string, string[]>;
		hasPcodes: boolean;
		pcodeLevel: 'ADM1' | 'ADM2';
		selectedPrelimKeys: string[] | null;
		selectedMapUoa: string | null;
		selectedMapAdminName: string | null;
		selectedMapRow: Row | null;
		onselectinheatmap: (uoa: string, systemId: string) => void;
		onmapselect: (uoa: string, adminName: string | null) => void;
		onmapclear: () => void;
		ondonutsliceclick: (key: string | null) => void;
	}

	let {
		filteredFlagged,
		systems,
		systemCodes,
		hasPcodes,
		pcodeLevel,
		selectedPrelimKeys,
		selectedMapUoa,
		selectedMapAdminName,
		selectedMapRow,
		onselectinheatmap,
		onmapselect,
		onmapclear,
		ondonutsliceclick
	}: Props = $props();
</script>

<section>
	<h2 class="border-primary mb-6 border-l-4 pl-3 text-lg font-semibold tracking-widest uppercase">
		Overview
	</h2>

	<!-- Donut + ranking table -->
	<div class="mb-6 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-5">
		<div class="lg:col-span-2">
			<PrelimFlagDonut
				rows={filteredFlagged}
				selectedKeys={selectedPrelimKeys}
				onsliceclick={ondonutsliceclick}
			/>
		</div>
		<div class="lg:col-span-3">
			<UoaRankingTable
				rows={filteredFlagged}
				{systems}
				{systemCodes}
				onprelimclick={ondonutsliceclick}
			/>
		</div>
	</div>

	<!-- Choropleth map -->
	{#if hasPcodes && adminFeaturesStore.fetchState !== 'error'}
		<Card class="mt-6" title="Preliminary flag map" subtitle="Click an area to view its report.">
			{#if adminFeaturesStore.fetchState === 'loading'}
				<div class="text-base-content/75 flex items-center gap-2 py-6 text-sm">
					<span class="loading loading-spinner loading-sm"></span>
					Fetching admin boundaries…
				</div>
			{:else if adminFeaturesStore.adm1}
				<ChoroplethMap
					adm1={adminFeaturesStore.adm1}
					adm2={adminFeaturesStore.adm2}
					rows={filteredFlagged}
					level={pcodeLevel}
					onuoaclick={(uoa, adminName) => onmapselect(uoa, adminName)}
				/>
				{#if selectedMapUoa}
					<div class="mt-4">
						<UoaDetailPanel
							uoa={selectedMapUoa}
							adminName={selectedMapAdminName}
							row={selectedMapRow}
							{systems}
							{systemCodes}
							ondrilldown={onselectinheatmap}
							onclose={onmapclear}
						/>
					</div>
				{/if}
			{/if}
		</Card>
	{/if}
</section>
