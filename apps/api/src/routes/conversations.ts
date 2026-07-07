import type { Context } from 'hono';
import type { Conversation } from '@vertex/shared';
import type { AppEnv } from '../types';
import { createConversationSchema } from '../dto';
import { generateSessionToken } from '../lib/token';
import { menu } from '../lib/menu';

/** English label for a topic id, for the staff-visible "Topic:" marker (§6.2). */
function topicLabel(topicCategory: string): string | null {
  const cat = menu.categories.find((c) => c.id === topicCategory);
  const label = (cat as { label_en?: string } | undefined)?.label_en;
  return label ?? null;
}

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

  // Persist a staff-visible "Topic:" marker so the conversation carries context
  // in the admin view (§6.2, acceptance criterion 23). Non-empty body => shown.
  const label = conv.topic_category ? topicLabel(conv.topic_category) : null;
  if (label) {
    await db.from('messages').insert({
      conversation_id: conv.id,
      sender: 'system',
      body: `Topic: ${label}`,
    });
  }

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
