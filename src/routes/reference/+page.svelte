<script lang="ts">
	import { onMount } from 'svelte';
	import CirclePacking from '$lib/components/viz/CirclePacking.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import DataTable from '$lib/components/ui/DataTable.svelte';
	import { loadMetrics, metricStore } from '$lib/stores/metricStore.svelte';
	import { buildReferenceRows } from '$lib/engine/metricMetadata';
	import { tidy, filter, distinct, arrange, asc } from '@tidyjs/tidy';
	import { resolve, asset } from '$app/paths';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import NavButton from '$lib/components/ui/NavButton.svelte';
	import { colourForHierarchy } from '$lib/utils/colors';

	const PDF_URL =
		'https://repository.impact-initiatives.org/document/impact/96b71396/ANA_2025_Methodology-Summary-1.pdf';

	type View = 'table' | 'circle' | 'pdf';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let data = $state<any>(null);
	let error = $state<string | null>(null);
	let loading = $state(true);
	let selectedLevels = $state<string[]>([]);
	let selectedConcepts = $state<string[]>([]);
	let activeView = $state<View>('table');
	onMount(async () => {
		loadMetrics();
		try {
			const res = await fetch(asset('/data/reference-circlepacking.json'));
			if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
			data = await res.json();
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function filterTree(node: any, levels: string[], concepts: string[]): any {
		if (!node) return null;
		if (node.metric) {
			const levelOk = levels.length === 0 || levels.includes(node.metric.level);
			const conceptOk =
				concepts.length === 0 ||
				(node.metric.risk_concept != null && concepts.includes(String(node.metric.risk_concept)));
			return levelOk && conceptOk ? node : null;
		}
		if (!node.children) return node;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
		risk_concept: { wrap: true, extraClass: 'max-w-24', bg: 'var(--color-base-100)' },
		level: { wrap: true, extraClass: 'max-w-24', bg: 'var(--color-base-100)' },
		system: { wrap: true, extraClass: 'max-w-20' },
		factor: { wrap: true, extraClass: 'max-w-20' },
		subfactor: { wrap: true, extraClass: 'max-w-24' },
		indicator: { wrap: true, extraClass: 'max-w-40' },
		metric: { wrap: true, extraClass: 'max-w-20' },
		label: { wrap: true, extraClass: 'max-w-52' },
		type: { wrap: true, extraClass: 'max-w-20' },
		preference: { wrap: true, extraClass: 'max-w-20' },
		evidence_type: { wrap: true, extraClass: 'max-w-36' },
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

	const filtersActive = $derived(
		selectedLevels.length < levelOptions.length || selectedConcepts.length < conceptOptions.length
	);

	function clearFilters() {
		selectedLevels = levelOptions.map((o) => o.value);
		selectedConcepts = conceptOptions.map((o) => o.value);
	}

	const noActiveFilters = $derived(
		(levelOptions.length > 0 && selectedLevels.length === 0) ||
			(conceptOptions.length > 0 && selectedConcepts.length === 0)
	);

	const tableRows = $derived(
		referenceObjects.map(({ risk_concept, level, ...rest }) => ({ risk_concept, level, ...rest }))
	);
</script>

<svelte:head>
	<title>ANA | Reference list</title>
</svelte:head>

<div class="mx-auto max-w-7xl px-4 pb-10">
	<PageHeader
		title="Methodological reference"
		subtitle="Browse the reference list (as table or circle packing) and the methodology."
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

	{#if error}
		<p class="text-error mt-4 text-sm">Error loading data: {error}</p>
	{:else}
		<!-- View tabs -->
		<div class="mb-0 flex items-end">
			<div class="tabs tabs-lift" role="tablist">
				{#each ([['table', 'Table'], ['circle', 'Circle Packing'], ['pdf', 'Methodology']] as const) as [id, label] (id)}
					<button
						role="tab"
						class="tab {activeView === id ? 'tab-active' : ''}"
						onclick={() => (activeView = id)}
					>
						{label}
					</button>
				{/each}
			</div>
		</div>

		<!-- Sub-bar: filters (circle) or advanced-cols toggle (table) -->
		{#if activeView === 'circle'}
			<div
				class="border-base-200 bg-base-200/40 rounded-b-box mb-4 flex flex-wrap items-end gap-3 border border-t-0 px-4 py-3"
			>
				<div class="min-w-52">
					<Select
						options={levelOptions}
						selected={selectedLevels}
						placeholder="All levels"
						label="Filter by level"
						onchange={(v) => (selectedLevels = v as string[])}
					/>
				</div>
				<div class="min-w-52">
					<Select
						options={conceptOptions}
						selected={selectedConcepts}
						placeholder="All concepts"
						label="Filter by risk concept"
						onchange={(v) => (selectedConcepts = v as string[])}
					/>
				</div>
				{#if filtersActive}
					<button class="btn btn-ghost btn-sm self-end" onclick={clearFilters}>Clear filters</button>
				{/if}
			</div>
		{/if}

		<!-- Content -->
		{#if activeView === 'pdf'}
			<div
				class="border-base-200 bg-base-50 rounded-box flex flex-col items-center justify-center gap-6 border px-8 py-20 text-center"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-primary h-16 w-16 opacity-80"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
					/>
				</svg>
				<div class="max-w-md">
					<h2 class="text-base-content mb-2 text-xl font-semibold">ANA 2025 Methodology Summary</h2>
					<p class="text-base-content/85 text-sm">
						Describes the ANA analytical framework, indicator selection rationale, classification
						thresholds, and evidence standards.
					</p>
				</div>
				<a href={PDF_URL} target="_blank" rel="noopener noreferrer" class="btn btn-primary gap-2">
					Open PDF
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
						/>
					</svg>
				</a>
			</div>
		{:else if activeView === 'circle'}
			{#if loading}
				<p class="text-base-content/60 py-8 text-center text-sm">Loading…</p>
			{:else if noActiveFilters || !filteredData}
				<p class="text-base-content/60 py-8 text-center text-sm">
					No data matches current filters.
				</p>
			{:else}
				<CirclePacking
					data={filteredData}
					nodePadding={4}
					paddingByDepth={{ 0: 60, 1: 40, 2: 5, 3: 5 }}
				/>
			{/if}
		{:else}
			<DataTable
				rows={tableRows}
				colOptions={refColOptions}
				rowColor={refRowColor}
				headerRowClass="text-xs text-base-content bg-base-200"
				rowDividerClass="border-base-content"
				searchable
				downloadable
				humanizeHeaders
				overflow="scroll"
				initialSearch={browser ? (page.url.searchParams.get('q') ?? '') : ''}
			/>
		{/if}
	{/if}
</div>
