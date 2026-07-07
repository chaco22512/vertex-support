import { describe, expect, it } from 'vitest';
import { FakeSupabase } from '../testing/fakeSupabase';
import { fakeSendEmail, fakeSendSlack, fakeVerifyStaff, mockLlm } from '../testing/mocks';
import type { Deps } from '../types';
import { REPLY_SLA_MS, escalateConversation } from './escalation';

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

const conv = { id: 'c1', language: 'vi', channel: 'webchat', source_tag: 'agent042' } as const;

describe('escalateConversation', () => {
  it('sets status/timestamps (+24h) and records the reason on a system message', async () => {
    const db = new FakeSupabase();
    db.tables.conversations.push({ id: 'c1', status: 'ai_handling', language: 'vi' });

    const before = Date.now();
    const result = await escalateConversation(makeDeps(db), conv, 'price_question');
    const after = Date.now();

    const c = db.tables.conversations[0]!;
    expect(c.status).toBe('escalated');
    expect(c.escalated_at).toBe(result.escalated_at);
    expect(c.reply_due_at).toBe(result.reply_due_at);

    const gap = new Date(result.reply_due_at).getTime() - new Date(result.escalated_at).getTime();
    expect(gap).toBe(REPLY_SLA_MS);
    expect(new Date(result.escalated_at).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(result.escalated_at).getTime()).toBeLessThanOrEqual(after);

    const sys = db.tables.messages.find((m) => m.sender === 'system');
    expect(sys).toBeDefined();
    expect((sys!.ai_meta as { reason: string }).reason).toBe('price_question');
    expect(sys!.body).toBe(''); // hidden internal marker
  });

  it('sends a Slack notification with the reason and @channel when unassigned', async () => {
    const db = new FakeSupabase();
    db.tables.conversations.push({ id: 'c1', status: 'ai_handling', language: 'vi' });
    const slack = fakeSendSlack();

    await escalateConversation(makeDeps(db, slack), conv, 'price_question');

    expect(slack.calls).toHaveLength(1);
    const msg = slack.calls[0]!;
    expect(msg).toContain('🔔 Escalation');
    expect(msg).toContain('AI reason: price_question');
    expect(msg).toContain('Lang: VI');
    expect(msg).toContain('@channel'); // no matching staff → unassigned
    expect(msg).toContain('/inbox/c1');
  });

  it('auto-assigns the least-loaded matching-language staff and @-mentions them', async () => {
    const db = new FakeSupabase();
    db.tables.conversations.push({ id: 'c1', status: 'ai_handling', language: 'vi' });
    // Two VI-speaking staff; s2 already has an open case, so s1 (idle) wins.
    db.tables.staff.push(
      { id: 's1', slack_member_id: 'U1', languages: ['vi', 'en'], is_active: true },
      { id: 's2', slack_member_id: 'U2', languages: ['vi'], is_active: true },
    );
    db.tables.conversations.push({ id: 'c0', status: 'escalated', assigned_staff: 's2' });
    const slack = fakeSendSlack();

    await escalateConversation(makeDeps(db, slack), conv, 'complaint');

    expect(db.tables.conversations.find((c) => c.id === 'c1')!.assigned_staff).toBe('s1');
    expect(slack.calls[0]!).toContain('<@U1>');
  });
});
