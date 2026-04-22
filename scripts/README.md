# Scripts — Generate enums & validate indicators

This folder contains small helper scripts used to:

- generate TypeScript enums from CSV lookup tables (systems, factors, sub_factors), and
- validate the generated nested `indicators.json` using the zod schema.

These scripts are invoked with Bun (recommended) and are wired into the repository `package.json` as convenience commands.

---

## Files (scripts)

- `scripts/generate-system-enum.ts`
  - Reads `static/data/system.csv` and writes `src/lib/types/generated/system-enum.ts`.
  - Exported symbols: `SystemIDEnum`, `SystemIDs`, `SystemID`.
  - Use this to keep the TypeScript enums in sync with the CSV.

- `scripts/generate-factor-enum.ts`
  - Reads `static/data/factor.csv` and writes `src/lib/types/generated/factor-enum.ts`.
  - Exported symbols: `FactorIDEnum`, `FactorIDs`, `FactorID`.

- `scripts/generate-subfactor-enum.ts`
  - Reads `static/data/subfactor.csv` and writes `src/lib/types/generated/subfactor-enum.ts`.
  - Exported symbols: `SubFactorIDEnum`, `SubFactorIDs`, `SubFactorID`.

- `scripts/validate-reference-json.ts`
  - Reads `static/data/indicators.json` and validates it against the zod schema exported by:
    `src/lib/types/indicators.ts`.
  - Prints a friendly list of validation errors (paths + messages) or `Validation passed ✅`.

You can inspect these scripts directly:

```ANA_app_svelte/scripts/generate-system-enum.ts#L1-200
# open the script file to view implementation and comments
```

---

## Prerequisites

- Bun (for running TypeScript scripts directly): https://bun.sh
- zod (runtime validation library) installed in the project dependencies:

```ANA_app_svelte/package.json#L1-120
"dependencies": {
  ...
  "zod": "^4.x"
}
```

If `zod` is not installed, install it with Bun:

```ANA_app_svelte/scripts/README.md#L1-4
bun add zod
```

---

## How to run the scripts locally

- Generate the enums:

```
bun ./scripts/generate-system-enum.ts && bun ./scripts/generate-subfactor-enum.ts && bun ./scripts/generate-factor-enum.ts
# or via package.json script:
bun run generate:enums
```

- Generate the indicators JSON:

```
bun ./scripts/generate-reference-json.ts
# or via package.json script:
bun run generate:reference-json
```

- Validate the indicators JSON:

```
bun ./scripts/validate-reference-json.ts
# or via package.json script:
bun run validate:reference-json
```

---

## package.json scripts

The repository `package.json` already contains convenience scripts. Example entries you may have or want to add:

- Existing (or similar) entries:

```ANA_app_svelte/package.json#L1-80
{
  "scripts": {
    "generate:enums": "bun ./scripts/generate-system-enum.ts && bun ./scripts/generate-subfactor-enum.ts && bun ./scripts/generate-factor-enum.ts",
    "generate:reference-json": "bun ./scripts/generate-reference-json.ts",
		"validate:reference-json": "bun ./scripts/validate-reference-json.ts",
    ...
  }
}
```

- Recommended: run all enum generators in sequence (update `generate:enums` to run all three)
  (this example is a suggestion — you can paste it into your `package.json`):

```ANA_app_svelte/scripts/README.md#L1-8
"generate:enums": "bun ./scripts/generate-system-enum.ts && bun ./scripts/generate-factor-enum.ts && bun ./scripts/generate-subfactor-enum.ts"
```

- Suggested CI / prepare hook:
  - Run the enum generation as part of your build or `prepare` step to ensure generated enums are always up to date.

```ANA_app_svelte/scripts/README.md#L1-4
# Example (package.json)
"prepare": "bun run generate:enums && svelte-kit sync || echo ''"
```

---

## Output locations (where generated files appear)

- `src/lib/types/generated/system-enum.ts`
- `src/lib/types/generated/factor-enum.ts`
- `src/lib/types/generated/subfactor-enum.ts`

These generated modules export enums/types used by `src/lib/types/indicators.ts` and other code that relies on canonical system/factor/subfactor IDs.

Example (inspect file):

```ANA_app_svelte/src/lib/types/generated/system-enum.ts#L1-80
# View generated enum to confirm contents
```

---

## Validation notes & workflow

1. Edit CSVs under `static/data/` (`system.csv`, `factor.csv`, `subfactor.csv`, or `ind.csv`) as needed.
2. Re-generate enums so TypeScript + zod schemas will match the CSVs:

```ANA_app_svelte/scripts/README.md#L1-4
bun run generate:enums
```

3. If you change indicators or thresholds, re-generate the `indicators.json` file (if you have a script for that) or edit `static/data/indicators.json` directly.
4. Run the validator:

```ANA_app_svelte/scripts/README.md#L1-4
bun run validate:indicators
```

- The validator will output detailed zod error messages; fix reported CSV/JSON issues and re-run.

---

## Tips & troubleshooting

- If validation fails with enum errors after you update CSVs, re-run the corresponding generator so the generated TypeScript enums are updated.
- If CSVs contain quoted fields, embedded commas, or multiline cells, the current simple CSV parsers may not handle them; consider using a CSV parsing library (e.g. `papaparse`) and updating the generator scripts.
- The enum generator performs minimal sanitization to produce valid TypeScript enum member names (PascalCase). If multiple CSV ids map to the same enum key, the script appends a counter suffix to keep keys unique.
- If you prefer strictly typed JSON inputs (e.g. `thresholds.an` always numbers), ensure your CSV → JSON conversion step enforces numeric types (not strings).

---

If you want, I can:

- Update `package.json` now to run all three generators for `generate:enums`.
- Add a single script that regenerates all enums and then validates `indicators.json` in one command.
- Replace the simple CSV reader with a robust CSV parser to handle quoted cells.

Pick any of those and I will prepare the changes.
