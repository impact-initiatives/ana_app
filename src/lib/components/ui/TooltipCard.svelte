<script lang="ts">
	export interface TooltipRow {
		key: string;
		value: string;
	}

	export interface TooltipSwatch {
		/** CSS colour string — hex, oklch, var(…), etc. */
		color: string;
		label: string;
	}

	export interface TooltipBadge {
		label: string;
		/** DaisyUI badge modifier class — leave empty when using style instead */
		cls: string;
		/** Optional inline style override (takes precedence over cls for colour) */
		style?: string;
	}

	interface Props {
		/** Heading text */
		title: string;
		/** Optional CSS colour for the title text; defaults to base-content */
		titleColor?: string | null;
		/** Optional badge rendered inline after the title */
		badge?: TooltipBadge | null;
		/** Key/value body rows */
		rows?: TooltipRow[];
		/** Coloured swatch rows (rendered before key/value rows) */
		swatches?: TooltipSwatch[];
		/** Raw cursor X in viewport px — component handles edge-clamping */
		x: number;
		/** Raw cursor Y in viewport px — component handles edge-clamping */
		y: number;
		/** Allow mouse to enter the tooltip (e.g. for circle-packing hover-stay) */
		pointerEvents?: boolean;
		onmouseenter?: () => void;
		onmouseleave?: () => void;
	}

	let {
		title,
		titleColor = null,
		badge = null,
		rows = [],
		swatches = [],
		x,
		y,
		pointerEvents = false,
		onmouseenter,
		onmouseleave
	}: Props = $props();

	// ── Viewport-edge clamping ────────────────────────────────────────────────
	let el: HTMLDivElement | undefined = $state();
	const OFFSET = 14;
	let left = $state(0);
	let top = $state(0);

	$effect(() => {
		// Re-run whenever cursor position or element size changes
		const cx = x;
		const cy = y;
		if (!el) {
			left = cx + OFFSET;
			top = cy + OFFSET;
			return;
		}
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const w = el.offsetWidth;
		const h = el.offsetHeight;
		let lx = cx + OFFSET;
		let ly = cy + OFFSET;
		if (lx + w > vw) lx = Math.max(8, cx - w - OFFSET);
		if (ly + h > vh) ly = Math.max(8, cy - h - OFFSET);
		left = lx;
		top = ly;
	});
</script>

<div
	bind:this={el}
	class="border-base-300 bg-base-100 fixed z-50 max-w-xs min-w-36 rounded-lg border px-3 py-2 text-xs shadow-sm"
	style:left="{left}px"
	style:top="{top}px"
	style:pointer-events={pointerEvents ? 'auto' : 'none'}
	role="tooltip"
	{onmouseenter}
	{onmouseleave}
>
	<!-- Title row -->
	<div class="mb-1 flex items-center gap-1.5">
		<span class="text-base font-semibold" style:color={titleColor ?? undefined}>{title}</span>
		{#if badge}
			<span class="badge {badge.cls} badge-sm" style={badge.style}>{badge.label}</span>
		{/if}
	</div>

	<!-- Swatch rows -->
	{#each swatches as sw (sw.label)}
		<div class="text-base-content/85 flex items-center gap-1.5">
			<span class="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style:background-color={sw.color}
			></span>
			<span>{sw.label}</span>
		</div>
	{/each}

	<!-- Key/value rows -->
	{#each rows as row (row.key)}
		<div class="mt-0.5">
			<span class="font-semibold"> {row.key}</span>:&nbsp;<span>{row.value}</span>
		</div>
	{/each}
</div>
