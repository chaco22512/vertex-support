import { describe, expect, it } from 'vitest';
import { normalizeDate, toKbRuleRow, type RawKbRule } from './kb-mapping';

const base: RawKbRule = {
  id: 'R001',
  category: 'GENERAL RULES',
  subcategory: '',
  rule_text: 'Some rule.',
  date_updated: '',
  fee_amounts_jpy: [],
  links: [],
  audience: 'customer',
  ai_can_answer: true,
  requires_fee_disclaimer: false,
  needs_review: false,
  review_reason: '',
};

describe('toKbRuleRow', () => {
  it('maps needs_review=true to pending_review', () => {
    expect(toKbRuleRow({ ...base, needs_review: true }).status).toBe('pending_review');
  });

  it('maps needs_review=false to active', () => {
    expect(toKbRuleRow({ ...base, needs_review: false }).status).toBe('active');
  });

  it('converts empty date_updated to null', () => {
    expect(toKbRuleRow({ ...base, date_updated: '' }).date_updated).toBeNull();
  });

  it('keeps a real date_updated', () => {
    expect(toKbRuleRow({ ...base, date_updated: '2025-01-15' }).date_updated).toBe('2025-01-15');
  });

  it('normalizes YYYY-DD-MM dates in the source data', () => {
    expect(toKbRuleRow({ ...base, date_updated: '2023-27-10' }).date_updated).toBe('2023-10-27');
  });

  it('drops the needs_review field (not a column)', () => {
    expect(toKbRuleRow({ ...base, needs_review: true })).not.toHaveProperty('needs_review');
  });

  it('preserves fees, links, audience and review_reason', () => {
    const row = toKbRuleRow({
      ...base,
      fee_amounts_jpy: [4000, 4500],
      links: ['https://x'],
      audience: 'internal',
      review_reason: 'auto-tagged internal',
    });
    expect(row.fee_amounts_jpy).toEqual([4000, 4500]);
    expect(row.links).toEqual(['https://x']);
    expect(row.audience).toBe('internal');
    expect(row.review_reason).toBe('auto-tagged internal');
  });
});

describe('normalizeDate', () => {
  it('returns null for empty', () => {
    expect(normalizeDate('')).toBeNull();
  });

  it('keeps a valid YYYY-MM-DD', () => {
    expect(normalizeDate('2025-01-15')).toBe('2025-01-15');
  });

  it('swaps an unambiguous YYYY-DD-MM (month > 12)', () => {
    expect(normalizeDate('2022-18-11')).toBe('2022-11-18');
    expect(normalizeDate('2023-21-04')).toBe('2023-04-21');
  });

  it('returns null for a non-date string', () => {
    expect(normalizeDate('not-a-date')).toBeNull();
    expect(normalizeDate('2025-13-40')).toBeNull();
  });
});
