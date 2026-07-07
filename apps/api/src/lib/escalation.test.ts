import { describe, expect, it } from 'vitest';
import { FakeSupabase } from '../testing/fakeSupabase';
import { REPLY_SLA_MS, escalateConversation } from './escalation';

describe('escalateConversation', () => {
  it('sets status/timestamps (+24h) and records the reason on a system message', async () => {
    const db = new FakeSupabase();
    db.tables.conversations.push({ id: 'c1', status: 'ai_handling' });

    const before = Date.now();
    const result = await escalateConversation(db.asClient(), { id: 'c1' }, 'price_question');
    const after = Date.now();

    const conv = db.tables.conversations[0]!;
    expect(conv.status).toBe('escalated');
    expect(conv.escalated_at).toBe(result.escalated_at);
    expect(conv.reply_due_at).toBe(result.reply_due_at);

    const gap = new Date(result.reply_due_at).getTime() - new Date(result.escalated_at).getTime();
    expect(gap).toBe(REPLY_SLA_MS);
    expect(new Date(result.escalated_at).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(result.escalated_at).getTime()).toBeLessThanOrEqual(after);

    const sys = db.tables.messages.find((m) => m.sender === 'system');
    expect(sys).toBeDefined();
    expect((sys!.ai_meta as { reason: string }).reason).toBe('price_question');
    expect(sys!.body).toBe(''); // hidden internal marker
  });
});
