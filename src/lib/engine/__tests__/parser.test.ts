import { describe, it, expect } from 'vitest';
import { parseText } from '$lib/engine/parser';

describe('parseText', () => {
	it('returns header and rows for a basic CSV', () => {
		const csv = 'uoa,MET001,MET002\nA,0.6,3\nB,0.3,1';
		const { header, rows, errors } = parseText(csv);
		expect(header).toEqual(['uoa', 'MET001', 'MET002']);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toEqual(['A', '0.6', '3']);
		expect(errors).toHaveLength(0);
	});

	it('trims whitespace from headers and cells', () => {
		const csv = ' uoa , MET001 \n  A  ,  0.5  ';
		const { header, rows } = parseText(csv);
		expect(header).toEqual(['uoa', 'MET001']);
		expect(rows[0]).toEqual(['A', '0.5']);
	});

	it('pads short rows with empty strings', () => {
		const csv = 'a,b,c\n1,2';
		const { rows } = parseText(csv);
		expect(rows[0]).toEqual(['1', '2', '']);
	});

	it('returns empty header and rows for an empty string', () => {
		const { header, rows } = parseText('');
		expect(header).toEqual([]);
		expect(rows).toEqual([]);
	});

	it('handles quoted fields with embedded commas', () => {
		const csv = 'uoa,label\nA,"hello, world"';
		const { rows } = parseText(csv);
		expect(rows[0]![1]).toBe('hello, world');
	});

	it('strips BOM from first header field', () => {
		const csv = '\uFEFFuoa,MET001\nA,0.5';
		const { header } = parseText(csv);
		expect(header[0]).toBe('uoa');
	});

	it('skips empty lines by default', () => {
		const csv = 'a,b\n\n1,2\n\n3,4';
		const { rows } = parseText(csv);
		expect(rows).toHaveLength(2);
	});

	it('returns only a header row when there are no data rows', () => {
		const csv = 'uoa,MET001';
		const { header, rows } = parseText(csv);
		expect(header).toEqual(['uoa', 'MET001']);
		expect(rows).toHaveLength(0);
	});
});
