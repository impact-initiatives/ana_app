<script lang="ts">
	import HeatmapGrid from '$lib/components/viz/HeatmapGrid.svelte';
	import MetricDrilldown from '$lib/components/viz/MetricDrilldown.svelte';
	import { getMetricMetadata, getFactorMetadata } from '$lib/engine/metricMetadata';
	import { tick } from 'svelte';

	type Row = Record<string, any>;
	type System = { id: string; label: string };
	type FactorBlock = { factorKey: string; factorLabel: string; metricIds: string[] };

	interface Props {
		rows: Row[];
		systems: System[];
		systemCodes: Map<string, string[]>;
		subList: { path: string; codes: string[] }[];
		referenceJson: any;
		selectedUoa?: string | null;
		selectedSystem?: string | null;
	}

	let {
		rows,
		systems,
		systemCodes,
		subList,
		referenceJson,
		selectedUoa = $bindable<string | null>(null),
		selectedSystem = $bindable<string | null>(null)
	}: Props = $props();

	/** Clears selection automatically when the selected UOA is no longer in rows. */
	const activeUoa = $derived(
		selectedUoa !== null && rows.some((r) => String(r.uoa) === selectedUoa) ? selectedUoa : null
	);
	const activeSystem = $derived(activeUoa !== null ? selectedSystem : null);

	async function onselect(uoa: string, systemId: string) {
		selectedUoa = uoa;
		selectedSystem = systemId;
		await tick();
		document
			.getElementById('drilldown-table')
			?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	// ── Helpers ───────────────────────────────────────────────────────────────
	function factorBlocksFor(systemId: string): FactorBlock[] {
		const byFactor = new Map<string, Set<string>>();
		for (const { path, codes } of subList) {
			const parts = String(path).split('.');
			if (parts[0] !== systemId) continue;
			const factorKey = `${parts[0]}.${parts[1]}`;
			if (!byFactor.has(factorKey)) byFactor.set(factorKey, new Set());
			for (const c of codes) byFactor.get(factorKey)!.add(c);
		}
		return Array.from(byFactor.entries()).map(([k, set]) => {
			const [sysId, facId] = k.split('.');
			const md = getFactorMetadata(referenceJson, sysId, facId) as any;
			return {
				factorKey: k,
				factorLabel: md?.factor_label ?? facId,
				metricIds: Array.from(set)
			};
		});
	}

	function metricInfo(id: string) {
		if (!referenceJson) return null;
		const md = getMetricMetadata(referenceJson, id) as any;
		if (!md) return null;
		return {
			label: md.raw?.label ?? id,
			threshold_an: md.raw?.thresholds?.an ?? null,
			threshold_van: md.raw?.thresholds?.van ?? null,
			above_or_below: md.raw?.above_or_below ?? null,
			evidence_type: md.raw?.evidence_type ?? null
		};
	}

	function fmt(v: any): string {
		if (v === null || v === undefined) return '–';
		if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
		return String(v);
	}

	const activeFactorBlocks = $derived(activeSystem ? factorBlocksFor(activeSystem) : []);
	const activeDrillRow = $derived(
		activeUoa ? (rows.find((r) => String(r.uoa) === activeUoa) ?? null) : null
	);
	const activeSystemLabel = $derived(
		systems.find((s) => s.id === activeSystem)?.label ?? activeSystem ?? ''
	);
</script>

<HeatmapGrid {rows} {systems} {systemCodes} {activeUoa} {activeSystem} {onselect} />

{#if activeUoa && activeSystem && activeDrillRow}
	<div id="drilldown-table" class="mt-6">
		<MetricDrilldown
			uoa={activeUoa}
			systemLabel={activeSystemLabel}
			row={activeDrillRow}
			factorBlocks={activeFactorBlocks}
			{metricInfo}
			{fmt}
		/>
	</div>
{/if}
