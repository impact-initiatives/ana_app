#!/usr/bin/env bun
/**
 * Script: generate-system-enum.ts
 *
 * Reads `static/data/system.csv` and generates a TypeScript file exporting a string enum
 * `SystemIDEnum` into `src/lib/types/generated/system-enum.ts`.
 *
 * Usage:
 *   bun ./scripts/generate-system-enum.ts
 *
 * Behavior:
 * - Expects CSV with header row that includes a column named `system` (first column OK).
 * - Reads unique system ids from the CSV and emits an enum where each member name is a
 *   PascalCase identifier derived from the system id and the value is the original id.
 * - Creates output directory if necessary and overwrites the file.
 *
 * Example output:
 * export enum SystemIDEnum {
 *   Mortality = 'mortality',
 *   HealthOutcomes = 'health_outcomes'
 * }
 *
 * Note: This script uses only Node/Bun builtin APIs (fs/path). It performs basic CSV
 * parsing sufficient for simple, well-formed CSVs. If your CSV is more complex (quotes,
 * embedded commas, newlines in fields), consider using a CSV parser library.
 */

import fs from 'fs';
import path from 'path';

const INPUT_CSV = path.join(process.cwd(), 'static', 'data', 'system.csv');
const OUTPUT_TS = path.join(process.cwd(), 'src', 'lib', 'types', 'generated', 'system-enum.ts');

// Utility: convert snake_case or kebab-case or space-separated into PascalCase identifier
function toPascalCaseId(s: string): string {
  // split on non-alphanumeric characters, keep letters and numbers groups
  const parts = s.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const pascal = parts
    .map((p) => {
      // if p starts with digit, prefix with underscore to make a valid identifier part
      const safe = /^[0-9]/.test(p) ? `_${p}` : p;
      return safe.charAt(0).toUpperCase() + safe.slice(1);
    })
    .join('');
  // Ensure it's a valid identifier (can't start with digit). If still starts with digit, prefix underscore
  if (/^[0-9]/.test(pascal)) return `_${pascal}`;
  return pascal || '_';
}

// Basic CSV reader: returns array of rows, each row is array of cells (trimmed)
function readCsvSimple(filePath: string): string[][] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  // Normalize newlines
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((l) => l.trim() !== '');
  const rows: string[][] = lines.map((line) => {
    // Very simple splitter: splits on commas. This will not handle quoted commas/newlines.
    // For our simple CSV it should be sufficient.
    return line.split(',').map((c) => c.trim());
  });
  return rows;
}

function generateEnumContent(entries: Array<{ key: string; value: string; label: string }>, sourceFileRelative: string) {
  const header = `/**
 * THIS FILE IS GENERATED — DO NOT EDIT BY HAND
 * Generated from: ${sourceFileRelative}
 * Generated at: ${new Date().toISOString()}
 */\n\n`;
  const enumLines = ['export enum SystemIDEnum {'];
  for (const e of entries) {
    enumLines.push(`\t${e.key} = '${e.value}',`);
  }
  enumLines.push('}\n');
  enumLines.push('// Convenience array of ids');
  enumLines.push('export const SystemIDs = Object.values(SystemIDEnum) as SystemIDEnum[];\n');
  enumLines.push('export type SystemID = SystemIDEnum;\n');
  enumLines.push('// Human-readable labels keyed by system id');
  enumLines.push('export const SystemLabels: Record<SystemIDEnum, string> = {');
  for (const e of entries) {
    enumLines.push(`\t[SystemIDEnum.${e.key}]: '${e.label.replace(/'/g, "\\'")}',`);
  }
  enumLines.push('};\n');
  return header + enumLines.join('\n');
}

function main() {
  try {
    if (!fs.existsSync(INPUT_CSV)) {
      console.error(`Input CSV not found: ${INPUT_CSV}`);
      process.exitCode = 2;
      return;
    }

    const rows = readCsvSimple(INPUT_CSV);
    if (rows.length === 0) {
      console.error('CSV is empty');
      process.exitCode = 2;
      return;
    }

    // Determine indices of "system" and "system_label" columns from header (case-insensitive)
    const header = rows[0].map((h) => h.toLowerCase());
    let systemIdx = header.indexOf('system');
    if (systemIdx === -1) systemIdx = 0;
    const labelIdx = header.indexOf('system_label');

    const idLabelPairs: Array<{ id: string; label: string }> = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (systemIdx >= row.length) continue;
      const id = row[systemIdx].trim();
      if (!id) continue;
      const label = labelIdx !== -1 && labelIdx < row.length ? row[labelIdx].trim() : id;
      idLabelPairs.push({ id, label });
    }

    // Deduplicate by id, keeping first occurrence
    const seen = new Set<string>();
    const unique = idLabelPairs.filter(({ id }) => seen.has(id) ? false : (seen.add(id), true));
    if (unique.length === 0) {
      console.error('No system ids found in CSV');
      process.exitCode = 2;
      return;
    }

    // Build enum entries ensuring unique keys
    const usedKeys = new Map<string, number>();
    const entries: Array<{ key: string; value: string; label: string }> = [];
    for (const { id, label } of unique) {
      let base = toPascalCaseId(id);
      if (!base) base = 'System';
      let key = base;
      if (usedKeys.has(key)) {
        const count = (usedKeys.get(key) || 1) + 1;
        usedKeys.set(key, count);
        key = `${base}${count}`;
      } else {
        usedKeys.set(key, 1);
      }
      entries.push({ key, value: id, label });
    }

    // Ensure output directory exists
    const outDir = path.dirname(OUTPUT_TS);
    fs.mkdirSync(outDir, { recursive: true });

    const relSource = path.relative(outDir, INPUT_CSV) || INPUT_CSV;
    const content = generateEnumContent(entries, relSource);
    fs.writeFileSync(OUTPUT_TS, content, 'utf-8');
    console.log(`Generated ${OUTPUT_TS} (${entries.length} entries)`);
    process.exitCode = 0;
  } catch (err) {
    console.error('Error generating enum:', err);
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main();
}
