import { describe, expect, it } from 'vitest';
import { normalizeRuleId, ruleIdProblem } from './ruleId';

describe('Rule ID convention (v1.8 §3.1)', () => {
  it('normalises case and spaces', () => {
    expect(normalizeRuleId(' dr001 ')).toBe('DR001');
  });

  it('accepts topic code + 3 digits', () => {
    expect(ruleIdProblem('DR001')).toBeNull();
    expect(ruleIdProblem('GN120')).toBeNull();
    expect(ruleIdProblem('APN001')).toBeNull(); // 3-letter code (CS APN sheet)
  });

  it('explains what to do for each kind of mistake', () => {
    expect(ruleIdProblem('')).toContain('no Rule ID');
    expect(ruleIdProblem('DR-01')).toContain('only contain letters and numbers');
    expect(ruleIdProblem('DR01')).toContain('topic code (2–4 letters) + 3 numbers');
    expect(ruleIdProblem('ABCDE001')).toContain('expected format');
    expect(ruleIdProblem('ABC001')).toContain('not a topic code');
    expect(ruleIdProblem('DR0001')).toContain('expected format');
    const unknown = ruleIdProblem('XX001')!;
    expect(unknown).toContain('not a topic code');
    expect(unknown).toContain('DR (Deposit refund)');
  });
});
