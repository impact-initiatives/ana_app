<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { asset } from '$app/paths';
	import { flagStore } from '$lib/stores/flagStore.svelte';
	import { metricStore } from '$lib/stores/metricStore.svelte';
	import { filterStore, persistFilters, clearFilters } from '$lib/stores/resultsFilterStore.svelte';
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
	import { PRIORITY_BADGE_MAP } from '$lib/utils/colors';
	import { PRIORITY_FLAG_KEYS } from '$lib/types/flags';
	import { sortSystemsByOrder } from '$lib/types/structure';

	import ResultsOverview from '$lib/components/results/ResultsOverview.svelte';
	import ResultsSystems from '$lib/components/results/ResultsSystems.svelte';
	import ResultsMetrics from '$lib/components/results/ResultsMetrics.svelte';
	import ResultsCoverage from '$lib/components/results/ResultsCoverage.svelte';
	import ResultsSpotlight from '$lib/components/results/ResultsSpotlight.svelte';
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
			? sortSystemsByOrder(
					(referenceJson.systems as any[]).map((s) => ({ id: s.id, label: s.label ?? s.id }))
				)
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

	const groupByOptions = $derived.by<{ value: string; label: string }[]>(() => {
		if (filterStore.groupByCol === null) return [];
		// Cross-filter from prelim only — UoA is excluded to avoid circular collapse
		// (group selection cascades to UoA, which would narrow options back to one)
		let rows: Row[] = flagged;
		if (filterStore.selectedPrelimKeys !== null)
			rows = rows.filter((r) => filterStore.selectedPrelimKeys!.includes(String(r.priority_flag ?? '')));
		return [
			...new Set(
				rows
					.filter((r) => r[filterStore.groupByCol!] != null && String(r[filterStore.groupByCol!]) !== '')
					.map((r) => String(r[filterStore.groupByCol!]))
			)
		]
			.sort()
			.map((v) => {
				const name = adminFeaturesStore.pcodeLabelMap?.[v];
				return { value: v, label: name ? `${name} (${v})` : v };
			});
	});

	// Stage 1: group filter only
	const filteredByGroup = $derived.by<Row[]>(() => {
		if (filterStore.groupByCol === null || filterStore.selectedGroupValues === null) return flagged;
		return flagged.filter((r) => filterStore.selectedGroupValues!.includes(String(r[filterStore.groupByCol!] ?? '')));
	});

	// UoA options: all UoAs in the dataset (group filter only — independent of priority flag selection)
	const uoaOptions = $derived.by(() => {
		return [...new Set(filteredByGroup.map((r) => String(r.uoa)))]
			.sort()
			.map((pcode) => ({ value: pcode, label: uoaLabel(pcode) }));
	});

	// Prelim options: all flags present in the dataset (group filter only, not UoA-filtered)
	// UoA and priority flag are independent filters — narrowing UoAs must not collapse flag options.
	const prelimOptions = $derived.by(() => {
		return PRIORITY_FLAG_KEYS.filter((key) =>
			filteredByGroup.some((r) => String(r.priority_flag ?? '') === key)
		).map((key) => ({ value: key, label: PRIORITY_BADGE_MAP[key].label }));
	});

	// ── Cascade helpers ───────────────────────────────────────────────────────

	function computeMatchingGroupValues(uoas: string[] | null, keys: string[] | null): string[] | null {
		if (filterStore.groupByCol === null) return null;
		let rows: Row[] = flagged;
		if (keys !== null) rows = rows.filter((r) => keys.includes(String(r.priority_flag ?? '')));
		if (uoas !== null) rows = rows.filter((r) => uoas.includes(String(r.uoa)));
		const allGroupVals = [
			...new Set(
				flagged
					.filter((r) => r[filterStore.groupByCol!] != null && String(r[filterStore.groupByCol!]) !== '')
					.map((r) => String(r[filterStore.groupByCol!]))
			)
		];
		const matching = allGroupVals.filter((v) =>
			rows.some((r) => r[filterStore.groupByCol!] != null && String(r[filterStore.groupByCol!]) === v)
		);
		return matching.length === 0 || matching.length === allGroupVals.length ? null : matching;
	}

	// ── Setters ───────────────────────────────────────────────────────────────

	function applyGroupValues(vals: string[] | null) {
		filterStore.selectedGroupValues = vals;
		if (vals === null) {
			// Group filter cleared — reset everything
			filterStore.selectedUoas = null;
			filterStore.selectedPrelimKeys = null;
			return;
		}
		// Compute group-filtered rows inline (derived filteredByGroup hasn't updated yet)
		const groupRows: Row[] =
			filterStore.groupByCol === null
				? flagged
				: flagged.filter((r) => vals.includes(String(r[filterStore.groupByCol!] ?? '')));
		// Cascade to prelim: show chips for prelim keys present in group rows
		const allPrelimsInFlagged = [
			...new Set(flagged.map((r) => String(r.priority_flag ?? '')).filter((f) => f !== ''))
		];
		const prelimsInGroup = [
			...new Set(groupRows.map((r) => String(r.priority_flag ?? '')).filter((f) => f !== ''))
		];
		filterStore.selectedPrelimKeys =
			prelimsInGroup.length === 0 || prelimsInGroup.length === allPrelimsInFlagged.length
				? null
				: prelimsInGroup;
		// Cascade to UoA: show chips for UoAs present in group rows
		const allUoasInFlagged = [...new Set(flagged.map((r) => String(r.uoa)))];
		const uoasInGroup = [...new Set(groupRows.map((r) => String(r.uoa)))];
		filterStore.selectedUoas =
			uoasInGroup.length === 0 || uoasInGroup.length === allUoasInFlagged.length
				? null
				: uoasInGroup;
	}

	function applyGroupCol(col: string | null) {
		filterStore.groupByCol = col;
		filterStore.selectedGroupValues = null;
	}

	function clearAllFilters() {
		clearFilters();
	}

	// ── Event handlers ────────────────────────────────────────────────────────

	function onUoasChange(next: string | string[]) {
		const arr = Array.isArray(next) ? next : [next];
		filterStore.selectedUoas = arr.length === uoaOptions.length ? null : arr;
	}

	function onPrelimKeysChange(next: string | string[]) {
		const arr = Array.isArray(next) ? next : [next];
		filterStore.selectedPrelimKeys = arr.length === prelimOptions.length ? null : arr;
	}

	function onGroupValuesChange(next: string | string[]) {
		const arr = Array.isArray(next) ? next : [next];
		applyGroupValues(arr.length === groupByOptions.length ? null : arr);
	}

	function handleDonutSliceClick(key: string | null) {
		filterStore.selectedPrelimKeys =
			key === null ? null
			: filterStore.selectedPrelimKeys?.includes(key) && filterStore.selectedPrelimKeys.length === 1 ? null
			: [key];
	}

	// Stage 2: group + prelim, no UoA — map always colours all areas
	const filteredForMap = $derived.by<Row[]>(() => {
		if (filterStore.selectedPrelimKeys === null) return filteredByGroup;
		return filteredByGroup.filter((r) =>
			filterStore.selectedPrelimKeys!.includes(String(r.priority_flag ?? ''))
		);
	});

	// Stage 3: full filter (group + prelim + UoA) — all non-map components
	const filteredFlagged = $derived.by<Row[]>(() => {
		if (filterStore.selectedUoas === null) return filteredForMap;
		return filteredForMap.filter((r) => filterStore.selectedUoas!.includes(String(r.uoa)));
	});

	const isFiltered = $derived(
		filterStore.selectedUoas !== null || filterStore.selectedPrelimKeys !== null || filterStore.groupByCol !== null
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
		return sortSystemsByOrder(result.map((s) => ({ ...s, id: s.systemId }))).map(({ id: _, ...s }) => s);
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
	function onIndSystemsChange(next: string | string[]) {
		const arr = Array.isArray(next) ? next : [next];
		filterStore.indSelectedSystems = arr.length === indSystemOptions.length ? null : arr;
	}
	function onIndFactorsChange(next: string | string[]) {
		const arr = Array.isArray(next) ? next : [next];
		filterStore.indSelectedFactors = arr.length === indFactorOptions.length ? null : arr;
	}

	const filteredBlocks = $derived(
		allBlocks
			.filter((s) => filterStore.indSelectedSystems === null || filterStore.indSelectedSystems.includes(s.systemId))
			.map((s) => ({
				...s,
				factors: s.factors.filter(
					(f) => filterStore.indSelectedFactors === null || filterStore.indSelectedFactors.includes(f.factorId)
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

	// ── Persist filters to localStorage ──────────────────────────────────────

	$effect(() => {
		filterStore.selectedUoas;
		filterStore.selectedPrelimKeys;
		filterStore.groupByCol;
		filterStore.selectedGroupValues;
		filterStore.indSelectedSystems;
		filterStore.indSelectedFactors;
		persistFilters();
	});

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

		for (const id of ['overview', 'systems', 'metrics', 'coverage', 'spotlight', 'export']) {
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
				selectedUoas={filterStore.selectedUoas}
				selectedPrelimKeys={filterStore.selectedPrelimKeys}
				{prelimOptions}
				{metadataCols}
				groupByCol={filterStore.groupByCol}
				{groupByOptions}
				selectedGroupValues={filterStore.selectedGroupValues}
				onuoaschange={onUoasChange}
				onprelimkeyschange={onPrelimKeysChange}
				ongroupbycol={applyGroupCol}
				ongroupvalueschange={onGroupValuesChange}
				onclearfilters={clearAllFilters}
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
						selectedUoas={filterStore.selectedUoas}
						selectedPrelimKeys={filterStore.selectedPrelimKeys}
						{prelimOptions}
						{metadataCols}
						groupByCol={filterStore.groupByCol}
						{groupByOptions}
						selectedGroupValues={filterStore.selectedGroupValues}
						selectClass="w-60"
						onuoaschange={onUoasChange}
						onprelimkeyschange={onPrelimKeysChange}
						ongroupbycol={applyGroupCol}
						ongroupvalueschange={onGroupValuesChange}
						onclearfilters={clearAllFilters}
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
							selectedPrelimKeys={filterStore.selectedPrelimKeys}
							{selectedMapUoa}
							{selectedMapAdminName}
							{selectedMapRow}
							onmapuoaschange={(uoas) => (filterStore.selectedUoas = uoas.length > 0 ? uoas : null)}
							onmapselectreset={clearAllFilters}
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
							indSelectedSystems={filterStore.indSelectedSystems}
							indSelectedFactors={filterStore.indSelectedFactors}
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

				<!-- Spotlight -->
				<div id="spotlight" class="border-base-300 scroll-mt-28 border-b py-16">
					<div
						class="mx-auto max-w-5xl px-6"
						{@attach revealOnScroll({ y: 36, duration: 650, rootMargin: '0px 0px -25% 0px' })}
					>
						<ResultsSpotlight
							filteredRows={filteredFlagged}
							{referenceJson}
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
