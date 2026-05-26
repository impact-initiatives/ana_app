import ExcelJS from '@protobi/exceljs';
import { unzipSync } from 'fflate';
import { PRIORITY_BADGE_MAP } from '$lib/utils/colors';
import {
	HYPOTHESIS_VALUES, PLAUSIBILITY_SYNTHESIS_VALUES,
	TRIANGULATION_VALUES, CONCLUSION_VALUES
} from '$lib/types/deepdives.js';

/* --------------------- Types --------------------- */

export interface SynthesisRow {
	uoa: string;
	tab: string;
	system: string;
	primaryHypothesis: string;
	secondaryHypothesis: string;
	plausibility: string;
	summary: string;
	triangulation: string;
	conclusion: string;
	deepDiveRun: boolean;
	priorityFlag: string;
}

export interface ParsedMergeResult {
	synthesis: SynthesisRow[];
	uoaCount: number;
	systemCount: number;
	warnings: string[];
}

/* --------------------- Helpers --------------------- */

function cellStr(cell: ExcelJS.Cell): string {
	const v = cell.value;
	if (v == null) return '';
	if (v instanceof Date) return v.toISOString();
	if (typeof v === 'object') {
		// Formula cell with cached result
		if ('result' in v) return String((v as any).result ?? '');
		// Formula cell with no cached result (freshly generated, never opened in Excel)
		if ('formula' in v) return '';
		return String(v);
	}
	return String(v);
}

// Treat the placeholder '—' as empty so unfilled dropdowns read as blank.
function val(cell: ExcelJS.Cell): string {
	const s = cellStr(cell).trim();
	return s === '—' ? '' : s;
}

/* --------------------- Summary sheet parser --------------------- */

// The Summary worksheet (addLandingPage in deepdive.ts) contains everything we need:
//
//   Row 1: "UOA Summary  —  {uoaId}"
//   Row 3: column headers ["System", "Chosen Primary Hypothesis", ..., "Final conclusion"]
//   Tab rows: merged cell with tab label (e.g., "Exposure") — no data in cols 2-7
//   System rows: col 1 = "{TabLabel} - {SystemLabel}", cols 2-7 = VLOOKUP results
//   Outcome rows: "Prelim flag" / "Final flag" rows with value in col 2
//
// System rows are identified by col 1 containing " - " (tab + hyphen + system label).
// VLOOKUP cells have cached formula results when the file was saved after analyst input;
// freshly generated (unfilled) files have no cached result → cellStr returns '' → 'No deep dive run'.

function parseSummarySheet(ws: ExcelJS.Worksheet): {
	uoa: string;
	priorityFlag: string;
	systems: Omit<SynthesisRow, 'uoa' | 'priorityFlag'>[];
} | null {
	const header = cellStr(ws.getRow(1).getCell(1));
	const sep = '  —  ';
	const sepIdx = header.indexOf(sep);
	if (sepIdx === -1) return null;

	const uoa = header.slice(sepIdx + sep.length).trim();
	let priorityFlag = '';
	let conclusionValue = '';
	const systems: Omit<SynthesisRow, 'uoa' | 'priorityFlag' | 'conclusion' | 'deepDiveRun'>[] = [];

	ws.eachRow((row) => {
		const col1 = cellStr(row.getCell(1)).trim();
		if (!col1) return;

		if (col1 === 'Priority flag') { priorityFlag = cellStr(row.getCell(2)); return; }
		if (col1 === 'Conclusion')    { conclusionValue = cellStr(row.getCell(2)); return; }

		// System rows: col 1 = "TabLabel - SystemLabel"
		if (!col1.includes(' - ')) return;
		const dashIdx = col1.indexOf(' - ');
		const tabLabel  = col1.slice(0, dashIdx).trim();
		const systemName = col1.slice(dashIdx + 3).trim();
		systems.push({
			tab:                 tabLabel,
			system:              systemName,
			primaryHypothesis:   val(row.getCell(2)),
			secondaryHypothesis: val(row.getCell(3)),
			summary:             val(row.getCell(4)),
			plausibility:        val(row.getCell(5)),
			triangulation:       val(row.getCell(6))
		});
	});

	const conclusion = conclusionValue.trim() === '—' ? '' : conclusionValue.trim();
	const deepDiveRun = conclusion !== '';

	const fullSystems: Omit<SynthesisRow, 'uoa' | 'priorityFlag'>[] =
		systems.map((s) => ({ ...s, conclusion, deepDiveRun }));

	return { uoa, priorityFlag, systems: fullSystems };
}

/* --------------------- Conclusion → conclusion key mapping --------------------- */

const CONCLUSION_TO_KEY: Record<string, string> = {
	'EM':                    'em',
	'RoEM':                  'roem',
	'Acute Needs':           'an',
	'No Acute Needs':        'no_acute_needs',
	'Insufficient evidence': 'insufficient_evidence',
	'No data':               'no_data'
};

export function conclusionToFlag(conclusion: string): string | null {
	return CONCLUSION_TO_KEY[conclusion] ?? null;
}

/* --------------------- PriorityFlag → conclusion key mapping --------------------- */

const PF_TO_CONCLUSION: Record<string, string> = {
	em:                    'em',
	ho_primary:            'roem',
	ho_secondary:          'roem',
	an_primary:            'an',
	an_secondary:          'an',
	no_acute_needs:        'no_acute_needs',
	insufficient_evidence: 'insufficient_evidence',
	no_data:               'no_data'
};

// Derived reverse map: PRIORITY_BADGE_MAP display label → conclusion key.
// The deep-dive generator writes badge.label into the Priority flag cell, not the raw key.
const PRIORITY_LABEL_TO_CONCLUSION: Record<string, string> = Object.fromEntries(
	Object.entries(PRIORITY_BADGE_MAP)
		.filter(([pfKey]) => pfKey in PF_TO_CONCLUSION)
		.map(([pfKey, badge]) => [badge.label, PF_TO_CONCLUSION[pfKey]])
);

export function priorityFlagToConclusion(pf: string): string | null {
	return PF_TO_CONCLUSION[pf] ?? PRIORITY_LABEL_TO_CONCLUSION[pf] ?? null;
}

/* --------------------- Field validation --------------------- */

const VALID_HYPOTHESIS    = new Set<string>([...HYPOTHESIS_VALUES, '']);
const VALID_PLAUSIBILITY  = new Set<string>([...PLAUSIBILITY_SYNTHESIS_VALUES, '']);
const VALID_TRIANGULATION = new Set<string>([...TRIANGULATION_VALUES, '']);
const VALID_CONCLUSION    = new Set<string>([...CONCLUSION_VALUES, '']);

function validateSynthesisFields(
	sys: Omit<SynthesisRow, 'uoa' | 'priorityFlag'>,
	context: string
): string[] {
	const errs: string[] = [];
	if (!VALID_HYPOTHESIS.has(sys.primaryHypothesis))
		errs.push(`${context}: invalid Primary Hypothesis "${sys.primaryHypothesis}" — expected ${HYPOTHESIS_VALUES.join(', ')}`);
	if (!VALID_HYPOTHESIS.has(sys.secondaryHypothesis))
		errs.push(`${context}: invalid Secondary Hypothesis "${sys.secondaryHypothesis}" — expected ${HYPOTHESIS_VALUES.join(', ')}`);
	if (!VALID_PLAUSIBILITY.has(sys.plausibility))
		errs.push(`${context}: invalid Plausibility "${sys.plausibility}" — expected ${PLAUSIBILITY_SYNTHESIS_VALUES.join(', ')}`);
	if (!VALID_TRIANGULATION.has(sys.triangulation))
		errs.push(`${context}: invalid Triangulation Strength "${sys.triangulation}" — expected ${TRIANGULATION_VALUES.join(', ')}`);
	if (!VALID_CONCLUSION.has(sys.conclusion))
		errs.push(`${context}: invalid Conclusion "${sys.conclusion}" — expected ${CONCLUSION_VALUES.join(', ')}`);
	return errs;
}

/* --------------------- ZIP parser --------------------- */

export async function parseMergeZip(file: File): Promise<ParsedMergeResult> {
	const arrayBuffer = await file.arrayBuffer();
	const uint8 = new Uint8Array(arrayBuffer);

	let entries: Record<string, Uint8Array>;
	try {
		entries = unzipSync(uint8);
	} catch (e) {
		throw new Error(`Could not unzip file: ${e instanceof Error ? e.message : String(e)}`);
	}

	const synthesis: SynthesisRow[] = [];
	const warnings: string[] = [];
	const uoaSet = new Set<string>();
	const systemSet = new Set<string>();

	for (const [name, data] of Object.entries(entries)) {
		if (!name.toLowerCase().endsWith('.xlsx')) continue;

		let workbook: ExcelJS.Workbook;
		try {
			workbook = new ExcelJS.Workbook();
			await workbook.xlsx.load(data.slice(0).buffer as ArrayBuffer);
		} catch (e) {
			warnings.push(`${name}: could not parse XLSX — ${e instanceof Error ? e.message : String(e)}`);
			continue;
		}

		const summaryWs = workbook.getWorksheet('Summary');
		if (!summaryWs) {
			warnings.push(`${name}: no Summary sheet found`);
			continue;
		}

		const result = parseSummarySheet(summaryWs);
		if (!result) {
			warnings.push(`${name} / Summary: missing UOA header`);
			continue;
		}

		if (result.systems.length === 0) {
			warnings.push(`${name} / Summary: no system rows found`);
			continue;
		}

		uoaSet.add(result.uoa);
		for (const sys of result.systems) {
			const ctx = `${name} / ${result.uoa} — ${sys.tab} › ${sys.system}`;
			warnings.push(...validateSynthesisFields(sys, ctx));
			systemSet.add(sys.system);
			synthesis.push({
				uoa:          result.uoa,
				priorityFlag: result.priorityFlag,
				...sys
			});
		}
	}

	return { synthesis, uoaCount: uoaSet.size, systemCount: systemSet.size, warnings };
}

/* --------------------- XLSX builder --------------------- */

const PLACEHOLDER_FILL: ExcelJS.Fill = {
	type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9E6' }
};
const HEADER_FILL: ExcelJS.Fill = {
	type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' }
};
const PLACEHOLDER_HEADER_FILL: ExcelJS.Fill = {
	type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE5B6' }
};

function applyHeaderCell(cell: ExcelJS.Cell, isPlaceholder = false): void {
	cell.font = { bold: true, size: 10 };
	cell.fill = isPlaceholder ? PLACEHOLDER_HEADER_FILL : HEADER_FILL;
	cell.alignment = { vertical: 'middle', wrapText: true };
	cell.border = {
		top:    { style: 'thin',   color: { argb: 'FFAAAAAA' } },
		left:   { style: 'thin',   color: { argb: 'FFAAAAAA' } },
		bottom: { style: 'medium', color: { argb: 'FF666666' } },
		right:  { style: 'thin',   color: { argb: 'FFAAAAAA' } }
	};
}

export async function buildMergeXlsx(
	parsed: ParsedMergeResult,
	pcodeLabelMap: Record<string, string>
): Promise<ArrayBuffer> {
	const workbook = new ExcelJS.Workbook();
	workbook.creator = 'ANA App';
	workbook.created = new Date();

	const ws = workbook.addWorksheet('Synthesis');

	const FIXED_HEADERS = [
		'UoA', 'Admin Name', 'Priority flag', 'System',
		'Primary Hypothesis', 'Secondary Hypothesis',
		'Plausibility', 'Summary', 'Triangulation', 'Conclusion'
	];
	const PLACEHOLDER_HEADERS = [
		'Certainty Score', 'Magnitude', 'Magnitude prop',
		'Sufficient data RoEM', 'Sufficient data magnitude'
	];
	const allHeaders = [...FIXED_HEADERS, ...PLACEHOLDER_HEADERS];

	const colWidths = [18, 24, 16, 22, 20, 20, 16, 36, 16, 22, 18, 16, 16, 20, 20];
	colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

	const headerRow = ws.addRow(allHeaders);
	headerRow.eachCell((cell, colNum) => {
		applyHeaderCell(cell, colNum > FIXED_HEADERS.length);
	});
	headerRow.height = 20;
	ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];

	for (const row of parsed.synthesis) {
		const dataRow = ws.addRow([
			row.uoa,
			pcodeLabelMap[row.uoa] ?? '',
			row.priorityFlag,
			row.system,
			row.primaryHypothesis,
			row.secondaryHypothesis,
			row.plausibility,
			row.summary,
			row.triangulation,
			row.conclusion,
			'', '', '', '', ''
		]);
		dataRow.height = 15;
		for (let c = FIXED_HEADERS.length + 1; c <= allHeaders.length; c++) {
			dataRow.getCell(c).fill = PLACEHOLDER_FILL;
		}
	}

	return await workbook.xlsx.writeBuffer() as ArrayBuffer;
}

/* --------------------- Download helper --------------------- */

export async function downloadMergeXlsx(
	parsed: ParsedMergeResult,
	pcodeLabelMap: Record<string, string>,
	filename = 'deepdives_merged.xlsx'
): Promise<void> {
	const buffer = await buildMergeXlsx(parsed, pcodeLabelMap);
	const blob = new Blob([buffer], {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}
