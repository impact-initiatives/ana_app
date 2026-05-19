#!/usr/bin/env bun
/**
 * scripts/generate-input-data.ts
 *
 * Generates synthetic input CSVs for testing the ANA app.
 *
 * Default (no --out): writes five standard fixtures to static/data/:
 *   input_template.csv             – header-only template for users
 *   input_bad.csv                  – 3-row file with deliberate validation errors
 *   input_good_50.csv              – 50 plain UOAs covering all 8 priority flag outcomes
 *   input_good_50_pcode.csv        – 50 South Sudan ADM2 p-code UOAs (same scenarios)
 *   input_good_50_pcode_mixed.csv  – 10 SS ADM1 + 40 SS ADM2 (same scenarios)
 *
 * With --out <path>: writes a single plain file using random fill (backwards-compatible).
 *
 * Usage:
 *   bun ./scripts/generate-input-data.ts [--out <path>] [--uoas <n>] [--seed <n>]
 *                                         [--p1 <0-1>] [--p2 <0-1>] [--help]
 */

import fs from 'fs';
import path from 'path';
import type { ReferenceRoot } from '../src/lib/types/structure';

// ── Output paths ──────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'static', 'data');
const INDICATORS_JSON = path.join(DATA_DIR, 'reference.json');

const OUT_TEMPLATE = path.join(DATA_DIR, 'input_template.csv');
const OUT_BAD = path.join(DATA_DIR, 'input_bad.csv');
const OUT_GOOD_50 = path.join(DATA_DIR, 'input_good_50.csv');
const OUT_PCODE = path.join(DATA_DIR, 'input_good_50_pcode.csv');
const OUT_PCODE_MIXED = path.join(DATA_DIR, 'input_good_50_pcode_mixed.csv');

// ── Filter values (plain UOA mode) ───────────────────────────────────────────

const FILTER1_VALUES = ['North', 'South', 'East', 'West', 'Centre'];
const FILTER2_VALUES = ['Hosts', 'IDPs', 'Refugees'];

// ── South Sudan p-codes ───────────────────────────────────────────────────────

const SS_ADM1: string[] = ['SS01','SS02','SS03','SS04','SS05','SS06','SS07','SS08','SS09','SS10'];

const SS_ADM2: string[] = [
	'SS0101','SS0102','SS0103','SS0104','SS0105','SS0106',
	'SS0201','SS0202','SS0203','SS0204','SS0205','SS0206','SS0207','SS0208',
	'SS0301','SS0302','SS0303','SS0304','SS0305','SS0306','SS0307','SS0308','SS0309','SS0310','SS0311',
	'SS0401','SS0402','SS0403','SS0404','SS0405','SS0406','SS0407','SS0408',
	'SS0501','SS0502','SS0503','SS0504','SS0505',
	'SS0601','SS0602','SS0603','SS0604','SS0605','SS0606','SS0607','SS0608','SS0609',
	'SS0701','SS0702','SS0703','SS0704','SS0705','SS0706','SS0707','SS0708','SS0709','SS0710','SS0711','SS0712',
	'SS0801','SS0802','SS0803','SS0804','SS0805','SS0806',
	'SS0901','SS0902','SS0903',
	'SS1001','SS1002','SS1003','SS1004','SS1005','SS1006','SS1007','SS1008','SS1009','SS1010',
];

const SS_ADM1_MIXED = ['SS08','SS09','SS10'];
const SS_ADM2_MIXED = SS_ADM2.filter((c) => !c.startsWith('SS08') && !c.startsWith('SS09') && !c.startsWith('SS10'));

// ── CLI ───────────────────────────────────────────────────────────────────────

interface Args {
	out: string | null;
	uoas: number;
	seed: number;
	p1: number;
	p2: number;
	help: boolean;
}

function parseArgs(argv: string[]): Args {
	let out: string | null = null;
	let uoas = 50;
	let seed = 42;
	let p1 = 0.7;
	let p2 = 0.4;
	let help = false;

	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--help' || argv[i] === '-h') help = true;
		else if (argv[i] === '--out' && argv[i + 1]) out = path.resolve(argv[++i]);
		else if (argv[i] === '--uoas' && argv[i + 1]) uoas = Math.max(1, parseInt(argv[++i], 10));
		else if (argv[i] === '--seed' && argv[i + 1]) seed = parseInt(argv[++i], 10);
		else if (argv[i] === '--p1' && argv[i + 1]) p1 = Math.min(1, Math.max(0, parseFloat(argv[++i])));
		else if (argv[i] === '--p2' && argv[i + 1]) p2 = Math.min(1, Math.max(0, parseFloat(argv[++i])));
	}
	return { out, uoas, seed, p1, p2, help };
}

// ── Seeded PRNG (LCG) ─────────────────────────────────────────────────────────

class Rng {
	private state: number;

	constructor(seed: number) {
		this.state = seed >>> 0;
	}

	next(): number {
		this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
		return this.state / 0x100000000;
	}

	float(lo: number, hi: number, dp = 2): number {
		return +(lo + this.next() * (hi - lo)).toFixed(dp);
	}

	int(lo: number, hi: number): number {
		return lo + Math.floor(this.next() * (hi - lo + 1));
	}

	bool(p: number): boolean {
		return this.next() < p;
	}

	pick<T>(arr: T[]): T {
		return arr[this.int(0, arr.length - 1)];
	}
}

// ── Indicator metadata ────────────────────────────────────────────────────────

interface IndMeta {
	code: string;
	type: string | null;
	preference: number;
	evidence_type: string | null;
	system_id: string;
	an_threshold: number | null;
	van_threshold: number | null;
	above_or_below: string | null;
	/** Counts toward system rollup (not supporting evidence, not pref-3). */
	is_rollup: boolean;
}

function loadIndicators(jsonPath: string): IndMeta[] {
	if (!fs.existsSync(jsonPath)) {
		console.error(`Error: reference.json not found at ${jsonPath}`);
		process.exit(2);
	}
	const root = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as ReferenceRoot;
	const out: IndMeta[] = [];
	for (const sys of root.systems)
		for (const fac of sys.factors)
			for (const sf of fac.sub_factors)
				for (const ind of sf.indicators)
					for (const met of ind.metrics) {
						const et = met.evidence_type ?? null;
						out.push({
							code: met.metric,
							type: met.type ?? null,
							preference: met.preference,
							evidence_type: et,
							system_id: sys.id,
							an_threshold: met.thresholds?.an ?? null,
							van_threshold: met.thresholds?.van ?? null,
							above_or_below: met.above_or_below ? met.above_or_below.toLowerCase() : null,
							is_rollup: met.preference !== 3 && et !== 'Supporting evidence',
						});
					}
	return out;
}

// ── Value generation ──────────────────────────────────────────────────────────

function genValue(type: string | null, rng: Rng): string {
	const t = (type ?? '').trim();
	switch (t) {
		case 'num[0+]':   return String(rng.float(0.01, 8.0, 2));
		case 'int[0+]':   return String(rng.int(0, 500));
		case 'num[0:1]':  return String(rng.float(0.02, 0.98, 2));
		case 'int[0:1]':  return String(rng.bool(0.6) ? 1 : 0);
		case 'num[0:7]':  return String(rng.float(0.1, 6.9, 1));
		case 'num[0:24]': return String(rng.float(0.5, 23.5, 1));
		case 'int[1:5]':  return String(rng.int(1, 5));
		case 'num':       return String(rng.float(-5.0, 10.0, 2));
		default:          return String(rng.float(0, 1, 2));
	}
}

function clampToType(v: number, type: string | null): string {
	const t = (type ?? '').trim();
	if (t === 'int[0:1]') return v >= 0.5 ? '1' : '0';
	if (t === 'int[1:5]') return String(Math.min(5, Math.max(1, Math.round(v))));
	if (t.startsWith('int')) return String(Math.round(Math.max(0, v)));
	if (t === 'num[0:1]') return String(+(Math.min(1, Math.max(0.01, v)).toFixed(2)));
	if (t === 'num[0:7]') return String(+(Math.min(7, Math.max(0.01, v)).toFixed(2)));
	if (t === 'num[0:24]') return String(+(Math.min(24, Math.max(0.1, v)).toFixed(2)));
	if (t === 'num[0+]') return String(+(Math.max(0.01, v).toFixed(2)));
	return String(+v.toFixed(2));
}

/** Value that crosses the AN threshold (triggers _flag). */
function flagVal(ind: IndMeta, rng: Rng): string {
	const an = ind.an_threshold;
	if (an === null || an === 0) return genValue(ind.type, rng);
	const mult = ind.above_or_below === 'above'
		? 1.4 + rng.next() * 0.6  // e.g. 1.4× to 2× above threshold
		: 0.2 + rng.next() * 0.3; // e.g. 0.2× to 0.5× of threshold (below it)
	return clampToType(an * mult, ind.type);
}

/** Value that stays safely below the AN threshold (no _flag). */
function safeVal(ind: IndMeta, rng: Rng): string {
	const an = ind.an_threshold;
	if (an === null || an === 0) return genValue(ind.type, rng);
	const mult = ind.above_or_below === 'above'
		? 0.2 + rng.next() * 0.5  // below threshold
		: 1.4 + rng.next() * 0.6; // above threshold (i.e., NOT acute)
	return clampToType(an * mult, ind.type);
}

/** Value that crosses the VAN threshold (triggers _van_flag and _flag). */
function vanVal(ind: IndMeta, rng: Rng): string {
	const van = ind.van_threshold;
	if (van === null || van === 0) return flagVal(ind, rng); // fall back to AN flag
	const mult = ind.above_or_below === 'above'
		? 1.4 + rng.next() * 0.5
		: 0.1 + rng.next() * 0.3;
	return clampToType(van * mult, ind.type);
}

// ── Scenario CSV builder ──────────────────────────────────────────────────────

type ScenarioType =
	| 'no_data'
	| 'no_acute'
	| 'insuff'
	| 'an_secondary'
	| 'an_primary_sys'
	| 'an_primary_ho'
	| 'ho_secondary'
	| 'ho_primary'
	| 'em';

// 50 UoAs across all 8 priority flag outcomes (no_data, no_acute_needs,
// insufficient_evidence, an_secondary, an_primary, ho_secondary, ho_primary, em)
const SCENARIO_DISTRIBUTION: Array<[ScenarioType, number]> = [
	['no_data',        5],
	['no_acute',       6],
	['insuff',         5],
	['an_secondary',   7],
	['an_primary_sys', 7],
	['an_primary_ho',  7],
	['ho_secondary',   5],
	['ho_primary',     5],
	['em',             3],
]; // total: 50

type CsvMode = 'plain' | 'pcode' | 'pcode_mixed';

function buildScenarioCsv(inds: IndMeta[], seed: number, mode: CsvMode): string {
	const rng = new Rng(seed);

	// System topology
	const allSystemIds = [...new Set(inds.map((m) => m.system_id))];
	const classificationSystems = allSystemIds.filter(
		(id) => id !== 'mortality' && id !== 'market_functionality'
	);
	const nonHoClassSystems = classificationSystems.filter((id) => id !== 'health_outcomes');

	const hoRollupMetrics = inds.filter(
		(m) => m.system_id === 'health_outcomes' && m.is_rollup
	);
	// For ho_secondary: prefer metrics that have a VAN threshold; fall back to any
	const hoVanCandidates = hoRollupMetrics.filter((m) => m.van_threshold !== null);
	const hoVanTarget = (hoVanCandidates[0] ?? hoRollupMetrics[0])?.code ?? null;

	// For an_primary_ho: flag 2 HO rollup metrics (below the 2/3 proportion rule)
	const hoAnTargets = new Set(hoRollupMetrics.slice(0, 2).map((m) => m.code));

	// UoA list
	let uoaList: string[];
	if (mode === 'pcode') {
		uoaList = SS_ADM2.slice(0, 50);
	} else if (mode === 'pcode_mixed') {
		uoaList = [...SS_ADM1_MIXED, ...SS_ADM2_MIXED.slice(0, 50 - SS_ADM1_MIXED.length)];
	} else {
		uoaList = Array.from({ length: 50 }, (_, i) => 'uoa' + String(i + 1).padStart(2, '0'));
	}

	const header = ['uoa', 'filter1', 'filter2', ...inds.map((i) => i.code)];
	const lines: string[] = [header.join(',')];

	let uoaIdx = 0;

	for (const [scenario, count] of SCENARIO_DISTRIBUTION) {
		for (let i = 0; i < count; i++) {
			const uoa = uoaList[uoaIdx++] ?? `uoa${String(uoaIdx).padStart(2, '0')}`;

			let filter1: string;
			if (mode === 'plain') {
				filter1 = rng.pick(FILTER1_VALUES);
			} else {
				filter1 = uoa.length > 4 ? uoa.substring(0, 4) : uoa;
			}
			const filter2 = rng.pick(FILTER2_VALUES);

			// Decide which systems / metrics to flag for this UoA
			const flagSystems = new Set<string>();
			const flagMetrics = new Set<string>(); // specific metric AN-flags
			const vanMetrics = new Set<string>();  // specific metric VAN-flags

			switch (scenario) {
				case 'em':
					flagSystems.add('mortality');
					break;
				case 'ho_primary':
					// Flag ALL HO rollup metrics → 100% proportion → triggers ho_primary
					for (const m of hoRollupMetrics) flagMetrics.add(m.code);
					break;
				case 'ho_secondary':
					// Flag exactly 1 HO metric with VAN (< proportion threshold)
					if (hoVanTarget) vanMetrics.add(hoVanTarget);
					break;
				case 'an_primary_ho':
					// AN-flag 2 HO rollup metrics only (not enough for proportion rule)
					for (const code of hoAnTargets) flagMetrics.add(code);
					break;
				case 'an_primary_sys':
					// Flag 3 non-HO, non-mortality classification systems
					for (const sid of nonHoClassSystems.filter(id => id !== 'mortality').slice(0, 3))
						flagSystems.add(sid);
					break;
				case 'an_secondary':
					// Flag exactly 1 non-HO classification system
					if (nonHoClassSystems[0]) flagSystems.add(nonHoClassSystems[0]);
					break;
				// no_data, no_acute, insuff: no flags
			}

			const cells: string[] = [uoa, filter1, filter2];

			for (const ind of inds) {
				if (ind.preference === 3) {
					cells.push('');
					continue;
				}

				if (scenario === 'no_data') {
					cells.push('');
					continue;
				}

				// VAN flag (also triggers AN flag)
				if (vanMetrics.has(ind.code)) {
					cells.push(vanVal(ind, rng));
					continue;
				}

				// AN flag for targeted systems/metrics
				if (ind.is_rollup && (flagSystems.has(ind.system_id) || flagMetrics.has(ind.code))) {
					cells.push(flagVal(ind, rng));
					continue;
				}

				// Non-flagged path
				if (scenario === 'insuff') {
					// Sparse: ~25% of pref-1 only — leaves most subfactor groups below evidence_threshold
					cells.push(ind.preference === 1 && rng.bool(0.25) ? safeVal(ind, rng) : '');
				} else if (scenario === 'no_acute') {
					// Fill ALL rollup metrics so every subfactor group meets its evidence_threshold
					// → all classification systems reach 'no_flag' → priority flag = no_acute_needs
					cells.push(ind.is_rollup ? safeVal(ind, rng) : '');
				} else {
					// Flagging scenarios: fill pref-1 in non-targeted systems with safe values
					cells.push(ind.preference === 1 ? safeVal(ind, rng) : (rng.bool(0.4) ? safeVal(ind, rng) : ''));
				}
			}

			lines.push(cells.join(','));
		}
	}

	return lines.join('\n') + '\n';
}

// ── Random CSV builder (--out mode, backwards-compatible) ─────────────────────

function buildGoodCsv(inds: IndMeta[], args: Args, mode: CsvMode): string {
	const { uoas, seed, p1, p2 } = args;
	const rng = new Rng(seed);

	let uoaList: string[];
	if (mode === 'plain') {
		uoaList = Array.from({ length: uoas }, (_, i) => 'uoa' + String(i + 1).padStart(2, '0'));
	} else if (mode === 'pcode') {
		uoaList = SS_ADM2.slice(0, uoas);
	} else {
		uoaList = [...SS_ADM1_MIXED, ...SS_ADM2_MIXED.slice(0, uoas - SS_ADM1_MIXED.length)];
	}

	const header = ['uoa', 'filter1', 'filter2', ...inds.map((i) => i.code)];
	const lines: string[] = [header.join(',')];

	for (const uoa of uoaList) {
		const filter1 =
			mode === 'plain' ? rng.pick(FILTER1_VALUES) : uoa.length > 4 ? uoa.substring(0, 4) : uoa;
		const cells: string[] = [uoa, filter1, rng.pick(FILTER2_VALUES)];

		for (const ind of inds) {
			if (ind.preference === 3) { cells.push(''); continue; }
			const fillProb = ind.preference === 1 ? p1 : p2;
			if (!rng.bool(fillProb)) { cells.push(''); continue; }
			cells.push(genValue(ind.type, rng));
		}
		lines.push(cells.join(','));
	}

	return lines.join('\n') + '\n';
}

// ── Bad CSV builder ───────────────────────────────────────────────────────────

function buildBadCsv(inds: IndMeta[]): string {
	const subset = inds.filter((i) => i.preference === 1).slice(0, 6);
	const metCols = subset.map((i) => i.code);
	const header = ['uoa', ...metCols].join(', ');
	const pad = (r: string[]) => r.slice(0, metCols.length + 1).join(',');
	const rows = [
		pad(['uoa01', '0.1', '0.21', '1', '', '', '']),
		pad(['uoa02', '-1', '0.21', '10', '0.3', '0.4', '0.6']),
		pad(['uoa03', 'x', 'x', 'x', '1', '"0.1"', 'x']),
	];
	return [header, ...rows].join('\n') + '\n';
}

// ── Template CSV builder ──────────────────────────────────────────────────────

function buildTemplateCsv(inds: IndMeta[]): string {
	const header = ['uoa', 'filter1', 'filter2', ...inds.map((i) => i.code)];
	return header.join(',') + '\n';
}

// ── Write helper ──────────────────────────────────────────────────────────────

function write(filePath: string, content: string): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content, 'utf-8');
	const rows = content.split('\n').filter(Boolean).length - 1;
	console.log(`  ✓ ${rows} row${rows !== 1 ? 's' : ''} → ${path.relative(process.cwd(), filePath)}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
	const args = parseArgs(process.argv.slice(2));

	if (args.help) {
		console.log(`
Usage: bun ./scripts/generate-input-data.ts [options]

Options:
  --out      <path>   Single output path (random fill, backwards-compatible)
  --uoas     <n>      Number of UOAs   (default: 50, --out mode only)
  --seed     <n>      PRNG seed        (default: 42)
  --p1       <0–1>    Fill prob for preference-1 metrics (default: 0.7, --out only)
  --p2       <0–1>    Fill prob for preference-2 metrics (default: 0.4, --out only)
  --help              Show this help

Default (no --out): writes all five fixtures to static/data/ with scenario-based
values covering all 8 priority flag outcomes across 50 UoAs:
  no_data (5), no_acute_needs (6), insufficient_evidence (5), an_secondary (7),
  an_primary via systems (7), an_primary via HO (7), ho_secondary (5),
  ho_primary (5), em (3)`.trim());
		return;
	}

	console.log(`Loading indicators from: ${path.relative(process.cwd(), INDICATORS_JSON)}`);
	const inds = loadIndicators(INDICATORS_JSON);
	const pref1 = inds.filter((i) => i.preference === 1).length;
	const pref2 = inds.filter((i) => i.preference === 2).length;
	const pref3 = inds.filter((i) => i.preference === 3).length;
	console.log(`Indicators: ${inds.length} total  (pref1=${pref1}, pref2=${pref2}, pref3=${pref3})`);

	if (args.out) {
		write(args.out, buildGoodCsv(inds, args, 'plain'));
		return;
	}

	console.log(`Seed: ${args.seed}\n`);
	write(OUT_TEMPLATE, buildTemplateCsv(inds));
	write(OUT_BAD, buildBadCsv(inds));
	write(OUT_GOOD_50, buildScenarioCsv(inds, args.seed, 'plain'));
	write(OUT_PCODE, buildScenarioCsv(inds, args.seed, 'pcode'));
	write(OUT_PCODE_MIXED, buildScenarioCsv(inds, args.seed, 'pcode_mixed'));
}

main();
