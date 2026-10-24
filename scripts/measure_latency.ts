/**
 * Phase 0 (spec v1.8) — time real AI turns at representative scopes to measure
 * headroom against the 15s AI_TIMEOUT_MS. Uses live Gemini (a few requests of
 * free-tier quota). Prints timings and sanitized flags only — never answer text.
 *
 * Usage: pnpm --filter @vertex/scripts exec tsx measure_latency.ts
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { createServiceClient, parseEnv } from '@vertex/shared';
import {
  GeminiClient,
  fetchScopedRules,
  resolveKbCategories,
  runAiReply,
  type MenuCategories,
} from '@vertex/ai';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CASES: { topic: string; question: string }[] = [
  { topic: 'internet', question: 'How do I set up the APN on my iPhone?' },
  { topic: 'replace', question: 'I want to change my plan to a bigger one, what is the fee?' },
  { topic: 'others', question: 'How do I set up the APN on my iPhone?' },
  { topic: 'others', question: 'I lost my SIM card, what should I do?' },
];

async function main(): Promise<void> {
  loadEnv({ path: resolve(REPO_ROOT, '.env') });
  const env = parseEnv(process.env);
  const db = createServiceClient(env);
  const llm = new GeminiClient({ apiKey: env.GEMINI_API_KEY });
  const menu = JSON.parse(
    readFileSync(resolve(REPO_ROOT, 'data/menu_categories.json'), 'utf8'),
  ) as MenuCategories;

  for (const c of CASES) {
    const rules = await fetchScopedRules(db, resolveKbCategories(c.topic, menu));
    const t0 = Date.now();
    let res;
    try {
      res = await runAiReply({
        rules,
        history: [{ sender: 'customer', body: c.question }],
        language: 'en',
        llm,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`${c.topic.padEnd(9)} rules=${String(rules.length).padStart(5)} ${String(Date.now() - t0).padStart(6)}ms ERROR ${msg}`);
      continue;
    }
    const ms = Date.now() - t0;
    console.log(
      `${c.topic.padEnd(9)} rules=${String(rules.length).padStart(5)} ${String(ms).padStart(6)}ms ` +
        `fellBack=${res.fellBack} action=${res.aiMeta.action} reason=${res.aiMeta.reason ?? '-'}`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
