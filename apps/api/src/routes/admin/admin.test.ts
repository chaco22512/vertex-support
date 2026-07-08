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
