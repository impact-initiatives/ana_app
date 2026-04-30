# Plan: Mixed ADM1 + ADM2 p-codes (#104)

Allow a single dataset to contain both ADM1 (e.g. `SD01`) and ADM2 (e.g. `SD0101`) p-codes
from the same country. Update map display, UoA labels, and admin boundary fetching accordingly.

Only ADM1 and ADM2 are supported — no deeper levels.

---

## Tasks

- [ ] **Task 1** — `pcode.ts`: add `'mixed'` action for same-country mixed levels
- [ ] **Task 2** — `fetchAdmin.ts`: fetch both ADM1 polygons + ADM2 polygons for MIXED; return `adm1Polygons`
- [ ] **Task 3** — `adminFeaturesStore.svelte.ts`: add `adm1Polygons` field; merge label map from both levels
- [ ] **Task 4** — `+page.svelte`: propagate `'mixed'` through derived values and effect
- [ ] **Task 5** — `ChoroplethMap.svelte`: two-layer MIXED rendering (ADM1 fill → ADM2 fill → ADM1 outline)

---

## Rendering design (MIXED mode)

```
Layer 1 (bottom) — ADM1 polygons, colored by ADM1-level UoA rows, NO_DATA where unmatched
Layer 2 (middle) — ADM2 polygons, colored by ADM2-level UoA rows, TRANSPARENT where unmatched
Layer 3 (top)    — ADM1 boundary lines (decorative, no pointer events)
```

Transparent ADM2 features let the ADM1 color show through in areas where only ADM1 data exists.

---

## Store field layout per mode

| Mode  | `adm1` (store) | `adm2` (store) | `adm1Polygons` (store) |
|-------|---------------|---------------|------------------------|
| ADM1  | polygons       | empty FC      | `null`                 |
| ADM2  | lines          | polygons      | `null`                 |
| MIXED | lines          | polygons      | polygons               |

`buildPcodeLabelMap` uses `adm1Polygons ?? adm1` for ADM1 label extraction
(avoids reading line features which carry only `adm1_pcode`, not `gis_name`).

---

## Notes

- Multiple countries in the same dataset remain an error.
- Mixed levels with more than 2 admin levels (e.g. ADM0 + ADM1) are not handled.
- `pcodeLevel` type expands from `'ADM1' | 'ADM2'` to `'ADM1' | 'ADM2' | 'MIXED'`.
