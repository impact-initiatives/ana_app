import { describe, it, expect } from 'vitest';
import { looksLikePcode, parsePcode, analyzeUoas } from '$lib/utils/pcode';

describe('looksLikePcode', () => {
	it('accepts compact letter+digit forms', () => {
		expect(looksLikePcode('AFG01')).toBe(true);
		expect(looksLikePcode('SD02114')).toBe(true);
		expect(looksLikePcode('SO01')).toBe(true);
	});

	it('rejects strings with separators', () => {
		expect(looksLikePcode('AFG_01')).toBe(false);
		expect(looksLikePcode('AFG-01')).toBe(false);
	});

	it('rejects plain names', () => {
		expect(looksLikePcode('Somalia')).toBe(false);
		expect(looksLikePcode('Area_A')).toBe(false);
	});

	it('rejects empty or non-string inputs', () => {
		expect(looksLikePcode('')).toBe(false);
		expect(looksLikePcode(null as any)).toBe(false);
	});

	it('requires at least 2 digits', () => {
		expect(looksLikePcode('SO1')).toBe(false);
		expect(looksLikePcode('SO01')).toBe(true);
	});
});

describe('parsePcode', () => {
	it('parses a 2-digit code as ADM1', () => {
		const r = parsePcode('SO01');
		expect(r.isPcode).toBe(true);
		expect(r.country).toBe('SO');
		expect(r.level).toBe('ADM1');
		expect(r.code).toBe('SO01');
	});

	it('parses a long digit code as ADM2', () => {
		const r = parsePcode('SO0101');
		expect(r.isPcode).toBe(true);
		expect(r.level).toBe('ADM2');
	});

	it('uppercases the country code', () => {
		const r = parsePcode('afg01');
		expect(r.country).toBe('AFG');
	});

	it('returns isPcode=false for a plain name', () => {
		const r = parsePcode('Area_A');
		expect(r.isPcode).toBe(false);
		expect(r.country).toBeNull();
	});

	it('handles empty string gracefully', () => {
		const r = parsePcode('');
		expect(r.isPcode).toBe(false);
	});
});

describe('analyzeUoas', () => {
	it('returns action=none when no pcode-like UOAs are present', () => {
		const r = analyzeUoas(['Area_A', 'Area_B']);
		expect(r.action).toBe('none');
	});

	it('returns action=adm1 for ADM1 pcodes', () => {
		const r = analyzeUoas(['SO01', 'SO02']);
		expect(r.action).toBe('adm1');
		expect(r.level).toBe('ADM1');
		expect(r.pcode).toBe('SO');
	});

	it('returns action=adm2 for ADM2 pcodes', () => {
		const r = analyzeUoas(['SO0101', 'SO0102']);
		expect(r.action).toBe('adm2');
		expect(r.level).toBe('ADM2');
	});

	it('returns action=error for mixed countries', () => {
		const r = analyzeUoas(['SO01', 'AF01']);
		expect(r.action).toBe('error');
		expect(r.message).toMatch(/multiple countries/i);
	});

	it('returns action=error for mixed admin levels', () => {
		const r = analyzeUoas(['SO01', 'SO0101']);
		expect(r.action).toBe('error');
		expect(r.message).toMatch(/mixed admin levels/i);
	});

	it('returns empty array for empty input', () => {
		const r = analyzeUoas([]);
		expect(r.action).toBe('none');
	});

	it('ignores non-pcode entries in a mixed list', () => {
		// Only SO01/SO02 are pcodes; Area_A is ignored
		const r = analyzeUoas(['SO01', 'SO02', 'Area_A']);
		expect(r.action).toBe('adm1');
	});
});
