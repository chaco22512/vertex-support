import { describe, expect, it } from 'vitest';
import { createApp } from '../../index';
import { FakeSupabase } from '../../testing/fakeSupabase';
import { fakeKv, fakeSendEmail, fakeSendSlack, fakeVerifyStaff, mockLlm } from '../../testing/mocks';
import type { ApiBindings } from '../../types';

function setup(emailFrom: string) {
  const db = new FakeSupabase();
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
  const app = createApp(() => ({
    db: db.asClient(),
    llm: mockLlm(['{}']),
    kv: fakeKv(),
    adminOrigin: env.ADMIN_BASE_URL,
    chatOrigin: env.CHAT_BASE_URL ?? '',
    verifyStaff: fakeVerifyStaff('admin'),
    sendSlack: fakeSendSlack(),
    sendEmail: email,
    emailFrom,
  }));
  return { app, db, env, email };
}

const admin = { Authorization: 'Bearer tok', Origin: 'http://localhost:5174', 'Content-Type': 'application/json' };
const create = (app: ReturnType<typeof setup>['app'], env: ApiBindings) =>
  app.request(
    '/api/admin/staff',
    { method: 'POST', headers: admin, body: JSON.stringify({ name: 'Rin', email: 'rin@sim-point.jp', role: 'staff' }) },
    env,
  );

describe('createStaff invite (§7.6 v1.7)', () => {
  it('sends a branded SIM Point invite via Resend when a verified sender is configured', async () => {
    const { app, db, env, email } = setup('SIM Point chatbot support <noreply@sim-point.jp>');
    const res = await create(app, env);
    expect(res.status).toBe(201);
    expect(db.authCalls.generateLink).toBe(1); // branded path
    expect(db.authCalls.invite).toBe(0);
    expect(email.calls).toHaveLength(1);
    expect(email.calls[0]!.subject).toContain('SIM Point chatbot support');
    expect(email.calls[0]!.html).toContain('Set your password');
    expect(email.calls[0]!.html).toContain('How to use it');
    expect(db.tables.staff).toHaveLength(1);
  });

  it('falls back to Supabase invite (no Resend send) when the sender is the resend.dev test address', async () => {
    const { app, db, env, email } = setup('SIM Point Support <onboarding@resend.dev>');
    const res = await create(app, env);
    expect(res.status).toBe(201);
    expect(db.authCalls.invite).toBe(1); // fallback path
    expect(db.authCalls.generateLink).toBe(0);
    expect(email.calls).toHaveLength(0); // Supabase sends its own email
    expect(db.tables.staff).toHaveLength(1);
  });
});
