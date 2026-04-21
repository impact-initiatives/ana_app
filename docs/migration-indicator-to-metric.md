# Migration: Indicator → Metric leaf level

## Context

The reference CSV (`ANA_2025_reference.csv`) has been restructured so that **one row = one metric** (identified by `Metric ID`, e.g. `MET001`). The `Indicator_ID_legacy` column (`IND001`…) is gone — no backward compatibility.

The new hierarchy is:

```
System → Factor → Sub-Factor → Indicator (grouping label) → Metric (leaf, 1 row)
```

**Example:** "Two-week prevalence of childhood illness" is an **Indicator** grouping three **Metrics**: MET015, MET016, MET017 — each with its own type constraint, threshold, and ID.

This migration removes all IND-based logic and replaces it with MET-based logic at every layer.

---

## Hierarchy comparison

| Level       | Before                              | After                                 |
| ----------- | ----------------------------------- | ------------------------------------- |
| Leaf ID     | `IND001` (row = indicator)          | `MET001` (row = metric)               |
| Leaf object | `Indicator { indicator: "IND001" }` | `Metric { metric: "MET001" }`         |
| Parent      | Sub-Factor → Indicators[]           | Sub-Factor → Indicators[] → Metrics[] |
| CSV column  | `IND001`                            | `MET001`                              |
| Flag column | `IND001_flag`, `IND001_status`      | `MET001_flag`, `MET001_status`        |

---

## Progress

### ✅ Phase 1 — Data model

**`src/lib/types/structure.ts`** — Done.

- `MetricID`, `MetricType`, `METRIC_ID_REGEX`, `METRIC_TYPE_REGEX`, `MetricPreferenceEnum`, `MetricDirectionEnum`, `ParsedMetricType`, `parseMetricType` — all renamed.
- `Metric` interface: leaf, `metric: MetricID` field.
- `Indicator` interface: grouping layer, `{ id, label, metrics: Metric[] }`.
- `SubFactor.indicators: Indicator[]` — same field name, new type.
- `ReferenceRoot` (was `IndicatorsRoot`).

**`src/lib/types/reference-json.ts`** (was `indicators-json.ts`) — Done.

- File renamed.
- `MetricSchema`, `IndicatorSchema`, `ReferenceRootSchema` (was `IndicatorsRootSchema`).
- `validateReferenceRoot`, `safeValidateReferenceRoot` (was `validateIndicatorsRoot` etc.).
- `MetricPreferenceEnum`, `MetricDirectionEnum` exported under real names (old aliases removed).
- All `z.nativeEnum`/`errorMap` calls updated to Zod v4 `z.enum`/`message`.

**`src/lib/index.ts`** — Done. Barrel exports updated; enums moved out of `export type`.

### ✅ Phase 2 — JSON generation & static assets

**`scripts/generate-reference-json.ts`** (was `generate-indicators-json.ts`) — Done.

- File renamed.
- Groups CSV rows: system → factor → subfactor → indicator (concept) → metrics[].
- Circle-packing hierarchy: root → system → factor → subfactor → indicator → metric (leaf, carries `metric` object + `value`).
- `build()` returns `{ root, emptyTypeIds, circlePackingRoot }`; `main()` handles I/O.

**`scripts/validate-reference-json.ts`** (was `validate-indicators-json.ts`) — Done.

- File renamed, imports updated, traversal updated to walk 5-level tree.

**`scripts/validate-circlepacking-json.ts`** — Done.

- Leaf = metric node with `metric` object and `id: "MET001"`.
- `IndicatorConceptSchema` → `IndicatorSchema`; `INDICATOR_ID_REGEX` → `METRIC_ID_REGEX`.
- `z.nativeEnum`/`errorMap` updated to Zod v4 `z.enum`/`message`.
- Cross-check traversal walks `sf.indicators → ind.metrics → m.metric`.

**`static/data/reference.json`** (was `indicators.json`) — Regenerated (232 KB, 198 metrics, 7 systems).

**`static/data/reference-circlepacking.json`** (was `indicators-circlepacking.json`) — Regenerated (297 KB).

- 5-level tree: root → system → factor → subfactor → indicator → metric leaf.
- Indicator nodes: composite id `"system::factor::subfactor::indicator_id"`, no `value`/`metric`.
- Metric leaves: `id: "MET001"`, `value: 1–3`, `metric: { ...full Metric object }`.

**`package.json`** — Done. Scripts renamed: `generate:reference-json`, `validate:reference-json`.

**`src/lib/engine/validator.ts`** — Done.

- `MetricMap` (was `IndicatorMap`), `ColDef` kind `'metric'` (was `'indicator'`).
- `MissingnessEntry.metric` (was `indicator`).
- `metricMap` parameter (was `indicatorMap`).

**Other renames/updates done:**

- `scripts/validate-hypotheses-json.ts`: `z.nativeEnum`/`errorMap` → Zod v4 `z.enum`/`message`.
- `src/lib/stores/indicatorsStore.svelte.ts`: fetch URL updated to `/data/reference.json`.
- `src/routes/reference/+page.svelte`, `src/routes/results/+page.svelte`: fetch URLs updated to `reference-circlepacking.json`.
- `scripts/generate-input-data.ts`: import changed to `ReferenceRoot`; `loadIndicators()` traversal updated to 5-level hierarchy (reads `met.metric`, `met.type`, `met.preference`); error message updated.
- `static/data/input.csv`, `input_good.csv`, `input_good_pcode.csv`, `input_good_pcode_bfa.csv`: headers updated from `IND001–IND006` → `MET001–MET006`.
- `static/data/input_good_50.csv`: regenerated via updated script — 198 MET columns (MET001–MET198).

---

### ✅ Phase 3 (partial) — Engine

#### 3.1 `src/lib/engine/metricMetadata.ts` — Done (renamed from `indicatorMetadata.ts`)

- File renamed and all symbols updated:
  - `extractCodesFromArray` → `extractMetricCodes`: iterates `ind.metrics[]`, reads `m.metric`.
  - `buildThresholdGroups`: reads `m.metric`, `m.factor_threshold`, `m.evidence_threshold` from `Metric`.
  - `getAllIndicatorIds` → `getAllMetricIds`: 5-level traversal collecting MET ids.
  - `getIndicatorIdsForPath` → `getMetricIdsForPath`: same 5-level path.
  - `buildSubfactorList`: codes/groups now contain MET ids.
  - `getIndicatorMetadata` → `getMetricMetadata(json, metricId)`: returns `{ metric, raw: Metric, systemId, factorId, subfactorId, indicatorId, metric_description }`.
  - `INDICATOR_TABLE_COLUMNS` → `REFERENCE_TABLE_COLUMNS`: updated columns (metric, metric_description replace indicator/indicator_label).
  - `buildIndicatorRows` → `buildReferenceRows`: iterates 5 levels; metric leaf = one row; `indicator` = concept label.
- `metric_description` field globally renamed to `label` (Option A) — consistent with all other hierarchy levels.
- `buildThresholdGroups` now accepts flat `Metric[]` directly; callers do `.flatMap(ind => ind.metrics)`.
- Added `getIndicatorMetadata(json, indicatorId)` → `{ indicatorId, label, systemId, factorId, subfactorId, raw: Indicator }`.
- All 4 consumers updated:
  - `flagger.ts`: imports `getAllMetricIds`, `getMetricMetadata`, `buildSubfactorList` from `metricMetadata`; `extractIndicatorMetadata` → `extractMetricMetadata`.
  - `results/+page.svelte`: imports `getMetricMetadata`, `buildReferenceRows`; `indicator_label` → `label`; status lookup uses `${r.metric}_status`.
  - `reference/+page.svelte`: imports `buildReferenceRows`; `indicatorObjects` → `referenceObjects`; tree filter checks `node.metric` (leaf) not `node.indicator`.
  - `SystemMatrix.svelte`: imports `getMetricMetadata`; label reads `md.raw?.label`.

#### 3.2 `src/lib/engine/flagger.ts` — Done

- `makeIndicatorSpec` → `makeMetricSpec`; `indicatorSpec` variable → `metricSpec`.
- Preference-3 metrics explicitly excluded from flagging pipeline: `canonicalIds = allMetricIds.filter(id => metadata[id]?.raw?.preference !== 3)`. They appear in `reference.json` and circle-packing for reference display only.
- Pipeline Layer 1 comment updated: `// per-metric _flag, _status, _within_10perc (preference 1+2 only)`.

#### 3.3 `src/lib/engine/validator.ts` — Done (see Phase 2 above).

#### 3.4 `src/lib/engine/pipeline.ts` — Done

- `PipelineInput`: `indicatorMap: MetricMap` → `metricMap: MetricMap`; `indicatorsJson` → `referenceJson`.
- `PipelineError` code: `'indicators_not_ready'` → `'reference_not_ready'`; error message updated.
- `runPipeline` destructures and passes `metricMap` / `referenceJson` throughout.

#### 3.5 `src/lib/engine/deepdive.ts` / `download.ts` — Done

- `deepdive.ts`: inner loop now iterates `sub.indicators[] → ind.metrics[]`; reads `met.metric` (ID), `ind.label` (concept), `met.label` (metric label), `met.thresholds`, `met.above_or_below`; param renamed `indicatorsJson` → `referenceJson`.
- `download.ts`: `downloadDeepDiveZip` param renamed `indicatorsJson` → `referenceJson`.

---

### ✅ Phase 4 — Stores

#### 4.1 `src/lib/stores/metricStore.svelte.ts` — Done (file created; `indicatorsStore.svelte.ts` deleted)

- New file `metricStore.svelte.ts` replaces `indicatorsStore.svelte.ts` (deleted).
- `metricMap: MetricMap` — stores full `Metric` objects keyed by uppercased MET code; satisfies `validateCsv`.
- `flattenMetrics(json)` — 5-level traversal (system → factor → subfactor → indicator → metrics).
- `loadMetrics()` replaces `loadIndicatorsIntoStore()`; `referenceJson` replaces `indicatorsJson`.
- `STORAGE_KEY = 'ana_metric_store_v1'`.
- All consumers updated: `+page.svelte`, `results/+page.svelte`, `reference/+page.svelte`.

#### 4.2 `src/lib/stores/flagStore.svelte.ts` — Done

- `STORAGE_KEY` bumped from `'ana_flag_store'` → `'ana_flag_store_v2'` to invalidate stale IND-keyed localStorage data.

---

### ✅ Phase 5 — UI & visualizations

#### 5.1 `src/routes/results/+page.svelte` — Done

- `buildSystemBlocks()` traverses `json.systems → factors → sub_factors → indicators → metrics` directly.
- Block tree shape: `SystemBlock → FactorBlock.subfactors[] → SubfactorBlock.metrics[] → MetricBlock` (no Indicator grouping level in UI).
- Each `MetricBlock` carries `indicatorLabel` (concept name) shown on the card.
- `filteredBlocks` and `totalMetrics` updated for 4-level structure (subfactors contain metrics directly).
- Removed imports: `getSystemMetadata`, `getFactorMetadata`, `getMetricMetadata`.

#### 5.2 `src/lib/components/results/ResultsMetrics.svelte` — Done (renamed from `ResultsIndicators.svelte`, deleted)

- File renamed; new component renders Factor → Subfactor blocks, metric `Card` grid within each subfactor.
- No Indicator grouping level; each card shows `MET001` (mono bold) + indicator concept name (muted) + metric label italic.
- `totalMetrics` prop (was `totalIndicators`).

#### 5.3 `src/lib/components/viz/CoverageDetailCards.svelte` — Done

- Field names are factor-level aggregations (`${factorKey}.flag_n` etc.) — no IND/MET-specific column reads. Already correct.

#### 5.4 `src/lib/components/results/ResultsSystems.svelte` — Done

- Wording updated: "individual indicator values" → "individual metric values" in drill-down description.
- `SystemMatrix` `FactorBlock.indicatorIds` → `metricIds`; `indicatorInfo` function → `metricInfo`; prop to `IndicatorDrilldown` updated.
- `IndicatorDrilldown`: `FactorBlock.indicatorIds` → `metricIds`; `indicatorInfo` prop/type → `metricInfo`/`MetricInfo`; all internal calls updated.

#### 5.5 Circle-packing components — Done

- `CirclePacking.svelte`: `PackDatum.indicator?: Indicator` → `metric?: Metric`; all `ind.indicator`, `ind.indicator_label` occurrences → `met.metric`, `met.label`; `formatIndicatorTooltip` → `formatMetricTooltip`.
- `src/lib/utils/colors.ts`: `formatIndicatorTooltip(Indicator)` → `formatMetricTooltip(Metric)`; import updated.
- `src/lib/index.ts`: barrel export updated to `formatMetricTooltip`.

#### 5.6 Wording pass — Done

- `HeatmapGrid.svelte`: subtitle "number of indicators with flag" → "number of metrics with flag"; aria-labels updated.
- `reference/+page.svelte`: `PageHeader` title/subtitle updated to "Metric Reference List" / "Browse and filter the full metric framework."
- `ResultsSystems.svelte`: drill-down description updated.
- `IndicatorDrilldown.svelte`: subtitle, empty-state message updated.

---

### ✅ Phase 6 — Reference page

- `src/routes/reference/+page.svelte`: already renders via `buildReferenceRows` (updated in Phase 3.1) and `DataTable`. Title/subtitle wording updated in Phase 5.6.
- 5-level tree rendering: CirclePacking component (`reference-circlepacking.json`) uses `node.data.metric` (updated in Phase 5.5).

---

## ✅ Migration Complete

`bun run check` reports 5 errors, all pre-existing and unrelated to the IND→MET migration:

- `src/lib/engine/download.ts:102` — Uint8Array BlobPart type
- `src/lib/engine/parser.ts:144` — overload
- `src/lib/components/results/ResultsCoverage.svelte:96` — PackDatum type
- `src/lib/components/viz/GeoCanvas.svelte:35` — svgEl variable
- `src/routes/results/+page.svelte:651` — timestamp prop in ResultsExport

---

## Files — current status

| File                                                  | Status                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/lib/types/structure.ts`                          | ✅ Done                                                                         |
| `src/lib/types/reference-json.ts`                     | ✅ Done (renamed + updated)                                                     |
| `src/lib/types/generated/*`                           | ✅ Done (MetricID enum generated)                                               |
| `src/lib/index.ts`                                    | ✅ Done                                                                         |
| `scripts/generate-reference-json.ts`                  | ✅ Done (renamed + new grouping)                                                |
| `scripts/validate-reference-json.ts`                  | ✅ Done (renamed + updated)                                                     |
| `scripts/validate-circlepacking-json.ts`              | ✅ Done (metric-leaf aware)                                                     |
| `scripts/validate-hypotheses-json.ts`                 | ✅ Done (Zod v4 fixes)                                                          |
| `src/lib/engine/validator.ts`                         | ✅ Done (MetricMap, metric field)                                               |
| `static/data/reference.json`                          | ✅ Regenerated (198 metrics)                                                    |
| `static/data/reference-circlepacking.json`            | ✅ Regenerated (5-level tree)                                                   |
| `scripts/generate-input-data.ts`                      | ✅ Done (5-level traversal, MET IDs)                                            |
| `static/data/input*.csv` (5 test files)               | ✅ Done (MET001–MET006/198 headers)                                             |
| `src/lib/engine/metricMetadata.ts`                    | ✅ Done (renamed + 5-level traversal + `label` rename + `getIndicatorMetadata`) |
| `src/lib/engine/flagger.ts`                           | ✅ Done (`makeMetricSpec`, preference-3 exclusion, all naming)                  |
| `src/lib/engine/pipeline.ts`                          | ✅ Done (`metricMap`, `referenceJson`, `reference_not_ready`)                   |
| `src/lib/engine/download.ts`                          | ✅ Done (`referenceJson` param rename)                                          |
| `src/lib/engine/deepdive.ts`                          | ✅ Done (inner loop: indicator → metrics traversal)                             |
| `src/lib/stores/metricStore.svelte.ts`                | ✅ Done (new file; replaces indicatorsStore)                                    |
| `src/lib/stores/indicatorsStore.svelte.ts`            | ✅ Deleted                                                                      |
| `src/lib/stores/flagStore.svelte.ts`                  | ✅ Done (STORAGE_KEY → `ana_flag_store_v2`)                                     |
| `src/lib/utils/colors.ts`                             | ✅ Done (`formatMetricTooltip`, imports `Metric`)                               |
| `src/lib/index.ts`                                    | ✅ Done (`formatMetricTooltip` export)                                          |
| `src/routes/results/+page.svelte`                     | ✅ Done (5-level `buildSystemBlocks`, `ResultsMetrics`)                         |
| `src/lib/components/results/ResultsMetrics.svelte`    | ✅ Done (renamed + Factor→Subfactor→MetricCard)                                 |
| `src/lib/components/results/ResultsIndicators.svelte` | ✅ Deleted                                                                      |
| `src/lib/components/results/ResultsSystems.svelte`    | ✅ Done (wording)                                                               |
| `src/lib/components/viz/CoverageDetailCards.svelte`   | ✅ Done (factor-level keys unchanged, no IND/MET reads)                         |
| `src/lib/components/viz/SystemMatrix.svelte`          | ✅ Done (`metricIds`, `metricInfo`)                                             |
| `src/lib/components/viz/IndicatorDrilldown.svelte`    | ✅ Done (`metricIds`, `MetricInfo`, `metricInfo` prop, wording)                 |
| `src/lib/components/viz/HeatmapGrid.svelte`           | ✅ Done (wording: indicator→metric)                                             |
| `src/lib/components/viz/CirclePacking.svelte`         | ✅ Done (`metric?: Metric`, `met.metric`, `met.label`, `formatMetricTooltip`)   |
| `src/routes/reference/+page.svelte`                   | ✅ Done (title/subtitle wording; data via `buildReferenceRows`)                 |
| `static/data/reference-circlepacking.json`            | ✅ Regenerated (5-level tree)                                                   |

## Context

The reference CSV (`ANA_2025_reference.csv`) has been restructured so that **one row = one metric** (identified by `Metric ID`, e.g. `MET001`). The `Indicator_ID_legacy` column (`IND001`…) is gone — no backward compatibility.

The new hierarchy is:

```
System → Factor → Sub-Factor → Indicator (concept/label) → Metric (leaf, 1 row)
```

**Example:** "Two-week prevalence of childhood illness" is an **Indicator** concept grouping three **Metrics**: MET015, MET016, MET017 — each with its own type constraint, threshold, and ID.

This migration removes all IND-based logic and replaces it with MET-based logic at every layer.

---

## Hierarchy comparison

| Level       | Before (current)                    | After (target)                                 |
| ----------- | ----------------------------------- | ---------------------------------------------- |
| Leaf ID     | `IND001` (row = indicator)          | `MET001` (row = metric)                        |
| Leaf object | `Indicator { indicator: "IND001" }` | `Metric { metric: "MET001", indicator_label }` |
| Parent      | Sub-Factor → Indicators[]           | Sub-Factor → Indicators[] → Metrics[]          |
| CSV column  | `IND001`                            | `MET001`                                       |
| Flag column | `IND001_flag`, `IND001_status`      | `MET001_flag`, `MET001_status`                 |

---

## Phase 1 — Data model (`structure.ts`, `indicators-json.ts`)

### 1.1 `src/lib/types/structure.ts`

- Rename existing `Indicator` interface → `Metric`. Change `indicator: IndicatorID` → `metric: MetricID`.
- Add new `Indicator` interface: `{ id: string; label?: string | null; metrics: Metric[] }`.
- Update `SubFactor.indicators: Indicator[]` → `SubFactor.indicators: Indicator[]` (same field name, new type — Indicator now groups Metrics).
- Rename `IndicatorID` type alias → `MetricID`.
- Update `INDICATOR_ID_REGEX` → `METRIC_ID_REGEX = /^MET\d{3,}$/`.
- Keep `INDICATOR_ID_REGEX` for any internal use, or remove entirely.

```ts
// Target shape
export interface Metric {
  metric: MetricID;           // "MET001"
  metric_label?: string | null;
  preference: number;
  type: IndicatorType;
  metric_description?: string | null;
  msna_module?: string | null;
  msna_indicator?: string | null;
  question_kobo_code?: string | null;
  remarks_limitations?: string | null;
  thresholds: Thresholds;
  above_or_below: string;
  evidence_threshold: number;
  factor_threshold: number;
  risk_concept?: string | null;
}

export interface Indicator {
  id: string;                  // snake_case of "Indicator" column
  label?: string | null;       // raw "Indicator" column value
  metrics: Metric[];
}

export interface SubFactor {
  id: string;
  label?: string | null;
  indicators: Indicator[];
}
```

### 1.2 `src/lib/types/indicators-json.ts`

- Update all Zod schemas to match new shape.
- `metricSchema`: validates `metric` field matches `METRIC_ID_REGEX`.
- `indicatorSchema`: `id` (snake_case string) + `label` + `metrics[]`.
- `subFactorSchema`: `indicators[]` (array of indicatorSchema).
- Remove old `indicatorSchema` that validated `IND\d{3}`.
- Update `validateIndicatorsRoot` / `safeValidateIndicatorsRoot` accordingly.

---

## Phase 2 — JSON generation scripts

### 2.1 `scripts/generate-indicators-json.ts`

Current: groups rows by system/factor/subfactor, emits each row as an `Indicator` leaf.

Target:

1. Group rows by system → factor → subfactor → **indicator label** (the conceptual grouping).
2. Within each indicator label group, emit each row as a `Metric` leaf.
3. The indicator `id` = `toSnakeCase(row['Indicator'])`, `label` = raw string.
4. Each metric `metric` = `row['Metric ID']` (e.g. `MET001`).

```
RefRow fields used:
  Metric ID           → metric.metric
  Indicator           → indicator.label (+ snake_case → indicator.id)
  Metric              → metric.metric_description
  Type                → metric.type
  Preference          → metric.preference
  Acute needs …       → metric.thresholds.an + .an_label
  Very acute needs …  → metric.thresholds.van + .van_label
  Above or below      → metric.above_or_below
  Evidence threshold  → metric.evidence_threshold
  Factor threshold    → metric.factor_threshold
  Risk concept        → metric.risk_concept
  MSNA module/indicator/KOBO → passthrough
```

### 2.2 Enum generation scripts

- `generate-system-enum.ts`, `generate-factor-enum.ts`, `generate-subfactor-enum.ts` — likely unchanged (they operate at higher levels).
- Add/update `generate-metric-enum.ts` (was `generate-indicator-enum.ts` if it existed): emit `MetricID` enum from `Metric ID` column.
- Remove any IND-based enum files from `src/lib/types/generated/`.

### 2.3 Validation scripts

- `validate-indicators-json.ts` — update traversal to walk system → factor → subfactor → indicator → metric. Check `metric` field against `METRIC_ID_REGEX`. Check uniqueness of metric IDs globally.
- `validate-circlepacking-json.ts` — update for new structure after circlepacking JSON is regenerated.

### 2.4 Circle-packing JSON

- `generate-indicators-json.ts` (or a separate script) — regenerate `indicators-circlepacking.json` with new structure.
- Leaf nodes = metrics (MET IDs), parent nodes = indicator concepts.

---

## Phase 3 — Engine

### 3.1 `src/lib/engine/indicatorMetadata.ts`

All traversal functions currently terminate at the `indicators[]` array of a subfactor. They need a new metric-level layer.

Changes:

- `getAllIndicatorIds()` → rename to `getAllMetricIds()`, traverse system → factor → subfactor → indicator → metrics[].
- `getIndicatorMetadata(json, id)` → rename to `getMetricMetadata(json, metricId)`, traverse the new 5-level tree.
- Add `getIndicatorMetadata(json, systemId, factorId, subfactorId, indicatorId)` for concept-level lookup (label only, no thresholds).
- `buildSubfactorList()` → update to collect metric IDs (MET…) in `codes[]` and `groups[].codes[]`.
- `buildThresholdGroups()` — unchanged logic, but reads `metric.metric` instead of `ind.indicator`.
- `extractCodesFromArray()` — update to read `entry.metric` instead of `entry.indicator`.
- Update `buildIndicatorRows()` (used by coverage table/export) to emit rows at metric level.

### 3.2 `src/lib/engine/flagger.ts`

The flagging logic itself is metric-level already (it operates on leaf IDs). Changes are in naming only:

- `getAllIndicatorIds()` call → `getAllMetricIds()`.
- `getIndicatorMetadata()` calls → `getMetricMetadata()`.
- Output column names: `IND001` → `MET001`, `IND001_flag` → `MET001_flag`, `IND001_status` → `MET001_status`, `IND001_within_10perc` → `MET001_within_10perc`.
- Internal comments/variable names: `indicator` → `metric` where referring to leaves.

### 3.3 `src/lib/engine/validator.ts`

- `indicatorMap` parameter is keyed by `IND\d{3}` today → will be keyed by `MET\d{3}`.
- Column matching: trim + uppercase CSV header, check against metric IDs.
- `MissingnessEntry.indicator` → `MissingnessEntry.metric`.
- Update comments and error messages ("Unrecognised indicator column" → "Unrecognised metric column").

### 3.4 `src/lib/engine/pipeline.ts`

- Minor: passes `indicatorMap` from `indicatorsStore` — no logic change, but the map will now be keyed by MET IDs.

### 3.5 `src/lib/engine/download.ts` / `deepdive.ts`

- Any column-name construction using `IND…` → `MET…`.
- Export headers/labels: update display strings from "indicator" to "metric" where appropriate.

---

## Phase 4 — Stores

### 4.1 `src/lib/stores/indicatorsStore.svelte.ts`

- `IndicatorEntry` type: rename `indicator` field → `metric`, update `flattenIndicators()` to read `entry.metric` from new JSON shape.
- `indicatorMap` remains the same name (used throughout), but keys are now `MET001` etc.
- Consider renaming `indicatorMap` → `metricMap` for clarity (sweeping rename, low risk with LSP rename tool).

### 4.2 `src/lib/stores/flagStore.svelte.ts`

- Column names in stored `flaggedResult` rows change: `IND001` → `MET001` etc.
- Stored data from localStorage keyed on old IND names will be stale — bump storage version / clear on mismatch.

---

## Phase 5 — UI & visualizations

### 5.1 `src/routes/results/+page.svelte`

- `buildSystemBlocks()`: inner loop currently walks to `subfactor → codes → indicator IDs`. Update to walk `subfactor → indicators → metrics`, building a 5-level block tree: `SystemBlock → FactorBlock → IndicatorBlock (concept) → MetricBlock (leaf)`.
- `IndicatorBlock` / `MetricBlock` interface rename/addition.
- Filter options for "Indicators" section should become filter by indicator concept **and** by metric.

### 5.2 `src/lib/components/results/ResultsIndicators.svelte`

- Strips currently rendered per leaf ID. New rendering: group strips by indicator concept, strip per metric within that group.
- Props `indSystemOptions`, `indFactorOptions` — add `indIndicatorOptions` for concept-level filtering.

### 5.3 `src/lib/components/viz/CoverageDetailCards.svelte`

- Currently reads `row[${sys.id}.${factor.id}.flag_n]` etc. — update field names to use metric IDs.
- Metric-level count bars inside each factor card remain correct conceptually.

### 5.4 `src/lib/components/results/ResultsSystems.svelte` (heatmap)

- Heatmap cells currently keyed on `IND…` column names → update to `MET…`.

### 5.5 Circle-packing components

- Leaf node label/ID fields: update to use metric `metric` field.

### 5.6 Wording pass (all components + `steps.ts`)

| Old phrase                                       | New phrase                |
| ------------------------------------------------ | ------------------------- |
| "Indicator columns" (CSV format guide)           | "Metric columns"          |
| "indicator ID (e.g. IND001)"                     | "metric ID (e.g. MET001)" |
| "Unrecognised column names are silently ignored" | unchanged                 |
| "See the Reference tab for type constraints"     | unchanged                 |

---

## Phase 6 — Reference page

- `src/routes/reference/+page.svelte` — if it renders the indicator list, update to render the 5-level tree with indicator concepts as grouping rows and metrics as leaf rows.

---

## Execution order

Run phases in this order to keep the app buildable at each checkpoint:

```
1. structure.ts          — type-only, no runtime impact
2. indicators-json.ts    — Zod schemas, no runtime impact
3. generate-*.ts scripts — regenerate indicators.json + circlepacking.json
4. validate scripts      — confirm generated JSON is valid
5. indicatorMetadata.ts  — engine traversal
6. flagger.ts            — column name output
7. validator.ts          — CSV column matching
8. indicatorsStore       — flatten + map keys
9. flagStore             — localStorage version bump
10. results/+page.svelte — block tree rebuild
11. UI components        — rendering
12. Wording pass         — text copy
13. bun run check        — full type check
```

---

## Files touched (summary)

| File                                                  | Change type                                     |
| ----------------------------------------------------- | ----------------------------------------------- |
| `src/lib/types/structure.ts`                          | Major — new Indicator + Metric interfaces       |
| `src/lib/types/indicators-json.ts`                    | Major — new Zod schemas                         |
| `src/lib/types/generated/*`                           | Regenerate — MetricID enum replaces IndicatorID |
| `scripts/generate-indicators-json.ts`                 | Major — new grouping logic                      |
| `scripts/generate-metric-enum.ts`                     | New (or rename from indicator-enum)             |
| `scripts/validate-indicators-json.ts`                 | Update traversal                                |
| `scripts/validate-circlepacking-json.ts`              | Update for new leaf shape                       |
| `src/lib/engine/indicatorMetadata.ts`                 | Major — new traversal layer                     |
| `src/lib/engine/flagger.ts`                           | Medium — column name changes                    |
| `src/lib/engine/validator.ts`                         | Medium — MET key matching                       |
| `src/lib/engine/pipeline.ts`                          | Minor                                           |
| `src/lib/engine/download.ts`                          | Minor — column names                            |
| `src/lib/engine/deepdive.ts`                          | Minor — column names                            |
| `src/lib/stores/indicatorsStore.svelte.ts`            | Medium — flatten keyed by MET                   |
| `src/lib/stores/flagStore.svelte.ts`                  | Minor — localStorage version bump               |
| `src/routes/results/+page.svelte`                     | Medium — block tree, types                      |
| `src/lib/components/results/ResultsIndicators.svelte` | Medium — grouped strips                         |
| `src/lib/components/results/ResultsSystems.svelte`    | Minor — column names                            |
| `src/lib/components/viz/CoverageDetailCards.svelte`   | Minor — field names                             |
| `src/routes/reference/+page.svelte`                   | Medium — 5-level tree render                    |
| `src/lib/types/steps.ts` + homepage modal             | Minor — wording                                 |
| `static/data/indicators.json`                         | Regenerated                                     |
| `static/data/indicators-circlepacking.json`           | Regenerated                                     |
