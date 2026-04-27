import ExcelJS from '@protobi/exceljs';
import type { Worksheet, Cell, Fill, Border, Borders, DataValidation } from '@protobi/exceljs';
import { colCount, colWidths, tableHeaders } from '$lib/types/deepdives.js';
import type { SystemHypotheses, HypothesesData } from '$lib/types/deepdives';

/**
 * Deep Dive Excel export — one file per unit of analysis.
 *
 * Workbook layout:
 *   - One worksheet per system (tab = system label)
 *   - Each worksheet:
 *       System header (full-width, dark blue)
 *       For each factor:
 *         Factor row  (label left | flag summary right, light blue)
 *         For each sub-factor:
 *           Sub-factor row  (label left | flag summary right, light green)
 *           Table header:  Indicator | Label | Metric | Value | Flag | AN Threshold | Direction | H1–H5 | Comment
 *           Indicator rows (flagged rows have a light-red tint)
 */

/* --------------------- Types --------------------- */

type SynthesisRows = {
	primaryHypRow: number;
	secondaryHypRow: number;
	plausibilityRow: number;
	summaryRow: number;
	triangulationRow: number;
	conclusionRow: number;
};

type SheetMeta = {
	sheetName: string;
	system: Record<string, any>;
	synthesisRows: SynthesisRows;
};

type IndicatorRowParams = {
	id: string;
	label: string | null;
	metric: string | null;
	value: number | null;
	flagLabelStr: string;
	an: number | null;
	direction: string | null;
};

/* --------------------- Colour helpers --------------------- */

/** Convert a CSS hex colour (#rrggbb) to ExcelJS ARGB (FFrrggbb). */
function hexToArgb(hex: string): string {
	return 'FF' + hex.replace('#', '').toUpperCase().padStart(6, '0');
}

/** Mix a hex colour with white at the given weight (0=white, 1=original). */
function mixWithWhite(hex: string, weight: number): string {
	const clean = hex.replace('#', '');
	const parse = (s: string) => parseInt(s, 16);
	const r = Math.round(255 + (parse(clean.slice(0, 2)) - 255) * weight);
	const g = Math.round(255 + (parse(clean.slice(2, 4)) - 255) * weight);
	const b = Math.round(255 + (parse(clean.slice(4, 6)) - 255) * weight);
	const toHex = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
	return '#' + toHex(r) + toHex(g) + toHex(b);
}

/** Perceived luminance of a hex colour (0=black, 1=white). */
function luminance(hex: string): number {
	const clean = hex.replace('#', '');
	const r = parseInt(clean.slice(0, 2), 16) / 255;
	const g = parseInt(clean.slice(2, 4), 16) / 255;
	const b = parseInt(clean.slice(4, 6), 16) / 255;
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Read the hex value for a system's base colour directly from the CSS custom
 * property defined in app.css.  system IDs use underscores; CSS vars use
 * hyphens, e.g. food_systems → --color-sys-food-systems.
 */
function sysHex(systemId: string): string {
	const slug = String(systemId).replace(/_/g, '-');
	const val = getComputedStyle(document.documentElement)
		.getPropertyValue(`--color-sys-${slug}`)
		.trim();
	return val || '#718096';
}

function sysArgb(systemId: string): string {
	return hexToArgb(sysHex(systemId));
}

function sysArgbLight(systemId: string, weight = 0.25): string {
	return hexToArgb(mixWithWhite(sysHex(systemId), weight));
}

function sysArgbMid(systemId: string, weight = 0.45): string {
	return hexToArgb(mixWithWhite(sysHex(systemId), weight));
}

function sysTextArgb(systemId: string): string {
	return luminance(sysHex(systemId)) > 0.45 ? 'FF000000' : 'FFFFFFFF';
}

/* --------------------- Style helpers --------------------- */

function solidFill(argb: string): Fill {
	return { type: 'pattern', pattern: 'solid', fgColor: { argb } } as Fill;
}

function thinLine(argb = 'FFCCCCCC'): Border {
	return { style: 'thin', color: { argb } } as Border;
}

function allBorders(argb = 'FFCCCCCC'): Partial<Borders> {
	const s = thinLine(argb);
	return { top: s, left: s, bottom: s, right: s };
}

function flagArgb(flagLabelStr: string): string {
	if (flagLabelStr === 'flag') return 'FFCC0000';
	if (flagLabelStr === 'no_flag') return 'FF00703C';
	return 'FF888888';
}

function flagDisplayText(flagLabelStr: string): string {
	if (flagLabelStr === 'flag') return 'Flag';
	if (flagLabelStr === 'no_flag') return 'No flag';
	return 'No data';
}

function sectionSummary(flagN: number, noFlagN: number, missingN: number): string {
	const total = flagN + noFlagN + missingN;
	const status = flagN > 0 ? 'Flag' : total > 0 ? 'No flag' : 'No data';
	return `${status}   (flag: ${flagN}  no_flag: ${noFlagN}  missing: ${missingN})`;
}

/* --------------------- Row builders --------------------- */

function addSystemHeader(ws: Worksheet, systemLabel: string, uoaId: string, numCols: number, systemId: string): void {
	const row = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(row.number, 1, row.number, numCols);
	const cell = row.getCell(1);
	cell.value = `${systemLabel}  —  UOA: ${uoaId}`;
	cell.font = { bold: true, size: 14, color: { argb: sysTextArgb(systemId) } };
	cell.fill = solidFill(sysArgb(systemId));
	cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
	row.height = 26;
}

function addFactorRow(ws: Worksheet, factorLabel: string, flagN: number, noFlagN: number, missingN: number, numCols: number, systemId: string): void {
	const isFlagged = flagN > 0;
	const row = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(row.number, 1, row.number, 7);
	ws.mergeCells(row.number, 8, row.number, numCols);

	const labelCell = row.getCell(1);
	labelCell.value = `FACTOR  ${factorLabel}`;
	labelCell.font = { bold: true, size: 12 };
	labelCell.fill = solidFill(sysArgbMid(systemId, 0.45));
	labelCell.alignment = { vertical: 'middle', indent: 1 };

	const statusCell = row.getCell(8);
	statusCell.value = sectionSummary(flagN, noFlagN, missingN);
	statusCell.font = { bold: true, color: { argb: isFlagged ? 'FFCC0000' : 'FF00703C' } };
	statusCell.fill = solidFill(sysArgbMid(systemId, 0.45));
	statusCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
	row.height = 20;
}

function addSubfactorRow(ws: Worksheet, subfactorLabel: string, flagN: number, noFlagN: number, missingN: number, numCols: number, systemId: string): void {
	const isFlagged = flagN > 0;
	const row = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(row.number, 1, row.number, 7);
	ws.mergeCells(row.number, 8, row.number, numCols);

	const labelCell = row.getCell(1);
	labelCell.value = `  Sub-factor  ${subfactorLabel}`;
	labelCell.font = { italic: true, size: 11 };
	labelCell.fill = solidFill(sysArgbLight(systemId, 0.25));
	labelCell.alignment = { vertical: 'middle', indent: 1 };

	const statusCell = row.getCell(8);
	statusCell.value = sectionSummary(flagN, noFlagN, missingN);
	statusCell.font = { italic: true, color: { argb: isFlagged ? 'FFCC0000' : 'FF00703C' } };
	statusCell.fill = solidFill(sysArgbLight(systemId, 0.25));
	statusCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
	row.height = 18;
}

function addTableHeaderRow(ws: Worksheet, headers: string[]): void {
	const row = ws.addRow(headers);
	row.eachCell((cell: Cell) => {
		cell.font = { bold: true, size: 10 };
		cell.fill = solidFill('FFF2F2F2');
		cell.border = {
			top: thinLine('FFAAAAAA'),
			left: thinLine('FFAAAAAA'),
			bottom: { style: 'medium', color: { argb: 'FF666666' } },
			right: thinLine('FFAAAAAA')
		};
		cell.alignment = { vertical: 'middle', wrapText: false };
	});
	row.height = 16;
}

function addIndicatorRow(ws: Worksheet, { id, label, metric, value, flagLabelStr, an, direction }: IndicatorRowParams, hypothesesCount: number): void {
	const rowValues = [
		id,
		label ?? '',
		metric ?? '',
		value == null ? '' : value,
		flagDisplayText(flagLabelStr),
		an == null ? '' : an,
		direction ?? '',
		...Array(hypothesesCount).fill(''),
		''
	];

	const row = ws.addRow(rowValues);
	const isFlagged = flagLabelStr === 'flag';

	row.eachCell((cell: Cell, colNum: number) => {
		cell.border = allBorders('FFDDDDDD');
		cell.alignment = { vertical: 'middle' };
		if (isFlagged && colNum <= 7) cell.fill = solidFill('FFFFF0F0');
	});

	const flagCell = row.getCell(5);
	flagCell.font = { color: { argb: flagArgb(flagLabelStr) }, bold: isFlagged };

	if (hypothesesCount > 0) {
		const hypothesisValidation: DataValidation = {
			type: 'list',
			allowBlank: true,
			formulae: ['"++,+,~,-,--"'],
			showErrorMessage: false
		};
		for (let col = 8; col <= 7 + hypothesesCount; col++) {
			row.getCell(col).dataValidation = hypothesisValidation;
		}
	}

	row.height = 15;
}

/* --------------------- Hypothesis reference table --------------------- */

function addHypothesisTable(ws: Worksheet, sysHyps: SystemHypotheses, numCols: number, systemId: string): void {
	if (!sysHyps.hypotheses.length) return;

	const headerRow = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(headerRow.number, 1, headerRow.number, numCols);
	const headerCell = headerRow.getCell(1);
	headerCell.value = `Hypotheses for assessing ${sysHyps.systemLabel} deprivation`;
	headerCell.font = { bold: true, size: 11, color: { argb: sysTextArgb(systemId) } };
	headerCell.fill = solidFill(sysArgbMid(systemId, 0.7));
	headerCell.alignment = { vertical: 'middle', horizontal: 'center', indent: 1 };
	headerCell.border = allBorders('FFCCCCCC');
	headerRow.height = 20;

	for (const hyp of sysHyps.hypotheses) {
		const row = ws.addRow(new Array(numCols).fill(''));
		ws.mergeCells(row.number, 1, row.number, 1);
		ws.mergeCells(row.number, 2, row.number, numCols);

		const idCell = row.getCell(1);
		idCell.value = hyp.id;
		idCell.font = { bold: true, size: 10 };
		idCell.fill = solidFill('FFFFF2CC');
		idCell.alignment = { vertical: 'middle', horizontal: 'center' };
		idCell.border = allBorders('FFCCCCCC');

		const descCell = row.getCell(2);
		descCell.value = hyp.description;
		descCell.font = { size: 10 };
		descCell.fill = solidFill('FFFFFFFF');
		descCell.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
		descCell.border = allBorders('FFCCCCCC');
		row.height = 30;
	}

	ws.addRow([]);
}

/* --------------------- Summary / conclusion section --------------------- */

function addSummaryRow(ws: Worksheet, label: string, csvValues: string, numCols: number, allowBlank = false): void {
	const row = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(row.number, 1, row.number, 2);
	ws.mergeCells(row.number, 3, row.number, 7);

	const labelCell = row.getCell(1);
	labelCell.value = label;
	labelCell.font = { bold: true, size: 10 };
	labelCell.fill = solidFill('FFF0F0F0');
	labelCell.alignment = { vertical: 'middle', indent: 1 };
	labelCell.border = allBorders();

	const valueCell = row.getCell(3);
	valueCell.fill = solidFill('FFFFFFFF');
	valueCell.alignment = { vertical: 'middle', indent: 1 };
	valueCell.border = allBorders();
	valueCell.dataValidation = {
		type: 'list',
		allowBlank,
		formulae: [`"${csvValues}"`],
		showErrorMessage: false
	};
	row.height = 20;
}

function addSummaryTextRow(ws: Worksheet, label: string, numCols: number): void {
	const row = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(row.number, 1, row.number, 2);
	ws.mergeCells(row.number, 3, row.number, 7);

	const labelCell = row.getCell(1);
	labelCell.value = label;
	labelCell.font = { bold: true, size: 10 };
	labelCell.fill = solidFill('FFF0F0F0');
	labelCell.alignment = { vertical: 'top', indent: 1 };
	labelCell.border = allBorders();

	const valueCell = row.getCell(3);
	valueCell.value = 'Please fill in summary';
	valueCell.font = { italic: true, size: 10, color: { argb: 'FFAAAAAA' } };
	valueCell.fill = solidFill('FFFFFFFF');
	valueCell.alignment = { vertical: 'top', wrapText: true, indent: 1 };
	valueCell.border = allBorders();
	row.height = 60;
}

function addSummarySection(ws: Worksheet, numCols: number, hypothesisIds: string[]): SynthesisRows {
	ws.addRow([]);

	const headerRow = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(headerRow.number, 1, headerRow.number, numCols);
	const headerCell = headerRow.getCell(1);
	headerCell.value = 'SYNTHESIS & CONCLUSION';
	headerCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
	headerCell.fill = solidFill('FF404040');
	headerCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
	headerRow.height = 22;

	ws.addRow([]);

	const hypCsv = hypothesisIds.length > 0 ? hypothesisIds.join(',') : 'H1,H2,H3,H4,H5';

	addSummaryRow(ws, 'Primary Hypothesis', hypCsv, numCols);
	const primaryHypRow = ws.lastRow?.number ?? 0;
	addSummaryRow(ws, 'Secondary Hypothesis (if any)', hypCsv, numCols, true);
	const secondaryHypRow = ws.lastRow?.number ?? 0;
	addSummaryRow(ws, 'Plausibility Judgement', 'Very likely,Likely,Plausible,Unlikely,Very unlikely', numCols);
	const plausibilityRow = ws.lastRow?.number ?? 0;
	addSummaryTextRow(ws, 'Summary', numCols);
	const summaryRow = ws.lastRow?.number ?? 0;
	addSummaryRow(ws, 'Triangulation Strength', 'Strong,Moderate,Weak', numCols);
	const triangulationRow = ws.lastRow?.number ?? 0;
	addSummaryRow(ws, 'Chosen Conclusion', 'C1: Strong Interaction,C2: Limited or indirect Interaction,C3: No interaction,Inconclusive,Unassessed', numCols);
	const conclusionRow = ws.lastRow?.number ?? 0;

	return { primaryHypRow, secondaryHypRow, plausibilityRow, summaryRow, triangulationRow, conclusionRow };
}

/* --------------------- Landing / summary page --------------------- */

const LANDING_COL_WIDTHS = [30, 22, 22, 32, 42, 22, 28, 44];

function addLandingPage(ws: Worksheet, uoaRow: Record<string, any>, sheetMeta: SheetMeta[]): void {
	const uoaId = String(uoaRow['uoa'] ?? 'unknown');

	LANDING_COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

	const titleRow = ws.addRow(new Array(8).fill(''));
	ws.mergeCells(titleRow.number, 1, titleRow.number, 8);
	const titleCell = titleRow.getCell(1);
	titleCell.value = `UOA Summary  —  ${uoaId}`;
	titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
	titleCell.fill = solidFill('FF1F4E79');
	titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
	titleRow.height = 26;

	const secRow = ws.addRow(new Array(8).fill(''));
	ws.mergeCells(secRow.number, 1, secRow.number, 8);
	const secCell = secRow.getCell(1);
	secCell.value = 'Systems and outcomes';
	secCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
	secCell.fill = solidFill('FF7030A0');
	secCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
	secRow.height = 20;

	const colHeaders = [
		'System',
		'Chosen Most Likely Hypothesis',
		'Chosen Secondary Hypothesis (if any)',
		'Conclusion',
		'Conclusion summary',
		'Plausibility judgement',
		'Strength of evidence triangulation',
		'Flagged Factors'
	];
	const colHeaderRow = ws.addRow(colHeaders);
	colHeaderRow.eachCell((cell: Cell) => {
		cell.font = { bold: true, size: 10 };
		cell.fill = solidFill('FFF2F2F2');
		cell.border = allBorders('FFAAAAAA');
		cell.alignment = { vertical: 'middle', wrapText: true };
	});
	colHeaderRow.height = 30;

	for (const { sheetName, system, synthesisRows } of sheetMeta) {
		const factors = Array.isArray(system.factors) ? system.factors : [];
		if (factors.length === 0) continue;

		const safeRef = `'${sheetName.replace(/'/g, "''")}'`;
		const startDataRow = ws.rowCount + 1;

		for (const factor of factors) {
			const factorPath = `${system.id}.${factor.id}`;
			const flagN = Number(uoaRow[`${factorPath}.flag_n`] ?? 0);
			const noFlagN = Number(uoaRow[`${factorPath}.no_flag_n`] ?? 0);
			const missingN = Number(uoaRow[`${factorPath}.missing_n`] ?? 0);
			const total = flagN + noFlagN + missingN;
			const status = flagN > 0 ? 'Flag' : total > 0 ? 'No Flag' : 'No data';
			const factorText = `${factor.label ?? factor.id}  [${status}  ↑${flagN} ✓${noFlagN} ?${missingN}]`;

			const row = ws.addRow(new Array(8).fill(''));
			const factorCell = row.getCell(8);
			factorCell.value = factorText;
			factorCell.font = { size: 10, color: { argb: flagN > 0 ? 'FFCC0000' : 'FF006400' } };
			factorCell.fill = solidFill('FFFAFAFA');
			factorCell.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
			factorCell.border = allBorders();
			row.height = 18;
		}

		const endDataRow = ws.rowCount;

		if (factors.length > 1) ws.mergeCells(startDataRow, 1, endDataRow, 1);
		const sysCell = ws.getCell(startDataRow, 1);
		sysCell.value = system.label ?? system.id;
		sysCell.font = { bold: true, size: 11, color: { argb: sysTextArgb(system.id) } };
		sysCell.fill = solidFill(sysArgb(system.id));
		sysCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
		sysCell.border = allBorders();

		const formulaMap: Array<{ col: number; refRow: number }> = [
			{ col: 2, refRow: synthesisRows.primaryHypRow },
			{ col: 3, refRow: synthesisRows.secondaryHypRow },
			{ col: 4, refRow: synthesisRows.conclusionRow },
			{ col: 5, refRow: synthesisRows.summaryRow },
			{ col: 6, refRow: synthesisRows.plausibilityRow },
			{ col: 7, refRow: synthesisRows.triangulationRow }
		];

		for (const { col, refRow } of formulaMap) {
			if (factors.length > 1) ws.mergeCells(startDataRow, col, endDataRow, col);
			const cell = ws.getCell(startDataRow, col);
			cell.value = { formula: `=${safeRef}!C${refRow}` };
			cell.fill = solidFill(sysArgbLight(system.id, 0.25));
			cell.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
			cell.border = allBorders();
		}
	}

	// Outcome block — per-UoA final classification
	ws.addRow([]);

	const outcomeHeaderRow = ws.addRow(new Array(8).fill(''));
	ws.mergeCells(outcomeHeaderRow.number, 1, outcomeHeaderRow.number, 8);
	const outcomeHeaderCell = outcomeHeaderRow.getCell(1);
	outcomeHeaderCell.value = 'ANALYSIS OUTCOME';
	outcomeHeaderCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
	outcomeHeaderCell.fill = solidFill('FF1F4E79');
	outcomeHeaderCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
	outcomeHeaderRow.height = 20;

	const addOutcomeRow = (label: string, value: string, editable: boolean) => {
		const r = ws.addRow([label, editable ? '' : value]);
		const labelCell = r.getCell(1);
		labelCell.font = { bold: true, size: 10 };
		labelCell.fill = solidFill('FFF2F2F2');
		labelCell.alignment = { vertical: 'middle', indent: 1 };
		labelCell.border = allBorders();
		const valueCell = r.getCell(2);
		if (editable) {
			valueCell.dataValidation = {
				type: 'list',
				allowBlank: true,
				formulae: ['"EM,ROEM,ACUTE,ACUTE_NEEDS,INSUFFICIENT_EVIDENCE,NO_DATA"'],
				showErrorMessage: false
			};
		} else {
			valueCell.font = { size: 10, color: { argb: 'FF555555' } };
		}
		valueCell.fill = solidFill(editable ? 'FFFFFFFF' : 'FFF8F8F8');
		valueCell.alignment = { vertical: 'middle', indent: 1 };
		valueCell.border = allBorders();
		r.height = 20;
	};

	addOutcomeRow('Prelim flag', String(uoaRow['prelim_flag'] ?? ''), false);
	addOutcomeRow('Final flag', '', true);
}

/* --------------------- Main exports --------------------- */

/**
 * Build a deep-dive Excel workbook for a single unit of analysis.
 * Returns the raw buffer — does not trigger a browser download.
 */
export async function buildDeepDiveBuffer(
	uoaRow: Record<string, any>,
	referenceJson: Record<string, any>,
	hypothesesData: HypothesesData
): Promise<Uint8Array> {
	const uoaId = uoaRow['uoa'] ?? 'unknown';
	const workbook = new ExcelJS.Workbook();
	workbook.creator = 'ANA App';
	workbook.created = new Date();

	const hypsMap = new Map<string, SystemHypotheses>(
		(hypothesesData ?? []).map((s) => [s.systemId, s])
	);
	const includedSystemIds = new Set(hypsMap.keys());
	const landingWs = workbook.addWorksheet('Summary');
	const sheetMeta: SheetMeta[] = [];

	for (const system of referenceJson.systems ?? []) {
		if (!system || !Array.isArray(system.factors)) continue;
		if (!includedSystemIds.has(system.id)) continue;

		const sysHyps = hypsMap.get(system.id)!;
		const hypIds = sysHyps.hypotheses.map((h) => h.id);
		const numCols = colCount(hypIds.length);
		const widths = colWidths(hypIds.length);
		const headers = tableHeaders(hypIds);

		const rawName = String(system.label ?? system.id);
		const sheetName = rawName.slice(0, 31).replace(/[\\/*?:[\]]/g, '_');
		const ws = workbook.addWorksheet(sheetName);

		ws.properties.tabColor = { argb: sysArgb(system.id) };
		widths.forEach((w: number, i: number) => { ws.getColumn(i + 1).width = w; });

		addSystemHeader(ws, rawName, uoaId, numCols, system.id);
		addHypothesisTable(ws, sysHyps, numCols, system.id);
		ws.addRow([]);

		for (const factor of system.factors) {
			if (!factor) continue;
			const factorPath = `${system.id}.${factor.id}`;
			addFactorRow(
				ws,
				factor.label ?? factor.id,
				Number(uoaRow[`${factorPath}.flag_n`] ?? 0),
				Number(uoaRow[`${factorPath}.no_flag_n`] ?? 0),
				Number(uoaRow[`${factorPath}.missing_n`] ?? 0),
				numCols,
				system.id
			);

			for (const sub of (Array.isArray(factor.sub_factors) ? factor.sub_factors : [])) {
				if (!sub || !Array.isArray(sub.indicators) || sub.indicators.length === 0) continue;
				const subPath = `${system.id}.${factor.id}.${sub.id}`;
				addSubfactorRow(
					ws,
					sub.label ?? sub.id,
					Number(uoaRow[`${subPath}.flag_n`] ?? 0),
					Number(uoaRow[`${subPath}.no_flag_n`] ?? 0),
					Number(uoaRow[`${subPath}.missing_n`] ?? 0),
					numCols,
					system.id
				);
				addTableHeaderRow(ws, headers);

				for (const ind of sub.indicators) {
						if (!ind || !Array.isArray(ind.metrics)) continue;
						for (const met of ind.metrics) {
							if (!met || !met.metric) continue;
							addIndicatorRow(ws, {
								id: met.metric,
								label: ind.label ?? null,
								metric: met.label ?? null,
								value: uoaRow[met.metric] ?? null,
								flagLabelStr: String(uoaRow[`${met.metric}_status`] ?? 'no_data'),
								an: met.thresholds?.an ?? null,
								direction: met.above_or_below ?? null
							}, hypIds.length);
						}				}

				ws.addRow([]);
			}

			ws.addRow([]);
		}

		const synthesisRows = addSummarySection(ws, numCols, hypIds);
		sheetMeta.push({ sheetName, system, synthesisRows });
	}

	addLandingPage(landingWs, uoaRow, sheetMeta);
	return new Uint8Array(await workbook.xlsx.writeBuffer());
}