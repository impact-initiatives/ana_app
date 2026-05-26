#!/usr/bin/env bun
/**
 * scripts/validate-hypotheses-json.ts
 *
 * Validates `static/data/hypotheses.json` in two passes:
 *
 * Pass 1 — Zod schema (imported from src/lib/types/hypotheses.ts)
 *   Checks structural correctness: required fields, types, optional colorHex.
 *   `hypothesesId` is any non-empty string — system IDs and custom slugs valid.
 *
 * Pass 2 — Semantic checks
 *   · Errors on duplicate hypothesesId values.
 *   · Warns for any SystemIDEnum value that has no matching hypothesesId entry.
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
import { HypothesesDataSchema } from '../src/lib/types/hypotheses';
import { SystemIDs } from '../src/lib/types/structure';

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULTS = {
	json: path.join(process.cwd(), 'static', 'data', 'hypotheses.json')
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
validate-hypotheses-json.ts — Validate hypotheses.json against schema

Usage:
  bun ./scripts/validate-hypotheses-json.ts [flags]

Flags:
  --json   <path>   Hypotheses JSON to validate
                    (default: static/data/hypotheses.json)
  --help, -h        Print this help and exit

Schema: src/lib/types/hypotheses.ts (HypothesesDataSchema)
`);
}

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

// ── Pass 2: Semantic checks ───────────────────────────────────────────────────

interface SemanticResult {
	errors: string[];
	warnings: string[];
}

function checkSemantics(data: unknown): SemanticResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	const entries = data as Array<{ hypothesesId: string }>;

	// Duplicate hypothesesId check
	const seen = new Map<string, number[]>();
	for (let i = 0; i < entries.length; i++) {
		const id = entries[i].hypothesesId;
		if (!seen.has(id)) seen.set(id, []);
		seen.get(id)!.push(i);
	}
	for (const [id, indices] of seen) {
		if (indices.length > 1) {
			errors.push(`Duplicate hypothesesId "${id}" at indices [${indices.join(', ')}]`);
		}
	}

	// Missing systems warning — non-system hypothesesId values simply won't match
	const presentIds = new Set(entries.map((e) => e.hypothesesId));
	for (const id of SystemIDs) {
		if (!presentIds.has(id)) {
			warnings.push(
				`systemId "${id}" (from SystemIDEnum) has no entry in this file — OK if that system carries no hypotheses`
			);
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

	if (!fs.existsSync(args.jsonPath)) {
		console.error(`File not found: ${args.jsonPath}`);
		process.exitCode = 2;
		return;
	}

	let data: unknown;
	try {
		data = JSON.parse(fs.readFileSync(args.jsonPath, 'utf-8'));
	} catch (err) {
		console.error('Failed to read/parse JSON:', err);
		process.exitCode = 2;
		return;
	}

	let pass1Ok = false;
	let pass2Ok = false;

	console.log('Pass 1 — Zod schema...');
	const zodResult = HypothesesDataSchema.safeParse(data);
	if (zodResult.success) {
		console.log('  ✅ Passed');
		pass1Ok = true;
	} else {
		console.error('  ❌ Failed');
		formatZodErrors(zodResult.error).forEach((m) => console.error('  -', m));
	}

	console.log('\nPass 2 — Semantic checks...');
	if (!pass1Ok) {
		console.log('  ⏭  Skipped (Pass 1 failed)');
	} else {
		const { errors, warnings } = checkSemantics(data);
		warnings.forEach((w) => console.warn('  ⚠️  Warning:', w));
		if (errors.length === 0) {
			console.log('  ✅ Passed');
			pass2Ok = true;
		} else {
			console.error('  ❌ Failed');
			errors.forEach((e) => console.error('  -', e));
		}
	}

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
