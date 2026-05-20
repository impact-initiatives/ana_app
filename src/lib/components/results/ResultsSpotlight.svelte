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
		threshold_an: number | null;
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
					threshold_an: md.raw?.thresholds?.an ?? null,
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
			Metric: { wrap: true, extraClass: 'min-w-65 max-w-80 text-xs' }
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
</script>

<section>
	<h1 class="border-primary mb-8 border-l-6 pl-3 text-2xl font-semibold tracking-widest uppercase">
		Spotlight
	</h1>

	<!-- ── How to read + Metric selectors ── -->
	<div class="mb-4 grid grid-cols-1 gap-6 lg:grid-cols-5">
		<!-- How to read (left) -->
		<div
			class="card border-base-300 bg-base-200/60 space-y-6 rounded-xl border p-4 shadow-lg lg:col-span-2"
		>
			<p class="text-base-content/85 text-xs font-semibold tracking-widest uppercase">
				How to read
			</p>
			<div class="flex items-start gap-3 text-sm">
				<span
					class="bg-primary/15 text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
					>1</span
				>
				<p class="text-base-content/80">
					<strong class="text-base-content font-semibold">Rows = metrics, columns = UoAs.</strong>
					Each cell shows the metric value for that area. Use the dropdowns to pick which metrics appear.
				</p>
			</div>
			<div class="flex items-start gap-3 text-sm">
				<span
					class="bg-primary/15 text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
					>2</span
				>
				<p class="text-base-content/80">
					<strong class="text-base-content font-semibold">Flag badge</strong> — shows whether the Acute
					Needs (AN) threshold was crossed for that metric × area combination.
				</p>
			</div>
			<div class="flex items-start gap-3 text-sm">
				<span
					class="bg-primary/15 text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
					>3</span
				>
				<p class="text-base-content/80">
					<strong class="text-base-content font-semibold">VAN badge</strong> — a purple badge
					alongside the flag means the <em>Very Acute Needs</em> threshold was also crossed, indicating
					a higher severity level than AN alone.
				</p>
			</div>
		</div>

		<!-- Metric selectors (right) -->
		<div class="lg:col-span-3">
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
				{#if tooManyUoas}
					<p class="text-warning mt-2 text-xs">
						{allUoas.length} UoAs selected — showing first {tooManyUoasNumber}. Narrow filters to
						see more.
					</p>
				{:else if noUoas}
					<p class="text-base-content/50 mt-2 text-xs">No UoAs match the current filters.</p>
				{:else}
					<p class="text-base-content/75 mt-2 text-xs">
						Showing {tableUoas.length} UoA{tableUoas.length !== 1 ? 's' : ''} from current filters.
					</p>
				{/if}
			</Card>
		</div>
		<!-- /lg:col-span-3 -->
	</div>
	<!-- /grid -->

	<!-- ── Cross-tab table ── -->
	<div class="mt-4">
		{#if tooManyUoas}
			<Card>
				<p class="text-base-content/85 py-6 text-center">
					<span class="font-semibold">{allUoas.length} UoAs</span> are currently selected — the
					Spotlight table works best with {tooManyUoasNumber} or fewer. Use the filters to narrow down
					your selection.
				</p>
			</Card>
		{:else if noUoas}
			<Card>
				<p class="text-base-content/85 py-6 text-center">
					No UoAs match the current filters. Adjust your filters to see data in the Spotlight.
				</p>
			</Card>
		{:else if selectedMetricIds.length === 0}
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
					headerRowClass="bg-base-200 text-xs text-base-content/85"
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
								<span class="text-xs font-medium">{m.label}</span>
								<div class="mt-1 flex flex-wrap items-center gap-1">
									<span class="badge badge-outline badge-xs font-medium">{m.id}</span>
									{#if m.evidence_type}
										<span class="badge badge-outline badge-xs font-medium">{m.evidence_type}</span>
									{/if}
									{#if m.threshold_an !== null}
										<span
											class="badge badge-xs"
											style="border-color: var(--color-flag); color: var(--color-flag)"
											>AN {fmt(m.threshold_an)}</span
										>
									{/if}
									{#if m.threshold_van !== null}
										<span
											class="badge badge-xs"
											style="border-color: var(--color-priority-ho-secondary); color: var(--color-priority-ho-secondary)"
											>VAN {fmt(m.threshold_van)}</span
										>
									{/if}
								</div>
							{/if}
						{:else}
							{@const uoa = uoaByLabel.get(col)}
							{@const row = uoa ? rowByUoa.get(uoa) : undefined}
							{@const metricId = rowObj['Metric'] ?? ''}
							{@const badge = getFlagBadge(String(row?.[`${metricId}_status`] ?? 'no_data'))}
							{@const vanFlagged = row?.[`${metricId}_van_flag`] === true}
							<span class="block text-center text-xs">{value}</span>
							<div class="flex flex-wrap justify-center gap-0.5">
								{#if badge}
									<span class="badge badge-xs border-0" style={badge.badgeStyle}>{badge.label}</span
									>
								{/if}
								{#if vanFlagged}
									<span
										class="badge badge-xs border-0"
										style="background-color: var(--color-priority-ho-secondary); color: var(--color-base-100)"
										>VAN</span
									>
								{/if}
							</div>
						{/if}
					{/snippet}
				</DataTable>
			</Card>
		{/if}
	</div>
</section>
