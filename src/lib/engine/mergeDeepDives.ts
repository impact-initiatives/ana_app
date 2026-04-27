import ExcelJS from '@protobi/exceljs';
import { unzipSync } from 'fflate';

/* --------------------- Types --------------------- */

export interface SynthesisRow {
	uoa: string;
	system: string;
	primaryHypothesis: string;
	secondaryHypothesis: string;
	plausibility: string;
	summary: string;
	triangulation: string;
	conclusion: string;
	// per-UoA outcome from the Summary sheet
	prelimFlag: string;
	finalFlag: string;
}

export interface MetricScoreRow {
	uoa: string;
	system: string;
	factor: string;
	subfactor: string;
	indicator: string;
	metricId: string;
	value: string;
	flag: string;
	scores: Record<string, string>;
	comment: string;
}

export interface ParsedMergeResult {
	synthesis: SynthesisRow[];
	metricScores: MetricScoreRow[];
	uoaCount: number;
	systemCount: number;
	warnings: string[];
}

/* --------------------- Synthesis label set --------------------- */

// Labels must match addSummarySection in deepdive.ts exactly.
const SYNTHESIS_LABELS = new Set([
	'Primary Hypothesis',
	'Secondary Hypothesis (if any)',
	'Plausibility Judgement',
	'Summary',
	'Triangulation Strength',
	'Chosen Conclusion'
]);

const STRUCTURAL_PREFIXES = ['FACTOR  ', '  Sub-factor  ', 'SYNTHESIS & CONCLUSION', 'ANALYSIS OUTCOME'];

function cellStr(cell: ExcelJS.Cell): string {
	const v = cell.value;
	if (v == null) return '';
	if (typeof v === 'object' && 'result' in v) return String((v as any).result ?? '');
	if (v instanceof Date) return v.toISOString();
	return String(v);
}

/* --------------------- Summary sheet parser --------------------- */

// Extracts per-UoA outcome data from the "Summary" sheet.
function parseSummarySheet(ws: ExcelJS.Worksheet): { uoa: string; prelimFlag: string; finalFlag: string } | null {
	const header = cellStr(ws.getRow(1).getCell(1));
	// Header: "UOA Summary  —  {uoaId}"
	const sep = '  —  ';
	const sepIdx = header.indexOf(sep);
	if (sepIdx === -1) return null;

	const uoa = header.slice(sepIdx + sep.length).trim();
	let prelimFlag = '';
	let finalFlag = '';

	ws.eachRow((row) => {
		const col1 = cellStr(row.getCell(1)).trim();
		if (col1 === 'Prelim flag') prelimFlag = cellStr(row.getCell(2));
		if (col1 === 'Final flag') finalFlag = cellStr(row.getCell(2));
	});

	// Fall back to prelim flag when analyst left Final flag blank
	return { uoa, prelimFlag, finalFlag: finalFlag || prelimFlag };
}

/* --------------------- System sheet parser --------------------- */

function parseSystemSheet(
	ws: ExcelJS.Worksheet
): { uoa: string; system: string; synthesis: Omit<SynthesisRow, 'uoa' | 'system' | 'prelimFlag' | 'finalFlag'>; metrics: MetricScoreRow[] } | null {
	const row1 = ws.getRow(1);
	const header = cellStr(row1.getCell(1));
	// Header: "{systemLabel}  —  UOA: {uoaId}"
	const sep = '  —  UOA: ';
	const sepIdx = header.indexOf(sep);
	if (sepIdx === -1) return null;

	const systemLabel = header.slice(0, sepIdx).trim();
	const uoa = header.slice(sepIdx + sep.length).trim();

	let currentFactor = '';
	let currentSubfactor = '';
	let currentIndicator = '';
	let hypIds: string[] = [];

	const synthMap: Record<string, string> = {};
	const metrics: MetricScoreRow[] = [];

	ws.eachRow((row, rowNum) => {
		if (rowNum === 1) return;
		const col1 = cellStr(row.getCell(1)).trimEnd();
		if (!col1) return;

		if (col1.startsWith('FACTOR  ')) {
			currentFactor = col1.slice('FACTOR  '.length).trim();
			currentSubfactor = '';
			currentIndicator = '';
			return;
		}

		if (col1.startsWith('  Sub-factor  ')) {
			currentSubfactor = col1.slice('  Sub-factor  '.length).trim();
			currentIndicator = '';
			return;
		}

		if (STRUCTURAL_PREFIXES.some((p) => col1.startsWith(p))) return;

		if (col1 === 'Metric ID') {
			// Table header row — capture hypothesis IDs from col 8 onwards (last = Comment)
			hypIds = [];
			const totalCells = row.cellCount;
			for (let c = 8; c < totalCells; c++) {
				const h = cellStr(row.getCell(c));
				if (h === 'Comment') break;
				if (h) hypIds.push(h);
			}
			return;
		}

		if (SYNTHESIS_LABELS.has(col1)) {
			synthMap[col1] = cellStr(row.getCell(3));
			return;
		}

		// Metric data row
		const metricId = col1;
		const indicator = cellStr(row.getCell(2));
		if (indicator) currentIndicator = indicator;
		const value = cellStr(row.getCell(4));
		const flag = cellStr(row.getCell(5));

		const scores: Record<string, string> = {};
		hypIds.forEach((hid, i) => {
			scores[hid] = cellStr(row.getCell(8 + i));
		});
		const comment = cellStr(row.getCell(8 + hypIds.length));

		metrics.push({
			uoa,
			system: systemLabel,
			factor: currentFactor,
			subfactor: currentSubfactor,
			indicator: currentIndicator,
			metricId,
			value,
			flag,
			scores,
			comment
		});
	});

	return {
		uoa,
		system: systemLabel,
		synthesis: {
			primaryHypothesis: synthMap['Primary Hypothesis'] ?? '',
			secondaryHypothesis: synthMap['Secondary Hypothesis (if any)'] ?? '',
			plausibility: synthMap['Plausibility Judgement'] ?? '',
			summary: synthMap['Summary'] ?? '',
			triangulation: synthMap['Triangulation Strength'] ?? '',
			conclusion: synthMap['Chosen Conclusion'] ?? ''
		},
		metrics
	};
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
	const metricScores: MetricScoreRow[] = [];
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

		// Parse Summary sheet for per-UoA outcome data
		const summaryWs = workbook.getWorksheet('Summary');
		let outcomeData: { uoa: string; prelimFlag: string; finalFlag: string } | null = null;
		if (summaryWs) {
			outcomeData = parseSummarySheet(summaryWs);
			if (!outcomeData) {
				warnings.push(`${name} / Summary: missing UOA header`);
			}
		} else {
			warnings.push(`${name}: no Summary sheet found`);
		}

		// Parse system sheets
		for (const ws of workbook.worksheets) {
			if (ws.name === 'Summary') continue;
			try {
				const result = parseSystemSheet(ws);
				if (!result) {
					warnings.push(`${name} / ${ws.name}: missing UOA header — skipped`);
					continue;
				}
				const uoa = result.uoa;
				uoaSet.add(uoa);
				systemSet.add(result.system);

				synthesis.push({
					uoa,
					system: result.system,
					...result.synthesis,
					prelimFlag: outcomeData?.prelimFlag ?? '',
					finalFlag: outcomeData?.finalFlag ?? ''
				});
				metricScores.push(...result.metrics);
			} catch (e) {
				warnings.push(`${name} / ${ws.name}: ${e instanceof Error ? e.message : String(e)}`);
			}
		}
	}

	return {
		synthesis,
		metricScores,
		uoaCount: uoaSet.size,
		systemCount: systemSet.size,
		warnings
	};
}

/* --------------------- XLSX builder --------------------- */

const PLACEHOLDER_FILL: ExcelJS.Fill = {
	type: 'pattern',
	pattern: 'solid',
	fgColor: { argb: 'FFFFF9E6' }
};

const HEADER_FILL: ExcelJS.Fill = {
	type: 'pattern',
	pattern: 'solid',
	fgColor: { argb: 'FFF2F2F2' }
};

const PLACEHOLDER_HEADER_FILL: ExcelJS.Fill = {
	type: 'pattern',
	pattern: 'solid',
	fgColor: { argb: 'FFFCE5B6' }
};

function applyHeaderCell(cell: ExcelJS.Cell, isPlaceholder = false): void {
	cell.font = { bold: true, size: 10 };
	cell.fill = isPlaceholder ? PLACEHOLDER_HEADER_FILL : HEADER_FILL;
	cell.alignment = { vertical: 'middle', wrapText: true };
	cell.border = {
		top: { style: 'thin', color: { argb: 'FFAAAAAA' } },
		left: { style: 'thin', color: { argb: 'FFAAAAAA' } },
		bottom: { style: 'medium', color: { argb: 'FF666666' } },
		right: { style: 'thin', color: { argb: 'FFAAAAAA' } }
	};
}

export async function buildMergeXlsx(
	parsed: ParsedMergeResult,
	pcodeLabelMap: Record<string, string>
): Promise<ArrayBuffer> {
	const workbook = new ExcelJS.Workbook();
	workbook.creator = 'ANA App';
	workbook.created = new Date();

	/* ---- Sheet 1: Synthesis ---- */
	const synthSheet = workbook.addWorksheet('Synthesis');

	const FIXED_SYNTH_HEADERS = [
		'UoA', 'Admin Name', 'Prelim flag', 'Final flag', 'System',
		'Primary Hypothesis', 'Secondary Hypothesis',
		'Plausibility', 'Summary', 'Triangulation', 'Chosen Conclusion'
	];
	const PLACEHOLDER_HEADERS = [
		'Certainty Score', 'Magnitude', 'Magnitude prop',
		'Sufficient data RoEM', 'Sufficient data magnitude'
	];
	const allSynthHeaders = [...FIXED_SYNTH_HEADERS, ...PLACEHOLDER_HEADERS];

	const synthColWidths = [18, 24, 16, 16, 22, 20, 20, 16, 36, 16, 22, 18, 16, 16, 20, 20];
	synthColWidths.forEach((w, i) => { synthSheet.getColumn(i + 1).width = w; });

	const synthHeaderRow = synthSheet.addRow(allSynthHeaders);
	synthHeaderRow.eachCell((cell, colNum) => {
		applyHeaderCell(cell, colNum > FIXED_SYNTH_HEADERS.length);
	});
	synthHeaderRow.height = 20;
	synthSheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];

	for (const row of parsed.synthesis) {
		const dataRow = synthSheet.addRow([
			row.uoa,
			pcodeLabelMap[row.uoa] ?? '',
			row.prelimFlag,
			row.finalFlag,
			row.system,
			row.primaryHypothesis,
			row.secondaryHypothesis,
			row.plausibility,
			row.summary,
			row.triangulation,
			row.conclusion,
			'', '', '', '', '' // placeholders
		]);
		dataRow.height = 15;
		for (let c = FIXED_SYNTH_HEADERS.length + 1; c <= allSynthHeaders.length; c++) {
			dataRow.getCell(c).fill = PLACEHOLDER_FILL;
		}
	}

	/* ---- Sheet 2: Metric Scores ---- */
	const metricSheet = workbook.addWorksheet('Metric Scores');

	const allHypIds = Array.from(
		new Set(parsed.metricScores.flatMap((r) => Object.keys(r.scores)))
	).sort();

	const FIXED_METRIC_HEADERS = [
		'UoA', 'System', 'Factor', 'SubFactor', 'Indicator',
		'Metric ID', 'Value', 'Flag'
	];
	const allMetricHeaders = [...FIXED_METRIC_HEADERS, ...allHypIds, 'Comment'];

	const metricColWidths = [18, 22, 20, 20, 28, 10, 10, 10];
	metricColWidths.forEach((w, i) => { metricSheet.getColumn(i + 1).width = w; });
	for (let i = metricColWidths.length + 1; i <= allMetricHeaders.length; i++) {
		metricSheet.getColumn(i).width = 12;
	}

	const metricHeaderRow = metricSheet.addRow(allMetricHeaders);
	metricHeaderRow.eachCell((cell) => applyHeaderCell(cell));
	metricHeaderRow.height = 20;
	metricSheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];

	for (const row of parsed.metricScores) {
		const hypValues = allHypIds.map((hid) => row.scores[hid] ?? '');
		metricSheet.addRow([
			row.uoa, row.system, row.factor, row.subfactor, row.indicator,
			row.metricId, row.value, row.flag,
			...hypValues,
			row.comment
		]).height = 15;
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
