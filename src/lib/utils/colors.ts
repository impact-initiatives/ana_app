import type { Metric } from '$lib/types/structure';
import type { FlagStatus, PrelimFlag } from '$lib/types/flags';
import { SystemIDEnum } from '$lib/types/generated/system-enum';

// ── Fill ─────────────────────────────────────────────────────────────────────

export function dotFill(status: string): string {
	if (status === 'flag') return 'var(--color-flag)';
	if (status === 'no_flag') return 'var(--color-no-flag)';
	return 'var(--color-no-data)';
}

// ── Stroke ────────────────────────────────────────────────────────────────────

export function dotStroke(_status: string, within10: boolean | null): string {
	if (within10) return 'var(--color-within10)';
	return 'none';
}

// ── Tile class ────────────────────────────────────────────────────────────────

export function tileCssClass(flagN: number, avail: number, active: boolean): string {
	const ring = active ? ' ring-3 ring-primary ring-offset-0' : '';
	if (avail === 0) return `text-base-content/40${ring}`;
	if (flagN === 0) return `text-base-content hover:brightness-95${ring}`;
	return `text-base-content hover:brightness-95${ring}`;
}

export function tileStyle(flagN: number, avail: number): string {
	const text = 'color: var(--color-base-content)';
	if (avail === 0) return `background-color: var(--color-no-data-tint); ${text}`;
	if (flagN === 0) return `background-color: var(--color-no-flag-tint); ${text}`;
	return `background-color: var(--color-flag-tint); ${text}`;
}

// ── System colour ramp ────────────────────────────────────────────────────────

/** 
 * DATA MAP: System ID to CSS variable name.
 * Convention: SCREAMING_SNAKE_CASE for constant data maps.
 */
const SYSTEM_CSS_VAR_MAP: Record<SystemIDEnum | 'default', string> = {
	[SystemIDEnum.FoodSystems]: '--color-sys-food-systems',
	[SystemIDEnum.WaterSystems]: '--color-sys-water-systems',
	[SystemIDEnum.HealthOutcomes]: '--color-sys-health-outcomes',
	[SystemIDEnum.Mortality]: '--color-sys-mortality',
	[SystemIDEnum.LivingConditions]: '--color-sys-living-conditions',
	[SystemIDEnum.MarketFunctionality]: '--color-sys-market-functionality',
	[SystemIDEnum.HealthNutritionServices]: '--color-sys-health-nutrition-services',
	default: '--color-sys-default'
};

/**
 * ACCESSOR: Get the CSS variable name for a system.
 * Convention: camelCase with 'get' prefix for retrieval functions.
 */
function getSystemCssVar(systemId: string | undefined | null): string {
	const key = systemId ? String(systemId) : 'default';
	return SYSTEM_CSS_VAR_MAP[key as SystemIDEnum | 'default'] ?? SYSTEM_CSS_VAR_MAP.default;
}

export function systemBaseColor(systemId: string | undefined | null): string {
	return `var(${getSystemCssVar(systemId)})`;
}

export function systemFillColor(systemId: string | undefined | null): string {
	return `var(${getSystemCssVar(systemId)}-d1)`;
}

export function factorColor(systemId: string, _factorIndex: number, _factorCount?: number): string {
	void _factorIndex;
	void _factorCount;
	return `var(${getSystemCssVar(systemId)}-d2)`;
}

export function subfactorColor(
	systemId: string,
	_factorIndex: number,
	_subfactorIndex: number,
	_subfactorCount?: number
): string {
	void _factorIndex;
	void _subfactorIndex;
	void _subfactorCount;
	return `var(${getSystemCssVar(systemId)}-d3)`;
}

export function indicatorFillColor(systemId: string | undefined | null): string {
	return `var(${getSystemCssVar(systemId)}-d4)`;
}

export function metricFillColor(systemId: string | undefined | null): string {
	return `var(${getSystemCssVar(systemId)}-d5)`;
}

export function colourForHierarchy(
	systemId: string | undefined | null,
	level: 'system' | 'factor' | 'subfactor' | 'indicator' | 'metric',
	index?: number,
	total?: number
): string {
	const sid = systemId ?? 'default';
	switch (level) {
		case 'system':
			return systemFillColor(sid);
		case 'factor':
			return factorColor(sid, index ?? 0, total);
		case 'subfactor':
			return subfactorColor(sid, index ?? 0, index ?? 0, total);
		case 'indicator':
			return indicatorFillColor(sid);
		case 'metric':
			return metricFillColor(sid);
		default:
			return systemFillColor(sid);
	}
}

// ── Tooltip helper ────────────────────────────────────────────────────────────

export function formatMetricTooltip(met: Metric | undefined): string {
	if (!met) return '';
	const parts: string[] = [];
	if (met.metric) parts.push(`Metric: ${met.metric}`);
	if (met.type) parts.push(`Type: ${met.type}`);
	if (met.preference != null) parts.push(`Preference: ${met.preference}`);
	if (met.above_or_below) parts.push(`Threshold direction: ${met.above_or_below}`);
	if (met.thresholds) {
		const t = met.thresholds;
		parts.push(`AN: ${t.an ?? '—'}  VAN: ${t.van ?? '—'}`);
	}
	if (met.risk_concept) parts.push(`Risk concept: ${met.risk_concept}`);
	return parts.join('\n');
}

// ── Badge Definitions ────────────────────────────────────────────────────────

export interface FlagBadge {
	bg: string;
	tintBg?: string;
	label: string;
}

export interface FlagStatusBadge {
	label: string;
	colorVar: string;
	tintVar: string;
	badgeStyle: string;
	badgeTintStyle: string;
	badgeCls: string;
	checkboxCls: string;
	buttonCls: string;
}

/**
 * DATA MAP: Status to Badge configuration.
 * Convention: SCREAMING_SNAKE_CASE.
 */
export const FLAG_BADGE_MAP: Record<FlagStatus, FlagStatusBadge> = {
	flag: {
		label: 'Flag',
		colorVar: '--color-flag',
		tintVar: '--color-flag-tint',
		badgeStyle: 'background-color: var(--color-flag); color: var(--color-base-100)',
		badgeTintStyle: 'background-color: var(--color-flag-tint); color: var(--color-base-content)',
		badgeCls: '',
		checkboxCls: 'checkbox-warning',
		buttonCls: 'btn-ghost'
	},
	no_flag: {
		label: 'No Flag',
		colorVar: '--color-no-flag',
		tintVar: '--color-no-flag-tint',
		badgeStyle: 'background-color: var(--color-no-flag); color: var(--color-base-100)',
		badgeTintStyle: 'background-color: var(--color-no-flag-tint); color: var(--color-base-content)',
		badgeCls: '',
		checkboxCls: 'checkbox-info',
		buttonCls: 'btn-ghost'
	},
	insufficient_evidence: {
		label: 'Insufficient Evidence',
		colorVar: '--color-insufficient',
		tintVar: '--color-insufficient-tint',
		badgeStyle: 'background-color: var(--color-insufficient); color: var(--color-base-100)',
		badgeTintStyle:
			'background-color: var(--color-insufficient-tint); color: var(--color-base-content)',
		badgeCls: 'badge-warning',
		checkboxCls: 'checkbox-warning',
		buttonCls: 'btn-warning'
	},
	no_data: {
		label: 'No Data',
		colorVar: '--color-no-data',
		tintVar: '--color-no-data-tint',
		badgeStyle: 'background-color: var(--color-no-data); color: var(--color-base-100)',
		badgeTintStyle: 'background-color: var(--color-no-data-tint); color: var(--color-base-content)',
		badgeCls: 'badge-ghost',
		checkboxCls: 'checkbox-neutral',
		buttonCls: 'btn-neutral'
	}
};

/**
 * DATA MAP: Preliminary flag to Badge configuration.
 * Convention: SCREAMING_SNAKE_CASE (Renamed from prelimBadge).
 */
export const PRELIM_BADGE_MAP: Record<PrelimFlag, FlagBadge> = {
	em: { bg: 'var(--color-em)', label: 'EM' },
	roem: { bg: 'var(--color-roem)', label: 'RoEM' },
	acute: { bg: 'var(--color-acute)', label: 'Acute Needs' },
	acute_needs: { bg: 'var(--color-no-acute)', label: 'No Acute Needs' },
	insufficient_evidence: { bg: 'var(--color-insufficient)', label: 'Insufficient Evidence' },
	no_data: { bg: 'var(--color-no-data)', tintBg: 'var(--color-no-data-tint)', label: 'No Data' }
};

/**
 * ACCESSOR: Get Flag Badge config.
 * Convention: camelCase with 'get' prefix.
 */
export const getFlagBadge = (key: string): FlagStatusBadge | undefined =>
	FLAG_BADGE_MAP[key as FlagStatus];

/**
 * ACCESSOR: Get Prelim Badge config.
 * Convention: camelCase with 'get' prefix.
 */
export const getPrelimBadge = (key: string): FlagBadge | undefined =>
	PRELIM_BADGE_MAP[key as PrelimFlag];