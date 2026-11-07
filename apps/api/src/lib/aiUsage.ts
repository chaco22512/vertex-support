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
export function summarizeUsage(rows: { outcome: string }[], limit: number, now: Date): AiUsage {
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

export interface CallRow {
  at: string;
  outcome: string;
  purpose?: string | null;
}

/** ★2026-11-07: the per-minute view (RPM) and what the calls were for. */
export interface AiActivity {
  /** Calls Google accepted in the last 60 seconds vs the per-minute cap (0 = none). */
  minute: { used: number; limit: number; limited: boolean };
  /** The last 60 minutes, oldest first: calls per minute and whether a limit was hit. */
  last_hour: { minute: string; calls: number; limited: boolean }[];
  purposes: {
    today: Record<string, number>;
    week: Record<string, number>;
    /** Model calls per customer question (reply + retries + fallback) / replies; null = no replies. */
    per_question_today: number | null;
    per_question_week: number | null;
  };
}

/** A call Google accepted (counts toward its limits); refused calls (429) do not. */
const counted = (r: { outcome: string }) => r.outcome === 'ok' || r.outcome === 'error';
const refused = (r: { outcome: string }) =>
  r.outcome === 'rate_limited' || r.outcome === 'daily_limit';
const CUSTOMER_PURPOSES = new Set(['reply', 'reply_retry', 'fallback', 'fallback_retry']);

function purposeCounts(rows: CallRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows.filter(counted)) {
    const p = r.purpose || 'unknown';
    out[p] = (out[p] ?? 0) + 1;
  }
  return out;
}

function perQuestion(counts: Record<string, number>): number | null {
  const replies = counts.reply ?? 0;
  if (replies === 0) return null;
  const calls = Object.entries(counts)
    .filter(([p]) => CUSTOMER_PURPOSES.has(p))
    .reduce((n, [, v]) => n + v, 0);
  return Math.round((calls / replies) * 100) / 100;
}

/** Summarise the last 7 days of calls into the per-minute / per-purpose view. */
export function summarizeActivity(rows: CallRow[], rpmLimit: number, now: Date): AiActivity {
  const t = now.getTime();
  const minuteStart = Math.floor(t / 60_000) * 60_000;
  const hourStart = minuteStart - 59 * 60_000;
  const lastMinute = rows.filter((r) => t - Date.parse(r.at) < 60_000 && Date.parse(r.at) <= t);
  const last_hour = Array.from({ length: 60 }, (_, i) => ({
    minute: new Date(hourStart + i * 60_000).toISOString(),
    calls: 0,
    limited: false,
  }));
  for (const r of rows) {
    const i = Math.floor((Date.parse(r.at) - hourStart) / 60_000);
    if (i < 0 || i >= 60) continue;
    if (counted(r)) last_hour[i]!.calls += 1;
    if (refused(r)) last_hour[i]!.limited = true;
  }
  const dayStart = pacificDayStart(now).getTime();
  const today = purposeCounts(rows.filter((r) => Date.parse(r.at) >= dayStart));
  const week = purposeCounts(rows.filter((r) => t - Date.parse(r.at) < 7 * 86_400_000));
  return {
    minute: {
      used: lastMinute.filter(counted).length,
      limit: rpmLimit,
      limited: lastMinute.some((r) => r.outcome === 'rate_limited'),
    },
    last_hour,
    purposes: {
      today,
      week,
      per_question_today: perQuestion(today),
      per_question_week: perQuestion(week),
    },
  };
}

/** Read the last 7 days of calls and summarise today (Pacific day), the last minute/hour and purposes. */
export async function loadUsage(
  db: SupabaseClient,
  limit: number,
  now = new Date(),
  rpmLimit = 5,
): Promise<AiUsage & AiActivity> {
  const rows: CallRow[] = [];
  const dayStart = pacificDayStart(now);
  const since = new Date(
    Math.min(dayStart.getTime(), now.getTime() - 7 * 86_400_000),
  ).toISOString();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('ai_call_log')
      .select('at,outcome,purpose')
      .gte('at', since)
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as CallRow[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  const today = rows.filter((r) => Date.parse(r.at) >= dayStart.getTime());
  return { ...summarizeUsage(today, limit, now), ...summarizeActivity(rows, rpmLimit, now) };
}
