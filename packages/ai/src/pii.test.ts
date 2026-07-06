import { describe, expect, it } from 'vitest';
import { maskPii } from './pii';

describe('maskPii', () => {
  it('masks email addresses', () => {
    expect(maskPii('Contact me at john.doe@example.com please').masked).toBe(
      'Contact me at [EMAIL] please',
    );
  });

  it('masks a phone number with separators', () => {
    expect(maskPii('Call 090-1234-5678 now').masked).toBe('Call [PHONE] now');
  });

  it('masks an international phone number', () => {
    expect(maskPii('My number is +81 90 1234 5678').masked).toBe('My number is [PHONE]');
  });

  it('masks a bare ICCID (19 digits) as a number', () => {
    expect(maskPii('ICCID 8981100012345678901 here').masked).toBe('ICCID [NUMBER] here');
  });

  it('does not mask short numbers or fees', () => {
    expect(maskPii('The fee is ¥4,000 for 3 items').masked).toBe('The fee is ¥4,000 for 3 items');
    expect(maskPii('order 12345').masked).toBe('order 12345');
  });

  it('does not touch letters around numbers', () => {
    expect(maskPii('SIM1234 and 0120123456 ok').masked).toBe('SIM1234 and [NUMBER] ok');
  });

  it('masks multiple items in one message', () => {
    const out = maskPii('mail a@b.co tel 08012345678').masked;
    expect(out).toContain('[EMAIL]');
    expect(out).toContain('[NUMBER]');
  });
});
