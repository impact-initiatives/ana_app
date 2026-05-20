# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The **Acute Needs Analysis (ANA) Dashboard** is a SvelteKit static-site application for humanitarian data analysis. Users upload a CSV of metric values; the app validates, flags entries against configurable thresholds, and visualises results through heatmaps, choropleth maps, metric drilldowns, and drill-down tables.

## Common Commands

```bash
# Development (inside container: podman exec ana-dev <cmd>)
bun run dev           # Start dev server
bun run build         # Build static site (adapter-static)
bun run check         # Svelte type-checking (svelte-check)
bun run lint          # ESLint
bun run format        # Prettier
bun run test          # Run test suite (Vitest)

# Data pipeline scripts
bun run generate:enums              # Regenerate TypeScript enums from CSV sources
bun run generate:reference-json     # Regenerate /static/data/reference.json from CSV
bun run validate:reference-json     # Validate reference.json
bun run validate:hypotheses         # Validate hypotheses JSON
bun run validate:circle-packing     # Validate reference-circlepacking.json
bun run data:refresh                # Run all generation + validation scripts
```

## Skills

Invoke skills proactively when the task matches. The Svelte skills below are auto-loaded whenever editing `.svelte` or `.svelte.ts` files.

### `svelte-core-bestpractices` — runes, events, snippets, styling

Full guidance: `.claude/skills/svelte-core-bestpractices/SKILL.md`

Project-specific rules on top of the skill:
- Use `$state.raw` for large objects that are only ever reassigned (GeoJSON responses, pipeline data arrays) — not `$state`, which would proxy them
- Shared reactive state: `createContext` (type-safe) not `setContext`/`getContext`
- Keyed each blocks everywhere, never use index as key: `{#each items as item (item.id)}`

### `svelte-code-writer` — Svelte 5 docs CLI + autofixer

Full guidance: `.claude/skills/svelte-code-writer/SKILL.md`

- **Always run `svelte-autofixer` before finalising any new or significantly modified `.svelte` file**
- Escape `$` as `\$` when passing runes inline in the terminal
- Use `bun x @sveltejs/mcp list-sections` / `get-documentation` when uncertain about syntax

### `svelte-d3` — D3 × Svelte visualisation patterns

Full reference: `.claude/skills/svelte-d3/README.md`. Invoke whenever adding or editing a chart or SVG visualisation.

Key rules:
- D3 for math only — no `d3.select()` or DOM manipulation. Svelte `{#each}` renders all SVG elements
- `{@attach observeWidth}` with `ResizeObserver` for responsive width — not `bind:clientWidth` or `$effect`
- **Reuse existing primitives** before creating new ones: `XAxis`, `ThresholdLine`, `Dot`, `FlagTooltip`
- `TooltipCard.svelte` for hover tooltips; `LegendBadge.svelte` for legends
- Color tokens from `$lib/utils/colors.ts` — never D3 color palettes

### `frontend-design` — bold, production-grade UI

Full guidance: `.claude/skills/frontend-design/SKILL.md`. Invoke when building or redesigning UI components, pages, or visual features.

Picks a clear aesthetic direction (minimalist, editorial, brutalist…) and executes it with precision. Avoids generic AI aesthetics (Inter/Roboto, purple-on-white gradients, predictable layouts).

### `ui-ux-pro-max` — UI/UX design intelligence

Full guidance: `.claude/skills/ui-ux-pro-max/SKILL.md`. Invoke for accessibility reviews, color/typography decisions, chart type selection, and pre-delivery UI checklists.

Uses a Python CLI:
```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keywords>" --design-system
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keywords>" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keywords>" --stack svelte
```

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
