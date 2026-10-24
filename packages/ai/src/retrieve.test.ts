import { describe, expect, it } from 'vitest';
import type { KbRule } from '@vertex/shared';
import { buildRetrievalQuery, FALLBACK_TOP_K, rankRules, tokenize } from './retrieve';

function rule(id: string, category: string, rule_text: string): KbRule {
  return {
    id,
    category,
    rule_text,
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
  };
}

const manual = [
  rule('R001', 'APN SETTINGS', 'To set the APN on an iPhone open Settings > Cellular > APN and enter the values.'),
  rule('R002', 'LOST ITEM RULES', 'If a SIM card is lost, the re-issue fee is ¥4,000 and the line is suspended.'),
  rule('R003', 'GENERAL RULES', 'Payment is due on the 27th of each month.'),
  rule('R004', 'New Plan C and Plan SK', 'Cancellation requires one month notice before the cancellation date.'),
];

describe('tokenize', () => {
  it('lower-cases, drops stopwords / short words, folds plurals, keeps digit terms', () => {
    expect(tokenize('How do I set the APNs on my iPhone 5G?')).toEqual(['set', 'apn', 'iphone', '5g']);
  });

  it('keeps non-Latin scripts', () => {
    expect(tokenize('Mất thẻ SIM')).toEqual(['mất', 'thẻ']);
  });
});

describe('buildRetrievalQuery', () => {
  it('merges message terms and English keywords without duplicates', () => {
    expect(buildRetrievalQuery('Saya kehilangan kartu', ['lost', 'card', 'lost'])).toEqual([
      'saya',
      'kehilangan',
      'kartu',
      'lost',
      'card',
    ]);
  });
});

describe('rankRules', () => {
  it('ranks the rule that matches the question first', () => {
    const ranked = rankRules(manual, buildRetrievalQuery('How do I set up the APN on my iPhone?', []));
    expect(ranked[0]?.rule.id).toBe('R001');
  });

  it('finds a non-English question through the English keywords', () => {
    const ranked = rankRules(manual, buildRetrievalQuery('Saya kehilangan kartu SIM', ['lost', 'reissue', 'fee']));
    expect(ranked[0]?.rule.id).toBe('R002');
  });

  it('returns only positive matches — nothing when no term matches', () => {
    expect(rankRules(manual, ['zzz'])).toEqual([]);
    expect(rankRules(manual, [])).toEqual([]);
  });

  it('caps at topK (default FALLBACK_TOP_K = 150)', () => {
    const many = Array.from({ length: 400 }, (_, i) => rule(`P${String(i).padStart(4, '0')}`, 'X', 'apn guide'));
    expect(rankRules(many, ['apn'])).toHaveLength(FALLBACK_TOP_K);
    expect(rankRules(many, ['apn'], { topK: 5 })).toHaveLength(5);
  });

  it('boosts rules in the guessed topic categories', () => {
    const tie = [rule('A1', 'CAT A', 'fee'), rule('B1', 'CAT B', 'fee')];
    expect(rankRules(tie, ['fee'])[0]?.rule.id).toBe('A1'); // id tiebreak
    expect(rankRules(tie, ['fee'], { boostCategories: ['CAT B'] })[0]?.rule.id).toBe('B1');
  });
});
