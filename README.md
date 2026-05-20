# ANA app — Application Structure

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

The ANA app has two core outputs:

1. **Automatic flagging** — Upload a CSV (one row per unit of analysis, columns are metric IDs `MET001`, `MET002`, …). Each value is validated against per-metric type rules and compared to its acute-needs threshold. Results roll up metric → sub-factor → factor → system, giving each unit a priority flag: _EM · HO - Primary · HO - Secondary · AN - Primary · AN - Secondary · No Acute Needs · Insufficient Evidence · No Data_.
2. **Pre-populated deep-dive workbooks** — Export a ZIP of per-unit XLSX files. Each workbook has one sheet per system, pre-filled with metric values, flag results, AN/VAN thresholds, and direction. Hypothesis (H1–H5) and comment columns are left editable. Analysts open the file and write the narrative — the data entry is already done.

Everything else in the app (heatmaps, choropleth map, coverage charts, reference browser, spotlight cross-tab) is designed to help analysts interpret flagging results and decide which units warrant a deep dive. It does not change the two outputs above.

Most framework changes — adding or editing metrics, adjusting thresholds, updating labels — only require editing `static/data/reference.csv` and running `bun run data:refresh`.

Adding or renaming a system, factor, or sub-factor also requires updating the relevant lookup CSV (`system.csv`, `factor.csv`, or `subfactor.csv`). The **flagging** rollup logic and the priority-flag decision tree are hardcoded in `src/lib/engine/flagger.ts` and are not controlled by the CSV. The validator logic is hardcoded too in `src/lib/engine/validator.ts` and deep-dive XLSX pre-populating and formatting in `src/lib/engine/deepdive.ts`

See the [Maintenance guide](#maintenance-guide--data-pipeline-and-export-logic) for step-by-step instructions on all of the above.

> **Note:** The priority flag is a data-driven pre-screening result, not a conclusion. Its purpose is to draw a list of priorities for deep-dives. Each unit of analysis requires a full deep-dive before drawing final conclusions.

### The reference framework

The framework has five levels, from broadest to most specific:

```
System  →  Factor  →  Sub-Factor  →  Indicator  →  Metric
```

- A **Metric** is the leaf: one measurable value (e.g. "Acute malnutrition prevalence — MUAC"). It has a numeric threshold. If a field result crosses that threshold, the metric is flagged.
- An **Indicator** groups one or more metrics that measure the same concept from different angles.
- **Sub-Factor, Factor, and System** are progressively broader groupings. Flagging rolls upward: enough flagged metrics in a sub-factor flags the sub-factor, and so on up to system level.

### The reference CSV — `static/data/reference.csv`

Each row in the CSV is one metric. The columns that drive the app's behaviour are:

| Column                                   | What it controls                                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metric ID                                | Unique code (e.g. `MET001`); must match the column header in the uploaded results CSV                                                                                                                                                                                                                      |
| System / Factor / Sub-Factor / Indicator | Placement in the hierarchy                                                                                                                                                                                                                                                                                 |
| Label                                    | Human-readable name shown in the dashboard                                                                                                                                                                                                                                                                 |
| Preference                               | Indicator of methodological robustness: 1 = strong evidence base, 2 = supplementary, 3 = reference-only (shown in reference list and deep-dive export only; excluded from the flagging pipeline entirely). Does **not** control rollup — see Evidence type below.                                          |
| Evidence type                            | `AN signal`, `Outcome`, `Predictor`, or `Supporting evidence`. Controls rollup participation: `Supporting evidence` metrics receive metric-level flags but are **excluded from subfactor/factor/system rollup** and the priority flag decision tree. All non-supporting metrics must have a VAN threshold. |
| Type                                     | Accepted value format for the uploaded results CSV — used to validate each cell before flagging. Examples: `num[0:1]` (proportion between 0 and 1), `int[0+]` (non-negative integer). If a submitted value falls outside this range the app flags it as invalid. Leave empty to accept any finite number.  |
| Threshold AN / VAN                       | Numeric cut-offs for Acute Needs (AN) and Very Acute Needs (VAN). VAN represents a more severe level. Required for all non-supporting-evidence metrics; validated by `bun run validate:reference-json`.                                                                                                    |
| Above or below                           | Whether a value **above** or **below** the threshold signals acute needs                                                                                                                                                                                                                                   |
| Evidence threshold                       | Minimum number of metrics with data needed to reach a conclusion in a sub-factor group                                                                                                                                                                                                                     |
| Factor threshold                         | Minimum number of flagged metrics needed to flag a sub-factor group                                                                                                                                                                                                                                        |
| Level / Risk concept                     | Metadata used for display and filtering in the reference list                                                                                                                                                                                                                                              |
| Kobo code                                | Links the metric to the MSNA kobo code                                                                                                                                                                                                                                                                     |

### Evidence type

The `Evidence type` column is the primary driver of how a metric behaves in the flagging pipeline:

| Value                 | Rollup behaviour                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `AN signal`           | Included in subfactor/factor/system rollup; contributes to the priority flag decision tree         |
| `Outcome`             | Same as AN signal                                                                                  |
| `Predictor`           | Same as AN signal                                                                                  |
| `Supporting evidence` | Metric-level flag computed and shown in the drill-down; **excluded** from rollup and priority flag |

All non-supporting-evidence metrics must have both AN and VAN thresholds set. The validation script (`bun run validate:reference-json`, Pass 8) enforces this.

### How flagging works

When a user uploads a results CSV, each metric value is compared to its AN and VAN thresholds. Results roll up from metric → sub-factor → factor → system, and then a single **priority flag** is assigned to each unit of analysis.

#### Sub-factor rollup

Metrics are grouped within each sub-factor by their `(factor_threshold, evidence_threshold)` pair. Within each group:

- **Flag** if flagged metrics ≥ `factor_threshold`
- **No flag** if metrics with data ≥ `evidence_threshold` (and flag rule not met)
- **Insufficient evidence** if some data is present but below the evidence threshold
- **No data** if no metrics have data

Sub-factor → Factor → System statuses propagate upward: `flag` beats `no_flag` beats `insufficient_evidence` beats `no_data`.

Only non-supporting-evidence metrics participate in this rollup.

#### Priority flag decision tree

The priority flag is assigned by evaluating system-level statuses in order:

| Step | Condition                                                                                                                 | Flag                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 0    | Mortality system flagged                                                                                                  | `em`                    |
| 1    | All classification systems have no data                                                                                   | `no_data`               |
| 2    | HO proportion rule: n > 5 and ≥ 2/3 HO metrics flagged, **or** 1 ≤ n ≤ 5 and ≥ 1/2 flagged                                | `ho_primary`            |
| 3    | Any HO metric crosses its VAN threshold (strict)                                                                          | `ho_secondary`          |
| 4    | Health outcomes flagged, **or** any classification metric crosses VAN (strict), **or** ≥ 3 classification systems flagged | `an_primary`            |
| 5    | Any classification system flagged                                                                                         | `an_secondary`          |
| 6    | No flags but some systems have no data or insufficient evidence                                                           | `insufficient_evidence` |
| 7    | All classification systems have data, nothing flagged                                                                     | `no_acute_needs`        |

**Classification metric**: all metrics which evidence type is either Outcome, Predictor, AN signal but not Supporting evidence. Those last are to be used for deep dives.

**Classification systems**: all systems except Mortality and Market Functionality (those two have dedicated rules at steps 0 and 5). The current classification systems are: Food Security, Health Outcomes, Livelihoods, WASH, and Health/Nutrition Services.

**HO**: Health Outcomes system only (steps 2–3 apply exclusively to HO metrics).

**VAN strict**: a VAN threshold is "strict" (`van_is_strict: true` in reference.json) when it differs from the AN threshold. Metrics where VAN = AN cannot add signal beyond the AN flag and are excluded from steps 3 and 4's VAN checks.

### What to do after updating the reference CSV

After editing `static/data/reference.csv`, a developer must run:

```bash
bun run data:refresh
```

This regenerates all the JSON files the app reads from the CSV and validates them. Without this step, changes to the spreadsheet have no effect on the app. The validation step will report any inconsistencies — missing IDs, invalid thresholds, broken hierarchy — before they reach the app.

---

## Getting started

Requires [Podman](https://podman.io/) and [podman-compose](https://github.com/containers/podman-compose).
No other tools needed on the host. The container image runs Fedora 42.

```bash
sudo dnf install podman podman-compose   # Fedora / WSL Fedora
```

> **Windows / WSL 2** — install WSL 2 first (`wsl --install -d FedoraLinux-42`), then run all commands inside WSL.

### Start the dev server

```bash
podman-compose up
```

Open <http://localhost:5173>.

### Devcontainer (VS Code / Podman Desktop / GitHub Codespaces)

Open the repo in a devcontainer-aware editor. `bun install` runs automatically.  
VS Code: set `"docker.dockerPath": "podman"` in your user settings.

### Other commands (run inside the container)

```bash
podman exec ana-dev bun run build        # production build
podman exec ana-dev bun run check        # type-check
podman exec ana-dev bun run test         # unit tests
podman exec ana-dev bun run data:refresh # regenerate + validate reference data
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

**Key distinction:** an _Indicator_ is a named concept (e.g. "Two-week prevalence of childhood illness") that groups one or more _Metrics_. Each _Metric_ has its own ID (`MET001`), type constraint, AN/VAN thresholds, and evidence type. The input CSV has one column per metric (`MET001`, `MET002`, …).

### Data flow

```
CSV Upload  (src/routes/+page.svelte)
  → parser.ts          PapaParse wrapper — returns headers + raw rows
  → validator.ts       Checks headers against reference.json, UOA uniqueness, type constraints
  → flagger.ts         Applies thresholds; rolls up metric → subfactor → factor → system → priority_flag
  → fetchAdmin.ts      If p-codes detected, fetches ADM1/ADM2 GeoJSON from external API (fire-and-forget)
  → Stores             flagStore, adminFeaturesStore
  → Results routes     /results  (heatmap, drilldown, coverage)
  → Export             download.ts (CSV/JSON/XLSX)  |  deepdive.ts (ZIP packages, one XLSX per UoA)
```

### Static assets

| File                                       | Description                                                                                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `static/data/reference.json`               | Full reference tree (5-level JSON, 198 metrics). Generated by `scripts/generate-reference-json.ts` from `reference.csv`. Validated by `scripts/validate-reference-json.ts`. |
| `static/data/reference-circlepacking.json` | D3-compatible tree for the circle-packing visualisation. Same hierarchy, leaf nodes carry `metric` object + `value` (derived from preference).                              |
| `static/data/reference.csv`                | Source of truth. One row = one metric. Edited here; run `bun run data:refresh` to regenerate all derived assets.                                                            |

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
            preference,
            type,               // e.g. "num[0:1]", "int[0+]"
            evidence_type,      // "Outcome" | "Predictor" | "AN signal" | "Supporting evidence"
                                // Supporting evidence: metric-level flags computed, excluded from rollup aggregation
            thresholds: { an, van },  // VAN = Very Acute Needs (more extreme cut-off)
            van_is_strict,      // true if van != null && van != an; null for supporting-evidence/pref-3 metrics
                                // Only true metrics contribute to ho_secondary and an_primary VAN branches
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
    | priority_flag
```

Status vocabulary (applies at every rollup level):

| Value                   | Meaning                                |
| ----------------------- | -------------------------------------- |
| `flag`                  | Threshold crossed — acute needs signal |
| `no_flag`               | Sufficient evidence, no acute needs    |
| `insufficient_evidence` | Some data but below evidence threshold |
| `no_data`               | No data at all for this level          |

`priority_flag` values (severity order): `em` · `ho_primary` · `ho_secondary` · `an_primary` · `an_secondary` · `insufficient_evidence` · `no_data` · `no_acute_needs`

Per-metric VAN columns are also emitted: `MET001_van_flag` (boolean | null) and `MET001_van_status` (`'flag' | 'no_flag' | 'no_data'`). These are computed for every non-preference-3 metric even when `van_is_strict` is `false`.

---

## Architecture

### Engine (`src/lib/engine/`)

| File                | Role                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pipeline.ts`       | Orchestrates validate → flag → admin fetch. Entry point for the full processing run.                                                                                                                   |
| `validator.ts`      | Validates CSV structure: headers present in `MetricMap`, UOA uniqueness, type constraints per metric. Produces `ValidationResult` with per-column missingness entries.                                 |
| `flagger.ts`        | Threshold-based flagging using `@tidyjs/tidy`. Preference-3 metrics are excluded from the flagging pipeline (reference display only). Rolls up metric → subfactor → factor → system → `priority_flag`. |
| `metricMetadata.ts` | Traverses `reference.json`: `getAllMetricIds()`, `getMetricMetadata()`, `getIndicatorMetadata()`, `buildSubfactorList()`, `buildReferenceRows()` (for the reference table).                            |
| `fetchAdmin.ts`     | Detects p-codes in the UOA column; fetches ADM1/ADM2 GeoJSON boundaries from an external API.                                                                                                          |
| `download.ts`       | Exports results as CSV / JSON / XLSX.                                                                                                                                                                  |
| `deepdive.ts`       | Generates ZIP packages (one XLSX per UoA) with full metric-level detail. Reads system colours from CSS custom properties via `getComputedStyle`.                                                       |
| `mergeDeepDives.ts` | Merges multiple deep-dive ZIP packages into a single consolidated XLSX (used by the `/merge` route).                                                                                                   |
| `exportMap.ts`      | Builds a self-contained composite SVG for map export (title, choropleth, legend, logos) with inlined light-theme styles.                                                                               |
| `parser.ts`         | Thin PapaParse wrapper; returns `{ headers, rows }`.                                                                                                                                                   |

### Stores (`src/lib/stores/`)

All stores use Svelte 5 `$state` runes and persist to `localStorage`. Access fields directly (no `$` prefix needed outside `.svelte` files).

| Store                | Storage key                | Purpose                                                                                                                                          |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `metricStore`        | `ana_metric_store_v2`      | Loads `reference.json` on boot; exposes `referenceJson` (full tree) and `metricMap` (flat `MetricMap` keyed by `MET001`). Cached with timestamp. |
| `flagStore`          | `ana_flag_store_v2`        | Stores `flaggedResult[]` rows from the pipeline. Keyed by `MET001` columns.                                                                      |
| `adminFeaturesStore` | `ana_admin_features_store` | Cached GeoJSON boundaries; fetch state `'idle' \| 'loading' \| 'done' \| 'error'`.                                                               |
| `resultsFilterStore` | `ana_results_filters_v1`   | Persists `/results` sidebar filter state (UoA, priority flag, group-by, metrics section filters). Survives SPA navigation and page reloads.      |
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

| Component                 | Purpose                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ResultsOverview.svelte`  | Overview — priority-flag donut, UoA ranking table, choropleth map with cascade layer filters                                  |
| `ResultsSystems.svelte`   | System-level heatmap; clicks open the metric drilldown (filterable by evidence type)                                          |
| `ResultsMetrics.svelte`   | Factor → Subfactor → Metric card grid per system                                                                              |
| `ResultsCoverage.svelte`  | Coverage summary — two tabs: overall system coverage and Health Outcomes metric-level AN/VAN breakdown                        |
| `ResultsSpotlight.svelte` | Custom metric × UoA cross-tab: per-system dropdown selectors above a sticky table; capped to the current filtered UoAs (≤ 10) |
| `ResultsExport.svelte`    | Export controls (CSV / JSON / XLSX / deep-dive ZIP)                                                                           |
| `FiltersSidebar.svelte`   | Filter panel (UoA, system, factor, priority flag status)                                                                      |

#### `viz/`

| Component                       | Purpose                                                                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HeatmapGrid.svelte`            | Systems × subfactors colour grid; cell = flag count / availability; sortable by priority flag                                                                                                           |
| `SystemMatrix.svelte`           | Expanded per-system metric matrix                                                                                                                                                                       |
| `MetricDrilldown.svelte`        | Metric-level detail: value, AN/VAN status and thresholds, evidence type; filter toggles by evidence type                                                                                                |
| `HealthOutcomesCoverage.svelte` | Per-metric AN/VAN flag counts for Health Outcomes; proportion rule thresholds (1/2, 2/3) shown visually                                                                                                 |
| `CirclePacking.svelte`          | Zoomable D3 circle-packing tree (5 depths: system → metric); supports `flagRow` overlay                                                                                                                 |
| `CoverageDetailCards.svelte`    | Per-factor coverage bars                                                                                                                                                                                |
| `UoaRankingTable.svelte`        | Ranked UoA table by priority flag                                                                                                                                                                       |
| `UoaDetailPanel.svelte`         | Single-UoA detail view                                                                                                                                                                                  |
| `ChoroplethMap.svelte`          | Choropleth map with three rendering modes: `ADM1` (admin-1 polygons only), `ADM2` (admin-2 polygons only), `MIXED` (ADM1 polygons as base with ADM2 overlaid where data exists). Exports composite SVG. |

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

Priority flag and status colours are CSS custom properties in the DaisyUI theme blocks in `app.css`. The priority flag palette uses a purple ramp for the three HO tiers (em/ho_primary/ho_secondary) and reuses the existing red, orange, and neutral tokens for the remaining flags. Accessed via `PRIORITY_BADGE_MAP` / `getPriorityBadge` and `FLAG_BADGE_MAP` / `getFlagBadge` in `colors.ts`.

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

| Command                       | Script                                   | Description                                                                      |
| ----------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| `generate:enums`              | `scripts/generate-*-enum.ts`             | Regenerate TypeScript enums in `src/lib/types/generated/` from the reference CSV |
| `generate:reference-json`     | `scripts/generate-reference-json.ts`     | Regenerate `reference.json` + `reference-circlepacking.json`                     |
| `validate:reference-json`     | `scripts/validate-reference-json.ts`     | Validate `reference.json` against Zod schemas                                    |
| `validate:hypotheses-json`    | `scripts/validate-hypotheses-json.ts`    | Validate hypotheses JSON                                                         |
| `validate:circlepacking-json` | `scripts/validate-circlepacking-json.ts` | Validate `reference-circlepacking.json` leaf structure                           |
| `data:refresh`                | —                                        | Run all generation + validation scripts in sequence                              |

**TypeScript enums** in `src/lib/types/generated/` are auto-generated — do not edit them directly.

---

## Maintenance guide — data pipeline and export logic

This section is for maintainers of the data pipeline or export logic. Frontend components are out of scope here.

### Repository map (maintenance perspective)

| Directory / file                           | What lives here                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `static/data/reference.csv`                | Metric-level source of truth — edit here, then run `data:refresh`                         |
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
| `scripts/generate-reference-json.ts`     | `reference.csv`                                  | `reference.json` + `reference-circlepacking.json` |
| `scripts/validate-reference-json.ts`     | `reference.json` + `system/factor/subfactor.csv` | — (exits non-zero on error)                       |
| `scripts/validate-circlepacking-json.ts` | `reference-circlepacking.json`                   | —                                                 |
| `scripts/generate-system-enum.ts`        | `system.csv`                                     | `src/lib/types/generated/system-enum.ts`          |
| `scripts/generate-factor-enum.ts`        | `factor.csv`                                     | `src/lib/types/generated/factor-enum.ts`          |
| `scripts/generate-subfactor-enum.ts`     | `subfactor.csv`                                  | `src/lib/types/generated/subfactor-enum.ts`       |

Run everything in sequence: `bun run data:refresh`

**Adding a new metric:** add the row to `reference.csv`, run `data:refresh`, confirm no validation errors.

**Adding a new system/factor/subfactor:** update the relevant lookup CSV (`system.csv`, `factor.csv`, or `subfactor.csv`) first, then add the rows to `reference.csv`, then run `data:refresh`. The validator will reject the reference JSON if the hierarchy ID is not in the lookup file.

**Renaming or removing a system/factor/subfactor ID:** update the lookup CSV and `reference.csv`, run `data:refresh` + `generate:enums`, then search the codebase for the old ID — it may appear in `src/lib/engine/flagger.ts` (the priority-flag decision tree references `SystemIDEnum` values for mortality, health outcomes, and market functionality).

### CI/CD — `.github/workflows/deploy.yml`

- **Trigger:** push to `main`, or manually from the GitHub Actions tab
- **Build steps:** install Bun → `bun run data:refresh` → `bun run test` → `bun run build` (with `BASE_PATH` set to the repo name for the GitHub Pages path prefix) → upload `build/` as Pages artifact
- **Deploy step:** depends on the build job; publishes to the GitHub Pages environment
- **Key implication:** `data:refresh` runs in CI before the build — a CSV change that fails validation will break the deployment. Always run `bun run data:refresh` locally and confirm it passes before pushing to `main`.

### Flagging logic — `src/lib/engine/flagger.ts`

Entry point: `flagData(rows, referenceJson)`.

The pipeline runs in five stages:

1. **Metric level** (`makeMetricSpec`) — for each non-preference-3 metric computes `{id}_flag`, `{id}_status`, `{id}_van_flag`, `{id}_van_status`, and `{id}_within_10perc_change`. Supporting-evidence metrics are included here (their flags appear in the drill-down).
2. **Sub-factor groups** — non-supporting-evidence metrics only (`rollupIds`). Grouped by `(factor_threshold, evidence_threshold)` pair (via `buildSubfactorList` in `metricMetadata.ts`). A group flags if flagged metrics ≥ `factor_threshold`; concludes `no_flag` if metrics with data ≥ `evidence_threshold`.
3. **Sub-factor status** — worst outcome across all its threshold groups.
4. **Factor / System rollup** — `rollupStatuses` aggregates child statuses: any `flag` → `flag`; otherwise `no_flag` if any `no_flag`; otherwise `insufficient_evidence`; otherwise `no_data`.
5. **`priority_flag`** — 8-step decision tree over system-level statuses and metric-level VAN flags (see [How flagging works](#how-flagging-works)). Hardcoded in `flagger.ts`; threshold values come from the CSV.

**Touch `flagger.ts` when:** the decision-tree logic changes, new priority-flag categories are added, or the rollup rules change. Threshold values themselves live in the CSV — only the structural logic is here.

### Deep-dive export — `src/lib/engine/deepdive.ts`

This is one of the two core outputs of the app. It generates a ZIP archive containing one pre-populated `.xlsx` per Unit of Analysis. The goal is that an analyst can open the file and immediately start writing the narrative — all data entry is already done by the app.

Each workbook has one worksheet per system. Worksheet layout:

- System header row (full-width, dark background with system colour)
- For each factor: factor row → for each sub-factor: sub-factor row → table of metric rows
- Each metric row carries:
  - **Pre-populated by the app:** Indicator label, Metric label, Metric ID, uploaded value, flag result (`flag` / `no_flag` / `no_data`), AN threshold, direction (above/below)
  - **Left editable for analysts:** H1–H5 hypothesis columns, Comment field

Only non-preference-3 metrics appear. Preference-3 (reference-only) metrics are excluded from the flagging pipeline and therefore not written to the workbook.

Column definitions and table headers live in `src/lib/types/deepdives.ts` (`tableHeaders`, `colWidths`, `colCount`).

System colours are resolved at runtime via `getComputedStyle(document.documentElement)` because ExcelJS runs in a browser context but outside a Svelte component — the CSS custom properties are available on the document root.

**Touch `deepdive.ts` when:** export layout, cell styling, column order, or pre-population logic changes.  
**Touch `deepdives.ts` when:** adding or removing columns from the exported table (update `tableHeaders`, `colWidths`, and `colCount` together).

### Validation and type safety

| File                              | Role                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/types/structure.ts`      | Canonical TS interfaces (`Metric`, `SubFactor`, `Factor`, `System`, `ReferenceRoot`). The engine works entirely against these types. |
| `src/lib/types/reference-json.ts` | Zod schemas validating `reference.json`. Add new required fields here when the CSV gains new mandatory columns.                      |
| `src/lib/types/generated/`        | Auto-generated enums. Never edit by hand — run `bun run generate:enums`.                                                             |

### Maintenance quick-reference

| Task                                        | Files to touch                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Add / remove a metric                       | `reference.csv` → `bun run data:refresh`                                                                                  |
| Change flagging thresholds                  | `reference.csv` → `bun run data:refresh` (values come from CSV)                                                           |
| Add a new system                            | `system.csv` → `reference.csv` → `bun run data:refresh`                                                                   |
| Add a new factor                            | `factor.csv` → `reference.csv` → `bun run data:refresh`                                                                   |
| Add a new sub-factor                        | `subfactor.csv` → `reference.csv` → `bun run data:refresh`                                                                |
| Rename / remove a system, factor, subfactor | Update lookup CSV + `reference.csv` → `bun run data:refresh` → `bun run generate:enums` → search codebase for old ID      |
| Change rollup or decision-tree logic        | `src/lib/engine/flagger.ts`                                                                                               |
| Change deep-dive XLSX layout or columns     | `src/lib/engine/deepdive.ts` + `src/lib/types/deepdives.ts`                                                               |
| Add a new required CSV field                | `reference.csv` + `scripts/generate-reference-json.ts` + `src/lib/types/structure.ts` + `src/lib/types/reference-json.ts` |
