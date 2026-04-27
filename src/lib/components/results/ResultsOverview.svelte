<script lang="ts">
	import PrelimFlagDonut from '$lib/components/viz/PrelimFlagDonut.svelte';
	import UoaRankingTable from '$lib/components/viz/UoaRankingTable.svelte';
	import ChoroplethMap from '$lib/components/viz/ChoroplethMap.svelte';
	import type { MapLayer } from '$lib/components/viz/ChoroplethMap.svelte';
	import UoaDetailPanel from '$lib/components/viz/UoaDetailPanel.svelte';
	import { adminFeaturesStore } from '$lib/stores/adminFeaturesStore.svelte';
	import { metricStore } from '$lib/stores/metricStore.svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import Card from '$lib/components/ui/Card.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import type { SelectGroup } from '$lib/components/ui/Select.svelte';
	import DownloadButton from '$lib/components/ui/DownloadButton.svelte';

	type Row = Record<string, unknown>;
	type System = { id: string; label: string };
	type SelectOption = { value: string; label: string };

	// Reference JSON traversal types (full depth)
	type RefMetric = { metric: string; label?: string };
	type RefIndicator = { id: string; label: string; metrics?: RefMetric[] };
	type RefSubfactor = { id: string; label: string; indicators?: RefIndicator[] };
	type RefFactor = { id: string; label: string; sub_factors?: RefSubfactor[] };
	type RefSystem = { id: string; label: string; factors?: RefFactor[] };

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

	// ── Map download ──────────────────────────────────────────────────────────────

	let mapDownloadFn: (() => Promise<void>) | undefined = $state();

	// ── Cascade filter state ──────────────────────────────────────────────────────

	let selectedSystem = $state('');
	let selectedFactor = $state('');
	let selectedSubfactor = $state('');
	let selectedMetric = $state('');

	// ── Ancestry map: metric ID → compound system/factor/subfactor keys ───────────

	const metricAncestry = $derived.by(() => {
		const ref = metricStore.referenceJson?.systems as RefSystem[] | undefined;
		if (!ref) return new SvelteMap<string, { system: string; factor: string; subfactor: string }>();
		const map = new SvelteMap<string, { system: string; factor: string; subfactor: string }>();
		for (const s of ref) {
			for (const f of s.factors ?? []) {
				for (const sf of f.sub_factors ?? []) {
					for (const ind of sf.indicators ?? []) {
						for (const m of ind.metrics ?? []) {
							map.set(m.metric, {
								system: s.id,
								factor: `${s.id}.${f.id}`,
								subfactor: `${s.id}.${f.id}.${sf.id}`
							});
						}
					}
				}
			}
		}
		return map;
	});

	// ── Cascading option lists ────────────────────────────────────────────────────

	const systemOptions = $derived.by<SelectOption[]>(() => {
		const ref = metricStore.referenceJson?.systems as RefSystem[] | undefined;
		if (!ref) return [];
		return ref.map((s) => ({ value: s.id, label: s.label }));
	});

	const factorOptions = $derived.by<SelectGroup[]>(() => {
		const ref = metricStore.referenceJson?.systems as RefSystem[] | undefined;
		if (!ref) return [];
		const src = selectedSystem ? ref.filter((s) => s.id === selectedSystem) : ref;
		return src
			.map((s) => ({
				group: s.label,
				options: (s.factors ?? []).map((f) => ({ value: `${s.id}.${f.id}`, label: f.label }))
			}))
			.filter((g) => g.options.length > 0);
	});

	const subfactorOptions = $derived.by<SelectGroup[]>(() => {
		const ref = metricStore.referenceJson?.systems as RefSystem[] | undefined;
		if (!ref) return [];
		const groups: SelectGroup[] = [];
		for (const s of ref) {
			for (const f of s.factors ?? []) {
				if (selectedFactor && `${s.id}.${f.id}` !== selectedFactor) continue;
				const opts = (f.sub_factors ?? []).map((sf) => ({
					value: `${s.id}.${f.id}.${sf.id}`,
					label: sf.label
				}));
				if (opts.length > 0) groups.push({ group: f.label, options: opts });
			}
		}
		return groups;
	});

	const metricOptions = $derived.by<SelectOption[]>(() => {
		const ancestry = metricAncestry;
		return Object.entries(metricStore.metricMap)
			.filter(([id]) => {
				if (!selectedSubfactor && !selectedFactor && !selectedSystem) return true;
				const a = ancestry.get(id);
				if (!a) return false;
				if (selectedSubfactor) return a.subfactor === selectedSubfactor;
				if (selectedFactor) return a.factor === selectedFactor;
				return a.system === selectedSystem;
			})
			.map(([id, m]) => ({ value: id, label: `${id} – ${m.label ?? id}` }))
			.sort((a, b) => a.value.localeCompare(b.value));
	});

	// ── Cascade change handlers ───────────────────────────────────────────────────

	function onSystemChange(val: string | string[]) {
		const v = typeof val === 'string' ? val : '';
		selectedSystem = v;
		selectedFactor = '';
		selectedSubfactor = '';
		selectedMetric = '';
	}

	function onFactorChange(val: string | string[]) {
		const v = typeof val === 'string' ? val : '';
		selectedFactor = v;
		selectedSubfactor = '';
		selectedMetric = '';
		if (v) selectedSystem = v.split('.')[0];
	}

	function onSubfactorChange(val: string | string[]) {
		const v = typeof val === 'string' ? val : '';
		selectedSubfactor = v;
		selectedMetric = '';
		if (v) {
			const parts = v.split('.');
			selectedSystem = parts[0];
			selectedFactor = `${parts[0]}.${parts[1]}`;
		}
	}

	function onMetricChange(val: string | string[]) {
		const v = typeof val === 'string' ? val : '';
		selectedMetric = v;
		if (v) {
			const a = metricAncestry.get(v);
			if (a) {
				selectedSystem = a.system;
				selectedFactor = a.factor;
				selectedSubfactor = a.subfactor;
			}
		}
	}

	// ── Label lookup: system/factor/subfactor id → human label ───────────────────

	const labelLookup = $derived.by(() => {
		const ref = metricStore.referenceJson?.systems as RefSystem[] | undefined;
		const systems: Record<string, string> = {};
		const factors: Record<string, string> = {};
		const subfactors: Record<string, string> = {};
		for (const s of ref ?? []) {
			systems[s.id] = s.label;
			for (const f of s.factors ?? []) {
				factors[`${s.id}.${f.id}`] = f.label;
				for (const sf of f.sub_factors ?? []) {
					subfactors[`${s.id}.${f.id}.${sf.id}`] = sf.label;
				}
			}
		}
		return { systems, factors, subfactors };
	});

	// ── Export title: reflects the deepest active filter ─────────────────────────

	const exportLayerTitle = $derived.by<string | null>(() => {
		if (selectedMetric) {
			return metricOptions.find((o) => o.value === selectedMetric)?.label ?? selectedMetric;
		}
		if (selectedSubfactor) {
			const sysId = selectedSubfactor.split('.')[0];
			const facId = `${sysId}.${selectedSubfactor.split('.')[1]}`;
			const parts: string[] = [];
			const sysLabel = labelLookup.systems[sysId];
			const facLabel = labelLookup.factors[facId];
			const sfLabel = labelLookup.subfactors[selectedSubfactor];
			if (sysLabel) parts.push(`System: ${sysLabel}`);
			if (facLabel) parts.push(`Factor: ${facLabel}`);
			if (sfLabel) parts.push(`Sub-factor: ${sfLabel}`);
			return parts.join(' – ') || selectedSubfactor;
		}
		if (selectedFactor) {
			const sysId = selectedFactor.split('.')[0];
			const parts: string[] = [];
			const sysLabel = labelLookup.systems[sysId];
			const facLabel = labelLookup.factors[selectedFactor];
			if (sysLabel) parts.push(`System: ${sysLabel}`);
			if (facLabel) parts.push(`Factor: ${facLabel}`);
			return parts.join(' – ') || selectedFactor;
		}
		if (selectedSystem) {
			const label = labelLookup.systems[selectedSystem];
			return label ? `System: ${label}` : selectedSystem;
		}
		return null;
	});

	// ── Map layer: deepest non-empty selection wins ───────────────────────────────

	const mapLayer: MapLayer = $derived.by(() => {
		if (selectedMetric)
			return { type: 'status', field: `${selectedMetric}_status`, hasInsufficient: false };
		if (selectedSubfactor)
			return { type: 'status', field: `${selectedSubfactor}.status`, hasInsufficient: true };
		if (selectedFactor)
			return { type: 'status', field: `${selectedFactor}.status`, hasInsufficient: true };
		if (selectedSystem)
			return { type: 'status', field: `${selectedSystem}.status`, hasInsufficient: true };
		return { type: 'prelim' };
	});

	// ── Card subtitle ─────────────────────────────────────────────────────────────

	const activeLabel = $derived.by<string | null>(() => {
		if (selectedMetric) {
			const a = metricAncestry.get(selectedMetric);
			const metricLabel =
				metricOptions.find((o) => o.value === selectedMetric)?.label ?? selectedMetric;
			if (!a) return metricLabel;
			const parts: string[] = [];
			if (labelLookup.systems[a.system]) parts.push(labelLookup.systems[a.system]);
			if (labelLookup.factors[a.factor]) parts.push(labelLookup.factors[a.factor]);
			if (labelLookup.subfactors[a.subfactor]) parts.push(labelLookup.subfactors[a.subfactor]);
			parts.push(metricLabel);
			return parts.join(' / ');
		}
		if (selectedSubfactor) {
			const sysId = selectedSubfactor.split('.')[0];
			const facId = `${sysId}.${selectedSubfactor.split('.')[1]}`;
			const parts: string[] = [];
			if (labelLookup.systems[sysId]) parts.push(labelLookup.systems[sysId]);
			if (labelLookup.factors[facId]) parts.push(labelLookup.factors[facId]);
			if (labelLookup.subfactors[selectedSubfactor])
				parts.push(labelLookup.subfactors[selectedSubfactor]);
			return parts.join(' / ') || selectedSubfactor;
		}
		if (selectedFactor) {
			const sysId = selectedFactor.split('.')[0];
			const parts: string[] = [];
			if (labelLookup.systems[sysId]) parts.push(labelLookup.systems[sysId]);
			if (labelLookup.factors[selectedFactor]) parts.push(labelLookup.factors[selectedFactor]);
			return parts.join(' / ') || selectedFactor;
		}
		if (selectedSystem) {
			return labelLookup.systems[selectedSystem] ?? selectedSystem;
		}
		return null;
	});

	const cardSubtitle = $derived(
		activeLabel
			? `Showing: ${activeLabel}`
			: 'Showing: Preliminary flag. Click an area to view its report. Filter to view flags for systems, factors, subfactors or metrics.'
	);
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
		<Card class="mt-6" title="Map" subtitle={cardSubtitle}>
			{#snippet titleActions()}
				{#if mapDownloadFn}
					<DownloadButton onclick={mapDownloadFn} label="Download SVG" variant="outline" />
				{/if}
			{/snippet}

			{#if adminFeaturesStore.fetchState === 'loading'}
				<div class="text-base-content/75 flex items-center gap-2 py-6 text-sm">
					<span class="loading loading-spinner loading-sm"></span>
					Fetching admin boundaries…
				</div>
			{:else if adminFeaturesStore.adm1}
				<!-- Cascade layer filters -->
				<div class="mb-4 flex flex-wrap items-end gap-3">
					<div class="min-w-44">
						<Select
							options={systemOptions}
							selected={selectedSystem}
							placeholder="System…"
							label="System"
							onchange={onSystemChange}
						/>
					</div>
					<div class="min-w-44">
						<Select
							options={factorOptions}
							selected={selectedFactor}
							placeholder="Factor…"
							label="Factor"
							onchange={onFactorChange}
						/>
					</div>
					<div class="min-w-44">
						<Select
							options={subfactorOptions}
							selected={selectedSubfactor}
							placeholder="Sub-factor…"
							label="Sub-factor"
							onchange={onSubfactorChange}
						/>
					</div>
					<div class="min-w-52">
						<Select
							options={metricOptions}
							selected={selectedMetric}
							placeholder="Metric…"
							label="Metric"
							onchange={onMetricChange}
						/>
					</div>
				</div>

				<ChoroplethMap
					adm1={adminFeaturesStore.adm1}
					adm2={adminFeaturesStore.adm2}
					rows={filteredFlagged}
					level={pcodeLevel}
					country={adminFeaturesStore.countryName}
					layer={mapLayer}
					layerTitle={exportLayerTitle}
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
