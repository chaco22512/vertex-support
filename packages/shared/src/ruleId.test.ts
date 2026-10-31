import { describe, expect, it } from 'vitest';
import { normalizeRuleId, ruleIdProblem } from './ruleId';

describe('Rule ID convention (v1.8 §3.1)', () => {
  it('normalises case and spaces', () => {
    expect(normalizeRuleId(' dr001 ')).toBe('DR001');
  });

  it('accepts topic code + 3 digits', () => {
    expect(ruleIdProblem('DR001')).toBeNull();
    expect(ruleIdProblem('GN120')).toBeNull();
  });

  it('explains what to do for each kind of mistake', () => {
    expect(ruleIdProblem('')).toContain('no Rule ID');
    expect(ruleIdProblem('DR-01')).toContain('only contain letters and numbers');
    expect(ruleIdProblem('DR01')).toContain('2 letters for the topic + 3 numbers');
    expect(ruleIdProblem('DR0001')).toContain('expected format');
    const unknown = ruleIdProblem('XX001')!;
    expect(unknown).toContain('not a topic code');
    expect(unknown).toContain('DR (Deposit refund)');
  });
});
