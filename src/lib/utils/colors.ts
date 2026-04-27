/**
 * Shared colour helpers for flag-status visualisations.
 *
 * Single source of truth: colour values are defined as CSS custom properties
 * in src/app.css under @theme. Tailwind v4 generates utility classes from
 * them automatically:
 *
 *   bg-flag, text-flag, border-flag
 *   bg-no-flag, text-no-flag
 *   bg-insufficient, text-insufficient
 *   bg-no-data, text-no-data
 *   bg-within10, text-within10
 *   bg-flag-tint, bg-no-flag-tint, bg-insufficient-tint, bg-no-data-tint
 *
 * SVG attributes (fill, stroke) accept CSS var() strings natively, so no
 * JS constants or runtime DOM reads are needed for the legacy helpers.
 *
 * This file extends the helpers with:
 * - per-system base colours
 * - palette generation for factors and sub-factors (nuanced shades)
 * - a tiny tooltip formatter for indicator objects
 *
 * Status vocabulary (all levels — indicator, subfactor, factor, system):
 *   'flag'                  — threshold crossed / acute needs detected
 *   'no_flag'               — enough evidence to conclude no acute needs
 *   'insufficient_evidence' — some data present but not enough to conclude
 *   'no_data'               — no data at all for this level
 *
 * Migration note from previous version:
 *   - {id}_flag_label is now {id}_status
 *   - FLAG_BADGE key: 'no_flag'
 *   - PRELIM_FLAG_BADGE gains 'NO_DATA' entry
 *   - STATUS_TO_BADGE_KEY added for mapping .status values to FLAG_BADGE keys
 */

import type { Metric } from '$lib/types/structure';
import type { FlagStatus, PrelimFlag } from '$lib/types/flags';

// ── Fill ─────────────────────────────────────────────────────────────────────

/**
 * SVG fill for a dot based on its status value.
 * Returns a CSS var() string — the browser resolves it natively.
 *
 * @param status - 'flag' | 'no_flag' | 'no_data'
 */
export function dotFill(status: string): string {
	if (status === 'flag') return 'var(--color-flag)';
	if (status === 'no_flag') return 'var(--color-no-flag)';
	return 'var(--color-no-data)';
}

// ── Stroke ────────────────────────────────────────────────────────────────────

/**
 * SVG stroke for a dot based on status and proximity to the AN threshold.
 *
 * - no_flag + within10 → amber ring  (border-line, not yet flagged)
 * - flag    + within10 → dark-red ring (barely flagged)
 * - anything else      → white (neutral outline)
 *
 * @param status   - 'flag' | 'no_flag' | 'no_data'
 * @param within10 - boolean | null
 */
export function dotStroke(_status: string, within10: boolean | null): string {
	if (within10) return 'var(--color-within10)';
	return 'none';
}

// ── Tile class ────────────────────────────────────────────────────────────────

/**
 * Tailwind class string for an overview heatmap tile.
 * Uses classes generated from the @theme tokens defined in app.css.
 *
 * @param flagN  - number of flagged indicators in the cell
 * @param avail  - number of indicators with data
 * @param active - whether the cell is currently selected/active
 */
export function tileCssClass(flagN: number, avail: number, active: boolean): string {
	const ring = active ? ' ring-3 ring-primary ring-offset-0' : '';
	if (avail === 0) return `text-base-content/40${ring}`;
	if (flagN === 0) return `text-base-content hover:brightness-95${ring}`;
	return `text-base-content hover:brightness-95${ring}`;
}

/**
 * Inline style string (background-color) for an overview heatmap tile.
 * Use this alongside tileCssClass to apply background via CSS vars,
 * which works regardless of whether Tailwind generates utility classes for them.
 */
export function tileStyle(flagN: number, avail: number): string {
	const text = 'color: var(--color-base-content)';
	if (avail === 0) return `background-color: var(--color-no-data-tint); ${text}`;
	if (flagN === 0) return `background-color: var(--color-no-flag-tint); ${text}`;
	return `background-color: var(--color-flag-tint); ${text}`;
}

// ── System colour ramp ────────────────────────────────────────────────────────
//
// Source of truth: CSS custom properties in src/app.css (:root block).
// Change a hex value there and the entire ramp auto-follows via color-mix.
// These helpers are pure string lookups — no JS colour math.
//
// Ramp levels (d1–d5) per system, all resolved by the browser:
//   d1 → system        (10%)   depth 1
//   d2 → factor        (40%)   depth 2
//   d3 → subfactor     (70%)   depth 3
//   d4 → indicator     (90%)   depth 4
//   d5 → metric        (100%)  depth 5

/** CSS var name (without `var()`) for a given system ID. */
const SYSTEM_CSS_VAR: Record<string, string> = {
	food_systems: '--color-sys-food-systems',
	water_systems: '--color-sys-water-systems',
	health_outcomes: '--color-sys-health-outcomes',
	mortality: '--color-sys-mortality',
	living_conditions: '--color-sys-living-conditions',
	market_functionality: '--color-sys-market-functionality',
	health_nutrition_services: '--color-sys-health-nutrition-services',
	protection: '--color-sys-protection',
	default: '--color-sys-default'
};

/** Returns the base `--color-sys-*` var name for a system id (no `var()` wrapper). */
function sysVarName(systemId: string | undefined | null): string {
	const key = systemId ? String(systemId) : 'default';
	return SYSTEM_CSS_VAR[key] ?? SYSTEM_CSS_VAR.default;
}

/** CSS `var()` string for the system's base colour (full opacity / depth 5). */
export function systemBaseColor(systemId: string | undefined | null): string {
	return `var(${sysVarName(systemId)})`;
}

/** Fill colour for a system-level circle (depth 1 — 10%). */
export function systemFillColor(systemId: string | undefined | null): string {
	return `var(${sysVarName(systemId)}-d1)`;
}

/** Fill colour for a factor circle (depth 2 — 40%). */
export function factorColor(systemId: string, _factorIndex: number, _factorCount?: number): string {
	void _factorIndex;
	void _factorCount;
	return `var(${sysVarName(systemId)}-d2)`;
}

/** Fill colour for a sub-factor circle (depth 3 — 70%). */
export function subfactorColor(
	systemId: string,
	_factorIndex: number,
	_subfactorIndex: number,
	_subfactorCount?: number
): string {
	void _factorIndex;
	void _subfactorIndex;
	void _subfactorCount;
	return `var(${sysVarName(systemId)}-d3)`;
}

/** Fill colour for an indicator circle (depth 4 — 90%). */
export function indicatorFillColor(systemId: string | undefined | null): string {
	return `var(${sysVarName(systemId)}-d4)`;
}

/** Fill colour for a metric circle (depth 5 — 100%). */
export function metricFillColor(systemId: string | undefined | null): string {
	return `var(${sysVarName(systemId)}-d5)`;
}

/** Convenience wrapper: returns the right fill string for any hierarchy level. */
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

/**
 * Lightweight plain-text tooltip formatter for a metric object.
 */
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

// ── Preliminary classification badges ────────────────────────────────────────

export interface FlagBadge {
	/** CSS var() string for the background colour */
	bg: string;
	/** CSS var() string for the tinted background colour (optional) */
	tintBg?: string;
	/** Human-readable label */
	label: string;
}

// ── Indicator / subfactor / factor / system status badges ─────────────────────

export interface FlagStatusBadge {
	/** Human-readable label — single source of truth for display */
	label: string;
	/** CSS custom property name (without var()) for the solid colour */
	colorVar: string;
	/** CSS custom property name (without var()) for the tint background colour */
	tintVar: string;
	/** Inline style string for badge rendering — solid colour background */
	badgeStyle: string;
	/** Inline style string for badge rendering — tinted background */
	badgeTintStyle: string;
	/** DaisyUI badge modifier class — kept for legacy fallbacks; prefer badgeStyle */
	badgeCls: string;
	/** DaisyUI checkbox modifier class, e.g. "checkbox-warning" */
	checkboxCls: string;
	/** DaisyUI button modifier class, e.g. "btn-ghost" */
	buttonCls: string;
}

/**
 * Display metadata for status values used at all levels (indicator, subfactor,
 * factor, system). Keys match the status vocabulary emitted by flagger.ts:
 *
 *   'flag'                  — threshold crossed
 *   'no_flag'               — enough evidence to conclude no acute needs
 *   'insufficient_evidence' — some data but not enough to conclude
 *   'no_data'               — no data at all
 */
export const FLAG_BADGE: Record<FlagStatus, FlagStatusBadge> = {
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
 * Maps flagger .status values to FLAG_BADGE keys.
 * Use this when displaying subfactor/factor/system status in the UI
 * via FLAG_BADGE for consistent styling.
 *
 * All keys are identical so this is a direct pass-through — but the
 * explicit map makes the contract clear and survives future key changes.
 */
export const STATUS_TO_BADGE_KEY: Record<FlagStatus, FlagStatus> = {
	flag: 'flag',
	no_flag: 'no_flag',
	insufficient_evidence: 'insufficient_evidence',
	no_data: 'no_data'
};

/**
 * Colour and label map for `prelim_flag` classification values.
 * Keys match the string values produced by the decision tree in flagger.tss.
 * Background colours reference CSS custom properties defined in app.css.
 */
export const PRELIM_FLAG_BADGE: Record<PrelimFlag, FlagBadge> = {
	em: { bg: 'var(--color-em)', label: 'Emergency' },
	roem: { bg: 'var(--color-roem)', label: 'Risk of Emergency' },
	acute: { bg: 'var(--color-acute)', label: 'Acute Needs' },
	acute_needs: { bg: 'var(--color-no-acute)', label: 'No Acute Needs' },
	insufficient_evidence: { bg: 'var(--color-insufficient)', label: 'Insufficient Evidence' },
	no_data: { bg: 'var(--color-no-data)', tintBg: 'var(--color-no-data-tint)', label: 'No Data' }
};
