<script lang="ts">
	import { tileCssClass, tileStyle, getPriorityBadge } from '$lib/utils/colors';
	import { PRIORITY_FLAG_KEYS, PRIORITY_ORDER } from '$lib/types/flags';
	import { uoaLabel } from '$lib/stores/adminFeaturesStore.svelte';
	import SortIcon from '$lib/components/ui/SortIcon.svelte';
	import TooltipCard from '$lib/components/ui/TooltipCard.svelte';
	import PrelimBadge from '$lib/components/ui/PrelimBadge.svelte';
	import LegendBadge from '$lib/components/ui/LegendBadge.svelte';
	import Card from '$lib/components/ui/Card.svelte';

	type Row = Record<string, any>;
	type System = { id: string; label: string };

	interface Props {
		rows: Row[];
		systems: System[];
		systemCodes: Map<string, string[]>;
		activeUoa?: string | null;
		activeSystem?: string | null;
		onselect?: (uoa: string, systemId: string) => void;
	}

	let {
		rows,
		systems,
		systemCodes,
		activeUoa = null,
		activeSystem = null,
		onselect
	}: Props = $props();

	type CellStats = { avail: number; missing: number; flag_n: number; within10: number };
	const EMPTY_STATS: CellStats = { avail: 0, missing: 0, flag_n: 0, within10: 0 };

	// Precomputed per (uoa × system) so the template does a O(1) Map lookup instead of iterating codes each render.
	const cellStatsMap = $derived.by(() => {
		const map = new Map<string, CellStats>();
		for (const row of rows) {
			for (const sys of systems) {
				const codes = systemCodes.get(sys.id) ?? [];
				let avail = 0,
					missing = 0,
					flag_n = 0,
					within10 = 0;
				for (const c of codes) {
					const v = row[c];
					if (v === null || v === undefined) missing++;
					else avail++;
					if (row[`${c}_flag`] === true) flag_n++;
					else if (row[`${c}_within_10perc`] === true) within10++;
				}
				map.set(`${String(row.uoa)}:${sys.id}`, { avail, missing, flag_n, within10 });
			}
		}
		return map;
	});

	// ── Tooltip ───────────────────────────────────────────────────────────────
	let tooltipVisible = $state(false);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
	let tooltipAvail = $state(0);
	let tooltipMissing = $state(0);
	let tooltipWithin10 = $state(0);
	let tooltipSystem = $state('');

	function showTooltip(
		e: MouseEvent,
		avail: number,
		missing: number,
		within10: number,
		sysLabel: string
	) {
		tooltipAvail = avail;
		tooltipMissing = missing;
		tooltipWithin10 = within10;
		tooltipSystem = sysLabel;
		tooltipX = e.clientX;
		tooltipY = e.clientY;
		tooltipVisible = true;
	}

	function moveTooltip(e: MouseEvent) {
		tooltipX = e.clientX;
		tooltipY = e.clientY;
	}

	function hideTooltip() {
		tooltipVisible = false;
	}

	// ── Sort ─────────────────────────────────────────────────────────────────
	let sortKey = $state<string | null>(null);
	let sortAsc = $state(true);

	function toggleSort(key: string) {
		if (sortKey === key) {
			sortAsc = !sortAsc;
		} else {
			sortKey = key;
			sortAsc = true;
		}
	}

	const PRELIM_ORDER = PRIORITY_ORDER;

	const sortedRows = $derived.by(() => {
		if (sortKey === null) return rows;
		return [...rows].sort((a, b) => {
			let cmp = 0;
			if (sortKey === 'uoa') {
				cmp = String(a.uoa).localeCompare(String(b.uoa));
			} else if (sortKey === 'prelim') {
				const ao = (PRELIM_ORDER as Record<string, number>)[String(a.priority_flag)] ?? 99;
				const bo = (PRELIM_ORDER as Record<string, number>)[String(b.priority_flag)] ?? 99;
				cmp = ao - bo;
			} else {
				const codes = systemCodes.get(sortKey!) ?? [];
				const flagCount = (row: Row) => codes.filter((c) => row[`${c}_flag`] === true).length;
				cmp = flagCount(a) - flagCount(b);
			}
			return sortAsc ? cmp : -cmp;
		});
	});
</script>

<!-- HTML tooltip (fixed, follows mouse) -->
{#if tooltipVisible}
	<TooltipCard
		title={tooltipSystem}
		x={tooltipX}
		y={tooltipY}
		swatches={[
			{ color: 'var(--color-primary)', label: `Available: ${tooltipAvail}` },
			{ color: 'var(--color-neutral)', label: `Missing: ${tooltipMissing}` },
			...(tooltipWithin10 > 0
				? [{ color: 'var(--color-within10)', label: `Near threshold: ${tooltipWithin10}` }]
				: [])
		]}
	/>
{/if}

<Card
	title="System-level flag counts per UoA"
	subtitle="Each cell shows the number of metrics with flag. Hover for details, click to drill down, scroll to view hidden rows."
>
	<div class="border-base-content/20 bg-base-100 max-h-124 overflow-auto rounded border">
		<table class="table-xs table">
			<colgroup>
				<col class="w-36" />
				{#each systems as _sys (_sys.id)}
					<col class="w-24" />
				{/each}
				<col class="w-28" />
			</colgroup>
			<thead>
				<tr class="bg-base-200 text-base-content sticky top-0 z-10 text-xs">
					<th class="select-none">
						<button
							class="hover:text-base-content/70 flex items-center gap-1 font-semibold"
							onclick={() => toggleSort('uoa')}
							aria-label="Sort by UoA"
						>
							UoA
							<SortIcon active={sortKey === 'uoa'} asc={sortAsc} />
						</button>
					</th>
					{#each systems as sys (sys.id)}
						<th class="text-center leading-tight whitespace-normal select-none">
							<button
								class="hover:text-base-content/70 flex w-full items-center justify-center gap-1 leading-tight font-semibold whitespace-normal"
								onclick={() => toggleSort(sys.id)}
								aria-label="Sort by {sys.label}"
							>
								{sys.label}
								<SortIcon active={sortKey === sys.id} asc={sortAsc} />
							</button>
						</th>
					{/each}
					<th class="text-center leading-tight whitespace-normal select-none">
						<button
							class="hover:text-base-content/70 flex items-center gap-1 font-semibold"
							onclick={() => toggleSort('prelim')}
							aria-label="Sort by priority flag"
						>
							Priority Flag
							<SortIcon active={sortKey === 'prelim'} asc={sortAsc} />
						</button>
					</th>
				</tr>
			</thead>
			<tbody>
				{#each sortedRows as row (row.uoa)}
					<tr class="text-xs">
						<td class="py-0.5 whitespace-nowrap">{uoaLabel(row.uoa)}</td>
						{#each systems as sys (sys.id)}
							{@const s = cellStatsMap.get(`${String(row.uoa)}:${sys.id}`) ?? EMPTY_STATS}
							{@const active = activeUoa === String(row.uoa) && activeSystem === sys.id}
							<td class="p-0.5 text-center">
								<button
									class="relative w-18 rounded px-1 py-0.5 text-xs transition-all {tileCssClass(
										s.flag_n,
										s.avail,
										active
									)}"
									style={tileStyle(s.flag_n, s.avail)}
									onmouseenter={(e) => showTooltip(e, s.avail, s.missing, s.within10, sys.label)}
									onmousemove={moveTooltip}
									onmouseleave={hideTooltip}
									onclick={() => {
										hideTooltip();
										onselect?.(String(row.uoa), sys.id);
									}}
									aria-label="{s.flag_n} metric{s.flag_n !== 1
										? 's'
										: ''} with flag for {sys.label}"
								>
									{s.avail === 0 ? '–' : s.flag_n}
									{#if s.within10 > 0}
										<span
											class="badge badge-warning badge-xs absolute -top-1 -right-1 min-w-4"
											title="{s.within10} metric{s.within10 !== 1 ? 's' : ''} near threshold"
											>~{s.within10}</span
										>
									{/if}
								</button>
							</td>
						{/each}
						<td class="p-0.5 text-center whitespace-nowrap">
							{#if getPriorityBadge(row.priority_flag)}
								<PrelimBadge value={row.priority_flag} />
							{:else}
								<span class="text-base-content/40 text-xs">–</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Legend -->
	<LegendBadge
		priorityKeys={PRIORITY_FLAG_KEYS}
	></LegendBadge>
</Card>
