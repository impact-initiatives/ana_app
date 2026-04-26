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

	it('includes preference-2 metrics (MET002) in flagging', () => {
		const out = flagData([row('A', { MET002: 3 })], refJson);
		expect(out[0]).toHaveProperty('MET002_flag');
		expect(out[0]!['MET002_flag']).toBe(true); // 3 ≥ 2 (threshold), Above
	});

	it('flags an Above-direction metric at exactly the threshold', () => {
		// MET001: threshold=0.5, Above → v >= 0.5; boundary must flag
		const out = flagData([row('A', { MET001: 0.5 })], refJson);
		expect(out[0]!['MET001_flag']).toBe(true);
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

	// MET001: threshold=0.5, Above
	it('within_10perc_change is true when value is approaching but has not crossed threshold', () => {
		// |0.48 - 0.5| / 0.5 = 0.04 ≤ 0.1, and 0.48 < 0.5 → not yet flagged
		const out = flagData([row('A', { MET001: 0.48 })], refJson);
		expect(out[0]!['MET001_within_10perc_change']).toBe(true);
	});

	it('within_10perc_change is false when value has already crossed threshold', () => {
		// 0.52 is within 10% of 0.5 but flagged → no longer "approaching"
		const out = flagData([row('A', { MET001: 0.52 })], refJson);
		expect(out[0]!['MET001_within_10perc_change']).toBe(false);
	});

	it('within_10perc_change is false when value is far from threshold', () => {
		const out = flagData([row('A', { MET001: 0.3 })], refJson);
		expect(out[0]!['MET001_within_10perc_change']).toBe(false);
	});

	it('within_10perc_change is null for null metric value', () => {
		const out = flagData([row('A', { MET001: null })], refJson);
		expect(out[0]!['MET001_within_10perc_change']).toBeNull();
	});

	// MET009: threshold=0.3, Below
	it('flags a Below-direction metric when value is at or below threshold', () => {
		const out = flagData([row('A', { MET009: 0.2 })], refJson);
		expect(out[0]!['MET009_flag']).toBe(true);
		expect(out[0]!['MET009_status']).toBe('flag');
	});

	it('does not flag a Below-direction metric when value is above threshold', () => {
		const out = flagData([row('A', { MET009: 0.5 })], refJson);
		expect(out[0]!['MET009_flag']).toBe(false);
		expect(out[0]!['MET009_status']).toBe('no_flag');
	});

	it('flags a Below-direction metric at exactly the threshold', () => {
		const out = flagData([row('A', { MET009: 0.3 })], refJson);
		expect(out[0]!['MET009_flag']).toBe(true);
	});

	// MET009: threshold=0.3, Below — within_10perc and within_10perc_change
	it('within_10perc is true for a Below metric within 10% of threshold', () => {
		// |0.28 - 0.3| / 0.3 = 0.067 ≤ 0.1 → true
		const out = flagData([row('A', { MET009: 0.28 })], refJson);
		expect(out[0]!['MET009_within_10perc']).toBe(true);
	});

	it('within_10perc is false for a Below metric far from threshold', () => {
		const out = flagData([row('A', { MET009: 0.1 })], refJson);
		expect(out[0]!['MET009_within_10perc']).toBe(false);
	});

	it('within_10perc_change is true for a Below metric approaching but not yet crossed', () => {
		// 0.32 > 0.3 (not flagged for Below), |0.32-0.3|/0.3 = 0.067 ≤ 0.1 → approaching
		const out = flagData([row('A', { MET009: 0.32 })], refJson);
		expect(out[0]!['MET009_within_10perc_change']).toBe(true);
	});

	it('within_10perc_change is false for a Below metric that has already flagged', () => {
		// 0.28 ≤ 0.3 (flagged), within 10% → already crossed, not approaching
		const out = flagData([row('A', { MET009: 0.28 })], refJson);
		expect(out[0]!['MET009_within_10perc_change']).toBe(false);
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

describe('flagData — count columns', () => {
	it('missing_n counts null metric values in the group', () => {
		// MET001 present, MET002 null → 1 missing in mortality_rate_cdr
		const out = flagData([row('A', { MET001: 0.6, MET002: null })], refJson);
		expect(out[0]!['mortality.mortality_rate.mortality_rate_cdr.missing_n']).toBe(1);
	});

	it('flag_n counts flagged metrics in the group', () => {
		const out = flagData([row('A', { MET001: 0.6, MET002: null })], refJson);
		expect(out[0]!['mortality.mortality_rate.mortality_rate_cdr.flag_n']).toBe(1);
	});

	it('no_flag_n counts non-flagged metrics with data in the group', () => {
		const out = flagData([row('A', { MET001: 0.3, MET002: null })], refJson);
		expect(out[0]!['mortality.mortality_rate.mortality_rate_cdr.no_flag_n']).toBe(1);
	});

	it('all three counts are zero when all metrics are null', () => {
		const out = flagData([row('A', { MET001: null, MET002: null })], refJson);
		expect(out[0]!['mortality.mortality_rate.mortality_rate_cdr.missing_n']).toBe(2);
		expect(out[0]!['mortality.mortality_rate.mortality_rate_cdr.flag_n']).toBe(0);
		expect(out[0]!['mortality.mortality_rate.mortality_rate_cdr.no_flag_n']).toBe(0);
	});

	it('factor-level counts aggregate all metrics under the factor', () => {
		// mortality.mortality_rate has MET001 + MET002; MET001 flags, MET002 null
		const out = flagData([row('A', { MET001: 0.6, MET002: null })], refJson);
		expect(out[0]!['mortality.mortality_rate.flag_n']).toBe(1);
		expect(out[0]!['mortality.mortality_rate.no_flag_n']).toBe(0);
		expect(out[0]!['mortality.mortality_rate.missing_n']).toBe(1);
	});
});

describe('flagData — factor and system rollup', () => {
	it('factor status rolls up from subfactor statuses', () => {
		const out = flagData([row('A', { MET001: 0.6 })], refJson);
		expect(out[0]!['mortality.mortality_rate.status']).toBe('flag');
	});

	it('subfactor status is insufficient_evidence when data present but below evidence threshold', () => {
		// food_security fcs: MET003=0.1 (no_flag), MET004=null
		// → 1 data point < evidence_threshold=2 → insufficient_evidence
		const out = flagData([row('A', { MET003: 0.1 })], refJson);
		expect(out[0]!['food_security.food_consumption.food_consumption_fcs.status']).toBe('insufficient_evidence');
	});

	it('system status is insufficient_evidence when all its factors are insufficient_evidence', () => {
		const out = flagData([row('A', { MET003: 0.1 })], refJson);
		expect(out[0]!['food_security.status']).toBe('insufficient_evidence');
	});

	it('factor status is insufficient_evidence when one subfactor is no_flag and another is no_data', () => {
		// income_sources: MET007=0.3 (no_flag Above 0.4), MET009=0.5 (no_flag Below 0.3) → no_flag
		// income_resilience: MET010=null → no_data
		// rollupStatuses([no_flag, no_data]) → insufficient_evidence
		const out = flagData([row('A', { MET007: 0.3, MET009: 0.5 })], refJson);
		expect(out[0]!['livelihoods.income.status']).toBe('insufficient_evidence');
	});
});

describe('flagData — prelim_flag classification', () => {
	it('returns EM when mortality system is flagged', () => {
		const out = flagData([row('A', { MET001: 0.6 })], refJson);
		expect(out[0]!['prelim_flag']).toBe('EM');
	});

	it('returns ACUTE when a non-mortality system flags but not mortality', () => {
		// MET003=0.25 ≥ 0.2 Above, factor_threshold=1 → food_security flags with one metric
		const out = flagData([row('A', { MET001: 0.3, MET003: 0.25 })], refJson);
		expect(out[0]!['prelim_flag']).toBe('ACUTE');
	});

	it('returns ACUTE when health_outcomes flags but fewer than 3 other systems flag', () => {
		// health_outcomes: MET005=0.2 → flag; food_security + livelihoods = 2 others < 3
		const out = flagData(
			[row('A', { MET001: 0.3, MET005: 0.2, MET003: 0.25, MET007: 0.5 })],
			refJson
		);
		expect(out[0]!['prelim_flag']).toBe('ACUTE');
	});

	it('returns ACUTE when health_outcomes flags alone with no other systems', () => {
		const out = flagData([row('A', { MET005: 0.2 })], refJson);
		expect(out[0]!['prelim_flag']).toBe('ACUTE');
	});

	it('returns ROEM when health_outcomes flags and ≥3 other classification systems flag', () => {
		// health_outcomes: MET005=0.2 ≥ 0.15 Above → flag
		// food_security: MET003=0.25 ≥ 0.2 Above, factor_threshold=1 → flag (1 other)
		// livelihoods:   MET007=0.5 ≥ 0.4 Above → flag (2 other)
		// wash:          MET008=0.5 ≥ 0.4 Above → flag (3 other)
		// mortality: MET001=0.3 < 0.5 → no_flag (no EM)
		const out = flagData(
			[row('A', { MET001: 0.3, MET005: 0.2, MET003: 0.25, MET007: 0.5, MET008: 0.5 })],
			refJson
		);
		expect(out[0]!['prelim_flag']).toBe('ROEM');
	});

	it('returns INSUFFICIENT_EVIDENCE when some data present but below evidence threshold', () => {
		// food_security: MET003=0.1 below threshold (no_flag), MET004 null
		// → 1 metric with data < evidence_threshold=2 → insufficient_evidence
		// all other classification systems: no data
		const out = flagData([row('A', { MET003: 0.1 })], refJson);
		expect(out[0]!['prelim_flag']).toBe('INSUFFICIENT_EVIDENCE');
	});

	it('returns ACUTE_NEEDS when data is present and nothing flags', () => {
		// food_security: both MET003 and MET004 below threshold, evidence_threshold=2 met → no_flag
		// health_outcomes: MET005 below threshold → no_flag
		// other systems: no data — not enough to block ACUTE_NEEDS
		const out = flagData(
			[row('A', { MET001: 0.3, MET002: 1, MET003: 0.1, MET004: 0.1, MET005: 0.1 })],
			refJson
		);
		expect(out[0]!['prelim_flag']).toBe('ACUTE_NEEDS');
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
		expect(out[1]!['prelim_flag']).toBe('ACUTE_NEEDS');
	});
});

describe('flagData — hard guard', () => {
	it('throws when referenceJson is null', () => {
		expect(() => flagData([row('A', {})], null)).toThrow('referenceJson is required');
	});

	it('throws when referenceJson is undefined', () => {
		expect(() => flagData([row('A', {})], undefined)).toThrow('referenceJson is required');
	});

	it('throws when mortality is missing from reference.json', () => {
		const refNoMortality = {
			systems: [
				{ id: 'health_outcomes', label: 'Health Outcomes', factors: [] },
				{ id: 'food_security', label: 'Food Security', factors: [] }
			]
		};
		expect(() => flagData([row('A', {})], refNoMortality)).toThrow(
			/required system IDs missing/
		);
	});

	it('throws when health_outcomes is missing from reference.json', () => {
		const refNoHealthOutcomes = {
			systems: [
				{ id: 'mortality', label: 'Mortality', factors: [] },
				{ id: 'food_security', label: 'Food Security', factors: [] }
			]
		};
		expect(() => flagData([row('A', {})], refNoHealthOutcomes)).toThrow(
			/required system IDs missing/
		);
	});
});
