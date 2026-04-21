<script lang="ts">
	import Select from '$lib/components/ui/Select.svelte';
	import RadioToggle from '$lib/components/ui/RadioToggle.svelte';
	import LegendBadge from '$lib/components/ui/LegendBadge.svelte';
	import CirclePacking from '$lib/components/viz/CirclePacking.svelte';
	import CoverageDetailCards from '$lib/components/viz/CoverageDetailCards.svelte';
	import { circlePackingStore } from '$lib/stores/circlePackingStore.svelte';
	import { uoaLabel } from '$lib/stores/adminFeaturesStore.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { fade } from 'svelte/transition';

	type Row = Record<string, any>;

	interface Props {
		coverageUoaOptions: string[];
		coverageUoa: string;
		showAvailableOnly: boolean;
		showCoverageTable: boolean;
		circlePackingDisplayData: unknown;
		coverageSelectedRow: Row | null;
		systems: { id: string; label: string }[];
		referenceJson: unknown;
		oncoverageUoaChange: (v: string) => void;
	}

	let {
		coverageUoaOptions,
		coverageUoa,
		showAvailableOnly = $bindable(false),
		showCoverageTable = $bindable(false),
		circlePackingDisplayData,
		coverageSelectedRow,
		systems,
		referenceJson,
		oncoverageUoaChange
	}: Props = $props();
</script>

<section>
	<h2 class="mb-6 border-l-4 border-primary pl-3 text-lg font-semibold tracking-widest uppercase">Coverage</h2>

	{#if circlePackingStore.loading}
		<div class="flex items-center justify-center gap-3 py-16">
			<span class="loading loading-spinner loading-md text-primary"></span>
			<p class="text-base-content/60 text-sm">Loading indicator framework…</p>
		</div>
	{:else if circlePackingStore.error}
		<p class="text-error text-sm">{circlePackingStore.error}</p>
	{:else}
		<div class="space-y-4">
			<!-- Controls -->
			<Card>
				<div class="flex flex-wrap items-end gap-6">
					<div class="max-w-72 min-w-60 flex-1">
						<Select
							label="Unit of analysis"
							options={coverageUoaOptions.map((uoa) => ({ value: uoa, label: uoaLabel(uoa) }))}
							selected={coverageUoa}
							placeholder="Select UOA…"
							onchange={(val) => oncoverageUoaChange(Array.isArray(val) ? (val[0] ?? '') : val)}
						/>
					</div>
					<RadioToggle
						bind:value={showCoverageTable}
						label="View"
						labelFalse="Cards"
						labelTrue="Circle Pack"
						name="coverageView"
					/>
					{#if showCoverageTable}
						<div transition:fade={{ duration: 200 }}>
							<RadioToggle
								bind:value={showAvailableOnly}
								label="Show"
								labelFalse="All metrics"
								labelTrue="Available only"
								name="availability"
							/>
						</div>
					{/if}
				</div>
			</Card>

			{#if !showCoverageTable}
				{#if coverageSelectedRow !== null}
					<div transition:fade={{ duration: 150 }}>
						<CoverageDetailCards row={coverageSelectedRow} {systems} {referenceJson} />
					</div>
				{/if}
			{:else}
				<div transition:fade={{ duration: 150 }}>
					<Card bodyClass="rounded-box overflow-hidden p-0">
						<div class="px-4 pt-3 pb-1">
							<LegendBadge />
						</div>
						<CirclePacking
							data={circlePackingDisplayData as any}
							flagRow={coverageSelectedRow}
							nodePadding={4}
							paddingByDepth={{ 0: 60, 1: 40, 2: 5, 3: 5 }}
						/>
					</Card>
				</div>
			{/if}
		</div>
	{/if}
</section>
