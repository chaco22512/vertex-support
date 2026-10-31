import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiClient, GeminiError } from './gemini';

/** No real network: fetch is stubbed. */
function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })),
  );
}

afterEach(() => vi.unstubAllGlobals());

const req = { system: 's', messages: [{ role: 'user' as const, text: 'secret customer text' }] };

describe('GeminiClient errors (v1.8 usage tracking)', () => {
  it('keeps only the quota id of a 429 and flags the daily cap', async () => {
    stubFetch(429, {
      error: {
        message: 'quota exceeded for secret customer text',
        details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }],
      },
    });
    const err = await new GeminiClient({ apiKey: 'k' }).generate(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GeminiError);
    const g = err as GeminiError;
    expect(g.quotaId).toBe('GenerateRequestsPerDayPerProjectPerModel-FreeTier');
    expect(g.isDailyLimit).toBe(true);
    expect(g.message).not.toContain('secret');
  });

  it('a per-minute 429 is not the daily cap', async () => {
    stubFetch(429, { error: { details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel' }] }] } });
    const g = (await new GeminiClient({ apiKey: 'k' }).generate(req).catch((e: unknown) => e)) as GeminiError;
    expect(g.isDailyLimit).toBe(false);
  });

  it('other errors carry no quota id', async () => {
    stubFetch(500, { error: { message: 'x' } });
    const g = (await new GeminiClient({ apiKey: 'k' }).generate(req).catch((e: unknown) => e)) as GeminiError;
    expect(g.status).toBe(500);
    expect(g.quotaId).toBeNull();
  });
});
