import { describe, expect, it } from 'vitest';
import { fakeKv } from '../testing/mocks';
import { RATE_LIMIT_MAX, checkRateLimit } from './rateLimit';

describe('checkRateLimit', () => {
  it('allows up to the max then blocks within the same window', async () => {
    const kv = fakeKv();
    const now = 1_000_000_000_000; // fixed time inside one window
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      expect((await checkRateLimit(kv, 'tok', now)).allowed).toBe(true);
    }
    const blocked = await checkRateLimit(kv, 'tok', now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetSec).toBeGreaterThan(0);
  });

  it('resets in the next 60s window', async () => {
    const kv = fakeKv();
    const now = 1_000_000_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX; i++) await checkRateLimit(kv, 'tok', now);
    expect((await checkRateLimit(kv, 'tok', now)).allowed).toBe(false);
    const next = await checkRateLimit(kv, 'tok', now + 60_000);
    expect(next.allowed).toBe(true);
  });

  it('tracks tokens independently', async () => {
    const kv = fakeKv();
    const now = 1_000_000_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX; i++) await checkRateLimit(kv, 'a', now);
    expect((await checkRateLimit(kv, 'a', now)).allowed).toBe(false);
    expect((await checkRateLimit(kv, 'b', now)).allowed).toBe(true);
  });
});
