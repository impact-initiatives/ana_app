# Svelte × D3 Visualization Skill

Reference: https://github.com/OwnKng/svelte-d3 / https://svelted3.vercel.app/

This skill captures the patterns from OwnKng's svelte-d3 reference repo and how they map to this project's Svelte 5 codebase.

---

## Core Pattern: D3 for math, Svelte for DOM

**Never** use `d3.select()`, `d3.append()`, or any D3 DOM manipulation. D3 is used **only** for:

- Scales (`scaleLinear`, `scaleBand`, `scaleOrdinal`, `scaleTime`, …)
- Shape generators (`arc`, `pie`, `line`, `area`, `stack`, …)
- Layout algorithms (`pie`, `histogram`, `pack`, `force`, …)
- Math utilities (`extent`, `max`, `min`, `sum`, `bin`, …)
- Geo projections (`geoPath`, `geoMercator`, …)

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

Use `{@attach}` (Svelte 5) with a `ResizeObserver` — **not** `bind:clientWidth` or `$effect`:

```svelte
let containerWidth = $state(600);

function observeWidth(node: HTMLElement) {
  containerWidth = node.offsetWidth;
  const ro = new ResizeObserver(entries => {
    containerWidth = entries[0]?.contentRect.width ?? containerWidth;
  });
  ro.observe(node);
  return () => ro.disconnect();
}

// In template:
<div class="w-full" {@attach observeWidth}>
  <svg width={containerWidth} height={svgHeight}>…</svg>
</div>
```

This project already uses this pattern in `SystemCoverageBars.svelte`.

---

## Margin Convention

```ts
const margin = { top: 20, right: 20, bottom: 30, left: 50 };
const innerWidth = $derived(Math.max(containerWidth - margin.left - margin.right, 0));
const innerHeight = $derived(Math.max(height - margin.top - margin.bottom, 0));
```

SVG structure:

```svelte
<svg width={containerWidth} height={svgHeight}>
	<g transform="translate({margin.left},{margin.top})">
		<!-- all chart content here, coords relative to inner area -->
	</g>
</svg>
```

---

## Existing Primitives in This Project

These already exist and should be reused:

| File                                          | What it does                                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/components/viz/XAxis.svelte`         | Horizontal axis: baseline + tick marks + labels. Props: `scale`, `innerWidth`, `innerHeight`, `numberOfTicks?`, `tickValues?` |
| `src/lib/components/viz/ThresholdLine.svelte` | Vertical dashed threshold line. Props: `x`, `height`, `label?`, `color?`                                                      |
| `src/lib/components/viz/Dot.svelte`           | Single data point circle. Used in beeswarm.                                                                                   |
| `src/lib/components/viz/FlagTooltip.svelte`   | Hover tooltip for flagged indicators.                                                                                         |

**Do not duplicate these.** Use them when building new charts.

---

## Arc / Donut Pattern

```ts
import { pie, arc } from 'd3-shape';

// Geometry only — no DOM
const pieGen = pie<Slice>().value(d => d.count).sort(null).padAngle(0.02);
const arcGen = arc<ArcDatum>().innerRadius(r * 0.52).outerRadius(r).cornerRadius(3);
const arcHoverGen = arc<ArcDatum>().innerRadius(r * 0.52).outerRadius(r + 8).cornerRadius(3);
const arcData = $derived(pieGen(slices));
```

```svelte
<g transform="translate({cx},{cy})">
  {#each arcData as d (d.data.key)}
    {@const pathD = (isHovered ? arcHoverGen(d) : arcGen(d)) ?? ''}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <path
      d={pathD}
      fill={d.data.color}
      opacity={isActive ? 1 : 0.25}
      style="transition: opacity 0.15s"
      onmousemove={…}
      onmouseleave={…}
      onclick={…}
    />
  {/each}
</g>
```

Key differences from OwnKng (which uses Svelte 4):

- Use `$state`/`$derived` not `$:` reactive statements
- Use `{@attach observeWidth}` not `bind:clientWidth`
- Use `onclick`/`onmousemove` not `on:click`/`on:mousemove`
- No `tweened` store for animation — use CSS `transition` on SVG attributes instead

---

## Stacked Bar Pattern

```ts
import { scaleLinear, scaleBand } from 'd3-scale';

const xScale = $derived(scaleLinear().domain([0, total]).range([0, barWidth]));
const yScale = $derived(scaleBand().domain(categories).range([0, height]).padding(0.2));

function stackedSegments(bar) {
  let x = 0;
  return segments.map(seg => {
    const w = xScale(seg.count);
    const result = { ...seg, x, width: w };
    x += w;
    return result;
  }).filter(s => s.width > 0);
}
```

```svelte
{#each bars as bar (bar.id)}
  {@const y = yScale(bar.id) ?? 0}
  {#each stackedSegments(bar) as seg (seg.key)}
    <rect x={seg.x} y={y} width={seg.width} height={yScale.bandwidth()} fill={…} />
  {/each}
{/each}
```

This project already uses this in `SystemCoverageBars.svelte`.

---

## Tooltip Pattern

This project uses `TooltipCard.svelte` for hover tooltips (uses `position: fixed` and `clientX/Y`).

```svelte
let tooltipVisible = $state(false);
let tooltipX = $state(0);
let tooltipY = $state(0);

function showTooltip(e: MouseEvent, data: …) {
  tooltipX = e.clientX;
  tooltipY = e.clientY;
  tooltipVisible = true;
}

// Template:
{#if tooltipVisible}
  <TooltipCard x={tooltipX} y={tooltipY} title={…} rows={[…]} swatches={[…]} />
{/if}
```

**Do not** use OwnKng's absolute-positioned tooltip pattern — `TooltipCard` is the project standard.

---

## Legend Pattern

This project uses `LegendBadge.svelte` for legends. Props:

- `prelimKeys?: string[]` — renders prelim flag swatches
- `statusKeys?: string[]` — renders system status swatches

OwnKng's `LegendOrdinal` uses a D3 `scaleOrdinal` — this project's `LegendBadge` uses the color token maps (`prelimBadge`, `FLAG_BADGE`) directly.

---

## Color Tokens

Always use project color tokens, not D3 color palettes:

```ts
import { prelimBadge, FLAG_BADGE, systemBaseColor } from '$lib/utils/colors';

// prelimBadge[key].bg      — hex fill color
// prelimBadge[key].label   — display label
// FLAG_BADGE[key].tintVar        — CSS custom property name for tint (e.g. '--color-flag-tint')
// FLAG_BADGE[key].label          — display label
// systemBaseColor(systemId)      — returns a hex color for a system
```

---

## SVG a11y Suppression

For interactive SVG elements (paths, rects with mouse handlers), always add:

```svelte
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
```

For mouse-only hover (no click):

```svelte
<!-- svelte-ignore a11y_no_static_element_interactions -->
```

---

## Animation

Prefer CSS transitions on SVG attributes over JS animation:

```svelte
<path style="transition: opacity 0.15s, d 0.1s" d={…} opacity={…} />
```

For enter animations, OwnKng uses `tweened` from `svelte/motion`. In Svelte 5 this still works but prefer CSS where possible.

---

## Checklist Before Finalizing Any New Chart

1. D3 only for math — no `d3.select()` anywhere
2. `{@attach observeWidth}` for responsive width
3. Reuse `XAxis`, `ThresholdLine`, `Dot`, `FlagTooltip` where applicable
4. Use `TooltipCard` for hover tooltips
5. Use `LegendBadge` for legends
6. Use project color tokens (`prelimBadge`, `FLAG_BADGE`, `systemBaseColor`)
7. Add `svelte-ignore` comments for SVG a11y
8. Run `npx @sveltejs/mcp svelte-autofixer ./path/to/Component.svelte` before finalizing
