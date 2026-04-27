---
name: svelte-d3
description: Write correct, idiomatic Svelte 5 × D3 visualizations. Load this skill whenever building or reviewing chart components (.svelte) that use D3 in this project. Reference patterns are drawn from https://github.com/OwnKng/svelte-d3 adapted for Svelte 5 runes.
---

# Svelte 5 × D3 Visualization Skill

Reference: https://github.com/OwnKng/svelte-d3 / https://svelted3.vercel.app/

> **Warning — upstream repo uses Svelte 4.**  
> All code in OwnKng/svelte-d3 is written in Svelte 4: `export let` instead of `$props()`, `$:` instead of `$derived`/`$effect`, `on:click` instead of `onclick`, `bind:clientWidth` reactive blocks, `<slot>`, etc.  
> Any component fetched from upstream **must be ported to Svelte 5 runes** before use.  
> Always load `/svelte-core-bestpractices` and `/svelte-code-writer` alongside this skill when fetching or porting upstream components.

---

## Core Rule: D3 for math, Svelte for DOM

**Never** use `d3.select()`, `d3.append()`, `d3.transition()`, or any D3 DOM manipulation. D3 is used **only** for:

- Scales — `scaleLinear`, `scaleBand`, `scaleOrdinal`, `scaleTime`, …
- Shape generators — `arc`, `pie`, `line`, `area`, `stack`, …
- Layout algorithms — `pie`, `histogram`, `pack`, `force`, …
- Math utilities — `extent`, `max`, `min`, `sum`, `bin`, …
- Geo projections — `geoPath`, `geoMercator`, …

Svelte `{#each}` renders all SVG elements. D3 outputs geometry (path strings, x/y coords, widths) that Svelte binds directly.

```svelte
<!-- D3 computes arc path strings -->
const arcGen = $derived(arc().innerRadius(r * 0.5).outerRadius(r)); const arcData = $derived(pie()(slices));

<!-- Svelte renders the DOM -->
{#each arcData as d (d.data.key)}
	<path d={arcGen(d)} fill={d.data.color} />
{/each}
```

---

## Responsive Width Pattern

Use Svelte 5's built-in **dimension bindings** — `bind:offsetWidth`, `bind:clientWidth`, etc. These are backed by `ResizeObserver` internally and are the idiomatic approach. Do **not** manually set up a `ResizeObserver` via `{@attach}` or `$effect`.

```svelte
let containerWidth = $state(0); // In template:
<div class="w-full" bind:offsetWidth={containerWidth}>
	<svg width={containerWidth} height={svgHeight}>…</svg>
</div>
```

Available dimension bindings (all readonly, all use ResizeObserver under the hood):

- `bind:clientWidth` / `bind:clientHeight` — excludes border and scrollbar
- `bind:offsetWidth` / `bind:offsetHeight` — includes border
- `bind:contentRect` — full ResizeObserverEntry.contentRect

> Note: `display: inline` elements cannot be observed — use `inline-block` or `block` on the wrapper div.

The `{@attach}` pattern with a manual ResizeObserver still works but is verbose and unnecessary for simple width tracking.

---

## Margin Convention

```ts
const margin = { top: 20, right: 20, bottom: 30, left: 50 };
const innerWidth = $derived(Math.max(containerWidth - margin.left - margin.right, 0));
const innerHeight = $derived(Math.max(height - margin.top - margin.bottom, 0));
```

SVG structure — always wrap content in a `<g>` translated by margins:

```svelte
<svg width={containerWidth} height={svgHeight}>
	<g transform="translate({margin.left},{margin.top})">
		<!-- all chart content here, coords relative to inner area -->
	</g>
</svg>
```

---

## Primitives

Primitives live in `src/lib/components/viz/primitives/`. Always check here before writing custom SVG elements.

### Project primitives (already ported to Svelte 5)

| File                              | Props                                                                 | Purpose                                      |
| --------------------------------- | --------------------------------------------------------------------- | -------------------------------------------- |
| `primitives/XAxis.svelte`         | `scale`, `innerWidth`, `innerHeight`, `numberOfTicks?`, `tickValues?` | Horizontal axis with baseline, ticks, labels |
| `primitives/ThresholdLine.svelte` | `x`, `height`, `label?`, `color?`                                     | Vertical dashed threshold line               |
| `primitives/Dot.svelte`           | (see file)                                                            | Single data point circle for beeswarm        |
| `primitives/FlagTooltip.svelte`   | (see file)                                                            | Hover tooltip for flagged indicators         |

### Fetching from svelte-d3 upstream (download only when needed)

**Always check first** — before fetching anything, use Glob to check if the file already exists in `src/lib/components/viz/primitives/` or `src/lib/components/viz/`. If it exists, use it directly.

**Upstream catalogue** — https://svelted3.vercel.app/

| Category    | Available upstream                                                                                                                                                                                    | Local path when added                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Full charts | Scatter, Beeswarm/Beeswarms, Bar chart, Stacked bars, Histogram, Line chart, Multi-line, Difference area, Diverging area, Diverging bar, Dumbell, Polar bar/dumbell/stack, Radar, Voronoi, Arcs/Donut | `src/lib/components/viz/`            |
| Primitives  | Arc, Bar, Area, Line, Circle, Group, Triangle, Arrow, Spike                                                                                                                                           | `src/lib/components/viz/primitives/` |
| Helpers     | Chart, Axis, AxisBottom, AxisLeft, AxisTop, Group, Grid, GridRows, Panel, ClipPath, Gradient, Legend (LegendOrdinal), Tooltip, TooltipWithBounds                                                      | `src/lib/components/viz/primitives/` |

Browse demos: https://svelted3.vercel.app/scatter, /beeswarms, /stacks, /histogram, etc.

**Workflow when a component is needed:**

1. Load `/svelte-core-bestpractices` and `/svelte-code-writer` — required when porting any upstream Svelte 4 code
2. Check locally: `Glob("src/lib/components/viz/**/*Name*.svelte")`
3. If not found, fetch from upstream:

```bash
# Primitive or helper
gh api "repos/OwnKng/svelte-d3/contents/src/visualisations/primatives/Bar.svelte" --jq '.content' | base64 -d
# Full chart
gh api "repos/OwnKng/svelte-d3/contents/src/visualisations/charts/Scatter.svelte" --jq '.content' | base64 -d
# Helper
gh api "repos/OwnKng/svelte-d3/contents/src/visualisations/helpers/AxisBottom.svelte" --jq '.content' | base64 -d
```

4. Port to Svelte 5 (see Key Differences table — the upstream is Svelte 4 throughout)
5. Run `bunx @sveltejs/mcp svelte-autofixer` on the result
6. Save to the appropriate local path

**Tooltip and Legend — choose based on need:**

- For a generic tooltip or ordinal legend (any data, no project-specific colors), use upstream `Tooltip`/`TooltipWithBounds` or `LegendOrdinal` — port and add to `primitives/`
- For flag/classification-specific display (prelim flags, system status colors), use the project's `TooltipCard` and `LegendBadge` which already know the color tokens

---

## Arc / Donut Pattern

```ts
import { pie, arc } from 'd3-shape';

// Geometry only — no DOM
const pieGen = $derived(pie<Slice>().value(d => d.count).sort(null).padAngle(0.02));
const arcGen = $derived(
  arc<ReturnType<typeof pieGen>[number]>()
    .innerRadius(effectiveRadius * 0.52)
    .outerRadius(effectiveRadius)
    .cornerRadius(3)
);
const arcHoverGen = $derived(
  arc<ReturnType<typeof pieGen>[number]>()
    .innerRadius(effectiveRadius * 0.52)
    .outerRadius(effectiveRadius + 8)
    .cornerRadius(3)
);
const arcData = $derived(slices.length > 0 ? pieGen(slices) : []);
```

```svelte
<g transform="translate({cx},{cy})">
	{#each arcData as d (d.data.key)}
		{@const pathD = (hoveredKey === d.data.key ? arcHoverGen(d) : arcGen(d)) ?? ''}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<path
			d={pathD}
			fill={d.data.color}
			opacity={isActive(d.data.key) ? 1 : 0.25}
			style="transition: opacity 0.15s, d 0.1s; cursor: pointer"
			onmousemove={(e) => {
				showTooltip(e, d);
			}}
			onmouseleave={hideTooltip}
			onclick={() => handleSliceClick(d.data.key)}
		/>
	{/each}
</g>
```

For responsive radius — derive from container, not hardcoded:

```ts
const effectiveRadius = $derived(radius ?? Math.min(Math.floor(containerWidth / 2.8), 120));
```

---

## Stacked Bar Pattern

```ts
import { scaleLinear, scaleBand } from 'd3-scale';

const xScale = $derived(scaleLinear().domain([0, total || 1]).range([0, barWidth]));
const yScale = $derived(scaleBand().domain(items.map(s => s.id)).range([0, height]).padding(0.2));

function stackedSegments(bar: Bar) {
  let x = 0;
  return SEGMENT_KEYS.map(key => {
    const w = xScale(bar.counts[key]);
    const seg = { key, x, width: w, count: bar.counts[key] };
    x += w;
    return seg;
  }).filter(s => s.width > 0);
}
```

```svelte
{#each bars as bar (bar.id)}
  {@const y = yScale(bar.id) ?? 0}
  {@const bh = yScale.bandwidth()}
  {#each stackedSegments(bar) as seg (seg.key)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <rect
      x={seg.x} {y} width={seg.width} height={bh}
      style="fill: var({colorVar})"
      onmousemove={…} onmouseleave={…}
    />
  {/each}
{/each}
```

Already used in `SystemCoverageBars.svelte`.

---

## Tooltip Pattern

Use `TooltipCard.svelte` with `clientX/clientY`. **Not** absolute-positioned divs or OwnKng's Tooltip.

```ts
let tooltipVisible = $state(false);
let tooltipX = $state(0);
let tooltipY = $state(0);

function showTooltip(e: MouseEvent, data: SomeType) {
  tooltipX = e.clientX;
  tooltipY = e.clientY;
  tooltipVisible = true;
}
function hideTooltip() { tooltipVisible = false; }
```

```svelte
{#if tooltipVisible}
	<TooltipCard
		x={tooltipX}
		y={tooltipY}
		title="…"
		rows={[{ key: 'Count', value: '42' }]}
		swatches={[{ color: '#ff0000', label: 'EM' }]}
	/>
{/if}
```

---

## Legend Pattern

Use `LegendBadge.svelte` — **not** OwnKng's `LegendOrdinal` (which uses D3 scaleOrdinal).

```svelte
import LegendBadge from '$lib/components/ui/LegendBadge.svelte';

<!-- Prelim flag legend -->
<LegendBadge
	prelimKeys={['EM', 'ROEM', 'ACUTE', 'ACUTE_NEEDS', 'INSUFFICIENT_EVIDENCE', 'NO_DATA']}
/>

<!-- System status legend -->
<LegendBadge statusKeys={['flag', 'no_flag', 'insufficient_evidence', 'no_data']} />
```

---

## Color Tokens

Always use project color tokens, **not** D3 color palettes (`colorPalette`, `schemeCategory10`, etc.):

```ts
import { prelimBadge, FLAG_BADGE, systemBaseColor } from '$lib/utils/colors';

prelimBadge[key].bg        // hex fill — e.g. '#ef4444'
prelimBadge[key].label     // display label — e.g. 'Emergency'
FLAG_BADGE[key].tintVar          // CSS var name — e.g. '--color-flag-tint'
FLAG_BADGE[key].label            // display label
systemBaseColor(systemId)        // hex color per system
```

For inline SVG style with dynamic colors, use the Svelte style directive:

```svelte
<span style:background-color={s.color}></span>
<!-- or CSS custom property for Tailwind bg-[--var] -->
<span class="bg-[--swatch]" style="--swatch: {s.color}"></span>
```

---

## SVG a11y

Svelte emits compiler warnings on `<path>`, `<rect>`, etc. that have `onmousemove`/`onclick` handlers. The warnings ARE real — `svelte-ignore` silences them but doesn't fix the underlying accessibility gap.

**Preferred approach** — mark the SVG as a self-describing image so individual paths are treated as presentational:

```svelte
<svg role="img" aria-label="Classification distribution donut chart" …>
  <!-- individual paths need no role/tabindex -->
  <path onmousemove={…} onclick={…} />
</svg>
```

With `role="img"` on the `<svg>`, Svelte will still warn on the inner elements. Use `svelte-ignore` only where `role="img"` alone is insufficient:

```svelte
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<path onclick={…} onmousemove={…} />
```

For hover-only (no click), only the first ignore is needed:

```svelte
<!-- svelte-ignore a11y_no_static_element_interactions -->
<rect onmousemove={…} onmouseleave={…} />
```

---

## Animation

Three options in order of preference:

**1. `svelte/transition` and `svelte/animate`** _(preferred — CSS-generated under the hood)_  
Use for enter/leave transitions on elements and keyed list reordering. Works in SVG too:

```svelte
import {(fade, scale)} from 'svelte/transition';

{#each items as item (item.id)}
	<g transition:fade={{ duration: 200 }}>…</g>
{/each}
```

`animate:flip` for reordering, `in:`/`out:` for asymmetric enter/leave.

**2. CSS `transition` / `style` attribute** — good for simple continuous property changes (opacity, color, stroke) on SVG elements that are always in the DOM:

```svelte
<path style="transition: opacity 0.15s, d 0.1s" d={…} opacity={…} />
```

**3. `Tween` from `svelte/motion`** _(Svelte 5.8+)_ — for value-driven animations where you need programmatic control (e.g. animating an arc angle reactively):

```svelte
import { Tween } from 'svelte/motion';
import { cubicOut } from 'svelte/easing';

const angle = new Tween(0, { duration: 600, easing: cubicOut });
// angle.target = newValue  →  angle.current animates toward it
```

Use `Tween.of(() => reactiveExpression)` to bind to a derived value automatically.

**Avoid** the old `tweened()` store API — use the class-based `Tween` instead.

---

## Key Differences from OwnKng's Svelte 4 Code

| OwnKng (Svelte 4)           | This project (Svelte 5)                      |
| --------------------------- | -------------------------------------------- |
| `export let prop = value`   | `let { prop = value } = $props()`            |
| `$: derived = expr`         | `const derived = $derived(expr)`             |
| `$: { multi-step }`         | `const x = $derived.by(() => { … })`         |
| `bind:clientWidth={w}`      | `{@attach observeWidth}` with ResizeObserver |
| `on:click={fn}`             | `onclick={fn}`                               |
| `on:mousemove={fn}`         | `onmousemove={fn}`                           |
| `<slot />`                  | `{@render children?.()}`                     |
| `setContext` / `getContext` | same, but prefer typed `createContext`       |
| `tweened` animation         | CSS `transition` preferred                   |

---

## Checklist Before Finalizing Any New Chart

1. D3 only for math — no `d3.select()` anywhere
2. `{@attach observeWidth}` for responsive width — not `bind:clientWidth`
3. Margin convention — `<g transform="translate(…)">` wraps all chart content
4. Reuse `XAxis`, `ThresholdLine`, `Dot`, `FlagTooltip` where applicable
5. `TooltipCard` for hover tooltips
6. `LegendBadge` for legends
7. Project color tokens — `prelimBadge`, `FLAG_BADGE`, `systemBaseColor`
8. `svelte-ignore` comments on interactive SVG elements
9. Run `npx @sveltejs/mcp svelte-autofixer ./path/to/Component.svelte` before finalizing
