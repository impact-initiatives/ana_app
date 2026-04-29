# ANA Dashboard — Application Structure

---

## Table of contents

1. [How the app works](#how-the-app-works) — guide for the methodology team
2. [Getting started](#getting-started)
3. [Data model](#data-model) — hierarchy, data flow, static assets
4. [Architecture](#architecture) — engine, stores, routes, components, colours, types
5. [Tech stack](#tech-stack)
6. [Development](#development) — commands and scripts
7. [Maintenance guide](#maintenance-guide--data-pipeline-and-export-logic) — data pipeline, export logic, CI/CD

---

## How the app works

### What the app does

The ANA Dashboard lets field teams upload a CSV of survey results and immediately see which geographic areas have acute humanitarian needs, and in which sectors. A colour-coded map, heatmaps, and drill-down tables show both the overall preliminary flag and the evidence behind it at every level of the framework.

Everything the app knows about the framework — which metrics exist, what thresholds signal acute needs, how indicators roll up into systems — comes from a **single reference spreadsheet** maintained by the methodology team: `static/data/ANA_2025_reference.csv`. Changing that file (and running the data refresh described below) is all that is needed to update the framework across the entire app.

### The reference framework

The framework has five levels, from broadest to most specific:

```
System  →  Factor  →  Sub-Factor  →  Indicator  →  Metric
```

- A **Metric** is the leaf: one measurable value (e.g. "Acute malnutrition prevalence — MUAC"). It has a numeric threshold. If a field result crosses that threshold, the metric is flagged.
- An **Indicator** groups one or more metrics that measure the same concept from different angles.
- **Sub-Factor, Factor, and System** are progressively broader groupings. Flagging rolls upward: enough flagged metrics in a sub-factor flags the sub-factor, and so on up to system level.

### The reference CSV — `static/data/ANA_2025_reference.csv`

Each row in the CSV is one metric. The columns that drive the app's behaviour are:

| Column                                   | What it controls                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metric ID                                | Unique code (e.g. `MET001`); must match the column header in the uploaded results CSV                                                                                                                                                                                                                     |
| System / Factor / Sub-Factor / Indicator | Placement in the hierarchy                                                                                                                                                                                                                                                                                |
| Label                                    | Human-readable name shown in the dashboard                                                                                                                                                                                                                                                                |
| Preference                               | 1 = primary, 2 = secondary, 3 = reference-only (never triggers a flag)                                                                                                                                                                                                                                    |
| Type                                     | Accepted value format for the uploaded results CSV — used to validate each cell before flagging. Examples: `num[0:1]` (proportion between 0 and 1), `int[0+]` (non-negative integer). If a submitted value falls outside this range the app flags it as invalid. Leave empty to accept any finite number. |
| Threshold AN / VAN                       | Numeric cut-offs for Acute Needs and Very Acute Needs                                                                                                                                                                                                                                                     |
| Above or below                           | Whether a value **above** or **below** the threshold signals acute needs                                                                                                                                                                                                                                  |
| Evidence threshold                       | Minimum number of metrics with data needed to reach a conclusion in a sub-factor group                                                                                                                                                                                                                    |
| Factor threshold                         | Minimum number of flagged metrics needed to flag a sub-factor group                                                                                                                                                                                                                                       |
| Level / Risk concept                     | Metadata used for display and filtering in the reference list                                                                                                                                                                                                                                             |
| Kobo code                                | Links the metric to the survey instrument                                                                                                                                                                                                                                                                 |

### Preference levels

| Value              | Meaning                                                                      |
| ------------------ | ---------------------------------------------------------------------------- |
| 1 — Primary        | Used in flagging; the core evidence                                          |
| 2 — Secondary      | Used in flagging; supplementary evidence                                     |
| 3 — Reference-only | Shown in the reference list and deep-dive export only; never triggers a flag |

### How flagging works

When a user uploads a results CSV, each metric value is compared to its AN threshold. Metrics are grouped within each sub-factor by their `(factor_threshold, evidence_threshold)` pair. A group is flagged if the number of flagged metrics in that group meets the factor threshold. A group concludes "no flag" if enough metrics have data to meet the evidence threshold. Sub-factor, factor, and system statuses are then determined by the worst outcome across their children.

The final **preliminary flag** for a geographic area is one of:

| Label                 | Meaning                                                                      |
| --------------------- | ---------------------------------------------------------------------------- |
| EM                    | Excess Mortality — mortality data crosses its threshold                      |
| ROEM                  | Risk of Excess Mortality — enough cross-system evidence without confirmed EM |
| Acute Needs           | At least one system flagged                                                  |
| No Acute Needs        | Sufficient evidence to conclude no acute needs                               |
| Insufficient Evidence | Some data present but not enough to reach a conclusion                       |
| No Data               | No usable data for this area                                                 |

### What to do after updating the reference CSV

After editing `static/data/ANA_2025_reference.csv`, a developer must run:

```bash
bun run data:refresh
```

This regenerates all the JSON files the app reads from the CSV and validates them. Without this step, changes to the spreadsheet have no effect on the app. The validation step will report any inconsistencies — missing IDs, invalid thresholds, broken hierarchy — before they reach the app.

---

## Getting started

**Prerequisite:** [Bun](https://bun.sh) ≥ 1.x — install with `curl -fsSL https://bun.sh/install | bash`.

```bash
bun install          # install dependencies
bun run dev          # start local dev server at http://localhost:5173
bun run build        # production build (outputs to build/)
bun run preview      # preview the production build locally
bun run check        # Svelte type-checking
bun run test         # run the test suite (Vitest)
```

Set `BASE_PATH=/repo-name` when building for GitHub Pages sub-path deploys.

For data pipeline setup, adding metrics, or modifying export logic, see the [Maintenance guide](#maintenance-guide--data-pipeline-and-export-logic).

---

## Data model

### Reference hierarchy

The core data model has five levels. Each level is identified by a snake_case ID and carries a human-readable label.

```
System
  └── Factor
        └── Sub-Factor
              └── Indicator   (conceptual grouping — no thresholds)
                    └── Metric   (leaf — one row in the input CSV, carries thresholds + type)
```

**Key distinction:** an _Indicator_ is a named concept (e.g. "Two-week prevalence of childhood illness") that groups one or more _Metrics_. Each _Metric_ has its own ID (`MET001`), type constraint, threshold, and preference level. The input CSV has one column per metric (`MET001`, `MET002`, …).

### Data flow

```
CSV Upload  (src/routes/+page.svelte)
  → parser.ts          PapaParse wrapper — returns headers + raw rows
  → validator.ts       Checks headers against reference.json, UOA uniqueness, type constraints
  → flagger.ts         Applies thresholds; rolls up metric → subfactor → factor → system → prelim_flag
  → fetchAdmin.ts      If p-codes detected, fetches ADM1/ADM2 GeoJSON from external API (fire-and-forget)
  → Stores             flagStore, adminFeaturesStore
  → Results routes     /results  (heatmap, drilldown, coverage)
  → Export             download.ts (CSV/JSON/XLSX)  |  deepdive.ts (ZIP packages, one XLSX per UoA)
```

### Static assets

| File                                       | Description                                                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `static/data/reference.json`               | Full reference tree (5-level JSON, 198 metrics). Generated by `scripts/generate-reference-json.ts` from `ANA_2025_reference.csv`. Validated by `scripts/validate-reference-json.ts`. |
| `static/data/reference-circlepacking.json` | D3-compatible tree for the circle-packing visualisation. Same hierarchy, leaf nodes carry `metric` object + `value` (derived from preference).                                       |
| `static/data/ANA_2025_reference.csv`       | Source of truth. One row = one metric. Edited here; run `bun run data:refresh` to regenerate all derived assets.                                                                     |

#### `reference.json` shape

```ts
ReferenceRoot {
  systems: System[] {
    id, label,
    factors: Factor[] {
      id, label,
      sub_factors: SubFactor[] {
        id, label,
        indicators: Indicator[] {
          id, label,
          metrics: Metric[] {
            metric: "MET001",   // leaf ID — matches CSV column header
            label,
            preference,         // 1 (primary) | 2 (secondary) | 3 (reference-only, excluded from flagging)
            type,               // e.g. "num[0:1]", "int[0+]"
            thresholds: { an, van },
            above_or_below,
            evidence_threshold,
            factor_threshold,
            ...
          }
        }
      }
    }
  }
}
```

#### Flagged row shape (output of `flagger.ts`, stored in `flagStore`)

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

`prelim_flag` values: `EM` · `ROEM` · `ACUTE` · `ACUTE_NEEDS` · `INSUFFICIENT_EVIDENCE` · `NO_DATA`

---

## Architecture

### Engine (`src/lib/engine/`)

| File                | Role                                                                                                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pipeline.ts`       | Orchestrates validate → flag → admin fetch. Entry point for the full processing run.                                                                                                                 |
| `validator.ts`      | Validates CSV structure: headers present in `MetricMap`, UOA uniqueness, type constraints per metric. Produces `ValidationResult` with per-column missingness entries.                               |
| `flagger.ts`        | Threshold-based flagging using `@tidyjs/tidy`. Preference-3 metrics are excluded from the flagging pipeline (reference display only). Rolls up metric → subfactor → factor → system → `prelim_flag`. |
| `metricMetadata.ts` | Traverses `reference.json`: `getAllMetricIds()`, `getMetricMetadata()`, `getIndicatorMetadata()`, `buildSubfactorList()`, `buildReferenceRows()` (for the reference table).                          |
| `fetchAdmin.ts`     | Detects p-codes in the UOA column; fetches ADM1/ADM2 GeoJSON boundaries from an external API.                                                                                                        |
| `download.ts`       | Exports results as CSV / JSON / XLSX.                                                                                                                                                                |
| `deepdive.ts`       | Generates ZIP packages (one XLSX per UoA) with full metric-level detail. Reads system colours from CSS custom properties via `getComputedStyle`.                                                     |
| `mergeDeepDives.ts` | Merges multiple deep-dive ZIP packages into a single consolidated XLSX (used by the `/merge` route).                                                                                                 |
| `exportMap.ts`      | Builds a self-contained composite SVG for map export (title, choropleth, legend, logos) with inlined light-theme styles.                                                                             |
| `parser.ts`         | Thin PapaParse wrapper; returns `{ headers, rows }`.                                                                                                                                                 |

### Stores (`src/lib/stores/`)

All stores use Svelte 5 `$state` runes and persist to `localStorage`. Access fields directly (no `$` prefix needed outside `.svelte` files).

| Store                | Storage key                | Purpose                                                                                                                                          |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `metricStore`        | `ana_metric_store_v2`      | Loads `reference.json` on boot; exposes `referenceJson` (full tree) and `metricMap` (flat `MetricMap` keyed by `MET001`). Cached with timestamp. |
| `flagStore`          | `ana_flag_store_v2`        | Stores `flaggedResult[]` rows from the pipeline. Keyed by `MET001` columns.                                                                      |
| `adminFeaturesStore` | `ana_admin_features_store` | Cached GeoJSON boundaries; fetch state `'idle' \| 'loading' \| 'done' \| 'error'`.                                                               |
| `validatorStore`     | —                          | Transient validation state; cleared after flagging completes.                                                                                    |
| `circlePackingStore` | —                          | Tree data for the circle-packing reference visualisation.                                                                                        |

### Routes

| Route        | Purpose                                                              |
| ------------ | -------------------------------------------------------------------- |
| `/`          | Home — CSV upload, step-by-step guidance, pipeline trigger           |
| `/results`   | Main results — heatmap, system drilldown, coverage cards, export     |
| `/reference` | Reference list — full metric framework (table + circle-packing tree) |
| `/validate`  | Validation details — cell errors and missingness report after upload |
| `/merge`     | Merge tool — combines multiple deep-dive ZIP exports into one XLSX   |

### Component map (`src/lib/components/`)

#### `results/`

| Component                | Purpose                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `ResultsOverview.svelte` | Overview tab — prelim-flag donut, UoA ranking table, choropleth map with layer filters |
| `ResultsSystems.svelte`  | System-level heatmap overview; clicks open the metric drilldown                        |
| `ResultsMetrics.svelte`  | Factor → Subfactor → Metric card grid per system                                       |
| `ResultsCoverage.svelte` | Coverage summary across all systems                                                    |
| `ResultsExport.svelte`   | Export controls (CSV / JSON / XLSX / deep-dive ZIP)                                    |
| `FiltersSidebar.svelte`  | Filter panel (UoA, system, factor, status)                                             |

#### `viz/`

| Component                    | Purpose                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `HeatmapGrid.svelte`         | Systems × subfactors colour grid; cell = flag count / availability                      |
| `SystemMatrix.svelte`        | Expanded per-system metric matrix                                                       |
| `MetricDrilldown.svelte`     | Metric-level detail panel (value, status, threshold)                                    |
| `CirclePacking.svelte`       | Zoomable D3 circle-packing tree (5 depths: system → metric); supports `flagRow` overlay |
| `CoverageDetailCards.svelte` | Per-factor coverage bars                                                                |
| `UoaRankingTable.svelte`     | Ranked UoA table by prelim flag                                                         |
| `UoaDetailPanel.svelte`      | Single-UoA detail view                                                                  |
| `ChoroplethMap.svelte`       | Choropleth map (p-codes + admin boundaries); exports composite SVG via `exportMap.ts`   |

#### `ui/`

General-purpose UI primitives: `TooltipCard`, `LegendBadge`, `PrelimBadge`, `DataGuard`, `NavButton`, `ExploreNav`, …

**`DataGuard.svelte`** — wraps any section that requires store data. Shows a loading/redirect state when `flagStore` or `metricStore` is not ready. Always use it to gate results pages.

### Colour system (`src/lib/utils/colors.ts` + `src/app.css`)

Defined once in `src/app.css` (`:root` block). Changing a base hex there updates the entire ramp for all visualisations automatically.

```css
/* Example — food_systems */
--color-sys-food-systems: #61d095;
--color-sys-food-systems-d1: color-mix(in srgb, var(--color-sys-food-systems) 10%, transparent);
--color-sys-food-systems-d2: color-mix(in srgb, var(--color-sys-food-systems) 40%, transparent);
--color-sys-food-systems-d3: color-mix(in srgb, var(--color-sys-food-systems) 70%, transparent);
--color-sys-food-systems-d4: color-mix(in srgb, var(--color-sys-food-systems) 90%, transparent);
```

Ramp levels correspond to hierarchy depth:

| Level         | Depth | CSS var suffix | Opacity |
| ------------- | ----- | -------------- | ------- |
| System ring   | 1     | `-d1`          | 10%     |
| Factor        | 2     | `-d2`          | 40%     |
| Sub-Factor    | 3     | `-d3`          | 70%     |
| Indicator     | 4     | `-d4`          | 90%     |
| Metric (leaf) | 5     | _(base var)_   | 100%    |

`colors.ts` exports pure `var(--…)` strings — no JS colour math. Functions: `systemBaseColor`, `systemFillColor`, `factorColor`, `subfactorColor`, `indicatorFillColor`, `metricFillColor`.

For non-browser contexts that need actual hex (e.g. ExcelJS in `deepdive.ts`), `deepdive.ts` reads CSS vars at runtime via `getComputedStyle(document.documentElement).getPropertyValue('--color-sys-X')`.

Flag and status colours are defined as CSS custom properties in the DaisyUI theme blocks in `app.css`. Accessed via `FLAG_BADGE` and `prelimBadge` records in `colors.ts`.

### Type system (`src/lib/types/`)

| File                | Contents                                                                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `structure.ts`      | Canonical interfaces: `Metric`, `Indicator`, `SubFactor`, `Factor`, `System`, `ReferenceRoot`. Also: `MetricID`, `MetricType`, `Thresholds`, `MetricPreferenceEnum`, `MetricDirectionEnum`, `parseMetricType`. |
| `reference-json.ts` | Zod schemas for `reference.json` validation: `MetricSchema`, `IndicatorSchema`, `ReferenceRootSchema`. Exports `validateReferenceRoot`, `safeValidateReferenceRoot`.                                           |
| `generated/`        | Auto-generated TypeScript enums (`SystemEnum`, `FactorEnum`, `SubfactorEnum`). Do not edit — run `bun run generate:enums` to regenerate.                                                                       |
| `steps.ts`          | Step definitions for the upload wizard.                                                                                                                                                                        |
| `deepdives.ts`      | Types for the deep-dive export (column definitions, table headers).                                                                                                                                            |

---

## Tech stack

| Library                        | Role                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| SvelteKit 2 + `adapter-static` | Framework; SPA fallback; deploys to GitHub Pages via `BASE_PATH` env var           |
| Svelte 5                       | Runes-only (`$state`, `$derived`, `$effect`); no legacy stores                     |
| Tailwind CSS 4                 | Utility classes configured via `@plugin` in `app.css`                              |
| DaisyUI 5                      | Component classes (`btn`, `badge`, `card`, …); two themes: `ana-light`, `ana-dark` |
| D3                             | Visualisation primitives: scales, geo, force, zoom, pack, axis                     |
| SveltePlot                     | Chart components built on Observable Plot (`svelteplot`)                           |
| @tidyjs/tidy                   | Data wrangling in `flagger.ts`                                                     |
| Zod (v4)                       | Schema validation for `reference.json` and `reference-circlepacking.json`          |
| PapaParse                      | CSV parsing                                                                        |
| Turf.js                        | Geospatial operations (buffer, dissolve, union, simplify)                          |
| ExcelJS + fflate               | XLSX export and ZIP packaging                                                      |
| Vitest                         | Test runner (`bun run test`)                                                       |
| Lucide (`@lucide/svelte`)      | Icon set                                                                           |
| i18n-iso-countries             | ISO country code lookups                                                           |

---

## Development

```bash
# App
bun run dev           # start dev server at http://localhost:5173
bun run build         # production build (outputs to build/)
bun run preview       # preview the production build locally
bun run check         # Svelte type-checking (svelte-check)
bun run lint          # ESLint
bun run format        # Prettier
bun run test          # run the test suite (Vitest)

# Data pipeline
bun run generate:enums              # regenerate TS enums from reference CSV
bun run generate:reference-json     # regenerate reference.json + reference-circlepacking.json
bun run generate:input-data         # generate sample input data
bun run validate:reference-json     # validate reference.json
bun run validate:hypotheses-json    # validate hypotheses JSON
bun run validate:circlepacking-json # validate reference-circlepacking.json
bun run data:refresh                # run all generation + validation in sequence
```

### Scripts reference

| Command                        | Script                                   | Description                                                                      |
| ------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------- |
| `generate:enums`               | `scripts/generate-*-enum.ts`             | Regenerate TypeScript enums in `src/lib/types/generated/` from the reference CSV |
| `generate:reference-json`      | `scripts/generate-reference-json.ts`     | Regenerate `reference.json` + `reference-circlepacking.json`                     |
| `validate:reference-json`      | `scripts/validate-reference-json.ts`     | Validate `reference.json` against Zod schemas                                    |
| `validate:hypotheses-json`     | `scripts/validate-hypotheses-json.ts`    | Validate hypotheses JSON                                                         |
| `validate:circlepacking-json`  | `scripts/validate-circlepacking-json.ts` | Validate `reference-circlepacking.json` leaf structure                           |
| `data:refresh`                 | —                                        | Run all generation + validation scripts in sequence                              |

**TypeScript enums** in `src/lib/types/generated/` are auto-generated — do not edit them directly.

---

## Maintenance guide — data pipeline and export logic

This section is for maintainers of the data pipeline or export logic. Frontend components are out of scope here.

### Repository map (maintenance perspective)

| Directory / file                           | What lives here                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `static/data/ANA_2025_reference.csv`       | Metric-level source of truth — edit here, then run `data:refresh`                         |
| `static/data/system.csv`                   | Canonical list of valid system IDs + labels — used by validation and enum generation      |
| `static/data/factor.csv`                   | Canonical `(factor, system)` pairs — used by validation and enum generation               |
| `static/data/subfactor.csv`                | Canonical `(sub_factor, factor, system)` triples — used by validation and enum generation |
| `static/data/reference.json`               | Generated — do not edit directly                                                          |
| `static/data/reference-circlepacking.json` | Generated — do not edit directly                                                          |
| `scripts/`                                 | Generation and validation scripts (Bun, not bundled into the app)                         |
| `src/lib/engine/`                          | All data-processing logic: validation, flagging, export                                   |
| `src/lib/types/`                           | TypeScript interfaces and Zod schemas                                                     |
| `src/lib/stores/`                          | Runtime state (`metricStore` loads `reference.json`; `flagStore` holds pipeline output)   |
| `src/lib/components/` / `src/routes/`      | Frontend — not relevant for data/logic maintenance                                        |

### CSV → JSON generation

The three lookup CSVs (`system.csv`, `factor.csv`, `subfactor.csv`) define the valid hierarchy. `validate-reference-json.ts` cross-checks `reference.json` against them — every system ID must appear in `system.csv`, every `(factor, system)` pair in `factor.csv`, every `(sub_factor, factor, system)` triple in `subfactor.csv`. The same files are also the source for the generated TypeScript enums.

| Script                                   | Input                                            | Output                                            |
| ---------------------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| `scripts/generate-reference-json.ts`     | `ANA_2025_reference.csv`                         | `reference.json` + `reference-circlepacking.json` |
| `scripts/validate-reference-json.ts`     | `reference.json` + `system/factor/subfactor.csv` | — (exits non-zero on error)                       |
| `scripts/validate-circlepacking-json.ts` | `reference-circlepacking.json`                   | —                                                 |
| `scripts/generate-system-enum.ts`        | `system.csv`                                     | `src/lib/types/generated/system-enum.ts`          |
| `scripts/generate-factor-enum.ts`        | `factor.csv`                                     | `src/lib/types/generated/factor-enum.ts`          |
| `scripts/generate-subfactor-enum.ts`     | `subfactor.csv`                                  | `src/lib/types/generated/subfactor-enum.ts`       |

Run everything in sequence: `bun run data:refresh`

**Adding a new metric:** add the row to `ANA_2025_reference.csv`, run `data:refresh`, confirm no validation errors.

**Adding a new system/factor/subfactor:** update the relevant lookup CSV (`system.csv`, `factor.csv`, or `subfactor.csv`) first, then add the rows to `ANA_2025_reference.csv`, then run `data:refresh`. The validator will reject the reference JSON if the hierarchy ID is not in the lookup file.

**Renaming or removing a system/factor/subfactor ID:** update the lookup CSV and `ANA_2025_reference.csv`, run `data:refresh` + `generate:enums`, then search the codebase for the old ID — it may appear in `src/lib/engine/flagger.ts` (the prelim-flag decision tree references `SystemIDEnum` values).

### CI/CD — `.github/workflows/deploy.yml`

- **Trigger:** push to `main`, or manually from the GitHub Actions tab
- **Build steps:** install Bun → `bun run data:refresh` → `bun run test` → `bun run build` (with `BASE_PATH` set to the repo name for the GitHub Pages path prefix) → upload `build/` as Pages artifact
- **Deploy step:** depends on the build job; publishes to the GitHub Pages environment
- **Key implication:** `data:refresh` runs in CI before the build — a CSV change that fails validation will break the deployment. Always run `bun run data:refresh` locally and confirm it passes before pushing to `main`.

### Flagging logic — `src/lib/engine/flagger.ts`

Entry point: `flagData(rows, referenceJson)`.

The pipeline runs in five stages:

1. **Metric level** (`makeMetricSpec`) — for each metric computes `{id}_flag` (boolean), `{id}_status` (`flag | no_flag | no_data`), and `{id}_within_10perc`. Preference-3 metrics are skipped entirely.
2. **Sub-factor groups** — metrics are pooled into threshold groups defined by their `(factor_threshold, evidence_threshold)` pair (sourced from `buildSubfactorList` in `metricMetadata.ts`). A group flags if flagged metrics ≥ `factor_threshold`; it concludes `no_flag` if metrics with data ≥ `evidence_threshold`.
3. **Sub-factor status** — worst outcome across all its threshold groups.
4. **Factor / System rollup** — `rollupStatuses` aggregates child statuses: any `flag` → `flag`; otherwise `no_flag` if any child is `no_flag`; otherwise `insufficient_evidence`; otherwise `no_data`.
5. **`prelim_flag`** — decision tree over system-level statuses: EM → ROEM → ACUTE_NEEDS → NO_ACUTE_NEEDS → INSUFFICIENT_EVIDENCE → NO_DATA. This tree is hardcoded in `flagger.ts`; threshold values come from the CSV.

**Touch `flagger.ts` when:** the decision-tree logic changes, new prelim-flag categories are introduced, or the rollup rules change. Threshold values themselves live in the CSV — only the structural logic is here.

### Deep-dive export — `src/lib/engine/deepdive.ts`

Generates a ZIP archive containing one `.xlsx` per Unit of Analysis. Each workbook has one worksheet per system.

Worksheet layout per system:

- System header (full-width, dark background)
- For each factor: factor row → for each sub-factor: sub-factor row → table of indicator/metric rows
- Metric rows carry: Indicator label, Metric label, Metric ID, Value, Flag, AN threshold, Direction, H1–H5 hypothesis columns, Comment field

Column definitions and table headers live in `src/lib/types/deepdives.ts` (`tableHeaders`, `colWidths`, `colCount`).

System colours are resolved at runtime via `getComputedStyle(document.documentElement)` because ExcelJS runs in a browser context but outside a Svelte component — the CSS custom properties are available on the document root.

**Touch `deepdive.ts` when:** export layout, cell styling, or hypothesis column logic changes.  
**Touch `deepdives.ts` when:** adding or removing columns from the exported table.

### Validation and type safety

| File                              | Role                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/types/structure.ts`      | Canonical TS interfaces (`Metric`, `SubFactor`, `Factor`, `System`, `ReferenceRoot`). The engine works entirely against these types. |
| `src/lib/types/reference-json.ts` | Zod schemas validating `reference.json`. Add new required fields here when the CSV gains new mandatory columns.                      |
| `src/lib/types/generated/`        | Auto-generated enums. Never edit by hand — run `bun run generate:enums`.                                                             |

### Maintenance quick-reference

| Task                                        | Files to touch                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Add / remove a metric                       | `ANA_2025_reference.csv` → `bun run data:refresh`                                                                                  |
| Change flagging thresholds                  | `ANA_2025_reference.csv` → `bun run data:refresh` (values come from CSV)                                                           |
| Add a new system                            | `system.csv` → `ANA_2025_reference.csv` → `bun run data:refresh`                                                                   |
| Add a new factor                            | `factor.csv` → `ANA_2025_reference.csv` → `bun run data:refresh`                                                                   |
| Add a new sub-factor                        | `subfactor.csv` → `ANA_2025_reference.csv` → `bun run data:refresh`                                                                |
| Rename / remove a system, factor, subfactor | Update lookup CSV + `ANA_2025_reference.csv` → `bun run data:refresh` → `bun run generate:enums` → search codebase for old ID      |
| Change rollup or decision-tree logic        | `src/lib/engine/flagger.ts`                                                                                                        |
| Change deep-dive XLSX layout or columns     | `src/lib/engine/deepdive.ts` + `src/lib/types/deepdives.ts`                                                                        |
| Add a new required CSV field                | `ANA_2025_reference.csv` + `scripts/generate-reference-json.ts` + `src/lib/types/structure.ts` + `src/lib/types/reference-json.ts` |
