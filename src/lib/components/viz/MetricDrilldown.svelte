<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { FLAG_BADGE_MAP, getFlagBadge } from '$lib/utils/colors';
	import DataTable from '$lib/components/ui/DataTable.svelte';
	import Card from '$lib/components/ui/Card.svelte';

	type Row = Record<string, any>;
	type FactorBlock = { factorKey: string; factorLabel: string; metricIds: string[] };
	type MetricInfo = {
		label: string;
		threshold_an: any;
		threshold_van: any;
		above_or_below: string | null;
		preference: number | null;
	} | null;

	interface Props {
		uoa: string;
		systemLabel: string;
		row: Row;
		factorBlocks: FactorBlock[];
		metricInfo: (id: string) => MetricInfo;
		fmt: (v: any) => string;
	}

	let { uoa, systemLabel, row, factorBlocks, metricInfo, fmt }: Props = $props();

	const cachedMetricInfo = $derived.by(() => {
		const allIds = factorBlocks.flatMap((b) => b.metricIds);
		const cache = new Map<string, MetricInfo>(allIds.map((id) => [id, metricInfo(id)]));
		return (id: string) => cache.get(id) ?? metricInfo(id);
	});

	// ── Filters ───────────────────────────────────────────────────────────────
	let prefFilter = new SvelteSet<number>([1, 2]);
	let flagFilter = new SvelteSet<string>(['flag', 'no_flag']);

	function togglePref(p: number) {
		if (prefFilter.has(p)) prefFilter.delete(p);
		else prefFilter.add(p);
	}

	function toggleFlag(f: string) {
		if (flagFilter.has(f)) flagFilter.delete(f);
		else flagFilter.add(f);
	}

	function flagKey(label: string | undefined): string {
		if (label === 'flag') return 'flag';
		if (label === 'no_flag') return 'no_flag';
		if (label === 'insufficient_evidence') return 'insufficient_evidence';
		return 'no_data';
	}

	function isVisible(ind: string): boolean {
		if (prefFilter.size === 0 || flagFilter.size === 0) return false;
		const info = cachedMetricInfo(ind);
		const pref = info?.preference ?? null;
		if (pref === null || !prefFilter.has(pref)) return false;
		const fk = flagKey(row[`${ind}_status`]);
		if (!flagFilter.has(fk)) return false;
		return true;
	}

	const FLAG_FILTER_OPTIONS = [
		{ key: 'flag', label: FLAG_BADGE_MAP['flag'].label, cls: FLAG_BADGE_MAP['flag'].checkboxCls },
		{
			key: 'no_flag',
			label: FLAG_BADGE_MAP['no_flag'].label,
			cls: FLAG_BADGE_MAP['no_flag'].checkboxCls
		},
		{
			key: 'no_data',
			label: FLAG_BADGE_MAP['no_data'].label,
			cls: FLAG_BADGE_MAP['no_data'].checkboxCls
		}
	];

	const totalVisible = $derived(
		factorBlocks.reduce((sum, b) => sum + b.metricIds.filter(isVisible).length, 0)
	);

	// ── Row building ──────────────────────────────────────────────────────────
	function boolSym(v: unknown): string {
		if (v === null || v === undefined) return '–';
		return v ? '✓' : '✗';
	}

	function buildRows(metricIds: string[]): Record<string, string>[] {
		return metricIds.filter(isVisible).map((ind) => {
			const info = cachedMetricInfo(ind);
			const fk = flagKey(row[`${ind}_status`]);
			return {
				metric: info?.label ?? ind,
				pref: String(info?.preference ?? '–'),
				value: fmt(row[ind]),
				an_threshold: fmt(info?.threshold_an),
				direction: info?.above_or_below ?? '–',
				within_10: boolSym(row[`${ind}_within_10perc`]),
				near_no_flag: boolSym(row[`${ind}_within_10perc_change`]),
				status: getFlagBadge(fk)?.label ?? '–'
			};
		});
	}

	// ── DataTable config (stable objects — defined once) ──────────────────────
	const dtColOptions = {
		metric: { wrap: true, extraClass: 'max-w-48' },
		pref: { extraClass: 'text-center' },
		value: { extraClass: 'text-center' },
		an_threshold: { extraClass: 'text-center' },
		direction: { extraClass: 'text-center' },
		within_10: { extraClass: 'text-center' },
		near_no_flag: { extraClass: 'text-center' },
		status: { extraClass: 'text-center' }
	};

	const dtCellBadges = {
		status: {
			[FLAG_BADGE_MAP.flag.label]: { style: FLAG_BADGE_MAP.flag.badgeStyle, class: 'border-0' },
			[FLAG_BADGE_MAP.no_flag.label]: {
				style: FLAG_BADGE_MAP.no_flag.badgeStyle,
				class: 'border-0'
			},
			[FLAG_BADGE_MAP.no_data.label]: {
				style: FLAG_BADGE_MAP.no_data.badgeStyle,
				class: 'border-0'
			}
		}
	};

	const dtRowColor = {
		status: { [FLAG_BADGE_MAP.flag.label]: { bg: 'var(--color-flag-tint)' } }
	};
</script>

<Card
	title="{uoa} — {systemLabel}"
	subtitle="All metrics for this unit of analysis and system, grouped by factor. Rows highlighted in red have crossed the acute needs threshold."
>
	<!-- Filters -->
	<div class="bg-base-200 mt-1 mb-3 flex flex-wrap items-center gap-8 rounded-lg px-4 py-3">
		<div class="flex items-center gap-3">
			<span class="text-base-content/85 text-xs font-semibold tracking-wide uppercase"
				>Preference</span
			>
			{#each [1, 2] as p (p)}
				<label class="flex cursor-pointer items-center gap-1.5">
					<input
						type="checkbox"
						class="checkbox checkbox-xs checkbox-neutral"
						checked={prefFilter.has(p)}
						onchange={() => togglePref(p)}
					/>
					<span class="text-xs">{p}</span>
				</label>
			{/each}
		</div>
		<div class="flex items-center gap-3">
			<span class="text-base-content/85 text-xs font-semibold tracking-wide uppercase">Status</span>
			{#each FLAG_FILTER_OPTIONS as opt (opt.key)}
				<label class="flex cursor-pointer items-center gap-1.5">
					<input
						type="checkbox"
						class="checkbox checkbox-xs {opt.cls}"
						checked={flagFilter.has(opt.key)}
						onchange={() => toggleFlag(opt.key)}
					/>
					<span class="text-xs">{opt.label}</span>
				</label>
			{/each}
		</div>
	</div>

	{#if totalVisible === 0}
		<p class="text-base-content/75 py-4 text-center text-sm">
			No metrics match the current filters. Try adjusting your preference or status selection, or
			change the selected UoA or system.
		</p>
	{/if}

	{#each factorBlocks as block (block.factorKey)}
		{@const dtRows = buildRows(block.metricIds)}
		{#if dtRows.length > 0}
			<div>
				<h3 class="border-base-content/20 mt-2 mb-2 border-b pb-1 text-sm font-semibold">
					{block.factorLabel}
				</h3>
				<DataTable
					rows={dtRows}
					tableClass="table-xs"
					headerRowClass="text-base-content text-xs"
					headerThClass="bg-base-200"
					colOptions={dtColOptions}
					cellBadges={dtCellBadges}
					rowColor={dtRowColor}
					humanizeHeaders
				/>
			</div>
		{/if}
	{/each}
</Card>
