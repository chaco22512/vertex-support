import type { Context } from 'hono';
import type { AppEnv } from '../../types';

/** GET /api/admin/changelog — knowledge change history (§7.7). */
export async function listChangelog(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const { data, error } = await db
    .from('kb_change_log')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(200);
  if (error) return c.json({ error: 'server_error' }, 500);
  return c.json({ entries: data ?? [] });
}
