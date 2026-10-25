import { describe, expect, it } from 'vitest';
import { GeminiError, type LlmClient, type LlmGenerateRequest } from '@vertex/ai';
import type { Role } from '@vertex/shared';
import { createApp } from '../../index';
import { FakeSupabase } from '../../testing/fakeSupabase';
import { fakeKv, fakeSendEmail, fakeSendSlack, fakeVerifyStaff } from '../../testing/mocks';
import type { ApiBindings } from '../../types';

/** Spec v1.8 §7.8 — AI behaviour tab: drafts, safety-tested publish, restore, Try it. */

const ok = (o: Record<string, unknown>) =>
  JSON.stringify({ action: 'answer', follow_up: null, reason: 'none', rule_ids: [], detected_language: 'ja', ...o });

/** A model that answers each safety question; `bad` makes the price test leak a price. */
function scriptedLlm(mode: 'good' | 'bad_price' | 'rate_limited' = 'good'): LlmClient & { systems: string[] } {
  const systems: string[] = [];
  return {
    model: 'mock-model',
    systems,
    generate: async (req: LlmGenerateRequest) => {
      systems.push(req.system);
      if (mode === 'rate_limited') throw new GeminiError(429, 'mock-model');
      const q = req.messages.at(-1)?.text ?? '';
      if (q.includes('30GB'))
        return mode === 'bad_price'
          ? ok({ answer: '30GBプランは月額3,980円です。' })
          : ok({ action: 'escalate', reason: 'price_question', answer: '料金はスタッフがご案内します。' });
      if (q.includes('失くしました')) return ok({ answer: '再発行の手数料は4,000円です。' });
      if (q.includes('社内')) return ok({ answer: '申し訳ありませんが、お答えできません。' });
      if (q.includes('Bagaimana'))
        return ok({
          answer: 'Untuk mengatur APN di iPhone Anda, buka Pengaturan dan pilih jaringan yang benar.',
          detected_language: 'id',
        });
      return ok({ answer: 'Sandbox reply.' });
    },
  };
}

function setup(role: Role = 'admin', llm: LlmClient = scriptedLlm()) {
  const db = new FakeSupabase();
  const base = { fee_amounts_jpy: [], links: [], audience: 'customer', ai_can_answer: true, status: 'active' };
  db.tables.kb_rules.push(
    { ...base, id: 'R508', category: 'LOST ITEM RULES', rule_text: 'Lost SIM re-issue fee.', fee_amounts_jpy: [4000] },
    { ...base, id: 'R010', category: 'GENERAL RULES', rule_text: 'Payment is due on the 27th.' },
    { ...base, id: 'R657', category: 'APN SETTINGS', rule_text: 'APN setup for iPhone.' },
  );
  db.tables.staff.push({ id: 'staff-1', name: 'Test Staff', is_active: true });
  const slack = fakeSendSlack();
  const env: ApiBindings = {
    SUPABASE_URL: 'x',
    SUPABASE_ANON_KEY: 'x',
    SUPABASE_SERVICE_ROLE_KEY: 'x',
    GEMINI_API_KEY: 'x',
    SLACK_WEBHOOK_URL: 'x',
    RESEND_API_KEY: 'x',
    ADMIN_BASE_URL: 'http://localhost:5174',
    CHAT_BASE_URL: 'http://localhost:5173',
    RATE_LIMIT: fakeKv(),
  };
  const app = createApp((e) => ({
    db: db.asClient(),
    llm,
    kv: fakeKv(),
    adminOrigin: e.ADMIN_BASE_URL,
    chatOrigin: e.CHAT_BASE_URL ?? '',
    verifyStaff: fakeVerifyStaff(role),
    sendSlack: slack,
    sendEmail: fakeSendEmail(),
    emailFrom: 'test@resend.dev',
  }));
  const headers = { Authorization: 'Bearer tok', Origin: 'http://localhost:5174', 'Content-Type': 'application/json' };
  const post = (path: string, body: unknown) =>
    app.request(path, { method: 'POST', headers, body: JSON.stringify(body) }, env);
  const get = (path: string) => app.request(path, { headers }, env);
  return { db, slack, post, get };
}

const draft = { common_behaviour: 'Be warm and brief.', topic_instructions: { lost: 'Ask if they want to continue.' } };

async function saveDraft(s: ReturnType<typeof setup>, body: unknown = draft): Promise<number> {
  const res = await s.post('/api/admin/ai-behaviour/versions', body);
  expect(res.status).toBe(201);
  return ((await res.json()) as { version: { id: number } }).version.id;
}

describe('AI behaviour — read', () => {
  it('returns the fixed safety rules read-only, 10 topics (no Plans) and limits', async () => {
    const s = setup();
    const body = (await (await s.get('/api/admin/ai-behaviour')).json()) as {
      fixed: { safety_rules: string };
      topics: { id: string }[];
      limits: { max: number };
      latest: unknown;
    };
    expect(body.fixed.safety_rules).toContain('override EVERY other instruction');
    expect(body.topics).toHaveLength(10);
    expect(body.topics.map((t) => t.id)).not.toContain('plans');
    expect(body.limits.max).toBe(12_000);
    expect(body.latest).toBeNull();
  });

  it('is admin-only', async () => {
    const s = setup('staff');
    expect((await s.get('/api/admin/ai-behaviour')).status).toBe(403);
    expect((await s.post('/api/admin/ai-behaviour/versions', draft)).status).toBe(403);
  });
});

describe('AI behaviour — drafts', () => {
  it('saves every edit as a new draft version and logs it', async () => {
    const s = setup();
    const a = await saveDraft(s);
    const b = await saveDraft(s, { ...draft, common_behaviour: 'Changed.', based_on: a });
    expect(b).toBeGreaterThan(a);
    expect(s.db.tables.ai_prompt_versions!.map((v) => v.state)).toEqual(['draft', 'draft']);
    expect(s.db.tables.ai_prompt_change_log!.map((l) => l.action)).toEqual(['save_draft', 'save_draft']);
  });

  it('rejects text over the limit and unknown topics', async () => {
    const s = setup();
    expect((await s.post('/api/admin/ai-behaviour/versions', { ...draft, common_behaviour: 'x'.repeat(12_001) })).status).toBe(400);
    expect(
      (await s.post('/api/admin/ai-behaviour/versions', { ...draft, topic_instructions: { plans: 'x' } })).status,
    ).toBe(400);
  });
});

describe('AI behaviour — publish with safety tests', () => {
  it('publishes when every safety check passes, supersedes the old one, notifies Slack', async () => {
    const s = setup();
    const first = await saveDraft(s);
    expect((await s.post(`/api/admin/ai-behaviour/versions/${first}/publish`, {})).status).toBe(200);
    const second = await saveDraft(s, { ...draft, common_behaviour: 'v2' });
    const res = await s.post(`/api/admin/ai-behaviour/versions/${second}/publish`, {});
    const body = (await res.json()) as { published: boolean; report: { passed: boolean; checks: unknown[] } };
    expect(body.published).toBe(true);
    expect(body.report.checks).toHaveLength(5);
    const states = Object.fromEntries(s.db.tables.ai_prompt_versions!.map((v) => [v.id, v.state]));
    expect(states).toEqual({ [first]: 'superseded', [second]: 'published' });
    expect(s.slack.calls.at(-1)).toContain('AI behaviour published');
  });

  it('blocks publishing when a check fails and shows what broke (price leaked)', async () => {
    const s = setup('admin', scriptedLlm('bad_price'));
    const id = await saveDraft(s);
    const res = await s.post(`/api/admin/ai-behaviour/versions/${id}/publish`, {});
    expect(res.status).toBe(422);
    const body = (await res.json()) as { published: boolean; report: { checks: { id: string; pass: boolean; excerpt?: string }[] } };
    expect(body.published).toBe(false);
    const price = body.report.checks.find((c) => c.id === 'price')!;
    expect(price.pass).toBe(false);
    expect(price.excerpt).toContain('3,980円');
    expect(s.db.tables.ai_prompt_versions![0]!.state).toBe('draft');
    expect(s.db.tables.ai_prompt_versions![0]!.safety_report).toBeTruthy();
    expect(s.db.tables.ai_prompt_change_log!.at(-1)!.action).toBe('publish_blocked');
    expect(s.slack.calls).toHaveLength(0);
  });

  it('never publishes untested: an AI usage-limit error blocks the publish', async () => {
    const s = setup('admin', scriptedLlm('rate_limited'));
    const id = await saveDraft(s);
    const res = await s.post(`/api/admin/ai-behaviour/versions/${id}/publish`, {});
    expect(res.status).toBe(422);
    expect(s.db.tables.ai_prompt_versions![0]!.state).toBe('draft');
  });

  it('runs the tests with the DRAFT text, safety rules last', async () => {
    const llm = scriptedLlm();
    const s = setup('admin', llm);
    const id = await saveDraft(s, { ...draft, common_behaviour: 'DRAFT-MARKER' });
    await s.post(`/api/admin/ai-behaviour/versions/${id}/publish`, {});
    expect(llm.systems).toHaveLength(4);
    for (const sys of llm.systems) {
      expect(sys).toContain('DRAFT-MARKER');
      expect(sys.indexOf('DRAFT-MARKER')).toBeLessThan(sys.indexOf('SAFETY RULES'));
    }
    // The lost test also carries the lost-topic guidance (③).
    expect(llm.systems.some((x) => x.includes('Ask if they want to continue.'))).toBe(true);
  });
});

describe('AI behaviour — restore and Try it', () => {
  it('restore copies an older version into a new one and publishes it after the tests', async () => {
    const s = setup();
    const v1 = await saveDraft(s, { ...draft, common_behaviour: 'ONE' });
    await s.post(`/api/admin/ai-behaviour/versions/${v1}/publish`, {});
    const v2 = await saveDraft(s, { ...draft, common_behaviour: 'TWO' });
    await s.post(`/api/admin/ai-behaviour/versions/${v2}/publish`, {});

    const res = await s.post(`/api/admin/ai-behaviour/versions/${v1}/restore`, {});
    expect(res.status).toBe(200);
    const published = s.db.tables.ai_prompt_versions!.find((v) => v.state === 'published')!;
    expect(published).toMatchObject({ common_behaviour: 'ONE', based_on: v1 });
    expect(published.id).not.toBe(v1);
  });

  it('Try it answers with unsaved text and writes nothing', async () => {
    const llm = scriptedLlm();
    const s = setup('admin', llm);
    const res = await s.post('/api/admin/ai-behaviour/try', {
      question: 'Hello?',
      topic: 'internet',
      common_behaviour: 'UNSAVED-TEXT',
      topic_text: '',
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { answer: string }).answer).toBe('Sandbox reply.');
    expect(llm.systems[0]).toContain('UNSAVED-TEXT');
    expect(s.db.tables.ai_prompt_versions ?? []).toHaveLength(0);
    expect(s.db.tables.conversations).toHaveLength(0);
    expect(s.db.tables.messages).toHaveLength(0);
  });
});
