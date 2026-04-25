#!/usr/bin/env bun
/**
 * scripts/validate-indicators-json.ts
 *
 * Validates the generated `static/data/indicators.json` in two passes:
 *
 * Pass 1 — Zod schema
 *   Checks structural correctness of the JSON: indicator IDs, type syntax,
 *   threshold bounds, van-requires-an, above_or_below enum, etc.
 *
 * Pass 2 — Lookup CSV consistency
 *   Checks that every system, factor, and sub-factor id present in the JSON
 *   exists in the canonical lookup CSVs:
 *     static/data/system.csv      — valid system ids
 *     static/data/factor.csv      — valid (factor, system) pairs
 *     static/data/subfactor.csv   — valid (sub_factor, factor, system) triples
 *
 *   This is the authoritative place for these checks. The generator
 *   (generate-indicators-json.ts) only loads the lookup CSVs for label
 *   resolution and never aborts on mismatch.
 *
 * Usage:
 *   bun ./scripts/validate-indicators.ts
 *   bun ./scripts/validate-indicators.ts --json static/data/indicators.json
 *   bun ./scripts/validate-indicators.ts --factor static/data/factor.csv
 *   bun ./scripts/validate-indicators.ts --subfactor static/data/subfactor.csv
 *   bun ./scripts/validate-indicators.ts --help
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more validation errors
 *   2 — I/O or parse error (file not found, invalid JSON/CSV)
 */

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { safeValidateReferenceRoot, formatZodErrors } from '$lib/types/reference-json';
import { SystemIDEnum } from '$lib/types/generated/system-enum';

// ── Defaults ──────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'static', 'data');

const DEFAULTS = {
	json: path.join(DATA_DIR, 'reference.json'),
	factor: path.join(DATA_DIR, 'factor.csv'),
	subfactor: path.join(DATA_DIR, 'subfactor.csv')
};

// ── CLI ───────────────────────────────────────────────────────────────────────

interface Args {
	jsonPath: string;
	factorPath: string;
	subfactorPath: string;
	help: boolean;
}

function parseArgs(argv: string[]): Args {
	let jsonPath = DEFAULTS.json;
	let factorPath = DEFAULTS.factor;
	let subfactorPath = DEFAULTS.subfactor;
	let help = false;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--help' || arg === '-h') {
			help = true;
		} else if (arg === '--json' && argv[i + 1]) {
			jsonPath = path.resolve(argv[++i]);
		} else if (arg === '--factor' && argv[i + 1]) {
			factorPath = path.resolve(argv[++i]);
		} else if (arg === '--subfactor' && argv[i + 1]) {
			subfactorPath = path.resolve(argv[++i]);
		}
	}

	return { jsonPath, factorPath, subfactorPath, help };
}

function printHelp(): void {
	console.log(`
validate-reference-json.ts — Validate reference.json against Zod schema and lookup CSVs

Usage:
  bun ./scripts/validate-indicators.ts [flags]

Flags:
  --json      <path>   indicators JSON to validate
                       (default: static/data/reference.json)
  --factor    <path>   Factor lookup CSV    (default: static/data/factor.csv)
  --subfactor <path>   Sub-factor lookup CSV (default: static/data/subfactor.csv)
  --help, -h           Print this help and exit

Checks performed:

  Pass 1 — Zod schema
    · metric IDs match MET followed by 3+ digits (e.g. MET001)
    · type matches the type-syntax regex, or is null
    · threshold bounds match the declared type (num/int, lb, ub)
    · van cannot be set without an
    · above_or_below is "Above" or "Below"
    · preference is 1, 2, or 3

  Pass 2 — Lookup CSV consistency
    · every (factor, system) pair exists in factor.csv
    · every (sub_factor, factor, system) triple exists in subfactor.csv
    Note: system ids are already enforced by Pass 1 via z.enum(SystemIDEnum).

  Pass 3 — Required system IDs
    · mortality and health_outcomes must be present in the systems array
    · their absence disables the EM and ROEM classification paths in flagger.ts

  Pass 4 — Threshold value sanity
    · factor_threshold must be ≥ 1 (0 would always flag every group)
    · evidence_threshold must be ≥ 1 (0 would always conclude no_flag, even with no data)

  Pass 5 — Duplicate IDs
    · metric IDs must be globally unique across the full tree
    · system IDs must be globally unique
    · factor IDs must be unique within each system
    · subfactor IDs must be unique within each factor

  Pass 6 — Threshold integers and plausibility
    · factor_threshold and evidence_threshold must be integers (non-integer values
      produce nonsensical comparisons in evaluateGroup since counts are always whole)
    · within each (factor_threshold, evidence_threshold) group in a subfactor:
        factor_threshold ≤ group size  (otherwise the group can never flag)
        evidence_threshold ≤ group size (otherwise the group can never reach no_flag)
`);
}

// ── Lookup CSV row shapes ─────────────────────────────────────────────────────

interface FactorRow {
	factor: string;
	factor_label: string;
	system: string;
}
interface SubfactorRow {
	sub_factor: string;
	sub_factor_label: string;
	factor: string;
	system: string;
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

function parseCsv<T>(filePath: string, label: string): T[] | null {
	if (!fs.existsSync(filePath)) {
		console.error(`Error: ${label} not found: ${filePath}`);
		return null;
	}

	const raw = fs.readFileSync(filePath, 'utf-8');
	const content = raw.startsWith('\uFEFF') ? raw.slice(1) : raw; // strip BOM

	const result = Papa.parse<T>(content, { header: true, skipEmptyLines: true });

	if (result.errors.length > 0) {
		console.warn(`Warnings parsing ${label} (${result.errors.length}):`);
		for (const e of result.errors.slice(0, 5)) {
			console.warn(`  row ${e.row ?? '?'}: [${e.code}] ${e.message}`);
		}
	}

	return result.data.map((row) => {
		const trimmed: Record<string, string> = {};
		for (const [k, v] of Object.entries(row as Record<string, string>)) {
			trimmed[k.trim()] = (v ?? '').trim();
		}
		return trimmed as T;
	});
}

// ── Lookup CSV consistency check ──────────────────────────────────────────────

interface LookupError {
	/** Human-readable JSON path, e.g. "systems[2].factors[0].sub_factors[1]" */
	location: string;
	kind: 'factor' | 'subfactor';
	/** The id that was not found in the lookup CSV. */
	id: string;
	/** The composite key that was checked (for factor/subfactor). */
	key: string;
}

function checkLookupConsistency(
	data: unknown,
	factorRows: FactorRow[],
	subfactorRows: SubfactorRow[]
): LookupError[] {
	const validFactors = new Set(factorRows.map((r) => `${r.factor}::${r.system}`));
	const validSubfactors = new Set(
		subfactorRows.map((r) => `${r.sub_factor}::${r.factor}::${r.system}`)
	);

	const errors: LookupError[] = [];

	// Cast loosely — Zod pass already confirmed shape when it succeeded.
	const root = data as {
		systems?: Array<{
			id?: string;
			factors?: Array<{
				id?: string;
				sub_factors?: Array<{
					id?: string;
					indicators?: Array<{ id?: string }>;
				}>;
			}>;
		}>;
	};

	for (let si = 0; si < (root.systems?.length ?? 0); si++) {
		const sys = root.systems![si];
		const sysId = sys.id ?? '';
		const sysLoc = `systems[${si}]`;

		for (let fi = 0; fi < (sys.factors?.length ?? 0); fi++) {
			const fac = sys.factors![fi];
			const facId = fac.id ?? '';
			const facKey = `${facId}::${sysId}`;
			const facLoc = `${sysLoc}.factors[${fi}]`;

			if (!validFactors.has(facKey)) {
				errors.push({ location: facLoc, kind: 'factor', id: facId, key: facKey });
			}

			for (let sfi = 0; sfi < (fac.sub_factors?.length ?? 0); sfi++) {
				const sf = fac.sub_factors![sfi];
				const sfId = sf.id ?? '';
				const sfKey = `${sfId}::${facId}::${sysId}`;
				const sfLoc = `${facLoc}.sub_factors[${sfi}]`;

				if (!validSubfactors.has(sfKey)) {
					errors.push({ location: sfLoc, kind: 'subfactor', id: sfId, key: sfKey });
				}
			}
		}
	}

	return errors;
}

function printLookupErrors(errors: LookupError[]): void {
	const byFactors = errors.filter((e) => e.kind === 'factor');
	const bySubfactors = errors.filter((e) => e.kind === 'subfactor');

	console.error('\n❌ Pass 2 failed — the JSON contains ids not present in the lookup CSVs.');
	console.error('   Regenerate reference.json or update the lookup CSVs so the ids match.\n');

	if (byFactors.length > 0) {
		console.error(`── Unknown factors (${byFactors.length}) ──────────────────────────────────`);
		for (const e of byFactors) {
			const [facId, sysId] = e.key.split('::');
			console.error(
				`  ${e.location}: factor "${facId}" under system "${sysId}" not found in factor.csv`
			);
		}
		console.error('');
	}

	if (bySubfactors.length > 0) {
		console.error(`── Unknown sub-factors (${bySubfactors.length}) ────────────────────────────`);
		for (const e of bySubfactors) {
			const [sfId, facId, sysId] = e.key.split('::');
			console.error(
				`  ${e.location}: sub_factor "${sfId}" under factor "${facId}" / system "${sysId}" not found in subfactor.csv`
			);
		}
		console.error('');
	}

	console.error(`Total: ${errors.length} unknown id(s).`);
}

// ── Threshold value sanity check ─────────────────────────────────────────────

interface ThresholdValueError {
	location: string;
	metric: string;
	field: 'factor_threshold' | 'evidence_threshold';
	value: number;
}

/**
 * Checks that no metric has factor_threshold ≤ 0 or evidence_threshold ≤ 0.
 *
 * In evaluateGroup:
 *   - factor_threshold=0  → flag_n >= 0 is always true → every group always flags
 *   - evidence_threshold=0 → data_n >= 0 is always true → every group always concludes no_flag
 *     (even with no data, skipping the explicit no_data branch)
 */
function checkThresholdValues(data: unknown): ThresholdValueError[] {
	const root = data as {
		systems?: Array<{
			factors?: Array<{
				sub_factors?: Array<{
					indicators?: Array<{
						metrics?: Array<{
							metric?: string;
							factor_threshold?: number;
							evidence_threshold?: number;
						}>;
					}>;
				}>;
			}>;
		}>;
	};

	const errors: ThresholdValueError[] = [];

	for (let si = 0; si < (root.systems?.length ?? 0); si++) {
		for (let fi = 0; fi < (root.systems![si].factors?.length ?? 0); fi++) {
			for (let sfi = 0; sfi < (root.systems![si].factors![fi].sub_factors?.length ?? 0); sfi++) {
				for (let ii = 0; ii < (root.systems![si].factors![fi].sub_factors![sfi].indicators?.length ?? 0); ii++) {
					const ind = root.systems![si].factors![fi].sub_factors![sfi].indicators![ii];
					for (let mi = 0; mi < (ind.metrics?.length ?? 0); mi++) {
						const m = ind.metrics![mi];
						const loc = `systems[${si}].factors[${fi}].sub_factors[${sfi}].indicators[${ii}].metrics[${mi}]`;
						if (typeof m.factor_threshold === 'number' && m.factor_threshold <= 0) {
							errors.push({ location: loc, metric: m.metric ?? '?', field: 'factor_threshold', value: m.factor_threshold });
						}
						if (typeof m.evidence_threshold === 'number' && m.evidence_threshold <= 0) {
							errors.push({ location: loc, metric: m.metric ?? '?', field: 'evidence_threshold', value: m.evidence_threshold });
						}
					}
				}
			}
		}
	}

	return errors;
}

// ── Required system IDs check ─────────────────────────────────────────────────

/**
 * System IDs that must be present in reference.json for the ANA preliminary
 * classification to work correctly.
 *
 * - mortality      → triggers EM (Emergency) when flagged
 * - health_outcomes → triggers ROEM when flagged alongside ≥3 other systems
 *
 * Their absence is not caught by the Zod schema (which only checks that IDs
 * are valid members of SystemIDEnum, not that specific members are present).
 */
const REQUIRED_SYSTEM_IDS: SystemIDEnum[] = [
	SystemIDEnum.Mortality,
	SystemIDEnum.HealthOutcomes
];

function checkRequiredSystems(data: unknown): SystemIDEnum[] {
	const root = data as { systems?: Array<{ id?: string }> };
	const present = new Set((root.systems ?? []).map((s) => s.id).filter(Boolean));
	return REQUIRED_SYSTEM_IDS.filter((id) => !present.has(id));
}

// ── Threshold integer + plausibility checks ───────────────────────────────────

interface ThresholdIntegerError {
	location: string;
	metric: string;
	field: 'factor_threshold' | 'evidence_threshold';
	value: number;
}

interface ThresholdPlausibilityError {
	/** Path to the subfactor containing the offending group. */
	location: string;
	kind: 'factor_threshold' | 'evidence_threshold';
	value: number;
	groupSize: number;
	/** Composite key identifying the group, e.g. "ft=2,et=3". */
	groupKey: string;
}

/**
 * Checks that factor_threshold and evidence_threshold are integers.
 * Non-integer values (e.g. 1.5) produce nonsensical comparisons in evaluateGroup
 * because flag_n and data_n are always whole numbers.
 */
function checkThresholdIntegers(data: unknown): ThresholdIntegerError[] {
	const root = data as {
		systems?: Array<{
			factors?: Array<{
				sub_factors?: Array<{
					indicators?: Array<{
						metrics?: Array<{
							metric?: string;
							factor_threshold?: number;
							evidence_threshold?: number;
						}>;
					}>;
				}>;
			}>;
		}>;
	};

	const errors: ThresholdIntegerError[] = [];

	for (let si = 0; si < (root.systems?.length ?? 0); si++) {
		for (let fi = 0; fi < (root.systems![si].factors?.length ?? 0); fi++) {
			for (let sfi = 0; sfi < (root.systems![si].factors![fi].sub_factors?.length ?? 0); sfi++) {
				for (let ii = 0; ii < (root.systems![si].factors![fi].sub_factors![sfi].indicators?.length ?? 0); ii++) {
					const ind = root.systems![si].factors![fi].sub_factors![sfi].indicators![ii];
					for (let mi = 0; mi < (ind.metrics?.length ?? 0); mi++) {
						const m = ind.metrics![mi];
						const loc = `systems[${si}].factors[${fi}].sub_factors[${sfi}].indicators[${ii}].metrics[${mi}]`;
						if (typeof m.factor_threshold === 'number' && !Number.isInteger(m.factor_threshold)) {
							errors.push({ location: loc, metric: m.metric ?? '?', field: 'factor_threshold', value: m.factor_threshold });
						}
						if (typeof m.evidence_threshold === 'number' && !Number.isInteger(m.evidence_threshold)) {
							errors.push({ location: loc, metric: m.metric ?? '?', field: 'evidence_threshold', value: m.evidence_threshold });
						}
					}
				}
			}
		}
	}

	return errors;
}

/**
 * Checks that factor_threshold and evidence_threshold do not exceed the number
 * of metrics in their threshold group.
 *
 * Within a subfactor, metrics sharing the same (factor_threshold, evidence_threshold)
 * pair form one group (mirroring buildSubfactorList in metricMetadata.ts).
 * If factor_threshold > group size, the group can never flag.
 * If evidence_threshold > group size, the group can never reach no_flag.
 * Both conditions mean the subfactor is permanently stuck in a degraded state.
 */
function checkThresholdPlausibility(data: unknown): ThresholdPlausibilityError[] {
	const root = data as {
		systems?: Array<{
			factors?: Array<{
				sub_factors?: Array<{
					indicators?: Array<{
						metrics?: Array<{
							factor_threshold?: number;
							evidence_threshold?: number;
						}>;
					}>;
				}>;
			}>;
		}>;
	};

	const errors: ThresholdPlausibilityError[] = [];

	for (let si = 0; si < (root.systems?.length ?? 0); si++) {
		for (let fi = 0; fi < (root.systems![si].factors?.length ?? 0); fi++) {
			for (let sfi = 0; sfi < (root.systems![si].factors![fi].sub_factors?.length ?? 0); sfi++) {
				const sf = root.systems![si].factors![fi].sub_factors![sfi];
				const sfLoc = `systems[${si}].factors[${fi}].sub_factors[${sfi}]`;

				// Group metrics by (factor_threshold, evidence_threshold)
				const groups = new Map<string, { ft: number; et: number; count: number }>();
				for (const ind of sf.indicators ?? []) {
					for (const m of ind.metrics ?? []) {
						const ft = m.factor_threshold;
						const et = m.evidence_threshold;
						if (typeof ft === 'number' && typeof et === 'number') {
							const key = `ft=${ft},et=${et}`;
							const g = groups.get(key);
							if (g) g.count++;
							else groups.set(key, { ft, et, count: 1 });
						}
					}
				}

				for (const [key, { ft, et, count }] of groups) {
					if (ft > count) {
						errors.push({ location: sfLoc, kind: 'factor_threshold', value: ft, groupSize: count, groupKey: key });
					}
					if (et > count) {
						errors.push({ location: sfLoc, kind: 'evidence_threshold', value: et, groupSize: count, groupKey: key });
					}
				}
			}
		}
	}

	return errors;
}

// ── Duplicate ID check ────────────────────────────────────────────────────────

interface DuplicateIDError {
	location: string;
	kind: 'metric' | 'system' | 'factor' | 'subfactor';
	id: string;
	/** Location where this ID was first seen. */
	firstSeen: string;
}

/**
 * Checks that IDs are unique at each scope:
 *   - metric IDs globally across the full tree
 *   - system IDs globally
 *   - factor IDs within each system
 *   - subfactor IDs within each factor
 *
 * Duplicates cause silent path collisions in flagger's mutate spec dictionaries
 * (last writer wins) and corrupt metadata lookups in metricMetadata.ts.
 */
function checkDuplicateIDs(data: unknown): DuplicateIDError[] {
	const root = data as {
		systems?: Array<{
			id?: string;
			factors?: Array<{
				id?: string;
				sub_factors?: Array<{
					id?: string;
					indicators?: Array<{
						metrics?: Array<{ metric?: string }>;
					}>;
				}>;
			}>;
		}>;
	};

	const errors: DuplicateIDError[] = [];
	const seenMetrics = new Map<string, string>();
	const seenSystems = new Map<string, string>();

	for (let si = 0; si < (root.systems?.length ?? 0); si++) {
		const sys = root.systems![si];
		const sysId = sys.id ?? '';
		const sysLoc = `systems[${si}]`;

		if (sysId) {
			if (seenSystems.has(sysId)) {
				errors.push({ location: sysLoc, kind: 'system', id: sysId, firstSeen: seenSystems.get(sysId)! });
			} else {
				seenSystems.set(sysId, sysLoc);
			}
		}

		const seenFactors = new Map<string, string>();

		for (let fi = 0; fi < (sys.factors?.length ?? 0); fi++) {
			const fac = sys.factors![fi];
			const facId = fac.id ?? '';
			const facLoc = `${sysLoc}.factors[${fi}]`;

			if (facId) {
				if (seenFactors.has(facId)) {
					errors.push({ location: facLoc, kind: 'factor', id: facId, firstSeen: seenFactors.get(facId)! });
				} else {
					seenFactors.set(facId, facLoc);
				}
			}

			const seenSubfactors = new Map<string, string>();

			for (let sfi = 0; sfi < (fac.sub_factors?.length ?? 0); sfi++) {
				const sf = fac.sub_factors![sfi];
				const sfId = sf.id ?? '';
				const sfLoc = `${facLoc}.sub_factors[${sfi}]`;

				if (sfId) {
					if (seenSubfactors.has(sfId)) {
						errors.push({ location: sfLoc, kind: 'subfactor', id: sfId, firstSeen: seenSubfactors.get(sfId)! });
					} else {
						seenSubfactors.set(sfId, sfLoc);
					}
				}

				for (let ii = 0; ii < (sf.indicators?.length ?? 0); ii++) {
					const ind = sf.indicators![ii];
					for (let mi = 0; mi < (ind.metrics?.length ?? 0); mi++) {
						const m = ind.metrics![mi];
						const metId = m.metric ?? '';
						const metLoc = `${sfLoc}.indicators[${ii}].metrics[${mi}]`;

						if (metId) {
							if (seenMetrics.has(metId)) {
								errors.push({ location: metLoc, kind: 'metric', id: metId, firstSeen: seenMetrics.get(metId)! });
							} else {
								seenMetrics.set(metId, metLoc);
							}
						}
					}
				}
			}
		}
	}

	return errors;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));

	if (args.help) {
		printHelp();
		process.exitCode = 0;
		return;
	}

	const { jsonPath, factorPath, subfactorPath } = args;

	// ── Load JSON ──────────────────────────────────────────────────────────────
	if (!fs.existsSync(jsonPath)) {
		console.error(`File not found: ${jsonPath}`);
		process.exitCode = 2;
		return;
	}

	let raw: string;
	try {
		raw = fs.readFileSync(jsonPath, 'utf-8');
	} catch (err) {
		console.error('Failed to read file:', err);
		process.exitCode = 2;
		return;
	}

	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch (err) {
		console.error('Failed to parse JSON:', err);
		process.exitCode = 2;
		return;
	}

	// ── Load lookup CSVs ───────────────────────────────────────────────────────
	const factorRows = parseCsv<FactorRow>(factorPath, 'factor CSV');
	const subfactorRows = parseCsv<SubfactorRow>(subfactorPath, 'subfactor CSV');

	if (!factorRows || !subfactorRows) {
		process.exitCode = 2;
		return;
	}

	let pass1Ok = false;
	let pass2Ok = false;
	let pass3Ok = false;
	let pass4Ok = false;
	let pass5Ok = false;
	let pass6Ok = false;

	// ── Pass 1: Zod schema ─────────────────────────────────────────────────────
	console.log('Pass 1 — Zod schema...');
	const zodResult = safeValidateReferenceRoot(data);

	if (zodResult.success) {
		console.log('  ✅ Passed');
		pass1Ok = true;
	} else {
		console.error('  ❌ Failed');
		try {
			const messages = formatZodErrors(zodResult.error);
			messages.forEach((m) => console.error('  -', m));
		} catch {
			console.error('  Validation error (raw):', zodResult.error);
		}
	}

	// ── Pass 2: Lookup CSV consistency ─────────────────────────────────────────
	console.log('\nPass 2 — Lookup CSV consistency...');
	const lookupErrors = checkLookupConsistency(data, factorRows, subfactorRows);

	if (lookupErrors.length === 0) {
		console.log('  ✅ Passed');
		pass2Ok = true;
	} else {
		printLookupErrors(lookupErrors);
	}

	// ── Pass 3: Required system IDs ───────────────────────────────────────────
	console.log('\nPass 3 — Required system IDs...');
	const missingSystems = checkRequiredSystems(data);

	if (missingSystems.length === 0) {
		console.log('  ✅ Passed');
		pass3Ok = true;
	} else {
		console.error(
			`  ❌ Failed — missing required system IDs: ${missingSystems.join(', ')}\n` +
			'  These systems drive the EM and ROEM paths in the preliminary classification.\n' +
			'  Add them to reference.json or update the classification logic in flagger.ts.'
		);
	}

	// ── Pass 4: Threshold value sanity ───────────────────────────────────────────
	console.log('\nPass 4 — Threshold value sanity...');
	const thresholdErrors = checkThresholdValues(data);

	if (thresholdErrors.length === 0) {
		console.log('  ✅ Passed');
		pass4Ok = true;
	} else {
		console.error(
			`  ❌ Failed — ${thresholdErrors.length} metric(s) have zero or negative threshold values.\n` +
			'  factor_threshold=0 always flags; evidence_threshold=0 always concludes no_flag.\n'
		);
		for (const e of thresholdErrors) {
			console.error(`  ${e.location}: metric "${e.metric}" has ${e.field}=${e.value}`);
		}
	}

	// ── Pass 5: Duplicate IDs ─────────────────────────────────────────────────
	console.log('\nPass 5 — Duplicate IDs...');
	const duplicateErrors = checkDuplicateIDs(data);

	if (duplicateErrors.length === 0) {
		console.log('  ✅ Passed');
		pass5Ok = true;
	} else {
		console.error(`  ❌ Failed — ${duplicateErrors.length} duplicate ID(s) found.\n`);
		for (const e of duplicateErrors) {
			console.error(
				`  ${e.location}: duplicate ${e.kind} id "${e.id}" (first seen at ${e.firstSeen})`
			);
		}
	}

	// ── Pass 6: Threshold integers and plausibility ───────────────────────────
	console.log('\nPass 6 — Threshold integers and plausibility...');
	const integerErrors = checkThresholdIntegers(data);
	const plausibilityErrors = checkThresholdPlausibility(data);

	if (integerErrors.length === 0 && plausibilityErrors.length === 0) {
		console.log('  ✅ Passed');
		pass6Ok = true;
	} else {
		if (integerErrors.length > 0) {
			console.error(`  ❌ Non-integer threshold values (${integerErrors.length}):`);
			for (const e of integerErrors) {
				console.error(`  ${e.location}: metric "${e.metric}" has ${e.field}=${e.value}`);
			}
		}
		if (plausibilityErrors.length > 0) {
			console.error(`  ❌ Threshold exceeds group size (${plausibilityErrors.length}):`);
			for (const e of plausibilityErrors) {
				console.error(
					`  ${e.location}: ${e.kind}=${e.value} > group size ${e.groupSize} [${e.groupKey}]`
				);
			}
		}
	}

	// ── Result ─────────────────────────────────────────────────────────────────
	console.log('');
	if (pass1Ok && pass2Ok && pass3Ok && pass4Ok && pass5Ok && pass6Ok) {
		console.log('Validation passed ✅');
		process.exitCode = 0;
	} else {
		console.error('Validation failed ❌');
		process.exitCode = 1;
	}
}

main().catch((err) => {
	console.error('Unexpected error:', err);
	process.exitCode = 2;
});
