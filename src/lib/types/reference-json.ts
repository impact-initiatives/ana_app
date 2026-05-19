import { z } from 'zod';
import { SystemIDEnum } from './generated/system-enum';
import { SubFactorIDEnum } from './generated/subfactor-enum';
import { FactorIDEnum } from './generated/factor-enum';
import {
	type Thresholds,
	type Metric,
	type Indicator,
	type SubFactor,
	type Factor,
	type System,
	type ReferenceRoot,
	MetricPreferenceEnum,
	MetricDirectionEnum,
	EvidenceTypeEnum,
	METRIC_TYPE_REGEX,
	METRIC_ID_REGEX,
	parseMetricType
} from './structure';
export type { Thresholds, Metric, Indicator, SubFactor, Factor, System, ReferenceRoot as IndicatorsRoot };
export {
	MetricPreferenceEnum,
	MetricDirectionEnum,
	EvidenceTypeEnum,
	METRIC_TYPE_REGEX,
	METRIC_ID_REGEX,
	parseMetricType as parseIndicatorType
};
export type { ParsedMetricType as ParsedIndicatorType } from './structure';
export type { MetricID, MetricType as IndicatorType } from './structure';

/**
 * TypeScript types (exports) and Zod runtime schemas for the nested indicators JSON.
 *
 * - Use `validateIndicatorsRoot` to parse & validate (throws on invalid).
 * - Use `safeValidateIndicatorsRoot` to get a non-throwing result.
 *
 * ─── Type column syntax ───────────────────────────────────────────────────────
 *
 *   type  = base ( '[' range ']' )?
 *   base  = 'num' | 'int'
 *   range = bound ':' bound   (closed interval [lb, ub])
 *         | bound '+'          (half-open: value >= lb)
 *   bound = number             (integer or decimal)
 *
 *   Examples: num  num[0+]  num[0:1]  num[0:24]  int[0+]  int[0:1]  int[1:5]
 *
 *   null  → indicator has no type constraint (empty Type in source CSV).
 *           Structural validation still passes.
 *
 * ─── What this schema validates (structural only) ────────────────────────────
 *
 *   The Zod schema here is concerned with JSON structure only:
 *   - Field types and nullability.
 *   - `type` must match the syntax regex (or be null).
 *   - `van` cannot be non-null when `an` is null (structural dependency).
 *
 *   Type-bound checks — i.e. whether a user-supplied CSV cell value satisfies
 *   the constraints implied by the `type` string (int vs num, lb, ub) — are
 *   performed at the CSV validation stage in:
 *     src/lib/engine/validator.js → checkValueAgainstType()
 *   They are intentionally NOT enforced here.
 *
 * ─── Threshold fields ────────────────────────────────────────────────────────
 *
 *   - thresholds.an       : number | null  (acute needs threshold value)
 *   - thresholds.van      : number | null  (very acute needs threshold value)
 *   - thresholds.an_label : string | null  (label for UI display only)
 *   - thresholds.van_label: string | null  (label for UI display only)
 *   Label fields are never used for validation.
 *
 * ─── Required metric fields ─────────────────────────────────────────────────
 *
 *   - metric          : MET001, MET002, … (MET + 3+ digits)
 *   - preference      : 1 | 2 | 3
 *   - factor_threshold: number
 *   - above_or_below  : "Above" | "Below"
 *   - type            : type-syntax string or null
 */

// ── Zod schemas ──────────────────────────────────────────────────────────────

/**
 * Accepts a type string matching the type syntax, or null.
 * When null the indicator has no type constraint and type-bound checks are skipped.
 */
export const MetricTypeSchema = z
	.string()
	.regex(METRIC_TYPE_REGEX, {
		message: "type must match: 'num', 'int', 'num[lb:ub]', 'num[lb+]', 'int[lb:ub]', or 'int[lb+]'"
	})
	.nullable();

const ThresholdsSchema = z
	.object({
		an: z.number({ message: 'thresholds.an must be a number' }).nullable(),
		an_label: z.string().nullable().optional(),
		van: z.number().nullable().optional(),
		van_label: z.string().nullable().optional()
	})
	.strict();

export const MetricSchema = z
	.object({
		metric: z
			.string()
			.regex(METRIC_ID_REGEX, { message: 'metric must match MET followed by 3+ digits (e.g. MET001)' }),
		label: z.string().nullable().optional(),
		level: z.string().nullable().optional(),
		preference: z.enum(MetricPreferenceEnum),
		evidence_type: z
			.enum([
				EvidenceTypeEnum.SupportingEvidence,
				EvidenceTypeEnum.ANSignal,
				EvidenceTypeEnum.Outcome,
				EvidenceTypeEnum.Predictor
			])
			.nullable(),
		type: MetricTypeSchema,
		msna_module: z.string().nullable().optional(),
		msna_indicator: z.string().nullable().optional(),
		question_kobo_code: z.string().nullable().optional(),
		remarks_limitations: z.string().nullable().optional(),
		thresholds: ThresholdsSchema,
		factor_threshold: z
			.number({ message: 'factor_threshold must be a number' })
			.refine((v) => Number.isFinite(v), { message: 'factor_threshold must be finite' }),
		above_or_below: z.enum(MetricDirectionEnum, {
			message: 'above_or_below must be "Above" or "Below"'
		}),
		van_is_strict: z.boolean().nullable().optional().default(false),
		evidence_threshold: z.number().nullable().optional(),
		risk_concept: z.string().nullable().optional()
	})
	.superRefine((m, ctx) => {
		const { thresholds } = m;

		// ── Rule: van requires an ─────────────────────────────────────────────
		// This is a structural constraint on the JSON itself.
		// Type-bound checks (int/num, lb, ub) are performed at the CSV
		// validation stage in src/lib/engine/validator.js, not here.
		//
		// The semantic rule "non-supporting-evidence metrics must have van" is
		// enforced separately in scripts/validate-reference-json.ts Pass 8,
		// which produces a richer diagnostic table.
		if (thresholds.van != null && thresholds.an == null) {
			ctx.addIssue({
				path: ['thresholds', 'van'],
				code: z.ZodIssueCode.custom,
				message: 'thresholds.van cannot be set without thresholds.an'
			});
		}
	})
	.strict();

export const IndicatorSchema = z
	.object({
		id: z.string(),
		label: z.string().nullable().optional(),
		metrics: z.array(MetricSchema)
	})
	.strict();

const SubFactorSchema = z
	.object({
		id: z.enum(SubFactorIDEnum),
		label: z.string().nullable().optional(),
		indicators: z.array(IndicatorSchema)
	})
	.strict();

const FactorSchema = z
	.object({
		id: z.enum(FactorIDEnum),
		label: z.string().nullable().optional(),
		sub_factors: z.array(SubFactorSchema)
	})
	.strict();

const SystemSchema = z
	.object({
		id: z.enum(SystemIDEnum),
		label: z.string().nullable().optional(),
		factors: z.array(FactorSchema)
	})
	.strict();

export const ReferenceRootSchema = z
	.object({
		generatedAt: z.string().datetime().optional(),
		systems: z.array(SystemSchema)
	})
	.strict();

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Validate & parse (throws ZodError if invalid).
 */
export function validateReferenceRoot(data: unknown): ReferenceRoot {
	return ReferenceRootSchema.parse(data) as ReferenceRoot;
}

/**
 * Safe parse: returns `{ success: true, data }` or `{ success: false, error }`.
 */
export function safeValidateReferenceRoot(data: unknown) {
	return ReferenceRootSchema.safeParse(data);
}

/**
 * Returns an array of user-friendly error messages from a failed Zod parse.
 * Useful for displaying validation errors in the UI.
 */
export function formatZodErrors(err: unknown): string[] {
	if (!err || typeof err !== 'object') return ['Unknown error'];
	const anyErr = err as Record<string, unknown>;
	if (Array.isArray(anyErr['issues'])) {
		return (anyErr['issues'] as Array<Record<string, unknown>>).map((issue) => {
			const path =
				Array.isArray(issue['path']) && issue['path'].length
					? (issue['path'] as unknown[]).join('.')
					: '(root)';
			return `${path}: ${issue['message']}`;
		});
	}
	if (typeof anyErr['message'] === 'string') return [anyErr['message']];
	return ['Validation failed'];
}
