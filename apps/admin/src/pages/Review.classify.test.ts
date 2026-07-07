import { describe, expect, it } from 'vitest';
import { classify } from '../lib/reviewClassify';

// The two canonical review_reason values seeded from data/kb_rules_import.json.
const STRIKETHROUGH = 'strikethrough text removed - confirm current wording';
const AUTO_INTERNAL = 'auto-tagged internal (staff-ops keyword) - confirm';

describe('Review queue tab classification', () => {
  it('files strikethrough-removal reviews under A', () => {
    expect(classify({ review_reason: STRIKETHROUGH })).toBe('A');
  });

  it('files auto-tagged-internal reviews under B', () => {
    expect(classify({ review_reason: AUTO_INTERNAL })).toBe('B');
  });

  it('classifies by review_reason, not audience (regression: R257)', () => {
    // R257 is a strikethrough fix on an internal-audience rule — must stay in A.
    expect(classify({ review_reason: STRIKETHROUGH })).toBe('A');
  });

  it('produces the expected 2/40 split for the seeded queue', () => {
    const queue = [
      ...Array.from({ length: 2 }, () => ({ review_reason: STRIKETHROUGH })),
      ...Array.from({ length: 40 }, () => ({ review_reason: AUTO_INTERNAL })),
    ];
    const a = queue.filter((r) => classify(r) === 'A').length;
    const b = queue.filter((r) => classify(r) === 'B').length;
    expect([a, b]).toEqual([2, 40]);
  });

  it('defaults unknown reasons to A', () => {
    expect(classify({ review_reason: '' })).toBe('A');
    expect(classify({ review_reason: 'something else' })).toBe('A');
  });
});
