# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The **Acute Needs Analysis (ANA) Dashboard** is a SvelteKit static-site application for humanitarian data analysis. Users upload a CSV of metric values; the app validates, flags entries against configurable thresholds, and visualises results through heatmaps, choropleth maps, metric drilldowns, and drill-down tables.

## Common Commands

```bash
# Development
bun run dev           # Start dev server
bun run build         # Build static site (adapter-static)
bun run check         # Svelte type-checking (svelte-check)
bun run lint          # ESLint
bun run format        # Prettier

# Data pipeline scripts
bun run generate:enums              # Regenerate TypeScript enums from CSV sources
bun run generate:reference-json     # Regenerate /static/data/reference.json from CSV
bun run validate:reference-json     # Validate reference.json
bun run validate:hypotheses         # Validate hypotheses JSON
bun run validate:circle-packing     # Validate reference-circlepacking.json
bun run data:refresh                # Run all generation + validation scripts
```

## Architecture

### Reference Hierarchy

The core data model has five levels. Each level is identified by a snake_case ID and carries a human-readable label.

```
System
  └── Factor
        └── Sub-Factor
              └── Indicator   (conceptual grouping — no thresholds)
                    └── Metric   (leaf — one row in the input CSV, carries thresholds + type)
```

**Key distinction:** an _Indicator_ is a named concept (e.g. "Two-week prevalence of childhood illness") that groups one or more _Metrics_. Each _Metric_ has its own ID (`MET001`), type constraint, threshold, and preference level. The input CSV has one column per metric (`MET001`, `MET002`, …).

### Data Flow

```
CSV Upload (src/routes/+page.svelte)
  → parser.ts         (PapaParse wrapper, returns headers + raw rows)
  → validator.ts      (check headers against reference.json, UOA uniqueness, type constraints)
  → flagger.ts        (apply thresholds, roll up metric → subfactor → factor → system → prelim_flag)
  → fetch_admin.ts    (if p-codes detected, fetch GeoJSON admin boundaries from external API)
  → Stores            (flagStore, adminFeaturesStore)
  → Results routes    (/results — heatmap, drilldown, coverage)
  → Export            (download.ts — CSV/JSON/XLSX; deepdive.ts — ZIP packages, one XLSX per UoA)
```

### State Management (Svelte 5 Runes)

All stores in `src/lib/stores/` use Svelte 5 `$state` runes (not writable stores). Components access fields directly without the `$` prefix. All stores persist to localStorage.

| Store                | Storage key           | Purpose                                                                                                                                          |
| -------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `metricStore`        | `ana_metric_store_v1` | Loads `reference.json` on boot; exposes `referenceJson` (full tree) and `metricMap` (flat `MetricMap` keyed by `MET001`). Cached with timestamp. |
| `flagStore`          | `ana_flag_store_v2`   | Stores `flaggedResult[]` rows from the pipeline. Keyed by `MET001` columns.                                                                      |
| `adminFeaturesStore` | `ana_admin_features`  | Cached GeoJSON admin boundaries; fetch state: `'idle' \| 'loading' \| 'done' \| 'error'`                                                         |
| `validatorStore`     | —                     | Transient validation state; cleared after flagging completes                                                                                     |
| `circlePackingStore` | —                     | Tree data for the circle-packing reference visualisation                                                                                         |

### Core Processing Modules (`src/lib/engine/`)

- **pipeline.ts** — Orchestrates validate → flag → admin fetch (admin fetch is fire-and-forget)
- **validator.ts** — Validates CSV structure, metric presence in `MetricMap`, UOA uniqueness, type constraints. Produces `ValidationResult` with per-column missingness entries.
- **flagger.ts** — Threshold-based flagging using `@tidyjs/tidy`. Preference-3 metrics excluded from flagging pipeline. Rolls up metric → subfactor → factor → system → `prelim_flag`. Status values: `'flag' | 'no_flag' | 'insufficient_evidence' | 'no_data'`
- **metricMetadata.ts** — Traverses `reference.json`; provides `getAllMetricIds()`, `getMetricMetadata()`, `getIndicatorMetadata()`, `buildSubfactorList()`, `buildReferenceRows()`
- **fetch_admin.ts** — Detects p-codes in UOA column, fetches ADM1/ADM2 GeoJSON from external API
- **download.ts** — Exports results as CSV / JSON / XLSX
- **deepdive.ts** — Generates ZIP packages (one XLSX per UoA). Reads system colours from CSS custom properties via `getComputedStyle`.
- **exportMap.ts** — Builds self-contained composite SVG for map export (title, map with inlined light-theme styles, legend, logos). `layerTitle` overrides the default prelim title for metric/system/factor/subfactor layers.
- **parser.ts** — Thin PapaParse wrapper; returns `{ headers, rows }`

### Key Data Structures

**`reference.json`** (static asset at `static/data/reference.json`, generated from `ANA_2025_reference.csv`):

```
systems[] → factors[] → sub_factors[] → indicators[] → metrics[]
```

Each metric has: `metric` (ID, e.g. `MET001`), `label`, `preference` (1 primary / 2 secondary / 3 reference-only), `type`, `thresholds: { an, van }`, `above_or_below`, `evidence_threshold`, `factor_threshold`.

**Flagged row** (output of pipeline, stored in flagStore):

```
uoa | MET001 | MET001_flag | MET001_status | MET001_within_10perc
    | subfactor_X_Y_status | factor_X_status | system_X_status
    | prelim_flag
```

Status vocabulary (applies at every rollup level):

| Value                   | Meaning                                |
| ----------------------- | -------------------------------------- |
| `flag`                  | Threshold crossed — acute needs signal |
| `no_flag`               | Sufficient evidence, no acute needs    |
| `insufficient_evidence` | Some data but below evidence threshold |
| `no_data`               | No data at all for this level          |

`prelim_flag` values: `EM · ROEM · ACUTE · ACUTE_NEEDS · INSUFFICIENT_EVIDENCE · NO_DATA`

**TypeScript enums** in `src/lib/types/generated/` are auto-generated — do not edit them directly. Run `bun run generate:enums` to regenerate.

### Routes

| Route        | Purpose                                                          |
| ------------ | ---------------------------------------------------------------- |
| `/`          | Home — CSV upload, step-by-step guidance, pipeline trigger       |
| `/results`   | Main results — heatmap, system drilldown, coverage cards, export |
| `/reference` | Reference list — full metric framework (table + circle-packing)  |

### Components (`src/lib/components/`)

#### `results/`

| Component                | Purpose                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `ResultsOverview.svelte` | Overview tab — donut chart, UoA ranking, choropleth map with cascade layer filters       |
| `ResultsSystems.svelte`  | System-level heatmap overview; clicks open the metric drilldown                          |
| `ResultsMetrics.svelte`  | Factor → Subfactor → Metric card grid per system                                         |
| `ResultsCoverage.svelte` | Coverage summary across all systems                                                      |
| `ResultsExport.svelte`   | Export controls (CSV / JSON / XLSX / deep-dive ZIP)                                      |
| `FiltersSidebar.svelte`  | Filter panel (UoA, system, factor, status)                                               |

#### `viz/`

| Component                    | Purpose                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `HeatmapGrid.svelte`         | Systems × subfactors colour grid; cell = flag count / availability                      |
| `SystemMatrix.svelte`        | Expanded per-system metric matrix                                                       |
| `MetricDrilldown.svelte`     | Metric-level detail panel (value, status, threshold)                                    |
| `MetricsStrip.svelte`        | Compact horizontal strip of metric status badges for a single UoA                       |
| `CirclePacking.svelte`       | Zoomable D3 circle-packing tree (5 depths: system → metric); supports `flagRow` overlay |
| `CoverageDetailCards.svelte` | Per-factor coverage bars                                                                |
| `SystemCoverageBars.svelte`  | System-level coverage bar chart                                                         |
| `PrelimFlagDonut.svelte`     | Donut chart of prelim-flag distribution; slices are clickable filters                   |
| `UoaRankingTable.svelte`     | Ranked UoA table by prelim flag                                                         |
| `UoaDetailPanel.svelte`      | Single-UoA detail view                                                                  |
| `ChoroplethMap.svelte`       | Choropleth map (p-codes + admin boundaries); exports composite SVG via `exportMap.ts`   |

#### `ui/`

General-purpose UI primitives: `TooltipCard`, `LegendBadge`, `PrelimBadge`, `DataGuard`, `NavButton`, `ExploreNav`, …

**`DataGuard.svelte`** — wraps pages/sections that require store data. Shows a loading/redirect state when `flagStore` or `metricStore` is not ready. Always use it to gate results pages.

### Colour System

Defined in `src/app.css` (`:root` block). Changing a base hex there updates the entire ramp for all visualisations automatically.

```css
/* Example — food_systems */
--color-sys-food-systems: #61d095;
--color-sys-food-systems-d1: color-mix(in srgb, var(--color-sys-food-systems) 10%, transparent);
--color-sys-food-systems-d2: color-mix(in srgb, var(--color-sys-food-systems) 40%, transparent);
--color-sys-food-systems-d3: color-mix(in srgb, var(--color-sys-food-systems) 70%, transparent);
--color-sys-food-systems-d4: color-mix(in srgb, var(--color-sys-food-systems) 90%, transparent);
```

`src/lib/utils/colors.ts` exports pure `var(--…)` strings — no JS colour math. For non-browser contexts (e.g. ExcelJS in `deepdive.ts`), hex is read at runtime via `getComputedStyle`.

## Tech Stack

- **SvelteKit 2** with `@sveltejs/adapter-static` (SPA fallback, deploys to GitHub Pages via `BASE_PATH` env var)
- **Svelte 5** — use runes (`$state`, `$derived`, `$effect`) throughout; no legacy stores
- **Tailwind CSS 4** — configured via CSS `@plugin` in `src/app.css`, not `tailwind.config.js`
- **DaisyUI 5** — component classes (`btn`, `badge`, `card`, etc.); two themes: `ana-light`, `ana-dark`
- **D3** — visualisation primitives (scales, geo, force, zoom, pack, axis)
- **@tidyjs/tidy** — data wrangling in `flagger.ts`
- **Zod v4** — schema validation for `reference.json` (`src/lib/types/reference-json.ts`)
- **PapaParse** — CSV parsing
- **Turf.js** — geospatial polygon operations (buffer, dissolve, union, simplify)
- **ExcelJS + fflate** — XLSX export and ZIP packaging

## Svelte 5 Guidelines

### Tooling

Use `npx @sveltejs/mcp` when uncertain about Svelte 5 syntax:

```bash
npx @sveltejs/mcp list-sections                          # browse available docs
npx @sveltejs/mcp get-documentation "\$state,\$derived"  # fetch specific docs
npx @sveltejs/mcp svelte-autofixer ./src/lib/Foo.svelte  # lint a component
```

Run `svelte-autofixer` before finalizing any new or significantly modified component. When passing runes inline, escape `$` as `\$` to avoid shell substitution.

### Runes

- Use `.svelte` for components, `.svelte.ts` for modules with runes
- `$state` — only for values that need to be reactive. Use `$state.raw` for large objects that are reassigned rather than mutated (e.g. GeoJSON API responses, large data arrays)
- `$derived` — takes an expression, not a function. Use `$derived.by(() => ...)` for multi-step derivations. Values derived from props must use `$derived`, not a plain `let`
- `$effect` — escape hatch, avoid when possible. Never update state inside an effect. For D3 DOM integration use `{@attach ...}` instead
- `$props` — use instead of `export let`. Values depending on props must use `$derived`

### Templates & Events

- Event handlers: `onclick={fn}` not `on:click={fn}`; `<svelte:window onkeydown={...} />` for window/document listeners (not `onMount`/`$effect`)
- Snippets (`{#snippet}` / `{@render}`) instead of `<slot>` and `<svelte:fragment>`
- Dynamic components: `<DynamicComponent>` instead of `<svelte:component this={...}>`
- Attachments: `{@attach ...}` instead of `use:action`
- Keyed each blocks always — never use index as key: `{#each items as item (item.id)}`
- `class` attribute: use clsx-style arrays/objects instead of `class:` directive

### Styling & Context

- Pass JS variables to CSS via `style:--var={value}`, reference with `var(--var)` in `<style>`
- Style child components via CSS custom properties passed as props, not `:global`
- Shared state: use `createContext` (type-safe) rather than `setContext`/`getContext`

## @tidyjs/tidy Guidelines

`flagger.ts` uses @tidyjs/tidy for all data wrangling. Before writing or editing tidy pipelines, read the local docs at `node_modules/@tidyjs/tidy/genai-docs/`. Start with `mental-model.md`, then `quick-reference.md`, then the relevant `api-*.md`.

Key rules:

- All transformations: `tidy(data, verb1(), verb2(), ...)` — verbs are curried
- Field access uses accessor functions `(d) => d.column`, not strings (except in `sum('key')`, `desc('key')`)
- **`mutate` vs `mutateWithSummary`**: `mutate` is per-item; `mutateWithSummary` receives the full array. Using vector/summary functions inside `mutate()` is a silent bug
- Function taxonomy: summary functions → `summarize()`; vector functions → `mutateWithSummary()`; item functions → `mutate()`; selectors → `select()`
- `groupBy` without an export option returns a flat array; with `.object()`, `.entries()`, `.map()` the shape changes — export mode must be the last step
- Read `gotchas.md` before finalizing any tidy pipeline

## CodeGraph

CodeGraph builds a semantic knowledge graph of codebases for faster, smarter code exploration.

### If `.codegraph/` exists in the project

**NEVER call `codegraph_explore` or `codegraph_context` directly in the main session.** These tools return large amounts of source code that fills up main session context. Instead, ALWAYS spawn an Explore agent for any exploration question (e.g., "how does X work?", "explain the Y system", "where is Z implemented?").

**When spawning Explore agents**, include this instruction in the prompt:

> This project has CodeGraph initialized (.codegraph/ exists). Use `codegraph_explore` as your PRIMARY tool — it returns full source code sections from all relevant files in one call.
>
> **Rules:**
>
> 1. Follow the explore call budget in the `codegraph_explore` tool description — it scales automatically based on project size.
> 2. Do NOT re-read files that codegraph_explore already returned source code for. The source sections are complete and authoritative.
> 3. Only fall back to grep/glob/read for files listed under "Additional relevant files" if you need more detail, or if codegraph returned no results.

**The main session may only use these lightweight tools directly** (for targeted lookups before making edits, not for exploration):

| Tool                                      | Use For                              |
| ----------------------------------------- | ------------------------------------ |
| `codegraph_search`                        | Find symbols by name                 |
| `codegraph_callers` / `codegraph_callees` | Trace call flow                      |
| `codegraph_impact`                        | Check what's affected before editing |
| `codegraph_node`                          | Get a single symbol's details        |

### If `.codegraph/` does NOT exist

Run `codegraph init -i` to build the knowledge graph, or ask the user if they'd like to do so.
