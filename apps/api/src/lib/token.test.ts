import { describe, expect, it } from 'vitest';
import { generateSessionToken } from './token';

describe('generateSessionToken', () => {
  it('is url-safe base64 of sufficient length', () => {
    const t = generateSessionToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(40); // 32 bytes -> ~43 chars
  });

  it('produces distinct values (not sequential/guessable)', () => {
    const set = new Set(Array.from({ length: 1000 }, () => generateSessionToken()));
    expect(set.size).toBe(1000);
  });
});
