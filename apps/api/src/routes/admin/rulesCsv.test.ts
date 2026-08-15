import { describe, expect, it } from 'vitest';
import type { Role } from '@vertex/shared';
import { KB_CSV_HEADERS } from '@vertex/shared';
import { createApp } from '../../index';
import { FakeSupabase } from '../../testing/fakeSupabase';
import { fakeKv, fakeSendEmail, fakeSendSlack, fakeVerifyStaff, mockLlm } from '../../testing/mocks';
import type { ApiBindings } from '../../types';

function baseRule(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    category: 'GENERAL RULES',
    subcategory: '',
    rule_text: 'Old text',
    date_updated: null,
    fee_amounts_jpy: [],
    links: [],
    audience: 'customer',
    ai_can_answer: true,
    requires_fee_disclaimer: false,
    fee_is_fixed: false,
    status: 'active',
    review_reason: '',
    updated_by: null,
    updated_at: '2026-07-11T00:00:00Z',
    ...over,
  };
}

function setup(role: Role = 'admin') {
  const db = new FakeSupabase();
  db.tables.kb_rules.push(baseRule('R1'), baseRule('R2', { status: 'pending_review' }));
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
    llm: mockLlm(['{}']),
    kv: fakeKv(),
    adminOrigin: e.ADMIN_BASE_URL,
    chatOrigin: e.CHAT_BASE_URL ?? '',
    verifyStaff: fakeVerifyStaff(role),
    sendSlack: fakeSendSlack(),
    sendEmail: fakeSendEmail(),
  }));
  return { app, db, env };
}

const admin = { Authorization: 'Bearer tok', Origin: 'http://localhost:5174', 'Content-Type': 'application/json' };
const H = KB_CSV_HEADERS.join(',');
const post = (app: ReturnType<typeof setup>['app'], env: ApiBindings, path: string, body: unknown) =>
  app.request(path, { method: 'POST', headers: admin, body: JSON.stringify(body) }, env);

describe('CSV export', () => {
  it('returns a BOM-prefixed CSV (criterion 39)', async () => {
    const { app, env } = setup();
    const res = await app.request('/api/admin/rules/export?scope=all', { headers: admin }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    // Check raw bytes: Response.text() strips a leading BOM, so read the buffer.
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(buf.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    const text = new TextDecoder().decode(buf);
    expect(text).toContain('Rule ID');
    expect(text).toContain('R1');
  });

  it('forbids the staff role (403)', async () => {
    const { app, env } = setup('staff');
    const res = await app.request('/api/admin/rules/export', { headers: admin }, env);
    expect(res.status).toBe(403);
  });
});

describe('CSV import preview', () => {
  it('diffs changes, ignores unchanged, and reports row errors without failing (criterion 42)', async () => {
    const { app, env } = setup();
    const csv =
      `${H}\n` +
      `R1,GENERAL RULES,,New answer,,No,,Customer,Yes,Active,,,,,\n` + // change
      `R2,GENERAL RULES,,Old text,,No,,Customer,Yes,Waiting for review,,,,Approve,\n` + // decision approve
      `R2,GENERAL RULES,,bad,,No,,Customer,Yes,Nope,,,,,\n` + // invalid status → error
      `R999,GENERAL RULES,,x,,No,,Customer,Yes,Active,,,,,`; // unknown id → error
    const res = await post(app, env, '/api/admin/rules/import/preview', { csv });
    const body = (await res.json()) as {
      summary: { changed: number; errors: number };
      changes: { id: string; changes: unknown[] }[];
      errors: { id: string }[];
    };
    expect(body.summary.changed).toBe(2); // R1 text + R2 approve
    expect(body.summary.errors).toBe(2); // bad status + unknown id
    expect(body.errors.map((e) => e.id).sort()).toEqual(['R2', 'R999']);
  });
});

describe('CSV import apply + undo', () => {
  it('applies changes, logs with source=csv_import, snapshots, and undoes (criteria 40/43)', async () => {
    const { app, db, env } = setup();
    const csv =
      `${H}\n` +
      `R1,GENERAL RULES,,New answer,,No,,Customer,Yes,Active,,,,,\n` +
      `R2,GENERAL RULES,,Old text,,No,,Customer,Yes,Waiting for review,,,,Approve,`;

    const applyRes = await post(app, env, '/api/admin/rules/import/apply', { csv });
    const apply = (await applyRes.json()) as { applied: number; snapshot_id: string };
    expect(apply.applied).toBe(2);
    expect(apply.snapshot_id).toBeTruthy();

    expect(db.tables.kb_rules.find((r) => r.id === 'R1')!.rule_text).toBe('New answer');
    expect(db.tables.kb_rules.find((r) => r.id === 'R2')!.status).toBe('active'); // Approve
    expect(db.tables.kb_change_log.filter((l) => l.source === 'csv_import')).toHaveLength(2);
    expect(db.tables.kb_import_snapshots).toHaveLength(1);

    // Undo restores the pre-import state.
    const undoRes = await post(app, env, '/api/admin/rules/import/undo', {});
    const undo = (await undoRes.json()) as { restored: number };
    expect(undo.restored).toBe(2);
    expect(db.tables.kb_rules.find((r) => r.id === 'R1')!.rule_text).toBe('Old text');
    expect(db.tables.kb_rules.find((r) => r.id === 'R2')!.status).toBe('pending_review');
    expect(db.tables.kb_import_snapshots?.[0]?.undone).toBe(true);
  });
});
