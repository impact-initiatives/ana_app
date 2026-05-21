import ExcelJS from '@protobi/exceljs';
import type { Worksheet, Cell, Fill, Border, Borders, DataValidation } from '@protobi/exceljs';
import { colCount, colWidths, tableHeaders } from '$lib/types/deepdives.js';
import type { HypothesesBlock, HypothesesData } from '$lib/types/hypotheses';
import { SystemIDs } from '$lib/types/structure';

/**
 * Deep Dive Excel export — one file per unit of analysis.
 *
 * Workbook layout:
 *   - 4 grouped analytical tabs: Exposure, Outcome, Mitigating services, RoEM
 *   - Each tab: legend → optional tab-level hypothesis block → per-system sections
 *   - Per-system section: header → hypothesis table → indicator table → synthesis
 *   - Summary worksheet with VLOOKUP links back to synthesis rows
 */

/* --------------------- Tab groupings --------------------- */

type TabGroup = {
	tabLabel: string;
	colorHex?: string;
	hypothesesBlockId?: string;
	systemIds: string[];
};

const TAB_GROUPS: TabGroup[] = [
	{ tabLabel: 'Exposure', systemIds: ['food_system', 'water_system', 'living_conditions'] },
	{ tabLabel: 'Outcome', systemIds: ['health_outcomes'] },
	{
		tabLabel: 'Mitigating services',
		hypothesesBlockId: 'mitigating_services',
		systemIds: ['health_nutrition_services']
	},
	{ tabLabel: 'RoEM', hypothesesBlockId: 'roem', systemIds: ['mortality'] }
];

/* --------------------- Types --------------------- */

type SheetMeta = {
	tabLabel: string;
	tabArgb: string;
	entries: Array<{ system: Record<string, any> }>;
};

type IndicatorRowParams = {
	id: string;
	factorSubfactor: string | null;
	evidenceType: string | null;
	metric: string | null;
	value: number | null;
	flagLabelStr: string;
	an: number | null;
	van: string | null;
};

/* --------------------- Colour helpers --------------------- */

function hexToArgb(hex: string): string {
	return 'FF' + hex.replace('#', '').toUpperCase().padStart(6, '0');
}

function mixWithWhite(hex: string, weight: number): string {
	const clean = hex.replace('#', '');
	const parse = (s: string) => parseInt(s, 16);
	const r = Math.round(255 + (parse(clean.slice(0, 2)) - 255) * weight);
	const g = Math.round(255 + (parse(clean.slice(2, 4)) - 255) * weight);
	const b = Math.round(255 + (parse(clean.slice(4, 6)) - 255) * weight);
	const toHex = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
	return '#' + toHex(r) + toHex(g) + toHex(b);
}

function luminance(hex: string): number {
	const clean = hex.replace('#', '');
	const r = parseInt(clean.slice(0, 2), 16) / 255;
	const g = parseInt(clean.slice(2, 4), 16) / 255;
	const b = parseInt(clean.slice(4, 6), 16) / 255;
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

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

function sysTextArgb(systemId: string): string {
	return luminance(sysHex(systemId)) > 0.45 ? 'FF000000' : 'FFFFFFFF';
}

function blockHex(block: HypothesesBlock): string {
	if (SystemIDs.includes(block.hypothesesId as (typeof SystemIDs)[number])) {
		return sysHex(block.hypothesesId);
	}
	return block.colorHex ?? '#718096';
}

function blockArgb(block: HypothesesBlock): string {
	return hexToArgb(blockHex(block));
}

function blockArgbMid(block: HypothesesBlock, weight = 0.45): string {
	return hexToArgb(mixWithWhite(blockHex(block), weight));
}

function blockTextArgb(block: HypothesesBlock): string {
	return luminance(blockHex(block)) > 0.45 ? 'FF000000' : 'FFFFFFFF';
}

function tabColorArgb(tabGroup: TabGroup, hypsMap: Map<string, HypothesesBlock>): string {
	if (tabGroup.colorHex) return hexToArgb(tabGroup.colorHex);
	if (tabGroup.hypothesesBlockId) {
		const block = hypsMap.get(tabGroup.hypothesesBlockId);
		if (block) return blockArgb(block);
	}
	const firstSysId = tabGroup.systemIds[0];
	if (firstSysId) return sysArgb(firstSysId);
	return hexToArgb('#718096');
}

const PRIORITY_FLAG_ARGB: Record<string, string> = {
	em: 'FFFF0000',
	ho_primary: 'FFFF6600',
	ho_secondary: 'FFFFC000',
	an_primary: 'FFFFFF00',
	an_secondary: 'FF92D050',
	insufficient: 'FFD3D3D3',
	no_data: 'FFD3D3D3',
	no_acute: 'FF92D050'
};

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

/* --------------------- Row builders --------------------- */

function addSystemHeader(
	ws: Worksheet,
	systemLabel: string,
	uoaId: string,
	numCols: number,
	systemId: string
): void {
	const row = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(row.number, 1, row.number, numCols);
	const cell = row.getCell(1);
	cell.value = `${systemLabel}  —  UOA: ${uoaId}  —  Analysis timeframe: month-month`;
	cell.font = { bold: true, size: 14, color: { argb: sysTextArgb(systemId) } };
	cell.fill = solidFill(sysArgb(systemId));
	cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
	row.height = 26;
}

function addTabSectionHeader(
	ws: Worksheet,
	tabLabel: string,
	uoaId: string,
	numCols: number,
	tabArgb: string
): void {
	const row = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(row.number, 1, row.number, numCols);
	const cell = row.getCell(1);
	cell.value = `${tabLabel}:  UOA: ${uoaId}  —  Analysis timeframe: month-month`;
	cell.font = { bold: true, size: 14, color: { argb: luminance(blockHexFromArgb(tabArgb)) > 0.45 ? 'FF000000' : 'FFFFFFFF' } };
	cell.fill = solidFill(tabArgb);
	cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
	row.height = 26;
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

function addIndicatorRow(
	ws: Worksheet,
	{ factorSubfactor, evidenceType, id, metric, value, flagLabelStr, an, van }: IndicatorRowParams,
	hypothesesCount: number
): void {
	const rowValues = [
		factorSubfactor ?? '',
		evidenceType ?? '',
		id,
		metric ?? '',
		value == null ? '' : value,
		flagDisplayText(flagLabelStr),
		an == null ? '' : an,
		van == null ? '' : van,
		...Array(hypothesesCount).fill(''),
		'' // Comments column — merged separately after all rows
	];

	const row = ws.addRow(rowValues);
	const isFlagged = flagLabelStr === 'flag';

	row.eachCell((cell: Cell, colNum: number) => {
		cell.font = { size: 10 };
		cell.border = allBorders('FFDDDDDD');
		cell.alignment = { vertical: 'middle' };
		if (isFlagged && colNum <= 8) cell.fill = solidFill('FFFFF0F0');
	});

	const flagCell = row.getCell(6);
	flagCell.font = { color: { argb: flagArgb(flagLabelStr) }, bold: isFlagged };

	// Evidence type dropdown (col 3)
	row.getCell(3).dataValidation = {
		type: 'list',
		allowBlank: true,
		formulae: ['"AN signal,Outcome,Predictor,Supporting evidence"'],
		showErrorMessage: false
	} as DataValidation;

	if (hypothesesCount > 0) {
		const hypothesisValidation: DataValidation = {
			type: 'list',
			allowBlank: true,
			formulae: ['"++,+,+/-,-,--"'],
			showErrorMessage: false
		};
		for (let col = 9; col <= 8 + hypothesesCount; col++) {
			row.getCell(col).dataValidation = hypothesisValidation;
		}
	}

	row.height = 15;
}

function addQualitativeEvidenceRows(
	ws: Worksheet,
	hypothesesCount: number,
	numCols: number
): void {
	for (let i = 0; i < 3; i++) {
		const row = ws.addRow(new Array(numCols).fill(''));
		const factorCell = row.getCell(2);
		factorCell.value = 'qualitative evidence';
		factorCell.font = { italic: true, size: 10, color: { argb: 'FFAAAAAA' } };

		if (hypothesesCount > 0) {
			const hypValidation: DataValidation = {
				type: 'list',
				allowBlank: true,
				formulae: ['"++,+,+/-,-,--"'],
				showErrorMessage: false
			};
			for (let col = 9; col <= 8 + hypothesesCount; col++) {
				row.getCell(col).dataValidation = hypValidation;
			}
		}

		row.eachCell((cell: Cell, colNum: number) => {
			cell.border = allBorders('FFDDDDDD');
			cell.alignment = { vertical: 'middle' };
			// Comments column will be merged separately
		});
		row.height = 15;
	}
}

function addPlausibilityJudgementRow(
	ws: Worksheet,
	_hypothesesCount: number,
	numCols: number
): void {
	const row = ws.addRow(new Array(numCols).fill(''));
	const commentCol = numCols;

	const labelCell = row.getCell(1);
	labelCell.value = 'Plausibility judgement';
	labelCell.font = { bold: true, size: 10 };
	labelCell.fill = solidFill('FFF0F0F0');
	labelCell.border = allBorders();
	labelCell.alignment = { vertical: 'middle', indent: 1 };

	// Merge cols 2 through last hypothesis col (exclude Comments col)
	if (numCols > 2) {
		ws.mergeCells(row.number, 2, row.number, commentCol - 1);
	}
	const plausCell = row.getCell(2);
	plausCell.fill = solidFill('FFE8F5E9');
	plausCell.border = allBorders();
	plausCell.alignment = { vertical: 'middle', indent: 1 };
	plausCell.dataValidation = {
		type: 'list',
		allowBlank: true,
		formulae: ['"Very likely,Likely,Plausible,Unlikely,Very unlikely"'],
		showErrorMessage: false
	} as DataValidation;

	row.height = 20;
}

/* --------------------- Legend section --------------------- */

function addLegendSection(
	ws: Worksheet,
	tabLabel: string,
	tabArgb: string,
	numCols: number
): void {
	const headerRow = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(headerRow.number, 1, headerRow.number, numCols);
	const headerCell = headerRow.getCell(1);
	headerCell.value = tabLabel.toUpperCase();
	headerCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
	headerCell.fill = solidFill(tabArgb);
	headerCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
	headerRow.height = 22;

	const colorEntries = [
		{ argb: 'ffffffcc', label: 'Critical evidence' },
		{ argb: 'ffdaeef3', label: 'Evidence relates to specific sub-group only' },
		{ argb: 'ffe4dfec', label: 'Coping/mitigation' }
	];
	for (const { argb, label } of colorEntries) {
		const row = ws.addRow(new Array(numCols).fill(''));
		if (numCols > 1) ws.mergeCells(row.number, 2, row.number, numCols);
		const colorCell = row.getCell(1);
		colorCell.fill = solidFill(argb);
		colorCell.border = allBorders();
		const labelCell = row.getCell(2);
		labelCell.value = label;
		labelCell.font = { size: 10 };
		labelCell.alignment = { vertical: 'middle', indent: 1 };
		row.height = 14;
	}

	const textEntries = [
		{ symbol: '++', desc: 'very consistent' },
		{ symbol: '+', desc: 'consistent' },
		{ symbol: '-', desc: 'inconsistent' },
		{ symbol: '--', desc: 'very inconsistent' },
		{ symbol: '+/-', desc: 'irrelevant/insensitive to hypothesis/neutral' }
	];
	for (const { symbol, desc } of textEntries) {
		const row = ws.addRow(new Array(numCols).fill(''));
		if (numCols > 1) ws.mergeCells(row.number, 2, row.number, numCols);
		const symbolCell = row.getCell(1);
		symbolCell.value = symbol;
		symbolCell.font = { bold: true, size: 10 };
		symbolCell.alignment = { vertical: 'middle', horizontal: 'center' };
		const descCell = row.getCell(2);
		descCell.value = desc;
		descCell.font = { size: 10 };
		descCell.alignment = { vertical: 'middle', indent: 1 };
		row.height = 14;
	}

	ws.addRow([]);
}

/* --------------------- Mortality pathways section (RoEM tab only) --------------------- */

function addMortalityPathwaysSection(
	ws: Worksheet,
	uoaId: string,
	numCols: number
): void {
	const headerRow = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(headerRow.number, 1, headerRow.number, numCols);
	const headerCell = headerRow.getCell(1);
	headerCell.value = `Plausible mortality pathways in ${uoaId} (select main one(s))`;
	headerCell.font = { bold: true, size: 11 };
	headerCell.fill = solidFill('FFD9D9D9');
	headerCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
	headerRow.height = 20;

	const exampleRow = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(exampleRow.number, 1, exampleRow.number, numCols);
	const exampleCell = exampleRow.getCell(1);
	exampleCell.value =
		'e.g. Pathway B (malnutrition–disease) please add brief justification';
	exampleCell.font = { italic: true, size: 10, color: { argb: 'FFAAAAAA' } };
	exampleCell.alignment = { vertical: 'middle', indent: 1 };
	exampleRow.height = 18;

	const editRow = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(editRow.number, 1, editRow.number, numCols);
	editRow.eachCell((cell: Cell) => { cell.border = allBorders(); });
	editRow.height = 20;

	ws.addRow([]);
	ws.addRow([]);
}

/* --------------------- Hypothesis reference table --------------------- */

function addHypothesisTable(
	ws: Worksheet,
	block: HypothesesBlock,
	numCols: number
): void {
	if (!block.hypotheses.length) return;

	const headerRow = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(headerRow.number, 1, headerRow.number, 4);
	const headerCell = headerRow.getCell(1);
	headerCell.value = `Hypotheses for assessing ${block.hypothesesLabel}`;
	headerCell.font = { bold: true, size: 11, color: { argb: blockTextArgb(block) } };
	headerCell.fill = solidFill(blockArgbMid(block, 0.7));
	headerCell.alignment = { vertical: 'middle', horizontal: 'center', indent: 1 };
	headerCell.border = allBorders('FFCCCCCC');
	headerRow.height = 20;

	for (const hyp of block.hypotheses) {
		const row = ws.addRow(new Array(numCols).fill(''));
		ws.mergeCells(row.number, 2, row.number, 4);

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

/* --------------------- Synthesis / conclusion section --------------------- */

function addSynthesisRow(
	ws: Worksheet,
	compositeLabel: string,
	csvValues: string | null,
	numCols: number,
	allowBlank = false
): void {
	const row = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(row.number, 3, row.number, 4);

	const labelCell = row.getCell(1);
	labelCell.value = compositeLabel;
	labelCell.font = { bold: true, size: 10 };
	labelCell.fill = solidFill('FFF0F0F0');
	labelCell.alignment = { vertical: 'middle', indent: 1 };
	labelCell.border = allBorders();

	const valueCell = row.getCell(3);
	valueCell.fill = solidFill('FFFFFFFF');
	valueCell.alignment = { vertical: 'middle', indent: 1 };
	valueCell.border = allBorders();
	if (csvValues) {
		valueCell.dataValidation = {
			type: 'list',
			allowBlank,
			formulae: [`"${csvValues}"`],
			showErrorMessage: false
		} as DataValidation;
	}
	row.height = 20;
}

function addSynthesisTextRow(
	ws: Worksheet,
	compositeLabel: string,
	numCols: number
): void {
	const row = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(row.number, 3, row.number, 4);

	const labelCell = row.getCell(1);
	labelCell.value = compositeLabel;
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

function addSummarySection(ws: Worksheet, systemLabel: string, numCols: number): void {
	ws.addRow([]);

	const headerRow = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(headerRow.number, 1, headerRow.number, numCols);
	const headerCell = headerRow.getCell(1);
	headerCell.value = 'Conclusion:';
	headerCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
	headerCell.fill = solidFill('FF404040');
	headerCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
	headerRow.height = 22;

	ws.addRow([]);

	const p = systemLabel;
	addSynthesisRow(ws, `${p} — Primary H`, 'H1,H2,H3,Inconclusive', numCols);
	addSynthesisRow(ws, `${p} — Secondary H`, 'H1,H2,H3,Inconclusive', numCols, true);
	addSynthesisRow(
		ws,
		`${p} — Plausibility`,
		'Very likely,Likely,Plausible,Unlikely,Very unlikely,Inconclusive',
		numCols
	);
	addSynthesisTextRow(ws, `${p} — Summary`, numCols);
	addSynthesisRow(ws, `${p} — Triangulation Strength`, 'Strong,Moderate,Weak', numCols);
	addSynthesisRow(
		ws,
		`${p} — Final conclusion`,
		'EM,RoEM,Acute Needs,No Acute Needs,Insufficient evidence,No data',
		numCols
	);
}

/* --------------------- Landing / summary page --------------------- */

const SUMMARY_COL_WIDTHS = [42, 22, 22, 36, 24, 30];
const SUMMARY_COL_COUNT = 6;

function addLandingPage(
	ws: Worksheet,
	uoaRow: Record<string, any>,
	sheetMeta: SheetMeta[]
): void {
	const uoaId = String(uoaRow['uoa'] ?? 'unknown');
	const n = SUMMARY_COL_COUNT;

	SUMMARY_COL_WIDTHS.forEach((w, i) => {
		ws.getColumn(i + 1).width = w;
	});

	// Title
	const titleRow = ws.addRow(new Array(n).fill(''));
	ws.mergeCells(titleRow.number, 1, titleRow.number, n);
	const titleCell = titleRow.getCell(1);
	titleCell.value = `UOA Summary  —  ${uoaId}`;
	titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
	titleCell.fill = solidFill('FF1F4E79');
	titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
	titleRow.height = 26;

	// Column headers
	const colHeaders = [
		'System',
		'Chosen Primary Hypothesis',
		'Chosen Secondary Hypothesis (if any)',
		'Conclusion summary',
		'Plausibility judgement',
		'Strength of evidence triangulation'
	];
	const colHeaderRow = ws.addRow(colHeaders);
	colHeaderRow.eachCell((cell: Cell) => {
		cell.font = { bold: true, size: 10 };
		cell.fill = solidFill('FFF2F2F2');
		cell.border = allBorders('FFAAAAAA');
		cell.alignment = { vertical: 'middle', wrapText: true };
	});
	colHeaderRow.height = 30;

	// System rows grouped by tab
	for (const { tabLabel, tabArgb, entries } of sheetMeta) {
		// Tab header row
		const tabRow = ws.addRow(new Array(n).fill(''));
		ws.mergeCells(tabRow.number, 1, tabRow.number, n);
		const tabCell = tabRow.getCell(1);
		tabCell.value = tabLabel;
		tabCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
		tabCell.fill = solidFill(tabArgb);
		tabCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
		tabCell.border = allBorders();
		tabRow.height = 20;

		for (const { system } of entries) {
			const systemLabel = String(system.label ?? system.id);
			const safeTab = tabLabel.replace(/'/g, "''");
			const safeLabel = systemLabel.replace(/"/g, '""');

			const sysRow = ws.addRow(new Array(n).fill(''));

			const sysCell = sysRow.getCell(1);
			sysCell.value = `${tabLabel} - ${systemLabel}`;
			sysCell.font = { bold: true, size: 10 };
			sysCell.fill = solidFill(hexToArgb(mixWithWhite(blockHexFromArgb(tabArgb), 0.25)));
			sysCell.alignment = { vertical: 'middle', indent: 1 };
			sysCell.border = allBorders();

			const synthFields: Array<{ col: number; key: string }> = [
				{ col: 2, key: 'Primary H' },
				{ col: 3, key: 'Secondary H' },
				{ col: 4, key: 'Summary' },
				{ col: 5, key: 'Plausibility' },
				{ col: 6, key: 'Triangulation Strength' }
			];

			for (const { col, key } of synthFields) {
				const cell = sysRow.getCell(col);
				cell.value = {
					formula: `=IFERROR(VLOOKUP("${safeLabel} — ${key}",'${safeTab}'!$A:$C,3,0),"")`
				};
				cell.fill = solidFill('FFFFFFFF');
				cell.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
				cell.border = allBorders();
			}

			sysRow.height = 22;
		}
	}

	// ANALYSIS OUTCOME
	ws.addRow([]);

	const outcomeHeaderRow = ws.addRow(new Array(n).fill(''));
	ws.mergeCells(outcomeHeaderRow.number, 1, outcomeHeaderRow.number, n);
	const outcomeHeaderCell = outcomeHeaderRow.getCell(1);
	outcomeHeaderCell.value = 'ANALYSIS OUTCOME';
	outcomeHeaderCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
	outcomeHeaderCell.fill = solidFill('FF1F4E79');
	outcomeHeaderCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
	outcomeHeaderRow.height = 20;

	const priorityFlag = String(uoaRow['priority_flag'] ?? '');
	const flagFillArgb = PRIORITY_FLAG_ARGB[priorityFlag] ?? 'FFD3D3D3';

	const flagRow = ws.addRow(new Array(n).fill(''));
	ws.mergeCells(flagRow.number, 1, flagRow.number, 2);
	ws.mergeCells(flagRow.number, 3, flagRow.number, n);
	const flagLabelCell = flagRow.getCell(1);
	flagLabelCell.value = 'Priority flag';
	flagLabelCell.font = { bold: true, size: 10 };
	flagLabelCell.fill = solidFill('FFF0F0F0');
	flagLabelCell.alignment = { vertical: 'middle', indent: 1 };
	flagLabelCell.border = allBorders();
	const flagValueCell = flagRow.getCell(3);
	flagValueCell.value = priorityFlag;
	flagValueCell.fill = solidFill(flagFillArgb);
	flagValueCell.alignment = { vertical: 'middle', indent: 1 };
	flagValueCell.border = allBorders();
	flagRow.height = 20;

	const conclusionRow = ws.addRow(new Array(n).fill(''));
	ws.mergeCells(conclusionRow.number, 1, conclusionRow.number, 2);
	ws.mergeCells(conclusionRow.number, 3, conclusionRow.number, n);
	const conclusionLabelCell = conclusionRow.getCell(1);
	conclusionLabelCell.value = 'Conclusion';
	conclusionLabelCell.font = { bold: true, size: 10 };
	conclusionLabelCell.fill = solidFill('FFF0F0F0');
	conclusionLabelCell.alignment = { vertical: 'middle', indent: 1 };
	conclusionLabelCell.border = allBorders();
	const conclusionValueCell = conclusionRow.getCell(3);
	conclusionValueCell.fill = solidFill('FFFFFFFF');
	conclusionValueCell.alignment = { vertical: 'middle', indent: 1 };
	conclusionValueCell.border = allBorders();
	conclusionValueCell.dataValidation = {
		type: 'list',
		allowBlank: true,
		formulae: ['"EM,RoEM,Acute Needs,No Acute Needs,Insufficient evidence,No data"'],
		showErrorMessage: false
	} as DataValidation;
	conclusionRow.height = 20;

	// "UoA is clustered with" section
	ws.addRow([]);

	const clusterHeaderRow = ws.addRow(new Array(n).fill(''));
	ws.mergeCells(clusterHeaderRow.number, 1, clusterHeaderRow.number, n);
	const clusterHeaderCell = clusterHeaderRow.getCell(1);
	clusterHeaderCell.value = 'UoA is clustered with (if relevant):';
	clusterHeaderCell.font = { bold: true, size: 10 };
	clusterHeaderCell.fill = solidFill('FFF0F0F0');
	clusterHeaderCell.alignment = { vertical: 'middle', indent: 1 };
	clusterHeaderCell.border = allBorders();
	clusterHeaderRow.height = 18;

	const uoaLabelRow = ws.addRow(new Array(n).fill(''));
	ws.mergeCells(uoaLabelRow.number, 1, uoaLabelRow.number, n);
	const uoaLabelCell = uoaLabelRow.getCell(1);
	uoaLabelCell.value = uoaId;
	uoaLabelCell.font = { size: 10 };
	uoaLabelCell.alignment = { vertical: 'middle', indent: 1 };
	uoaLabelCell.border = allBorders();
	uoaLabelRow.height = 18;

	for (let i = 0; i < 3; i++) {
		const blankRow = ws.addRow(new Array(n).fill(''));
		blankRow.eachCell((cell: Cell) => {
			cell.border = allBorders();
		});
		blankRow.height = 18;
	}
}

/** Convert an ARGB string back to a #rrggbb hex (strips the FF alpha prefix). */
function blockHexFromArgb(argb: string): string {
	return '#' + argb.slice(2).toLowerCase();
}

/* --------------------- Main export --------------------- */

export async function buildDeepDiveBuffer(
	uoaRow: Record<string, any>,
	referenceJson: Record<string, any>,
	hypothesesData: HypothesesData
): Promise<Uint8Array> {
	const uoaId = String(uoaRow['uoa'] ?? 'unknown');
	const workbook = new ExcelJS.Workbook();
	workbook.creator = 'ANA App';
	workbook.created = new Date();

	const hypsMap = new Map<string, HypothesesBlock>(
		(hypothesesData ?? []).map((s) => [s.hypothesesId, s])
	);
	const systemsById = new Map<string, Record<string, any>>(
		(referenceJson.systems ?? []).filter(Boolean).map((s: Record<string, any>) => [s.id, s])
	);

	const landingWs = workbook.addWorksheet('Summary');
	const sheetMeta: SheetMeta[] = [];

	for (const tabGroup of TAB_GROUPS) {
		const systems = tabGroup.systemIds
			.map((id) => systemsById.get(id))
			.filter(Boolean) as Record<string, any>[];

		if (systems.length === 0) continue;

		const tabArgb = tabColorArgb(tabGroup, hypsMap);

		// Determine numCols from max hypotheses count across systems in this tab
		const maxHypCount = Math.max(
			0,
			...systems.map((sys) => {
				const sysBlock = hypsMap.get(sys.id);
				const tabBlock = tabGroup.hypothesesBlockId
					? hypsMap.get(tabGroup.hypothesesBlockId)
					: undefined;
				const block =
					sysBlock && sysBlock.hypotheses.length > 0 ? sysBlock : tabBlock;
				return block?.hypotheses.length ?? 0;
			})
		);

		const numCols = colCount(maxHypCount);
		const widths = colWidths(maxHypCount);

		const sheetName = tabGroup.tabLabel.slice(0, 31).replace(/[\\/*?:[\]]/g, '_');
		const ws = workbook.addWorksheet(sheetName);
		ws.properties.tabColor = { argb: tabArgb };
		widths.forEach((w: number, i: number) => {
			ws.getColumn(i + 1).width = w;
		});

		addLegendSection(ws, tabGroup.tabLabel, tabArgb, numCols);

		const tabEntries: Array<{ system: Record<string, any> }> = [];

		if (tabGroup.hypothesesBlockId) {
			// ── Unified section (RoEM, Mitigating services) ──
			// One section for the tab using the tab label; per-system headers are suppressed.
			const tabHypBlock = hypsMap.get(tabGroup.hypothesesBlockId);
			const hypIds = tabHypBlock?.hypotheses.map((h) => h.id) ?? [];

			addTabSectionHeader(ws, tabGroup.tabLabel, uoaId, numCols, tabArgb);
			if (tabHypBlock) addHypothesisTable(ws, tabHypBlock, numCols);

			if (systems.some((s) => s.id === 'mortality')) {
				addMortalityPathwaysSection(ws, uoaId, numCols);
			}

			ws.addRow([]);

			addTableHeaderRow(ws, tableHeaders(hypIds));
			const firstDataRow = ws.rowCount + 1;

			for (const system of systems) {
				for (const factor of Array.isArray(system.factors) ? system.factors : []) {
					if (!factor) continue;
					for (const sub of Array.isArray(factor.sub_factors) ? factor.sub_factors : []) {
						if (!sub) continue;
						const factorSubfactor = `${factor.label ?? factor.id} - ${sub.label ?? sub.id}`;
						for (const ind of Array.isArray(sub.indicators) ? sub.indicators : []) {
							if (!ind || !Array.isArray(ind.metrics)) continue;
							for (const met of ind.metrics) {
								if (!met?.metric) continue;
								const metStatus = String(uoaRow[`${met.metric}_status`] ?? 'no_data');
								if (metStatus === 'no_data') continue;
								addIndicatorRow(
									ws,
									{
										factorSubfactor,
										evidenceType: met.evidence_type ?? null,
										id: met.metric,
										metric: met.label ?? null,
										value: uoaRow[met.metric] ?? null,
										flagLabelStr: metStatus,
										an: met.thresholds?.an ?? null,
										van: met.thresholds?.van ?? null
									},
									hypIds.length
								);
							}
						}
					}
				}
			}

			addQualitativeEvidenceRows(ws, hypIds.length, numCols);
			addPlausibilityJudgementRow(ws, hypIds.length, numCols);

			const lastDataRow = ws.rowCount;
			if (lastDataRow >= firstDataRow) {
				ws.mergeCells(firstDataRow, numCols, lastDataRow, numCols);
				const commentCell = ws.getCell(firstDataRow, numCols);
				commentCell.value = 'Please fill comments on interpretation';
				commentCell.font = { italic: true, color: { argb: 'FFAAAAAA' }, size: 10 };
				commentCell.alignment = { vertical: 'top', wrapText: true };
				commentCell.border = allBorders();
			}

			addSummarySection(ws, tabGroup.tabLabel, numCols);
			ws.addRow([]);
			ws.addRow([]);

			// One entry per unified tab — label key = tab label for VLOOKUP
			tabEntries.push({ system: { id: tabGroup.tabLabel, label: tabGroup.tabLabel } });
		} else {
			// ── Per-system sections (Exposure, Outcome) ──
			for (const system of systems) {
				const sysBlock = hypsMap.get(system.id);
				const hypIds = sysBlock?.hypotheses.map((h) => h.id) ?? [];
				const systemLabel = String(system.label ?? system.id);

				addSystemHeader(ws, systemLabel, uoaId, numCols, system.id);

				if (sysBlock && sysBlock.hypotheses.length > 0) {
					addHypothesisTable(ws, sysBlock, numCols);
				}

				ws.addRow([]);

				addTableHeaderRow(ws, tableHeaders(hypIds));
				const firstDataRow = ws.rowCount + 1;

				for (const factor of Array.isArray(system.factors) ? system.factors : []) {
					if (!factor) continue;
					for (const sub of Array.isArray(factor.sub_factors) ? factor.sub_factors : []) {
						if (!sub) continue;
						const factorSubfactor = `${factor.label ?? factor.id} - ${sub.label ?? sub.id}`;
						for (const ind of Array.isArray(sub.indicators) ? sub.indicators : []) {
							if (!ind || !Array.isArray(ind.metrics)) continue;
							for (const met of ind.metrics) {
								if (!met?.metric) continue;
								const metStatus = String(uoaRow[`${met.metric}_status`] ?? 'no_data');
								if (metStatus === 'no_data') continue;
								addIndicatorRow(
									ws,
									{
										id: met.metric,
										factorSubfactor,
										evidenceType: met.evidence_type ?? null,
										metric: met.label ?? null,
										value: uoaRow[met.metric] ?? null,
										flagLabelStr: metStatus,
										an: met.thresholds?.an ?? null,
										van: met.thresholds?.van ?? null
									},
									hypIds.length
								);
							}
						}
					}
				}

				addQualitativeEvidenceRows(ws, hypIds.length, numCols);
				addPlausibilityJudgementRow(ws, hypIds.length, numCols);

				const lastDataRow = ws.rowCount;
				if (lastDataRow >= firstDataRow) {
					ws.mergeCells(firstDataRow, numCols, lastDataRow, numCols);
					const commentCell = ws.getCell(firstDataRow, numCols);
					commentCell.value = 'Please fill comments on interpretation';
					commentCell.font = { italic: true, color: { argb: 'FFAAAAAA' }, size: 10 };
					commentCell.alignment = { vertical: 'top', wrapText: true };
					commentCell.border = allBorders();
				}

				addSummarySection(ws, systemLabel, numCols);
				ws.addRow([]);
				ws.addRow([]);

				tabEntries.push({ system });
			}
		}

		sheetMeta.push({ tabLabel: tabGroup.tabLabel, tabArgb, entries: tabEntries });
	}

	addLandingPage(landingWs, uoaRow, sheetMeta);
	return new Uint8Array(await workbook.xlsx.writeBuffer());
}
