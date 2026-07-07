import { describe, expect, it, vi } from 'vitest';
import type { KbRule } from '@vertex/shared';
import type { LlmClient, LlmGenerateRequest } from './llm';
import { draftStaffReply, translateToEnglish } from './admin';

function captureLlm(response: string): { llm: LlmClient; calls: LlmGenerateRequest[] } {
  const calls: LlmGenerateRequest[] = [];
  return {
    calls,
    llm: {
      model: 'mock',
      generate: vi.fn(async (req: LlmGenerateRequest) => {
        calls.push(req);
        return response;
      }),
    },
  };
}

function rule(): KbRule {
  return {
    id: 'R1',
    category: 'GENERAL RULES',
    subcategory: '',
    rule_text: 'Return by post within 7 days.',
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

describe('translateToEnglish', () => {
  it('requests plain text and masks PII in the input', async () => {
    const { llm, calls } = captureLlm('Translated.');
    const out = await translateToEnglish(llm, 'メール test@example.com について');
    expect(out).toBe('Translated.');
    expect(calls[0]!.json).toBe(false);
    expect(calls[0]!.messages[0]!.text).toContain('[EMAIL]');
  });
});

describe('draftStaffReply', () => {
  it('requests plain text, includes rules, and targets the language', async () => {
    const { llm, calls } = captureLlm('Draft reply.');
    const out = await draftStaffReply(llm, {
      rules: [rule()],
      history: [{ sender: 'customer', body: 'How do I return?' }],
      language: 'vi',
    });
    expect(out).toBe('Draft reply.');
    expect(calls[0]!.json).toBe(false);
    expect(calls[0]!.system).toContain('vi');
    expect(calls[0]!.system).toContain('Return by post');
  });
});
