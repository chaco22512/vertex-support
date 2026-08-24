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

describe('deleteStaff (§7.6 v1.7)', () => {
  const del = (app: ReturnType<typeof setup>['app'], env: ApiBindings, id: string) =>
    app.request(`/api/admin/staff/${id}`, { method: 'DELETE', headers: admin }, env);

  it('deletes a staff member, clears their FKs, and removes the auth user', async () => {
    const { app, db, env } = setup('x@resend.dev');
    // requester is 'staff-1' (fakeVerifyStaff). Seed another admin + the target.
    db.tables.staff.push(
      { id: 'staff-1', name: 'Me', email: 'me@x', role: 'admin', is_active: true },
      { id: 'victim', name: 'Rin', email: 'rin@x', role: 'staff', is_active: true },
    );
    db.tables.conversations.push({ id: 'c1', assigned_staff: 'victim', session_token: 't', status: 'escalated' });

    const res = await del(app, env, 'victim');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted: boolean; auth_user_removed: boolean };
    expect(body.deleted).toBe(true);
    expect(body.auth_user_removed).toBe(true);
    expect(db.tables.staff.find((s) => s.id === 'victim')).toBeUndefined();
    expect(db.tables.conversations[0]!.assigned_staff).toBeNull(); // unassigned
    expect(db.authCalls.deleteUser).toBe(1);
  });

  it('refuses to delete your own account', async () => {
    const { app, env, db } = setup('x@resend.dev');
    db.tables.staff.push({ id: 'staff-1', name: 'Me', email: 'me@x', role: 'admin', is_active: true });
    const res = await del(app, env, 'staff-1');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('cannot_delete_self');
  });

  it('refuses to delete the last active admin', async () => {
    const { app, env, db } = setup('x@resend.dev');
    db.tables.staff.push(
      { id: 'staff-1', name: 'Me', email: 'me@x', role: 'staff', is_active: true }, // requester is not admin
      { id: 'onlyadmin', name: 'Boss', email: 'boss@x', role: 'admin', is_active: true },
    );
    const res = await del(app, env, 'onlyadmin');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('last_active_admin');
    expect(db.tables.staff.find((s) => s.id === 'onlyadmin')).toBeDefined(); // untouched
  });
});
