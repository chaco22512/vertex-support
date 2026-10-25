import { describe, expect, it } from 'vitest';
import { hasChanges, lineDiff } from './lineDiff';

describe('lineDiff', () => {
  it('marks added, removed and unchanged lines in order', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc\nd')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'del', text: 'b' },
      { type: 'add', text: 'B' },
      { type: 'same', text: 'c' },
      { type: 'add', text: 'd' },
    ]);
  });

  it('handles empty sides', () => {
    expect(lineDiff('', 'x')).toEqual([{ type: 'add', text: 'x' }]);
    expect(lineDiff('x', '')).toEqual([{ type: 'del', text: 'x' }]);
    expect(hasChanges(lineDiff('same', 'same'))).toBe(false);
  });
});
