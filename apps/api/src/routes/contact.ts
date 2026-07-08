import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { contactSchema } from '../dto';
import { escalateConversation } from '../lib/escalation';

/** POST /api/conversations/:token/contact — store contact + finalize escalation (§9, §6.1). */
export async function postContact(c: Context<AppEnv>): Promise<Response> {
  const conversation = c.get('conversation');
  const deps = c.get('deps');
  const { db } = deps;

  const raw = await c.req.json().catch(() => null);
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name) update.customer_name = parsed.data.name;
  if (parsed.data.email !== undefined) update.contact_email = parsed.data.email;
  if (parsed.data.whatsapp !== undefined) update.contact_whatsapp = parsed.data.whatsapp;
  await db.from('conversations').update(update).eq('id', conversation.id);

  let replyDueAt = conversation.reply_due_at;
  if (conversation.status !== 'escalated') {
    const result = await escalateConversation(deps, conversation, parsed.data.reason ?? 'other');
    replyDueAt = result.reply_due_at;
  }

  return c.json({ status: 'escalated', reply_due_at: replyDueAt });
}
