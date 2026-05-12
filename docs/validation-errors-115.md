# Validation errors — branch 115-update-factor-and-subfactor-to-2026-list

Output of `bun ./scripts/validate-reference-json.ts`.

---

## Pass 1 — `above_or_below` must be "Above" or "Below" (10)

| System                 | Factor                | Subfactor              | Indicator              | Metric |
| ---------------------- | --------------------- | ---------------------- | ---------------------- | ------ |
| Health outcomes        | Health status         | Population health nee… | Any unmet health need… | MET030 |
| Water system           | HH Water security     | Quality                | Treating water from u… | MET126 |
| Living conditions      | Living conditions     | Exposure to elements   | Inadequate shelter an… | MET151 |
| Living conditions      | Environmental Hygiene | Exposure to elements   | Environmental sanitat… | MET150 |
| Living conditions      | Sanitation & Hygiene  | Accessibility          | Physical access to la… | MET154 |
| Living conditions      | Sanitation & Hygiene  | Accessibility          | Social access to latr… | MET155 |
| Living conditions      | Sanitation & Hygiene  | Quality & Availability | Hygienic conditions a… | MET164 |
| Health/Nutrition serv… | Health services       | Availability           | Unavailability as sel… | MET179 |
| Health/Nutrition serv… | Health services       | Accessibility          | Physical access to he… | MET181 |
| Health/Nutrition serv… | Health services       | Quality                | Minimum package of se… | MET203 |

---

## Pass 4 — `factor_threshold` ≤ 0 (10)

| System                 | Factor                | Subfactor              | Indicator              | Metric | Value |
| ---------------------- | --------------------- | ---------------------- | ---------------------- | ------ | ----- |
| Health outcomes        | Health status         | Population health nee… | Any unmet health need… | MET030 | 0     |
| Living conditions      | Living conditions     | Exposure to elements   | Inadequate shelter an… | MET151 | 0     |
| Living conditions      | Environmental Hygiene | Exposure to elements   | Environmental sanitat… | MET150 | 0     |
| Living conditions      | Sanitation & Hygiene  | Availability           | Sufficient number of … | MET152 | 0     |
| Living conditions      | Sanitation & Hygiene  | Accessibility          | Physical access to la… | MET154 | 0     |
| Living conditions      | Sanitation & Hygiene  | Accessibility          | Social access to latr… | MET155 | 0     |
| Living conditions      | Sanitation & Hygiene  | Quality & Availability | Hygienic conditions a… | MET164 | 0     |
| Health/Nutrition serv… | Health services       | Availability           | Unavailability as sel… | MET179 | 0     |
| Health/Nutrition serv… | Health services       | Accessibility          | Physical access to he… | MET181 | 0     |
| Health/Nutrition serv… | Health services       | Quality                | Minimum package of se… | MET203 | 0     |

## Pass 4 — `evidence_threshold` ≤ 0 (17)

| System                 | Factor                | Subfactor              | Indicator              | Metric | Value |
| ---------------------- | --------------------- | ---------------------- | ---------------------- | ------ | ----- |
| Health outcomes        | Health status         | Population health nee… | Any unmet health need… | MET030 | 0     |
| Food system            | Food consumption      | Quantity               | Minimum Meal Frequenc… | MET031 | 0     |
| Food system            | Food consumption      | Diversity              | Minimum Dietary Diver… | MET032 | 0     |
| Food system            | HH food security      | Accessibility          | Main food sources      | MET055 | 0     |
| Food system            | HH food security      | Accessibility          | Main sources of food … | MET059 | 0     |
| Water system           | HH Water consumption  | Quantity               | Quantity of water fro… | MET098 | 0     |
| Living conditions      | Living conditions     | Exposure to elements   | Inadequate shelter an… | MET151 | 0     |
| Living conditions      | Living conditions     | Overcrowding           | Population density es… | MET149 | 0     |
| Living conditions      | Environmental Hygiene | Exposure to elements   | Environmental sanitat… | MET150 | 0     |
| Living conditions      | Sanitation & Hygiene  | Availability           | Sufficient number of … | MET152 | 0     |
| Living conditions      | Sanitation & Hygiene  | Accessibility          | Physical access to la… | MET154 | 0     |
| Living conditions      | Sanitation & Hygiene  | Accessibility          | Social access to latr… | MET155 | 0     |
| Living conditions      | Sanitation & Hygiene  | Accessibility          | Access to safe latrin… | MET157 | 0     |
| Living conditions      | Sanitation & Hygiene  | Quality & Availability | Hygienic conditions a… | MET164 | 0     |
| Health/Nutrition serv… | Health services       | Availability           | Unavailability as sel… | MET179 | 0     |
| Health/Nutrition serv… | Health services       | Accessibility          | Physical access to he… | MET181 | 0     |
| Health/Nutrition serv… | Health services       | Quality                | Minimum package of se… | MET203 | 0     |

---

## Pass 6 — Threshold exceeds group size (5)

| System            | Factor            | Subfactor        | Field              | Value | Group size |
| ----------------- | ----------------- | ---------------- | ------------------ | ----- | ---------- |
| Food system       | Food consumption  | Quantity (proxy) | factor_threshold   | 2     | 1          |
| Food system       | Food consumption  | Quantity (proxy) | evidence_threshold | 2     | 1          |
| Food system       | Livelihoods       | Accessibility    | factor_threshold   | 3     | 1          |
| Food system       | Livelihoods       | Accessibility    | evidence_threshold | 2     | 1          |
| Living conditions | Living conditions | Overcrowding     | factor_threshold   | 2     | 1          |
