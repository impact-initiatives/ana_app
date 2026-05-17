#!/usr/bin/env bun
/**
 * scripts/generate-input-data.ts
 *
 * Generates synthetic input CSVs for testing the ANA app validator.
 *
 * Default (no --out): writes all four standard fixtures to static/data/:
 *   input_bad.csv                  – 3-row file with deliberate validation errors
 *   input_good_50.csv              – 50 plain UOAs with filter columns
 *   input_good_50_pcode.csv        – 50 South Sudan ADM2 p-code UOAs
 *   input_good_50_pcode_mixed.csv  – 10 SS ADM1 + 40 SS ADM2 p-code UOAs
 *
 * With --out <path>: writes a single plain file (backwards-compatible).
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

const OUT_BAD = path.join(DATA_DIR, 'input_bad.csv');
const OUT_GOOD_50 = path.join(DATA_DIR, 'input_good_50.csv');
const OUT_PCODE = path.join(DATA_DIR, 'input_good_50_pcode.csv');
const OUT_PCODE_MIXED = path.join(DATA_DIR, 'input_good_50_pcode_mixed.csv');

// ── Filter values (plain UOA mode) ───────────────────────────────────────────

const FILTER1_VALUES = ['North', 'South', 'East', 'West', 'Centre'];
const FILTER2_VALUES = ['Hosts', 'IDPs', 'Refugees'];

// ── South Sudan p-codes (OCHA COD-AB, adm2_source_code field) ─────────────────
//
// ADM2 format: SS + 2-digit state + 2-digit county (6 chars), e.g. SS0101
// ADM1 format: SS + 2-digit state (4 chars), e.g. SS01
//
// MIXED constraint: analyzeUoas rejects any ADM1 code that is a prefix of an
// ADM2 code in the same dataset (SS01 is a prefix of SS0101 → error).
// Solution: ADM2 rows come from states 01–07; ADM1 rows use states 08–10.

const SS_ADM1: string[] = ['SS01','SS02','SS03','SS04','SS05','SS06','SS07','SS08','SS09','SS10'];

// 78 real counties, grouped by state
const SS_ADM2: string[] = [
	// SS01 – 6 counties
	'SS0101','SS0102','SS0103','SS0104','SS0105','SS0106',
	// SS02 – 8 counties
	'SS0201','SS0202','SS0203','SS0204','SS0205','SS0206','SS0207','SS0208',
	// SS03 – 11 counties
	'SS0301','SS0302','SS0303','SS0304','SS0305','SS0306','SS0307','SS0308','SS0309','SS0310','SS0311',
	// SS04 – 8 counties
	'SS0401','SS0402','SS0403','SS0404','SS0405','SS0406','SS0407','SS0408',
	// SS05 – 5 counties
	'SS0501','SS0502','SS0503','SS0504','SS0505',
	// SS06 – 9 counties
	'SS0601','SS0602','SS0603','SS0604','SS0605','SS0606','SS0607','SS0608','SS0609',
	// SS07 – 12 counties
	'SS0701','SS0702','SS0703','SS0704','SS0705','SS0706','SS0707','SS0708','SS0709','SS0710','SS0711','SS0712',
	// SS08 – 6 counties
	'SS0801','SS0802','SS0803','SS0804','SS0805','SS0806',
	// SS09 – 3 counties
	'SS0901','SS0902','SS0903',
	// SS10 – 10 counties
	'SS1001','SS1002','SS1003','SS1004','SS1005','SS1006','SS1007','SS1008','SS1009','SS1010',
];

// For MIXED: ADM1 from states 08–10 (no overlap with ADM2 below)
const SS_ADM1_MIXED = ['SS08','SS09','SS10'];
// ADM2 from states 01–07 only (59 counties — prefix-safe against SS08/09/10)
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
		else if (argv[i] === '--p1' && argv[i + 1])
			p1 = Math.min(1, Math.max(0, parseFloat(argv[++i])));
		else if (argv[i] === '--p2' && argv[i + 1])
			p2 = Math.min(1, Math.max(0, parseFloat(argv[++i])));
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

// ── Value generation by type string ──────────────────────────────────────────

function genValue(type: string | null, rng: Rng): string {
	const t = (type ?? '').trim();
	switch (t) {
		case 'num[0+]':
			return String(rng.float(0.01, 8.0, 2));
		case 'int[0+]':
			return String(rng.int(0, 500));
		case 'num[0:1]':
			return String(rng.float(0.02, 0.98, 2));
		case 'int[0:1]':
			return String(rng.bool(0.6) ? 1 : 0);
		case 'num[0:7]':
			return String(rng.float(0.1, 6.9, 1));
		case 'num[0:24]':
			return String(rng.float(0.5, 23.5, 1));
		case 'int[1:5]':
			return String(rng.int(1, 5));
		case 'num':
			return String(rng.float(-5.0, 10.0, 2));
		default:
			return String(rng.float(0, 1, 2));
	}
}

// ── Indicator metadata ────────────────────────────────────────────────────────

interface IndMeta {
	code: string;
	type: string | null;
	preference: number;
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
					for (const met of ind.metrics)
						out.push({ code: met.metric, type: met.type ?? null, preference: met.preference });
	return out;
}

// ── CSV builders ──────────────────────────────────────────────────────────────

type CsvMode = 'plain' | 'pcode' | 'pcode_mixed';

function buildGoodCsv(inds: IndMeta[], args: Args, mode: CsvMode): string {
	const { uoas, seed, p1, p2 } = args;
	const rng = new Rng(seed);

	let uoaList: string[];
	if (mode === 'plain') {
		uoaList = Array.from({ length: uoas }, (_, i) => 'uoa' + String(i + 1).padStart(2, '0'));
	} else if (mode === 'pcode') {
		uoaList = SS_ADM2.slice(0, uoas);
	} else {
		// mixed: 3 ADM1 (SS08–SS10) + up to 47 ADM2 from SS01–SS07 (no prefix overlap)
		uoaList = [...SS_ADM1_MIXED, ...SS_ADM2_MIXED.slice(0, uoas - SS_ADM1_MIXED.length)];
	}

	const header = ['uoa', 'filter1', 'filter2', ...inds.map((i) => i.code)];
	const lines: string[] = [header.join(',')];

	for (const uoa of uoaList) {
		// For pcode modes use the parent ADM1 pcode as filter1 (SS0101 → SS01; SS01 → SS01)
		const filter1 =
			mode === 'plain' ? rng.pick(FILTER1_VALUES) : uoa.length > 4 ? uoa.substring(0, 4) : uoa;
		const cells: string[] = [uoa, filter1, rng.pick(FILTER2_VALUES)];

		for (const ind of inds) {
			if (ind.preference === 3) {
				cells.push('');
				continue;
			}
			const fillProb = ind.preference === 1 ? p1 : p2;
			if (!rng.bool(fillProb)) {
				cells.push('');
				continue;
			}
			cells.push(genValue(ind.type, rng));
		}
		lines.push(cells.join(','));
	}

	return lines.join('\n') + '\n';
}

function buildBadCsv(inds: IndMeta[]): string {
	// Use the first 6 preference-1 metrics — simulates an incomplete/corrupt upload
	const subset = inds.filter((i) => i.preference === 1).slice(0, 6);
	const metCols = subset.map((i) => i.code);

	// Space after comma in header (common spreadsheet export artifact)
	const header = ['uoa', ...metCols].join(', ');

	const pad = (r: string[]) => r.slice(0, metCols.length + 1).join(',');
	const rows = [
		pad(['uoa01', '0.1', '0.21', '1', '', '', '']), // valid, some empty
		pad(['uoa02', '-1', '0.21', '10', '0.3', '0.4', '0.6']), // negative value
		pad(['uoa03', 'x', 'x', 'x', '1', '"0.1"', 'x']) // non-numeric + quoted
	];

	return [header, ...rows].join('\n') + '\n';
}

// ── Write helper ──────────────────────────────────────────────────────────────

function write(filePath: string, content: string): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content, 'utf-8');
	const rows = content.split('\n').filter(Boolean).length - 1;
	console.log(`  ✓ ${rows} rows → ${path.relative(process.cwd(), filePath)}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
	const args = parseArgs(process.argv.slice(2));

	if (args.help) {
		console.log(
			`
Usage: bun ./scripts/generate-input-data.ts [options]

Options:
  --out      <path>   Single output path (plain UOAs, backwards-compatible)
  --uoas     <n>      Number of UOAs   (default: 50)
  --seed     <n>      PRNG seed        (default: 42)
  --p1       <0–1>    Fill probability for preference-1 indicators (default: 0.7)
  --p2       <0–1>    Fill probability for preference-2 indicators (default: 0.4)
  --help              Show this help

Default (no --out): writes all four fixtures to static/data/:
  input_bad.csv                  – validation error examples (3 rows, 6 metrics)
  input_good_50.csv              – 50 plain UOAs with filter1/filter2 columns
  input_good_50_pcode.csv        – 50 South Sudan ADM2 p-codes
  input_good_50_pcode_mixed.csv  – 10 SS ADM1 + 40 SS ADM2 p-codes (mixed mode)
`.trim()
		);
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

	console.log(`UOAs: ${args.uoas}  |  Seed: ${args.seed}  |  p1=${args.p1}  |  p2=${args.p2}\n`);
	write(OUT_BAD, buildBadCsv(inds));
	write(OUT_GOOD_50, buildGoodCsv(inds, args, 'plain'));
	write(OUT_PCODE, buildGoodCsv(inds, args, 'pcode'));
	write(OUT_PCODE_MIXED, buildGoodCsv(inds, args, 'pcode_mixed'));
}

main();
