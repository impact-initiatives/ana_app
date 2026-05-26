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
		// Only provide MET001; MET002–MET005 etc should be null-padded
		const out = flagData([row('A', { MET001: 0.6 })], refJson);
		expect(out[0]!['MET002']).toBeNull();
	});

	it('adds priority_flag to each row', () => {
		const out = flagData([row('A', { MET001: 0.6 })], refJson);
		expect(out[0]).toHaveProperty('priority_flag');
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

	it('supporting evidence metrics (MET013) generate metric-level _flag column', () => {
		// MET013 is Supporting evidence — gets a _flag column even though excluded from rollup
		const out = flagData([row('A', { MET013: 0.5 })], refJson);
		expect(out[0]).toHaveProperty('MET013_flag');
		expect(out[0]!['MET013_flag']).toBe(true); // 0.5 ≥ 0.3 threshold, Above
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

describe('flagData — VAN flag columns', () => {
	// MET005: Above, an=0.15, van=0.3
	it('MET005_van_flag is null when metric value is null', () => {
		const out = flagData([row('A', { MET005: null })], refJson);
		expect(out[0]!['MET005_van_flag']).toBeNull();
		expect(out[0]!['MET005_van_status']).toBe('no_data');
	});

	it('MET005_van_flag is false when value is above AN but below VAN', () => {
		// 0.2 ≥ an=0.15 → AN flag; 0.2 < van=0.3 → no VAN flag
		const out = flagData([row('A', { MET005: 0.2 })], refJson);
		expect(out[0]!['MET005_van_flag']).toBe(false);
		expect(out[0]!['MET005_van_status']).toBe('no_flag');
		expect(out[0]!['MET005_flag']).toBe(true); // AN still flags
	});

	it('MET005_van_flag is true when value is at or above VAN threshold', () => {
		// 0.35 ≥ van=0.3 → VAN flag
		const out = flagData([row('A', { MET005: 0.35 })], refJson);
		expect(out[0]!['MET005_van_flag']).toBe(true);
		expect(out[0]!['MET005_van_status']).toBe('flag');
	});

	// MET009: Below, an=0.3, van=0.1 (van more extreme = lower)
	it('MET009_van_flag is true when value is at or below VAN threshold', () => {
		// 0.08 ≤ van=0.1 → VAN flag (Below direction)
		const out = flagData([row('A', { MET009: 0.08 })], refJson);
		expect(out[0]!['MET009_van_flag']).toBe(true);
		expect(out[0]!['MET009_van_status']).toBe('flag');
	});

	it('MET009_van_flag is false when value is below AN but above VAN', () => {
		// 0.2 ≤ an=0.3 → AN flag; 0.2 > van=0.1 → no VAN flag
		const out = flagData([row('A', { MET009: 0.2 })], refJson);
		expect(out[0]!['MET009_van_flag']).toBe(false);
		expect(out[0]!['MET009_flag']).toBe(true);
	});

	// MET001: Above, an=0.5, van=1.0
	it('MET001_van_flag is true when value is at or above VAN threshold', () => {
		const out = flagData([row('A', { MET001: 1.2 })], refJson);
		expect(out[0]!['MET001_van_flag']).toBe(true);
	});

	it('MET001_van_flag is false when value is between AN and VAN', () => {
		// 0.7 ≥ an=0.5 but 0.7 < van=1.0
		const out = flagData([row('A', { MET001: 0.7 })], refJson);
		expect(out[0]!['MET001_van_flag']).toBe(false);
		expect(out[0]!['MET001_flag']).toBe(true);
	});

	// MET014: Above, an=0.3, van=0.3 (van_is_strict=false — identical thresholds)
	it('MET014_van_flag is still computed at metric level even when van === an', () => {
		// van_is_strict=false means the flag is excluded from ho_secondary/an_primary VAN branches
		// but the metric-level _van_flag column is still written
		const out = flagData([row('A', { MET014: 0.35 })], refJson);
		expect(out[0]!['MET014_van_flag']).toBe(true);
		expect(out[0]!['MET014_flag']).toBe(true); // same threshold → both fire together
	});

	it('MET014_van_flag is false when value is below the (identical) VAN threshold', () => {
		const out = flagData([row('A', { MET014: 0.2 })], refJson);
		expect(out[0]!['MET014_van_flag']).toBe(false);
		expect(out[0]!['MET014_flag']).toBe(false);
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

	it('supporting evidence metrics (MET013) are excluded from subfactor rollup', () => {
		// MET013=0.5 would flag if counted, but it is Supporting evidence → excluded from rollup
		// MET003=0.1 (no_flag), MET004=0.1 (no_flag) → food_consumption_fcs = no_flag
		const out = flagData([row('A', { MET003: 0.1, MET004: 0.1, MET013: 0.5 })], refJson);
		expect(out[0]!['food_security.food_consumption.food_consumption_fcs.status']).toBe('no_flag');
	});

	it('non-supporting evidence metrics still drive rollup to flag when crossing threshold', () => {
		// MET003=0.25 flags (≥0.2) → food_consumption_fcs = flag, regardless of MET013
		const out = flagData([row('A', { MET003: 0.25, MET013: 0.5 })], refJson);
		expect(out[0]!['food_security.food_consumption.food_consumption_fcs.status']).toBe('flag');
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

	it('supporting evidence metrics are not counted in subfactor counts', () => {
		// MET013 (Supporting evidence) in food_consumption_fcs — should NOT appear in flag_n
		const out = flagData([row('A', { MET003: 0.1, MET004: 0.1, MET013: 0.5 })], refJson);
		// flag_n should be 0 (MET003 and MET004 no_flag; MET013 excluded)
		expect(out[0]!['food_security.food_consumption.food_consumption_fcs.flag_n']).toBe(0);
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

describe('flagData — priority_flag classification', () => {
	it('returns em when mortality system is flagged', () => {
		// MET001=0.6 ≥ an=0.5 → mortality flags → em
		const out = flagData([row('A', { MET001: 0.6 })], refJson);
		expect(out[0]!['priority_flag']).toBe('em');
	});

	it('returns ho_primary when HO proportion rule met (n≤5, ≥1/2 flagged)', () => {
		// HO: MET005=0.2 (flag), MET011=0.15 (flag), MET012=0 (no_flag) → 2/3 ≥ 0.5
		// mortality: no flag (MET001 not provided)
		const out = flagData([row('A', { MET005: 0.2, MET011: 0.15, MET012: 0 })], refJson);
		expect(out[0]!['priority_flag']).toBe('ho_primary');
	});

	it('returns ho_primary when all available HO metrics flag (n=1, ≥1/2)', () => {
		// Only MET005 has data (1/1 ≥ 0.5) — proportion rule triggers with single metric
		const out = flagData([row('A', { MET005: 0.2 })], refJson);
		expect(out[0]!['priority_flag']).toBe('ho_primary');
	});

	it('returns ho_secondary when any HO metric has VAN flag but proportion rule not met', () => {
		// MET011=0.3 → flag=true (≥0.1) AND van_flag=true (≥0.25); van_is_strict=true
		// MET005=0.1 → flag=false (0.1 < 0.15); MET012=0.1 → flag=false; MET014=null
		// 1/3 flagged < 0.5 → ho_primary NOT triggered; HO VAN flag (strict) → ho_secondary
		const out = flagData([row('A', { MET005: 0.1, MET011: 0.3, MET012: 0.1 })], refJson);
		expect(out[0]!['priority_flag']).toBe('ho_secondary');
	});

	it('does NOT return ho_secondary when only van_is_strict=false HO metrics have VAN flags', () => {
		// MET014=0.35: van=an=0.3 → van_is_strict=false → excluded from hoVanEligibleIds
		// MET014_van_flag=true at metric level, but the branch check skips it
		// MET005=0.1, MET011=0, MET012=0.1 → no VAN flags among strict metrics
		// MET014_flag=true (0.35 ≥ an=0.3) → HO system flagged → an_primary (not ho_secondary)
		const out = flagData([row('A', { MET014: 0.35, MET005: 0.1, MET011: 0, MET012: 0.1 })], refJson);
		expect(out[0]!['MET014_van_flag']).toBe(true); // metric-level still fires
		expect(out[0]!['priority_flag']).not.toBe('ho_secondary');
		expect(out[0]!['priority_flag']).toBe('an_primary'); // HO system flag triggers this
	});

	it('returns an_primary when health_outcomes system is flagged (proportion not met, no VAN)', () => {
		// MET005=0.2 → flag=true (0.2 ≥ 0.15), van=false (0.2 < 0.3)
		// MET011=0, MET012=0, MET014=null → no_flag / no_data
		// gam group: flag_n=1 ≥ factor_threshold=1 → gam subfactor=flag → HO system=flag
		// 1/4 flagged < 0.5 → ho_primary NOT triggered; no HO VAN → not ho_secondary
		// isFlagged(healthOutcomesId)=true → an_primary
		const out = flagData([row('A', { MET005: 0.2, MET011: 0, MET012: 0 })], refJson);
		expect(out[0]!['priority_flag']).toBe('an_primary');
	});

	it('returns an_primary when a non-HO classification metric has VAN flag', () => {
		// MET007=0.8 ≥ van=0.7 (livelihoods) → anyVanFlag=true
		// No HO metrics flagged (all 0 < thresholds)
		const out = flagData([row('A', { MET005: 0, MET011: 0, MET012: 0, MET007: 0.8 })], refJson);
		expect(out[0]!['priority_flag']).toBe('an_primary');
	});

	it('returns an_primary when ≥3 classification systems are flagged', () => {
		// food_security: MET003=0.25 → flag (flag_n=1 ≥ ft=1)
		// livelihoods: MET007=0.5 → flag (0.5 ≥ 0.4 → flag, 0.5 < van=0.7 → no van)
		// wash: MET008=0.5 → flag (0.5 ≥ 0.4 → flag, 0.5 < van=0.7 → no van)
		// nSystemsFlagged=3 → an_primary; no HO flags, no VAN flags
		const out = flagData([row('A', { MET003: 0.25, MET007: 0.5, MET008: 0.5 })], refJson);
		expect(out[0]!['priority_flag']).toBe('an_primary');
	});

	it('returns an_secondary when one non-HO classification system flags', () => {
		// food_security: MET003=0.25 (flag, flag_n=1 ≥ ft=1); others no data
		// No HO flags → not ho_primary/ho_secondary
		// anyHoAnFlag=false, anyVanFlag=false, nSystemsFlagged=1 < 3 → not an_primary
		// 1 system flagged → an_secondary
		const out = flagData([row('A', { MET003: 0.25 })], refJson);
		expect(out[0]!['priority_flag']).toBe('an_secondary');
	});

	it('returns insufficient_evidence when some data present but below evidence threshold', () => {
		// food_security: MET003=0.1 (no_flag, 1 metric < et=2 → insufficient_evidence); others no data
		// hasGaps=true → insufficient_evidence
		const out = flagData([row('A', { MET003: 0.1 })], refJson);
		expect(out[0]!['priority_flag']).toBe('insufficient_evidence');
	});

	it('returns no_acute_needs when all classification systems have data and nothing flags', () => {
		// All classification systems: no_flag with sufficient data
		const out = flagData(
			[row('A', {
				MET003: 0.1, MET004: 0.1,          // food_security: et=2 met, both no_flag
				MET005: 0.1, MET011: 0.05, MET012: 0.2, // health_outcomes: all no_flag
				MET007: 0.3, MET009: 0.5, MET010: 0.3,  // livelihoods: all no_flag
				MET008: 0.3                              // wash: no_flag
			})],
			refJson
		);
		expect(out[0]!['priority_flag']).toBe('no_acute_needs');
	});

	it('returns no_data when all metrics are missing', () => {
		const out = flagData([row('A', {})], refJson);
		expect(out[0]!['priority_flag']).toBe('no_data');
	});

	it('handles multiple rows independently', () => {
		const out = flagData(
			[
				row('A', { MET001: 0.6 }),
				// Row B: all classification systems have data, all no_flag → no_acute_needs
				row('B', {
					MET003: 0.1, MET004: 0.1,
					MET005: 0.1, MET011: 0.05, MET012: 0.2,
					MET007: 0.3, MET009: 0.5, MET010: 0.3,
					MET008: 0.3
				})
			],
			refJson
		);
		expect(out[0]!['priority_flag']).toBe('em');
		expect(out[1]!['priority_flag']).toBe('no_acute_needs');
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
