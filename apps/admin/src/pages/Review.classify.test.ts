import { describe, expect, it } from 'vitest';
import { classify } from '../lib/reviewClassify';

// The canonical review_reason values seeded from the two import files.
const STRIKETHROUGH = 'strikethrough text removed - confirm current wording';
const AUTO_INTERNAL = 'auto-tagged internal (staff-ops keyword) - confirm';
const COD = 'contains COD/discount amount - confirm AI exposure policy';
const DONT_USE = 'sheet marked "dont use yet"';
// A P-series rule can carry a combined reason (primary ; secondary).
const INTERNAL_AND_COD = 'auto-tagged internal (staff-ops keyword) - confirm; contains COD/disco';

describe('Review queue tab classification (spec v1.5 §7.5)', () => {
  it('files strikethrough-removal reviews under A', () => {
    expect(classify({ review_reason: STRIKETHROUGH })).toBe('A');
  });

  it('files auto-tagged-internal reviews under B', () => {
    expect(classify({ review_reason: AUTO_INTERNAL })).toBe('B');
  });

  it('files COD/discount exposure reviews under C', () => {
    expect(classify({ review_reason: COD })).toBe('C');
  });

  it('files "dont use yet" sheet reviews under D', () => {
    expect(classify({ review_reason: DONT_USE })).toBe('D');
  });

  it('classifies a combined reason by its PRIMARY segment (internal → B, not C)', () => {
    expect(classify({ review_reason: INTERNAL_AND_COD })).toBe('B');
  });

  it('classifies by review_reason, not audience (regression: R257)', () => {
    // R257 is a strikethrough fix on an internal-audience rule — must stay in A.
    expect(classify({ review_reason: STRIKETHROUGH })).toBe('A');
  });

  it('produces the expected partition for the combined R+P queue', () => {
    const queue = [
      ...Array.from({ length: 4 }, () => ({ review_reason: STRIKETHROUGH })), // R2 + P2
      ...Array.from({ length: 103 }, () => ({ review_reason: AUTO_INTERNAL })), // R40 + P63
      ...Array.from({ length: 115 }, () => ({ review_reason: COD })), // P115
      ...Array.from({ length: 45 }, () => ({ review_reason: DONT_USE })), // P45
    ];
    const count = (t: string) => queue.filter((r) => classify(r) === t).length;
    expect([count('A'), count('B'), count('C'), count('D')]).toEqual([4, 103, 115, 45]);
  });

  it('defaults unknown reasons to A', () => {
    expect(classify({ review_reason: '' })).toBe('A');
    expect(classify({ review_reason: 'something else' })).toBe('A');
  });
});
