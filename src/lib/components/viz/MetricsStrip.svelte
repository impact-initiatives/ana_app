<script lang="ts">
	import { scaleLinear } from 'd3-scale';
	import Chart from './primitives/Chart.svelte';
	import DotMark from './primitives/Dot.svelte';
	import ThresholdLine from './primitives/ThresholdLine.svelte';
	import XAxis from './primitives/XAxis.svelte';
	import FlagTooltip from './primitives/FlagTooltip.svelte';

	interface DotData {
		uoa: string;
		value: number;
		flagLabel: string;
		within10: boolean | null;
	}

	interface Props {
		threshold: number | null;
		direction: string | null;
		dots: DotData[];
		height?: number;
	}

	let { threshold, direction, dots, height = 120 }: Props = $props();

	const MARGIN = { top: 8, right: 12, bottom: 24, left: 12 };
	const R = 6;

	let containerWidth = $state(0);

	const visibleDots = $derived(dots.filter((d) => d.flagLabel !== 'no_data'));

	const dimensions = $derived.by(() => {
		const w = Math.max(containerWidth, 60);
		const innerWidth = w - MARGIN.left - MARGIN.right;
		const innerHeight = height - MARGIN.top - MARGIN.bottom;
		return { width: w, height, margins: MARGIN, innerWidth, innerHeight };
	});

	const xScale = $derived.by(() => {
		const vals = visibleDots.map((d) => d.value);
		let lo = vals.length ? Math.min(...vals) : 0;
		let hi = vals.length ? Math.max(...vals) : 1;
		if (lo === hi) {
			const pad = Math.abs(lo) * 0.5 || 1;
			lo -= pad;
			hi += pad;
		}
		if (threshold !== null) {
			lo = Math.min(lo, threshold);
			hi = Math.max(hi, threshold);
		}
		return scaleLinear().domain([lo, hi]).nice().range([0, dimensions.innerWidth]);
	});

	// Deterministic beeswarm — sort by value, then greedily resolve overlaps upward/downward.
	// O(n²) in theory but n≤50 in practice, and single-pass with no force iterations.
	const placedDots = $derived.by(() => {
		const { innerHeight } = dimensions;
		const cy0 = innerHeight / 2;
		const step = R * 2 + 2;
		const sorted = [...visibleDots].sort((a, b) => a.value - b.value);
		const placed: Array<{ x: number; y: number }> = [];
		const result: Array<{ x: number; y: number; dot: DotData }> = [];

		for (const dot of sorted) {
			const px = xScale(dot.value);
			const nbrs = placed.filter((p) => Math.abs(p.x - px) < 2 * R);
			let cy = cy0;
			let ok = nbrs.length === 0;
			for (let lvl = 1; !ok && lvl <= 20; lvl++) {
				for (const sign of [1, -1]) {
					cy = cy0 + sign * step * lvl;
					if (nbrs.every((p) => Math.hypot(p.x - px, p.y - cy) >= 2 * R)) {
						ok = true;
						break;
					}
				}
			}
			if (!ok) cy = cy0;
			placed.push({ x: px, y: cy });
			result.push({ x: px, y: cy, dot });
		}
		return result;
	});

	const thresholdX = $derived(threshold !== null ? xScale(threshold) : null);

	let tooltipDot: DotData | null = $state(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
</script>

<div class="w-full" bind:clientWidth={containerWidth}>
	{#if containerWidth > 0}
		<Chart {dimensions}>
			{#if thresholdX !== null}
				<ThresholdLine x={thresholdX} height={dimensions.innerHeight} />
			{/if}
			{#each placedDots as { x, y, dot } (dot.uoa)}
				<DotMark
					cx={x}
					cy={y}
					r={R}
					flagLabel={dot.flagLabel}
					within10={dot.within10}
					onmouseenter={(e) => {
						tooltipDot = dot;
						tooltipX = e.clientX;
						tooltipY = e.clientY;
					}}
					onmousemove={(e) => {
						tooltipDot = dot;
						tooltipX = e.clientX;
						tooltipY = e.clientY;
					}}
					onmouseleave={() => {
						tooltipDot = null;
					}}
				/>
			{/each}
			<XAxis
				scale={xScale}
				innerWidth={dimensions.innerWidth}
				innerHeight={dimensions.innerHeight}
			/>
		</Chart>
	{/if}
</div>

{#if tooltipDot}
	<FlagTooltip
		uoa={tooltipDot.uoa}
		value={tooltipDot.value}
		{threshold}
		{direction}
		flagLabel={tooltipDot.flagLabel}
		within10={tooltipDot.within10}
		x={tooltipX}
		y={tooltipY}
	/>
{/if}
