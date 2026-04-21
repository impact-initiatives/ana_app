import { describe, it, expect } from 'vitest';
import { fmt, fmtPct, fmtFixed, fmtOr } from '$lib/utils/format';

describe('fmt', () => {
	it('formats millions with one decimal and M suffix', () => {
		expect(fmt(1_200_000)).toBe('1.2M');
		expect(fmt(1_000_000)).toBe('1.0M');
	});

	it('formats thousands with one decimal and k suffix', () => {
		expect(fmt(1_200)).toBe('1.2k');
		expect(fmt(1_000)).toBe('1.0k');
	});

	it('formats numbers below 1000 as locale string', () => {
		expect(fmt(0)).toBe('0');
		expect(fmt(42)).toBe('42');
		expect(fmt(3.14159)).toBe('3.14');
	});

	it('handles negative millions', () => {
		expect(fmt(-2_500_000)).toBe('-2.5M');
	});

	it('handles negative thousands', () => {
		expect(fmt(-1_500)).toBe('-1.5k');
	});

	it('returns em dash for non-finite values', () => {
		expect(fmt(Infinity)).toBe('–');
		expect(fmt(-Infinity)).toBe('–');
		expect(fmt(NaN)).toBe('–');
	});
});

describe('fmtPct', () => {
	it('converts a proportion to a percentage string', () => {
		expect(fmtPct(0.123)).toBe('12.3%');
		expect(fmtPct(1)).toBe('100.0%');
		expect(fmtPct(0)).toBe('0.0%');
	});

	it('respects the decimals parameter', () => {
		expect(fmtPct(0.1234, 2)).toBe('12.34%');
		expect(fmtPct(0.5, 0)).toBe('50%');
	});

	it('returns em dash for non-finite values', () => {
		expect(fmtPct(NaN)).toBe('–');
		expect(fmtPct(Infinity)).toBe('–');
	});
});

describe('fmtFixed', () => {
	it('formats with default 2 decimal places', () => {
		expect(fmtFixed(3.14159)).toBe('3.14');
		expect(fmtFixed(1)).toBe('1.00');
	});

	it('respects the decimals parameter', () => {
		expect(fmtFixed(3.14159, 4)).toBe('3.1416');
		expect(fmtFixed(3.14159, 0)).toBe('3');
	});

	it('returns em dash for non-finite values', () => {
		expect(fmtFixed(NaN)).toBe('–');
		expect(fmtFixed(Infinity)).toBe('–');
	});
});

describe('fmtOr', () => {
	it('formats finite numbers via fmt', () => {
		expect(fmtOr(1_500)).toBe('1.5k');
		expect(fmtOr(42)).toBe('42');
	});

	it('returns em dash for null', () => {
		expect(fmtOr(null)).toBe('–');
	});

	it('returns em dash for undefined', () => {
		expect(fmtOr(undefined)).toBe('–');
	});

	it('returns em dash for NaN', () => {
		expect(fmtOr(NaN)).toBe('–');
	});

	it('accepts a custom dash string', () => {
		expect(fmtOr(null, 'N/A')).toBe('N/A');
		expect(fmtOr(undefined, 'n/a')).toBe('n/a');
	});
});
