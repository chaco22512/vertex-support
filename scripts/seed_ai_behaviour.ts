/**
 * Seed the AI behaviour tab (spec v1.8 §4.2.1 / §7.8) with the CS team's
 * spreadsheet prompts (data/cs_prompts/) as version 1 — saved as a DRAFT, so
 * the live bot is unchanged until an admin publishes it (which runs the
 * safety tests). Does nothing if any version already exists.
 *
 * Mapping: core.md → ② common behaviour; cancel / return / replace → ③ same
 * topic; refund.md (the "Deposit Refund" tab) → ③ deposit. The leading
 * "<!-- Source … -->" note of each file is dropped; the text is verbatim.
 * The bot's existing plain-language rule is appended to ② so it is not lost
 * (CS can edit or remove it).
 *
 * Usage: pnpm --filter @vertex/scripts exec tsx seed_ai_behaviour.ts
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createServiceClient, parseEnv } from '@vertex/shared';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = resolve(REPO_ROOT, 'data/cs_prompts');

const TOPIC_FILES: Record<string, string> = {
  cancel: 'cancel.md',
  return: 'return.md',
  deposit: 'refund.md',
  replace: 'replace.md',
};

const PLAIN_LANGUAGE = `PLAIN LANGUAGE (carried over from the current bot)
Write for a non-technical customer in their 40s or older: use plain, everyday words. One step per sentence. Put steps in a numbered list. Add a short plain-words explanation for any technical term. Do not use exclamation marks or emoji.`;

/** File text without its leading "<!-- Source … -->" note. */
function body(file: string): string {
  return readFileSync(resolve(DIR, file), 'utf8')
    .replace(/^\uFEFF?<!--[\s\S]*?-->\s*/, '')
    .trim();
}

async function main(): Promise<void> {
  loadEnv({ path: resolve(REPO_ROOT, '.env') });
  const db = createServiceClient(parseEnv(process.env));

  const { count, error } = await db.from('ai_prompt_versions').select('*', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) {
    console.log(`ai_prompt_versions already has ${count} version(s) — nothing seeded.`);
    return;
  }

  const common = `${body('core.md')}\n\n${PLAIN_LANGUAGE}`;
  const topics = Object.fromEntries(Object.entries(TOPIC_FILES).map(([id, file]) => [id, body(file)]));
  const { data, error: e2 } = await db
    .from('ai_prompt_versions')
    .insert({
      state: 'draft',
      common_behaviour: common,
      topic_instructions: topics,
      note: 'Initial text from the CS spreadsheet (Core_System_Prompt + 4 topic prompts)',
    })
    .select('id')
    .single();
  if (e2 || !data) throw new Error(e2?.message ?? 'insert failed');

  console.log(`Seeded draft version #${(data as { id: number }).id}`);
  console.log(`  ② common: ${common.length.toLocaleString()} chars`);
  for (const [id, text] of Object.entries(topics)) console.log(`  ③ ${id}: ${text.length.toLocaleString()} chars`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
