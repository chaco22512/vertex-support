import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiError, type LlmClient, type LlmGenerateRequest } from '@vertex/ai';
import type { AiMeta, Conversation } from '@vertex/shared';
import { FakeSupabase } from '../testing/fakeSupabase';
import { fakeSendEmail, fakeSendSlack, fakeVerifyStaff, goodResponse } from '../testing/mocks';
import type { Deps } from '../types';
import { FALLBACK_START_LIMIT_MS, generateAiReply } from './aiTurn';

/** Spec v1.8 §4.1.1 — topic switch + retrieval fallback before not_in_manual. */

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    channel: 'webchat',
    session_token: 'tok',
    language: 'en',
    status: 'ai_handling',
    source_tag: '',
    topic_category: 'cancel',
    contact_email: '',
    contact_whatsapp: '',
    intake_info: {},
    assigned_staff: null,
    escalated_at: null,
    reply_due_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function seed(): FakeSupabase {
  const db = new FakeSupabase();
  const base = { fee_amounts_jpy: [], links: [], audience: 'customer', ai_can_answer: true, status: 'active' };
  db.tables.kb_rules.push(
    { ...base, id: 'C001', category: 'CS AI DOC: AI_Cancellation', rule_text: 'Cancellation needs one month notice.' },
    { ...base, id: 'R657', category: 'APN SETTINGS', rule_text: 'How to set the APN on an iPhone: open Settings.' },
    { ...base, id: 'R508', category: 'LOST ITEM RULES', rule_text: 'Lost SIM card re-issue fee is 4000 yen.' },
  );
  return db;
}

/** Records every request; replies from the queue (an Error entry is thrown). */
function recordingLlm(queue: (string | Error)[]): LlmClient & { calls: LlmGenerateRequest[] } {
  const calls: LlmGenerateRequest[] = [];
  let i = 0;
  return {
    model: 'mock-model',
    calls,
    generate: async (req) => {
      calls.push(req);
      const r = queue[Math.min(i++, queue.length - 1)]!;
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

function deps(llm: LlmClient, db = seed()): Deps {
  return {
    db: db.asClient(),
    llm,
    kv: {} as KVNamespace,
    adminOrigin: '',
    chatOrigin: '',
    verifyStaff: fakeVerifyStaff(),
    sendSlack: fakeSendSlack(),
    sendEmail: fakeSendEmail(),
    emailFrom: 'test@resend.dev',
  };
}

const notInManual = (extra: Record<string, unknown> = {}) =>
  goodResponse({ action: 'escalate', answer: 'Staff will reply.', reason: 'not_in_manual', rule_ids: [], ...extra });
const apnQ = [{ sender: 'customer' as const, body: 'How do I set up the APN on my iPhone?' }];
const diagOf = (meta: AiMeta) => meta.diag!;

afterEach(() => vi.useRealTimers());

describe('generateAiReply — v1.8 fallback', () => {
  it('cancel → APN: retries with the top-K manual matches and answers instead of escalating', async () => {
    const llm = recordingLlm([
      notInManual({ topic: 'internet', search_keywords: ['apn', 'iphone', 'setup'] }),
      goodResponse({ answer: 'Open Settings.', rule_ids: ['R657'], topic: 'internet' }),
    ]);
    const res = await generateAiReply(deps(llm), conversation(), apnQ);

    expect(res.aiMeta.action).toBe('answer');
    expect(res.topicSwitch).toBe('internet');
    expect(llm.calls).toHaveLength(2);
    // Scoped prompt lacked the APN rule; the fallback prompt carries it.
    expect(llm.calls[0]!.system).not.toContain('[R657]');
    expect(llm.calls[1]!.system).toContain('[R657]');
    const d = diagOf(res.aiMeta);
    expect(d).toMatchObject({ fallback_tried: true, fallback_result: 'answered', primary_reason: 'not_in_manual' });
    expect(d.candidate_ids[0]).toBe('R657');
    expect(d.keywords).toEqual(expect.arrayContaining(['apn', 'iphone']));
  });

  it('escalates as not_found only after the fallback also finds nothing', async () => {
    const llm = recordingLlm([notInManual({ search_keywords: ['apn'] }), notInManual()]);
    const res = await generateAiReply(deps(llm), conversation(), apnQ);
    expect(res.aiMeta.action).toBe('escalate');
    expect(diagOf(res.aiMeta)).toMatchObject({ fallback_tried: true, fallback_result: 'not_found' });
  });

  it('records no_candidates (no second LLM call) when nothing in the manual matches', async () => {
    const llm = recordingLlm([notInManual({ search_keywords: ['zzzz'] })]);
    const res = await generateAiReply(deps(llm), conversation(), [{ sender: 'customer', body: 'qqqq xxxx' }]);
    expect(llm.calls).toHaveLength(1);
    expect(res.aiMeta.action).toBe('escalate');
    expect(diagOf(res.aiMeta)).toMatchObject({ fallback_result: 'no_candidates', candidate_count: 0 });
  });

  it('records rate_limited when the primary call gets a 429 (never a silent escalation)', async () => {
    const llm = recordingLlm([new GeminiError(429, 'mock-model')]);
    const res = await generateAiReply(deps(llm), conversation(), apnQ);
    expect(res.aiMeta.action).toBe('escalate');
    expect(diagOf(res.aiMeta)).toMatchObject({ error: 'rate_limited', fallback_tried: false });
  });

  it('records rate_limited as the fallback result when the retry gets a 429', async () => {
    const llm = recordingLlm([notInManual({ search_keywords: ['apn'] }), new GeminiError(429, 'mock-model')]);
    const res = await generateAiReply(deps(llm), conversation(), apnQ);
    expect(res.aiMeta.action).toBe('escalate');
    expect(diagOf(res.aiMeta)).toMatchObject({ fallback_tried: true, fallback_result: 'rate_limited', error: null });
  });

  it('does not retry an Others conversation (already the whole manual)', async () => {
    const llm = recordingLlm([notInManual()]);
    const res = await generateAiReply(deps(llm), conversation({ topic_category: 'others' }), apnQ);
    expect(llm.calls).toHaveLength(1);
    expect(diagOf(res.aiMeta)).toMatchObject({ fallback_tried: true, fallback_result: 'scope_was_all' });
  });

  it('skips the fallback when the primary call used up the time budget', async () => {
    vi.useFakeTimers();
    const slow: LlmClient = {
      model: 'mock-model',
      generate: () =>
        new Promise((resolve) => setTimeout(() => resolve(notInManual()), FALLBACK_START_LIMIT_MS + 100)),
    };
    const p = generateAiReply(deps(slow), conversation(), apnQ);
    await vi.advanceTimersByTimeAsync(FALLBACK_START_LIMIT_MS + 200);
    const res = await p;
    expect(diagOf(res.aiMeta)).toMatchObject({ fallback_tried: true, fallback_result: 'skipped_no_time' });
  });

  it('does not retry policy escalations (price_question)', async () => {
    const llm = recordingLlm([goodResponse({ action: 'escalate', reason: 'price_question', answer: 'x' })]);
    const res = await generateAiReply(deps(llm), conversation(), apnQ);
    expect(llm.calls).toHaveLength(1);
    expect(diagOf(res.aiMeta)).toMatchObject({ fallback_tried: false, primary_reason: 'price_question' });
  });

  it('switches topic on a normal answer to a new subject, without diagnostics', async () => {
    const llm = recordingLlm([goodResponse({ topic: 'lost' })]);
    const res = await generateAiReply(deps(llm), conversation(), apnQ);
    expect(res.topicSwitch).toBe('lost');
    expect(res.aiMeta.diag).toBeUndefined();
  });

  it('ignores unknown / same / others topic guesses', async () => {
    for (const topic of ['bogus', 'cancel', 'others']) {
      const res = await generateAiReply(deps(recordingLlm([goodResponse({ topic })])), conversation(), apnQ);
      expect(res.topicSwitch).toBeNull();
    }
  });

  it('tells the model about the open staff case when the conversation is escalated', async () => {
    const llm = recordingLlm([goodResponse()]);
    await generateAiReply(deps(llm), conversation({ status: 'escalated' }), apnQ);
    expect(llm.calls[0]!.system).toContain('pending_case');
    const fresh = recordingLlm([goodResponse()]);
    await generateAiReply(deps(fresh), conversation(), apnQ);
    expect(fresh.calls[0]!.system).not.toContain('already been passed to our staff');
  });
});
