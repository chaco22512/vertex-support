import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { changeTopicSchema } from '../dto';
import { escalateFollowUp } from '../lib/escalation';
import { menu, topicLabel } from '../lib/menu';

/**
 * POST /api/conversations/:token/topic — "Ask another question" (★v1.8 §6.1-7):
 * switch the SAME conversation to another menu topic (history kept), and leave
 * a staff-visible "Topic:" marker. Choosing Plans & prices in a conversation
 * whose contact is already on file hands it straight to staff (price_question)
 * instead of asking for contact details again.
 */
export async function postTopic(c: Context<AppEnv>): Promise<Response> {
  const conversation = c.get('conversation');
  const deps = c.get('deps');
  const { db } = deps;

  const parsed = changeTopicSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
  const topic = menu.categories.find((cat) => cat.id === parsed.data.topic_category);
  if (!topic) return c.json({ error: 'unknown_topic' }, 400);

  if (topic.id !== conversation.topic_category) {
    await db
      .from('conversations')
      .update({ topic_category: topic.id, updated_at: new Date().toISOString() })
      .eq('id', conversation.id);
  }
  const label = topicLabel(topic.id);
  if (label) {
    await db.from('messages').insert({ conversation_id: conversation.id, sender: 'system', body: `Topic: ${label}` });
  }

  let status = conversation.status;
  let followUp = false;
  const hasContact = Boolean(conversation.contact_email || conversation.contact_whatsapp);
  if (topic.behavior === 'always_escalate' && hasContact) {
    await escalateFollowUp(deps, conversation, 'price_question', `(selected topic: ${label ?? topic.id})`);
    status = 'escalated';
    followUp = true;
  }

  return c.json({ topic_category: topic.id, status, followup_escalated: followUp });
}
