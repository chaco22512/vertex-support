/**
 * Detect and fix R-series rules whose rule_text is still a raw Google-Sheets
 * formula (`=IFERROR(__xludf.DUMMYFUNCTION(...),"cached value")`) that leaked in
 * as AI noise. DB-authoritative + read-only: it never writes to the DB. It
 * classifies every matching row and WRITES a reviewable migration SQL file:
 *   - fixable  → UPDATE rule_text to the extracted cached value
 *   - unfixable→ UPDATE status='disabled' (no usable cache: IMPORTRANGE / nested
 *                / multi-formula / numeric fallback)
 * Apply the generated migration separately (apply_migration.ts) after sign-off.
 *
 * Usage: pnpm --filter @vertex/scripts exec tsx fix_formula_rules.ts
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { createServiceClient, parseEnv } from '@vertex/shared';
import { hasSpreadsheetFormula } from './kb-mapping';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 1000;

// Same regex the P-series conversion used: the last `,"…")` before end of cell.
const EXTRACT = /\)\s*,\s*"(.*)"\s*\)\s*$/;
// If the extracted value still holds formula debris it isn't a clean cache value.
const RESIDUAL = /DUMMYFUNCTION|__xludf|=\s*IFERROR|IMPORTRANGE|\)\s*\|\s*=/i;

/** Extract the cached value, or null when there is no clean one (→ disable). */
function extractCached(text: string): string | null {
  const m = text.match(EXTRACT);
  if (!m) return null;
  const value = m[1]!.replace(/""/g, '"').trim();
  if (!value || RESIDUAL.test(value)) return null;
  return value;
}

const sq = (s: string): string => `'${s.replace(/'/g, "''")}'`;

async function main(): Promise<void> {
  loadEnv({ path: resolve(REPO_ROOT, '.env') });
  const db = createServiceClient(parseEnv(process.env));

  // Page through the whole table and filter with the same detector as import.
  const rows: { id: string; rule_text: string; status: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('kb_rules')
      .select('id, rule_text, status')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`query failed: ${error.message}`);
    const page = (data ?? []) as typeof rows;
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const matches = rows.filter((r) => hasSpreadsheetFormula(r.rule_text));
  const fixable: { id: string; before: string; after: string }[] = [];
  const disable: { id: string; before: string }[] = [];
  for (const r of matches) {
    const cached = extractCached(r.rule_text);
    if (cached) fixable.push({ id: r.id, before: r.rule_text, after: cached });
    else disable.push({ id: r.id, before: r.rule_text });
  }

  console.log('=== Formula-noise scan (DB) ===');
  console.log(`rows scanned:        ${rows.length}`);
  console.log(`formula matches:     ${matches.length}  (rule_text starts with = or contains DUMMYFUNCTION)`);
  console.log(`  → fixable (clean cache extracted): ${fixable.length}`);
  console.log(`  → disable (no clean cache):        ${disable.length}`);
  const already = matches.filter((r) => r.status !== 'active').length;
  console.log(`  (of matches, already non-active: ${already})`);

  console.log('\n===== 5 fixable BEFORE → AFTER =====');
  for (const f of fixable.slice(0, 5)) {
    console.log(`\n${f.id}`);
    console.log(`  BEFORE: ${f.before.slice(0, 130).replace(/\n/g, ' ')}`);
    console.log(`  AFTER : ${f.after.slice(0, 130).replace(/\n/g, ' ')}`);
  }
  console.log('\n===== sample to-disable (3) =====');
  for (const d of disable.slice(0, 3)) {
    console.log(`\n${d.id}`);
    console.log(`  TEXT: ${d.before.slice(0, 130).replace(/\n/g, ' ')}`);
  }

  // Generate the migration (reviewable; NOT applied here).
  const lines: string[] = [
    '-- Fix R-series rules whose rule_text was a raw Google-Sheets formula (v1.6 data fix).',
    '-- Read-only generator: review, then apply with apply_migration.ts. Reversible.',
    `-- ${fixable.length} rules cleaned to their cached value; ${disable.length} disabled (no clean cache).`,
    '',
  ];
  for (const f of fixable) {
    lines.push(`update kb_rules set rule_text = ${sq(f.after)} where id = ${sq(f.id)};`);
  }
  if (disable.length > 0) {
    lines.push('');
    const ids = disable.map((d) => sq(d.id)).join(', ');
    lines.push(
      `update kb_rules set status = 'disabled', ` +
        `review_reason = 'disabled v1.6: unprocessed spreadsheet formula, no clean cache value' ` +
        `where id in (${ids});`,
    );
  }
  const out = resolve(REPO_ROOT, 'supabase/migrations/20260711120009_fix_formula_rule_text.sql');
  writeFileSync(out, lines.join('\n') + '\n');
  console.log(`\nWrote migration: ${out}`);
  console.log('Review it, then apply: pnpm --filter @vertex/scripts exec tsx apply_migration.ts <that file>');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
