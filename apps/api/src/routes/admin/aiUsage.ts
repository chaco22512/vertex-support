import type { Context } from 'hono';
import type { AppEnv } from '../../types';
import { loadUsage } from '../../lib/aiUsage';

/**
 * GET /api/admin/ai-usage — Gemini requests used today (Pacific day) and how
 * many are left (spec v1.8 §7.1), plus ★2026-11-07 the last minute (RPM) /
 * last hour and what the calls were for. An estimate from this bot's own calls; any
 * staff member may read it (counts only).
 */
export async function getAiUsage(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  try {
    return c.json(
      await loadUsage(deps.db, deps.aiDailyLimit ?? 20, new Date(), deps.aiRpmLimit ?? 5),
    );
  } catch {
    return c.json({ error: 'server_error' }, 500);
  }
}
