import type { Metric } from '$lib/types/structure';
import type { FlagStatus, PriorityFlag } from '$lib/types/flags';
import { SystemIDEnum } from '$lib/types/structure';

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
export const SYSTEM_CSS_VAR_MAP: Record<SystemIDEnum | 'default', string> = {
	[SystemIDEnum.FoodSystem]: '--color-sys-food-systems',
	[SystemIDEnum.WaterSystem]: '--color-sys-water-systems',
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
	/** Explicit text colour for the non-tinted badge in light mode. Defaults to base-content when omitted. */
	textColor?: string;
	/** Override text colour specifically in dark mode. Falls back to textColor, then base-content. */
	darkTextColor?: string;
	bg: string;
	tintBg?: string;
	label: string;
}

export interface FlagStatusBadge {
	label: string;
	colorVar: string;
	tintVar: string;
	/** Light-mode static style (bg + base-content text). Use flagBadgeStyle() for theme-aware rendering. */
	badgeStyle: string;
	badgeTintStyle: string;
	/** Dark-mode text override. Falls back to base-content when omitted. */
	darkTextColor?: string;
	badgeCls: string;
	checkboxCls: string;
	buttonCls: string;
}

/**
 * DATA MAP: Priority flag to Badge configuration.
 * Defined first so FLAG_BADGE_MAP can reference shared darkTextColor values.
 * Convention: SCREAMING_SNAKE_CASE.
 */
export const PRIORITY_BADGE_MAP: Record<PriorityFlag, FlagBadge> = {
	em:                    { bg: 'var(--color-priority-em)',           tintBg: 'var(--color-priority-em-tint)',           label: 'Excess Mortality',      textColor: 'var(--color-base-100)', darkTextColor: 'white' },
	ho_primary:            { bg: 'var(--color-priority-ho-primary)',   tintBg: 'var(--color-priority-ho-primary-tint)',   label: 'HO – Primary',          textColor: 'var(--color-base-100)', darkTextColor: 'white' },
	ho_secondary:          { bg: 'var(--color-priority-ho-secondary)', tintBg: 'var(--color-priority-ho-secondary-tint)', label: 'HO – Secondary',        textColor: 'var(--color-base-100)', darkTextColor: 'black' },
	an_primary:            { bg: 'var(--color-flag)',                  tintBg: 'var(--color-flag-tint)',                  label: 'AN – Primary',          textColor: 'var(--color-base-100)', darkTextColor: 'black' },
	an_secondary:          { bg: 'var(--color-priority-an-secondary)', tintBg: 'var(--color-priority-an-secondary-tint)', label: 'AN – Secondary',                                            darkTextColor: 'black' },
	insufficient_evidence: { bg: 'var(--color-insufficient)',          tintBg: 'var(--color-insufficient-tint)',          label: 'Insufficient Evidence',                                     darkTextColor: 'black' },
	no_data:               { bg: 'var(--color-no-data)',               tintBg: 'var(--color-no-data-tint)',               label: 'No Data',                                                   darkTextColor: 'white' },
	no_acute_needs:        { bg: 'var(--color-no-acute)',              tintBg: 'var(--color-no-acute-tint)',              label: 'No Acute Needs',                                            darkTextColor: 'black' }
};

/**
 * DATA MAP: Status to Badge configuration.
 * darkTextColor for shared statuses references PRIORITY_BADGE_MAP to avoid duplication.
 * Convention: SCREAMING_SNAKE_CASE.
 */
export const FLAG_BADGE_MAP: Record<FlagStatus, FlagStatusBadge> = {
	flag: {
		label: 'Flag',
		colorVar: '--color-flag',
		tintVar: '--color-flag-tint',
		badgeStyle: 'background-color: var(--color-flag); color: var(--color-base-content)',
		badgeTintStyle: 'background-color: var(--color-flag-tint); color: var(--color-base-content)',
		darkTextColor: PRIORITY_BADGE_MAP.an_primary.darkTextColor,
		badgeCls: '',
		checkboxCls: 'checkbox-warning',
		buttonCls: 'btn-ghost'
	},
	no_flag: {
		label: 'No Flag',
		colorVar: '--color-no-flag',
		tintVar: '--color-no-flag-tint',
		badgeStyle: 'background-color: var(--color-no-flag); color: var(--color-base-content)',
		badgeTintStyle: 'background-color: var(--color-no-flag-tint); color: var(--color-base-content)',
		badgeCls: '',
		checkboxCls: 'checkbox-info',
		buttonCls: 'btn-ghost'
	},
	insufficient_evidence: {
		label: 'Insufficient Evidence',
		colorVar: '--color-insufficient',
		tintVar: '--color-insufficient-tint',
		badgeStyle: 'background-color: var(--color-insufficient); color: var(--color-base-content)',
		badgeTintStyle:
			'background-color: var(--color-insufficient-tint); color: var(--color-base-content)',
		darkTextColor: PRIORITY_BADGE_MAP.insufficient_evidence.darkTextColor,
		badgeCls: 'badge-warning',
		checkboxCls: 'checkbox-warning',
		buttonCls: 'btn-warning'
	},
	no_data: {
		label: 'No Data',
		colorVar: '--color-no-data',
		tintVar: '--color-no-data-tint',
		badgeStyle: 'background-color: var(--color-no-data); color: var(--color-base-content)',
		badgeTintStyle: 'background-color: var(--color-no-data-tint); color: var(--color-base-content)',
		darkTextColor: PRIORITY_BADGE_MAP.no_data.darkTextColor,
		badgeCls: 'badge-ghost',
		checkboxCls: 'checkbox-neutral',
		buttonCls: 'btn-neutral'
	}
};

/**
 * ACCESSOR: Get Flag Badge config.
 * Convention: camelCase with 'get' prefix.
 */
export const getFlagBadge = (key: string): FlagStatusBadge | undefined =>
	FLAG_BADGE_MAP[key as FlagStatus];

/**
 * ACCESSOR: Get Priority Badge config.
 * Convention: camelCase with 'get' prefix.
 */
export const getPriorityBadge = (key: string): FlagBadge | undefined =>
	PRIORITY_BADGE_MAP[key as PriorityFlag];

/**
 * Returns theme-aware inline style for a FlagStatusBadge.
 * Single source of truth for dark-mode text color logic across components.
 */
export function flagBadgeStyle(badge: FlagStatusBadge, isDark: boolean): string {
	const text = isDark
		? (badge.darkTextColor ?? 'var(--color-base-content)')
		: 'var(--color-base-content)';
	return `background-color: var(${badge.colorVar}); color: ${text}`;
}

/**
 * Returns theme-aware text color for a FlagBadge (priority flags).
 * Single source of truth — used by PriorityBadge.svelte.
 */
export function priorityBadgeTextColor(badge: FlagBadge, isDark: boolean): string {
	return isDark
		? (badge.darkTextColor ?? badge.textColor ?? 'var(--color-base-content)')
		: (badge.textColor ?? 'var(--color-base-content)');
}

