import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fetchScopedRules, resolveIdPrefixes, resolveKbCategories } from '@vertex/ai';
import { parseCsv, stringifyCsv, type Role } from '@vertex/shared';
import { createApp } from '../../index';
import { menu } from '../../lib/menu';
import { FakeSupabase } from '../../testing/fakeSupabase';
import { fakeKv, fakeSendEmail, fakeSendSlack, fakeVerifyStaff, goodResponse, mockLlm } from '../../testing/mocks';
import type { ApiBindings } from '../../types';

/**
 * CS-managed knowledge lifecycle (spec v1.8 §7.4.1): empty knowledge → import
 * the CS sheet → edit one row and re-import (history stays linked by Rule ID)
 * → Replace all drops a row (archived, not deleted) → Undo brings it back.
 * Uses the real CS file data/kb/Deposit_Refund_formatted_for_KB.csv.
 */

const CSV = readFileSync(resolve(__dirname, '../../../../../data/kb/Deposit_Refund_formatted_for_KB.csv'), 'utf8');

function setup(role: Role = 'admin') {
  const db = new FakeSupabase();
  // Today's production state: the old manuals are all archived.
  const base = { fee_amounts_jpy: [], links: [], audience: 'customer', ai_can_answer: true, status: 'archived' };
  db.tables.kb_rules.push(
    { ...base, id: 'R001', category: 'GENERAL RULES', rule_text: 'old' },
    { ...base, id: 'C090', category: 'CS AI DOC: AI_Deposit Refund', rule_text: 'old deposit' },
  );
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
    llm: mockLlm([goodResponse()]),
    kv: fakeKv(),
    adminOrigin: e.ADMIN_BASE_URL,
    chatOrigin: e.CHAT_BASE_URL ?? '',
    verifyStaff: fakeVerifyStaff(role),
    sendSlack: slack,
    sendEmail: fakeSendEmail(),
    emailFrom: 'test@resend.dev',
  }));
  const headers = { Authorization: 'Bearer tok', Origin: 'http://localhost:5174', 'Content-Type': 'application/json' };
  const post = async <T>(path: string, body: unknown) => {
    const res = await app.request(path, { method: 'POST', headers, body: JSON.stringify(body) }, env);
    return { status: res.status, body: (await res.json()) as T };
  };
  const get = async <T>(path: string) => {
    const res = await app.request(path, { headers }, env);
    return { status: res.status, body: (await res.json()) as T };
  };
  return { db, post, get };
}

type Preview = { summary: Record<string, number>; errors: { id: string; reason: string }[]; active_after: number };
type Applied = { applied: number; added: number; archived: number; snapshot_id: string };

const rule = (db: FakeSupabase, id: string) => db.tables.kb_rules.find((r) => r.id === id);

describe('CS-managed knowledge lifecycle (Deposit refund sheet)', () => {
  it('imports the DR sheet into an empty knowledge base and the Deposit refund tile uses it', async () => {
    const s = setup();
    expect((await s.get<{ active_rules: number }>('/api/admin/kb-health')).body.active_rules).toBe(0);

    const preview = await s.post<Preview>('/api/admin/rules/import/preview', { csv: CSV });
    expect(preview.body.errors).toEqual([]);
    expect(preview.body.summary).toMatchObject({ added: 15, changed: 0, archived: 0 });
    expect(preview.body.active_after).toBe(15);

    const applied = await s.post<Applied>('/api/admin/rules/import/apply', { csv: CSV });
    expect(applied.body).toMatchObject({ added: 15, applied: 0, archived: 0 });
    expect(rule(s.db, 'DR001')).toMatchObject({ status: 'active', category: 'CS AI DOC: AI_Deposit_Refund' });
    expect((await s.get<{ active_rules: number }>('/api/admin/kb-health')).body.active_rules).toBe(15);

    // Scoped by Rule ID: the Deposit refund tile sees DR rules even though the
    // Topic text differs from the old category name.
    const scoped = await fetchScopedRules(
      s.db.asClient(),
      resolveKbCategories('deposit', menu),
      resolveIdPrefixes('deposit', menu),
    );
    expect(scoped.map((r) => r.id)).toHaveLength(15);
    // …and other tiles don't.
    const internet = await fetchScopedRules(
      s.db.asClient(),
      resolveKbCategories('internet', menu),
      resolveIdPrefixes('internet', menu),
    );
    expect(internet).toHaveLength(0);
  });

  it('edit one row and re-import: one update, and the history stays linked by Rule ID', async () => {
    const s = setup();
    await s.post('/api/admin/rules/import/apply', { csv: CSV });
    const edited = CSV.replace('Deposit refunds under this topic are paid ONLY by bank transfer.', 'EDITED refund method text.');
    expect(edited).not.toBe(CSV);

    const preview = await s.post<Preview>('/api/admin/rules/import/preview', { csv: edited });
    expect(preview.body.summary).toMatchObject({ changed: 1, added: 0, unchanged: 14 });
    await s.post('/api/admin/rules/import/apply', { csv: edited });

    expect(String(rule(s.db, 'DR003')!.rule_text)).toContain('EDITED refund method text.');
    const history = s.db.tables.kb_change_log.filter((l) => l.rule_id === 'DR003');
    expect(history).toHaveLength(2); // added, then updated — same ID, one trail
    expect(history[0]!.before).toEqual({});
    expect(String((history[1]!.after as { rule_text: string }).rule_text)).toContain('EDITED');
  });

  it('Rule IDs are case-insensitive; the same ID twice in a sheet is an error', async () => {
    const s = setup();
    await s.post('/api/admin/rules/import/apply', { csv: CSV });
    const lower = CSV.replace('\nDR003,', '\ndr003,').replace(
      'Deposit refunds under this topic are paid ONLY by bank transfer.',
      'lower-case id edit.',
    );
    const p1 = await s.post<Preview>('/api/admin/rules/import/preview', { csv: lower });
    expect(p1.body.summary).toMatchObject({ changed: 1, added: 0 });

    const dup = `${CSV.trimEnd()}\ndr001,X,,Duplicate,,No,,Customer,Yes,Active,,,,,`;
    const p2 = await s.post<Preview>('/api/admin/rules/import/preview', { csv: dup });
    expect(p2.body.errors[0]!.reason).toContain('appears more than once');
  });

  it('Replace all archives a row left out of the sheet (not deleted) and Undo restores it', async () => {
    const s = setup();
    await s.post('/api/admin/rules/import/apply', { csv: CSV });
    // Drop the DR015 row properly (its answer text spans several lines).
    const withoutLast = stringifyCsv(parseCsv(CSV).filter((row) => row[0] !== 'DR015'));

    expect((await s.post('/api/admin/rules/import/apply', { csv: withoutLast, mode: 'replace' })).status).toBe(400);

    const preview = await s.post<Preview>('/api/admin/rules/import/preview', { csv: withoutLast, mode: 'replace' });
    expect(preview.body.summary).toMatchObject({ archived: 1, changed: 0, added: 0 });

    const applied = await s.post<Applied>('/api/admin/rules/import/apply', {
      csv: withoutLast,
      mode: 'replace',
      confirm: 'REPLACE',
    });
    expect(applied.body).toMatchObject({ archived: 1 });
    expect(rule(s.db, 'DR015')!.status).toBe('archived');
    expect(rule(s.db, 'DR001')!.status).toBe('active');
    expect(rule(s.db, 'R001')!.status).toBe('archived'); // old manual untouched

    const undo = await s.post<{ restored: number }>(`/api/admin/rules/snapshots/${applied.body.snapshot_id}/undo`, {});
    expect(undo.status).toBe(200);
    expect(rule(s.db, 'DR015')!.status).toBe('active');
    expect(s.db.tables.kb_rules.filter((r) => String(r.id).startsWith('DR'))).toHaveLength(15);
  });

  it('kb-health is readable by any staff member (Dashboard warning)', async () => {
    const s = setup('staff');
    const res = await s.get<{ active_rules: number }>('/api/admin/kb-health');
    expect(res.status).toBe(200);
    expect(res.body.active_rules).toBe(0);
  });
});
