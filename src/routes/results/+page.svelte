<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { asset } from '$app/paths';
	import { flagStore } from '$lib/stores/flagStore.svelte';
	import { metricStore } from '$lib/stores/metricStore.svelte';
	import {
		adminFeaturesStore,
		setAdminFeatures,
		setAdminFetchState,
		uoaLabel
	} from '$lib/stores/adminFeaturesStore.svelte';
	import ExploreNav from '$lib/components/ui/ExploreNav.svelte';
	import exploreNav from '$lib/stores/exploreNav.svelte';

	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { appReady } from '$lib/stores/appReady.svelte';
	import NoDataState from '$lib/components/ui/NoDataState.svelte';
	import { PRELIM_BADGE_MAP } from '$lib/utils/colors';
	import { PRELIM_FLAG_KEYS } from '$lib/types/flags';

	import ResultsOverview from '$lib/components/results/ResultsOverview.svelte';
	import ResultsSystems from '$lib/components/results/ResultsSystems.svelte';
	import ResultsMetrics from '$lib/components/results/ResultsMetrics.svelte';
	import ResultsCoverage from '$lib/components/results/ResultsCoverage.svelte';
	import ResultsExport from '$lib/components/results/ResultsExport.svelte';
	import FiltersSidebar from '$lib/components/results/FiltersSidebar.svelte';

	import { analyzeUoas } from '$lib/utils/pcode';
	import { fetchAdminsForCountry } from '$lib/engine/fetchAdmin';
	import { buildSubfactorList } from '$lib/engine/metricMetadata';
	import { revealOnScroll } from '$lib/utils/revealOnScroll.svelte';
	import {
		downloadJSON,
		downloadCSV,
		downloadXLSX,
		downloadDeepDiveZip
	} from '$lib/engine/download';

	// ── Types ─────────────────────────────────────────────────────────────────

	type Row = Record<string, any>;
	type System = { id: string; label: string };

	interface DotData {
		uoa: string;
		value: number;
		flagLabel: string;
		within10: boolean | null;
	}
	// Static tree — built once from referenceJson, no row data
	interface StaticMetricNode {
		id: string;
		label: string | null;
		indicatorLabel: string;
		threshold: number | null;
		direction: string | null;
	}
	interface StaticSubfactorNode {
		subfactorId: string;
		subfactorLabel: string;
		metrics: StaticMetricNode[];
	}
	interface StaticFactorNode {
		factorId: string;
		factorLabel: string;
		subfactors: StaticSubfactorNode[];
	}
	interface StaticSystemNode {
		systemId: string;
		systemLabel: string;
		factors: StaticFactorNode[];
	}
	// Merged tree — static structure + dots attached from filtered rows
	interface MetricBlock extends StaticMetricNode {
		dots: DotData[];
	}
	interface SubfactorBlock {
		subfactorId: string;
		subfactorLabel: string;
		metrics: MetricBlock[];
	}
	interface FactorBlock {
		factorId: string;
		factorLabel: string;
		subfactors: SubfactorBlock[];
	}
	interface SystemBlock {
		systemId: string;
		systemLabel: string;
		factors: FactorBlock[];
	}

	// ── Core store derivations ────────────────────────────────────────────────

	const flagged = $derived(flagStore.flaggedResult ?? ([] as Row[]));
	const referenceJson = $derived(metricStore.referenceJson);
	const metadataCols = $derived(flagStore.metadataCols ?? ([] as string[]));
	const hasData = $derived(flagStore.flaggedResult !== null && flagged.length > 0);

	const systems = $derived<System[]>(
		Array.isArray(referenceJson?.systems)
			? (referenceJson.systems as any[]).map((s) => ({ id: s.id, label: s.label ?? s.id }))
			: []
	);

	const subList = $derived<{ path: string; codes: string[] }[]>(
		referenceJson ? (buildSubfactorList(referenceJson) ?? []) : []
	);

	const systemCodes = $derived<Map<string, string[]>>(
		(() => {
			const sets = new Map<string, Set<string>>();
			for (const { path, codes } of subList) {
				const [systemId] = String(path).split('.');
				let set = sets.get(systemId);
				if (!set) {
					set = new Set();
					sets.set(systemId, set);
				}
				for (const c of codes) set.add(c);
			}
			return new Map([...sets].map(([k, v]) => [k, [...v]]));
		})()
	);

	// ── P-code / choropleth map ────────────────────────────────────────────────

	const uoaAnalysis = $derived(
		flagged.length > 0 ? analyzeUoas(flagged.map((r) => String(r.uoa))) : null
	);
	const hasPcodes = $derived(
		uoaAnalysis?.action === 'adm1' || uoaAnalysis?.action === 'adm2' || uoaAnalysis?.action === 'mixed'
	);
	const pcodeLevel = $derived<'ADM1' | 'ADM2' | 'MIXED'>(
		uoaAnalysis?.action === 'adm2' ? 'ADM2' : uoaAnalysis?.action === 'mixed' ? 'MIXED' : 'ADM1'
	);

	const pcodeKey = $derived.by(() => {
		if (!uoaAnalysis || !hasPcodes) return null;
		const first = (uoaAnalysis.parsed ?? []).find(
			(p: { parsed?: { isPcode?: boolean; code?: string } }) => p.parsed?.isPcode
		);
		const code = first?.parsed?.code ?? uoaAnalysis.pcode ?? null;
		return code ? `${code}_${pcodeLevel}` : null;
	});

	$effect(() => {
		if (!pcodeKey || !hasPcodes) return;
		if (
			adminFeaturesStore.fetchState === 'loading' ||
			adminFeaturesStore.fetchState === 'error' ||
			adminFeaturesStore.cachedKey === pcodeKey
		)
			return;
		const first = (uoaAnalysis!.parsed ?? []).find(
			(p: { parsed?: { isPcode?: boolean; code?: string } }) => p.parsed?.isPcode
		);
		const pcode = first?.parsed?.code ?? uoaAnalysis!.pcode ?? '';
		setAdminFetchState('loading');
		fetchAdminsForCountry(pcode as string, pcodeLevel)
			.then((res) => {
				setAdminFeatures(res?.adm1 ?? null, res?.adm2 ?? null, pcodeKey!);
			})
			.catch((e) => {
				setAdminFetchState('error', String(e));
			});
	});

	// ── Section 1: Overview filter state ──────────────────────────────────────

	let groupByCol = $state<string | null>(null);

	const groupByOptions = $derived<{ value: string; label: string }[]>(
		groupByCol === null
			? []
			: [
					...new Set(
						flagged
							.filter((r) => r[groupByCol!] != null && String(r[groupByCol!]) !== '')
							.map((r) => String(r[groupByCol!]))
					)
				]
					.sort()
					.map((v) => {
						const name = adminFeaturesStore.pcodeLabelMap?.[v];
						return { value: v, label: name ? `${name} (${v})` : v };
					})
	);

	let selectedGroupValues = $state<string[] | null>(null);

	function onGroupValuesChange(next: string | string[]) {
		const arr = Array.isArray(next) ? next : [next];
		selectedGroupValues = arr.length === groupByOptions.length ? null : arr;
	}

	let selectedUoas = $state<string[] | null>(null);
	let selectedPrelimKeys = $state<string[] | null>(null);

	// Stage 1: group filter only
	const filteredByGroup = $derived.by<Row[]>(() => {
		if (groupByCol === null || selectedGroupValues === null) return flagged;
		return flagged.filter((r) => selectedGroupValues!.includes(String(r[groupByCol!] ?? '')));
	});

	// Cross-filter: UoA options reflect group + prelim (excludes UoA filter itself)
	const uoaOptions = $derived.by(() => {
		let rows: Row[] = filteredByGroup;
		if (selectedPrelimKeys !== null)
			rows = rows.filter((r) => selectedPrelimKeys!.includes(String(r.prelim_flag ?? '')));
		return [...new Set(rows.map((r) => String(r.uoa)))]
			.sort()
			.map((pcode) => ({ value: pcode, label: uoaLabel(pcode) }));
	});

	function onUoasChange(next: string | string[]) {
		const arr = Array.isArray(next) ? next : [next];
		selectedUoas = arr.length === uoaOptions.length ? null : arr;
	}

	// Cross-filter: prelim options reflect group + UoA (excludes prelim filter itself)
	const prelimOptions = $derived.by(() => {
		const rows =
			selectedUoas === null
				? filteredByGroup
				: filteredByGroup.filter((r) => selectedUoas!.includes(String(r.uoa)));
		return PRELIM_FLAG_KEYS.filter((key) =>
			rows.some((r) => String(r.prelim_flag ?? '') === key)
		).map((key) => ({ value: key, label: PRELIM_BADGE_MAP[key].label }));
	});

	function onPrelimKeysChange(next: string | string[]) {
		const arr = Array.isArray(next) ? next : [next];
		selectedPrelimKeys = arr.length === prelimOptions.length ? null : arr;
	}

	function handleDonutSliceClick(key: string | null) {
		if (key === null) {
			selectedPrelimKeys = null;
		} else {
			selectedPrelimKeys =
				selectedPrelimKeys?.includes(key) && selectedPrelimKeys.length === 1 ? null : [key];
		}
	}

	// Effective selections: clamp raw state to currently available options (drops stale chips)
	const effectiveSelectedUoas = $derived.by(() => {
		if (selectedUoas === null) return null;
		const available = new Set(uoaOptions.map((o) => o.value));
		const valid = selectedUoas.filter((v) => available.has(v));
		return valid.length === 0 || valid.length === uoaOptions.length ? null : valid;
	});

	const effectiveSelectedPrelimKeys = $derived.by(() => {
		if (selectedPrelimKeys === null) return null;
		const available = new Set<string>(prelimOptions.map((o) => o.value));
		const valid = selectedPrelimKeys.filter((v) => available.has(v));
		return valid.length === 0 || valid.length === prelimOptions.length ? null : valid;
	});

	// Stage 2: group + effective prelim, no UoA — map always colours all areas
	const filteredForMap = $derived.by<Row[]>(() => {
		if (effectiveSelectedPrelimKeys === null) return filteredByGroup;
		return filteredByGroup.filter((r) =>
			effectiveSelectedPrelimKeys!.includes(String(r.prelim_flag ?? ''))
		);
	});

	// Stage 3: full filter (group + prelim + UoA) — all non-map components
	const filteredFlagged = $derived.by<Row[]>(() => {
		if (effectiveSelectedUoas === null) return filteredForMap;
		return filteredForMap.filter((r) => effectiveSelectedUoas!.includes(String(r.uoa)));
	});

	const isFiltered = $derived(
		effectiveSelectedUoas !== null || effectiveSelectedPrelimKeys !== null || groupByCol !== null
	);

	// ── Section 2: Systems — map click + heatmap selection ────────────────────

	let selectedMapUoa = $state<string | null>(null);
	let selectedMapAdminName = $state<string | null>(null);

	const selectedMapRow = $derived(
		selectedMapUoa !== null
			? (filteredForMap.find((r) => String(r.uoa) === selectedMapUoa) ?? null)
			: null
	);

	let heatmapSelectedUoa = $state<string | null>(null);
	let heatmapSelectedSystem = $state<string | null>(null);

	function selectInHeatmap(uoa: string, systemId: string) {
		heatmapSelectedUoa = uoa;
		heatmapSelectedSystem = systemId;
		document.getElementById('systems')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	// ── Section 3: Metrics ──────────────────────────────────────────────────────

	// Step 1: build static tree from referenceJson — no row data, runs once.
	function buildStaticTree(json: Record<string, unknown>): StaticSystemNode[] {
		const result: StaticSystemNode[] = [];
		for (const sys of Array.isArray(json['systems']) ? (json['systems'] as any[]) : []) {
			if (!sys) continue;
			const factors: StaticFactorNode[] = [];
			for (const fac of Array.isArray(sys.factors) ? (sys.factors as any[]) : []) {
				if (!fac) continue;
				const subfactors: StaticSubfactorNode[] = [];
				for (const sub of Array.isArray(fac.sub_factors) ? (fac.sub_factors as any[]) : []) {
					if (!sub || !Array.isArray(sub.indicators)) continue;
					const metrics: StaticMetricNode[] = [];
					for (const ind of sub.indicators as any[]) {
						if (!ind) continue;
						const indicatorLabel: string = ind.label ?? ind.id;
						for (const met of Array.isArray(ind.metrics) ? (ind.metrics as any[]) : []) {
							if (!met?.metric) continue;
							metrics.push({
								id: met.metric,
								label: met.label ?? null,
								indicatorLabel,
								threshold: typeof met.thresholds?.an === 'number' ? met.thresholds.an : null,
								direction: met.above_or_below ?? null
							});
						}
					}
					if (metrics.length > 0)
						subfactors.push({ subfactorId: sub.id, subfactorLabel: sub.label ?? sub.id, metrics });
				}
				if (subfactors.length > 0)
					factors.push({ factorId: fac.id, factorLabel: fac.label ?? fac.id, subfactors });
			}
			if (factors.length > 0)
				result.push({ systemId: sys.id, systemLabel: sys.label ?? sys.id, factors });
		}
		return result;
	}

	// Step 2: one pass through rows → Map<metricId, DotData[]>. Runs on filter change.
	function buildDotIndex(rows: Row[]): Map<string, DotData[]> {
		const index = new Map<string, DotData[]>();
		if (rows.length === 0) return index;
		// Cache metric column names from first row — all rows share the same schema.
		const metricKeys = Object.keys(rows[0]).filter((k) => /^MET\d+$/.test(k));
		for (const row of rows) {
			for (const key of metricKeys) {
				const value = row[key];
				if (typeof value !== 'number' || isNaN(value)) continue;
				const flagLabel = String(row[`${key}_status`] ?? 'no_data');
				if (flagLabel === 'no_data') continue;
				const w10 = row[`${key}_within_10perc`];
				const entry: DotData = {
					uoa: String(row.uoa),
					value,
					flagLabel,
					within10: typeof w10 === 'boolean' ? w10 : null
				};
				const bucket = index.get(key);
				if (bucket) bucket.push(entry);
				else index.set(key, [entry]);
			}
		}
		return index;
	}

	// Step 3: attach dots to static tree via O(1) Map lookups. Runs on filter change.
	function mergeDotsIntoTree(
		tree: StaticSystemNode[],
		index: Map<string, DotData[]>
	): SystemBlock[] {
		const result: SystemBlock[] = [];
		for (const sys of tree) {
			const factors: FactorBlock[] = [];
			for (const fac of sys.factors) {
				const subfactors: SubfactorBlock[] = [];
				for (const sub of fac.subfactors) {
					const metrics: MetricBlock[] = [];
					for (const met of sub.metrics) {
						const dots = index.get(met.id);
						if (!dots || dots.length === 0) continue;
						metrics.push({ ...met, dots });
					}
					if (metrics.length > 0) subfactors.push({ ...sub, metrics });
				}
				if (subfactors.length > 0) factors.push({ ...fac, subfactors });
			}
			if (factors.length > 0) result.push({ ...sys, factors });
		}
		return result;
	}

	// Static tree: recomputes only when referenceJson changes (once per session).
	const staticTree = $derived(
		hasData && referenceJson ? buildStaticTree(referenceJson as Record<string, unknown>) : null
	);

	// Dot index: O(rows) single pass, recomputes on every filter change.
	const dotIndex = $derived(buildDotIndex(filteredFlagged));

	// Merged blocks: O(metrics) Map lookups — near-instant on filter change.
	const allBlocks = $derived(
		staticTree ? mergeDotsIntoTree(staticTree, dotIndex) : ([] as SystemBlock[])
	);

	const indSystemOptions = $derived(
		allBlocks.map((s) => ({ value: s.systemId, label: s.systemLabel }))
	);
	const indFactorOptions = $derived(
		allBlocks.flatMap((s) => s.factors.map((f) => ({ value: f.factorId, label: f.factorLabel })))
	);
	let indSelectedSystems = $state<string[] | null>(null);
	let indSelectedFactors = $state<string[] | null>(null);

	function onIndSystemsChange(next: string | string[]) {
		const arr = Array.isArray(next) ? next : [next];
		indSelectedSystems = arr.length === indSystemOptions.length ? null : arr;
	}
	function onIndFactorsChange(next: string | string[]) {
		const arr = Array.isArray(next) ? next : [next];
		indSelectedFactors = arr.length === indFactorOptions.length ? null : arr;
	}

	const filteredBlocks = $derived(
		allBlocks
			.filter((s) => indSelectedSystems === null || indSelectedSystems.includes(s.systemId))
			.map((s) => ({
				...s,
				factors: s.factors.filter(
					(f) => indSelectedFactors === null || indSelectedFactors.includes(f.factorId)
				)
			}))
			.filter((s) => s.factors.length > 0)
	);

	const totalMetrics = $derived(
		filteredBlocks.reduce(
			(acc, s) =>
				acc +
				s.factors.reduce((a, f) => a + f.subfactors.reduce((b, sf) => b + sf.metrics.length, 0), 0),
			0
		)
	);

	// ── Section 4: Coverage ───────────────────────────────────────────────────

	let coverageUoa = $state('');

	// Shared sorted UoA list — used by coverage selector and export.
	const uoaList = $derived([...new Set(flagged.map((r) => String(r['uoa'] ?? '')))].sort());

	// Filtered UoA list respects sidebar filters (UoA, prelim flag, group column).
	const filteredUoaList = $derived(
		[...new Set(filteredFlagged.map((r) => String(r['uoa'] ?? '')))].sort()
	);

	const coverageUoaOptions = $derived(filteredUoaList);

	// Fall back to first filtered UoA when the current selection is no longer in the filtered list.
	const effectiveCoverageUoa = $derived(
		filteredUoaList.includes(coverageUoa) ? coverageUoa : (filteredUoaList[0] ?? '')
	);

	const coverageSelectedRow = $derived(
		flagged.find((r) => String(r['uoa']) === effectiveCoverageUoa) ?? null
	);


	// ── Section 5: Export ─────────────────────────────────────────────────────

	const timestamp = $derived(new Date().toISOString().split('T')[0]);

	function handleJSON() {
		if (!flagStore.flaggedResult) return;
		downloadJSON(flagStore.flaggedResult, `flagged_data_${timestamp}.json`);
	}
	function handleCSV() {
		if (!flagStore.flaggedResult) return;
		downloadCSV(flagStore.flaggedResult, `flagged_data_${timestamp}.csv`);
	}
	function handleXLSX() {
		if (!flagStore.flaggedResult) return;
		downloadXLSX(flagStore.flaggedResult, `flagged_data_${timestamp}.xlsx`);
	}
	async function handleDeepDive() {
		if (filteredFlagged.length === 0) return;
		const json = metricStore.referenceJson;
		if (!json) return;
		const hypothesesResp = await fetch(asset('/data/hypotheses.json'));
		const hypothesesData = await hypothesesResp.json();
		await downloadDeepDiveZip(filteredFlagged, json, hypothesesData, `deepdives_${timestamp}.zip`);
	}

	// ── Observers: scroll spy ────────────────────────────────────────────────
	let mounted = $state(false);

	$effect(() => {
		if (!mounted) return;

		// Tracks which section is in the middle band of the viewport.
		const spyObs = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting)
						exploreNav.activeSection = (entry.target as HTMLElement)
							.id as typeof exploreNav.activeSection;
				}
			},
			{ rootMargin: '-120px 0px -50% 0px' }
		);

		for (const id of ['overview', 'systems', 'metrics', 'coverage', 'export']) {
			const el = document.getElementById(id);
			if (el) spyObs.observe(el);
		}

		return () => {
			spyObs.disconnect();
		};
	});

	onMount(() => {
		// Defer heavy $derived computations to the next task so the browser
		// gets one full paint (showing ExploreNav) before blocking the thread.
		setTimeout(async () => {
			mounted = true;
			await tick();
			const hash = window.location.hash;
			if (hash)
				document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}, 0);
	});
</script>

<svelte:head>
	<title>ANA | Results</title>
</svelte:head>

{#if !appReady.ready}
	<!-- preloader still visible — render nothing -->
{:else if !hasData}
	<div class="mx-auto max-w-5xl px-4 py-16" in:fly={{ y: 8, duration: 300, easing: quintOut }}>
		<NoDataState />
	</div>
{:else}
	<!-- Cancel the pt-6 from <main> so the two-panel row starts flush below the header -->
	<div class="-mt-6">
	{#if mounted}
		<!-- Two-panel row: sidebar (sticky, bounded by this container) + content -->
		<div class="flex min-h-[calc(100vh-3.5rem)]">
		<aside class="bg-base-100 border-base-300 hidden lg:block lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:overflow-y-auto lg:w-64 lg:shrink-0 border-r">
			<FiltersSidebar
				flaggedTotal={flagged.length}
				filteredTotal={filteredFlagged.length}
				{isFiltered}
				{uoaOptions}
				selectedUoas={effectiveSelectedUoas}
				selectedPrelimKeys={effectiveSelectedPrelimKeys}
				{prelimOptions}
				{metadataCols}
				{groupByCol}
				{groupByOptions}
				{selectedGroupValues}
				onuoaschange={onUoasChange}
				onprelimkeyschange={onPrelimKeysChange}
				ongroupbycol={(v) => { groupByCol = v; selectedGroupValues = null; }}
				ongroupvalueschange={onGroupValuesChange}
				onclearfilters={() => {
					selectedUoas = null;
					selectedPrelimKeys = null;
					groupByCol = null;
					selectedGroupValues = null;
				}}
			/>
		</aside>

		<!-- ExploreNav: fixed, spanning right panel only (left-64 = sidebar width) -->
		<div class="bg-base-100/90 border-base-300 fixed top-14 left-0 right-0 z-20 border-b px-6 backdrop-blur-sm lg:left-64">
			<ExploreNav activeSection={exploreNav.activeSection} />
		</div>

		<!-- Right panel: offset by ExploreNav height only; sidebar is in-flow via flex -->
		<div class="min-w-0 w-full pt-12">

				<!-- Mobile-only filters card (visible instead of sidebar on small screens) -->
				<div class="border-base-300 bg-base-100 border-b lg:hidden">
					<FiltersSidebar
						flaggedTotal={flagged.length}
						filteredTotal={filteredFlagged.length}
						{isFiltered}
						{uoaOptions}
						{selectedUoas}
						{selectedPrelimKeys}
						{prelimOptions}
						{metadataCols}
						{groupByCol}
						{groupByOptions}
						{selectedGroupValues}
						selectClass="w-60"
						onuoaschange={onUoasChange}
						onprelimkeyschange={onPrelimKeysChange}
						ongroupbycol={(v) => { groupByCol = v; selectedGroupValues = null; }}
						ongroupvalueschange={onGroupValuesChange}
						onclearfilters={() => {
							selectedUoas = null;
							selectedPrelimKeys = null;
							groupByCol = null;
							selectedGroupValues = null;
						}}
					/>
				</div>

				<!-- Overview -->
				<div id="overview" class="bg-base-200/30 border-base-300 scroll-mt-28 border-b py-16">
					<div
						class="mx-auto max-w-5xl px-6"
						{@attach revealOnScroll({ y: 36, duration: 650, rootMargin: '0px 0px -25% 0px' })}
					>
						<ResultsOverview
							filteredFlagged={filteredFlagged}
							mapRows={filteredForMap}
							{systems}
							{systemCodes}
							{hasPcodes}
							{pcodeLevel}
							{selectedPrelimKeys}
							{selectedMapUoa}
							{selectedMapAdminName}
							{selectedMapRow}
							onmapuoaschange={(uoas) => {
								selectedUoas = uoas.length > 0 ? uoas : null;
							}}
							onselectinheatmap={selectInHeatmap}
							onmapselect={(uoa, adminName) => {
								if (selectedMapUoa === uoa) {
									selectedMapUoa = null;
									selectedMapAdminName = null;
								} else {
									selectedMapUoa = uoa;
									selectedMapAdminName = adminName;
								}
							}}
							onmapclear={() => {
								selectedMapUoa = null;
								selectedMapAdminName = null;
							}}
							ondonutsliceclick={handleDonutSliceClick}
						/>
					</div>
				</div>

				<!-- Systems -->
				<div id="systems" class="border-base-300 scroll-mt-28 border-b py-16">
					<div
						class="mx-auto max-w-5xl px-6"
						{@attach revealOnScroll({ y: 36, duration: 650, rootMargin: '0px 0px -25% 0px' })}
					>
						<ResultsSystems
							filteredFlagged={filteredFlagged}
							{systems}
							{systemCodes}
							{subList}
							{referenceJson}
							bind:selectedUoa={heatmapSelectedUoa}
							bind:selectedSystem={heatmapSelectedSystem}
						/>
					</div>
				</div>

				<!-- Metrics -->
				<div id="metrics" class="bg-base-200/30 border-base-300 scroll-mt-28 border-b py-16">
					<div
						class="mx-auto max-w-5xl px-6"
						{@attach revealOnScroll({ y: 36, duration: 650, rootMargin: '0px 0px -25% 0px' })}
					>
						<ResultsMetrics
							{filteredBlocks}
							{indSystemOptions}
							{indFactorOptions}
							{indSelectedSystems}
							{indSelectedFactors}
							{totalMetrics}
							onindsystemschange={onIndSystemsChange}
							onindfactorschange={onIndFactorsChange}
						/>
					</div>
				</div>

				<!-- Coverage -->
				<div id="coverage" class="border-base-300 scroll-mt-28 border-b py-16">
					<div
						class="mx-auto max-w-5xl px-6"
						{@attach revealOnScroll({ y: 36, duration: 650, rootMargin: '0px 0px -25% 0px' })}
					>
						<ResultsCoverage
							{coverageUoaOptions}
							coverageUoa={effectiveCoverageUoa}
							{coverageSelectedRow}
							filteredRows={filteredFlagged}
							{systems}
							{referenceJson}
							oncoverageUoaChange={(v) => (coverageUoa = v)}
						/>
					</div>
				</div>

				<!-- Export -->
				<div id="export" class="bg-base-200/30 scroll-mt-28 py-16">
					<div
						class="mx-auto max-w-5xl px-6"
						{@attach revealOnScroll({ y: 36, duration: 650, rootMargin: '0px 0px -25% 0px' })}
					>
						<ResultsExport
							rows={filteredFlagged}
							{handleJSON}
							{handleCSV}
							{handleXLSX}
							{handleDeepDive}
						/>
					</div>
				</div>
		</div>
		</div><!-- flex wrapper -->
	{/if}
	</div><!-- -mt-6 wrapper -->
{/if}
