import { describe, expect, it } from 'vitest';
import type { LlmClient } from '@vertex/ai';
import { createApp } from './index';
import { FakeSupabase } from './testing/fakeSupabase';
import {
  fakeKv,
  fakeSendEmail,
  fakeSendSlack,
  fakeVerifyStaff,
  goodResponse,
  escalateResponse,
  mockLlm,
} from './testing/mocks';
import type { ApiBindings } from './types';

const CHAT_ORIGIN = 'http://localhost:5173';

function setup(llm: LlmClient = mockLlm([goodResponse()])) {
  const db = new FakeSupabase();
  db.tables.kb_rules.push({
    id: 'R010',
    category: 'GENERAL RULES',
    rule_text: 'Be helpful.',
    fee_amounts_jpy: [],
    links: [],
    audience: 'customer',
    ai_can_answer: true,
    status: 'active',
  });
  const kv = fakeKv();
  const slack = fakeSendSlack();
  const email = fakeSendEmail();
  const env: ApiBindings = {
    SUPABASE_URL: 'x',
    SUPABASE_ANON_KEY: 'x',
    SUPABASE_SERVICE_ROLE_KEY: 'x',
    GEMINI_API_KEY: 'x',
    SLACK_WEBHOOK_URL: 'x',
    RESEND_API_KEY: 'x',
    ADMIN_BASE_URL: 'http://localhost:5174',
    CHAT_BASE_URL: CHAT_ORIGIN,
    RATE_LIMIT: kv,
  };
  const app = createApp((e) => ({
    db: db.asClient(),
    llm,
    kv,
    adminOrigin: e.ADMIN_BASE_URL,
    chatOrigin: e.CHAT_BASE_URL ?? '',
    verifyStaff: fakeVerifyStaff(),
    sendSlack: slack,
    sendEmail: email,
    emailFrom: 'test@resend.dev',
  }));
  return { app, db, env, slack, email };
}

const jsonHeaders = { 'Content-Type': 'application/json', Origin: CHAT_ORIGIN };

async function createConversation(app: ReturnType<typeof setup>['app'], env: ApiBindings, body = {}) {
  const res = await app.request(
    '/api/conversations',
    { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) },
    env,
  );
  return res;
}

describe('POST /api/conversations', () => {
  it('creates a session with a secure token', async () => {
    const { app, db, env } = setup();
    const res = await createConversation(app, env, { language: 'vi', source_tag: 'agent042' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { token: string; status: string };
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(body.status).toBe('ai_handling');
    expect(db.tables.conversations).toHaveLength(1);
  });
});

describe('message flow', () => {
  it('stores customer + AI messages and returns the reply', async () => {
    const { app, db, env } = setup(mockLlm([goodResponse()]));
    const token = ((await (await createConversation(app, env)).json()) as { token: string }).token;

    const res = await app.request(
      `/api/conversations/${token}/messages`,
      { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ body: 'How do I set APN?' }) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reply: { body: string }; escalated: boolean };
    expect(body.reply.body).toBe('Here is how to do it.');
    expect(body.escalated).toBe(false);
    expect(db.tables.messages.filter((m) => m.sender === 'customer')).toHaveLength(1);
    expect(db.tables.messages.filter((m) => m.sender === 'ai')).toHaveLength(1);
  });

  it('AI escalate signals the client but defers the DB escalation to /contact (§6.2 v1.6)', async () => {
    const escalated = escalateResponse('price_question');
    const { app, db, env, slack } = setup(mockLlm([escalated]));
    const token = ((await (await createConversation(app, env)).json()) as { token: string }).token;

    const res = await app.request(
      `/api/conversations/${token}/messages`,
      { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ body: '30GB monthly price?' }) },
      env,
    );
    const body = (await res.json()) as { escalated: boolean; status: string };
    // Client is told to collect intake + contact, but nothing is escalated/notified yet.
    expect(body.escalated).toBe(true);
    expect(body.status).not.toBe('escalated');
    expect(db.tables.conversations[0]!.status).toBe('ai_handling');
    expect(slack.calls).toHaveLength(0);
  });

  it('escalates + Slack-notifies with the reason and intake on /contact (criteria 2/8/35)', async () => {
    const { app, db, env, slack } = setup();
    const token = ((await (await createConversation(app, env)).json()) as { token: string }).token;

    const res = await app.request(
      `/api/conversations/${token}/contact`,
      {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          email: 'a@b.com',
          reason: 'price_question',
          intake: { customer_number: 'C-100', device_model: 'iPhone 12', junk: 'x' },
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const conv = db.tables.conversations[0]!;
    expect(conv.status).toBe('escalated');
    expect(conv.reply_due_at).not.toBeNull();
    // Intake persisted (unknown keys stripped by the schema).
    expect(conv.intake_info).toEqual({ customer_number: 'C-100', device_model: 'iPhone 12' });
    // §8: one Slack notice, with the AI reason and the intake Info line.
    expect(slack.calls).toHaveLength(1);
    expect(slack.calls[0]!).toContain('AI reason: price_question');
    expect(slack.calls[0]!).toContain('Info: Customer #=C-100');
    expect(slack.calls[0]!).toContain('Device=iPhone 12');
  });

  it('rejects an empty message body', async () => {
    const { app, env } = setup();
    const token = ((await (await createConversation(app, env)).json()) as { token: string }).token;
    const res = await app.request(
      `/api/conversations/${token}/messages`,
      { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ body: '' }) },
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe('feedback & contact', () => {
  it('marks solved', async () => {
    const { app, db, env } = setup();
    const token = ((await (await createConversation(app, env)).json()) as { token: string }).token;
    const res = await app.request(
      `/api/conversations/${token}/feedback`,
      { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ type: 'solved' }) },
      env,
    );
    expect(((await res.json()) as { status: string }).status).toBe('resolved');
    expect(db.tables.conversations[0]!.status).toBe('resolved');
  });

  it('stores contact (+ optional name) and escalates', async () => {
    const { app, db, env } = setup();
    const token = ((await (await createConversation(app, env)).json()) as { token: string }).token;
    const res = await app.request(
      `/api/conversations/${token}/contact`,
      { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ name: 'Aiko', email: 'a@b.com' }) },
      env,
    );
    expect(res.status).toBe(200);
    const conv = db.tables.conversations[0]!;
    expect(conv.status).toBe('escalated');
    expect(conv.contact_email).toBe('a@b.com');
    expect(conv.customer_name).toBe('Aiko');
  });
});

describe('session auth & rate limiting', () => {
  it('returns 404 for an unknown token', async () => {
    const { app, env } = setup();
    const res = await app.request(
      '/api/conversations/does-not-exist/messages',
      { headers: { Origin: CHAT_ORIGIN } },
      env,
    );
    expect(res.status).toBe(404);
  });

  it('does NOT rate-limit GET polling (read-only; no KV writes)', async () => {
    const { app, env } = setup();
    const token = ((await (await createConversation(app, env)).json()) as { token: string }).token;
    const path = `/api/conversations/${token}/messages`;
    let last = 200;
    for (let i = 0; i < 15; i++) {
      const res = await app.request(path, { headers: { Origin: CHAT_ORIGIN } }, env);
      last = res.status;
    }
    expect(last).toBe(200); // GET is never 429 (the 5s poll must not hit the KV limiter)
  });

  it('rate-limits mutating POSTs after 10 per session (§2, criterion 8)', async () => {
    const { app, env } = setup();
    const token = ((await (await createConversation(app, env)).json()) as { token: string }).token;
    const path = `/api/conversations/${token}/messages`;
    let last = 200;
    for (let i = 0; i < 11; i++) {
      const res = await app.request(
        path,
        { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ body: 'hi' }) },
        env,
      );
      last = res.status;
    }
    expect(last).toBe(429);
  });
});

describe('CORS (§2)', () => {
  it('allows the chat origin', async () => {
    const { app, env } = setup();
    const res = await app.request('/health', { headers: { Origin: CHAT_ORIGIN } }, env);
    expect(res.headers.get('access-control-allow-origin')).toBe(CHAT_ORIGIN);
  });

  it('does not allow an unknown origin', async () => {
    const { app, env } = setup();
    const res = await app.request('/health', { headers: { Origin: 'https://evil.example' } }, env);
    expect(res.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
  });

  it('allows DELETE in the preflight (staff delete is cross-origin)', async () => {
    const { app, env } = setup();
    const res = await app.request(
      '/api/admin/staff/x',
      { method: 'OPTIONS', headers: { Origin: 'http://localhost:5174', 'Access-Control-Request-Method': 'DELETE' } },
      env,
    );
    expect(res.headers.get('access-control-allow-methods')).toContain('DELETE');
  });
});
