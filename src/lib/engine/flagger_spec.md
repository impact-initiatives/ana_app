# Flagger implementation spec — evidence & factor thresholds

## Context and files

| File                   | Role                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `access_indicators.js` | Metadata traversal layer — reads `reference.json`, exposes `buildSubfactorList`, `getIndicatorMetadata`, etc.                          |
| `flagger.ts`           | Flagging engine — calls access layer, builds `tidy` mutate pipeline, emits `prelim_flag`                                               |
| `colors.ts`            | Display metadata — `prelimBadge` maps `prelim_flag` values to colors and labels                                                        |
| `reference.json`       | Source of truth — hierarchical system → factor → subfactor → indicator, with per-indicator `evidence_threshold` and `factor_threshold` |
| `input_good_50.csv`    | Example input — rows with `uoa`, optional metadata cols, then indicator columns by canonical ID                                        |

---

## What the thresholds mean

`evidence_threshold` and `factor_threshold` are stored **per indicator** in `reference.json` but they operate at the **subfactor level** — they define how many indicators from a given "strength group" are needed to draw a conclusion about the subfactor.

Within a subfactor, indicators with the **same `(factor_threshold, evidence_threshold)` pair** form a group. All indicators with `(1, 1)` are in one group, all with `(2, 2)` in another, etc.

- **`factor_threshold`** — how many indicators in the group must be **flagged** for the subfactor to flag via that group
- **`evidence_threshold`** — how many indicators in the group must have **any data** (flagged or not) to be able to conclude "no flag" via that group

---

## Step-by-step logic

### Step 1 — Indicator level (rename only)

For each indicator `id` in the canonical list, `flagger.ts` emits:

- `{id}_flag` — `true` (flagged), `false` (not flagged), `null` (no data) — **unchanged**
- `{id}_flag_label` — **renamed to `{id}_status`** — values also normalised: `'flag'` | `'no_flag'` | `'no_data'`
- `{id}_within_10perc` — boolean, whether value is within 10% of AN threshold — **unchanged**
- `{id}_within_10perc_change` — boolean, not yet flagged but within 10% — **unchanged**

The rename aligns the indicator level with every other level which uses `.status`. Note also that the value `'noflag'` becomes `'no_flag'` (with underscore) to match the status vocabulary used at subfactor/factor/system levels.

Any UI code referencing `{id}_flag_label` or the value `'noflag'` must be updated to `{id}_status` and `'no_flag'` respectively.

---

### Step 2 — Subfactor level (new logic)

**Currently:** `flagger.ts` calls `makeGroupCountEntries(path, codes)` which emits `{path}.flag_n`, `{path}.noflag_n`, `{path}.missing_n`. This ignores thresholds entirely.

**New:** Replace with a subfactor status string emitted as `{path}.status`.

#### 2a — What `buildSubfactorList` needs to return (change in `access_indicators.js`)

Currently returns:

```js
[{ path: 'system.factor.subfactor', codes: ['IND001', 'IND002', ...] }]
```

New return shape — add `groups` alongside `codes`:

```js
[{
  path: 'system.factor.subfactor',
  codes: ['IND001', 'IND002', ...],   // kept for backward compat
  groups: [
    {
      factor_threshold: 1,
      evidence_threshold: 1,
      codes: ['IND001']
    },
    {
      factor_threshold: 2,
      evidence_threshold: 2,
      codes: ['IND002', 'IND003', ...]
    }
  ]
}]
```

Groups are built by iterating `sub.indicators` and grouping by `(factor_threshold, evidence_threshold)` pair. Order of groups within a subfactor is encounter order.

#### 2b — Evaluate one threshold group

```
function evaluateGroup(group, row):
  flag_n   = count of codes where {code}_flag === true
  noflag_n = count of codes where {code}_flag === false
  data_n   = flag_n + noflag_n

  if flag_n >= group.factor_threshold   → 'flag'
  if data_n >= group.evidence_threshold → 'no_flag'
  if data_n === 0                        → 'no_data'
  else                                   → 'insufficient_evidence'
```

#### 2c — Roll up groups into subfactor status

Priority order: `flag` > `no_flag` > `insufficient_evidence` > `no_data`

```
function evaluateSubfactor(groups, row):
  statuses = groups.map(g => evaluateGroup(g, row))

  if any status is 'flag'                     → 'flag'
  else if any status is 'no_flag'             → 'no_flag'
  else if any status is 'insufficient_evidence' → 'insufficient_evidence'
  else                                          → 'no_data'
```

Rationale: if even one group has enough evidence to conclude "no flag", that is sufficient — we don't require all groups to conclude. But a "flag" from any group always wins.

#### 2d — New output column

For each subfactor path, emit one column:

```
{path}.status  →  'flag' | 'no_flag' | 'insufficient_evidence' | 'no_data'
```

The old `{path}.flag_n`, `{path}.noflag_n`, `{path}.missing_n` columns are **kept** — they remain useful for the heatmap viz. Only the new `.status` column is added.

---

### Step 3 — Factor level (new logic)

**Currently:** `flagger.ts` accumulates all indicator codes for a factor into a flat set, calls `makeGroupCountEntries(factorKey, codes)`, emitting `{factorKey}.flag_n` etc. This loses subfactor structure.

**New:** Factor status is derived from its subfactor statuses.

```
function rollupStatuses(statuses):
  if any is 'flag'                              → 'flag'
  else if all are 'no_flag'                     → 'no_flag'
  else if mix of 'no_flag' and others           → 'insufficient_evidence'
  else if all are 'insufficient_evidence'       → 'insufficient_evidence'
  else if all are 'no_data'                     → 'no_data'
  else                                          → 'insufficient_evidence'
```

The else-if chain means:

- Any flag wins immediately
- All no_flag → clean no_flag
- Any mix that is not all-no_flag → insufficient_evidence (we can't conclude no_flag because some subfactors had no data or insufficient evidence)
- All no_data → pure no_data (nothing was collected)

New output column:

```
{factorKey}.status  →  'flag' | 'no_flag' | 'insufficient_evidence' | 'no_data'
```

Old `{factorKey}.flag_n` etc. columns are **kept** for backward compat with the heatmap.

---

### Step 4 — System level (new logic)

Same `rollupStatuses` function applied to all factor statuses within a system.

New output column:

```
{systemId}.status  →  'flag' | 'no_flag' | 'insufficient_evidence' | 'no_data'
```

Old `{systemId}.flag_n` etc. columns are **kept**.

---

### Step 5 — `prelim_flag` decision tree (updated)

**Currently** uses `{systemId}.flag_n > 0` to test if a system is flagged, and `flag_n + noflag_n > 0` to test if it has any data.

**New** reads `{systemId}.status` directly. The five outcomes in strict priority order:

```
isFlagged(systemId)       =  row[`${systemId}.status`] === 'flag'
isNoFlag(systemId)        =  row[`${systemId}.status`] === 'no_flag'
isInsufficient(systemId)  =  row[`${systemId}.status`] === 'insufficient_evidence'
isNoData(systemId)        =  row[`${systemId}.status`] === 'no_data'

1. EM
   — mortality.status === 'flag'

2. ROEM
   — health_outcomes.status === 'flag'
     AND count of (other active systems where isFlagged) >= 3

3. ACUTE
   — any active system isFlagged
     (catches all remaining flag cases not meeting EM or ROEM)

4. INSUFFICIENT_EVIDENCE
   — no active system is flagged
     AND at least one active system is 'insufficient_evidence'
     (systems that are 'no_flag' or 'no_data' do not block this)

5. NO_DATA
   — no active system is flagged
     AND no active system is 'insufficient_evidence'
     AND all active systems are 'no_data'
     (nothing was collected across all systems)

6. ACUTE_NEEDS
   — all active systems are 'no_flag'
     (only reached when every system has enough evidence to conclude no flag)
```

Note: cases 4, 5, 6 are mutually exclusive and cover all remaining possibilities after cases 1–3. The ordering 4 → 5 → 6 ensures the most informative outcome is returned first.

`market_functionality` remains excluded from `activeSystems` as before.

---

## What changes in each file

### `access_indicators.js`

**`buildSubfactorList`** — add `groups` to each returned item:

```js
// Inside the sub loop, after extracting codes:
const groups = new Map();
for (const ind of sub.indicators) {
	const ft = ind.factor_threshold ?? 1;
	const et = ind.evidence_threshold ?? 1;
	const key = `${ft}:${et}`;
	if (!groups.has(key))
		groups.set(key, { factor_threshold: ft, evidence_threshold: et, codes: [] });
	groups.get(key).codes.push(ind.indicator);
}
out.push({
	path: `${systemId}.${factorId}.${subId}`,
	codes, // unchanged
	groups: Array.from(groups.values()) // new
});
```

No other changes to `access_indicators.js`.

---

### `flagger.ts`

#### New helper — `evaluateGroup(group, d)`

```js
function evaluateGroup(group, d) {
	let flag_n = 0,
		noflag_n = 0;
	for (const c of group.codes) {
		const f = d[`${c}_flag`];
		if (f === true) flag_n++;
		if (f === false) noflag_n++;
	}
	const data_n = flag_n + noflag_n;
	if (flag_n >= group.factor_threshold) return 'flag';
	if (data_n >= group.evidence_threshold) return 'no_flag';
	if (data_n === 0) return 'no_data';
	return 'insufficient_evidence';
}
```

#### New helper — `rollupStatuses(statuses)`

```js
function rollupStatuses(statuses) {
	if (statuses.some((s) => s === 'flag')) return 'flag';
	if (statuses.every((s) => s === 'no_flag')) return 'no_flag';
	if (statuses.every((s) => s === 'no_data')) return 'no_data';
	return 'insufficient_evidence';
}
```

#### Updated indicator mutate entries in `flagger.ts`

The `labelKey` variable and its value strings change:

```js
// before
const labelKey = `${id}_flag_label`;
// ...
(d) => {
	const f = d[flagKey];
	if (f === null || f === undefined) return 'no_data';
	return f ? 'flag' : 'noflag';
};

// after
const statusKey = `${id}_status`;
// ...
(d) => {
	const f = d[flagKey];
	if (f === null || f === undefined) return 'no_data';
	return f ? 'flag' : 'no_flag';
};
```

Replace `makeGroupCountEntries(path, inData)` (for subfactors only) with:

```js
// keep the old count entries (heatmap still uses them)
subEntries.push(...makeGroupCountEntries(path, inData));

// add the new status entry
const groups = subfactorGroups; // from buildSubfactorList
subEntries.push([
	`${path}.status`,
	(d) => {
		const groupStatuses = groups.map((g) => evaluateGroup(g, d));
		if (groupStatuses.some((s) => s === 'flag')) return 'flag';
		if (groupStatuses.some((s) => s === 'no_flag')) return 'no_flag';
		if (groupStatuses.some((s) => s === 'insufficient_evidence')) return 'insufficient_evidence';
		return 'no_data';
	}
]);
```

#### Updated factor mutate entries

Replace `makeGroupCountEntries(factorKey, codes)` with both old counts AND new status:

```js
factorEntries.push(...makeGroupCountEntries(factorKey, codes)); // keep
factorEntries.push([
	`${factorKey}.status`,
	(d) => {
		const sfStatuses = subfactorPathsForFactor.map((p) => d[`${p}.status`] ?? 'no_data');
		return rollupStatuses(sfStatuses);
	}
]);
```

This requires tracking which subfactor paths belong to each factor — currently the code only tracks indicator codes per factor. Need to also track subfactor paths.

#### Updated system mutate entries

Same pattern — rollup of factor statuses:

```js
systemEntries.push(...makeGroupCountEntries(systemId, codes)); // keep
systemEntries.push([
	`${systemId}.status`,
	(d) => {
		const fStatuses = factorPathsForSystem.map((p) => d[`${p}.status`] ?? 'no_data');
		return rollupStatuses(fStatuses);
	}
]);
```

#### Updated `prelim_flag`

```js
const prelimFlagEntry = [
	'prelim_flag',
	(d) => {
		const status = (key) => (key ? (d[`${key}.status`] ?? 'no_data') : 'no_data');
		const isFlagged = (key) => status(key) === 'flag';
		const isNoFlag = (key) => status(key) === 'no_flag';
		const isInsuff = (key) => status(key) === 'insufficient_evidence';

		// 1. Emergency — mortality system flagged
		if (isFlagged(mortalitySystemId)) return 'EM';

		// 2. Risk of Emergency — health outcomes flagged AND ≥3 other active systems flagged
		const otherFlagged = activeSystems.filter((s) => s !== healthOutcomesId && isFlagged(s)).length;
		if (isFlagged(healthOutcomesId) && otherFlagged >= 3) return 'ROEM';

		// 3. Acute Needs — any active system flagged
		if (activeSystems.some(isFlagged)) return 'ACUTE';

		// 4. Insufficient Evidence — no flag, but at least one system has insufficient evidence
		if (activeSystems.some(isInsuff)) return 'INSUFFICIENT_EVIDENCE';

		// 5. No Data — no flag, no insufficient evidence, all systems are no_data
		if (activeSystems.every((s) => status(s) === 'no_data')) return 'NO_DATA';

		// 6. No Acute Needs — all active systems are no_flag
		return 'ACUTE_NEEDS';
	}
];
```

---

### `colors.ts`

**Two changes needed.**

**1. `FLAG_BADGE` key rename** — the existing key `'noflag'` must become `'no_flag'` to match the new indicator status vocabulary (and for consistency with subfactor/factor/system statuses):

```ts
export const FLAG_BADGE: Record<string, FlagStatusBadge> = {
  flag:                 { label: 'Flag',              tintVar: '--color-flag-tint',    badgeCls: 'badge-error',   checkboxCls: 'checkbox-error'   },
  no_flag:              { label: 'No Flag',           tintVar: '--color-no-flag-tint', badgeCls: 'badge-success', checkboxCls: 'checkbox-success' },
  insufficient_data:    { label: 'Insufficient Data', tintVar: '--color-no-data-tint', badgeCls: 'badge-warning', checkboxCls: 'checkbox-warning' },
  no_data:              { label: 'No data',           tintVar: '--color-no-data-tint', badgeCls: 'badge-ghost',   checkboxCls: 'checkbox-neutral' }
};
```

Any UI code using `FLAG_BADGE['noflag']` must be updated to `FLAG_BADGE['no_flag']`.

**2. Add `NO_DATA` to `prelimBadge`** — the new decision tree can emit `'NO_DATA'`:

```ts
export const prelimBadge: Record<string, FlagBadge> = {
  EM:                   { bg: 'var(--color-prelim-em)',      label: 'EM' },
  ROEM:                 { bg: 'var(--color-prelim-roem)',    label: 'RoEM' },
  ACUTE:                { bg: 'var(--color-prelim-an)',      label: 'Acute Needs' },
  INSUFFICIENT_EVIDENCE:{ bg: 'var(--color-insuff)',         label: 'Insufficient Evidence' },
  NO_DATA:              { bg: 'var(--color-prelim-no-data)', label: 'No Data' },
  ACUTE_NEEDS:       { bg: 'var(--color-prelim-no-an)',   label: 'No Acute Needs' }
};
```

`NO_DATA` shares the same color as `INSUFFICIENT_EVIDENCE` for now — both represent absence of conclusion, differing only in cause.

**3. Add `STATUS_TO_BADGE_KEY`** — maps `.status` values (all levels) to `FLAG_BADGE` keys for UI display:

```ts
export const STATUS_TO_BADGE_KEY: Record<string, string> = {
  flag:                  'flag',
  no_flag:               'no_flag',
  insufficient_evidence: 'insufficient_data',
  no_data:               'no_data'
};
```

---

## New columns emitted per row (summary)

| Column pattern                         | Values                                                                             | Change                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `{id}_flag`                            | `true` \| `false` \| `null`                                                        | unchanged                                                    |
| `{id}_status`                          | `'flag'` \| `'no_flag'` \| `'no_data'`                                             | **renamed** from `{id}_flag_label`; `'noflag'` → `'no_flag'` |
| `{id}_within_10perc`                   | boolean                                                                            | unchanged                                                    |
| `{id}_within_10perc_change`            | boolean                                                                            | unchanged                                                    |
| `{system}.{factor}.{subfactor}.status` | `flag` \| `no_flag` \| `insufficient_evidence` \| `no_data`                        | **new**                                                      |
| `{system}.{factor}.status`             | same                                                                               | **new**                                                      |
| `{system}.status`                      | same                                                                               | **new**                                                      |
| `prelim_flag`                          | `EM` \| `ROEM` \| `ACUTE` \| `INSUFFICIENT_EVIDENCE` \| `NO_DATA` \| `ACUTE_NEEDS` | updated logic                                                |

All existing `{path}.flag_n`, `{path}.noflag_n`, `{path}.missing_n` columns are **retained** for backward compatibility with the heatmap visualisation.

---

## Key structural change in `flagger.ts` main loop

The current loop iterates `subList` and accumulates codes into `factorMap` and `systemMap`. It needs to also accumulate **subfactor paths** into `factorSubfactorPaths` and **factor paths** into `systemFactorPaths`, so the rollup entries can reference the correct `.status` columns:

```js
const factorSubfactorPaths = new Map(); // factorKey → Set of subfactor paths
const systemFactorPaths = new Map(); // systemId  → Set of factor paths

for (const { path, codes, groups } of subList) {
	// ... existing code ...
	const factorKey = `${systemId}.${factorId}`;

	if (!factorSubfactorPaths.has(factorKey)) factorSubfactorPaths.set(factorKey, new Set());
	factorSubfactorPaths.get(factorKey).add(path);

	if (!systemFactorPaths.has(systemId)) systemFactorPaths.set(systemId, new Set());
	systemFactorPaths.get(systemId).add(factorKey);
}
```

This is the only structural addition to the loop — the rest is additive.
