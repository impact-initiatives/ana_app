<script lang="ts">
	import { FLAG_BADGE_MAP, getFlagBadge, getPriorityBadge, systemBaseColor } from '$lib/utils/colors';
	import PrelimBadge from '$lib/components/ui/PrelimBadge.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { uoaLabel } from '$lib/stores/adminFeaturesStore.svelte';

	type Row = Record<string, any>;

	interface Props {
		uoa: string;
		adminName?: string | null;
		row: Row | null;
		systems: { id: string; label: string }[];
		systemCodes: Map<string, string[]>;
		/** Called when user clicks a system row to drill down. */
		ondrilldown?: (uoa: string, systemId: string) => void;
		/** Called when user closes the panel. */
		onclose?: () => void;
	}

	let { uoa, adminName = null, row, systems, systemCodes, ondrilldown, onclose }: Props = $props();

	const cardTitle = $derived(adminName ? `${adminName} (${uoa})` : uoaLabel(uoa));

	// ── Per-system stats from the row ─────────────────────────────────────────
	interface SystemStat {
		id: string;
		label: string;
		status: string;
		flag_n: number;
		no_flag_n: number;
		missing_n: number;
		within10: number;
	}

	const systemStats = $derived.by<SystemStat[]>(() => {
		if (!row) return [];
		return systems.map((sys) => {
			const codes = systemCodes.get(sys.id) ?? [];
			let within10 = 0;
			for (const c of codes) {
				if (row[`${c}_flag`] !== true && row[`${c}_within_10perc`] === true) within10++;
			}
			return {
				id: sys.id,
				label: sys.label,
				status: String(row[`${sys.id}.status`] ?? 'no_data'),
				flag_n: Number(row[`${sys.id}.flag_n`] ?? 0),
				no_flag_n: Number(row[`${sys.id}.no_flag_n`] ?? 0),
				missing_n: Number(row[`${sys.id}.missing_n`] ?? 0),
				within10
			};
		});
	});

	// ── Aggregate totals ──────────────────────────────────────────────────────
	const totalFlags = $derived(systemStats.reduce((s, ss) => s + ss.flag_n, 0));
	const totalNoFlag = $derived(systemStats.reduce((s, ss) => s + ss.no_flag_n, 0));
	const totalMissing = $derived(systemStats.reduce((s, ss) => s + ss.missing_n, 0));
	const totalWithin10 = $derived(systemStats.reduce((s, ss) => s + ss.within10, 0));

	const STATUS_ORDER: Record<string, number> = {
		flag: 0,
		insufficient_evidence: 1,
		no_flag: 2,
		no_data: 3
	};

	const sortedSystemStats = $derived(
		[...systemStats].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
	);
</script>

<div class="mx-auto">
	<Card title={cardTitle} subtitle="Click on a system to drill down into its metrics.">
		{#snippet titleActions()}
			{#if onclose}
				<button class="btn btn-sm btn-circle" onclick={onclose} aria-label="Close panel">✕</button>
			{/if}
		{/snippet}
		<!-- Preliminary flag -->
		<div class="mt-1 mb-2 flex items-center gap-2">
			<span>This UoA received the following preliminary flag:</span>
			{#if row && getPriorityBadge(row.priority_flag)}
				<PrelimBadge value={row.priority_flag} />
			{:else}
				<PrelimBadge value="NO_DATA" />
			{/if}
		</div>

		{#if !row}
			<p class="text-base-content/75 text-sm">No data is available for this area.</p>
		{:else}
			<p class="">Systems have been flagged as follows:</p>
			<div class="flex flex-wrap gap-3 text-sm">
				<span class="flex items-center gap-1.5">
					<span class="h-3.5 w-3.5 rounded-full" style="background-color: var(--color-flag)"></span>
					<strong>{totalFlags}</strong> with flag
				</span>
				<span class="flex items-center gap-1.5">
					<span class="h-3.5 w-3.5 rounded-full" style="background-color: var(--color-no-flag)"
					></span>
					<strong>{totalNoFlag}</strong> no flag
				</span>
				{#if totalWithin10 > 0}
					<span class="flex items-center gap-1.5">
						<span class="badge badge-warning badge-xs rounded-full"></span>
						<strong>{totalWithin10}</strong> near threshold
					</span>
				{/if}
				{#if totalMissing > 0}
					<span class="flex items-center gap-1.5">
						<span class="h-3.5 w-3.5 rounded-full" style="background-color: var(--color-no-data)"
						></span>
						<strong>{totalMissing}</strong> metric missing
					</span>
				{/if}
			</div>
			<div class="mx-auto mt-2 min-w-md">
				<!-- Per-system breakdown -->
				<div class="divide-base-content/20 divide-y">
					{#each sortedSystemStats as ss (ss.id)}
						{@const fb = getFlagBadge(ss.status) ?? FLAG_BADGE_MAP.no_data}
						{@const sysColor = systemBaseColor(ss.id)}
						<button
							type="button"
							class="-mx-4 flex w-[calc(100%+2rem)] items-center gap-3 px-4 py-2 {ondrilldown
								? 'hover:bg-base-200 cursor-pointer'
								: 'cursor-default'}"
							onclick={() => ondrilldown?.(uoa, ss.id)}
							aria-label="Drill down into {ss.label} for {uoa}"
						>
							<!-- System color dot -->
							<span class="h-3.5 w-3.5 shrink-0 rounded-full" style="background-color: {sysColor}"
							></span>

							<!-- Label + counts -->
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="text-sm leading-tight font-medium">{ss.label}</span>
									{#if ss.within10 > 0}
										<span class="badge badge-warning badge-xs">~{ss.within10}</span>
									{/if}
								</div>
								<div class="text-base-content/75 mt-0.5 flex gap-2 text-xs">
									<span>{ss.flag_n} flag</span>
									<span>·</span>
									<span>{ss.no_flag_n} no flag</span>
									{#if ss.missing_n > 0}
										<span>·</span>
										<span>{ss.missing_n} missing</span>
									{/if}
								</div>
							</div>

							<!-- Status badge -->
							<span class="badge badge-sm shrink-0" style={fb.badgeTintStyle}>{fb.label}</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</Card>
</div>
