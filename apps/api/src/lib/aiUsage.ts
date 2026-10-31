import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * "AI requests today" (spec v1.8 §7.1). Gemini's daily quota resets at
 * midnight Pacific time, so "today" is the Pacific day.
 */

const PACIFIC = 'America/Los_Angeles';

/** Minutes Pacific time is offset from UTC at `at` (−420 in summer, −480 in winter). */
function pacificOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'));
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/** The instant the current Pacific day started (00:00 Pacific), as a Date. */
export function pacificDayStart(now: Date): Date {
  const offset = pacificOffsetMinutes(now);
  const local = new Date(now.getTime() + offset * 60_000);
  const midnightLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  // The offset at midnight can differ on a DST-change day; use midnight's own offset.
  const guess = new Date(midnightLocal - offset * 60_000);
  return new Date(midnightLocal - pacificOffsetMinutes(guess) * 60_000);
}

/** The next quota reset (next 00:00 Pacific). */
export function nextPacificReset(now: Date): Date {
  const start = pacificDayStart(now);
  // 25h later is always inside the next Pacific day (even across DST).
  return pacificDayStart(new Date(start.getTime() + 25 * 3_600_000));
}

export interface AiUsage {
  used_today: number;
  /** 0 = no daily cap configured (e.g. after enabling billing). */
  limit: number;
  /** null when there is no cap. */
  remaining: number | null;
  resets_at: string;
  /** Google answered "daily limit reached" since the last reset. */
  daily_limit_hit: boolean;
}

/** Summarise ai_call_log rows since the last Pacific midnight. */
export function summarizeUsage(
  rows: { outcome: string }[],
  limit: number,
  now: Date,
): AiUsage {
  const used = rows.filter((r) => r.outcome === 'ok' || r.outcome === 'error').length;
  const hit = rows.some((r) => r.outcome === 'daily_limit');
  return {
    used_today: used,
    limit,
    remaining: limit > 0 ? (hit ? 0 : Math.max(0, limit - used)) : null,
    resets_at: nextPacificReset(now).toISOString(),
    daily_limit_hit: hit,
  };
}

/** Read today's calls (Pacific day) and summarise them. */
export async function loadUsage(db: SupabaseClient, limit: number, now = new Date()): Promise<AiUsage> {
  const rows: { outcome: string }[] = [];
  const since = pacificDayStart(now).toISOString();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('ai_call_log')
      .select('outcome')
      .gte('at', since)
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as { outcome: string }[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return summarizeUsage(rows, limit, now);
}
