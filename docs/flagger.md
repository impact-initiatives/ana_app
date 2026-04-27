Summary of the ationale

- Replace dependency on the old `indicators.js` with `access_indicators.js`.
- Drop the `indicatorMap` / flattened-map approach. Instead use `getIndicatorMetadata()` to look up metadata for each indicator ID (this enforces the canonical-ID-only model).
- Change the `flagData` signature to require only `items` and `indicatorsJson` (so it fails fast if metadata is missing). This is breaking by design.
- Data columns must be named exactly with the canonical indicator IDs (case/exact match). This removes all case-normalization and legacy mapping code.
- Subfactor aggregation uses `buildSubfactorList(indicatorsJson)` and matches codes directly to data columns; no mapping/normalization.
- Keep tidy.js-based mutate flow and export helpers for JSON/CSV/XLSX downloads unchanged except for minor column assumptions.

Important behavioral notes (breaking changes)

- Input rows must contain indicator columns named exactly as in `reference.json` (e.g. `IND001`), otherwise those indicators will be treated as missing.
- If an indicator's metadata is absent in `indicatorsJson` (no `getIndicatorMetadata` found), the indicator's flag, within-10% checks, etc. will return `null`.
- The code assumes the indicator metadata objects contain `raw.thresholds.an` and `raw.above_or_below` as before. If your reference.json uses different structure, you must align it.
