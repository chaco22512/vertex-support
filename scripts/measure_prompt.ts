/**
 * Measure the real AI system-prompt size for the 'others' topic — the worst
 * case, where the prompt includes ALL active/customer rules (both manuals).
 * Reports the exact Gemini token count and the headroom against the model's
 * input context window (spec v1.5 §4.1).
 *
 * Usage: pnpm --filter @vertex/scripts exec tsx measure_prompt.ts
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + GEMINI_API_KEY from .env.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createServiceClient, parseEnv } from '@vertex/shared';
import { buildSystemPrompt, fetchScopedRules, DEFAULT_GEMINI_MODEL } from '@vertex/ai';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// gemini-2.5-flash input context window (tokens).
const CONTEXT_WINDOW = 1_048_576;
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

async function countTokens(apiKey: string, model: string, text: string): Promise<number> {
  const resp = await fetch(`${API_BASE}/models/${model}:countTokens`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ parts: [{ text }] }] }),
  });
  if (!resp.ok) throw new Error(`countTokens failed (status ${resp.status})`);
  const data = (await resp.json()) as { totalTokens?: number };
  return data.totalTokens ?? 0;
}

async function main(): Promise<void> {
  loadEnv({ path: resolve(REPO_ROOT, '.env') });
  const env = parseEnv(process.env);
  const supabase = createServiceClient(env);

  // 'others' scope = null → all active/customer rules (both manuals).
  const rules = await fetchScopedRules(supabase, null);
  const prompt = buildSystemPrompt(rules);

  const chars = prompt.length;
  const estTokens = Math.round(chars / 4); // rough English heuristic
  const model = DEFAULT_GEMINI_MODEL;
  const tokens = await countTokens(env.GEMINI_API_KEY, model, prompt);

  const byCategory = new Map<string, number>();
  for (const r of rules) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);

  console.log('=== "Others" system-prompt size (all active/customer rules) ===');
  console.log(`model:              ${model}`);
  console.log(`rules in prompt:    ${rules.length}`);
  console.log(`prompt chars:       ${chars.toLocaleString()}`);
  console.log(`estimated tokens:   ~${estTokens.toLocaleString()} (chars/4)`);
  console.log(`ACTUAL tokens:      ${tokens.toLocaleString()} (Gemini countTokens)`);
  console.log(`context window:     ${CONTEXT_WINDOW.toLocaleString()} tokens`);
  console.log(`window used:        ${((tokens / CONTEXT_WINDOW) * 100).toFixed(2)}%`);
  console.log(`headroom:           ${(CONTEXT_WINDOW - tokens).toLocaleString()} tokens`);

  console.log('\nTop categories by rule count:');
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  for (const [cat, n] of top) console.log(`  ${String(n).padStart(4)}  ${cat}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
