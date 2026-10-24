import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { feedbackSchema } from '../dto';
import { escalateConversation, escalateFollowUp } from '../lib/escalation';

/** POST /api/conversations/:token/feedback — Solved / Still need help (§9, §6.1). */
export async function postFeedback(c: Context<AppEnv>): Promise<Response> {
  const conversation = c.get('conversation');
  const deps = c.get('deps');
  const { db } = deps;

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

  // ★v1.8: contact already on file (escalated before) → a follow-up in the open
  // case, keeping the assignee (and the deadline if still open).
  if (conversation.contact_email || conversation.contact_whatsapp) {
    const followUp = await escalateFollowUp(
      deps,
      conversation,
      parsed.data.reason ?? 'not_in_manual',
      '(customer pressed "Still need help")',
    );
    return c.json({ status: 'escalated', reply_due_at: followUp.reply_due_at });
  }
  const result = await escalateConversation(deps, conversation, parsed.data.reason ?? 'not_in_manual');
  return c.json({ status: 'escalated', reply_due_at: result.reply_due_at });
}
