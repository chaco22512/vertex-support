import type { Context } from 'hono';
import type { AppEnv } from '../../types';

/**
 * GET /api/admin/kb-health — how many rules the bot can use right now
 * (active + customer + ai_can_answer, the same filter as the AI prompt).
 * Drives the Dashboard "no active rules" warning (spec v1.8 §7.1). Any staff
 * member may read it — it is a count only.
 */
export async function getKbHealth(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const { count, error } = await db
    .from('kb_rules')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .eq('audience', 'customer')
    .eq('ai_can_answer', true);
  if (error) return c.json({ error: 'server_error' }, 500);
  return c.json({ active_rules: count ?? 0 });
}
