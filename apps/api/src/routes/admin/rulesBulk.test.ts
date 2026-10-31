import { describe, expect, it } from 'vitest';
import { buildKbCsv, type KbRule, type Role } from '@vertex/shared';
import { createApp } from '../../index';
import { FakeSupabase } from '../../testing/fakeSupabase';
import { fakeKv, fakeSendEmail, fakeSendSlack, fakeVerifyStaff, goodResponse, mockLlm } from '../../testing/mocks';
import type { ApiBindings } from '../../types';

/** Spec v1.8 §7.4.2 — Replace all / Disable all in view / Backups (no physical delete). */

function rule(id: string, category = 'CAT A', overrides: Partial<KbRule> = {}): KbRule {
  return {
    id,
    category,
    subcategory: '',
    rule_text: `Text of ${id}`,
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
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function setup(role: Role = 'admin') {
  const db = new FakeSupabase();
  db.tables.kb_rules.push(...[rule('R1'), rule('R2'), rule('R3', 'CAT B')].map((r) => ({ ...r }) as Record<string, unknown>));
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
  const post = (path: string, body: unknown) =>
    app.request(
      path,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer tok', Origin: 'http://localhost:5174', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      env,
    );
  const get = (path: string) =>
    app.request(path, { headers: { Authorization: 'Bearer tok', Origin: 'http://localhost:5174' } }, env);
  return { db, slack, post, get };
}

const ruleById = (db: FakeSupabase, id: string) => db.tables.kb_rules.find((r) => r.id === id)!;

/** Sheet = R1 (edited), R2 (as is), one NEW rule (DR001 by default); R3 left out. */
function replacementSheet(db: FakeSupabase, newId = 'DR001'): string {
  const keep = (db.tables.kb_rules as unknown as KbRule[]).filter((r) => r.id !== 'R3');
  const csv = buildKbCsv(keep.map((r) => (r.id === 'R1' ? { ...r, rule_text: 'New text R1' } : r)));
  return `${csv}\r\n${newId},Deposit refund,,Brand new answer,,No,,Customer,Yes,Active,,,,,\r\n`;
}

describe('Replace all (CSV mode=replace)', () => {
  it('previews changed / added / archived counts and the rules the bot can use after', async () => {
    const s = setup();
    const res = await s.post('/api/admin/rules/import/preview', { csv: replacementSheet(s.db), mode: 'replace' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: Record<string, number>;
      to_archive: { count: number; sample: { id: string }[] };
      active_before: number;
      active_after: number;
    };
    expect(body.summary).toMatchObject({ changed: 1, added: 1, archived: 1, errors: 0 });
    expect(body.to_archive.sample.map((r) => r.id)).toEqual(['R3']);
    expect(body).toMatchObject({ active_before: 3, active_after: 3 });
    // Preview writes nothing.
    expect(ruleById(s.db, 'R1').rule_text).toBe('Text of R1');
  });

  it('refuses to apply without typing REPLACE (nothing changes)', async () => {
    const s = setup();
    const res = await s.post('/api/admin/rules/import/apply', { csv: replacementSheet(s.db), mode: 'replace' });
    expect(res.status).toBe(400);
    expect(ruleById(s.db, 'R3').status).toBe('active');
    expect(s.db.rpcCalls).toHaveLength(0);
  });

  it('applies: archives (never deletes) missing rules, updates, adds, snapshots first, notifies Slack', async () => {
    const s = setup();
    const res = await s.post('/api/admin/rules/import/apply', {
      csv: replacementSheet(s.db),
      mode: 'replace',
      confirm: 'REPLACE',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ applied: 1, added: 1, archived: 1 });
    expect(s.db.tables.kb_rules).toHaveLength(4); // nothing deleted
    expect(ruleById(s.db, 'R3').status).toBe('archived');
    expect(ruleById(s.db, 'R1').rule_text).toBe('New text R1');
    expect(ruleById(s.db, 'DR001')).toMatchObject({
      rule_text: 'Brand new answer',
      category: 'Deposit refund',
      status: 'active',
    });
    // One transaction: everything goes through kb_import_apply, backup first.
    expect(s.db.rpcCalls[0]!.name).toBe('kb_import_apply');
    expect(s.db.rpcCalls[1]!.name).toBe('kb_take_snapshot');
    expect(s.db.tables.kb_change_log.filter((l) => l.source === 'replace_all')).toHaveLength(3);
    expect(s.slack.calls[0]).toContain('Replace all');
    expect(s.slack.calls[0]).toContain('not deleted');
  });

  it('Undo puts every rule back and sets the added rule aside (archived, not deleted)', async () => {
    const s = setup();
    const applied = (await (
      await s.post('/api/admin/rules/import/apply', { csv: replacementSheet(s.db), mode: 'replace', confirm: 'REPLACE' })
    ).json()) as { snapshot_id: string };
    const res = await s.post(`/api/admin/rules/snapshots/${applied.snapshot_id}/undo`, {});
    expect(res.status).toBe(200);
    expect(ruleById(s.db, 'R3').status).toBe('active');
    expect(ruleById(s.db, 'R1').rule_text).toBe('Text of R1');
    expect(ruleById(s.db, 'DR001').status).toBe('archived');
    expect(s.db.tables.kb_rules).toHaveLength(4);
    // A second undo of the same backup is refused.
    expect((await s.post(`/api/admin/rules/snapshots/${applied.snapshot_id}/undo`, {})).status).toBe(409);
  });

  it('rejects a new row whose Rule ID breaks the convention, saying what to do (row error, not added)', async () => {
    const s = setup();
    for (const [id, hint] of [
      ['XX001', 'not a topic code'],
      ['DR01', '2 letters for the topic + 3 numbers'],
      ['', 'no Rule ID'],
    ] as const) {
      const res = await s.post('/api/admin/rules/import/preview', { csv: replacementSheet(s.db, id), mode: 'replace' });
      const body = (await res.json()) as { summary: Record<string, number>; errors: { reason: string }[] };
      expect(body.summary).toMatchObject({ added: 0, errors: 1 });
      expect(body.errors[0]!.reason).toContain(hint);
    }
  });

  it('a failed apply changes nothing (one transaction)', async () => {
    const s = setup();
    s.db.failRpc.add('kb_import_apply');
    const res = await s.post('/api/admin/rules/import/apply', {
      csv: replacementSheet(s.db),
      mode: 'replace',
      confirm: 'REPLACE',
    });
    expect(res.status).toBe(500);
    expect(ruleById(s.db, 'R3').status).toBe('active');
    expect(ruleById(s.db, 'R1').rule_text).toBe('Text of R1');
    expect(s.db.tables.kb_rules).toHaveLength(3);
    expect(s.db.tables.kb_rule_snapshots ?? []).toHaveLength(0);
  });

  it('warns that nothing would be left for the bot when the sheet is empty', async () => {
    const s = setup();
    const res = await s.post('/api/admin/rules/import/preview', { csv: buildKbCsv([]), mode: 'replace' });
    const body = (await res.json()) as { summary: Record<string, number>; active_after: number };
    expect(body.summary.archived).toBe(3);
    expect(body.active_after).toBe(0);
  });

  it('a rule listed with an error is never archived', async () => {
    const s = setup();
    const csv = `${buildKbCsv(s.db.tables.kb_rules as unknown as KbRule[])}`.replace(
      /\r?\nR3,CAT B,,Text of R3,/,
      '\r\nR3,CAT B,,,',
    );
    const body = (await (await s.post('/api/admin/rules/import/preview', { csv, mode: 'replace' })).json()) as {
      summary: Record<string, number>;
    };
    expect(body.summary).toMatchObject({ errors: 1, archived: 0 });
  });
});

describe('Disable all in this view', () => {
  it('disables exactly the ids in view, snapshots first, notifies, and Undo restores', async () => {
    const s = setup();
    const res = await s.post('/api/admin/rules/disable-view', { ids: ['R1', 'R2'], description: 'Category: CAT A' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { disabled: number; snapshot_id: string; active_after: number };
    expect(body).toMatchObject({ disabled: 2, active_after: 1 });
    expect(ruleById(s.db, 'R1').status).toBe('disabled');
    expect(ruleById(s.db, 'R3').status).toBe('active');
    expect(s.slack.calls[0]).toContain('Category: CAT A');

    await s.post(`/api/admin/rules/snapshots/${body.snapshot_id}/undo`, {});
    expect(ruleById(s.db, 'R1').status).toBe('active');
    expect(ruleById(s.db, 'R2').status).toBe('active');
  });

  it('refuses ids that do not exist (409, nothing changes)', async () => {
    const s = setup();
    const res = await s.post('/api/admin/rules/disable-view', { ids: ['R1', 'ZZZ'] });
    expect(res.status).toBe(409);
    expect(ruleById(s.db, 'R1').status).toBe('active');
  });

  it('is admin-only', async () => {
    const s = setup('staff');
    expect((await s.post('/api/admin/rules/disable-view', { ids: ['R1'] })).status).toBe(403);
    expect((await s.get('/api/admin/rules/snapshots')).status).toBe(403);
  });
});

describe('Backups', () => {
  it('keeps the newest 5 backups', async () => {
    const s = setup();
    for (let i = 0; i < 7; i++) {
      await s.post('/api/admin/rules/disable-view', { ids: ['R1'] });
      ruleById(s.db, 'R1').status = 'active'; // re-arm for the next run
    }
    const list = (await (await s.get('/api/admin/rules/snapshots')).json()) as { snapshots: unknown[] };
    expect(list.snapshots).toHaveLength(5);
  });

  it('restore puts everything back to that point and backs up the current state first', async () => {
    const s = setup();
    const first = (await (await s.post('/api/admin/rules/disable-view', { ids: ['R1'] })).json()) as {
      snapshot_id: string;
    };
    await s.post('/api/admin/rules/disable-view', { ids: ['R2', 'R3'] });
    const res = await s.post(`/api/admin/rules/snapshots/${first.snapshot_id}/restore`, {});
    expect(res.status).toBe(200);
    expect(['R1', 'R2', 'R3'].map((id) => ruleById(s.db, id).status)).toEqual(['active', 'active', 'active']);
    const kinds = (s.db.tables.kb_rule_snapshots ?? []).map((x) => x.kind);
    expect(kinds).toContain('restore');
  });
});

describe('Archive all (owner decision 2026-10-31)', () => {
  it('requires ARCHIVE and the confirmed count; archives everything in one go; Undo restores', async () => {
    const s = setup();
    expect((await s.post('/api/admin/rules/archive-all', { confirm_count: 3 })).status).toBe(400);
    expect((await s.post('/api/admin/rules/archive-all', { confirm: 'ARCHIVE', confirm_count: 2 })).status).toBe(409);
    expect(ruleById(s.db, 'R1').status).toBe('active');

    const res = await s.post('/api/admin/rules/archive-all', { confirm: 'ARCHIVE', confirm_count: 3 });
    const body = (await res.json()) as { archived: number; snapshot_id: string };
    expect(body.archived).toBe(3);
    expect(s.db.tables.kb_rules.every((r) => r.status === 'archived')).toBe(true);
    expect(s.db.tables.kb_rules).toHaveLength(3); // nothing deleted
    expect(s.slack.calls.at(-1)).toContain('Archive all');

    await s.post(`/api/admin/rules/snapshots/${body.snapshot_id}/undo`, {});
    expect(['R1', 'R2', 'R3'].map((id) => ruleById(s.db, id).status)).toEqual(['active', 'active', 'active']);
  });
});

describe('Delete archived rules permanently (owner decision 2026-10-31)', () => {
  function withArchived(s: ReturnType<typeof setup>) {
    ruleById(s.db, 'R2').status = 'archived';
    ruleById(s.db, 'R3').status = 'archived';
  }

  it('requires DELETE and the confirmed count; nothing is deleted otherwise', async () => {
    const s = setup();
    withArchived(s);
    expect((await s.post('/api/admin/rules/delete-archived', { confirm_count: 2 })).status).toBe(400);
    expect((await s.post('/api/admin/rules/delete-archived', { confirm: 'DELETE', confirm_count: 5 })).status).toBe(409);
    expect(s.db.tables.kb_rules).toHaveLength(3);
  });

  it('deletes ONLY archived rules, keeps their history, records the deletion, and notifies', async () => {
    const s = setup();
    withArchived(s);
    s.db.tables.kb_change_log.push({ id: 900, rule_id: 'R2', source: 'admin_edit', before: {}, after: {} });

    const res = await s.post('/api/admin/rules/delete-archived', { confirm: 'DELETE', confirm_count: 2 });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { deleted: number }).deleted).toBe(2);
    expect(s.db.tables.kb_rules.map((r) => r.id)).toEqual(['R1']); // the rule the bot uses stays
    const r2History = s.db.tables.kb_change_log.filter((l) => l.rule_id === 'R2');
    expect(r2History.map((l) => l.source)).toEqual(['admin_edit', 'delete_archived']); // old history kept
    expect(s.slack.calls.at(-1)).toContain('Permanent delete');
  });

  it('Undo re-creates the deleted rules from the backup', async () => {
    const s = setup();
    withArchived(s);
    const body = (await (
      await s.post('/api/admin/rules/delete-archived', { confirm: 'DELETE', confirm_count: 2 })
    ).json()) as { snapshot_id: string };
    const undo = await s.post(`/api/admin/rules/snapshots/${body.snapshot_id}/undo`, {});
    expect(undo.status).toBe(200);
    expect(s.db.tables.kb_rules.map((r) => r.id).sort()).toEqual(['R1', 'R2', 'R3']);
    expect(ruleById(s.db, 'R2')).toMatchObject({ status: 'archived', rule_text: 'Text of R2' });
  });

  it('an older backup\'s "Restore everything" also brings deleted rules back', async () => {
    const s = setup();
    const before = (await (await s.post('/api/admin/rules/disable-view', { ids: ['R1'] })).json()) as {
      snapshot_id: string;
    };
    withArchived(s);
    await s.post('/api/admin/rules/delete-archived', { confirm: 'DELETE', confirm_count: 2 });
    await s.post(`/api/admin/rules/snapshots/${before.snapshot_id}/restore`, {});
    expect(['R1', 'R2', 'R3'].map((id) => ruleById(s.db, id)?.status)).toEqual(['active', 'active', 'active']);
  });

  it('is admin-only', async () => {
    const s = setup('staff');
    expect((await s.post('/api/admin/rules/delete-archived', { confirm: 'DELETE', confirm_count: 1 })).status).toBe(403);
    expect((await s.post('/api/admin/rules/archive-all', { confirm: 'ARCHIVE', confirm_count: 3 })).status).toBe(403);
  });
});
