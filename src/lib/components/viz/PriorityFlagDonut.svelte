<script lang="ts">
	import { pie } from 'd3-shape';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { getPriorityBadge } from '$lib/utils/colors';
	import { PRIORITY_FLAG_KEYS } from '$lib/types/flags';
	import TooltipCard from '$lib/components/ui/TooltipCard.svelte';
	import Arc from './primitives/Arc.svelte';
	import Chart, { type Dimensions } from './primitives/Chart.svelte';
	import Card from '$lib/components/ui/Card.svelte';

	type Row = Record<string, any>;

	interface Props {
		rows: Row[];
		/** Outer radius in px. Auto-fits to container if omitted. */
		radius?: number | null;
		/** Currently selected keys (null = all). Driven externally. */
		selectedKeys?: string[] | null;
		/** Called when a slice is clicked — passes the key or null to deselect. */
		onsliceclick?: (key: string | null) => void;
	}

	let { rows, radius = null, selectedKeys = null, onsliceclick }: Props = $props();

	// ── Responsive container width ────────────────────────────────────────────
	let containerWidth = $state(220);

	// Radius: explicit override or auto-fit to container (max 120px)
	const effectiveRadius = $derived(radius ?? Math.min(Math.floor(containerWidth / 2.8), 120));

	// ── Count rows per priority_flag ────────────────────────────────────────────
	interface Slice {
		key: string;
		count: number;
		label: string;
		color: string;
	}

	const slices = $derived.by<Slice[]>(() => {
		const counts: Record<string, number> = {};
		for (const k of PRIORITY_FLAG_KEYS) counts[k] = 0;
		for (const row of rows) {
			const k = String(row.priority_flag ?? '');
			if (k in counts) counts[k]++;
		}
		return PRIORITY_FLAG_KEYS.map((k) => ({
			key: k,
			count: counts[k],
			label: getPriorityBadge(k)?.label ?? k,
			color: getPriorityBadge(k)?.bg ?? '#9ca3af'
		}));
	});

	// ── D3 pie + arc math (geometry only, no DOM) ─────────────────────────────
	const innerRadius = $derived(effectiveRadius * 0.52);
	const outerRadius = $derived(effectiveRadius);
	const cx = $derived(effectiveRadius + 4);
	const cy = $derived(effectiveRadius + 4);
	const svgSize = $derived((effectiveRadius + 4) * 2);

	const dimensions = $derived<Dimensions>({
		width: svgSize,
		height: svgSize,
		margins: { top: 0, right: 0, bottom: 0, left: 0 },
		innerWidth: svgSize,
		innerHeight: svgSize
	});

	const pieGen = $derived(
		pie<Slice>()
			.value((d) => d.count)
			.sort(null)
			.padAngle(0.02)
	);

	const arcData = $derived(
		slices.filter((s) => s.count > 0).length > 0 ? pieGen(slices.filter((s) => s.count > 0)) : []
	);

	// ── Tweened legend numbers (same duration as arc animation) ──────────────
	// Always includes all keys (0 for absent slices) so the tween shape is stable.
	const allCounts = $derived(
		Object.fromEntries(
			PRIORITY_FLAG_KEYS.map((k) => [k, slices.find((s) => s.key === k)?.count ?? 0])
		)
	);
	const tweenedCounts = Tween.of(() => allCounts, { duration: 600, easing: cubicOut });
	const tweenedTotal = Tween.of(() => rows.length, { duration: 600, easing: cubicOut });

	// ── Tooltip ───────────────────────────────────────────────────────────────
	let tooltipVisible = $state(false);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
	let hoveredKey = $state<string | null>(null);

	function showSliceTooltip(e: MouseEvent, d: (typeof arcData)[number]) {
		tooltipX = e.clientX;
		tooltipY = e.clientY;
		hoveredKey = d.data.key;
		tooltipVisible = true;
	}

	function moveTooltip(e: MouseEvent) {
		tooltipX = e.clientX;
		tooltipY = e.clientY;
	}

	function hideTooltip() {
		tooltipVisible = false;
		hoveredKey = null;
	}

	function handleSliceClick(key: string) {
		if (!onsliceclick) return;
		// Toggle: clicking already-selected key deselects it
		if (selectedKeys?.length === 1 && selectedKeys[0] === key) {
			onsliceclick(null);
		} else {
			onsliceclick(key);
		}
	}

	const hoveredSlice = $derived(arcData.find((d) => d.data.key === hoveredKey) ?? null);

	function isActive(key: string): boolean {
		return selectedKeys === null || selectedKeys.includes(key);
	}
</script>

{#if tooltipVisible && hoveredSlice}
	<TooltipCard
		title={hoveredSlice.data.label}
		x={tooltipX}
		y={tooltipY}
		rows={[
			{ key: 'Count', value: String(hoveredSlice.data.count) },
			{
				key: 'Share',
				value: `${Math.round((hoveredSlice.data.count / rows.length) * 100)}%`
			}
		]}
		swatches={[{ color: hoveredSlice.data.color, label: hoveredSlice.data.label }]}
	/>
{/if}

<Card title="# of UOAs per priority flag" subtitle="Click a slice to filter.">
	<div bind:offsetWidth={containerWidth}>
		{#if rows.length === 0}
			<p class="text-base-content/75 py-8 text-center text-sm">No data matches current filters.</p>
		{:else}
			<div class="flex flex-col items-center justify-center gap-6">
				<!-- Donut — Chart wrapper matches Arcs.svelte template pattern -->
				<Chart {dimensions} overflow="visible">
					<g transform="translate({cx},{cy})">
						{#each arcData as d (d.data.key)}
							{@const isHov = hoveredKey === d.data.key}
							{@const active = isActive(d.data.key)}
							<Arc
								{innerRadius}
								outerRadius={isHov ? outerRadius + 8 : outerRadius}
								startAngle={d.startAngle}
								endAngle={d.endAngle}
								cornerRadius={3}
								padAngle={0.02}
								fill={d.data.color}
								opacity={active ? 1 : 0.25}
								style="transition: opacity 0.15s; cursor: {onsliceclick ? 'pointer' : 'default'}"
								animated
								onmousemove={(e) => {
									showSliceTooltip(e, d);
									moveTooltip(e);
								}}
								onmouseleave={hideTooltip}
								onclick={() => handleSliceClick(d.data.key)}
							/>
						{/each}
						<!-- Centre label -->
						<text
							text-anchor="middle"
							dy="-0.3em"
							style="font-size: 1.4rem; font-weight: 700; fill: currentColor"
							>{Math.round(tweenedTotal.current)}</text
						>
						<text text-anchor="middle" dy="1.1em" style="font-size: 0.7rem; fill: currentColor;"
							>UOAs</text
						>
					</g>
				</Chart>

				<!-- Legend list -->
				<div class="flex flex-col items-start">
					{#each slices as s (s.key)}
						{@const tc = tweenedCounts.current[s.key] ?? 0}
						{@const absent = s.count === 0}
						<div class="legend-item" class:absent>
							<button
								class="btn btn-ghost hover:bg-base-200 btn-xs"
								style:opacity={absent ? 0.35 : isActive(s.key) ? 1 : 0.5}
								style:pointer-events={absent ? 'none' : 'auto'}
								onclick={() => handleSliceClick(s.key)}
								aria-label="Filter by {s.label}"
							>
								<span class="h-3 w-3 rounded-full" style:background-color={s.color}></span>
								<span>{Math.round(tc)}</span>
								<span> {s.label}</span>
								<span class="text-base-content">
									{absent ? '(0%)' : `(${Math.round((tc / rows.length) * 100)}%)`}
								</span>
							</button>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</Card>
