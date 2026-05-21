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
	{ tabLabel: 'Exposure', colorHex: '#c4bd97', systemIds: ['food_system', 'water_system', 'living_conditions'] },
	{ tabLabel: 'Outcome', colorHex: '#948a54', systemIds: ['health_outcomes'] },
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

const SYS_CSS_VAR: Record<string, string> = {
	food_system:               '--color-sys-food-system',
	water_system:              '--color-sys-water-system',
	health_outcomes:           '--color-sys-health-outcomes',
	mortality:                 '--color-sys-mortality',
	living_conditions:         '--color-sys-living-conditions',
	market_functionality:      '--color-sys-market-functionality',
	health_nutrition_services: '--color-sys-health-nutrition-services'
};

function sysHex(systemId: string): string {
	const cssVar = SYS_CSS_VAR[systemId] ?? `--color-sys-${String(systemId).replace(/_/g, '-')}`;
	const val = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
	return val || '#718096';
}

function sysArgb(systemId: string): string {
	return hexToArgb(sysHex(systemId));
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
	em:                    'FF420098',
	ho_primary:            'FF693AD4',
	ho_secondary:          'FF9076F3',
	an_primary:            'FF005B90',
	an_secondary:          'FF87C6F2',
	insufficient_evidence: 'FFFFB667',
	no_data:               'FFFFB667',
	no_acute_needs:        'FF5CE8B3'
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

const FLAG_COLOR_HEX = '#005b90';
const NO_FLAG_COLOR_HEX = '#009698';
const NO_DATA_COLOR_HEX = '#a0a5ab';

function flagTextArgb(flagLabelStr: string): string {
	if (flagLabelStr === 'flag')    return hexToArgb(FLAG_COLOR_HEX);
	if (flagLabelStr === 'no_flag') return hexToArgb(NO_FLAG_COLOR_HEX);
	return hexToArgb(NO_DATA_COLOR_HEX);
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

function addTableHeaderRow(ws: Worksheet, headers: string[], hypothesesCount = 0): void {
	const row = ws.addRow(headers);
	// Merge gutter col (1) with Factor-Sub-factor col (2)
	ws.mergeCells(row.number, 1, row.number, 2);
	row.eachCell((cell: Cell, colNum: number) => {
		cell.font = { bold: true, size: 10 };
		cell.fill = solidFill('FFF2F2F2');
		cell.border = {
			top: thinLine('FFAAAAAA'),
			left: thinLine('FFAAAAAA'),
			bottom: { style: 'medium', color: { argb: 'FF666666' } },
			right: thinLine('FFAAAAAA')
		};
		const isHypCol = hypothesesCount > 0 && colNum >= 10 && colNum <= 9 + hypothesesCount;
		cell.alignment = { vertical: 'middle', horizontal: isHypCol ? 'center' : undefined, wrapText: false };
	});
	row.height = 16;
}

function addIndicatorRow(
	ws: Worksheet,
	{ factorSubfactor, evidenceType, id, metric, value, flagLabelStr, an, van }: IndicatorRowParams,
	hypothesesCount: number
): void {
	// Col 1 = gutter (merged with col 2 = Factor-Sub-factor); all data cols shift +1
	const rowValues = [
		factorSubfactor ?? '', // col 1 — merged cell start (Factor-Sub-factor content)
		'',                    // col 2 — merged into col 1
		evidenceType ?? '',    // col 3 — Evidence type
		id,                    // col 4 — Metric ID
		metric ?? '',          // col 5 — Metric
		value == null ? '' : value, // col 6 — Value
		flagDisplayText(flagLabelStr), // col 7 — Flag
		an == null ? '' : an,  // col 8 — AN Threshold
		van == null ? '' : van, // col 9 — VAN Threshold
		...Array(hypothesesCount).fill(''),
		'' // Comments column
	];

	const row = ws.addRow(rowValues);
	ws.mergeCells(row.number, 1, row.number, 2);
	const isFlagged = flagLabelStr === 'flag';

	row.eachCell((cell: Cell, colNum: number) => {
		cell.font = { size: 10 };
		cell.border = allBorders('FFDDDDDD');
		cell.alignment = { vertical: 'top' };
		if (isFlagged && colNum <= 9) cell.fill = solidFill(hexToArgb(mixWithWhite(FLAG_COLOR_HEX, 0.35)));
	});

	// Wrap long-text cells so row height auto-fits
	const mergedCell = row.getCell(1);
	mergedCell.alignment = { vertical: 'top', wrapText: true };
	row.getCell(5).alignment = { vertical: 'top', wrapText: true };

	const flagCell = row.getCell(7);
	flagCell.font = { bold: isFlagged, size: 10, color: { argb: flagTextArgb(flagLabelStr) } };

	if (hypothesesCount > 0) {
		const hypothesisValidation: DataValidation = {
			type: 'list',
			allowBlank: true,
			formulae: ['"++,+,+/-,-,--"'],
			showErrorMessage: false
		};
		for (let col = 10; col <= 9 + hypothesesCount; col++) {
			const c = row.getCell(col);
			c.numFmt = '@'; // force text — prevents ++ / -- / +/- being evaluated as formulas
			c.dataValidation = hypothesisValidation;
			c.alignment = { vertical: 'top', horizontal: 'center' };
		}
	}

	// Fix 8: per-row comment cell with border (no merged tall cell)
	const commentColIdx = 9 + hypothesesCount + 1;
	const commentCell = row.getCell(commentColIdx);
	commentCell.border = allBorders('FFDDDDDD');
	commentCell.alignment = { vertical: 'top', wrapText: true };
	// No fixed row.height — Excel auto-fits based on wrapped content
}

function addQualitativeEvidenceRows(
	ws: Worksheet,
	hypothesesCount: number,
	numCols: number
): void {
	for (let i = 0; i < 3; i++) {
		const row = ws.addRow(new Array(numCols).fill(''));
		ws.mergeCells(row.number, 1, row.number, 2);
		const factorCell = row.getCell(1); // merged gutter+factor-subfactor cell
		factorCell.value = 'qualitative evidence';
		factorCell.font = { italic: true, size: 10, color: { argb: 'ff6b7075' } };

		if (hypothesesCount > 0) {
			const hypValidation: DataValidation = {
				type: 'list',
				allowBlank: true,
				formulae: ['"++,+,+/-,-,--"'],
				showErrorMessage: false
			};
			for (let col = 10; col <= 9 + hypothesesCount; col++) {
				const c = row.getCell(col);
				c.numFmt = '@';
				c.dataValidation = hypValidation;
				c.alignment = { vertical: 'top', horizontal: 'center' };
			}
		}

		row.eachCell((cell: Cell) => {
			cell.border = allBorders('FFDDDDDD');
			cell.alignment = cell.alignment ?? { vertical: 'top' };
		});

		// Fix 8: per-row comment cell
		const commentColIdx = 9 + hypothesesCount + 1;
		row.getCell(commentColIdx).border = allBorders('FFDDDDDD');
		row.getCell(commentColIdx).alignment = { vertical: 'top', wrapText: true };
		// No fixed row.height — Excel auto-fits
	}
}

function addPlausibilityJudgementRow(
	ws: Worksheet,
	hypothesesCount: number,
	numCols: number,
	hypArgb?: string
): void {
	const row = ws.addRow(new Array(numCols).fill(''));

	// Merge gutter col + label col
	ws.mergeCells(row.number, 1, row.number, 9);
	const labelCell = row.getCell(1);
	labelCell.value = 'Plausibility judgement';
	labelCell.font = { bold: true, size: 10 };
	labelCell.fill = solidFill('fff2f2f2');
	labelCell.border = allBorders();
	labelCell.alignment = { vertical: 'middle', indent: 1 };

	// Tint for hypothesis dropdown cells: 70% white mix of block color, or default light green
	const hypFillArgb = hypArgb
		? hexToArgb(mixWithWhite(blockHexFromArgb(hypArgb), 0.3))
		: 'FFE8F5E9';

	// Each hypothesis col gets its own dropdown (Fix 7)
	const hypValidation: DataValidation = {
		type: 'list',
		allowBlank: true,
		formulae: ['"Very likely,Likely,Plausible,Unlikely,Very unlikely"'],
		showErrorMessage: false
	} as DataValidation;
	for (let col = 10; col <= 9 + hypothesesCount; col++) {
		const c = row.getCell(col);
		c.fill = solidFill(hypFillArgb);
		c.border = allBorders();
		c.alignment = { vertical: 'middle', horizontal: 'center' };
		c.dataValidation = hypValidation;
	}

	// Comment col: border only (Fix 8)
	row.getCell(numCols).border = allBorders();
	row.font = { size: 10 }; // row-level font — applied to analyst-entered dropdown values
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

	// blank spacer
	ws.addRow([]);

	// "Evidence details:" sub-heading
	const evidenceHeaderRow = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(evidenceHeaderRow.number, 1, evidenceHeaderRow.number, numCols);
	const evidenceHeaderCell = evidenceHeaderRow.getCell(1);
	evidenceHeaderCell.value = 'Evidence details:';
	evidenceHeaderCell.font = { bold: true, size: 10 };
	evidenceHeaderCell.alignment = { vertical: 'middle', indent: 1 };
	evidenceHeaderRow.height = 16;

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

	// "Consistency rating:" sub-heading
	const consistencyHeaderRow = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(consistencyHeaderRow.number, 1, consistencyHeaderRow.number, numCols);
	const consistencyHeaderCell = consistencyHeaderRow.getCell(1);
	consistencyHeaderCell.value = 'Consistency rating:';
	consistencyHeaderCell.font = { bold: true, size: 10 };
	consistencyHeaderCell.alignment = { vertical: 'middle', indent: 1 };
	consistencyHeaderRow.height = 16;

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
	exampleCell.font = { italic: true, size: 10, color: { argb: 'ff6b7075' } };
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

	ws.addRow([]);
	
	const headerRow = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(headerRow.number, 1, headerRow.number, 5);
	const headerCell = headerRow.getCell(1);
	headerCell.value = `Hypotheses for assessing ${block.hypothesesLabel}`;
	headerCell.font = { bold: true, size: 11, color: { argb: blockTextArgb(block) } };
	headerCell.fill = solidFill(blockArgbMid(block, 0.7));
	headerCell.alignment = { vertical: 'middle', indent: 1 };
	headerCell.border = allBorders('FFCCCCCC');
	headerRow.height = 20;

	for (const hyp of block.hypotheses) {
		const row = ws.addRow(new Array(numCols).fill(''));
		ws.mergeCells(row.number, 2, row.number, 5);

		const idCell = row.getCell(1);
		idCell.value = hyp.id;
		idCell.font = { bold: true, size: 10, color: { argb: blockTextArgb(block) } };
		idCell.fill = solidFill(blockArgb(block));
		idCell.alignment = { vertical: 'middle', horizontal: 'center' };
		idCell.border = allBorders('FFCCCCCC');

		const descCell = row.getCell(2);
		descCell.value = hyp.description;
		descCell.font = { size: 10 };
		descCell.fill = solidFill('FFFFFFFF');
		descCell.alignment = { vertical: 'top', wrapText: true, indent: 1 };
		descCell.border = allBorders('FFCCCCCC');
		// No fixed row.height — auto-fits to description text
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
	ws.mergeCells(row.number, 1, row.number, 2);
	ws.mergeCells(row.number, 3, row.number, 5);

	const labelCell = row.getCell(1);
	labelCell.value = compositeLabel;
	labelCell.font = { bold: true, size: 10 };
	labelCell.fill = solidFill('FFF0F0F0');
	labelCell.alignment = { vertical: 'middle', indent: 1 };
	labelCell.border = allBorders('FF000000');

	const valueCell = row.getCell(3);
	valueCell.fill = solidFill('FFFFFFFF');
	valueCell.alignment = { vertical: 'middle', indent: 1 };
	valueCell.border = allBorders('FF000000');
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
	// Label spans gutter + label col (1+2); Summary value spans cols 3–5 (one wider)
	ws.mergeCells(row.number, 1, row.number, 2);
	ws.mergeCells(row.number, 3, row.number, 5);

	const labelCell = row.getCell(1);
	labelCell.value = compositeLabel;
	labelCell.font = { bold: true, size: 10 };
	labelCell.fill = solidFill('FFF0F0F0');
	labelCell.alignment = { vertical: 'top', indent: 1 };
	labelCell.border = allBorders('FF000000');

	const valueCell = row.getCell(3);
	valueCell.value = 'Please fill in summary';
	valueCell.font = { italic: true, size: 10, color: { argb: 'ff6b7075' } };
	valueCell.fill = solidFill('FFFFFFFF');
	valueCell.alignment = { vertical: 'top', wrapText: true, indent: 1 };
	valueCell.border = allBorders('FF000000');
	// No fixed row.height — auto-fits to summary text
}

function addSummarySection(ws: Worksheet, systemLabel: string, numCols: number, argb?: string): void {
	ws.addRow([]);

	const tintHex = argb ? mixWithWhite(blockHexFromArgb(argb), 0.7) : '#e0e0e0';
	const tintArgb = hexToArgb(tintHex);
	const titleTextArgb = luminance(tintHex) > 0.45 ? 'FF000000' : 'FFFFFFFF';
	const outerLine: Border = { style: 'medium', color: { argb: 'FF000000' } } as Border;

	const headerRow = ws.addRow(new Array(numCols).fill(''));
	ws.mergeCells(headerRow.number, 1, headerRow.number, 5);
	const headerCell = headerRow.getCell(1);
	headerCell.value = 'Conclusion';
	headerCell.font = { bold: true, size: 12, color: { argb: titleTextArgb } };
	headerCell.fill = solidFill(tintArgb);
	headerCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
	headerCell.border = allBorders('FF000000');
	headerRow.height = 22;

	const p = systemLabel;
	addSynthesisRow(ws, `${p} — Primary Hypothesis`, 'H1,H2,H3,Inconclusive', numCols);
	addSynthesisRow(ws, `${p} — Secondary Hypothesis`, 'H1,H2,H3,Inconclusive', numCols, true);
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
	const lastSynthRow = ws.rowCount;

	// Outer medium black border around the full conclusion table (cols 1–4)
	for (let r = headerRow.number; r <= lastSynthRow; r++) {
		const wsRow = ws.getRow(r);
		for (let c = 1; c <= 5; c++) {
			const cell = wsRow.getCell(c);
			const b: Partial<Borders> = { ...(cell.border as Partial<Borders> ?? {}) };
			if (r === headerRow.number) b.top = outerLine;
			if (r === lastSynthRow)     b.bottom = outerLine;
			if (c === 1)                b.left = outerLine;
			if (c === 5)                b.right = outerLine;
			cell.border = b;
		}
	}
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


	const emptyRowTitle = ws.addRow([]);
	emptyRowTitle.height = 30;

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
	const pfArgb = PRIORITY_FLAG_ARGB[priorityFlag] ?? 'FFD3D3D3';
	const pfTextArgb = ['em', 'ho_primary', 'ho_secondary', 'an_primary'].includes(priorityFlag)
		? 'FFFFFFFF'
		: 'FF000000';

	const flagRow = ws.addRow(new Array(n).fill(''));
	const flagLabelCell = flagRow.getCell(1);
	flagLabelCell.value = 'Priority flag';
	flagLabelCell.font = { bold: true, size: 10 };
	flagLabelCell.fill = solidFill('FFF0F0F0');
	flagLabelCell.alignment = { vertical: 'middle', indent: 1 };
	flagLabelCell.border = allBorders();
	const flagValueCell = flagRow.getCell(2);
	flagValueCell.value = priorityFlag;
	flagValueCell.fill = solidFill(pfArgb);
	flagValueCell.font = { bold: true, size: 10, color: { argb: pfTextArgb } };
	flagValueCell.alignment = { vertical: 'middle', indent: 1 };
	flagValueCell.border = allBorders();
	flagRow.height = 20;

	const conclusionRow = ws.addRow(new Array(n).fill(''));
	const conclusionLabelCell = conclusionRow.getCell(1);
	conclusionLabelCell.value = 'Conclusion';
	conclusionLabelCell.font = { bold: true, size: 10 };
	conclusionLabelCell.fill = solidFill('FFF0F0F0');
	conclusionLabelCell.alignment = { vertical: 'middle', indent: 1 };
	conclusionLabelCell.border = allBorders();
	const conclusionValueCell = conclusionRow.getCell(2);
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
	ws.mergeCells(clusterHeaderRow.number, 1, clusterHeaderRow.number, 2);
	const clusterHeaderCell = clusterHeaderRow.getCell(1);
	clusterHeaderCell.value = 'UoA is clustered with (if relevant):';
	clusterHeaderCell.font = { bold: true, size: 10 };
	clusterHeaderCell.fill = solidFill('FFF0F0F0');
	clusterHeaderCell.alignment = { vertical: 'middle', indent: 1 };
	clusterHeaderCell.border = allBorders();
	clusterHeaderRow.height = 18;

	const uoaLabelRow = ws.addRow(new Array(n).fill(''));
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

/**
 * Apply block-color styling to the hypothesis column group (Fix 13):
 * - Header row: block color fill + luminance-aware text
 * - All rows: medium-weight outer border in block color around the group
 */
function applyHypGroupStyling(
	ws: Worksheet,
	headerRowNum: number,
	lastRowNum: number,
	firstHypCol: number,
	lastHypCol: number,
	hypArgb: string
): void {
	const textArgb = luminance(blockHexFromArgb(hypArgb)) > 0.45 ? 'FF000000' : 'FFFFFFFF';
	const outerLine: Border = { style: 'medium', color: { argb: hypArgb } } as Border;

	for (let r = headerRowNum; r <= lastRowNum; r++) {
		const row = ws.getRow(r);
		for (let c = firstHypCol; c <= lastHypCol; c++) {
			const cell = row.getCell(c);

			if (r === headerRowNum) {
				cell.fill = solidFill(hypArgb);
				cell.font = { bold: true, size: 10, color: { argb: textArgb } };
			}

			const b: Partial<Borders> = { ...(cell.border as Partial<Borders> ?? {}) };
			if (r === headerRowNum) b.top = outerLine;
			if (r === lastRowNum) b.bottom = outerLine;
			if (c === firstHypCol) b.left = outerLine;
			if (c === lastHypCol) b.right = outerLine;
			cell.border = b;
		}
	}
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

			const headerStartRowUnified = ws.rowCount + 1;
			addTableHeaderRow(ws, tableHeaders(hypIds), hypIds.length);

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
			addPlausibilityJudgementRow(ws, hypIds.length, numCols, tabArgb);
			if (hypIds.length > 0) {
				applyHypGroupStyling(ws, headerStartRowUnified, ws.rowCount, 10, 9 + hypIds.length, tabArgb);
			}

			addSummarySection(ws, tabGroup.tabLabel, numCols, tabArgb);
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

				const hypArgbSys = sysArgb(system.id);
				const headerStartRowSys = ws.rowCount + 1;
				addTableHeaderRow(ws, tableHeaders(hypIds), hypIds.length);

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
				addPlausibilityJudgementRow(ws, hypIds.length, numCols, hypArgbSys);
				if (hypIds.length > 0) {
					applyHypGroupStyling(ws, headerStartRowSys, ws.rowCount, 10, 9 + hypIds.length, hypArgbSys);
				}

				addSummarySection(ws, systemLabel, numCols, hypArgbSys);
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
