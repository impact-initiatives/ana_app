<script lang="ts">
	import { getAllMetricIds, getMetricMetadata } from '$lib/engine/metricMetadata';
	import { SYSTEM_DISPLAY_ORDER, EvidenceTypeEnum } from '$lib/types/structure';
	import { getFlagBadge } from '$lib/utils/colors';
	import { uoaLabel } from '$lib/stores/adminFeaturesStore.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Select, { type SelectGroup } from '$lib/components/ui/Select.svelte';
	import DataTable from '$lib/components/ui/DataTable.svelte';

	type Row = Record<string, any>;
	interface MetricMeta {
		id: string;
		label: string;
		systemId: string;
		systemLabel: string;
		evidence_type: string | null;
		threshold_van: number | null;
		above_or_below: string | null;
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
					threshold_van: md.raw?.thresholds?.van ?? null,
					above_or_below: md.raw?.above_or_below ?? null
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
	const tooManyUoasNumber = 10;
	const tooManyUoas = $derived(allUoas.length > tooManyUoasNumber);
	const noUoas = $derived(allUoas.length === 0);
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

	const ET_ORDER = Object.values(EvidenceTypeEnum);

	// Per-system helpers for individual Select components
	function systemOptions(sysId: string): SelectGroup[] {
		const metrics = metaBySystem.get(sysId)?.metrics ?? [];
		const groups = new Map<string, { value: string; label: string }[]>();
		for (const m of metrics) {
			const key = m.evidence_type ?? 'Other';
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push({ value: m.id, label: `${m.id} – ${m.label}` });
		}
		return [...groups.entries()]
			.sort(([a], [b]) => {
				const ai = ET_ORDER.indexOf(a as EvidenceTypeEnum);
				const bi = ET_ORDER.indexOf(b as EvidenceTypeEnum);
				return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
			})
			.map(([group, options]) => ({
				group,
				options: options.sort((a, b) =>
					a.value.localeCompare(b.value, undefined, { numeric: true })
				)
			}));
	}

	function systemFlatOptions(sysId: string) {
		return systemOptions(sysId).flatMap((g) => g.options);
	}

	function systemSelected(sysId: string): string[] | null {
		const flat = systemFlatOptions(sysId);
		const sel = selectedMetricIds.filter((id) => flat.some((o) => o.value === id));
		return sel.length === flat.length ? null : sel;
	}

	function onSystemChange(sysId: string, v: string | string[]) {
		const arr = Array.isArray(v) ? v : [v];
		const flat = systemFlatOptions(sysId);
		const otherIds = selectedMetricIds.filter((id) => !flat.some((o) => o.value === id));
		selectedMetricIds = [...otherIds, ...arr];
	}

	const selectedMetaList = $derived(
		selectedMetricIds.map((id) => allMeta.find((m) => m.id === id)).filter(Boolean) as MetricMeta[]
	);

	const metricCount = $derived(selectedMetricIds.length);
	const warnMetrics = $derived(metricCount > 20);

	// ── Cross-tab lookups ─────────────────────────────────────────────────────
	const metaById = $derived(new Map(selectedMetaList.map((m) => [m.id, m])));
	const rowByUoa = $derived(
		new Map(tableUoas.map((uoa) => [uoa, filteredRows.find((r) => String(r.uoa) === uoa)]))
	);
	const uoaByLabel = $derived(new Map(tableUoas.map((uoa) => [uoaLabel(uoa), uoa])));

	const dtColOptions = $derived.by(() => {
		const opts: Record<string, { wrap?: boolean; extraClass?: string }> = {
			Metric: { wrap: true, extraClass: 'min-w-48 text-xs' }
		};
		for (const uoa of tableUoas) {
			opts[uoaLabel(uoa)] = { wrap: true, extraClass: 'text-center min-w-20 max-w-28 text-xs' };
		}
		return opts;
	});

	const dtRows = $derived.by(() =>
		[...selectedMetaList]
			.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
			.map((m) => {
				const obj: Record<string, string> = { Metric: m.id };
				for (const uoa of tableUoas) {
					const row = rowByUoa.get(uoa);
					obj[uoaLabel(uoa)] = row ? fmt(row[m.id]) : '–';
				}
				return obj;
			})
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
			<p class="text-base-content/85 py-6 text-center">
				<span class="font-semibold">{allUoas.length} UoAs</span> are currently selected — the
				Spotlight table works best with {tooManyUoasNumber} or fewer. Use the filters to narrow down your
				selection.
			</p>
		</Card>
	{:else if noUoas}
		<Card>
			<p class="text-base-content/85 py-6 text-center">
				No UoAs match the current filters. Adjust your filters to see data in the Spotlight.
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
						class="w-50"
						dropdownClass="w-64"
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
					<DataTable
						rows={dtRows}
						tableClass="table-xs"
						headerRowClass="bg-base-200 text-xs"
						headerThClass="bg-base-200"
						overflow="scroll"
						scrollHeight="480px"
						humanizeHeaders={false}
						colOptions={dtColOptions}
						stickyFirstColumn={true}
						sortable={false}
					>
						{#snippet renderCell({ col, value, rowObj })}
							{#if col === 'Metric'}
								{@const m = metaById.get(rowObj['Metric'] ?? '')}
								{#if m}
									<span class="block text-xs font-medium">{m.label}</span>
									<span class="text-base-content/50 block text-[10px]">{m.id}</span>
									<div class="mt-0.5 flex flex-wrap gap-1">
										{#if m.evidence_type}
											<span class="badge badge-ghost badge-xs">{etShort(m.evidence_type)}</span>
										{/if}
									</div>
								{/if}
							{:else}
								{@const uoa = uoaByLabel.get(col)}
								{@const row = uoa ? rowByUoa.get(uoa) : undefined}
								{@const metricId = rowObj['Metric'] ?? ''}
								{@const m = metaById.get(metricId)}
								{@const fk = cellFlagKey(row, metricId)}
								{@const badge = getFlagBadge(fk)}
								{@const vanFlagged = row?.[`${metricId}_van_flag`] === true}
								{@const nearAn = row?.[`${metricId}_within_10perc_change`] === true}
								{@const nearVan = (() => {
									if (!row || !m || m.threshold_van === null || m.threshold_van === undefined)
										return false;
									if (vanFlagged) return false;
									const rawVal = row[metricId];
									if (rawVal == null || typeof rawVal !== 'number') return false;
									const van = m.threshold_van;
									if (van === 0) return rawVal === 0;
									return Math.abs((rawVal - van) / van) <= 0.1;
								})()}
								<span class="block text-center text-xs">{value}</span>
								<div class="flex flex-wrap justify-center gap-0.5">
									{#if badge}
										<span class="badge badge-xs border-0" style={badge.badgeStyle}
											>{badge.label}</span
										>
									{/if}
									{#if vanFlagged}
										<span
											class="badge badge-xs border-0"
											style="background-color: var(--color-priority-ho-secondary); color: var(--color-base-100)"
											>VAN</span
										>
									{:else if nearVan}
										<span
											class="badge badge-xs"
											style="border-color: var(--color-priority-ho-secondary); color: var(--color-priority-ho-secondary)"
											>~VAN</span
										>
									{/if}
									{#if nearAn}
										<span class="badge badge-xs badge-outline badge-warning">~AN</span>
									{/if}
								</div>
							{/if}
						{/snippet}
					</DataTable>
				</Card>
			{/if}
		</div>
	{/if}
</section>
