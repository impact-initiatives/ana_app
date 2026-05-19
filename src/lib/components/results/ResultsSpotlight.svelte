<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { getAllMetricIds, getMetricMetadata } from '$lib/engine/metricMetadata';
	import { getFlagBadge } from '$lib/utils/colors';
	import { uoaLabel } from '$lib/stores/adminFeaturesStore.svelte';
	import Card from '$lib/components/ui/Card.svelte';

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
			return [{
				id,
				label: md.raw?.label ?? id,
				systemId: md.systemId,
				systemLabel: sysLabels.get(md.systemId) ?? md.systemId,
				evidence_type: md.evidence_type ?? null,
				threshold_van: md.raw?.thresholds?.van ?? null
			}];
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

	// ── Metric selection ──────────────────────────────────────────────────────
	let selectedMetricIds = $state<SvelteSet<string>>(new SvelteSet());

	function toggleMetric(id: string) {
		if (selectedMetricIds.has(id)) selectedMetricIds.delete(id);
		else selectedMetricIds.add(id);
	}

	function clearSystem(sysId: string) {
		for (const m of metaBySystem.get(sysId)?.metrics ?? []) selectedMetricIds.delete(m.id);
	}

	const selectedMetaList = $derived(
		[...selectedMetricIds].map((id) => allMeta.find((m) => m.id === id)).filter(Boolean) as MetricMeta[]
	);

	const metricCount = $derived(selectedMetricIds.size);
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

	function sysSelectedCount(sysId: string): number {
		return metaBySystem.get(sysId)?.metrics.filter((m) => selectedMetricIds.has(m.id)).length ?? 0;
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
			<div class="mb-1 flex items-center justify-between gap-2">
				<span class="text-sm font-medium">Select metrics</span>
				{#if metricCount > 0}
					<button
						class="btn btn-ghost btn-xs text-base-content/50"
						onclick={() => selectedMetricIds.clear()}
					>Clear all ({metricCount})</button>
				{/if}
			</div>
			{#if warnMetrics}
				<p class="text-warning mb-2 text-xs">More than 20 metrics selected — the table may be slow to render.</p>
			{/if}
			<div class="flex flex-wrap gap-2">
				{#each [...metaBySystem.entries()] as [sysId, sys] (sysId)}
					{@const selCount = sysSelectedCount(sysId)}
					<div class="dropdown dropdown-bottom">
						<button
							tabindex="0"
							class="btn btn-sm {selCount > 0 ? 'btn-primary' : 'btn-ghost border-base-300 border'}"
						>
							{sys.label}
							{#if selCount > 0}<span class="badge badge-xs ml-1">{selCount}</span>{/if}
							<svg xmlns="http://www.w3.org/2000/svg" class="ml-1 h-3 w-3 opacity-60" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
						</button>
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<div tabindex="0" class="dropdown-content bg-base-100 rounded-box z-30 mt-1 max-h-72 w-64 overflow-y-auto p-2 shadow-lg">
							<div class="mb-1 flex items-center justify-between px-1">
								<span class="text-base-content/60 text-xs font-semibold uppercase tracking-wide">{sys.label}</span>
								{#if selCount > 0}
									<button class="btn btn-ghost btn-xs text-xs" onclick={() => clearSystem(sysId)}>Clear</button>
								{/if}
							</div>
							{#each sys.metrics as m (m.id)}
								<label class="hover:bg-base-200 flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-xs">
									<input
										type="checkbox"
										class="checkbox checkbox-xs mt-0.5 shrink-0"
										checked={selectedMetricIds.has(m.id)}
										onchange={() => toggleMetric(m.id)}
									/>
									<span class="leading-snug">
										{m.label}
										<span class="text-base-content/40 ml-0.5">({m.id})</span>
									</span>
								</label>
							{/each}
						</div>
					</div>
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
			{#if selectedMetricIds.size === 0}
				<Card>
					<p class="text-base-content/60 py-8 text-center text-sm">
						Select one or more metrics above to build the cross-tab.
					</p>
				</Card>
			{:else}
				<Card
					title="Metric × UoA cross-tab"
					subtitle="{tableUoas.length} UoA{tableUoas.length !== 1 ? 's' : ''} × {metricCount} metric{metricCount !== 1 ? 's' : ''}"
				>
					<div class="overflow-x-auto">
						<table class="table table-xs w-full">
							<thead>
								<tr class="bg-base-200 text-xs">
									<th class="sticky left-0 z-10 bg-base-200 min-w-28">UoA</th>
									{#each selectedMetaList as m (m.id)}
										<th class="text-center min-w-24 max-w-32 whitespace-normal">
											<span class="block font-medium">{m.label}</span>
											<span class="text-base-content/50 block text-xs">{m.id}</span>
											<div class="mt-0.5 flex flex-wrap justify-center gap-1">
												{#if m.evidence_type}
													<span class="badge badge-ghost badge-xs">{etShort(m.evidence_type)}</span>
												{/if}
												{#if m.threshold_van != null}
													<span class="badge badge-xs" style="background-color: var(--color-priority-ho-secondary); color: var(--color-base-100)">VAN</span>
												{/if}
											</div>
										</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each tableRows as { uoa, row } (uoa)}
									<tr>
										<td class="sticky left-0 z-10 bg-base-100 text-xs font-medium">{uoaLabel(uoa)}</td>
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
													<span class="badge badge-xs border-0" style={badge.badgeStyle}>{badge.label}</span>
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
