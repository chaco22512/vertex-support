import type { MiddlewareHandler } from 'hono';
import type { Conversation } from '@vertex/shared';
import type { AppEnv } from '../types';

/**
 * Resolve :token to a conversation (session auth, §2/§9). Unknown tokens get a
 * 404 and never reach a handler. The resolved conversation is put on the context.
 */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = c.req.param('token');
  if (!token) return c.json({ error: 'missing_token' }, 400);

  const { db } = c.get('deps');
  const { data, error } = await db
    .from('conversations')
    .select('*')
    .eq('session_token', token)
    .maybeSingle();

  if (error) return c.json({ error: 'server_error' }, 500);
  if (!data) return c.json({ error: 'not_found' }, 404);

  c.set('conversation', data as Conversation);
  await next();
  return undefined;
};
