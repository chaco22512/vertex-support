/**
 * Phase 0 (spec v1.8 §4.1) — measure how many kb_rules exist vs. how many each
 * read path actually returns. READ-ONLY: issues only SELECT / count queries.
 *
 * Usage: pnpm --filter @vertex/scripts exec tsx measure_rule_counts.ts
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { createServiceClient, parseEnv } from '@vertex/shared';
import { fetchScopedRules, resolveKbCategories, type MenuCategories } from '@vertex/ai';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main(): Promise<void> {
  loadEnv({ path: resolve(REPO_ROOT, '.env') });
  const env = parseEnv(process.env);
  const db = createServiceClient(env);
  const menu = JSON.parse(
    readFileSync(resolve(REPO_ROOT, 'data/menu_categories.json'), 'utf8'),
  ) as MenuCategories;

  type Query = ReturnType<ReturnType<typeof db.from>['select']>;
  const count = async (f: (q: Query) => Query = (q) => q): Promise<number> => {
    const { count: n, error } = await f(db.from('kb_rules').select('*', { count: 'exact', head: true }));
    if (error) throw new Error(error.message);
    return n ?? 0;
  };

  console.log('=== DB (exact counts) ===');
  console.log(`total rows:                    ${await count()}`);
  for (const p of ['R', 'P', 'F', 'C', 'M']) {
    console.log(`  id ${p}*:                       ${await count((q) => q.ilike('id', `${p}%`))}`);
  }
  for (const s of ['active', 'pending_review', 'disabled']) {
    console.log(`  status=${s.padEnd(15)}       ${await count((q) => q.eq('status', s))}`);
  }
  const eligible = await count((q) =>
    q.eq('status', 'active').eq('audience', 'customer').eq('ai_can_answer', true),
  );
  console.log(`AI-eligible (active+customer+ai_can_answer): ${eligible}`);

  // Same query shape as admin listRules (GET /api/admin/rules, no filter).
  const { data: adminRows } = await db.from('kb_rules').select('id').order('id').limit(1000);
  console.log('\n=== unpaged single select (pre-v1.8 admin listRules: .limit(1000)) ===');
  console.log(`rows returned: ${adminRows?.length ?? 0}`);
  // Same query without any explicit limit (PostgREST max-rows default).
  const { data: noLimit } = await db.from('kb_rules').select('id').order('id');
  console.log(`rows returned with NO limit (server max-rows cap): ${noLimit?.length ?? 0}`);

  console.log('\n=== AI fetchScopedRules per topic (paginated) ===');
  for (const cat of menu.categories) {
    const cats = resolveKbCategories(cat.id, menu);
    const rules = await fetchScopedRules(db, cats);
    console.log(`  ${cat.id.padEnd(22)} ${String(rules.length).padStart(5)}  ${cats === null ? '(all)' : ''}`);
  }
  const all = await fetchScopedRules(db, null);
  console.log(`  ${'(null = all)'.padEnd(22)} ${String(all.length).padStart(5)}  expected ${eligible}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
