/**
 * v1.8 Phase 1 — sanity-check the keyword retrieval fallback on the real
 * manual: top-K hits per sample question and ranking time. READ-ONLY.
 *
 * Usage: pnpm --filter @vertex/scripts measure:retrieval
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createServiceClient, parseEnv } from '@vertex/shared';
import { buildRetrievalQuery, fetchScopedRules, rankRules } from '@vertex/ai';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SAMPLES: { q: string; keywords: string[] }[] = [
  { q: 'Also, how do I set up the APN on my iPhone?', keywords: ['apn', 'iphone', 'setup'] },
  { q: 'I lost my SIM card yesterday. What should I do?', keywords: ['lost', 'sim', 'reissue', 'fee'] },
  { q: 'My phone shows no signal since this morning.', keywords: ['no', 'signal', 'stopped', 'network'] },
  { q: 'How do I change my plan to a bigger data plan?', keywords: ['change', 'plan', 'upgrade', 'data'] },
  { q: 'Kartu SIM saya hilang, apa yang harus saya lakukan?', keywords: ['lost', 'sim', 'card', 'reissue'] },
];

async function main(): Promise<void> {
  loadEnv({ path: resolve(REPO_ROOT, '.env') });
  const db = createServiceClient(parseEnv(process.env));
  const t0 = Date.now();
  const all = await fetchScopedRules(db, null);
  console.log(`fetched ${all.length} rules in ${Date.now() - t0}ms`);
  for (const s of SAMPLES) {
    const query = buildRetrievalQuery(s.q, s.keywords);
    const t1 = performance.now();
    const ranked = rankRules(all, query);
    const ms = (performance.now() - t1).toFixed(1);
    console.log(`\nQ: ${s.q}\n  terms=${JSON.stringify(query)} hits=${ranked.length} rank=${ms}ms`);
    for (const r of ranked.slice(0, 5)) {
      console.log(`  ${r.score.toFixed(2).padStart(6)} [${r.rule.id}] ${r.rule.category} — ${r.rule.rule_text.replace(/\s+/g, ' ').slice(0, 90)}`);
    }
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
