import { describe, expect, it } from 'vitest';
import { languageName, topicLabel } from './categories';

// Regression: menu_categories.json is { version, note, categories: [...] } — the
// array is nested, not the top-level value. Reading it as an array crashed the
// whole admin bundle at import time (categories.map is not a function).
describe('categories', () => {
  it('loads the nested categories array and maps topic ids to labels', () => {
    expect(topicLabel('lost')).toBe('Lost SIM or device');
  });

  it('falls back to the raw id for unknown topics', () => {
    expect(topicLabel('does-not-exist')).toBe('does-not-exist');
  });

  it('maps language codes to display names', () => {
    expect(languageName('ne')).toBe('नेपाली');
    expect(languageName('xx')).toBe('xx');
  });
});
