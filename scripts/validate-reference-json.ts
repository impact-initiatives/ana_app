#!/usr/bin/env bun
/**
 * scripts/validate-reference-json.ts
 *
 * Validates the generated `static/data/reference.json`.
 *
 * All check functions (passes 1–8) are imported from the shared browser-safe
 * module src/lib/engine/referenceValidator.ts — the same code that runs in
 * the browser when an analyst uploads a custom reference CSV.
 *
 * The CLI runs each pass individually for rich formatted output (tables,
 * grouped errors). The browser path calls validateMergedJson() which
 * orchestrates all passes and returns flat error/warning strings.
 *
 * Usage:
 *   bun ./scripts/validate-reference-json.ts
 *   bun ./scripts/validate-reference-json.ts --json static/data/reference.json
 *   bun ./scripts/validate-reference-json.ts --help
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more validation errors
 *   2 — I/O or parse error (file not found, invalid JSON)
 */

import fs from 'fs';
import path from 'path';
import { safeValidateReferenceRoot } from '$lib/types/reference-json';
import {
	checkLookupConsistency,
	checkRequiredSystems,
	checkThresholdValues,
	checkDuplicateIDs,
	checkThresholdIntegers,
	checkThresholdPlausibility,
	checkVanOrdering,
	checkVanPresence,
	type LookupError,
	type ThresholdValueError,
	type ThresholdValueWarning,
	type DuplicateIDGroup,
	type DuplicateLabelGroup,
	type ThresholdIntegerError,
	type ThresholdPlausibilityError,
	type VanOrderError,
	type VanPresenceError
} from '$lib/engine/referenceValidator';

// ── Defaults ──────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'static', 'data');
const DEFAULTS = { json: path.join(DATA_DIR, 'reference.json') };

// ── CLI ───────────────────────────────────────────────────────────────────────

interface Args {
	jsonPath: string;
	help: boolean;
}

function parseArgs(argv: string[]): Args {
	let jsonPath = DEFAULTS.json;
	let help = false;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--help' || arg === '-h') {
			help = true;
		} else if (arg === '--json' && argv[i + 1]) {
			jsonPath = path.resolve(argv[++i]);
		}
	}
	return { jsonPath, help };
}

function printHelp(): void {
	console.log(`
validate-reference-json.ts — Validate reference.json

Usage:
  bun ./scripts/validate-indicators.ts [flags]

Flags:
  --json  <path>   indicators JSON to validate (default: static/data/reference.json)
  --help, -h       Print this help and exit

Checks performed:

  Pass 1 — Zod schema
    · metric IDs match MET followed by 3+ digits (e.g. MET001)
    · type matches the type-syntax regex, or is null
    · threshold bounds match the declared type (num/int, lb, ub)
    · van cannot be set without an
    · above_or_below is "Above" or "Below"
    · preference is 1, 2, or 3

  Pass 2 — Factor/subfactor ID validity
    · every factor ID must be a known FactorIDEnum value
    · every subfactor ID must be a known SubFactorIDEnum value
    (both enums are generated from the canonical lookup CSVs at build time)

  Pass 3 — Required system IDs
    · mortality and health_outcomes must be present

  Pass 4 — Threshold value sanity
    · factor_threshold / evidence_threshold must be ≥ 1 (error if ≤ 0; warning if missing)

  Pass 5 — Duplicate and invalid IDs
    · metric/system/factor/subfactor IDs must be globally unique (error)
    · metric IDs must match MET followed by 3+ digits — e.g. NEW, MOVED (error)
    · metric labels must be globally unique (error)

  Pass 6 — Threshold integers and plausibility
    · factor_threshold and evidence_threshold must be integers
    · neither may exceed the group size in its subfactor

  Pass 7 — VAN threshold ordering
    · Above metrics: van > an
    · Below metrics: van < an

  Pass 8 — VAN threshold presence
    · every non-supporting-evidence, non-preference-3 metric must have thresholds.van
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

// ── Label map (for human-readable error output) ───────────────────────────────

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
			id?: string; label?: string;
			factors?: Array<{
				id?: string; label?: string;
				sub_factors?: Array<{
					id?: string; label?: string;
					indicators?: Array<{
						id?: string; label?: string;
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

function resolveLocation(map: Map<string, Crumb>, location: string): Crumb {
	const parts = location.split('.');
	for (let i = parts.length; i >= 1; i--) {
		const crumb = map.get(parts.slice(0, i).join('.'));
		if (crumb) return crumb;
	}
	return EMPTY_CRUMB;
}

// ── Zod issue helpers ─────────────────────────────────────────────────────────

type ZodIssue = { path: PropertyKey[]; message: string; code: string };

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

	const metricHeaders = ['System', 'Factor', 'Subfactor', 'Indicator', 'Metric', 'Value'];
	const metricRow = (iss: ZodIssue): string[] => {
		const loc = zodPathToLocation(iss.path);
		const crumb = labelMap.get(loc) ?? resolveLocation(labelMap, loc);
		return [
			trunc(crumb.system), trunc(crumb.factor), trunc(crumb.subfactor),
			trunc(crumb.indicator), crumb.metric,
			String(getValue(data, iss.path) ?? '(missing)')
		];
	};

	if (sysIdErrors.length > 0) {
		console.error(`\n  Invalid system IDs (${sysIdErrors.length}):`);
		printTable(['System (value)'], sysIdErrors.map((iss) => [String(getValue(data, iss.path) ?? '(missing)')]));
	}
	if (facIdErrors.length > 0) {
		console.error(`\n  Invalid factor IDs (${facIdErrors.length}):`);
		printTable(['System', 'Factor (value)'], facIdErrors.map((iss) => {
			const crumb = labelMap.get(zodPathToLocation(iss.path)) ?? EMPTY_CRUMB;
			return [trunc(crumb.system), String(getValue(data, iss.path) ?? '(missing)')];
		}));
	}
	if (sfIdErrors.length > 0) {
		console.error(`\n  Invalid subfactor IDs (${sfIdErrors.length}):`);
		printTable(['System', 'Factor', 'Subfactor (value)'], sfIdErrors.map((iss) => {
			const crumb = labelMap.get(zodPathToLocation(iss.path)) ?? EMPTY_CRUMB;
			return [trunc(crumb.system), trunc(crumb.factor), String(getValue(data, iss.path) ?? '(missing)')];
		}));
	}
	if (aboveOrBelowErrors.length > 0) {
		console.error(`\n  above_or_below — must be "Above" or "Below" (${aboveOrBelowErrors.length}):`);
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
				return [
					trunc(crumb.system), trunc(crumb.factor), trunc(crumb.subfactor),
					trunc(crumb.indicator), crumb.metric,
					iss.path.slice(-2).map(String).join('.'),
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

// ── Pass output helpers ───────────────────────────────────────────────────────

function printLookupErrors(errors: LookupError[], labelMap: Map<string, Crumb>): void {
	const byKind = { factor: errors.filter((e) => e.kind === 'factor'), subfactor: errors.filter((e) => e.kind === 'subfactor') };
	console.error('\n❌ Pass 2 failed — unknown factor/subfactor IDs (not in the generated enums).\n');
	if (byKind.factor.length > 0) {
		console.error(`── Unknown factors (${byKind.factor.length}):`);
		printTable(['System', 'Factor (value)'], byKind.factor.map((e) => {
			const crumb = resolveLocation(labelMap, e.location);
			return [trunc(crumb.system), e.id];
		}));
	}
	if (byKind.subfactor.length > 0) {
		console.error(`── Unknown subfactors (${byKind.subfactor.length}):`);
		printTable(['System', 'Factor', 'Subfactor (value)'], byKind.subfactor.map((e) => {
			const crumb = resolveLocation(labelMap, e.location);
			return [trunc(crumb.system), trunc(crumb.factor), e.id];
		}));
	}
}

function printThresholdValueErrors(errors: ThresholdValueError[], warnings: ThresholdValueWarning[], labelMap: Map<string, Crumb>): void {
	if (errors.length > 0) {
		console.error(`  ❌ ${errors.length} metric(s) have threshold ≤ 0 (always-flags or always-no_flag):`);
		printTable(['System', 'Factor', 'Subfactor', 'Metric', 'Field', 'Value'],
			errors.map((e) => {
				const crumb = resolveLocation(labelMap, e.location);
				return [trunc(crumb.system), trunc(crumb.factor), trunc(crumb.subfactor), e.metric, e.field, String(e.value)];
			})
		);
	}
	if (warnings.length > 0) {
		console.warn(`  ⚠️  ${warnings.length} metric(s) have no threshold set:`);
		printTable(['System', 'Factor', 'Subfactor', 'Metric', 'Field'],
			warnings.map((w) => {
				const crumb = resolveLocation(labelMap, w.location);
				return [trunc(crumb.system), trunc(crumb.factor), trunc(crumb.subfactor), w.metric, w.field];
			})
		);
	}
}

function printDuplicateErrors(errors: DuplicateIDGroup[], warnings: DuplicateLabelGroup[], labelMap: Map<string, Crumb>): void {
	if (errors.length > 0) {
		console.error(`  ❌ ${errors.length} duplicate ID group(s):`);
		const byKind = new Map<string, DuplicateIDGroup[]>();
		for (const e of errors) {
			const list = byKind.get(e.kind) ?? [];
			list.push(e);
			byKind.set(e.kind, list);
		}
		for (const [kind, groups] of byKind) {
			const rows: string[][] = [];
			if (kind === 'invalid_format') {
				console.error(`  Invalid metric ID format (${groups.length}):`);
				for (const g of groups) {
					const crumb = resolveLocation(labelMap, g.locations[0]);
					rows.push([g.id, trunc(crumb.system), trunc(crumb.factor), trunc(crumb.subfactor)]);
				}
				printTable(['Metric ID', 'System', 'Factor', 'Subfactor'], rows);
			} else if (kind === 'metric') {
				console.error(`  Duplicate metric IDs (${groups.length} group(s)):`);
				for (const g of groups) {
					for (const loc of g.locations) {
						const crumb = resolveLocation(labelMap, loc);
						rows.push([g.id, trunc(crumb.system), trunc(crumb.factor), trunc(crumb.subfactor)]);
					}
				}
				printTable(['Metric', 'System', 'Factor', 'Subfactor'], rows);
			} else {
				console.error(`  Duplicate ${kind} IDs (${groups.length} group(s)):`);
				for (const g of groups) {
					for (const loc of g.locations) rows.push([g.id, loc]);
				}
				printTable([kind.charAt(0).toUpperCase() + kind.slice(1), 'Location'], rows);
			}
		}
	}
	if (warnings.length > 0) {
		console.error(`  ❌ ${warnings.length} duplicate metric label group(s):`);
		const rows: string[][] = [];
		for (const w of warnings) {
			for (const occ of w.occurrences) {
				const crumb = resolveLocation(labelMap, occ.location);
				rows.push([trunc(w.label, 40), occ.metricId, trunc(crumb.system), trunc(crumb.factor), trunc(crumb.subfactor)]);
			}
		}
		printTable(['Label', 'Metric', 'System', 'Factor', 'Subfactor'], rows);
	}
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));

	if (args.help) {
		printHelp();
		process.exitCode = 0;
		return;
	}

	const { jsonPath } = args;

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

	let pass1Ok = false;
	let pass2Ok = false;
	let pass3Ok = false;
	let pass4Ok = false;
	let pass5Ok = false;
	let pass6Ok = false;
	let pass7Ok = false;
	let pass8Ok = false;

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

	// ── Pass 2: Factor/subfactor ID validity ───────────────────────────────────
	console.log('\nPass 2 — Factor/subfactor ID validity...');
	const lookupErrors = checkLookupConsistency(data);
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
			`  ❌ Failed — missing required system IDs: ${missingSystems.map((e) => e.missingId).join(', ')}\n` +
			'  These systems drive the EM and ROEM paths in the preliminary classification.'
		);
	}

	// ── Pass 4: Threshold value sanity ────────────────────────────────────────
	console.log('\nPass 4 — Threshold value sanity...');
	const { errors: tvErrors, warnings: tvWarnings } = checkThresholdValues(data);
	if (tvErrors.length === 0 && tvWarnings.length === 0) {
		console.log('  ✅ Passed');
		pass4Ok = true;
	} else if (tvErrors.length === 0) {
		console.log('  ✅ Passed (with warnings)');
		pass4Ok = true;
		printThresholdValueErrors([], tvWarnings, labelMap);
	} else {
		console.error(`  ❌ Failed`);
		printThresholdValueErrors(tvErrors, tvWarnings, labelMap);
	}

	// ── Pass 5: Duplicate IDs ─────────────────────────────────────────────────
	console.log('\nPass 5 — Duplicate IDs...');
	const { errors: dupErrors, warnings: dupWarnings } = checkDuplicateIDs(data);
	if (dupErrors.length === 0 && dupWarnings.length === 0) {
		console.log('  ✅ Passed');
		pass5Ok = true;
	} else {
		console.error(`  ❌ Failed`);
		printDuplicateErrors(dupErrors, dupWarnings, labelMap);
	}

	// ── Pass 6: Threshold integers and plausibility ───────────────────────────
	console.log('\nPass 6 — Threshold integers and plausibility...');
	const intErrors = checkThresholdIntegers(data);
	const plausErrors = checkThresholdPlausibility(data);
	if (intErrors.length === 0 && plausErrors.length === 0) {
		console.log('  ✅ Passed');
		pass6Ok = true;
	} else {
		if (intErrors.length > 0) {
			console.error(`  ❌ Non-integer threshold values (${intErrors.length}):`);
			printTable(
				['System', 'Factor', 'Subfactor', 'Metric', 'Field', 'Value'],
				intErrors.map((e: ThresholdIntegerError) => {
					const crumb = resolveLocation(labelMap, e.location);
					return [trunc(crumb.system), trunc(crumb.factor), trunc(crumb.subfactor), e.metric, e.field, String(e.value)];
				})
			);
		}
		if (plausErrors.length > 0) {
			console.error(`  ❌ Threshold exceeds group size (${plausErrors.length}):`);
			printTable(
				['System', 'Factor', 'Subfactor', 'Field', 'Value', 'Group size'],
				plausErrors.map((e: ThresholdPlausibilityError) => {
					const crumb = resolveLocation(labelMap, e.location);
					return [trunc(crumb.system), trunc(crumb.factor), trunc(crumb.subfactor), e.kind, String(e.value), String(e.groupSize)];
				})
			);
		}
	}

	// ── Pass 7: VAN ordering ──────────────────────────────────────────────────
	console.log('\nPass 7 — VAN threshold ordering...');
	const vanErrors = checkVanOrdering(data);
	if (vanErrors.length === 0) {
		console.log('  ✅ Passed');
		pass7Ok = true;
	} else {
		console.error(`  ❌ Failed — ${vanErrors.length} metric(s) have van ≤ an (severity scale inverted).`);
		printTable(
			['System', 'Factor', 'Subfactor', 'Metric', 'Dir', 'AN', 'VAN'],
			vanErrors.map((e: VanOrderError) => {
				const crumb = resolveLocation(labelMap, e.location);
				return [trunc(crumb.system), trunc(crumb.factor), trunc(crumb.subfactor), e.metric, e.above_or_below, String(e.an), String(e.van)];
			})
		);
	}

	// ── Pass 8: VAN presence ──────────────────────────────────────────────────
	console.log('\nPass 8 — VAN threshold presence...');
	const vanPresErrors = checkVanPresence(data);
	if (vanPresErrors.length === 0) {
		console.log('  ✅ Passed');
		pass8Ok = true;
	} else {
		console.error(
			`  ❌ Failed — ${vanPresErrors.length} non-supporting-evidence metric(s) are missing thresholds.van.\n` +
			'  These metrics feed the ho_secondary and an_primary priority flag branches.'
		);
		printTable(
			['System', 'Factor', 'Subfactor', 'Metric', 'Evidence type', 'AN'],
			vanPresErrors.map((e: VanPresenceError) => {
				const crumb = resolveLocation(labelMap, e.location);
				return [trunc(crumb.system), trunc(crumb.factor), trunc(crumb.subfactor), e.metric, e.evidence_type, e.an != null ? String(e.an) : '—'];
			})
		);
	}

	// ── Result ─────────────────────────────────────────────────────────────────
	console.log('');
	if (pass1Ok && pass2Ok && pass3Ok && pass4Ok && pass5Ok && pass6Ok && pass7Ok && pass8Ok) {
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
