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

  it('groups rules by category and lists ids', () => {
    expect(prompt).toContain('## APN SETTINGS');
    expect(prompt).toContain('[R010] Set APN.');
    expect(prompt).toContain('## GENERAL RULES');
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
});
