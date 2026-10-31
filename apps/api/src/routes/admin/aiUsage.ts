import type { Context } from 'hono';
import type { AppEnv } from '../../types';
import { loadUsage } from '../../lib/aiUsage';

/**
 * GET /api/admin/ai-usage — Gemini requests used today (Pacific day) and how
 * many are left (spec v1.8 §7.1). An estimate from this bot's own calls; any
 * staff member may read it (counts only).
 */
export async function getAiUsage(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  try {
    return c.json(await loadUsage(deps.db, deps.aiDailyLimit ?? 20));
  } catch {
    return c.json({ error: 'server_error' }, 500);
  }
}
