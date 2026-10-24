/**
 * v1.8 Phase 1 smoke — runs the CS-reported scenario against a deployed API:
 * a Cancellation conversation, then (same conversation) a question on another
 * topic. Prints per-turn action / reason / topic / diag and wall-clock latency.
 *
 * Turns are paced (SMOKE_GAP_MS, default 12s) to stay under the Gemini
 * free-tier request rate — back-to-back turns hit 429 and measure the quota,
 * not the bot.
 *
 * `--escalated` adds a scenario where the conversation is already with staff:
 * it marks THIS smoke conversation escalated (+ a placeholder contact) directly
 * in the DB, so no real Slack notice is sent, then asks a new question.
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env for that step.
 *
 * Conversations are tagged source_tag=smoke-v1.8-phase1; resolve them after
 * with `cleanup_smoke.ts`.
 *
 * Usage: pnpm --filter @vertex/scripts exec tsx smoke_topic_switch.ts [runs=1] [--escalated]
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createServiceClient, parseEnv } from '@vertex/shared';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = process.env.SMOKE_API_URL ?? 'https://simpoint-support-api.chaco22512.workers.dev';
const ORIGIN = process.env.SMOKE_ORIGIN ?? 'https://simpoint-support-chat.pages.dev';
const GAP_MS = Number(process.env.SMOKE_GAP_MS ?? 12_000);
const headers = { 'content-type': 'application/json', Origin: ORIGIN };

const FIRST = 'I want to cancel my SIM. How much notice do I need to give?';
// Second questions on topics outside the Cancellation scope (CS report).
const SECOND = [
  'Also, how do I set up the APN on my iPhone?',
  'I lost my SIM card yesterday. What should I do?',
  'My phone shows no signal since this morning. What can I do?',
  'How do I change my plan to a bigger data plan?',
];

interface Reply {
  reply?: { body: string; ai_meta?: Record<string, unknown> | null };
  escalated?: boolean;
  followup_escalated?: boolean;
  status?: string;
  topic_category?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const times: number[] = [];

async function create(): Promise<{ token: string; id: string }> {
  const res = await fetch(`${API}/api/conversations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ language: 'en', source_tag: 'smoke-v1.8-phase1', topic_category: 'cancel' }),
  });
  return (await res.json()) as { token: string; id: string };
}

async function turn(token: string, body: string): Promise<void> {
  await sleep(GAP_MS);
  const t0 = Date.now();
  const res = await fetch(`${API}/api/conversations/${token}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ body }),
  });
  const ms = Date.now() - t0;
  times.push(ms);
  const j = (await res.json()) as Reply;
  const m = j.reply?.ai_meta ?? {};
  console.log(
    `Q: ${body}\n  ${res.status} ${ms}ms action=${String(m.action)} reason=${String(m.reason)} ` +
      `escalated=${String(j.escalated)} followup=${String(j.followup_escalated)} status=${String(j.status)} ` +
      `topic=${String(j.topic_category ?? '-')} rule_ids=${JSON.stringify(m.rule_ids)}`,
  );
  const d = m.diag as Record<string, unknown> | undefined;
  if (d) {
    console.log(
      `  diag: error=${String(d.error)} fallback=${String(d.fallback_result)} candidates=${String(d.candidate_count)} ` +
        `guess=${String(d.topic_guess)} timings=${JSON.stringify(d.timings)}`,
    );
  }
  console.log(`  A: ${(j.reply?.body ?? '').replace(/\s+/g, ' ').slice(0, 160)}`);
}

async function main(): Promise<void> {
  const runs = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 1);
  for (let i = 1; i <= runs; i++) {
    for (const q of SECOND) {
      const c = await create();
      console.log(`\n# run ${i} conversation=${c.id}`);
      await turn(c.token, FIRST);
      await turn(c.token, q);
    }
  }

  if (process.argv.includes('--escalated')) {
    loadEnv({ path: resolve(REPO_ROOT, '.env') });
    const db = createServiceClient(parseEnv(process.env));
    const c = await create();
    console.log(`\n# escalated-case scenario conversation=${c.id}`);
    await turn(c.token, FIRST);
    const now = new Date();
    await db
      .from('conversations')
      .update({
        status: 'escalated',
        contact_email: 'smoke-test@example.invalid',
        escalated_at: now.toISOString(),
        reply_due_at: new Date(now.getTime() + 24 * 3_600_000).toISOString(),
      })
      .eq('id', c.id);
    console.log('  (marked escalated with a placeholder contact — no Slack notice)');
    await turn(c.token, 'Different question: how do I set up the APN on my iPhone?');
  }

  times.sort((a, b) => a - b);
  const pct = (p: number) => times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))];
  console.log(
    `\nlatency ms: n=${times.length} min=${times[0]} p50=${pct(50)} p90=${pct(90)} max=${times[times.length - 1]}`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
