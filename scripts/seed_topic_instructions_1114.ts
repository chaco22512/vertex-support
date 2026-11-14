/**
 * 2026-11-14: add topic guidance (③) for the new tiles "promotions" and
 * "holiday" from data/cs_prompts/{promotions,holiday}.md.
 *
 * Creates a NEW DRAFT version that copies the latest version (CS's work in
 * progress is kept as-is) and adds only the topics that are still empty.
 * Nothing goes live until an admin publishes it in AI behaviour (safety tests).
 * Logged in ai_prompt_change_log as save_draft.
 *
 * Run AFTER the API that knows these topic ids is deployed — otherwise the
 * deployed AI behaviour screen rejects saving this draft ("unknown topic").
 *
 * Usage: pnpm --filter @vertex/scripts exec tsx seed_topic_instructions_1114.ts
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createServiceClient, parseEnv } from '@vertex/shared';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILES: Record<string, string> = { promotions: 'promotions.md', holiday: 'holiday.md' };

function body(file: string): string {
  return readFileSync(resolve(REPO_ROOT, 'data/cs_prompts', file), 'utf8')
    .replace(/^\s*<!--[\s\S]*?-->\s*/, '')
    .trim();
}

async function main(): Promise<void> {
  loadEnv({ path: resolve(REPO_ROOT, '.env') });
  const db = createServiceClient(parseEnv(process.env));

  const { data: latest, error } = await db
    .from('ai_prompt_versions')
    .select('id,common_behaviour,topic_instructions')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const base = (latest ?? { id: null, common_behaviour: '', topic_instructions: {} }) as {
    id: number | null;
    common_behaviour: string;
    topic_instructions: Record<string, string>;
  };

  const added: string[] = [];
  const topics = { ...base.topic_instructions };
  for (const [id, file] of Object.entries(FILES)) {
    if (topics[id]?.trim()) continue;
    topics[id] = body(file);
    added.push(id);
  }
  if (added.length === 0) {
    console.log(`Version #${base.id} already has guidance for ${Object.keys(FILES).join(', ')} — nothing to do.`);
    return;
  }

  const note = `Added topic guidance for ${added.join(', ')} (from CS internal GP/HPD rules) on top of #${base.id}`;
  const { data, error: e2 } = await db
    .from('ai_prompt_versions')
    .insert({
      state: 'draft',
      common_behaviour: base.common_behaviour,
      topic_instructions: topics,
      note,
      based_on: base.id,
    })
    .select('id')
    .single();
  if (e2 || !data) throw new Error(e2?.message ?? 'insert failed');
  const id = (data as { id: number }).id;
  await db.from('ai_prompt_change_log').insert({
    version_id: id,
    action: 'save_draft',
    detail: { note, based_on: base.id, added_topics: added },
  });
  console.log(`Created draft #${id} (copy of #${base.id} + ${added.join(', ')}). Publish it in AI behaviour.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
