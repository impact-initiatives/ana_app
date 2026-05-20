#!/usr/bin/env bun
/**
 * scripts/validate-hypotheses-json.ts
 *
 * Validates `static/data/hypotheses.json` in two passes:
 *
 * Pass 1 — Zod schema
 *   Checks structural correctness: required fields, types, and that every
 *   `systemId` is a known value from SystemIDEnum.
 *
 * Pass 2 — Semantic checks
 *   · Warns for any SystemIDEnum value that has no entry in the file
 *     (missing systems are not a hard error — some systems legitimately
 *     carry no hypotheses, e.g. market_functionality).
 *   · Errors on duplicate systemId values.
 *
 * Usage:
 *   bun ./scripts/validate-hypotheses-json.ts
 *   bun ./scripts/validate-hypotheses-json.ts --json static/data/hypotheses.json
 *   bun ./scripts/validate-hypotheses-json.ts --help
 *
 * Exit codes:
 *   0 — all checks passed (warnings do not affect the exit code)
 *   1 — one or more validation errors
 *   2 — I/O or parse error (file not found, invalid JSON)
 */

import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { SystemIDEnum, SystemIDs } from '../src/lib/types/structure';

// ── Defaults ──────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'static', 'data');

const DEFAULTS = {
	json: path.join(DATA_DIR, 'hypotheses.json')
};

// ── CLI ───────────────────────────────────────────────────────────────────────

interface Args {
	jsonPath: string;
	help: boolean;
}

function parseArgs(argv: string[]): Args {
	let jsonPath = DEFAULTS.json;
	let help = false;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--help' || arg === '-h') {
			help = true;
		} else if (arg === '--json' && argv[i + 1]) {
			jsonPath = path.resolve(argv[++i]);
		}
	}

	return { jsonPath, help };
}

function printHelp(): void {
	console.log(`
validate-hypotheses-json.ts — Validate hypotheses.json against Zod schema

Usage:
  bun ./scripts/validate-hypotheses-json.ts [flags]

Flags:
  --json   <path>   Hypotheses JSON to validate
                    (default: static/data/hypotheses.json)
  --help, -h        Print this help and exit

Checks performed:

  Pass 1 — Zod schema
    · Each entry has systemId (must be a known SystemIDEnum value),
      systemLabel (string), and hypotheses (array of { id, description }).

  Pass 2 — Semantic checks
    · Errors on duplicate systemId values.
    · Warns for SystemIDEnum values absent from the file
      (not a hard error — some systems may carry no hypotheses).
`);
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const HypothesisEntrySchema = z
	.object({
		id: z.string().min(1, { message: 'id must be a non-empty string' }),
		description: z.string().min(1, { message: 'description must be a non-empty string' })
	})
	.strict();

const SystemHypothesesSchema = z
	.object({
		systemId: z.enum(SystemIDEnum, {
			message: `systemId must be one of: ${Object.values(SystemIDEnum).join(', ')}`
		}),
		systemLabel: z.string().min(1, { message: 'systemLabel must be a non-empty string' }),
		hypotheses: z.array(HypothesisEntrySchema)
	})
	.strict();

const HypothesesDataSchema = z.array(SystemHypothesesSchema);

// ── Error formatting ──────────────────────────────────────────────────────────

function formatZodErrors(err: unknown): string[] {
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
	return [String(err)];
}

// ── Pass 2: Semantic checks ───────────────────────────────────────────────────

interface SemanticResult {
	errors: string[];
	warnings: string[];
}

function checkSemantics(data: unknown): SemanticResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Cast — Zod pass confirmed shape.
	const entries = data as Array<{ systemId: string }>;

	// Duplicate systemId check
	const seen = new Map<string, number[]>();
	for (let i = 0; i < entries.length; i++) {
		const id = entries[i].systemId;
		if (!seen.has(id)) seen.set(id, []);
		seen.get(id)!.push(i);
	}
	for (const [id, indices] of seen) {
		if (indices.length > 1) {
			errors.push(
				`Duplicate systemId "${id}" at indices [${indices.join(', ')}]`
			);
		}
	}

	// Missing systems warning
	const presentIds = new Set(entries.map((e) => e.systemId));
	const missing = SystemIDs.filter((id) => !presentIds.has(id));
	for (const id of missing) {
		warnings.push(
			`systemId "${id}" (from SystemIDEnum) has no entry in this file — OK if that system carries no hypotheses`
		);
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

	const { jsonPath } = args;

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
	const zodResult = HypothesesDataSchema.safeParse(data);

	if (zodResult.success) {
		console.log('  ✅ Passed');
		pass1Ok = true;
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
		const { errors, warnings } = checkSemantics(data);

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
