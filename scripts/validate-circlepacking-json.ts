#!/usr/bin/env bun
/**
 * scripts/validate-circlepacking-json.ts
 *
 * Validates `static/data/reference-circlepacking.json` in two passes:
 *
 * Pass 1 — Zod schema
 *   Checks structural correctness of the tree:
 *   · Root node must have id "root".
 *   · Every internal node has name (string) and id (string).
 *   · Leaf nodes (no children) must have:
 *       - value: integer 1–3
 *       - metric: full Metric object (reuses MetricSchema)
 *       - id matching the metric.metric field (MET001..METnnn)
 *   · System-level children ids (depth 1) must be known SystemIDEnum values.
 *
 * Pass 2 — Semantic checks
 *   · Every leaf id matches METRIC_ID_REGEX (MET + 3+ digits).
 *   · Every leaf metric.metric === the leaf's own id.
 *   · Warns for SystemIDEnum values absent from the tree (not a hard error).
 *   · Optional: --indicators <path> cross-checks all leaf metric ids
 *     against reference.json to ensure consistency between the two files.
 *
 * Usage:
 *   bun ./scripts/validate-circlepacking-json.ts
 *   bun ./scripts/validate-circlepacking-json.ts --json static/data/reference-circlepacking.json
 *   bun ./scripts/validate-circlepacking-json.ts --indicators static/data/reference.json
 *   bun ./scripts/validate-circlepacking-json.ts --help
 *
 * Exit codes:
 *   0 — all checks passed (warnings do not affect the exit code)
 *   1 — one or more validation errors
 *   2 — I/O or parse error (file not found, invalid JSON)
 */

import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { SystemIDEnum, SystemIDs } from '../src/lib/types/generated/system-enum';
import { MetricSchema } from '../src/lib/types/reference-json';
import { METRIC_ID_REGEX } from '../src/lib/types/structure';

// ── Defaults ──────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'static', 'data');

const DEFAULTS = {
	json: path.join(DATA_DIR, 'reference-circlepacking.json'),
	indicators: path.join(DATA_DIR, 'reference.json')
};

// ── CLI ───────────────────────────────────────────────────────────────────────

interface Args {
	jsonPath: string;
	indicatorsPath: string | null;
	help: boolean;
}

function parseArgs(argv: string[]): Args {
	let jsonPath = DEFAULTS.json;
	let indicatorsPath: string | null = null;
	let help = false;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--help' || arg === '-h') {
			help = true;
		} else if (arg === '--json' && argv[i + 1]) {
			jsonPath = path.resolve(argv[++i]);
		} else if (arg === '--indicators' && argv[i + 1]) {
			indicatorsPath = path.resolve(argv[++i]);
		}
	}

	return { jsonPath, indicatorsPath, help };
}

function printHelp(): void {
	console.log(`
validate-circlepacking-json.ts — Validate indicators-circlepacking.json

Usage:
  bun ./scripts/validate-circlepacking-json.ts [flags]

Flags:
  --json        <path>   Circle-packing JSON to validate
                         (default: static/data/reference-circlepacking.json)
  --indicators  <path>   Optional: cross-check leaf metric ids against
                         reference.json (default: static/data/reference.json).
                         Only used when the flag is explicitly provided.
  --help, -h             Print this help and exit

Checks performed:

  Pass 1 — Zod schema
    · Root node has id "root".
    · All nodes carry name (string) and id (string).
    · Leaf nodes (no children) have value (int 1–3) and a valid metric object.
    · System-level child ids must be known SystemIDEnum values.

  Pass 2 — Semantic checks
    · Every leaf id matches MET + 3 or more digits.
    · Every leaf metric.metric matches the leaf's own id.
    · Warns for SystemIDEnum values absent from the tree.
    · (with --indicators) All leaf metric ids exist in reference.json.
`);
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

// Recursive tree node using z.lazy().
// Leaf node = no children field, has value + indicator.
// Internal node = has children array, no value/indicator required.
type CircleNode = {
	name: string;
	id: string;
	value?: number;
	children?: CircleNode[];
	metric?: unknown;
};

const CircleNodeSchema: z.ZodType<CircleNode> = z.lazy(() =>
	z
		.object({
			name: z.string(),
			id: z.string(),
			value: z.number().int().min(1).max(3).optional(),
			children: z.array(CircleNodeSchema).optional(),
			metric: MetricSchema.optional()
		})
		.superRefine((node, ctx) => {
			const isLeaf = !node.children || node.children.length === 0;

			if (isLeaf) {
				// Leaf must have value
				if (node.value === undefined) {
					ctx.addIssue({
						path: ['value'],
						code: z.ZodIssueCode.custom,
						message: 'leaf node must have a numeric value (1–3)'
					});
				}
				// Leaf must have metric
				if (node.metric === undefined) {
					ctx.addIssue({
						path: ['metric'],
						code: z.ZodIssueCode.custom,
						message: 'leaf node must have a metric object'
					});
				}
				// Leaf id must match metric ID regex
				if (!METRIC_ID_REGEX.test(node.id)) {
					ctx.addIssue({
						path: ['id'],
						code: z.ZodIssueCode.custom,
						message: `leaf id "${node.id}" must match MET + 3 or more digits (e.g. MET001)`
					});
				}
			}
		})
);

const CirclePackingRootSchema = z
	.object({
		name: z.string(),
		id: z.literal('root'),
		children: z.array(
			z
				.object({
					name: z.string(),
					id: z.enum(SystemIDEnum, {
						message: `system id must be one of: ${Object.values(SystemIDEnum).join(', ')}`
					}),
					children: z.array(CircleNodeSchema).optional()
				})
				.passthrough()
		)
	})
	.passthrough();

// ── Error formatting ──────────────────────────────────────────────────────────

function formatZodErrors(err: unknown): string[] {
	if (!err || typeof err !== 'object') return ['Unknown error'];
	const anyErr = err as Record<string, unknown>;
	if (Array.isArray(anyErr['issues'])) {
		return (anyErr['issues'] as Array<Record<string, unknown>>).map((issue) => {
			const p =
				Array.isArray(issue['path']) && issue['path'].length
					? (issue['path'] as unknown[]).join('.')
					: '(root)';
			return `${p}: ${issue['message']}`;
		});
	}
	return [String(err)];
}

// ── Walk tree helpers ─────────────────────────────────────────────────────────

interface LeafInfo {
	path: string;
	id: string;
	metricId: unknown;
}

function collectLeaves(node: unknown, currentPath: string): LeafInfo[] {
	const n = node as {
		id?: unknown;
		children?: unknown[];
		metric?: { metric?: unknown };
	};
	const children = n.children;

	if (!children || children.length === 0) {
		return [
			{
				path: currentPath,
				id: String(n.id ?? ''),
				metricId: n.metric?.metric
			}
		];
	}

	const leaves: LeafInfo[] = [];
	for (let i = 0; i < children.length; i++) {
		leaves.push(...collectLeaves(children[i], `${currentPath}.children[${i}]`));
	}
	return leaves;
}

function collectSystemIds(root: unknown): string[] {
	const r = root as { children?: Array<{ id?: unknown }> };
	return (r.children ?? []).map((c) => String(c.id ?? ''));
}

// ── Pass 2: Semantic checks ───────────────────────────────────────────────────

interface SemanticResult {
	errors: string[];
	warnings: string[];
}

function checkSemantics(data: unknown, indicatorsPath: string | null): SemanticResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Collect system ids and warn on missing ones
	const presentSystemIds = new Set(collectSystemIds(data));
	for (const id of SystemIDs) {
		if (!presentSystemIds.has(id)) {
			warnings.push(
				`system "${id}" (from SystemIDEnum) has no node in the tree — OK if that system has no indicators`
			);
		}
	}

	// Collect all leaves
	const leaves = collectLeaves(data, 'root');

	// Check leaf id vs metric.metric consistency
	for (const leaf of leaves) {
		if (!METRIC_ID_REGEX.test(leaf.id)) {
			errors.push(`${leaf.path}: leaf id "${leaf.id}" does not match MET + 3 or more digits`);
		}
		if (leaf.metricId !== leaf.id) {
			errors.push(
				`${leaf.path}: leaf id "${leaf.id}" does not match metric.metric "${leaf.metricId}"`
			);
		}
	}

	// Optional cross-check against reference.json
	if (indicatorsPath !== null) {
		if (!fs.existsSync(indicatorsPath)) {
			errors.push(`--indicators file not found: ${indicatorsPath}`);
		} else {
			let indicatorsData: unknown;
			try {
				indicatorsData = JSON.parse(fs.readFileSync(indicatorsPath, 'utf-8'));
			} catch {
				errors.push(`Failed to parse indicators JSON: ${indicatorsPath}`);
				indicatorsData = null;
			}

			if (indicatorsData) {
				// Collect all indicator ids from reference.json
				const knownIds = new Set<string>();
				const root = indicatorsData as {
					systems?: Array<{
						factors?: Array<{
							sub_factors?: Array<{
								indicators?: Array<{ indicator?: string }>;
							}>;
						}>;
					}>;
				};
				for (const sys of root.systems ?? []) {
					for (const fac of sys.factors ?? []) {
						for (const sf of fac.sub_factors ?? []) {
							for (const ind of sf.indicators ?? []) {
								if (ind.indicator) knownIds.add(ind.indicator);
							}
						}
					}
				}

				for (const leaf of leaves) {
					if (!knownIds.has(leaf.id)) {
						errors.push(
							`${leaf.path}: leaf id "${leaf.id}" not found in reference.json`
						);
					}
				}
			}
		}
	}

	return { errors, warnings };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));

	if (args.help) {
		printHelp();
		process.exitCode = 0;
		return;
	}

	const { jsonPath, indicatorsPath } = args;

	// ── Load JSON ──────────────────────────────────────────────────────────────
	if (!fs.existsSync(jsonPath)) {
		console.error(`File not found: ${jsonPath}`);
		process.exitCode = 2;
		return;
	}

	let raw: string;
	try {
		raw = fs.readFileSync(jsonPath, 'utf-8');
	} catch (err) {
		console.error('Failed to read file:', err);
		process.exitCode = 2;
		return;
	}

	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch (err) {
		console.error('Failed to parse JSON:', err);
		process.exitCode = 2;
		return;
	}

	let pass1Ok = false;
	let pass2Ok = false;

	// ── Pass 1: Zod schema ─────────────────────────────────────────────────────
	console.log('Pass 1 — Zod schema...');
	const zodResult = CirclePackingRootSchema.safeParse(data);

	if (zodResult.success) {
		// Also validate the full recursive tree (system-level children validated above,
		// deeper levels validated here)
		const deepErrors: string[] = [];
		const root = data as { children?: Array<{ children?: unknown[] }> };
		for (let si = 0; si < (root.children?.length ?? 0); si++) {
			const sys = root.children![si];
			for (let fi = 0; fi < (sys.children?.length ?? 0); fi++) {
				const child = sys.children![fi];
				const deepResult = CircleNodeSchema.safeParse(child);
				if (!deepResult.success) {
					const msgs = formatZodErrors(deepResult.error);
					for (const m of msgs) {
						deepErrors.push(`root.children[${si}].children[${fi}].${m}`);
					}
				}
			}
		}

		if (deepErrors.length === 0) {
			console.log('  ✅ Passed');
			pass1Ok = true;
		} else {
			console.error('  ❌ Failed');
			deepErrors.forEach((m) => console.error('  -', m));
		}
	} else {
		console.error('  ❌ Failed');
		const messages = formatZodErrors(zodResult.error);
		messages.forEach((m) => console.error('  -', m));
	}

	// ── Pass 2: Semantic checks ────────────────────────────────────────────────
	console.log('\nPass 2 — Semantic checks...');

	if (!pass1Ok) {
		console.log('  ⏭  Skipped (Pass 1 failed)');
	} else {
		const { errors, warnings } = checkSemantics(data, indicatorsPath);

		for (const w of warnings) {
			console.warn('  ⚠️  Warning:', w);
		}

		if (errors.length === 0) {
			console.log('  ✅ Passed');
			pass2Ok = true;
		} else {
			console.error('  ❌ Failed');
			for (const e of errors) {
				console.error('  -', e);
			}
		}
	}

	// ── Result ─────────────────────────────────────────────────────────────────
	console.log('');
	if (pass1Ok && pass2Ok) {
		console.log('Validation passed ✅');
		process.exitCode = 0;
	} else {
		console.error('Validation failed ❌');
		process.exitCode = 1;
	}
}

main().catch((err) => {
	console.error('Unexpected error:', err);
	process.exitCode = 2;
});
