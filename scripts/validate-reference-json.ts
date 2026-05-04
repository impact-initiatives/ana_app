#!/usr/bin/env bun
/**
 * scripts/validate-indicators-json.ts
 *
 * Validates the generated `static/data/reference.json` in two passes:
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
 *   bun ./scripts/validate-indicators.ts --json static/data/reference.json
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
import { safeValidateReferenceRoot } from '$lib/types/reference-json';
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

  Pass 7 — VAN threshold ordering
    · when both an and van are set: van must be strictly more extreme than an
        Above metrics: van > an
        Below metrics: van < an
      Equal or inverted values mean VAN is easier to reach than AN, inverting
      the intended severity scale.
`);
}

// ── Output helpers ────────────────────────────────────────────────────────────

const TRUNC_WIDTH = 22;

function trunc(s: string, n = TRUNC_WIDTH): string {
	if (!s) return '';
	return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function printTable(headers: string[], rows: string[][]): void {
	if (rows.length === 0) return;
	const widths = headers.map((h, i) =>
		Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length))
	);
	const pad = (s: string, w: number) => s.padEnd(w);
	const sep = widths.map((w) => '─'.repeat(w)).join('  ');
	console.error('  ' + headers.map((h, i) => pad(h, widths[i])).join('  '));
	console.error('  ' + sep);
	for (const row of rows) {
		console.error('  ' + row.map((c, i) => pad(c ?? '', widths[i])).join('  '));
	}
}

// ── Label map ─────────────────────────────────────────────────────────────────

interface Crumb {
	system: string;
	factor: string;
	subfactor: string;
	indicator: string;
	metric: string;
}

const EMPTY_CRUMB: Crumb = { system: '', factor: '', subfactor: '', indicator: '', metric: '' };

function buildLabelMap(data: unknown): Map<string, Crumb> {
	const map = new Map<string, Crumb>();
	const root = data as {
		systems?: Array<{
			id?: string;
			label?: string;
			factors?: Array<{
				id?: string;
				label?: string;
				sub_factors?: Array<{
					id?: string;
					label?: string;
					indicators?: Array<{
						id?: string;
						label?: string;
						metrics?: Array<{ metric?: string; label?: string }>;
					}>;
				}>;
			}>;
		}>;
	};

	for (let si = 0; si < (root.systems?.length ?? 0); si++) {
		const sys = root.systems![si];
		const sysLabel = sys.label ?? sys.id ?? '';
		const sysLoc = `systems[${si}]`;
		const sysCrumb: Crumb = { ...EMPTY_CRUMB, system: sysLabel };
		map.set(sysLoc, sysCrumb);

		for (let fi = 0; fi < (sys.factors?.length ?? 0); fi++) {
			const fac = sys.factors![fi];
			const facLabel = fac.label ?? fac.id ?? '';
			const facLoc = `${sysLoc}.factors[${fi}]`;
			const facCrumb: Crumb = { ...sysCrumb, factor: facLabel };
			map.set(facLoc, facCrumb);

			for (let sfi = 0; sfi < (fac.sub_factors?.length ?? 0); sfi++) {
				const sf = fac.sub_factors![sfi];
				const sfLabel = sf.label ?? sf.id ?? '';
				const sfLoc = `${facLoc}.sub_factors[${sfi}]`;
				const sfCrumb: Crumb = { ...facCrumb, subfactor: sfLabel };
				map.set(sfLoc, sfCrumb);

				for (let ii = 0; ii < (sf.indicators?.length ?? 0); ii++) {
					const ind = sf.indicators![ii];
					const indLabel = ind.label ?? ind.id ?? '';
					const indLoc = `${sfLoc}.indicators[${ii}]`;
					const indCrumb: Crumb = { ...sfCrumb, indicator: indLabel };
					map.set(indLoc, indCrumb);

					for (let mi = 0; mi < (ind.metrics?.length ?? 0); mi++) {
						const m = ind.metrics![mi];
						const metLoc = `${indLoc}.metrics[${mi}]`;
						map.set(metLoc, { ...indCrumb, metric: m.metric ?? '' });
					}
				}
			}
		}
	}

	return map;
}

/** Look up the most specific crumb available for a location string. */
function resolveLocation(map: Map<string, Crumb>, location: string): Crumb {
	const parts = location.split('.');
	for (let i = parts.length; i >= 1; i--) {
		const crumb = map.get(parts.slice(0, i).join('.'));
		if (crumb) return crumb;
	}
	return EMPTY_CRUMB;
}

// ── Zod issue helpers ─────────────────────────────────────────────────────────

/**
 * Converts a Zod path array to a label-map location key.
 * ['systems', 0, 'factors', 0, 'sub_factors', 0, 'indicators', 0, 'metrics', 0, 'field']
 * → 'systems[0].factors[0].sub_factors[0].indicators[0].metrics[0]'
 */
function zodPathToLocation(path: PropertyKey[]): string {
	const parts: string[] = [];
	for (let i = 0; i < path.length; i++) {
		const seg = path[i];
		if (typeof seg === 'string') {
			const next = path[i + 1];
			if (typeof next === 'number') {
				parts.push(`${seg}[${next}]`);
				i++;
			}
		}
	}
	return parts.join('.');
}

function getValue(data: unknown, path: PropertyKey[]): unknown {
	let cur = data;
	for (const seg of path) {
		if (cur == null || typeof cur !== 'object') return undefined;
		cur = (cur as Record<PropertyKey, unknown>)[seg];
	}
	return cur;
}

type ZodIssue = { path: PropertyKey[]; message: string; code: string };

function printZodIssues(
	error: { issues: ZodIssue[] },
	data: unknown,
	labelMap: Map<string, Crumb>
): void {
	const sysIdErrors: ZodIssue[] = [];
	const facIdErrors: ZodIssue[] = [];
	const sfIdErrors: ZodIssue[] = [];
	const aboveOrBelowErrors: ZodIssue[] = [];
	const preferenceErrors: ZodIssue[] = [];
	const typeErrors: ZodIssue[] = [];
	const thresholdErrors: ZodIssue[] = [];
	const otherErrors: ZodIssue[] = [];

	for (const issue of error.issues) {
		const p = issue.path;
		const terminal = p[p.length - 1];
		if (terminal === 'id') {
			if (p.length === 3) sysIdErrors.push(issue);
			else if (p.length === 5) facIdErrors.push(issue);
			else if (p.length === 7) sfIdErrors.push(issue);
			else otherErrors.push(issue);
		} else if (terminal === 'above_or_below') {
			aboveOrBelowErrors.push(issue);
		} else if (terminal === 'preference') {
			preferenceErrors.push(issue);
		} else if (terminal === 'type') {
			typeErrors.push(issue);
		} else if (terminal === 'an' || terminal === 'van') {
			thresholdErrors.push(issue);
		} else {
			otherErrors.push(issue);
		}
	}

	if (sysIdErrors.length > 0) {
		console.error(`\n  Invalid system IDs (${sysIdErrors.length}) — see static/data/system.csv:`);
		printTable(
			['System (value)'],
			sysIdErrors.map((iss) => [String(getValue(data, iss.path) ?? '(missing)')])
		);
	}

	if (facIdErrors.length > 0) {
		console.error(`\n  Invalid factor IDs (${facIdErrors.length}) — see static/data/factor.csv:`);
		printTable(
			['System', 'Factor (value)'],
			facIdErrors.map((iss) => {
				const crumb = labelMap.get(zodPathToLocation(iss.path)) ?? EMPTY_CRUMB;
				return [trunc(crumb.system), String(getValue(data, iss.path) ?? '(missing)')];
			})
		);
	}

	if (sfIdErrors.length > 0) {
		console.error(
			`\n  Invalid subfactor IDs (${sfIdErrors.length}) — see static/data/subfactor.csv:`
		);
		printTable(
			['System', 'Factor', 'Subfactor (value)'],
			sfIdErrors.map((iss) => {
				const crumb = labelMap.get(zodPathToLocation(iss.path)) ?? EMPTY_CRUMB;
				return [
					trunc(crumb.system),
					trunc(crumb.factor),
					String(getValue(data, iss.path) ?? '(missing)')
				];
			})
		);
	}

	const metricHeaders = ['System', 'Factor', 'Subfactor', 'Indicator', 'Metric', 'Value'];
	const metricRow = (iss: ZodIssue): string[] => {
		const loc = zodPathToLocation(iss.path);
		const crumb = labelMap.get(loc) ?? resolveLocation(labelMap, loc);
		return [
			trunc(crumb.system),
			trunc(crumb.factor),
			trunc(crumb.subfactor),
			trunc(crumb.indicator),
			crumb.metric,
			String(getValue(data, iss.path) ?? '(missing)')
		];
	};

	if (aboveOrBelowErrors.length > 0) {
		console.error(
			`\n  above_or_below — must be "Above" or "Below" (${aboveOrBelowErrors.length}):`
		);
		printTable(metricHeaders, aboveOrBelowErrors.map(metricRow));
	}

	if (preferenceErrors.length > 0) {
		console.error(`\n  preference — must be 1, 2, or 3 (${preferenceErrors.length}):`);
		printTable(metricHeaders, preferenceErrors.map(metricRow));
	}

	if (typeErrors.length > 0) {
		console.error(`\n  type — invalid syntax (${typeErrors.length}):`);
		printTable(metricHeaders, typeErrors.map(metricRow));
	}

	if (thresholdErrors.length > 0) {
		console.error(`\n  threshold errors (${thresholdErrors.length}):`);
		printTable(
			['System', 'Factor', 'Subfactor', 'Indicator', 'Metric', 'Field', 'Value'],
			thresholdErrors.map((iss) => {
				const loc = zodPathToLocation(iss.path);
				const crumb = labelMap.get(loc) ?? resolveLocation(labelMap, loc);
				const field = iss.path.slice(-2).map(String).join('.');
				return [
					trunc(crumb.system),
					trunc(crumb.factor),
					trunc(crumb.subfactor),
					trunc(crumb.indicator),
					crumb.metric,
					field,
					String(getValue(data, iss.path) ?? '(missing)')
				];
			})
		);
	}

	if (otherErrors.length > 0) {
		console.error(`\n  Other schema errors (${otherErrors.length}):`);
		for (const iss of otherErrors) {
			console.error(`    ${iss.path.map(String).join('.')}: ${iss.message}`);
		}
	}
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
	const content = raw.startsWith('﻿') ? raw.slice(1) : raw; // strip BOM

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

function printLookupErrors(errors: LookupError[], labelMap: Map<string, Crumb>): void {
	const byFactors = errors.filter((e) => e.kind === 'factor');
	const bySubfactors = errors.filter((e) => e.kind === 'subfactor');

	console.error('\n❌ Pass 2 failed — the JSON contains ids not present in the lookup CSVs.');
	console.error('   Regenerate reference.json or update the lookup CSVs so the ids match.\n');

	if (byFactors.length > 0) {
		console.error(
			`── Unknown factors (${byFactors.length}) — see static/data/factor.csv:`
		);
		printTable(
			['System', 'Factor (value)'],
			byFactors.map((e) => {
				const crumb = resolveLocation(labelMap, e.location);
				return [trunc(crumb.system), e.id];
			})
		);
		console.error('');
	}

	if (bySubfactors.length > 0) {
		console.error(
			`── Unknown subfactors (${bySubfactors.length}) — see static/data/subfactor.csv:`
		);
		printTable(
			['System', 'Factor', 'Subfactor (value)'],
			bySubfactors.map((e) => {
				const crumb = resolveLocation(labelMap, e.location);
				return [trunc(crumb.system), trunc(crumb.factor), e.id];
			})
		);
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
							preference?: number;
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
						if (m.preference === 3) continue; // excluded from the flagging pipeline
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
							preference?: number;
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
						if (m.preference === 3) continue; // excluded from the flagging pipeline
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
							preference?: number;
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
						if (m.preference === 3) continue; // excluded from the flagging pipeline
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

// ── VAN threshold ordering check ─────────────────────────────────────────────

interface VanOrderError {
	location: string;
	metric: string;
	above_or_below: string;
	an: number;
	van: number;
}

/**
 * Checks that the VAN threshold is strictly more extreme than AN.
 *
 * "More extreme" means harder to reach the VAN level:
 *   - Above: van > an  (a higher value is needed to cross VAN than AN)
 *   - Below: van < an  (a lower value is needed to cross VAN than AN)
 *
 * If this ordering is violated, VAN is trivially easier to reach than AN,
 * which inverts the intended severity scale. Equal values (van === an) are
 * also flagged — a redundant threshold adds no information.
 */
function checkVanOrdering(data: unknown): VanOrderError[] {
	const root = data as {
		systems?: Array<{
			factors?: Array<{
				sub_factors?: Array<{
					indicators?: Array<{
						metrics?: Array<{
							metric?: string;
							above_or_below?: string;
							thresholds?: { an?: number | null; van?: number | null };
						}>;
					}>;
				}>;
			}>;
		}>;
	};

	const errors: VanOrderError[] = [];

	for (let si = 0; si < (root.systems?.length ?? 0); si++) {
		for (let fi = 0; fi < (root.systems![si].factors?.length ?? 0); fi++) {
			for (let sfi = 0; sfi < (root.systems![si].factors![fi].sub_factors?.length ?? 0); sfi++) {
				for (let ii = 0; ii < (root.systems![si].factors![fi].sub_factors![sfi].indicators?.length ?? 0); ii++) {
					const ind = root.systems![si].factors![fi].sub_factors![sfi].indicators![ii];
					for (let mi = 0; mi < (ind.metrics?.length ?? 0); mi++) {
						const m = ind.metrics![mi];
						const an = m.thresholds?.an;
						const van = m.thresholds?.van;
						const dir = m.above_or_below;

						if (typeof an === 'number' && typeof van === 'number' && dir) {
							const valid = dir === 'Above' ? van > an : van < an;
							if (!valid) {
								const loc = `systems[${si}].factors[${fi}].sub_factors[${sfi}].indicators[${ii}].metrics[${mi}]`;
								errors.push({ location: loc, metric: m.metric ?? '?', above_or_below: dir, an, van });
							}
						}
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

	const labelMap = buildLabelMap(data);

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
	let pass7Ok = false;

	// ── Pass 1: Zod schema ─────────────────────────────────────────────────────
	console.log('Pass 1 — Zod schema...');
	const zodResult = safeValidateReferenceRoot(data);

	if (zodResult.success) {
		console.log('  ✅ Passed');
		pass1Ok = true;
	} else {
		console.error('  ❌ Failed');
		printZodIssues(zodResult.error, data, labelMap);
	}

	// ── Pass 2: Lookup CSV consistency ─────────────────────────────────────────
	console.log('\nPass 2 — Lookup CSV consistency...');
	const lookupErrors = checkLookupConsistency(data, factorRows, subfactorRows);

	if (lookupErrors.length === 0) {
		console.log('  ✅ Passed');
		pass2Ok = true;
	} else {
		printLookupErrors(lookupErrors, labelMap);
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

	// ── Pass 4: Threshold value sanity ────────────────────────────────────────
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

		const byField = new Map<string, ThresholdValueError[]>();
		for (const e of thresholdErrors) {
			const list = byField.get(e.field) ?? [];
			list.push(e);
			byField.set(e.field, list);
		}

		for (const [field, errs] of byField) {
			console.error(`  ${field} ≤ 0 (${errs.length}):`);
			printTable(
				['System', 'Factor', 'Subfactor', 'Indicator', 'Metric', 'Value'],
				errs.map((e) => {
					const crumb = resolveLocation(labelMap, e.location);
					return [
						trunc(crumb.system),
						trunc(crumb.factor),
						trunc(crumb.subfactor),
						trunc(crumb.indicator),
						e.metric,
						String(e.value)
					];
				})
			);
			console.error('');
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

		const byKind = new Map<string, DuplicateIDError[]>();
		for (const e of duplicateErrors) {
			const list = byKind.get(e.kind) ?? [];
			list.push(e);
			byKind.set(e.kind, list);
		}

		for (const [kind, errs] of byKind) {
			console.error(`  Duplicate ${kind} IDs (${errs.length}):`);
			if (kind === 'metric') {
				printTable(
					['Metric', 'System', 'Factor', 'Subfactor', 'First seen'],
					errs.map((e) => {
						const crumb = resolveLocation(labelMap, e.location);
						return [e.id, trunc(crumb.system), trunc(crumb.factor), trunc(crumb.subfactor), e.firstSeen];
					})
				);
			} else if (kind === 'subfactor') {
				printTable(
					['Subfactor', 'System', 'Factor', 'First seen'],
					errs.map((e) => {
						const crumb = resolveLocation(labelMap, e.location);
						return [e.id, trunc(crumb.system), trunc(crumb.factor), e.firstSeen];
					})
				);
			} else if (kind === 'factor') {
				printTable(
					['Factor', 'System', 'First seen'],
					errs.map((e) => {
						const crumb = resolveLocation(labelMap, e.location);
						return [e.id, trunc(crumb.system), e.firstSeen];
					})
				);
			} else {
				printTable(
					['System', 'First seen'],
					errs.map((e) => [e.id, e.firstSeen])
				);
			}
			console.error('');
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
			printTable(
				['System', 'Factor', 'Subfactor', 'Indicator', 'Metric', 'Field', 'Value'],
				integerErrors.map((e) => {
					const crumb = resolveLocation(labelMap, e.location);
					return [
						trunc(crumb.system),
						trunc(crumb.factor),
						trunc(crumb.subfactor),
						trunc(crumb.indicator),
						e.metric,
						e.field,
						String(e.value)
					];
				})
			);
			console.error('');
		}
		if (plausibilityErrors.length > 0) {
			console.error(
				`  ❌ Threshold exceeds group size — group can never reach the state (${plausibilityErrors.length}):`
			);
			printTable(
				['System', 'Factor', 'Subfactor', 'Field', 'Value', 'Group size'],
				plausibilityErrors.map((e) => {
					const crumb = resolveLocation(labelMap, e.location);
					return [
						trunc(crumb.system),
						trunc(crumb.factor),
						trunc(crumb.subfactor),
						e.kind,
						String(e.value),
						String(e.groupSize)
					];
				})
			);
			console.error('');
		}
	}

	// ── Pass 7: VAN threshold ordering ────────────────────────────────────────
	console.log('\nPass 7 — VAN threshold ordering...');
	const vanErrors = checkVanOrdering(data);

	if (vanErrors.length === 0) {
		console.log('  ✅ Passed');
		pass7Ok = true;
	} else {
		console.error(
			`  ❌ Failed — ${vanErrors.length} metric(s) have van ≤ an (severity scale inverted).\n`
		);
		printTable(
			['System', 'Factor', 'Subfactor', 'Indicator', 'Metric', 'Dir', 'AN', 'VAN'],
			vanErrors.map((e) => {
				const crumb = resolveLocation(labelMap, e.location);
				return [
					trunc(crumb.system),
					trunc(crumb.factor),
					trunc(crumb.subfactor),
					trunc(crumb.indicator),
					e.metric,
					e.above_or_below,
					String(e.an),
					String(e.van)
				];
			})
		);
	}

	// ── Result ─────────────────────────────────────────────────────────────────
	console.log('');
	if (pass1Ok && pass2Ok && pass3Ok && pass4Ok && pass5Ok && pass6Ok && pass7Ok) {
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
