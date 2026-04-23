import { describe, it, expect } from 'vitest';
import { flagData } from '$lib/engine/flagger';
import refJson from './fixtures/reference-mini.json';

// Minimal helper: build a single input row
function row(uoa: string, vals: Record<string, number | null>) {
	return { uoa, ...vals };
}

describe('flagData — basic output shape', () => {
	it('returns same number of rows as input', () => {
		const input = [row('A', { MET001: 0.6, MET002: 3 })];
		const out = flagData(input, refJson);
		expect(out).toHaveLength(1);
	});

	it('returns empty array for empty input', () => {
		expect(flagData([], refJson)).toEqual([]);
	});

	it('adds _flag, _status, _within_10perc columns for each metric', () => {
		const out = flagData([row('A', { MET001: 0.6 })], refJson);
		expect(out[0]).toHaveProperty('MET001_flag');
		expect(out[0]).toHaveProperty('MET001_status');
		expect(out[0]).toHaveProperty('MET001_within_10perc');
	});

	it('pads missing canonical columns with null', () => {
		// Only provide MET001; MET002–MET005 should be null-padded
		const out = flagData([row('A', { MET001: 0.6 })], refJson);
		expect(out[0]!['MET002']).toBeNull();
	});

	it('adds prelim_flag to each row', () => {
		const out = flagData([row('A', { MET001: 0.6 })], refJson);
		expect(out[0]).toHaveProperty('prelim_flag');
	});
});

describe('flagData — metric-level flagging', () => {
	it('flags MET001 when value is above threshold (0.5)', () => {
		const out = flagData([row('A', { MET001: 0.6 })], refJson);
		expect(out[0]!['MET001_flag']).toBe(true);
		expect(out[0]!['MET001_status']).toBe('flag');
	});

	it('does not flag MET001 when value is below threshold', () => {
		const out = flagData([row('A', { MET001: 0.3 })], refJson);
		expect(out[0]!['MET001_flag']).toBe(false);
		expect(out[0]!['MET001_status']).toBe('no_flag');
	});

	it('returns null flag and no_data status for null metric value', () => {
		const out = flagData([row('A', { MET001: null })], refJson);
		expect(out[0]!['MET001_flag']).toBeNull();
		expect(out[0]!['MET001_status']).toBe('no_data');
	});

	it('excludes preference-3 metrics (MET006) from flagging', () => {
		// MET006 is preference 3 in the fixture — should have no _flag column generated
		const out = flagData([row('A', { MET006: 0.3 })], refJson);
		expect(out[0]).not.toHaveProperty('MET006_flag');
	});

	it('computes within_10perc correctly', () => {
		// threshold 0.5, value 0.52 → |0.52-0.5|/0.5 = 0.04 ≤ 0.1 → true
		const out = flagData([row('A', { MET001: 0.52 })], refJson);
		expect(out[0]!['MET001_within_10perc']).toBe(true);
	});

	it('within_10perc is false when value is far from threshold', () => {
		const out = flagData([row('A', { MET001: 0.9 })], refJson);
		expect(out[0]!['MET001_within_10perc']).toBe(false);
	});
});

describe('flagData — subfactor/factor/system rollup', () => {
	it('subfactor status is flag when any metric in group flags', () => {
		const out = flagData([row('A', { MET001: 0.6, MET002: null })], refJson);
		const sfStatus = out[0]!['mortality.mortality_rate.mortality_rate_cdr.status'];
		expect(sfStatus).toBe('flag');
	});

	it('subfactor status is no_flag when data present and no metric flags', () => {
		const out = flagData([row('A', { MET001: 0.3, MET002: null })], refJson);
		const sfStatus = out[0]!['mortality.mortality_rate.mortality_rate_cdr.status'];
		// evidence_threshold=1, MET001 no_flag → group has 1 no_flag → no_flag
		expect(sfStatus).toBe('no_flag');
	});

	it('subfactor status is no_data when all metrics are missing', () => {
		const out = flagData([row('A', { MET001: null, MET002: null })], refJson);
		const sfStatus = out[0]!['mortality.mortality_rate.mortality_rate_cdr.status'];
		expect(sfStatus).toBe('no_data');
	});

	it('system status rolls up correctly', () => {
		// mortality flagged → system flag
		const out = flagData([row('A', { MET001: 0.6 })], refJson);
		expect(out[0]!['mortality.status']).toBe('flag');
	});
});

describe('flagData — prelim_flag classification', () => {
	it('returns EM when mortality system is flagged', () => {
		const out = flagData([row('A', { MET001: 0.6 })], refJson);
		expect(out[0]!['prelim_flag']).toBe('EM');
	});

	it('returns ACUTE when a non-mortality system flags but not mortality', () => {
		const out = flagData([row('A', { MET001: 0.3, MET003: 0.25 })], refJson);
		expect(out[0]!['prelim_flag']).toBe('ACUTE');
	});

	it('returns NO_ACUTE_NEEDS when data present and nothing flags', () => {
		const out = flagData(
			[row('A', { MET001: 0.3, MET002: 1, MET003: 0.1, MET004: 0.1, MET005: 0.1 })],
			refJson
		);
		expect(out[0]!['prelim_flag']).toBe('NO_ACUTE');
	});

	it('returns NO_DATA when all metrics are missing', () => {
		const out = flagData([row('A', {})], refJson);
		expect(out[0]!['prelim_flag']).toBe('NO_DATA');
	});

	it('handles multiple rows independently', () => {
		// Row B: all metrics present with no-flag values (provide MET004 so food_security evidence_threshold=2 is met)
		const out = flagData(
			[
				row('A', { MET001: 0.6 }),
				row('B', { MET001: 0.3, MET002: 1, MET003: 0.1, MET004: 0.1, MET005: 0.1 })
			],
			refJson
		);
		expect(out[0]!['prelim_flag']).toBe('EM');
		expect(out[1]!['prelim_flag']).toBe('NO_ACUTE');
	});
});
