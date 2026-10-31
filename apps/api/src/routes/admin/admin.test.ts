import { describe, expect, it } from 'vitest';
import type { LlmClient } from '@vertex/ai';
import type { Role } from '@vertex/shared';
import { createApp } from '../../index';
import { FakeSupabase } from '../../testing/fakeSupabase';
import {
  fakeKv,
  fakeSendEmail,
  fakeSendSlack,
  fakeVerifyStaff,
  goodResponse,
  mockLlm,
} from '../../testing/mocks';
import type { ApiBindings } from '../../types';

function setup(role: Role = 'admin', llm: LlmClient = mockLlm([goodResponse()])) {
  const db = new FakeSupabase();
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
    sendEmail: email,
    emailFrom: 'test@resend.dev',
  }));
  return { app, db, env, slack, email };
}

const admin = { Authorization: 'Bearer tok', Origin: 'http://localhost:5174' };

describe('admin auth', () => {
  it('rejects requests without a token (401)', async () => {
    const { app, env } = setup();
    const res = await app.request('/api/admin/conversations', { headers: { Origin: 'http://localhost:5174' } }, env);
    expect(res.status).toBe(401);
  });

  it('forbids the staff role from editing rules (403, criterion 7)', async () => {
    const { app, db, env } = setup('staff');
    db.tables.kb_rules.push({ id: 'R1', category: 'X', rule_text: 'a', status: 'active', audience: 'customer' });
    const res = await app.request(
      '/api/admin/rules/R1',
      { method: 'PATCH', headers: { ...admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ rule_text: 'b' }) },
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe('admin rules', () => {
  it('admin updates a rule and writes a change-log entry (§7.4/§7.7)', async () => {
    const { app, db, env } = setup('admin');
    db.tables.kb_rules.push({
      id: 'R1',
      category: 'X',
      rule_text: 'old',
      fee_amounts_jpy: [4000],
      status: 'active',
      audience: 'customer',
    });
    const res = await app.request(
      '/api/admin/rules/R1',
      {
        method: 'PATCH',
        headers: { ...admin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fee_amounts_jpy: [4500] }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(db.tables.kb_rules[0]!.fee_amounts_jpy).toEqual([4500]);
    expect(db.tables.kb_change_log).toHaveLength(1);
    const log = db.tables.kb_change_log[0]!;
    expect((log.before as { fee_amounts_jpy: number[] }).fee_amounts_jpy).toEqual([4000]);
    expect((log.after as { fee_amounts_jpy: number[] }).fee_amounts_jpy).toEqual([4500]);
  });

  it('lists every rule past the 1000-row PostgREST cap (v1.8 Phase 0)', async () => {
    const { app, db, env } = setup('admin');
    for (let i = 0; i < 2500; i++) {
      db.tables.kb_rules.push({
        id: `R${String(i).padStart(4, '0')}`,
        category: i % 2 ? 'A' : 'B',
        rule_text: 'x',
        status: i < 300 ? 'pending_review' : 'active',
        audience: 'customer',
      });
    }
    const all = await app.request('/api/admin/rules', { headers: admin }, env);
    expect(all.status).toBe(200);
    expect(((await all.json()) as { rules: unknown[] }).rules).toHaveLength(2500);

    const active = await app.request('/api/admin/rules?status=active', { headers: admin }, env);
    expect(((await active.json()) as { rules: unknown[] }).rules).toHaveLength(2200);
  });

  it('bulk-approves pending_review rules (§7.5)', async () => {
    const { app, db, env } = setup('admin');
    db.tables.kb_rules.push(
      { id: 'R1', category: 'X', rule_text: 'a', status: 'pending_review', audience: 'internal' },
      { id: 'R2', category: 'X', rule_text: 'b', status: 'pending_review', audience: 'customer' },
    );
    const res = await app.request(
      '/api/admin/rules/approve',
      { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ['R1', 'R2'] }) },
      env,
    );
    expect(res.status).toBe(200);
    expect(db.tables.kb_rules.every((r) => r.status === 'active')).toBe(true);
  });
});

describe('admin AI diagnostics (v1.8 §7.9)', () => {
  const diag = (fallback_result: string | null, error: string | null = null) => ({
    topic: 'cancel',
    topic_guess: 'internet',
    scoped_rule_count: 464,
    primary_reason: 'not_in_manual',
    fallback_tried: fallback_result !== null,
    fallback_result,
    candidate_count: 2,
    candidate_ids: ['R657', 'R659'],
    top_scores: [16.1, 15.8],
    keywords: ['apn'],
    error,
    timings: { primary_ms: 4000, retrieve_ms: 30, fallback_ms: 3000, total_ms: 7100 },
  });

  it('lists diagnosed AI turns with the question they answered, newest first, plus a summary', async () => {
    const { app, db, env } = setup('admin');
    db.tables.messages.push(
      { id: 1, conversation_id: 'c1', sender: 'customer', body: 'Cancel?', ai_meta: null },
      { id: 2, conversation_id: 'c1', sender: 'ai', body: 'When did it start?', ai_meta: { action: 'ask' } },
      { id: 3, conversation_id: 'c1', sender: 'customer', body: 'APN on iPhone?', ai_meta: null },
      { id: 4, conversation_id: 'c1', sender: 'ai', body: 'Staff will reply.', ai_meta: { action: 'escalate', reason: 'not_in_manual', diag: diag('not_found') } },
      { id: 5, conversation_id: 'c2', sender: 'customer', body: 'Lost SIM', ai_meta: null },
      { id: 6, conversation_id: 'c2', sender: 'ai', body: 'Fee is ¥4,000.', ai_meta: { action: 'answer', reason: 'none', diag: diag('answered') } },
      { id: 7, conversation_id: 'c3', sender: 'ai', body: 'Staff will reply.', ai_meta: { action: 'escalate', reason: 'other', diag: diag(null, 'rate_limited') } },
    );
    const res = await app.request('/api/admin/ai-diagnostics', { headers: admin }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rows: { message_id: number; question: string }[];
      summary: Record<string, number>;
    };
    expect(body.rows.map((r) => r.message_id)).toEqual([7, 6, 4]);
    expect(body.rows.find((r) => r.message_id === 4)!.question).toBe('APN on iPhone?');
    expect(body.summary).toEqual({ not_found: 1, answered: 1, 'error:rate_limited': 1 });

    const filtered = await app.request('/api/admin/ai-diagnostics?result=not_found', { headers: admin }, env);
    expect(((await filtered.json()) as { rows: unknown[] }).rows).toHaveLength(1);
  });

  it('is admin-only', async () => {
    const { app, env } = setup('staff');
    expect((await app.request('/api/admin/ai-diagnostics', { headers: admin }, env)).status).toBe(403);
  });
});

describe('admin translate', () => {
  it('returns an English translation (§7.3)', async () => {
    const { app, env } = setup('staff', mockLlm(['How do I pay?']));
    const res = await app.request(
      '/api/admin/conversations/c1/translate',
      { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '支払い方法は？' }) },
      env,
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { translation: string }).translation).toBe('How do I pay?');
  });
});

describe('staff reply email (§8, criterion 6)', () => {
  it('emails the customer with a session-token chat link when contact_email is set', async () => {
    const { app, db, env, email } = setup('staff');
    db.tables.conversations.push({
      id: 'x1',
      status: 'escalated',
      language: 'vi',
      contact_email: 'customer@example.com',
      session_token: 'sess-xyz',
    });
    const res = await app.request(
      '/api/admin/conversations/x1/reply',
      { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ body: 'Here is your answer.' }) },
      env,
    );
    expect(res.status).toBe(200);
    expect(email.calls).toHaveLength(1);
    expect(email.calls[0]!.to).toBe('customer@example.com');
    expect(email.calls[0]!.subject).toContain('SIM Point Support');
    expect(email.calls[0]!.html).toContain('/?t=sess-xyz');
  });

  it('does not email when there is no contact_email', async () => {
    const { app, db, env, email } = setup('staff');
    db.tables.conversations.push({ id: 'x2', status: 'escalated', language: 'en', contact_email: '', session_token: 't' });
    await app.request(
      '/api/admin/conversations/x2/reply',
      { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ body: 'hi' }) },
      env,
    );
    expect(email.calls).toHaveLength(0);
  });
});

describe('admin AI usage (v1.8 §7.1)', () => {
  it('any staff member can read today\'s count and remaining (default cap 20)', async () => {
    const { app, db, env } = setup('staff');
    db.tables.ai_call_log = [
      { id: 1, at: new Date().toISOString(), outcome: 'ok' },
      { id: 2, at: new Date().toISOString(), outcome: 'rate_limited' },
    ];
    const res = await app.request('/api/admin/ai-usage', { headers: admin }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ used_today: 1, limit: 20, remaining: 19, daily_limit_hit: false });
  });
});
