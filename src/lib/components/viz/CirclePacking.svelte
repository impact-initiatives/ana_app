<script lang="ts">
	import * as d3 from 'd3';
	import { onDestroy, untrack } from 'svelte';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { SvelteMap } from 'svelte/reactivity';
	import type { Metric } from '$lib/types/structure';
	import {
		systemFillColor,
		factorColor,
		subfactorColor,
		dotFill,
		indicatorFillColor,
		metricFillColor,
		systemBaseColor
	} from '$lib/utils/colors';
	import TooltipCard from '$lib/components/ui/TooltipCard.svelte';

	// Typing for the hierarchical pack datum produced by the generator.
	type PackDatum = {
		name: string;
		children?: PackDatum[];
		value?: number;
		id?: string;
		metric?: Metric;
	};

	interface Props {
		data?: PackDatum | null;
		/** A single flagged row keyed by indicator id, e.g. { IND001: 1.2, IND001_status: 'flag', … } */
		flagRow?: Record<string, unknown> | null;
		systemLabelFontSize?: number;
		factorLabelFontSize?: number;
		subfactorLabelFontSize?: number;
		labelThreshold?: number;
		labelInset?: number;
		nodePadding?: number;
		paddingByDepth?: Record<number, number>;
	}

	let {
		data = null,
		flagRow = null,
		systemLabelFontSize = 15,
		factorLabelFontSize = 13,
		subfactorLabelFontSize = 10,
		labelThreshold = 12,
		labelInset = 4,
		nodePadding = 3,
		paddingByDepth = { 0: 12, 1: 8, 2: 6, 3: 4 }
	}: Props = $props();

	// Chart size
	const width = 928;
	const height = width;

	// Pack layout (derived)
	const pack = $derived(
		d3
			.pack<PackDatum>()
			.size([width, height])
			.padding((n: d3.HierarchyCircularNode<PackDatum>) => paddingByDepth?.[n.depth] ?? nodePadding)
	);

	// Build hierarchy when `data` changes
	const hierarchy = $derived.by(() => {
		if (!data) return null;
		return d3
			.hierarchy<PackDatum>(data)
			.sum((d: PackDatum) => d.value ?? 0)
			.sort(
				(a: d3.HierarchyNode<PackDatum>, b: d3.HierarchyNode<PackDatum>) =>
					(b.value ?? 0) - (a.value ?? 0)
			);
	});

	const root = $derived(hierarchy ? pack(hierarchy) : null);

	// ── Zoom state ───────────────────────────────────────────────────────────────
	let view = $state<[number, number, number] | null>(null);
	let zoomTimer: d3.Timer | null = null;
	let subfactorLabelTimer: ReturnType<typeof setTimeout> | null = null;
	let currentFocus = $state<d3.HierarchyCircularNode<PackDatum> | null>(null);
	let showSubfactorLabels = $state(false);

	const k = $derived(view ? width / view[2] : 1);

	// ── Layout tween (animates circles between packed layouts on data change) ──
	type NodePos = { x: number; y: number; r: number };
	let prevPositions = new SvelteMap<string, NodePos>();
	let currPositions = new SvelteMap<string, NodePos>();
	const layoutT = new Tween(1, { duration: 0 });
	let layoutVersion = 0;

	// Reset to root and animate layout whenever data changes
	$effect(() => {
		if (!root) return;
		// Copy current → previous without tracking currPositions as a dependency
		// (reading currPositions inside $effect would cause an infinite reactive loop)
		prevPositions.clear();
		untrack(() => {
			for (const [nk, nv] of currPositions) prevPositions.set(nk, nv);
		});
		// Overwrite current with new root layout
		currPositions.clear();
		for (const node of root.descendants()) {
			currPositions.set(node.data.id ?? node.data.name, { x: node.x, y: node.y, r: node.r });
		}
		currentFocus = root;
		view = [root.x, root.y, root.r * 2];
		const v = ++layoutVersion;
		layoutT.set(0, { duration: 0 }).then(() => {
			if (layoutVersion !== v) return;
			layoutT.set(1, { duration: 650, easing: cubicOut });
		});
	});

	function zoomTo(target: d3.HierarchyCircularNode<PackDatum>, event?: MouseEvent | KeyboardEvent) {
		if (!view) return;
		if (zoomTimer) {
			zoomTimer.stop();
			zoomTimer = null;
		}
		// Reset subfactor labels only when going back to root
		if (target.depth === 0) {
			if (subfactorLabelTimer) {
				clearTimeout(subfactorLabelTimer);
				subfactorLabelTimer = null;
			}
			showSubfactorLabels = false;
		}
		const from: [number, number, number] = [view[0], view[1], view[2]];
		const to: [number, number, number] = [target.x, target.y, target.r * 2];
		const duration = event instanceof MouseEvent && event.altKey ? 7500 : 750;
		const interp = d3.interpolateZoom(from, to);
		currentFocus = target;
		zoomTimer = d3.timer((elapsed) => {
			const t = Math.min(elapsed / duration, 1);
			view = interp(d3.easeCubicInOut(t));
			if (t >= 1) {
				zoomTimer!.stop();
				zoomTimer = null;
				// Show subfactor labels once when first entering a non-root view
				if (target.depth >= 1 && !showSubfactorLabels) {
					subfactorLabelTimer = setTimeout(() => {
						showSubfactorLabels = true;
					}, 50);
				}
			}
		});
	}

	// Arc helpers for curved text
	function polarToCartesian(
		centerX: number,
		centerY: number,
		radius: number,
		angleInDegrees: number
	) {
		const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
		return {
			x: centerX + radius * Math.cos(angleInRadians),
			y: centerY + radius * Math.sin(angleInRadians)
		};
	}

	function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
		const start = polarToCartesian(x, y, radius, endAngle);
		const end = polarToCartesian(x, y, radius, startAngle);
		const largeArcFlag = Math.abs(endAngle - startAngle) > 180 ? '1' : '0';
		const d = ['M', start.x, start.y, 'A', radius, radius, 0, largeArcFlag, 1, end.x, end.y].join(
			' '
		);
		return d;
	}

	function sanitizeId(id: string | undefined): string {
		if (!id) return 'unknown';
		return String(id).replace(/[^a-z0-9_-]/gi, '-');
	}

	// ── Color helper (eliminates IIFE + fixes d.parent.children narrowing) ─────────
	function circleColor(d: d3.HierarchyCircularNode<PackDatum>): string {
		if (d.depth === 0) return 'none';
		const systemId = d
			.ancestors()
			.map((a) => a.data.id ?? a.data.name)
			.reverse()[1];
		if (d.depth === 1) return systemFillColor(systemId);
		const siblings = d.parent?.children ?? [];
		const idx = siblings.indexOf(d);
		if (d.depth === 2) return factorColor(systemId, idx, siblings.length);
		if (d.depth === 3) return subfactorColor(systemId, idx, idx, siblings.length);
		if (d.depth === 4) return indicatorFillColor(systemId);
		// depth 5 = metric leaf — color by flag status when flagRow provided
		if (!d.children && d.data.id && flagRow) {
			const flagLabel = String(flagRow[`${d.data.id}_status`] ?? 'no_data');
			return dotFill(flagLabel);
		}
		return metricFillColor(systemId);
	}

	// ── Keyboard helper ───────────────────────────────────────────────────────────
	function handleNodeKeydown(e: KeyboardEvent, d: d3.HierarchyCircularNode<PackDatum>) {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		e.preventDefault();
		const parent = d.parent ?? root;
		if (!d.children) {
			if (root) zoomTo(root, e);
		} else if (currentFocus && d.depth <= currentFocus.depth) {
			if (parent) zoomTo(parent, e);
		} else {
			zoomTo(d, e);
		}
		e.stopPropagation();
	}

	// ── Tooltip (Svelte $state, position: fixed) ──────────────────────────────────
	type TooltipLine = { key: string; rest: string };
	type TooltipState = {
		visible: boolean;
		cursorX: number;
		cursorY: number;
		title: string;
		titleColor: string;
		lines: TooltipLine[];
	};

	let tooltip = $state<TooltipState>({
		visible: false,
		cursorX: 0,
		cursorY: 0,
		title: '',
		titleColor: '#111',
		lines: []
	});

	let showTimer: ReturnType<typeof setTimeout> | null = null;
	let hideTimer: ReturnType<typeof setTimeout> | null = null;

	function showTooltip(e: MouseEvent, node: d3.HierarchyCircularNode<PackDatum>) {
		if (node.depth === 0) return;
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
		if (showTimer) {
			clearTimeout(showTimer);
			showTimer = null;
		}
		showTimer = setTimeout(() => {
			const met = node.data.metric;
			const systemId = node
				.ancestors()
				.map((a) => a.data.id ?? a.data.name)
				.reverse()[1];
			const titleColor = systemBaseColor(systemId);
			let title: string;
			let lines: TooltipLine[];
			if (met && flagRow) {
				// Flag-aware tooltip: show value, status, threshold
				const id = met.metric;
				title = met.label ? `${met.label} (${id})` : id;
				const rawValue = flagRow[id];
				const flagLabel = String(flagRow[`${id}_status`] ?? 'no_data');
				const within10 = flagRow[`${id}_within_10perc`];
				const statusText =
					flagLabel === 'flag' ? 'Flagged' : flagLabel === 'no_flag' ? 'Not flagged' : 'Missing';
				lines = [
					{ key: 'Value', rest: rawValue != null ? String(rawValue) : '—' },
					{ key: 'Status', rest: statusText }
				];
				if (met.thresholds?.an != null)
					lines.push({ key: 'AN threshold', rest: String(met.thresholds.an) });
				if (met.above_or_below) lines.push({ key: 'Direction', rest: met.above_or_below });
				if (within10 != null)
					lines.push({ key: 'Within 10% of threshold', rest: within10 ? 'Yes' : 'No' });
			} else if (met) {
				title = met.label ? `${met.label} (${met.metric})` : met.metric;
				const parts: string[] = [];
				if (met.type) parts.push(`Type: ${met.type}`);
				if (met.preference != null) parts.push(`Preference: ${met.preference}`);
				if (met.above_or_below) parts.push(`Threshold direction: ${met.above_or_below}`);
				if (met.thresholds)
					parts.push(`AN: ${met.thresholds.an ?? '—'}  VAN: ${met.thresholds.van ?? '—'}`);
				if (met.risk_concept) parts.push(`Risk concept: ${met.risk_concept}`);
				lines = parts.map((l) => {
					const [key, ...rest] = l.split(': ');
					return { key, rest: rest.join(': ') };
				});
			} else {
				title = node.data.name;
				lines = [{ key: 'Value', rest: String(node.value ?? 0) }];
			}
			tooltip = {
				visible: true,
				cursorX: e.clientX,
				cursorY: e.clientY,
				title,
				titleColor,
				lines
			};
		}, 50);
	}

	function moveTooltip(e: MouseEvent) {
		if (!tooltip.visible) return;
		tooltip.cursorX = e.clientX;
		tooltip.cursorY = e.clientY;
	}

	function hideTooltip() {
		if (showTimer) {
			clearTimeout(showTimer);
			showTimer = null;
		}
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
		hideTimer = setTimeout(() => {
			tooltip.visible = false;
		}, 150);
	}

	function keepTooltip() {
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
	}

	let hoveredNode = $state<d3.HierarchyCircularNode<PackDatum> | null>(null);

	onDestroy(() => {
		if (showTimer) {
			clearTimeout(showTimer);
			showTimer = null;
		}
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
		if (zoomTimer) {
			zoomTimer.stop();
			zoomTimer = null;
		}
		if (subfactorLabelTimer) {
			clearTimeout(subfactorLabelTimer);
			subfactorLabelTimer = null;
		}
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<svg
	{width}
	{height}
	viewBox="{-width / 2} {-height / 2} {width} {height}"
	role="application"
	aria-label="Zoomable circle packing chart — click to zoom out"
	style:max-width="100%"
	style:height="auto"
	style:font="10px"
	onclick={() => root && zoomTo(root)}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			if (root) zoomTo(root, e);
		}
	}}
>
	<g class="data">
		{#if root}
			{#each root.descendants() as d (d.data.id)}
				{@const _id = d.data.id ?? d.data.name}
				{@const _t = layoutT.current}
				{@const _prev = prevPositions.get(_id)}
				{@const ix = _prev != null ? _prev.x + (d.x - _prev.x) * _t : d.x}
				{@const iy = _prev != null ? _prev.y + (d.y - _prev.y) * _t : d.y}
				{@const ir = _prev != null ? _prev.r + (d.r - _prev.r) * _t : d.r * _t}
				<g
					role="button"
					tabindex={d.depth > 0 ? 0 : -1}
					aria-label={d.data.name}
					transform="translate({view ? (ix - view[0]) * k : 0}, {view ? (iy - view[1]) * k : 0})"
					onmouseenter={(e) => {
						if (d.depth !== 0) {
							hoveredNode = d;
							showTooltip(e as MouseEvent, d);
						}
					}}
					onmousemove={(e) => d.depth !== 0 && moveTooltip(e as MouseEvent)}
					onmouseleave={() => {
						if (d.depth !== 0) {
							hoveredNode = null;
							hideTooltip();
						}
					}}
					onclick={(e) => {
						const parent = d.parent ?? root;
						if (!d.children) {
							if (root) zoomTo(root, e);
						} else if (currentFocus && d.depth <= currentFocus.depth) {
							if (parent) zoomTo(parent, e);
						} else {
							zoomTo(d, e);
						}
						e.stopPropagation();
					}}
					onkeydown={(e) => handleNodeKeydown(e, d)}
				>
					<circle
						fill={circleColor(d)}
						stroke="CurrentColor"
						class="text-base-content"
						stroke-width={hoveredNode === d ? 2.5 : 1}
						r={ir * k}
					/>

					<!-- curved arc labels for depth 1, 2, 3 (subfactors shown when zoomed in), and 4 (indicators at factor zoom or deeper) -->
					{#if (d.depth === 1 || d.depth === 2 || (d.depth === 3 && showSubfactorLabels) || (d.depth === 4 && (currentFocus?.depth ?? 0) >= 2)) && ir * k > labelThreshold}
						{@const arcId = `arc-${sanitizeId(d.data.id ?? d.data.name)}-${d.depth}`}
						{@const inset = d.depth === 1 ? labelInset : Math.max(2, labelInset - 2)}
						{@const arcR = Math.max(6, ir * k + inset)}
						{@const relDepth = d.depth - (currentFocus?.depth ?? 0)}
						<path
							id={arcId}
							d={describeArc(0, 0, arcR, 160, -160)}
							fill="none"
							pointer-events="none"
						/>
						<text
							style="font-size: {relDepth === 1
								? systemLabelFontSize
								: relDepth === 2
									? factorLabelFontSize
									: subfactorLabelFontSize}px; transition: font-size 750ms cubic-bezier(0.645, 0.045, 0.355, 1.000);"
							font-family="'Roboto Condensed'"
							text-anchor="middle"
							fill="currentColor"
							class="text-base-content"
							pointer-events="none"
						>
							<textPath href={`#${arcId}`} startOffset="50%">{d.data.name}</textPath>
						</text>
					{/if}

					{#if !d.children && d.data.id && ir * k > 10}
						<text
							clip-path={`circle(${ir * k})`}
							x={0}
							y={0}
							text-anchor="middle"
							dominant-baseline="middle"
							font-size={Math.min(10, ir * k * 0.4)}
							pointer-events="none">{d.data.id}</text
						>
					{/if}
				</g>
			{/each}
		{/if}
	</g>
</svg>

{#if tooltip.visible}
	<TooltipCard
		title={tooltip.title}
		titleColor={tooltip.titleColor}
		rows={tooltip.lines.map((l) => ({ key: l.key, value: l.rest }))}
		x={tooltip.cursorX}
		y={tooltip.cursorY}
		pointerEvents={true}
		onmouseenter={keepTooltip}
		onmouseleave={hideTooltip}
	/>
{/if}

<style>
	/* Remove click-focus outline; keep it for keyboard navigation */
	svg:focus,
	svg *:focus:not(:focus-visible) {
		outline: none;
	}
</style>
