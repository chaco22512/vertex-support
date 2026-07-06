import { describe, expect, it, vi } from 'vitest';
import type { KbRule } from '@vertex/shared';
import type { LlmClient } from './llm';
import { runAiReply, type RunAiReplyInput } from './pipeline';

function rule(id: string, category: string, text: string): KbRule {
  return {
    id,
    category,
    subcategory: '',
    rule_text: text,
    date_updated: null,
    fee_amounts_jpy: [],
    links: [],
    audience: 'customer',
    ai_can_answer: true,
    requires_fee_disclaimer: false,
    status: 'active',
    review_reason: '',
    updated_by: null,
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function mockLlm(responses: string[]): LlmClient & { calls: number } {
  let i = 0;
  return {
    model: 'mock-model',
    get calls() {
      return i;
    },
    generate: vi.fn(async () => {
      const r = responses[Math.min(i, responses.length - 1)] ?? '';
      i++;
      return r;
    }),
  } as unknown as LlmClient & { calls: number };
}

const baseInput = (llm: LlmClient): RunAiReplyInput => ({
  rules: [rule('R010', 'APN SETTINGS', 'Set APN to xyz.')],
  history: [{ sender: 'customer', body: 'How do I set up APN?' }],
  language: 'en',
  llm,
});

const good = JSON.stringify({
  answer: 'Set your APN to xyz.',
  escalate: false,
  reason: 'none',
  rule_ids: ['R010'],
  detected_language: 'en',
});

describe('runAiReply', () => {
  it('returns the parsed reply on valid output', async () => {
    const res = await runAiReply(baseInput(mockLlm([good])));
    expect(res.fellBack).toBe(false);
    expect(res.answer).toBe('Set your APN to xyz.');
    expect(res.aiMeta).toEqual({
      escalate: false,
      reason: 'none',
      rule_ids: ['R010'],
      model: 'mock-model',
    });
  });

  it('retries once when the first output is unparseable, then succeeds', async () => {
    const llm = mockLlm(['garbage not json', good]);
    const res = await runAiReply(baseInput(llm));
    expect(res.fellBack).toBe(false);
    expect(res.answer).toBe('Set your APN to xyz.');
    expect(llm.calls).toBe(2);
  });

  it('falls back to escalation after two unparseable outputs', async () => {
    const llm = mockLlm(['nope', 'still nope']);
    const res = await runAiReply(baseInput(llm));
    expect(res.fellBack).toBe(true);
    expect(res.aiMeta.escalate).toBe(true);
    expect(res.aiMeta.reason).toBe('other');
    expect(res.answer).toContain('24 hours');
    expect(llm.calls).toBe(2);
  });

  it('propagates an escalation decided by the model', async () => {
    const escalated = JSON.stringify({
      answer: 'Staff will reply within 24 hours.',
      escalate: true,
      reason: 'price_question',
      rule_ids: [],
      detected_language: 'en',
    });
    const res = await runAiReply(baseInput(mockLlm([escalated])));
    expect(res.fellBack).toBe(false);
    expect(res.aiMeta.escalate).toBe(true);
    expect(res.aiMeta.reason).toBe('price_question');
  });

  it('uses the conversation language for the fallback message', async () => {
    const input = { ...baseInput(mockLlm(['x', 'y'])), language: 'vi' };
    const res = await runAiReply(input);
    expect(res.detected_language).toBe('vi');
    expect(res.answer).toContain('24 giờ');
  });
});
