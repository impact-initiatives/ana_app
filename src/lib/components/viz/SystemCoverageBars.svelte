<script lang="ts">
	import { scaleLinear } from 'd3-scale';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { FLAG_BADGE_MAP, systemBaseColor } from '$lib/utils/colors';
	import { FLAG_STATUS_KEYS, type FlagStatus } from '$lib/types/flags';
	import Card from '$lib/components/ui/Card.svelte';
	import LegendBadge from '$lib/components/ui/LegendBadge.svelte';

	type Row = Record<string, unknown>;

	interface Props {
		rows: Row[];
		systems: { id: string; label: string }[];
	}

	let { rows, systems }: Props = $props();

	// ── Data ──────────────────────────────────────────────────────────────────
	const STATUS_KEYS = FLAG_STATUS_KEYS;
	type StatusKey = FlagStatus;

	interface SystemBar {
		id: string;
		label: string;
		counts: Record<StatusKey, number>;
	}

	const bars = $derived.by<SystemBar[]>(() =>
		systems.map((sys) => {
			const counts: Record<StatusKey, number> = {
				flag: 0,
				no_flag: 0,
				insufficient_evidence: 0,
				no_data: 0
			};
			for (const row of rows) {
				const status = String(row[`${sys.id}.status`] ?? 'no_data') as StatusKey;
				if (status in counts) counts[status]++;
				else counts.no_data++;
			}
			return { id: sys.id, label: sys.label, counts };
		})
	);

	// ── Tweened counts ────────────────────────────────────────────────────────
	const allCounts = $derived(
		Object.fromEntries(
			systems.map((sys) => [
				sys.id,
				Object.fromEntries(
					STATUS_KEYS.map((sk) => [sk, bars.find((b) => b.id === sys.id)?.counts[sk] ?? 0])
				)
			])
		)
	);
	const tweenedCounts = Tween.of(() => allCounts, { duration: 600, easing: cubicOut });
	const tweenedTotal = Tween.of(() => rows.length, { duration: 600, easing: cubicOut });

	// ── Layout ────────────────────────────────────────────────────────────────
	const BAR_HEIGHT = 30;
	const GAP = 8;

	let containerWidth = $state(600);
	const labelColWidth = $derived(containerWidth < 480 ? 112 : 168);
	const barColWidth = $derived(Math.max(0, containerWidth - labelColWidth - GAP));

	// ── Scale ─────────────────────────────────────────────────────────────────
	const xScale = $derived(
		scaleLinear()
			.domain([0, tweenedTotal.current || 1])
			.range([0, barColWidth])
	);

	function stackedSegments(tweenedBarCounts: Record<string, number>) {
		let x = 0;
		return STATUS_KEYS.map((sk) => {
			const tw = tweenedBarCounts[sk] ?? 0;
			const w = xScale(tw);
			const seg = { key: sk, x, width: w, count: Math.round(tw) };
			x += w;
			return seg;
		}).filter((seg) => seg.width > 0);
	}
</script>

<style>
	:global([data-theme='ana-dark']) .system-dot {
		box-shadow: 0 0 6px 2px rgba(255, 255, 255, 0.35);
	}
</style>

<Card title="System coverage overview" subtitle="UoA counts by flag status for each system.">
	{#if rows.length === 0}
		<p class="text-base-content/75 py-8 text-center text-sm">No data matches current filters.</p>
	{:else}
		<div class="w-full space-y-3" bind:offsetWidth={containerWidth}>
			{#each bars as bar (bar.id)}
				<div class="flex items-center" style="gap: {GAP}px">
					<!-- Label -->
					<div class="flex shrink-0 items-center gap-1.5" style="width: {labelColWidth}px">
						<span
							class="system-dot h-2.5 w-2.5 shrink-0 rounded-full"
							style="background-color: {systemBaseColor(bar.id)}"
						></span>
						<span class="text-sm leading-tight">{bar.label}</span>
					</div>

					<!-- Bar -->
					<svg width={barColWidth} height={BAR_HEIGHT}>
						{#each stackedSegments(tweenedCounts.current[bar.id] ?? bar.counts) as seg (seg.key)}
							<rect
								x={seg.x}
								y={0}
								width={seg.width}
								height={BAR_HEIGHT}
								style="fill: var({FLAG_BADGE_MAP[seg.key as FlagStatus].tintVar})"
								rx="3"
							/>
							{#if seg.width > 24}
								<text
									x={seg.x + seg.width / 2}
									y={BAR_HEIGHT / 2}
									text-anchor="middle"
									dominant-baseline="middle"
									fill="currentColor"
									font-size="14"
									font-weight="600">{seg.count}</text
								>
							{/if}
						{/each}
					</svg>
				</div>
			{/each}
			<div class="mt-5">
				<LegendBadge />
			</div>
		</div>
	{/if}
</Card>
