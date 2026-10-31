import { describe, expect, it } from 'vitest';
import { GeminiError, type LlmClient } from '@vertex/ai';
import { FakeSupabase } from '../testing/fakeSupabase';
import { loadUsage, nextPacificReset, pacificDayStart, summarizeUsage } from './aiUsage';
import { countingLlm } from './countingLlm';

/** Spec v1.8 §7.1 — "AI requests today" (Gemini's daily quota resets at 00:00 Pacific). */

describe('Pacific day boundaries', () => {
  it('summer (PDT, UTC−7): the day starts at 07:00 UTC', () => {
    expect(pacificDayStart(new Date('2026-10-31T10:00:00Z')).toISOString()).toBe('2026-10-31T07:00:00.000Z');
    // 06:59 UTC is still the previous Pacific day.
    expect(pacificDayStart(new Date('2026-10-31T06:59:00Z')).toISOString()).toBe('2026-10-30T07:00:00.000Z');
    expect(nextPacificReset(new Date('2026-10-31T10:00:00Z')).toISOString()).toBe('2026-11-01T07:00:00.000Z');
  });

  it('winter (PST, UTC−8): the day starts at 08:00 UTC', () => {
    expect(pacificDayStart(new Date('2026-12-15T12:00:00Z')).toISOString()).toBe('2026-12-15T08:00:00.000Z');
  });

  it('across the DST change (Nov 1 2026): reset follows the new offset', () => {
    // Nov 1 starts at 07:00 UTC (still PDT at midnight); Nov 2 starts at 08:00 UTC (PST).
    expect(pacificDayStart(new Date('2026-11-01T20:00:00Z')).toISOString()).toBe('2026-11-01T07:00:00.000Z');
    expect(nextPacificReset(new Date('2026-11-01T20:00:00Z')).toISOString()).toBe('2026-11-02T08:00:00.000Z');
  });
});

describe('summarizeUsage', () => {
  const now = new Date('2026-10-31T10:00:00Z');

  it('counts answered and failed calls, not calls Google refused', () => {
    const u = summarizeUsage(
      [{ outcome: 'ok' }, { outcome: 'ok' }, { outcome: 'error' }, { outcome: 'rate_limited' }],
      20,
      now,
    );
    expect(u).toMatchObject({ used_today: 3, remaining: 17, daily_limit_hit: false });
  });

  it("Google's 'daily limit reached' wins over the estimate", () => {
    const u = summarizeUsage([{ outcome: 'ok' }, { outcome: 'daily_limit' }], 20, now);
    expect(u).toMatchObject({ used_today: 1, remaining: 0, daily_limit_hit: true });
  });

  it('limit 0 means no cap: remaining is null', () => {
    expect(summarizeUsage([{ outcome: 'ok' }], 0, now).remaining).toBeNull();
  });
});

describe('countingLlm', () => {
  function inner(behaviour: 'ok' | 'daily' | 'minute' | 'boom'): LlmClient {
    return {
      model: 'm',
      generate: async () => {
        if (behaviour === 'daily') throw new GeminiError(429, 'm', 'GenerateRequestsPerDayPerProjectPerModel-FreeTier');
        if (behaviour === 'minute') throw new GeminiError(429, 'm', 'GenerateRequestsPerMinutePerProjectPerModel');
        if (behaviour === 'boom') throw new Error('network');
        return 'reply';
      },
    };
  }

  it('logs every call with its outcome and passes results / errors through', async () => {
    const db = new FakeSupabase();
    expect(await countingLlm(inner('ok'), db.asClient()).generate({ system: '', messages: [] })).toBe('reply');
    for (const b of ['daily', 'minute', 'boom'] as const) {
      await expect(countingLlm(inner(b), db.asClient()).generate({ system: '', messages: [] })).rejects.toThrow();
    }
    expect(db.tables.ai_call_log!.map((r) => r.outcome)).toEqual(['ok', 'daily_limit', 'rate_limited', 'error']);
  });

  it('a logging failure never breaks the reply', async () => {
    const brokenDb = { from: () => ({ insert: () => Promise.reject(new Error('db down')) }) };
    const llm = countingLlm(inner('ok'), brokenDb as never);
    expect(await llm.generate({ system: '', messages: [] })).toBe('reply');
  });
});

describe('loadUsage', () => {
  it("only counts today's Pacific day", async () => {
    const db = new FakeSupabase();
    db.tables.ai_call_log = [
      { id: 1, at: '2026-10-31T06:30:00.000Z', outcome: 'ok' }, // yesterday (Pacific)
      { id: 2, at: '2026-10-31T07:10:00.000Z', outcome: 'ok' },
      { id: 3, at: '2026-10-31T09:00:00.000Z', outcome: 'error' },
    ];
    const u = await loadUsage(db.asClient(), 20, new Date('2026-10-31T10:00:00Z'));
    expect(u).toMatchObject({ used_today: 2, remaining: 18, resets_at: '2026-11-01T07:00:00.000Z' });
  });
});
