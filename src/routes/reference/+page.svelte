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
	import { colourForHierarchy } from '$lib/utils/colors';

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

	const refColOptions: Record<string, { wrap: boolean; extraClass?: string; bg?: string }> = {
		system: { wrap: true, extraClass: 'max-w-20' },
		factor: { wrap: true, extraClass: 'max-w-20' },
		subfactor: { wrap: true, extraClass: 'max-w-24' },
		indicator: { wrap: true, extraClass: 'max-w-40' },
		label: { wrap: true, extraClass: 'max-w-52' },
		risk_concept: { wrap: true, extraClass: 'max-w-24', bg: 'var(--color-base-100)' },
		level: { wrap: true, extraClass: 'max-w-24', bg: 'var(--color-base-100)' },
		preference: { wrap: true, extraClass: 'max-w-20' },
		evidence_threshold: { wrap: true, extraClass: 'max-w-20' },
		factor_threshold: { wrap: true, extraClass: 'max-w-20' },
		above_or_below: { wrap: true, extraClass: 'max-w-18' },
		threshold_an: { wrap: true, extraClass: 'max-w-20' },
		threshold_van: { wrap: true, extraClass: 'max-w-20' },
		msna_module: { wrap: true, extraClass: 'max-w-40' },
		question_kobo_code: { wrap: true, extraClass: 'max-w-24' },
		remarks_limitations: { wrap: true, extraClass: 'max-w-30' }
	};

	const refRowColor = $derived.by(
		(): Record<string, Record<string, { bg?: string; text?: string }>> | undefined => {
			const json = metricStore.referenceJson as {
				systems?: { id: string; label: string }[];
			} | null;
			if (!json?.systems) return undefined;
			const byLabel: Record<string, { bg: string }> = {};
			for (const sys of json.systems) {
				if (sys.id && sys.label) byLabel[sys.label] = { bg: colourForHierarchy(sys.id, 'factor') };
			}
			return { system: byLabel };
		}
	);

	// Pre-select all levels/concepts once options arrive from the async metricStore.
	let levelsInitialized = $state(false);
	let conceptsInitialized = $state(false);
	$effect(() => {
		if (!levelsInitialized && levelOptions.length > 0) {
			levelsInitialized = true;
			selectedLevels = levelOptions.map((o) => o.value);
		}
	});
	$effect(() => {
		if (!conceptsInitialized && conceptOptions.length > 0) {
			conceptsInitialized = true;
			selectedConcepts = conceptOptions.map((o) => o.value);
		}
	});

	// True when the user has explicitly cleared a filter that has available options.
	const noActiveFilters = $derived(
		(levelOptions.length > 0 && selectedLevels.length === 0) ||
			(conceptOptions.length > 0 && selectedConcepts.length === 0)
	);

	const filteredTableRows = $derived(
		tidy(
			referenceObjects,
			filter(
				(d) =>
					(selectedLevels.length === 0 || selectedLevels.includes(d.level)) &&
					(selectedConcepts.length === 0 || selectedConcepts.includes(d.risk_concept))
			)
		).map(({ risk_concept, level, ...rest }) => ({ risk_concept, level, ...rest }))
	);
</script>

<svelte:head>
	<title>ANA | Reference list</title>
</svelte:head>

<div class="mx-auto max-w-7xl px-4">
	<PageHeader
		title="Metric Reference List"
		subtitle="Browse and filter all metrics part of the framework."
	>
		{#snippet action()}
			<NavButton
				href={resolve('/')}
				label="Go to Home"
				direction="back"
				variant="primary"
				size="sm"
			/>
		{/snippet}
	</PageHeader>

	<div role="alert" class="alert alert-info alert-soft mt-6 mb-6">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			class="h-6 w-6 shrink-0 stroke-current"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
			></path>
		</svg>
		<p>
			The full guidance is available <a
				href="https://repository.impact-initiatives.org/document/impact/96b71396/ANA_2025_Methodology-Summary-1.pdf"
			>
				<span class="btn btn-outline btn-secondary btn-sm ml-1">here.</span>
			</a>
		</p>
	</div>

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
				labelFalse="Table"
				labelTrue="Circle Paking"
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
		<div class="mb-6">
			{#if noActiveFilters}
				<span class="text-base-content/70 flex py-8 text-center text-sm"
					>No data matches current filters.</span
				>
			{:else if showTableReferenceList}
				<CirclePacking
					data={filteredData}
					nodePadding={4}
					paddingByDepth={{ 0: 60, 1: 40, 2: 5, 3: 5 }}
				/>
			{:else}
				<DataTable
					rows={filteredTableRows}
					colOptions={refColOptions}
					rowColor={refRowColor}
					headerRowClass="text-xs text-primary"
					rowDividerClass="border-base-content"
					searchable
					downloadable
					humanizeHeaders
					overflow="scroll"
				/>
			{/if}
		</div>
	{/if}
</div>
<!-- /max-w-5xl -->
