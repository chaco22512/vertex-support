import { describe, expect, it } from 'vitest';
import { FakeSupabase } from '../testing/fakeSupabase';
import { fakeSendEmail, fakeSendSlack, fakeVerifyStaff, mockLlm } from '../testing/mocks';
import type { Deps } from '../types';
import { runReminders } from './reminders';

const NOW = new Date('2026-07-07T12:00:00Z').getTime();
const iso = (deltaMs: number) => new Date(NOW + deltaMs).toISOString();
const H = 3_600_000;

function makeDeps(db: FakeSupabase, slack = fakeSendSlack()): Deps {
  return {
    db: db.asClient(),
    llm: mockLlm(['']),
    kv: {} as KVNamespace,
    adminOrigin: 'http://localhost:5174',
    chatOrigin: 'http://localhost:5173',
    verifyStaff: fakeVerifyStaff(),
    sendSlack: slack,
    sendEmail: fakeSendEmail(),
  };
}

describe('runReminders (§8)', () => {
  it('warns for <4h, flags overdue, and ignores >4h and non-escalated', async () => {
    const db = new FakeSupabase();
    db.tables.conversations.push(
      { id: 'warn', status: 'escalated', language: 'en', channel: 'webchat', source_tag: '', assigned_staff: 's1', reply_due_at: iso(2 * H) },
      { id: 'over', status: 'escalated', language: 'vi', channel: 'webchat', source_tag: '', assigned_staff: null, reply_due_at: iso(-1 * H) },
      { id: 'later', status: 'escalated', language: 'en', channel: 'webchat', source_tag: '', assigned_staff: null, reply_due_at: iso(10 * H) },
      { id: 'done', status: 'resolved', language: 'en', channel: 'webchat', source_tag: '', assigned_staff: null, reply_due_at: iso(1 * H) },
    );
    db.tables.staff.push({ id: 's1', slack_member_id: 'U1' });
    db.tables.messages.push(
      { id: 1, conversation_id: 'warn', sender: 'customer', body: 'Need help with APN', ai_meta: null },
      { id: 2, conversation_id: 'over', sender: 'customer', body: 'Lost SIM', ai_meta: null },
      { id: 3, conversation_id: 'over', sender: 'system', body: '', ai_meta: { reason: 'account_specific' } },
    );
    const slack = fakeSendSlack();

    const res = await runReminders(makeDeps(db, slack), NOW);

    expect(res).toEqual({ warned: 1, overdue: 1 });
    expect(slack.calls).toHaveLength(2);
    const warn = slack.calls.find((m) => m.includes('warn') || m.includes('APN'))!;
    expect(warn).toContain('⚠️ Reminder');
    expect(warn).toContain('<@U1>');
    const over = slack.calls.find((m) => m.includes('🚨'))!;
    expect(over).toContain('AI reason: account_specific');
    expect(over).toContain('@channel');
  });

  it('does nothing when there are no escalations', async () => {
    const db = new FakeSupabase();
    const slack = fakeSendSlack();
    const res = await runReminders(makeDeps(db, slack), NOW);
    expect(res).toEqual({ warned: 0, overdue: 0 });
    expect(slack.calls).toHaveLength(0);
  });
});
