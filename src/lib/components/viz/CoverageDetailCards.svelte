<script lang="ts">
	import { FLAG_BADGE_MAP, getFlagBadge, systemBaseColor } from '$lib/utils/colors';
	import Card from '$lib/components/ui/Card.svelte';

	type Row = Record<string, unknown>;

	interface FactorStat {
		id: string;
		label: string;
		flag_n: number;
		no_flag_n: number;
		missing_n: number;
		total: number;
		status: string;
		uoa_flagged_n: number;
		uoa_no_flag_n: number;
		uoa_insuff_n: number;
		uoa_no_data_n: number;
	}

	interface SystemCard {
		id: string;
		label: string;
		status: string;
		flag_n: number;
		no_flag_n: number;
		missing_n: number;
		factors: FactorStat[];
		color: string;
		uoa_flagged_n: number;
		uoa_no_flag_n: number;
		uoa_insuff_n: number;
		uoa_no_data_n: number;
	}

	interface Props {
		row: Row;
		systems: { id: string; label: string }[];
		referenceJson: unknown;
		/** Use tinted colours for bar fills. Default true. */
		tinted?: boolean;
		/** 'overall' aggregates across all UoAs; 'per-uoa' shows a single UoA. */
		mode?: 'overall' | 'per-uoa';
		/** Total number of filtered UoAs — used for "X / N UoAs" badges in overall mode. */
		totalUoas?: number;
	}

	let { row, systems, referenceJson, tinted = true, mode = 'per-uoa', totalUoas = 1 }: Props =
		$props();

	function barColor(status: string): string {
		const fb = getFlagBadge(status) ?? FLAG_BADGE_MAP.no_data;
		return `var(${tinted ? fb.tintVar : fb.colorVar})`;
	}

	function solidColor(status: string): string {
		const fb = getFlagBadge(status) ?? FLAG_BADGE_MAP.no_data;
		return `var(${fb.colorVar})`;
	}

	function badge(status: string) {
		return getFlagBadge(status) ?? FLAG_BADGE_MAP.no_data;
	}

	const systemCards = $derived.by<SystemCard[]>(() => {
		const json = referenceJson as any;
		if (!json?.systems || !Array.isArray(json.systems)) return [];

		const systemMap = new Map<string, any>(json.systems.map((s: any) => [s.id, s]));

		return systems
			.map((sys) => {
				const rawSystem = systemMap.get(sys.id);
				const factors: FactorStat[] = [];

				if (rawSystem && Array.isArray(rawSystem.factors)) {
					for (const factor of rawSystem.factors) {
						const factorKey = `${sys.id}.${factor.id}`;
						const flag_n = Number(row[`${factorKey}.flag_n`] ?? 0);
						const no_flag_n = Number(row[`${factorKey}.no_flag_n`] ?? 0);
						const missing_n = Number(row[`${factorKey}.missing_n`] ?? 0);
						const total = flag_n + no_flag_n + missing_n;
						const uoa_flagged_n = Number(row[`${factorKey}.uoa_flagged_n`] ?? 0);
						const uoa_no_flag_n = Number(row[`${factorKey}.uoa_no_flag_n`] ?? 0);
						const uoa_insuff_n = Number(row[`${factorKey}.uoa_insuff_n`] ?? 0);
						const uoa_no_data_n = Number(row[`${factorKey}.uoa_no_data_n`] ?? 0);
						const uoa_total = uoa_flagged_n + uoa_no_flag_n + uoa_insuff_n + uoa_no_data_n;
						if (mode === 'overall' ? uoa_total === 0 : total === 0) continue;
						factors.push({
							id: factor.id,
							label: factor.label ?? factor.id,
							flag_n,
							no_flag_n,
							missing_n,
							total,
							status: String(row[`${factorKey}.status`] ?? 'no_data'),
							uoa_flagged_n,
							uoa_no_flag_n,
							uoa_insuff_n,
							uoa_no_data_n
						});
					}
				}

				if (mode === 'overall') {
					// Sort by most UoAs flagged first, then by flag_n as tiebreaker
					factors.sort((a, b) => b.uoa_flagged_n - a.uoa_flagged_n || b.flag_n - a.flag_n);
				} else {
					factors.sort((a, b) => {
						const order: Record<string, number> = {
							flag: 0,
							insufficient_evidence: 1,
							no_flag: 2,
							no_data: 3
						};
						return (order[a.status] ?? 9) - (order[b.status] ?? 9);
					});
				}

				return {
					id: sys.id,
					label: sys.label,
					status: String(row[`${sys.id}.status`] ?? 'no_data'),
					flag_n: Number(row[`${sys.id}.flag_n`] ?? 0),
					no_flag_n: Number(row[`${sys.id}.no_flag_n`] ?? 0),
					missing_n: Number(row[`${sys.id}.missing_n`] ?? 0),
					factors,
					color: systemBaseColor(sys.id),
					uoa_flagged_n: Number(row[`${sys.id}.uoa_flagged_n`] ?? 0),
					uoa_no_flag_n: Number(row[`${sys.id}.uoa_no_flag_n`] ?? 0),
					uoa_insuff_n: Number(row[`${sys.id}.uoa_insuff_n`] ?? 0),
					uoa_no_data_n: Number(row[`${sys.id}.uoa_no_data_n`] ?? 0)
				};
			})
			.filter((s) => s.factors.length > 0);
	});

	function pct(n: number, total: number) {
		return total === 0 ? 0 : Math.round((n / total) * 100);
	}
</script>

<style>
	:global([data-theme='ana-dark'] .system-card) {
		box-shadow: inset 10px 0 16px -6px color-mix(in srgb, var(--sys-color) 40%, transparent);
	}
</style>

<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
	{#each systemCards as sys (sys.id)}
		{@const b = badge(sys.status)}
		<Card class="system-card border-l-8" style="border-left-color: {sys.color}; --sys-color: {sys.color}">
			<!-- System header -->
			<div class="-mx-4 -mt-4 mb-3 flex items-center justify-between gap-2 px-4 pt-3 pb-2">
				<div class="flex min-w-0 items-center gap-2">
					<span class="h-3 w-3 shrink-0 rounded-full" style="background-color: {sys.color}"></span>
					<h1 class="text-lg font-semibold">{sys.label}</h1>
				</div>
				{#if mode !== 'overall'}
					<span class="badge badge-md shrink-0" style={b.badgeStyle}>{b.label}</span>
				{/if}
			</div>

			<!-- Summary counts -->
			<div class="mb-2 flex flex-wrap gap-3 text-sm">
				{#if mode === 'overall'}
					{#if sys.uoa_flagged_n > 0}<span style="color: {solidColor('flag')}"><strong>{sys.uoa_flagged_n}</strong> Flagged</span>{/if}
					{#if sys.uoa_no_flag_n > 0}<span style="color: {solidColor('no_flag')}"><strong>{sys.uoa_no_flag_n}</strong> No Flag</span>{/if}
					{#if sys.uoa_insuff_n > 0}<span style="color: {solidColor('insufficient_evidence')}"><strong>{sys.uoa_insuff_n}</strong> Insuff.</span>{/if}
					{#if sys.uoa_no_data_n > 0}<span style="color: {solidColor('no_data')}"><strong>{sys.uoa_no_data_n}</strong> No Data</span>{/if}
				{:else}
					<span><strong>{sys.flag_n}</strong> Flag</span>
					<span><strong>{sys.no_flag_n}</strong> No Flag</span>
					{#if sys.missing_n > 0}<span><strong>{sys.missing_n}</strong> Missing</span>{/if}
				{/if}
			</div>

			<!-- Factor rows -->
			<div class="divide-base-content/20 divide-y">
				{#each sys.factors as f (f.id)}
					{@const fb = badge(f.status)}
					<div class="py-1.5">
						<div class="mb-1 flex items-center justify-between gap-2">
							<span class="min-w-0 truncate text-sm">{f.label}</span>
							{#if mode !== 'overall'}
							<span class="badge badge-sm shrink-0" style={fb.badgeStyle}>{fb.label}</span>
						{/if}
						</div>
						<!-- Mini progress bar -->
						<div class="bg-base-300 flex h-3 w-full overflow-hidden rounded-full">
							{#if mode === 'overall'}
								{#if f.uoa_flagged_n > 0}
									<div class="h-full shrink-0" style="width: {pct(f.uoa_flagged_n, totalUoas)}%; background-color: {barColor('flag')}" title="{f.uoa_flagged_n} UoAs flagged"></div>
								{/if}
								{#if f.uoa_no_flag_n > 0}
									<div class="h-full shrink-0" style="width: {pct(f.uoa_no_flag_n, totalUoas)}%; background-color: {barColor('no_flag')}" title="{f.uoa_no_flag_n} UoAs no flag"></div>
								{/if}
								{#if f.uoa_insuff_n > 0}
									<div class="h-full shrink-0" style="width: {pct(f.uoa_insuff_n, totalUoas)}%; background-color: {barColor('insufficient_evidence')}" title="{f.uoa_insuff_n} UoAs insufficient"></div>
								{/if}
								{#if f.uoa_no_data_n > 0}
									<div class="h-full shrink-0" style="width: {pct(f.uoa_no_data_n, totalUoas)}%; background-color: {barColor('no_data')}" title="{f.uoa_no_data_n} UoAs no data"></div>
								{/if}
							{:else}
								{#if f.flag_n > 0}
									<div class="h-full shrink-0" style="width: {pct(f.flag_n, f.total)}%; background-color: {barColor('flag')}" title="{f.flag_n} flagged"></div>
								{/if}
								{#if f.no_flag_n > 0}
									<div class="h-full shrink-0" style="width: {pct(f.no_flag_n, f.total)}%; background-color: {barColor('no_flag')}" title="{f.no_flag_n} no flag"></div>
								{/if}
								{#if f.missing_n > 0}
									<div class="h-full shrink-0" style="width: {pct(f.missing_n, f.total)}%; background-color: {barColor('no_data')}" title="{f.missing_n} missing"></div>
								{/if}
							{/if}
						</div>
						<!-- Counts below bar -->
						<div class="mt-0.5 mb-1 flex gap-2 text-xs">
							{#if mode === 'overall'}
								{#if f.uoa_flagged_n > 0}<span class="font-semibold" style="color: {solidColor('flag')}">{f.uoa_flagged_n} Flagged</span>{/if}
								{#if f.uoa_no_flag_n > 0}<span class="font-semibold" style="color: {solidColor('no_flag')}">{f.uoa_no_flag_n} No Flag</span>{/if}
								{#if f.uoa_insuff_n > 0}<span style="color: {solidColor('insufficient_evidence')}">{f.uoa_insuff_n} Insuff.</span>{/if}
								{#if f.uoa_no_data_n > 0}<span style="color: {solidColor('no_data')}">{f.uoa_no_data_n} No Data</span>{/if}
							{:else}
								{#if f.flag_n > 0}<span class="font-semibold" style="color: {solidColor('flag')}">{f.flag_n} Flag</span>{/if}
								{#if f.no_flag_n > 0}<span class="font-semibold" style="color: {solidColor('no_flag')}">{f.no_flag_n} No Flag</span>{/if}
								{#if f.missing_n > 0}<span style="color: {solidColor('no_data')}">{f.missing_n} Missing</span>{/if}
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</Card>
	{/each}
</div>
