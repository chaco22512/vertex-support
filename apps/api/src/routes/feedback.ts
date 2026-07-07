import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { feedbackSchema } from '../dto';
import { escalateConversation } from '../lib/escalation';

/** POST /api/conversations/:token/feedback — Solved / Still need help (§9, §6.1). */
export async function postFeedback(c: Context<AppEnv>): Promise<Response> {
  const conversation = c.get('conversation');
  const { db } = c.get('deps');

  const raw = await c.req.json().catch(() => null);
  const parsed = feedbackSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  if (parsed.data.type === 'solved') {
    await db
      .from('conversations')
      .update({ status: 'resolved', updated_at: new Date().toISOString() })
      .eq('id', conversation.id);
    return c.json({ status: 'resolved' });
  }

  const result = await escalateConversation(db, conversation, parsed.data.reason ?? 'not_in_manual');
  return c.json({ status: 'escalated', reply_due_at: result.reply_due_at });
}
