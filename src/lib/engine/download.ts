import Papa from 'papaparse';
import ExcelJS from '@protobi/exceljs';
import type { HypothesesData } from '$lib/types/deepdives';
import { zipSync } from 'fflate';
import { buildDeepDiveBuffer } from '$lib/engine/deepdive';

type Row = Record<string, any>;

/* --------------------- Download helpers --------------------- */

/** Download data as JSON. */
export function downloadJSON(flaggedData: Row[], filename = 'flagged_data.json'): void {
	const json = JSON.stringify(flaggedData, null, 2);
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

/** Download data as CSV. */
export function downloadCSV(flaggedData: Row[], filename = 'data.csv'): void {
	const csv = Papa.unparse(flaggedData);
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

/** Download data as Excel. Falls back to CSV if XLSX generation fails. */
export async function downloadXLSX(flaggedData: Row[], filename = 'data.xlsx'): Promise<void> {
	const workbook = new ExcelJS.Workbook();
	const worksheet = workbook.addWorksheet('Flagged Data');

	if (!Array.isArray(flaggedData) || flaggedData.length === 0) {
		worksheet.addRow(['No data']);
	} else {
		const headers = Object.keys(flaggedData[0]);
		worksheet.columns = headers.map((h) => ({
			header: h,
			key: h,
			width: Math.max(10, h.length + 2)
		}));

		for (const row of flaggedData) {
			const rowValues = headers.map((h) => {
				const v = row[h];
				if (v == null) return null;
				if (typeof v === 'object') return JSON.stringify(v);
				return v;
			});
			worksheet.addRow(rowValues);
		}

		worksheet.views = [{ state: 'frozen', ySplit: 1 }];
	}

	try {
		const buffer = await workbook.xlsx.writeBuffer();
		const blob = new Blob([buffer], {
			type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	} catch (err) {
		console.error('XLSX generation failed, falling back to CSV:', err);
		downloadCSV(flaggedData, filename.replace(/\.xlsx?$/i, '.csv'));
	}
}



/**
 * Build one deep-dive XLSX per selected UoA, pack into a zip, and trigger a browser download.
 */
export async function downloadDeepDiveZip(
	uoaRows: Record<string, any>[],
	referenceJson: Record<string, any>,
	hypothesesData: HypothesesData,
	zipFilename = 'deepdives.zip'
): Promise<void> {
	const buffers = await Promise.all(
		uoaRows.map((row) => buildDeepDiveBuffer(row, referenceJson, hypothesesData))
	);

	const files: Record<string, Uint8Array> = {};
	for (let i = 0; i < uoaRows.length; i++) {
		const uoaId = String(uoaRows[i]['uoa'] ?? `uoa_${i}`);
		const flag = String(uoaRows[i]['priority_flag'] ?? '').replace(/\s+/g, '_') || 'no_flag';
		files[`deepdive_${uoaId}_${flag}.xlsx`] = buffers[i];
	}

	const zipped = zipSync(files, { level: 0 });
	const blob = new Blob([zipped as unknown as BlobPart], { type: 'application/zip' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = zipFilename;
	a.click();
	URL.revokeObjectURL(url);
}
