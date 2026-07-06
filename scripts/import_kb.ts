/**
 * Import data/kb_rules_import.json into kb_rules (build_spec_v1_4.md §3 "初期データ投入").
 * Idempotent: upserts by id, so re-running does not duplicate rows.
 *
 * Usage: pnpm import:kb   (reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env)
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

async function main(): Promise<void> {
  loadEnv({ path: resolve(REPO_ROOT, '.env') });
  const env = parseEnv(process.env);
  const supabase = createServiceClient(env);

  const path = resolve(REPO_ROOT, 'data/kb_rules_import.json');
  const raw = JSON.parse(readFileSync(path, 'utf8')) as RawKbRule[];
  const rows = raw.map(toKbRuleRow);
  console.log(`Loaded ${rows.length} rules from ${path}`);

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from('kb_rules').upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error(`upsert failed at row ${i}: ${error.message}`);
    console.log(`  upserted ${Math.min(i + CHUNK_SIZE, rows.length)}/${rows.length}`);
  }

  const total = await countRules(supabase);
  const pending = await countRules(supabase, 'pending_review');
  const active = await countRules(supabase, 'active');
  const disabled = await countRules(supabase, 'disabled');

  console.log('\n=== Import summary ===');
  console.log(`total:          ${total}`);
  console.log(`active:         ${active}`);
  console.log(`pending_review: ${pending}`);
  console.log(`disabled:       ${disabled}`);

  const expectedPending = rows.filter((r) => r.status === 'pending_review').length;
  const problems: string[] = [];
  if (total !== rows.length) problems.push(`total ${total} != source ${rows.length}`);
  if (pending !== expectedPending) problems.push(`pending_review ${pending} != expected ${expectedPending}`);
  if (problems.length > 0) {
    throw new Error(`Verification failed: ${problems.join('; ')}`);
  }
  console.log('\nVerification passed.');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
