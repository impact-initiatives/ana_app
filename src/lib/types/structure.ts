/**
 * src/lib/types/structure.ts
 *
 * Canonical data-shape types for reference.json.
 * No Zod, no validation logic — pure types, enums, and type-parsing utilities.
 *
 * Imported by:
 *   - src/lib/types/indicators.ts  (Zod schemas + validation helpers)
 *   - scripts/generate-indicators-json.ts  (CSV → JSON generation)
 */

// ── Primitive type aliases ────────────────────────────────────────────────────

/** A metric ID string, e.g. 'MET001'. */
export type MetricID = string;

/** A valid type string (e.g. 'num[0:1]', 'int[0+]') or null when unset. */
export type MetricType = string | null;

// ── Enums ─────────────────────────────────────────────────────────────────────

export enum MetricPreferenceEnum {
	One = 1,
	Two = 2,
	Three = 3
}

export enum MetricDirectionEnum {
	Above = 'Above',
	Below = 'Below'
}

export enum EvidenceTypeEnum {
	SupportingEvidence = 'Supporting evidence',
	ANSignal = 'AN signal',
	Outcome = 'Outcome',
	Predictor = 'Predictor'
}

// ── Type-string parsing ───────────────────────────────────────────────────────

/**
 * Regex matching valid metric ID strings: MET followed by 3 or more digits.
 * e.g. MET001, MET099, MET100, MET1000
 */
export const METRIC_ID_REGEX = /^MET\d{3,}$/;

/**
 * Regex matching valid indicator type strings.
 *
 *   base ( '[' bound ( ':' bound | '+' ) ']' )?
 *   base  = 'num' | 'int'
 *   bound = integer or decimal number
 *
 * Examples: num  num[0+]  num[0:1]  num[0:24]  int[0+]  int[0:1]  int[1:5]
 */
export const METRIC_TYPE_REGEX =
	/^(?:num|int)(?:\[(\d+(?:\.\d+)?)(?::(\d+(?:\.\d+)?)|(\+))\])?$/;

export interface ParsedMetricType {
	base: 'num' | 'int';
	/** Lower bound (inclusive), or null if no range specified. */
	lb: number | null;
	/** Upper bound (inclusive), or null if half-open or no range. */
	ub: number | null;
	/** True when the range uses the `lb+` (half-open) syntax. */
	isOpen: boolean;
}

/** Parse a type string into its components. Returns null if the format is unrecognised. */
export function parseMetricType(type: string): ParsedMetricType | null {
	const m = type.match(/^(num|int)(?:\[(\d+(?:\.\d+)?)(?::(\d+(?:\.\d+)?)|(\+))\])?$/);
	if (!m) return null;
	return {
		base: m[1] as 'num' | 'int',
		lb: m[2] != null ? Number(m[2]) : null,
		ub: m[3] != null ? Number(m[3]) : null,
		isOpen: m[4] === '+'
	};
}

// ── Data interfaces ───────────────────────────────────────────────────────────

export interface Thresholds {
	an: number | null;
	an_label?: string | null;
	van?: number | null;
	van_label?: string | null;
}

/**
 * A single measurable metric — the leaf of the indicator hierarchy.
 * One row in reference.csv = one Metric (identified by Metric ID, e.g. MET001).
 */
export interface Metric {
	metric: MetricID;
	/** The "Metric" column — human-readable label of the measurement. */
	label?: string | null;
	level?: string | null;
	preference: number;
	evidence_type: string | null;
	type: MetricType;
	msna_module?: string | null;
	msna_indicator?: string | null;
	question_kobo_code?: string | null;
	remarks_limitations?: string | null;
	thresholds: Thresholds;
	above_or_below: string;
	evidence_threshold?: number | null;
	factor_threshold: number;
	risk_concept?: string | null;
}

/**
 * An indicator — a thematic grouping of one or more metrics.
 * Corresponds to the "Indicator" column in the reference CSV.
 */
export interface Indicator {
	id: string;
	label?: string | null;
	metrics: Metric[];
}

export interface SubFactor {
	id: string;
	label?: string | null;
	indicators: Indicator[];
}

export interface Factor {
	id: string;
	label?: string | null;
	sub_factors: SubFactor[];
}

export interface System {
	id: string;
	label?: string | null;
	factors: Factor[];
}

export interface ReferenceRoot {
	generatedAt?: string;
	systems: System[];
}
