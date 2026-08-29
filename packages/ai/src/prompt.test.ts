import { describe, expect, it } from 'vitest';
import type { KbRule } from '@vertex/shared';
import { buildLlmMessages, buildSystemPrompt, formatRule } from './prompt';

function rule(partial: Partial<KbRule> & Pick<KbRule, 'id' | 'category' | 'rule_text'>): KbRule {
  return {
    subcategory: '',
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
    ...partial,
  };
}

describe('formatRule', () => {
  it('formats id and text', () => {
    expect(formatRule(rule({ id: 'R001', category: 'X', rule_text: 'Do this.' }))).toBe(
      '[R001] Do this.',
    );
  });

  it('includes fees with ¥ and thousands separators', () => {
    const r = rule({ id: 'R002', category: 'X', rule_text: 'Lost fee.', fee_amounts_jpy: [4000] });
    expect(formatRule(r)).toBe('[R002] Lost fee. (fees: ¥4,000)');
  });

  it('includes links', () => {
    const r = rule({ id: 'R003', category: 'X', rule_text: 'APN.', links: ['https://x/apn'] });
    expect(formatRule(r)).toBe('[R003] APN. (link: https://x/apn)');
  });

  it('marks a fixed fee with "— fixed" (§4.2 v1.6)', () => {
    const r = rule({ id: 'R004', category: 'X', rule_text: 'Re-issue.', fee_amounts_jpy: [4000], fee_is_fixed: true });
    expect(formatRule(r)).toBe('[R004] Re-issue. (fees: ¥4,000 — fixed)');
    // Default (variable) keeps the plain fee form.
    const v = rule({ id: 'R005', category: 'X', rule_text: 'Balance.', fee_amounts_jpy: [4000] });
    expect(formatRule(v)).toBe('[R005] Balance. (fees: ¥4,000)');
  });
});

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt([
    rule({ id: 'R010', category: 'APN SETTINGS', rule_text: 'Set APN.' }),
    rule({ id: 'R011', category: 'GENERAL RULES', rule_text: 'Be nice.' }),
  ]);

  it('contains the key §4.2 guardrails', () => {
    expect(prompt).toContain('NEVER state monthly plan prices');
    expect(prompt).toContain('Final amount will be confirmed by our staff.');
    expect(prompt).toContain('single JSON object');
    expect(prompt).toContain('price_question');
  });

  it('describes the diagnostic ask flow and plain-language rule (§4.2 v1.6)', () => {
    expect(prompt).toContain('"ask"');
    expect(prompt).toContain('MULTIPLE possible causes');
    expect(prompt).toContain('follow_up');
    expect(prompt).toContain('3-5 concrete tappable choices');
    expect(prompt).toContain('in their 40s or older');
  });

  it('states the price allow/forbid boundary and the fixed-fee disclaimer rule (§4.2 v1.6 Phase 5)', () => {
    expect(prompt).toContain('per-call and SMS unit rates');
    expect(prompt).toContain('unlimited-plan prices');
    expect(prompt).toContain('"— fixed"');
    expect(prompt).toContain('Final amount will be confirmed by our staff.');
  });

  it('enforces the contract-group rules for cancellation / deposit (§4.2 v1.7 CS docs)', () => {
    expect(prompt).toContain('11 December 2024');
    expect(prompt).toContain('contract start date');
    expect(prompt).toContain('NEVER state a deposit amount for a PREVIOUS contract');
    expect(prompt).toContain('the SIM deposit is ¥800');
    expect(prompt).toContain('discount on the customer'); // next-bill discount, not bank transfer
    expect(prompt).toContain('cannot be applied to an unpaid balance');
    expect(prompt).toContain('internal section numbers');
  });

  it('groups rules by category and lists ids', () => {
    expect(prompt).toContain('## APN SETTINGS');
    expect(prompt).toContain('[R010] Set APN.');
    expect(prompt).toContain('## GENERAL RULES');
  });

  it('injects the selected topic when provided (§4.1 v1.6)', () => {
    const withTopic = buildSystemPrompt([rule({ id: 'R1', category: 'X', rule_text: 'a' })], {
      topic: 'Signal stopped / re-issue',
    });
    expect(withTopic).toContain('The customer chose this help topic: "Signal stopped / re-issue"');
    // No topic → no topic line.
    expect(buildSystemPrompt([rule({ id: 'R1', category: 'X', rule_text: 'a' })])).not.toContain(
      'chose this help topic',
    );
  });
});

describe('buildLlmMessages', () => {
  it('maps senders, drops system, and masks customer PII', () => {
    const msgs = buildLlmMessages([
      { sender: 'system', body: 'Topic: Lost SIM' },
      { sender: 'customer', body: 'my email is a@b.com' },
      { sender: 'ai', body: 'Sure, here is how.' },
      { sender: 'staff', body: 'Following up.' },
    ]);
    expect(msgs).toEqual([
      { role: 'user', text: 'my email is [EMAIL]' },
      { role: 'model', text: 'Sure, here is how.' },
      { role: 'model', text: 'Following up.' },
    ]);
  });

  it('trims oldest turns beyond the char budget but keeps recent ones (§4.1 v1.6)', () => {
    // 12 turns × ~6k chars = ~72k > the 48k budget → oldest dropped, ≥8 kept.
    const big = 'plain text no pii '.repeat(330); // ~6k chars, no email/phone to mask
    const history = Array.from({ length: 12 }, (_, i) => ({
      sender: (i % 2 === 0 ? 'customer' : 'ai') as 'customer' | 'ai',
      body: `${big}#${i}`,
    }));
    const msgs = buildLlmMessages(history);
    expect(msgs.length).toBeGreaterThanOrEqual(8);
    expect(msgs.length).toBeLessThan(12);
    expect(msgs.at(-1)!.text).toContain('#11');
  });

  it('never trims when at or below the minimum keep count', () => {
    const history = Array.from({ length: 6 }, (_, i) => ({ sender: 'customer' as const, body: `msg ${i}` }));
    expect(buildLlmMessages(history)).toHaveLength(6);
  });
});
