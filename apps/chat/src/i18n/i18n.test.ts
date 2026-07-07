import { describe, expect, it } from 'vitest';
import { detectLanguage, getMessages, languageOrder, SUPPORTED_LANGUAGES } from './index';
import { en } from './en';

describe('detectLanguage', () => {
  it('maps region locales to supported codes', () => {
    expect(detectLanguage('ne-NP')).toBe('ne');
    expect(detectLanguage('vi')).toBe('vi');
    expect(detectLanguage('fil-PH')).toBe('tl'); // Filipino → Tagalog
    expect(detectLanguage('fr-FR')).toBe('en'); // unsupported → en
    expect(detectLanguage(undefined)).toBe('en');
  });
});

describe('languageOrder', () => {
  it('puts the detected language first', () => {
    const order = languageOrder('vi');
    expect(order[0]).toBe('vi');
    expect(order).toHaveLength(SUPPORTED_LANGUAGES.length);
    expect(new Set(order).size).toBe(SUPPORTED_LANGUAGES.length);
  });
});

describe('locale completeness', () => {
  const uiKeys = Object.keys(en.ui).sort();
  const catKeys = Object.keys(en.categories).sort();
  const subKeys = Object.keys(en.subQuestions).sort();

  for (const lang of SUPPORTED_LANGUAGES) {
    it(`${lang} has all keys with matching sub-question counts`, () => {
      const m = getMessages(lang);
      expect(Object.keys(m.ui).sort()).toEqual(uiKeys);
      expect(Object.keys(m.categories).sort()).toEqual(catKeys);
      expect(Object.keys(m.subQuestions).sort()).toEqual(subKeys);
      for (const id of subKeys) {
        expect(m.subQuestions[id]!.length).toBe(en.subQuestions[id]!.length);
      }
    });
  }
});
