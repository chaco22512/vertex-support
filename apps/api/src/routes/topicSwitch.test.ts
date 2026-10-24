import { describe, expect, it } from 'vitest';
import type { LlmClient } from '@vertex/ai';
import { createApp } from '../index';
import { FakeSupabase } from '../testing/fakeSupabase';
import {
  escalateResponse,
  fakeKv,
  fakeSendEmail,
  fakeSendSlack,
  fakeVerifyStaff,
  goodResponse,
  mockLlm,
} from '../testing/mocks';
import type { ApiBindings } from '../types';

/** Spec v1.8 §4.1.1 / §6.1-7 — topic switch, open-case follow-ups, POST /topic. */

const CHAT_ORIGIN = 'http://localhost:5173';
const jsonHeaders = { 'Content-Type': 'application/json', Origin: CHAT_ORIGIN };

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
    sendEmail: fakeSendEmail(),
    emailFrom: 'test@resend.dev',
  }));
  return { app, db, env, slack };
}

async function start(s: ReturnType<typeof setup>, topic = 'cancel'): Promise<string> {
  const res = await s.app.request(
    '/api/conversations',
    { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ topic_category: topic }) },
    s.env,
  );
  return ((await res.json()) as { token: string }).token;
}

function post(s: ReturnType<typeof setup>, path: string, body: unknown) {
  return s.app.request(path, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) }, s.env);
}

const markers = (s: ReturnType<typeof setup>) =>
  s.db.tables.messages.filter((m) => m.sender === 'system' && m.body).map((m) => m.body);

describe('topic switch on a new question (§4.1.1)', () => {
  it('re-scopes the conversation and leaves a "Topic:" marker', async () => {
    const s = setup(mockLlm([goodResponse({ topic: 'internet' })]));
    const token = await start(s);
    const res = await post(s, `/api/conversations/${token}/messages`, { body: 'How do I set the APN?' });
    const body = (await res.json()) as { topic_category: string; escalated: boolean };
    expect(body.topic_category).toBe('internet');
    expect(body.escalated).toBe(false);
    expect(s.db.tables.conversations[0]!.topic_category).toBe('internet');
    expect(markers(s)).toEqual(['Topic: Cancellation', 'Topic: Internet not working / APN setup']);
  });
});

describe('escalation in a conversation already with staff (§4.1.1-3)', () => {
  function withContact(s: ReturnType<typeof setup>, status: string) {
    Object.assign(s.db.tables.conversations[0]!, {
      status,
      contact_email: 'a@b.com',
      reply_due_at: '2099-01-01T00:00:00.000Z',
      escalated_at: '2026-01-01T00:00:00.000Z',
    });
  }

  it('a new question in an escalated conversation is answered by the AI (no cards, no notice)', async () => {
    const s = setup(mockLlm([goodResponse({ topic: 'internet' })]));
    const token = await start(s);
    withContact(s, 'escalated');
    const res = await post(s, `/api/conversations/${token}/messages`, { body: 'APN?' });
    const body = (await res.json()) as { escalated: boolean; followup_escalated: boolean; status: string };
    expect(body).toMatchObject({ escalated: false, followup_escalated: false, status: 'escalated' });
    expect(s.slack.calls).toHaveLength(0);
  });

  it('a chaser (pending_case) goes to staff without re-asking for contact; deadline kept', async () => {
    const s = setup(mockLlm([escalateResponse('pending_case')]));
    const token = await start(s);
    withContact(s, 'escalated');
    const res = await post(s, `/api/conversations/${token}/messages`, { body: 'Any update on my case?' });
    const body = (await res.json()) as { escalated: boolean; followup_escalated: boolean };
    expect(body).toMatchObject({ escalated: false, followup_escalated: true });
    const conv = s.db.tables.conversations[0]!;
    expect(conv.reply_due_at).toBe('2099-01-01T00:00:00.000Z');
    expect(s.slack.calls).toHaveLength(1);
    expect(s.slack.calls[0]).toContain('Follow-up in an open case');
    expect(s.slack.calls[0]).toContain('Any update on my case?');
    expect(s.slack.calls[0]).toContain('AI reason: pending_case');
  });

  it('after a staff reply, a new escalation re-opens the case with a fresh deadline', async () => {
    const s = setup(mockLlm([escalateResponse('account_specific')]));
    const token = await start(s);
    withContact(s, 'staff_replied');
    await post(s, `/api/conversations/${token}/messages`, { body: 'Is my bill paid?' });
    const conv = s.db.tables.conversations[0]!;
    expect(conv.status).toBe('escalated');
    expect(conv.reply_due_at).not.toBe('2099-01-01T00:00:00.000Z');
    expect(s.slack.calls).toHaveLength(1);
  });

  it('without contact on file the first escalation still defers to the intake → contact cards', async () => {
    const s = setup(mockLlm([escalateResponse('price_question')]));
    const token = await start(s);
    const res = await post(s, `/api/conversations/${token}/messages`, { body: '30GB price?' });
    expect(((await res.json()) as { escalated: boolean }).escalated).toBe(true);
    expect(s.slack.calls).toHaveLength(0);
  });
});

describe('POST /api/conversations/:token/topic (§6.1-7)', () => {
  it('switches the same conversation to another topic and keeps its history', async () => {
    const s = setup();
    const token = await start(s);
    await post(s, `/api/conversations/${token}/messages`, { body: 'Cancel?' });
    const res = await post(s, `/api/conversations/${token}/topic`, { topic_category: 'lost' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { topic_category: string }).topic_category).toBe('lost');
    expect(s.db.tables.conversations).toHaveLength(1);
    expect(s.db.tables.conversations[0]!.topic_category).toBe('lost');
    expect(markers(s).at(-1)).toBe('Topic: Lost SIM or device');
    expect(s.db.tables.messages.some((m) => m.body === 'Cancel?')).toBe(true);
  });

  it('rejects an unknown topic', async () => {
    const s = setup();
    const token = await start(s);
    expect((await post(s, `/api/conversations/${token}/topic`, { topic_category: 'nope' })).status).toBe(400);
  });

  it('Plans & prices with contact on file hands straight to staff (price_question)', async () => {
    const s = setup();
    const token = await start(s);
    Object.assign(s.db.tables.conversations[0]!, { status: 'staff_replied', contact_email: 'a@b.com' });
    const res = await post(s, `/api/conversations/${token}/topic`, { topic_category: 'plans' });
    expect(((await res.json()) as { followup_escalated: boolean }).followup_escalated).toBe(true);
    expect(s.db.tables.conversations[0]!.status).toBe('escalated');
    expect(s.slack.calls[0]).toContain('AI reason: price_question');
  });

  it('Plans & prices without contact just switches (client shows the contact cards)', async () => {
    const s = setup();
    const token = await start(s);
    const res = await post(s, `/api/conversations/${token}/topic`, { topic_category: 'plans' });
    expect(((await res.json()) as { followup_escalated: boolean }).followup_escalated).toBe(false);
    expect(s.slack.calls).toHaveLength(0);
  });
});
