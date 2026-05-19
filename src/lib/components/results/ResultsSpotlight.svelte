<script lang="ts">
	import { getAllMetricIds, getMetricMetadata } from '$lib/engine/metricMetadata';
	import { SYSTEM_DISPLAY_ORDER } from '$lib/types/structure';
	import { getFlagBadge } from '$lib/utils/colors';
	import { uoaLabel } from '$lib/stores/adminFeaturesStore.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Select from '$lib/components/ui/Select.svelte';

	type Row = Record<string, any>;
	interface MetricMeta {
		id: string;
		label: string;
		systemId: string;
		systemLabel: string;
		evidence_type: string | null;
		threshold_van: number | null;
	}

	interface Props {
		filteredRows: Row[];
		referenceJson: unknown;
	}

	let { filteredRows, referenceJson }: Props = $props();

	function fmt(v: any): string {
		if (v === null || v === undefined) return '–';
		if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
		return String(v);
	}

	// ── Available metrics ─────────────────────────────────────────────────────
	const allMeta = $derived.by((): MetricMeta[] => {
		const ids = getAllMetricIds(referenceJson);
		const j = referenceJson as any;
		const sysLabels = new Map<string, string>();
		for (const s of j?.systems ?? []) sysLabels.set(s.id, s.label ?? s.id);
		return ids.flatMap((id) => {
			const md = getMetricMetadata(referenceJson, id);
			if (!md) return [];
			return [
				{
					id,
					label: md.raw?.label ?? id,
					systemId: md.systemId,
					systemLabel: sysLabels.get(md.systemId) ?? md.systemId,
					evidence_type: md.evidence_type ?? null,
					threshold_van: md.raw?.thresholds?.van ?? null
				}
			];
		});
	});

	// Group by system for per-system dropdowns
	const metaBySystem = $derived.by(() => {
		const map = new Map<string, { label: string; metrics: MetricMeta[] }>();
		for (const m of allMeta) {
			if (!map.has(m.systemId)) map.set(m.systemId, { label: m.systemLabel, metrics: [] });
			map.get(m.systemId)!.metrics.push(m);
		}
		return map;
	});

	// ── UoAs — derived from filtered rows, cap at 10 ─────────────────────────
	const allUoas = $derived([...new Set(filteredRows.map((r) => String(r.uoa ?? '')))].sort());
	const tooManyUoas = $derived(allUoas.length > 10);
	const tableUoas = $derived(allUoas.slice(0, 10));

	// ── Metric selection — default to Health Outcomes metrics ─────────────────
	function hoMetricIds(): string[] {
		return (
			(referenceJson as any)?.systems
				?.find((s: any) => s.id === 'health_outcomes')
				?.factors?.flatMap(
					(f: any) =>
						f.sub_factors?.flatMap(
							(sf: any) =>
								sf.indicators?.flatMap((ind: any) =>
									(ind.metrics ?? [])
										.filter((m: any) => m.preference !== 3)
										.map((m: any) => m.metric)
								) ?? []
						) ?? []
				) ?? []
		);
	}

	let selectedMetricIds = $state<string[]>(hoMetricIds());

	// Per-system helpers for individual Select components
	function systemOptions(sysId: string) {
		return (
			metaBySystem
				.get(sysId)
				?.metrics.map((m) => ({ value: m.id, label: `${m.label} (${m.id})` })) ?? []
		);
	}

	function systemSelected(sysId: string): string[] | null {
		const opts = systemOptions(sysId);
		const sel = selectedMetricIds.filter((id) => opts.some((o) => o.value === id));
		return sel.length === opts.length ? null : sel;
	}

	function onSystemChange(sysId: string, v: string | string[]) {
		const arr = Array.isArray(v) ? v : [v];
		const otherIds = selectedMetricIds.filter(
			(id) => !systemOptions(sysId).some((o) => o.value === id)
		);
		selectedMetricIds = [...otherIds, ...arr];
	}

	const selectedMetaList = $derived(
		selectedMetricIds.map((id) => allMeta.find((m) => m.id === id)).filter(Boolean) as MetricMeta[]
	);

	const metricCount = $derived(selectedMetricIds.length);
	const warnMetrics = $derived(metricCount > 20);

	// ── Cross-tab rows ────────────────────────────────────────────────────────
	const tableRows = $derived(
		tableUoas.map((uoa) => ({
			uoa,
			row: filteredRows.find((r) => String(r.uoa) === uoa)
		}))
	);

	function cellFlagKey(row: Row | undefined, id: string): string {
		if (!row) return 'no_data';
		const s = row[`${id}_status`];
		if (s === 'flag') return 'flag';
		if (s === 'no_flag') return 'no_flag';
		if (s === 'insufficient_evidence') return 'insufficient_evidence';
		return 'no_data';
	}

	function etShort(et: string | null): string {
		if (!et) return '';
		if (et === 'Supporting evidence') return 'Supp.';
		if (et === 'AN signal') return 'AN';
		if (et === 'Outcome') return 'Out.';
		if (et === 'Predictor') return 'Pred.';
		return et.slice(0, 4);
	}
</script>

<section>
	<h1 class="border-primary mb-8 border-l-6 pl-3 text-2xl font-semibold tracking-widest uppercase">
		Spotlight
	</h1>

	{#if tooManyUoas}
		<Card>
			<p class="text-base-content/70 py-6 text-center text-sm">
				<span class="font-semibold">{allUoas.length} UoAs</span> are currently selected — the Spotlight
				table works best with 10 or fewer. Use the filters to narrow down your selection.
			</p>
		</Card>
	{:else}
		<!-- ── Metric selectors ── -->
		<Card>
			{#if warnMetrics}
				<p class="text-info text-xs">
					More than 20 metrics selected — are you sure you want to display all of those columns?
				</p>
				<p class="text-info text-xs">
					Consider narrowing down your selection for better readability and performance.
				</p>
			{/if}
			<div class="flex flex-wrap items-end gap-2">
				{#each [...metaBySystem.entries()].sort(([a], [b]) => SYSTEM_DISPLAY_ORDER.indexOf(a as any) - SYSTEM_DISPLAY_ORDER.indexOf(b as any)) as [sysId, sys] (sysId)}
					<Select
						class="w-44"
						dropdownClass="w-72"
						label={sys.label}
						placeholder="None"
						options={systemOptions(sysId)}
						selected={systemSelected(sysId)}
						multiple={true}
						unitLabel="Metrics"
						displayMode="compact"
						onchange={(v) => onSystemChange(sysId, v)}
					/>
				{/each}
			</div>
			{#if allUoas.length === 0}
				<p class="text-base-content/50 mt-2 text-xs">No data loaded.</p>
			{:else}
				<p class="text-base-content/50 mt-2 text-xs">
					Showing {tableUoas.length} UoA{tableUoas.length !== 1 ? 's' : ''} from current filters.
				</p>
			{/if}
		</Card>

		<!-- ── Cross-tab table ── -->
		<div class="mt-4">
			{#if selectedMetricIds.length === 0}
				<Card>
					<p class="text-base-content/60 py-8 text-center text-sm">
						Select one or more metrics above to build the cross-tab.
					</p>
				</Card>
			{:else}
				<Card
					title="Metric × UoA cross-tab"
					subtitle="{tableUoas.length} UoA{tableUoas.length !== 1
						? 's'
						: ''} × {metricCount} metric{metricCount !== 1 ? 's' : ''}"
				>
					<div class="overflow-x-auto">
						<table class="table-xs table w-full">
							<thead>
								<tr class="bg-base-200 text-xs">
									<th class="bg-base-200 sticky left-0 z-10 min-w-28">UoA</th>
									{#each selectedMetaList as m (m.id)}
										<th class="max-w-32 min-w-24 text-center whitespace-normal">
											<span class="block font-medium">{m.label}</span>
											<span class="text-base-content/50 block text-xs">{m.id}</span>
											<div class="mt-0.5 flex flex-wrap justify-center gap-1">
												{#if m.evidence_type}
													<span class="badge badge-ghost badge-xs">{etShort(m.evidence_type)}</span>
												{/if}
												{#if m.threshold_van != null}
													<span
														class="badge badge-xs"
														style="background-color: var(--color-priority-ho-secondary); color: var(--color-base-100)"
														>VAN</span
													>
												{/if}
											</div>
										</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each tableRows as { uoa, row } (uoa)}
									<tr>
										<td class="bg-base-100 sticky left-0 z-10 text-xs font-medium"
											>{uoaLabel(uoa)}</td
										>
										{#each selectedMetaList as m (m.id)}
											{@const fk = cellFlagKey(row, m.id)}
											{@const badge = getFlagBadge(fk)}
											{@const val = row ? fmt(row[m.id]) : '–'}
											<td
												class="text-center text-xs"
												style={fk === 'flag' ? 'background-color: var(--color-flag-tint)' : ''}
											>
												<span class="block">{val}</span>
												{#if badge}
													<span class="badge badge-xs border-0" style={badge.badgeStyle}
														>{badge.label}</span
													>
												{/if}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</Card>
			{/if}
		</div>
	{/if}
</section>
