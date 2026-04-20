<script lang="ts">
	import { onMount } from 'svelte';
	import CirclePacking from '$lib/components/viz/CirclePacking.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import DataTable from '$lib/components/ui/DataTable.svelte';
	import { loadMetrics, metricStore } from '$lib/stores/metricStore.svelte';
	import { buildReferenceRows } from '$lib/engine/metricMetadata';
	import { tidy, filter, distinct, arrange, asc } from '@tidyjs/tidy';
	import { resolve, asset } from '$app/paths';
	import RadioToggle from '$lib/components/ui/RadioToggle.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import NavButton from '$lib/components/ui/NavButton.svelte';

	let data = $state<any>(null);
	let error = $state<string | null>(null);
	let loading = $state(true);
	let selectedLevels = $state<string[]>([]);
	let selectedConcepts = $state<string[]>([]);
	let showTableReferenceList = $state(false);

	onMount(async () => {
		loadMetrics();
		try {
			const res = await fetch(asset('/data/reference-circlepacking.json'));
			if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
			data = await res.json();
		} catch (e: any) {
			error = e?.message ?? String(e);
		} finally {
			loading = false;
		}
	});

	// Recursively prune tree to only keep indicators matching all active filters
	function filterTree(node: any, levels: string[], concepts: string[]): any | null {
		if (!node) return null;
		if (node.metric) {
			const levelOk = levels.length === 0 || levels.includes(node.metric.level);
			const conceptOk =
				concepts.length === 0 ||
				(node.metric.risk_concept != null && concepts.includes(String(node.metric.risk_concept)));
			return levelOk && conceptOk ? node : null;
		}
		if (!node.children) return node;
		const kept = node.children.map((c: any) => filterTree(c, levels, concepts)).filter(Boolean);
		return kept.length > 0 ? { ...node, children: kept } : null;
	}

	const filteredData = $derived(data ? filterTree(data, selectedLevels, selectedConcepts) : null);
	const referenceObjects = $derived(buildReferenceRows(metricStore.referenceJson));

	const levelOptions = $derived(
		tidy(
			referenceObjects,
			filter((d) => d.level !== ''),
			distinct(['level']),
			arrange(asc('level'))
		).map((d) => ({ value: d.level, label: d.level }))
	);

	const conceptOptions = $derived(
		tidy(
			referenceObjects,
			filter((d) => d.risk_concept !== ''),
			distinct(['risk_concept']),
			arrange(asc('risk_concept'))
		).map((d) => ({ value: d.risk_concept, label: d.risk_concept }))
	);

	const filteredTableRows = $derived(
		tidy(
			referenceObjects,
			filter(
				(d) =>
					(selectedLevels.length === 0 || selectedLevels.includes(d.level)) &&
					(selectedConcepts.length === 0 || selectedConcepts.includes(d.risk_concept))
			)
		)
	);
</script>

<svelte:head>
	<title>ANA | Reference list</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-4">
	<PageHeader title="Metric Reference List" subtitle="Browse and filter the full metric framework.">
		{#snippet action()}
			<NavButton href={resolve('/')} label="Back to Home" direction="back" />
		{/snippet}
	</PageHeader>

	{#if error}
		<p class="text-error">Error loading circle-packing data: {error}</p>
	{:else if loading}
		<p>Loading circle-packing data…</p>
	{:else}
		<div class="flex flex-col gap-4 p-4">
			<!-- Available-only toggle -->
			<RadioToggle
				bind:value={showTableReferenceList}
				label="Show reference list as"
				labelFalse="Circle Packing"
				labelTrue="Table"
				name="reference-list-view"
			/>
			<div class="flex flex-wrap gap-4">
				<div class="min-w-60">
					<Select
						options={levelOptions}
						selected={selectedLevels}
						placeholder="All levels"
						label="Filter by level"
						onchange={(v) => (selectedLevels = v as string[])}
					/>
				</div>
				<div class="min-w-60">
					<Select
						options={conceptOptions}
						selected={selectedConcepts}
						placeholder="All concepts"
						label="Filter by risk concept"
						onchange={(v) => (selectedConcepts = v as string[])}
					/>
				</div>
			</div>
		</div>

		{#if !showTableReferenceList}
			<CirclePacking
				data={filteredData}
				nodePadding={4}
				paddingByDepth={{ 0: 60, 1: 40, 2: 5, 3: 5 }}
			/>
		{:else}
			<div class="relative left-1/2 w-dvw max-w-none -translate-x-1/2 px-4">
				<div class="mx-auto max-w-7xl">
					<DataTable rows={filteredTableRows} columnSearchable overflow="scroll" />
				</div>
			</div>
		{/if}
	{/if}
</div>
<!-- /max-w-5xl -->
