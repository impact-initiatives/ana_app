<script lang="ts">
	import { FLAG_BADGE, systemBaseColor } from '$lib/utils/colors';
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
	}

	interface Props {
		row: Row;
		systems: { id: string; label: string }[];
		referenceJson: unknown;
		/** Use tinted colours for bar fills. Default true. */
		tinted?: boolean;
	}

	let { row, systems, referenceJson, tinted = true }: Props = $props();

	function barColor(status: string): string {
		const fb = FLAG_BADGE[status] ?? FLAG_BADGE.no_data;
		return `var(${tinted ? fb.tintVar : fb.colorVar})`;
	}

	function solidColor(status: string): string {
		const fb = FLAG_BADGE[status] ?? FLAG_BADGE.no_data;
		return `var(${fb.colorVar})`;
	}

	function badge(status: string) {
		return FLAG_BADGE[status] ?? FLAG_BADGE.no_data;
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
						if (total === 0) continue;
						factors.push({
							id: factor.id,
							label: factor.label ?? factor.id,
							flag_n,
							no_flag_n,
							missing_n,
							total,
							status: String(row[`${factorKey}.status`] ?? 'no_data')
						});
					}
				}

				// sort: flagged factors first
				factors.sort((a, b) => {
					const order: Record<string, number> = {
						flag: 0,
						insufficient_evidence: 1,
						no_flag: 2,
						no_data: 3
					};
					return (order[a.status] ?? 9) - (order[b.status] ?? 9);
				});

				return {
					id: sys.id,
					label: sys.label,
					status: String(row[`${sys.id}.status`] ?? 'no_data'),
					flag_n: Number(row[`${sys.id}.flag_n`] ?? 0),
					no_flag_n: Number(row[`${sys.id}.no_flag_n`] ?? 0),
					missing_n: Number(row[`${sys.id}.missing_n`] ?? 0),
					factors,
					color: systemBaseColor(sys.id)
				};
			})
			.filter((s) => s.factors.length > 0);
	});

	function pct(n: number, total: number) {
		return total === 0 ? 0 : Math.round((n / total) * 100);
	}
</script>

<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
	{#each systemCards as sys (sys.id)}
		{@const b = badge(sys.status)}
		<Card class="border-l-[5px]" style="border-left-color: {sys.color}">
			<!-- System header -->
			<div class="-mx-4 -mt-4 mb-3 flex items-center justify-between gap-2 px-4 pt-3 pb-2">
				<div class="flex min-w-0 items-center gap-2">
					<span class="h-3 w-3 shrink-0 rounded-full" style="background-color: {sys.color}"></span>
					<span class="text-sm leading-tight font-semibold">{sys.label}</span>
				</div>
				<span class="badge badge-sm shrink-0" style={b.badgeTintStyle}>{b.label}</span>
			</div>

			<!-- Summary counts -->
			<div class="text-base-content mb-2 flex gap-3 text-xs">
				<span><strong class="text-base-content">{sys.flag_n}</strong> Flag</span>
				<span><strong class="text-base-content">{sys.no_flag_n}</strong> No Flag</span>
				{#if sys.missing_n > 0}
					<span><strong class="text-base-content">{sys.missing_n}</strong> Missing</span>
				{/if}
			</div>

			<!-- Factor rows -->
			<div class="divide-base-content/20 divide-y">
				{#each sys.factors as f (f.id)}
					{@const fb = badge(f.status)}
					<div class="py-1.5">
						<div class="mb-1 flex items-center justify-between gap-2">
							<span class="text-base-content/80 min-w-0 truncate text-xs">{f.label}</span>
							<span class="badge badge-xs shrink-0" style={fb.badgeTintStyle}>{fb.label}</span>
						</div>
						<!-- Mini progress bar -->
						<div class="bg-base-300 flex h-3 w-full overflow-hidden rounded-full">
							{#if f.flag_n > 0}
								<div
									class="h-full shrink-0"
									style="width: {pct(f.flag_n, f.total)}%; background-color: {barColor('flag')}"
									title="{f.flag_n} flagged"
								></div>
							{/if}
							{#if f.no_flag_n > 0}
								<div
									class="h-full shrink-0"
									style="width: {pct(f.no_flag_n, f.total)}%; background-color: {barColor(
										'no_flag'
									)}"
									title="{f.no_flag_n} no flag"
								></div>
							{/if}
							{#if f.missing_n > 0}
								<div
									class="h-full shrink-0"
									style="width: {pct(f.missing_n, f.total)}%; background-color: {barColor(
										'no_data'
									)}"
									title="{f.missing_n} missing"
								></div>
							{/if}
						</div>
						<!-- Counts below bar -->
						<div class="mt-0.5 mb-1 flex gap-2 text-xs">
							{#if f.flag_n > 0}<span style="color: {solidColor('flag')}">{f.flag_n} Flag</span
								>{/if}
							{#if f.no_flag_n > 0}<span style="color: {solidColor('no_flag')}"
									>{f.no_flag_n} No Flag</span
								>{/if}
							{#if f.missing_n > 0}<span style="color: {solidColor('no_data')}"
									>{f.missing_n} Missing</span
								>{/if}
						</div>
					</div>
				{/each}
			</div>
		</Card>
	{/each}
</div>
