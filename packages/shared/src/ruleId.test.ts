import { describe, expect, it } from 'vitest';
import { normalizeRuleId, ruleIdCode, ruleIdProblem } from './ruleId';

describe('Rule ID convention (v1.8 §3.1, widened 2026-11-07)', () => {
  it('normalises case and spaces', () => {
    expect(normalizeRuleId(' dr001 ')).toBe('DR001');
    expect(normalizeRuleId('esp001')).toBe('ESP001');
  });

  it('accepts 2–4 letters + 3–4 digits, including codes that are not built in', () => {
    for (const id of ['DR001', 'GN120', 'APN001', 'ESP001', 'CN0001', 'ABCD9999', 'XX001']) {
      expect(ruleIdProblem(id)).toBeNull();
    }
  });

  it('rejects anything else and states the allowed format', () => {
    for (const id of ['', 'DR-01', 'DR01', 'ABCDE001', 'DR00001', 'D001', '001DR']) {
      const p = ruleIdProblem(id)!;
      expect(p).toBeTruthy();
      expect(p).toContain('2–4 capital letters');
      expect(p).toContain('3–4 numbers');
    }
    expect(ruleIdProblem('')).toContain('no Rule ID');
    expect(ruleIdProblem('DR-01')).toContain('only contain letters and numbers');
  });

  it('reads the topic code of convention IDs only', () => {
    expect(ruleIdCode('ESP001')).toBe('ESP');
    expect(ruleIdCode('cn0001')).toBe('CN');
    expect(ruleIdCode('R508')).toBeNull();
  });
});
