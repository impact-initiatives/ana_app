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

	let mapDownloadFn: (() => Promise<void>) | undefined = $state();
</script>

<section>
	<h1 class="border-primary mb-8 border-l-6 pl-3 text-2xl font-semibold tracking-widest uppercase">
		Overview
	</h1>

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
			{#snippet titleActions()}
				{#if mapDownloadFn}
					<button class="btn btn-sm btn-outline gap-1.5" onclick={mapDownloadFn}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="size-4"
							viewBox="0 0 20 20"
							fill="currentColor"
							aria-hidden="true"
						>
							<path
								fill-rule="evenodd"
								d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
								clip-rule="evenodd"
							/>
						</svg>
						Download SVG
					</button>
				{/if}
			{/snippet}
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
					country={adminFeaturesStore.countryName}
					onuoaclick={(uoa, adminName) => onmapselect(uoa, adminName)}
					ondownloadready={(fn) => (mapDownloadFn = fn)}
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
