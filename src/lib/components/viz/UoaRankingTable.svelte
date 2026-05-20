<script lang="ts">
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import PriorityBadge from '$lib/components/ui/PriorityBadge.svelte';
	import DataTable from '$lib/components/ui/DataTable.svelte';
	import { PRIORITY_ORDER, ACUTE_PRIORITY_FLAGS, type PriorityFlag } from '$lib/types/flags';
	import Card from '$lib/components/ui/Card.svelte';
	import { uoaLabel } from '$lib/stores/adminFeaturesStore.svelte';

	type Row = Record<string, unknown>;

	interface Props {
		rows: Row[];
		systems: { id: string; label: string }[];
		systemCodes: Map<string, string[]>;
		/** Called when a row is clicked — filter by the row's prelim key. */
		onprelimclick?: (key: string | null) => void;
	}

	let { rows, systems, systemCodes, onprelimclick }: Props = $props();

	const ACUTE_FLAGS = ACUTE_PRIORITY_FLAGS;

	interface RankedRow {
		uoa: string;
		priority_flag: string;
		flaggedSystems: number;
		flaggedIndicators: number;
		within10: number;
	}

	const PRELIM_ORDER = PRIORITY_ORDER;

	// Single pass: compute ranked rows + summary + sorted table in one $derived.
	const processed = $derived.by(() => {
		let total = 0, flagged = 0, totalFlags = 0, totalWithin10 = 0;
		const ranked: RankedRow[] = rows.map((row) => {
			const uoa = String(row.uoa ?? '');
			const priority_flag = String(row.priority_flag ?? '');
			let flaggedSystems = 0, flaggedIndicators = 0, within10 = 0;
			for (const sys of systems) {
				const codes = systemCodes.get(sys.id) ?? [];
				let sysFlagged = false;
				for (const c of codes) {
					if (row[`${c}_flag`] === true) { flaggedIndicators++; sysFlagged = true; }
					if (row[`${c}_flag`] !== true && row[`${c}_within_10perc`] === true) within10++;
				}
				if (sysFlagged) flaggedSystems++;
			}
			total++;
			if (ACUTE_FLAGS.has(priority_flag as PriorityFlag)) flagged++;
			totalFlags += flaggedIndicators;
			totalWithin10 += within10;
			return { uoa, priority_flag, flaggedSystems, flaggedIndicators, within10 };
		});

		const sorted = [...ranked].sort((a, b) => {
			const po = (PRELIM_ORDER[a.priority_flag as PriorityFlag] ?? 99) - (PRELIM_ORDER[b.priority_flag as PriorityFlag] ?? 99);
			if (po !== 0) return po;
			const sd = b.flaggedSystems - a.flaggedSystems;
			if (sd !== 0) return sd;
			const id = b.flaggedIndicators - a.flaggedIndicators;
			if (id !== 0) return id;
			return b.within10 - a.within10;
		});

		return {
			summary: { total, flagged, totalFlags, totalWithin10 },
			tableRows: sorted.map((r) => ({
				UoA: r.uoa, Flag: r.priority_flag, Systems: r.flaggedSystems, Metrics: r.flaggedIndicators, Near: r.within10
			})),
			rankedByUoa: new Map(ranked.map((r) => [r.uoa, r]))
		};
	});

	const summary = $derived(processed.summary);
	const tableRows = $derived(processed.tableRows);
	const rankedByUoa = $derived(processed.rankedByUoa);

	const tweenedSummary = Tween.of(() => summary, { duration: 600, easing: cubicOut });

	function handleRowClick(cells: Record<string, string>) {
		const r = rankedByUoa.get(cells['UoA'] ?? '');
		onprelimclick?.(r?.priority_flag ?? null);
	}
</script>

<Card title="UoAs ranked by priority flag" subtitle="Click a row to filter by priority flag.">
	{#if rows.length === 0}
		<span class="text-base-content/70 py-8 text-center text-sm"
			>No data matches current filters.</span
		>
	{:else}
		<!-- Summary stats -->
		<div class="flex flex-wrap gap-3">
			<span class="badge badge-soft badge-primary">
				<strong class="tabular-nums">{Math.round(tweenedSummary.current.total)}</strong>
				<span>UoA(s)</span>
			</span>
			<span class="badge badge-soft badge-error">
				<strong class="tabular-nums">{Math.round(tweenedSummary.current.flagged)}</strong>
				<span>acute flags</span>
			</span>
			<span
				class="badge badge-soft"
				style="background-color: var(--color-flag-tint); color: var(--color-base-content)"
			>
				<strong class="tabular-nums">{Math.round(tweenedSummary.current.totalFlags)}</strong>
				<span> flags</span>
			</span>
			<span class="badge badge-soft badge-warning">
				<strong class="tabular-nums">{Math.round(tweenedSummary.current.totalWithin10)}</strong>
				<span>near threshold</span>
			</span>
		</div>
		<p class="text-base-content/85 mt-1 mb-1 text-sm">
			Within each priority flag category, UoAs are ranked by number of systems with flags, number
			of metrics with flags, and then number of metrics near threshold.
		</p>

		<DataTable
			rows={tableRows}
			tableClass="table-xs"
			headerRowClass="bg-base-200 text-base-content text-xs"
			overflow="scroll"
			scrollHeight="24rem"
			booleanToStr={false}
			colOptions={{
				UoA: { extraClass: 'text-center' },
				Flag: { extraClass: 'text-center' },
				Systems: { extraClass: 'text-center' },
				Indicators: { extraClass: 'text-center' },
				Near: { extraClass: 'text-center' }
			}}
			onrowclick={handleRowClick}
		>
			{#snippet renderCell({ col, value })}
				{#if col === 'Flag'}
					<PriorityBadge {value} />
				{:else if col === 'Systems'}
					<span class={Number(value) > 0 ? 'font-semibold' : 'text-base-content/85'}>
						{value}
					</span>
					<span class="text-base-content/85 text-xs"> / {systems.length}</span>
				{:else if col === 'Indicators'}
					<span class={Number(value) > 0 ? 'font-semibold' : 'text-base-content/65'}>{value}</span>
				{:else if col === 'Near'}
					{#if Number(value) > 0}
						<span class="badge badge-warning badge-sm">~{value}</span>
					{:else}
						<span class="text-base-content/65">–</span>
					{/if}
				{:else}
					{uoaLabel(value)}
				{/if}
			{/snippet}
		</DataTable>
	{/if}
</Card>
