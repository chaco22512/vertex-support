import type { Context } from 'hono';
import type { Conversation } from '@vertex/shared';
import type { AppEnv } from '../types';
import { createConversationSchema } from '../dto';
import { generateSessionToken } from '../lib/token';

/** POST /api/conversations — create an anonymous session (§9). */
export async function createConversation(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const raw = await c.req.json().catch(() => ({}));
  const parsed = createConversationSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const token = generateSessionToken();
  const { data, error } = await db
    .from('conversations')
    .insert({
      session_token: token,
      language: parsed.data.language ?? 'en',
      source_tag: parsed.data.source_tag ?? '',
      topic_category: parsed.data.topic_category ?? '',
    })
    .select()
    .single();

  if (error || !data) return c.json({ error: 'server_error' }, 500);
  const conv = data as Conversation;
  return c.json(
    {
      token,
      id: conv.id,
      language: conv.language,
      status: conv.status,
      topic_category: conv.topic_category,
    },
    201,
  );
}
