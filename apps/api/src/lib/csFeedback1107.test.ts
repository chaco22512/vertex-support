import { describe, expect, it } from 'vitest';
import {
  BUSY_ESCALATION_MESSAGE,
  fetchScopedRules,
  GeminiError,
  idHasCode,
  resolveIdPrefixes,
  resolveKbCategories,
  type LlmClient,
  type LlmGenerateRequest,
} from '@vertex/ai';
import type { Conversation, Role } from '@vertex/shared';
import { createApp } from '../index';
import { FakeSupabase } from '../testing/fakeSupabase';
import {
  fakeKv,
  fakeSendEmail,
  fakeSendSlack,
  fakeVerifyStaff,
  goodResponse,
} from '../testing/mocks';
import type { ApiBindings, Deps } from '../types';
import { generateAiReply } from './aiTurn';
import { summarizeActivity } from './aiUsage';
import { countingLlm } from './countingLlm';
import { loadMenu, menu } from './menu';

/** 2026-11-07 CS feedback: AI limits (RPM/RPD), purposes, translate, topic codes. */

const base = {
  fee_amounts_jpy: [],
  links: [],
  audience: 'customer',
  ai_can_answer: true,
  status: 'active',
  subcategory: '',
};

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    channel: 'webchat',
    session_token: 'tok',
    language: 'en',
    status: 'ai_handling',
    source_tag: '',
    topic_category: 'plans',
    contact_email: '',
    contact_whatsapp: '',
    intake_info: {},
    assigned_staff: null,
    escalated_at: null,
    reply_due_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function queueLlm(queue: (string | Error)[]): LlmClient & { calls: LlmGenerateRequest[] } {
  const calls: LlmGenerateRequest[] = [];
  let i = 0;
  return {
    model: 'mock-model',
    calls,
    generate: async (req) => {
      calls.push(req);
      const r = queue[Math.min(i++, queue.length - 1)]!;
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

function deps(llm: LlmClient, db: FakeSupabase): Deps {
  return {
    db: db.asClient(),
    llm,
    kv: {} as KVNamespace,
    adminOrigin: '',
    chatOrigin: '',
    verifyStaff: fakeVerifyStaff(),
    sendSlack: fakeSendSlack(),
    sendEmail: fakeSendEmail(),
    emailFrom: 'test@resend.dev',
  };
}

function seeded(): FakeSupabase {
  const db = new FakeSupabase();
  db.tables.kb_rules.push(
    { ...base, id: 'PL001', category: 'Plans', rule_text: 'Plans need a Residence Card.' },
    {
      ...base,
      id: 'ESP001',
      category: 'CS AI DOC: AI_eSIM',
      rule_text: 'eSIM: iPhone XS and later.',
    },
    { ...base, id: 'CN0001', category: 'Cancellation', rule_text: 'Four-digit cancellation rule.' },
    { ...base, id: 'INT001', category: 'X', rule_text: 'Not an IN rule.' },
  );
  return db;
}

const DAILY = new GeminiError(
  429,
  'mock-model',
  'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
);
const MINUTE = new GeminiError(
  429,
  'mock-model',
  'GenerateRequestsPerMinutePerProjectPerModel-FreeTier',
);
const q = [{ sender: 'customer' as const, body: 'Which phones work with eSIM?' }];

describe('① AI limits: never silent, natural message, RPM vs RPD in diagnostics', () => {
  it('per-minute 429 → escalates with the "busy" message and records rate_limited', async () => {
    const res = await generateAiReply(deps(queueLlm([MINUTE]), seeded()), conversation(), q);
    expect(res.aiMeta.action).toBe('escalate');
    expect(res.answer).toBe(BUSY_ESCALATION_MESSAGE.en);
    expect(res.answer).not.toMatch(/AI|limit/i);
    expect(res.aiMeta.diag).toMatchObject({ error: 'rate_limited' });
  });

  it('per-day 429 → records daily_limit (distinct from the per-minute cap)', async () => {
    const res = await generateAiReply(
      deps(queueLlm([DAILY]), seeded()),
      conversation({ language: 'vi' }),
      q,
    );
    expect(res.answer).toBe(BUSY_ESCALATION_MESSAGE.vi);
    expect(res.aiMeta.diag).toMatchObject({ error: 'daily_limit' });
  });

  it('a 429 during the full-manual retry is recorded as daily_limit too', async () => {
    const llm = queueLlm([
      goodResponse({
        action: 'escalate',
        answer: 'Staff will reply.',
        reason: 'not_in_manual',
        search_keywords: ['esim'],
      }),
      DAILY,
    ]);
    const res = await generateAiReply(
      deps(llm, seeded()),
      conversation({ topic_category: 'cancel' }),
      q,
    );
    expect(res.aiMeta.diag).toMatchObject({ fallback_tried: true, fallback_result: 'daily_limit' });
  });

  it('busy message exists in all 5 languages', () => {
    expect(Object.keys(BUSY_ESCALATION_MESSAGE).sort()).toEqual(['en', 'id', 'ne', 'tl', 'vi']);
  });

  it('tags each call with its purpose: reply, then fallback', async () => {
    const llm = queueLlm([
      goodResponse({
        action: 'escalate',
        answer: 'x',
        reason: 'not_in_manual',
        search_keywords: ['esim'],
      }),
      goodResponse({ answer: 'iPhone XS and later.' }),
    ]);
    await generateAiReply(deps(llm, seeded()), conversation({ topic_category: 'cancel' }), q);
    expect(llm.calls.map((c) => c.purpose)).toEqual(['reply', 'fallback']);
  });

  it('countingLlm stores the purpose with every logged call', async () => {
    const db = new FakeSupabase();
    const llm = countingLlm(queueLlm(['ok', MINUTE]), db.asClient());
    await llm.generate({ system: 's', messages: [], purpose: 'translate' });
    await llm.generate({ system: 's', messages: [], purpose: 'reply' }).catch(() => {});
    expect(db.tables.ai_call_log!.map((r) => [r.purpose, r.outcome])).toEqual([
      ['translate', 'ok'],
      ['reply', 'rate_limited'],
    ]);
  });
});

describe('① Dashboard: this minute, last hour, calls per question', () => {
  const now = new Date('2026-11-07T03:30:30Z');
  const at = (secondsAgo: number) => new Date(now.getTime() - secondsAgo * 1000).toISOString();

  it('counts the calls Google accepted in the last 60 s against the RPM limit', () => {
    const a = summarizeActivity(
      [
        { at: at(10), outcome: 'ok', purpose: 'reply' },
        { at: at(20), outcome: 'error', purpose: 'reply' },
        { at: at(30), outcome: 'rate_limited', purpose: 'reply' },
        { at: at(90), outcome: 'ok', purpose: 'reply' },
      ],
      5,
      now,
    );
    expect(a.minute).toEqual({ used: 2, limit: 5, limited: true });
    expect(a.last_hour).toHaveLength(60);
    expect(a.last_hour.at(-1)!.minute).toBe('2026-11-07T03:30:00.000Z');
    expect(a.last_hour.reduce((n, m) => n + m.calls, 0)).toBe(3);
    expect(a.last_hour.some((m) => m.limited)).toBe(true);
  });

  it('reports calls per customer question (reply + retry + fallback) / replies, by purpose', () => {
    const a = summarizeActivity(
      [
        { at: at(100), outcome: 'ok', purpose: 'reply' },
        { at: at(200), outcome: 'ok', purpose: 'reply' },
        { at: at(300), outcome: 'ok', purpose: 'fallback' },
        { at: at(400), outcome: 'ok', purpose: 'translate' },
        { at: at(500), outcome: 'ok', purpose: '' },
      ],
      5,
      now,
    );
    expect(a.purposes.today).toEqual({ reply: 2, fallback: 1, translate: 1, unknown: 1 });
    expect(a.purposes.per_question_today).toBe(1.5);
  });
});

describe('④ Rule ID codes: 3–4 digits, CS-added codes linked to tiles', () => {
  it('idHasCode accepts 3–4 digits and still never mixes IN with INT', () => {
    expect(idHasCode('CN0001', 'CN')).toBe(true);
    expect(idHasCode('ESP001', 'ESP')).toBe(true);
    expect(idHasCode('INT001', 'IN')).toBe(false);
    expect(idHasCode('IN00001', 'IN')).toBe(false);
  });

  it('a 4-digit rule is in its tile range', async () => {
    const db = seeded();
    const cancel = await fetchScopedRules(
      db.asClient(),
      resolveKbCategories('cancel', menu),
      resolveIdPrefixes('cancel', menu),
    );
    expect(cancel.map((r) => r.id)).toContain('CN0001');
  });

  it('ESP rules reach a tile only after ESP is linked to it', async () => {
    const db = seeded();
    const plansRange = async () =>
      (
        await fetchScopedRules(
          db.asClient(),
          resolveKbCategories('plans', menu),
          resolveIdPrefixes('plans', await loadMenu(db.asClient())),
        )
      ).map((r) => r.id);
    expect(await plansRange()).not.toContain('ESP001');
    db.tables.kb_topic_codes = [{ code: 'ESP', label: 'eSIM', topics: ['plans', 'connection'] }];
    expect(await plansRange()).toContain('ESP001');
    // "connection" shares the Internet range, so the link lands on internet.
    expect(resolveIdPrefixes('connection', await loadMenu(db.asClient()))).toContain('ESP');
  });
});

function app(role: Role = 'admin', db = seeded(), llm: LlmClient = queueLlm(['[]'])) {
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
  const slack = fakeSendSlack();
  const a = createApp((e) => ({
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
  const headers = {
    Authorization: 'Bearer tok',
    Origin: 'http://localhost:5174',
    'Content-Type': 'application/json',
  };
  return {
    db,
    slack,
    get: (p: string) => a.request(p, { headers }, env),
    put: (p: string, body: unknown) =>
      a.request(p, { method: 'PUT', headers, body: JSON.stringify(body) }, env),
    post: (p: string, body?: unknown) =>
      a.request(
        p,
        { method: 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) },
        env,
      ),
  };
}

describe('④ admin "Topic codes"', () => {
  it('lists built-in and found codes; ESP shows as unlinked until linked', async () => {
    const s = app();
    const body = (await (await s.get('/api/admin/topic-codes')).json()) as {
      tiles: { id: string }[];
      codes: { code: string; unlinked: boolean; rule_count: number; builtin_topics: string[] }[];
    };
    expect(body.tiles.map((t) => t.id)).not.toContain('others');
    expect(body.tiles.map((t) => t.id)).not.toContain('connection'); // shares internet
    const esp = body.codes.find((c) => c.code === 'ESP')!;
    expect(esp).toMatchObject({ unlinked: true, rule_count: 1 });
    expect(body.codes.find((c) => c.code === 'DR')!.builtin_topics).toEqual(['deposit']);

    const res = await s.put('/api/admin/topic-codes/esp', {
      label: 'eSIM',
      topics: ['plans', 'lost'],
    });
    expect(res.status).toBe(200);
    expect(s.db.tables.kb_topic_codes).toEqual([
      expect.objectContaining({ code: 'ESP', label: 'eSIM', topics: ['plans', 'lost'] }),
    ]);
    expect(s.slack.calls.at(-1)).toContain('Topic code ESP');
    const after = (await (await s.get('/api/admin/topic-codes')).json()) as {
      codes: { code: string; unlinked: boolean; extra_topics: string[] }[];
    };
    expect(after.codes.find((c) => c.code === 'ESP')).toMatchObject({
      unlinked: false,
      extra_topics: ['plans', 'lost'],
    });
  });

  it('rejects bad codes / unknown tiles and non-admins', async () => {
    const s = app();
    expect((await s.put('/api/admin/topic-codes/E1', { topics: [] })).status).toBe(400);
    expect((await s.put('/api/admin/topic-codes/ESP', { topics: ['nope'] })).status).toBe(400);
    expect((await s.put('/api/admin/topic-codes/ESP', { topics: ['others'] })).status).toBe(400);
    expect((await app('staff').get('/api/admin/topic-codes')).status).toBe(403);
  });
});

describe('① Translate: one call per conversation, saved', () => {
  function withMessages(): FakeSupabase {
    const db = seeded();
    db.tables.conversations.push({
      id: 'conv-1',
      language: 'id',
      topic_category: 'plans',
      status: 'escalated',
    });
    db.tables.messages.push(
      { id: 1, conversation_id: 'conv-1', sender: 'customer', body: 'Halo', translation_en: null },
      { id: 2, conversation_id: 'conv-1', sender: 'ai', body: 'Hello!', translation_en: null },
      {
        id: 3,
        conversation_id: 'conv-1',
        sender: 'customer',
        body: 'Berapa biaya?',
        translation_en: null,
      },
    );
    return db;
  }

  it('translates every customer message in ONE model call and never calls again', async () => {
    const db = withMessages();
    const llm = queueLlm([JSON.stringify(['Hello', 'How much is it?'])]);
    const s = app('staff', db, llm);
    const first = (await (
      await s.post('/api/admin/conversations/conv-1/translate', {})
    ).json()) as {
      translations: Record<string, string>;
      calls: number;
    };
    expect(first).toEqual({ translations: { 1: 'Hello', 3: 'How much is it?' }, calls: 1 });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]!.purpose).toBe('translate');

    const again = (await (
      await s.post('/api/admin/conversations/conv-1/translate', {})
    ).json()) as { calls: number };
    expect(again.calls).toBe(0);
    expect(llm.calls).toHaveLength(1);
  });

  it('the customer never receives the staff translation', async () => {
    const db = withMessages();
    db.tables.messages[0]!.translation_en = 'Hello';
    db.tables.conversations[0]!.session_token = 'sess-tok';
    const s = app('staff', db);
    const res = await s.get('/api/conversations/sess-tok/messages');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: Record<string, unknown>[] };
    expect(body.messages).toHaveLength(3);
    for (const m of body.messages) expect(m).not.toHaveProperty('translation_en');
  });
});
