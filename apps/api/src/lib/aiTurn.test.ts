import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '@vertex/shared';
import { FakeSupabase } from '../testing/fakeSupabase';
import {
  fakeSendEmail,
  fakeSendSlack,
  fakeVerifyStaff,
  goodResponse,
  hangingLlm,
  mockLlm,
} from '../testing/mocks';
import type { Deps } from '../types';
import { AI_TIMEOUT_MS, generateAiReply } from './aiTurn';

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    channel: 'webchat',
    session_token: 'tok',
    language: 'en',
    status: 'ai_handling',
    source_tag: '',
    topic_category: '',
    contact_email: '',
    contact_whatsapp: '',
    assigned_staff: null,
    escalated_at: null,
    reply_due_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function deps(llm: Deps['llm'], db = new FakeSupabase()): Deps {
  db.tables.kb_rules.push({
    id: 'R010',
    category: 'GENERAL RULES',
    rule_text: 'Be helpful.',
    fee_amounts_jpy: [],
    links: [],
    audience: 'customer',
    status: 'active',
  });
  return {
    db: db.asClient(),
    llm,
    kv: {} as KVNamespace,
    adminOrigin: '',
    chatOrigin: '',
    verifyStaff: fakeVerifyStaff(),
    sendSlack: fakeSendSlack(),
    sendEmail: fakeSendEmail(),
  };
}

afterEach(() => vi.useRealTimers());

describe('generateAiReply', () => {
  it('returns the parsed reply', async () => {
    const res = await generateAiReply(
      deps(mockLlm([goodResponse()])),
      conversation(),
      [{ sender: 'customer', body: 'How do I do X?' }],
    );
    expect(res.fellBack).toBe(false);
    expect(res.answer).toBe('Here is how to do it.');
  });

  it('falls back to escalation after the 15s timeout', async () => {
    vi.useFakeTimers();
    const promise = generateAiReply(deps(hangingLlm()), conversation(), [
      { sender: 'customer', body: 'hello' },
    ]);
    await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS);
    const res = await promise;
    expect(res.fellBack).toBe(true);
    expect(res.aiMeta.escalate).toBe(true);
  });
});
