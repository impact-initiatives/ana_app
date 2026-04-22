import { describe, it, expect } from 'vitest';
import {
	dotFill,
	dotStroke,
	tileCssClass,
	tileStyle,
	systemBaseColor,
	systemFillColor,
	factorColor,
	subfactorColor,
	indicatorFillColor,
	metricFillColor,
	colourForHierarchy,
	formatMetricTooltip,
	FLAG_BADGE,
	PRELIM_FLAG_BADGE,
	STATUS_TO_BADGE_KEY
} from '$lib/utils/colors';

describe('dotFill', () => {
	it('returns flag color for flag status', () => {
		expect(dotFill('flag')).toBe('var(--color-flag)');
	});

	it('returns no_flag color for no_flag status', () => {
		expect(dotFill('no_flag')).toBe('var(--color-no-flag)');
	});

	it('returns no_data color for any other status', () => {
		expect(dotFill('no_data')).toBe('var(--color-no-data)');
		expect(dotFill('insufficient_evidence')).toBe('var(--color-no-data)');
		expect(dotFill('')).toBe('var(--color-no-data)');
	});
});

describe('dotStroke', () => {
	it('returns within10 color when within10 is true', () => {
		expect(dotStroke('flag', true)).toBe('var(--color-within10)');
		expect(dotStroke('no_flag', true)).toBe('var(--color-within10)');
	});

	it('returns none when within10 is false or null', () => {
		expect(dotStroke('flag', false)).toBe('none');
		expect(dotStroke('no_flag', null)).toBe('none');
	});
});

describe('tileCssClass', () => {
	it('returns no-data class when avail is 0', () => {
		expect(tileCssClass(0, 0, false)).toContain('text-base-content/40');
	});

	it('includes ring classes when active', () => {
		expect(tileCssClass(0, 0, true)).toContain('ring-3');
		expect(tileCssClass(1, 2, true)).toContain('ring-primary');
	});

	it('does not include ring classes when inactive', () => {
		expect(tileCssClass(0, 2, false)).not.toContain('ring-3');
	});
});

describe('tileStyle', () => {
	it('uses no-data-tint when no data available', () => {
		expect(tileStyle(0, 0)).toContain('var(--color-no-data-tint)');
	});

	it('uses no-flag-tint when data present and no flags', () => {
		expect(tileStyle(0, 3)).toContain('var(--color-no-flag-tint)');
	});

	it('uses flag-tint when flags are present', () => {
		expect(tileStyle(2, 3)).toContain('var(--color-flag-tint)');
	});

	it('always includes a color property', () => {
		expect(tileStyle(0, 0)).toContain('color:');
		expect(tileStyle(1, 2)).toContain('color:');
	});
});

describe('system color helpers', () => {
	it('systemBaseColor returns the base var for a known system', () => {
		expect(systemBaseColor('mortality')).toBe('var(--color-sys-mortality)');
	});

	it('systemBaseColor falls back to default for unknown system', () => {
		expect(systemBaseColor('unknown_system')).toBe('var(--color-sys-default)');
		expect(systemBaseColor(null)).toBe('var(--color-sys-default)');
	});

	it('systemFillColor returns d1 depth var', () => {
		expect(systemFillColor('mortality')).toBe('var(--color-sys-mortality-d1)');
	});

	it('factorColor returns d2 depth var', () => {
		expect(factorColor('mortality', 0)).toBe('var(--color-sys-mortality-d2)');
	});

	it('subfactorColor returns d3 depth var', () => {
		expect(subfactorColor('mortality', 0, 0)).toBe('var(--color-sys-mortality-d3)');
	});

	it('indicatorFillColor returns d4 depth var', () => {
		expect(indicatorFillColor('mortality')).toBe('var(--color-sys-mortality-d4)');
	});

	it('metricFillColor returns d5 depth var', () => {
		expect(metricFillColor('mortality')).toBe('var(--color-sys-mortality-d5)');
	});
});

describe('colourForHierarchy', () => {
	it('dispatches to correct depth for each level', () => {
		expect(colourForHierarchy('mortality', 'system')).toBe(systemFillColor('mortality'));
		expect(colourForHierarchy('mortality', 'factor')).toBe(factorColor('mortality', 0));
		expect(colourForHierarchy('mortality', 'subfactor')).toBe(subfactorColor('mortality', 0, 0));
		expect(colourForHierarchy('mortality', 'indicator')).toBe(indicatorFillColor('mortality'));
		expect(colourForHierarchy('mortality', 'metric')).toBe(metricFillColor('mortality'));
	});

	it('uses default system for null systemId', () => {
		expect(colourForHierarchy(null, 'system')).toBe(systemFillColor('default'));
	});
});

describe('formatMetricTooltip', () => {
	it('returns empty string for undefined metric', () => {
		expect(formatMetricTooltip(undefined)).toBe('');
	});

	it('includes metric id, type, preference, and direction', () => {
		const tooltip = formatMetricTooltip({
			metric: 'MET001',
			type: 'num[0+]',
			preference: 1,
			above_or_below: 'Above',
			thresholds: { an: 0.5, van: 1.0 },
			label: 'CDR'
		} as any);
		expect(tooltip).toContain('MET001');
		expect(tooltip).toContain('num[0+]');
		expect(tooltip).toContain('1');
		expect(tooltip).toContain('Above');
		expect(tooltip).toContain('0.5');
		expect(tooltip).toContain('1');
	});

	it('omits lines for missing optional fields', () => {
		const tooltip = formatMetricTooltip({ metric: 'MET001' } as any);
		expect(tooltip).toBe('Metric: MET001');
	});
});

describe('FLAG_BADGE', () => {
	it('has entries for all four status values', () => {
		expect(FLAG_BADGE).toHaveProperty('flag');
		expect(FLAG_BADGE).toHaveProperty('no_flag');
		expect(FLAG_BADGE).toHaveProperty('insufficient_evidence');
		expect(FLAG_BADGE).toHaveProperty('no_data');
	});

	it('each entry has label, colorVar, tintVar, badgeStyle', () => {
		for (const entry of Object.values(FLAG_BADGE)) {
			expect(entry).toHaveProperty('label');
			expect(entry).toHaveProperty('colorVar');
			expect(entry).toHaveProperty('tintVar');
			expect(entry).toHaveProperty('badgeStyle');
		}
	});
});

describe('PRELIM_FLAG_BADGE', () => {
	it('has entries for all six prelim_flag values', () => {
		const keys = ['EM', 'ROEM', 'ACUTE', 'NO_ACUTE_NEEDS', 'INSUFFICIENT_EVIDENCE', 'NO_DATA'];
		for (const key of keys) {
			expect(PRELIM_FLAG_BADGE).toHaveProperty(key);
		}
	});

	it('each entry has a bg and label', () => {
		for (const entry of Object.values(PRELIM_FLAG_BADGE)) {
			expect(entry).toHaveProperty('bg');
			expect(entry).toHaveProperty('label');
		}
	});
});

describe('STATUS_TO_BADGE_KEY', () => {
	it('maps each status to its own key (identity map)', () => {
		for (const [k, v] of Object.entries(STATUS_TO_BADGE_KEY)) {
			expect(v).toBe(k);
		}
	});
});
