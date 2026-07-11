/**
 * Import knowledge-base manuals into kb_rules (build_spec_v1_5.md §3 "初期データ投入").
 * Idempotent: upserts by id, so re-running does not duplicate rows.
 *
 * Usage:
 *   pnpm import:kb                                   # defaults to the R-series file
 *   pnpm import:kb data/kb_rules_import.json data/kb_rules_per_plan_import.json
 *
 * Multiple files are merged (last write wins on a shared id) and imported as one
 * batch. Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createServiceClient, parseEnv } from '@vertex/shared';
import { toKbRuleRow, type RawKbRule } from './kb-mapping';

const CHUNK_SIZE = 200;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function countRules(
  supabase: ReturnType<typeof createServiceClient>,
  status?: string,
): Promise<number> {
  let query = supabase.from('kb_rules').select('*', { count: 'exact', head: true });
  if (status) query = query.eq('status', status);
  const { count, error } = await query;
  if (error) throw new Error(`count failed: ${error.message}`);
  return count ?? 0;
}

/**
 * Read back only the rows we just imported (scoped by id, in chunks) so the
 * verification never depends on unrelated rows — importing one manual must not
 * assert anything about another manual already in the table.
 */
async function readBackImported(
  supabase: ReturnType<typeof createServiceClient>,
  ids: string[],
): Promise<Map<string, string>> {
  const statusById = new Map<string, string>();
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase.from('kb_rules').select('id, status').in('id', chunk);
    if (error) throw new Error(`read-back failed at row ${i}: ${error.message}`);
    for (const row of (data ?? []) as { id: string; status: string }[]) {
      statusById.set(row.id, row.status);
    }
  }
  return statusById;
}

async function main(): Promise<void> {
  loadEnv({ path: resolve(REPO_ROOT, '.env') });
  const env = parseEnv(process.env);
  const supabase = createServiceClient(env);

  const files = process.argv.slice(2);
  if (files.length === 0) files.push('data/kb_rules_import.json');

  // Load each file, then merge by id (last file wins) so cross-file dupes don't
  // double-count. Report a per-file breakdown and flag id collisions.
  const byId = new Map<string, ReturnType<typeof toKbRuleRow>>();
  const seen = new Set<string>();
  for (const file of files) {
    const path = resolve(REPO_ROOT, file);
    const raw = JSON.parse(readFileSync(path, 'utf8')) as RawKbRule[];
    const collisions = raw.filter((r) => seen.has(r.id)).map((r) => r.id);
    for (const r of raw) {
      seen.add(r.id);
      byId.set(r.id, toKbRuleRow(r));
    }
    const pending = raw.filter((r) => r.needs_review).length;
    console.log(
      `Loaded ${raw.length} rules from ${file} (pending_review: ${pending}` +
        (collisions.length ? `, id collisions: ${collisions.length} [${collisions.slice(0, 5).join(', ')}…]` : '') +
        ')',
    );
    if (collisions.length) {
      throw new Error(`id collision across files: ${collisions.length} shared id(s), e.g. ${collisions.slice(0, 5).join(', ')}`);
    }
  }

  const rows = [...byId.values()];
  console.log(`\nMerged ${rows.length} unique rules from ${files.length} file(s).`);

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from('kb_rules').upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error(`upsert failed at row ${i}: ${error.message}`);
    console.log(`  upserted ${Math.min(i + CHUNK_SIZE, rows.length)}/${rows.length}`);
  }

  // Global counts (context only — not asserted, so other manuals in the table
  // and prior admin review decisions are never disturbed by this import).
  const total = await countRules(supabase);
  const pending = await countRules(supabase, 'pending_review');
  const active = await countRules(supabase, 'active');
  const disabled = await countRules(supabase, 'disabled');

  console.log('\n=== Table totals (all manuals) ===');
  console.log(`total:          ${total}`);
  console.log(`active:         ${active}`);
  console.log(`pending_review: ${pending}`);
  console.log(`disabled:       ${disabled}`);

  // Scoped verification: every imported id must be present, and the imported
  // subset's pending_review count must match the source files.
  const statusById = await readBackImported(supabase, [...byId.keys()]);
  const expectedPending = rows.filter((r) => r.status === 'pending_review').length;
  const importedPending = [...statusById.values()].filter((s) => s === 'pending_review').length;
  const missing = [...byId.keys()].filter((id) => !statusById.has(id));

  console.log('\n=== Imported set verification ===');
  console.log(`present:            ${statusById.size}/${rows.length}`);
  console.log(`pending_review:     ${importedPending} (expected ${expectedPending})`);

  const problems: string[] = [];
  if (missing.length > 0) problems.push(`${missing.length} imported id(s) missing, e.g. ${missing.slice(0, 5).join(', ')}`);
  if (importedPending !== expectedPending) problems.push(`imported pending_review ${importedPending} != expected ${expectedPending}`);
  if (problems.length > 0) {
    throw new Error(`Verification failed: ${problems.join('; ')}`);
  }
  console.log('\nVerification passed.');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
