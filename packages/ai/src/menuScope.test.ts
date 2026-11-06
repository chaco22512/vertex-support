import { describe, expect, it } from 'vitest';
import menuData from '../../../data/menu_categories.json';
import {
  canonicalTopic,
  resolveIdPrefixes,
  resolveKbCategories,
  resolveTopicLabel,
  type MenuCategories,
} from './categories';

/** 2026-11-06 tile restructure against the real menu file. */
const menu = menuData as unknown as MenuCategories;

describe('tile restructure (11 → 10 tiles)', () => {
  it('has the 10 agreed tiles in order', () => {
    expect(menu.categories.map((c) => c.id)).toEqual([
      'internet', 'connection', 'payment', 'lost', 'cancel', 'return', 'replace', 'deposit', 'plans', 'others',
    ]);
  });

  it('"connection" shares the Internet knowledge range but keeps its own label', () => {
    expect(resolveKbCategories('connection', menu)).toEqual(resolveKbCategories('internet', menu));
    expect(resolveIdPrefixes('connection', menu)).toEqual(['IN', 'APN', 'GN']);
    expect(resolveTopicLabel('connection', menu)).toBe('Report a signal or connection issue');
  });

  it('old "reissue" / "refund" conversations use the tiles they were merged into', () => {
    expect(canonicalTopic('reissue', menu)).toBe('lost');
    expect(resolveIdPrefixes('reissue', menu)).toEqual(resolveIdPrefixes('lost', menu));
    expect(resolveIdPrefixes('refund', menu)).toEqual(resolveIdPrefixes('deposit', menu));
    expect(resolveTopicLabel('refund', menu)).toBe('Deposit refund or cashback inquiry');
  });

  it('the merged tiles carry the re-issue / refund knowledge', () => {
    expect(resolveIdPrefixes('lost', menu)).toContain('RI');
    expect(resolveKbCategories('lost', menu)).toContain('RE-ISSUE  RULE');
    expect(resolveIdPrefixes('deposit', menu)).toContain('RF');
    expect(resolveKbCategories('deposit', menu)).toContain('REFUNDDEPOSIT CASHBACK');
  });

  it('Plans is answered from the PL rules', () => {
    expect(resolveIdPrefixes('plans', menu)).toEqual(['PL', 'GN']);
    expect(menu.categories.find((c) => c.id === 'plans')!.behavior).toBeUndefined();
  });
});
