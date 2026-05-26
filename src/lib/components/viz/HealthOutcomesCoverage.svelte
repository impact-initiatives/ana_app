<script lang="ts">
	import { getMetricMetadata } from '$lib/engine/metricMetadata';
	import Card from '$lib/components/ui/Card.svelte';
	import { FLAG_BADGE_MAP } from '$lib/utils/colors';

	type Row = Record<string, any>;

	interface MetricStat {
		id: string;
		label: string;
		evidence_type: string;
		anFlagged: number;
		vanFlagged: number;
		noFlag: number;
		missing: number;
		total: number;
	}

	interface Props {
		rows: Row[];
		hoMetricIds: string[];
		referenceJson: unknown;
		mode: 'overall' | 'per-uoa';
		selectedUoa: string | null;
	}

	let { rows, hoMetricIds, referenceJson, mode, selectedUoa }: Props = $props();

	const activeRows = $derived(
		mode === 'per-uoa' && selectedUoa !== null
			? rows.filter((r) => String(r.uoa) === selectedUoa)
			: rows
	);

	const stats = $derived.by((): MetricStat[] => {
		return hoMetricIds.map((id) => {
			const md = getMetricMetadata(referenceJson, id);
			let anFlagged = 0, vanFlagged = 0, noFlag = 0, missing = 0;
			for (const row of activeRows) {
				const flag = row[`${id}_flag`];
				const vanFlag = row[`${id}_van_flag`];
				if (flag === null || flag === undefined) { missing++; continue; }
				if (flag === true) anFlagged++;
				else if (vanFlag === true) vanFlagged++;
				else noFlag++;
			}
			return {
				id,
				label: md?.label ?? id,
				evidence_type: md?.evidence_type ?? '–',
				anFlagged,
				vanFlagged,
				noFlag,
				missing,
				total: activeRows.length
			};
		});
	});

	// HO proportion rule thresholds for visual guide
	const totalUoas = $derived(activeRows.length);
	// n>5 → ≥2/3; 1≤n≤5 → ≥1/2
	const proportionThreshold = $derived(totalUoas > 5 ? 2 / 3 : 0.5);

	function pct(n: number, of: number): number {
		return of === 0 ? 0 : Math.round((n / of) * 100);
	}

	const AN_STYLE = FLAG_BADGE_MAP.flag.badgeStyle;
	const NO_FLAG_STYLE = FLAG_BADGE_MAP.no_flag.badgeStyle;
	const NO_DATA_STYLE = FLAG_BADGE_MAP.no_data.badgeStyle;
</script>

<Card title="Health Outcomes — metric-level breakdown" subtitle="AN flag and VAN flag counts per metric across {mode === 'per-uoa' ? 'selected UoA' : 'all filtered UoAs'}.">
	{#if hoMetricIds.length === 0}
		<p class="text-base-content/70 py-6 text-center text-sm">No Health Outcomes metrics found.</p>
	{:else}
		<!-- HO proportion rule guide -->
		<div class="bg-base-200 mb-4 rounded-lg px-4 py-2.5 text-xs">
			<span class="font-semibold">Proportion rule:</span>
			{#if totalUoas > 5}
				≥ 2/3 of available HO metrics AN-flagged → <span class="text-error font-semibold">ho_primary</span>
			{:else if totalUoas >= 1}
				≥ 1/2 of available HO metrics AN-flagged → <span class="text-error font-semibold">ho_primary</span>
			{/if}
			<span class="text-base-content/60 ml-2">(n = {totalUoas} UoA{totalUoas !== 1 ? 's' : ''})</span>
		</div>

		<div class="overflow-x-auto">
			<table class="table table-xs w-full">
				<thead>
					<tr class="bg-base-200 text-xs">
						<th class="max-w-48">Metric</th>
						<th class="max-w-28">Evidence type</th>
						<th class="text-center">AN flag</th>
						<th class="text-center">VAN flag</th>
						<th class="text-center">No flag</th>
						<th class="text-center">Missing</th>
						<th class="min-w-32">Proportion flagged</th>
					</tr>
				</thead>
				<tbody>
					{#each stats as s (s.id)}
						{@const available = s.anFlagged + s.vanFlagged + s.noFlag}
						{@const anPct = pct(s.anFlagged, available)}
						{@const threshPct = Math.round(proportionThreshold * 100)}
						{@const overThresh = available > 0 && s.anFlagged / available >= proportionThreshold}
						<tr class:bg-error={overThresh} class:bg-opacity-5={overThresh}>
							<td class="max-w-48 whitespace-normal text-xs font-medium">{s.label}</td>
							<td class="max-w-28 whitespace-normal">
								<span class="badge badge-ghost badge-xs text-xs">{s.evidence_type}</span>
							</td>
							<td class="text-center">
								{#if s.anFlagged > 0}
									<span class="badge badge-xs" style={AN_STYLE}>{s.anFlagged}</span>
								{:else}
									<span class="text-base-content/40">0</span>
								{/if}
							</td>
							<td class="text-center">
								{#if s.vanFlagged > 0}
									<span
										class="badge badge-xs"
										style="background-color: var(--color-priority-ho-secondary); color: var(--color-base-100)"
									>{s.vanFlagged}</span>
								{:else}
									<span class="text-base-content/40">0</span>
								{/if}
							</td>
							<td class="text-center">
								{#if s.noFlag > 0}
									<span class="badge badge-xs" style={NO_FLAG_STYLE}>{s.noFlag}</span>
								{:else}
									<span class="text-base-content/40">0</span>
								{/if}
							</td>
							<td class="text-center">
								{#if s.missing > 0}
									<span class="badge badge-xs" style={NO_DATA_STYLE}>{s.missing}</span>
								{:else}
									<span class="text-base-content/40">0</span>
								{/if}
							</td>
							<td class="min-w-32 pr-2">
								{#if available > 0}
									<!-- Bar showing AN-flagged proportion with threshold marker -->
									<div class="relative h-3 w-full overflow-hidden rounded-sm bg-base-300">
										<div
											class="absolute inset-y-0 left-0 rounded-sm"
											style="width: {anPct}%; background-color: var(--color-flag)"
										></div>
										<!-- Threshold marker -->
										<div
											class="absolute inset-y-0 w-px bg-base-content opacity-50"
											style="left: {threshPct}%"
											title="{threshPct}% threshold"
										></div>
									</div>
									<span class="text-base-content/60 mt-0.5 block text-right text-xs"
										>{anPct}%</span
									>
								{:else}
									<span class="text-base-content/40 text-xs">–</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</Card>
