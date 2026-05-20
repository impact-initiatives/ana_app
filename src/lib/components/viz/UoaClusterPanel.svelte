<script lang="ts">
	import { FLAG_BADGE_MAP, getFlagBadge, getPriorityBadge, systemBaseColor } from '$lib/utils/colors';
	import { PRIORITY_FLAG_KEYS } from '$lib/types/flags';
	import PriorityBadge from '$lib/components/ui/PriorityBadge.svelte';
	import Card from '$lib/components/ui/Card.svelte';

	type Row = Record<string, any>;

	interface Props {
		uoas: string[];
		rows: Row[];
		systems: { id: string; label: string }[];
		systemCodes: Map<string, string[]>;
		ondrilldown?: (uoa: string, systemId: string) => void;
		onclear?: () => void;
	}

	let { uoas, rows, systems, systemCodes, ondrilldown, onclear }: Props = $props();

	const selectedRows = $derived(rows.filter((r) => uoas.includes(String(r.uoa))));

	// Priority flag distribution across selected rows
	const priorityCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const row of selectedRows) {
			const key = String(row.priority_flag ?? 'no_data');
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		return counts;
	});

	const priorityKeys = $derived(PRIORITY_FLAG_KEYS.filter((k) => (priorityCounts.get(k) ?? 0) > 0));

	// Per-system summed stats across all selected rows
	interface SystemStat {
		id: string;
		label: string;
		status: string;
		flag_n: number;
		no_flag_n: number;
		missing_n: number;
	}

	const STATUS_ORDER: Record<string, number> = {
		flag: 0,
		insufficient_evidence: 1,
		no_flag: 2,
		no_data: 3
	};

	function majorityStatus(statuses: string[]): string {
		const counts = new Map<string, number>();
		for (const s of statuses) {
			if (s !== 'no_data') counts.set(s, (counts.get(s) ?? 0) + 1);
		}
		if (counts.size === 0) return 'no_data';
		let best = 'no_data';
		let bestN = 0;
		for (const [s, n] of counts) {
			if (n > bestN || (n === bestN && (STATUS_ORDER[s] ?? 9) < (STATUS_ORDER[best] ?? 9))) {
				best = s;
				bestN = n;
			}
		}
		return best;
	}

	const systemStats = $derived.by<SystemStat[]>(() =>
		systems.map((sys) => {
			let flag_n = 0,
				no_flag_n = 0,
				missing_n = 0;
			const statuses: string[] = [];
			for (const row of selectedRows) {
				flag_n += Number(row[`${sys.id}.flag_n`] ?? 0);
				no_flag_n += Number(row[`${sys.id}.no_flag_n`] ?? 0);
				missing_n += Number(row[`${sys.id}.missing_n`] ?? 0);
				statuses.push(String(row[`${sys.id}.status`] ?? 'no_data'));
			}
			return { id: sys.id, label: sys.label, status: majorityStatus(statuses), flag_n, no_flag_n, missing_n };
		})
	);

	const totalFlags = $derived(systemStats.reduce((s, ss) => s + ss.flag_n, 0));
	const totalNoFlag = $derived(systemStats.reduce((s, ss) => s + ss.no_flag_n, 0));
	const totalMissing = $derived(systemStats.reduce((s, ss) => s + ss.missing_n, 0));

	const sortedSystemStats = $derived(
		[...systemStats].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
	);
</script>

<div class="mx-auto">
	<Card
		title="{uoas.length} area{uoas.length !== 1 ? 's' : ''} selected"
		subtitle="Aggregated totals across selected areas. Click a system to drill down."
	>
		{#snippet titleActions()}
			{#if onclear}
				<button class="btn btn-sm btn-circle" onclick={onclear} aria-label="Clear selection"
					>✕</button
				>
			{/if}
		{/snippet}

		<!-- Prelim flag distribution -->
		<div class="mt-1 mb-2 flex flex-wrap items-center gap-2">
			<span class="text-sm">Priority flags:</span>
			{#if priorityKeys.length > 0}
				{#each priorityKeys as key (key)}
					<span class="flex items-center gap-1">
						<PriorityBadge value={key} />
						<span class="text-base-content/70 text-xs">×{priorityCounts.get(key)}</span>
					</span>
				{/each}
			{:else}
				<PriorityBadge value="no_data" />
			{/if}
		</div>

		<!-- System totals summary -->
		<p class="text-sm">Systems (totals across {uoas.length} area{uoas.length !== 1 ? 's' : ''}):</p>
		<div class="mt-1 mb-2 flex flex-wrap gap-3 text-sm">
			<span class="flex items-center gap-1.5">
				<span class="h-3.5 w-3.5 rounded-full" style="background-color: var(--color-flag)"></span>
				<strong>{totalFlags}</strong> with flag
			</span>
			<span class="flex items-center gap-1.5">
				<span class="h-3.5 w-3.5 rounded-full" style="background-color: var(--color-no-flag)"
				></span>
				<strong>{totalNoFlag}</strong> no flag
			</span>
			{#if totalMissing > 0}
				<span class="flex items-center gap-1.5">
					<span class="h-3.5 w-3.5 rounded-full" style="background-color: var(--color-no-data)"
					></span>
					<strong>{totalMissing}</strong> missing
				</span>
			{/if}
		</div>

		<div class="mx-auto mt-2 min-w-md">
			<div class="divide-base-content/20 divide-y">
				{#each sortedSystemStats as ss (ss.id)}
					{@const fb = getFlagBadge(ss.status) ?? FLAG_BADGE_MAP.no_data}
					{@const sysColor = systemBaseColor(ss.id)}
					<button
						type="button"
						class="-mx-4 flex w-[calc(100%+2rem)] items-center gap-3 px-4 py-2 {ondrilldown
							? 'hover:bg-base-200 cursor-pointer'
							: 'cursor-default'}"
						onclick={() => ondrilldown?.(uoas[0], ss.id)}
						aria-label="Drill down into {ss.label}"
					>
						<span
							class="h-3.5 w-3.5 shrink-0 rounded-full"
							style="background-color: {sysColor}"
						></span>
						<div class="min-w-0 flex-1">
							<span class="text-sm leading-tight font-medium">{ss.label}</span>
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
						<span class="badge badge-sm shrink-0" style={fb.badgeTintStyle}>{fb.label}</span>
					</button>
				{/each}
			</div>
		</div>
	</Card>
</div>
