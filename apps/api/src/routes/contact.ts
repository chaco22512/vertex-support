import type { Context } from 'hono';
import type { IntakeInfo } from '@vertex/shared';
import type { AppEnv } from '../types';
import { contactSchema } from '../dto';
import { escalateConversation } from '../lib/escalation';

/** Keep only non-empty intake fields (§6.2, v1.6) — skipped fields aren't stored. */
function compactIntake(intake: IntakeInfo | undefined): IntakeInfo {
  const out: IntakeInfo = {};
  for (const [k, v] of Object.entries(intake ?? {})) {
    if (typeof v === 'string' && v.trim()) out[k as keyof IntakeInfo] = v.trim();
  }
  return out;
}

/** POST /api/conversations/:token/contact — store contact + intake + finalize escalation (§9, §6.1/§6.2). */
export async function postContact(c: Context<AppEnv>): Promise<Response> {
  const conversation = c.get('conversation');
  const deps = c.get('deps');
  const { db } = deps;

  const raw = await c.req.json().catch(() => null);
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const intake = compactIntake(parsed.data.intake);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name) update.customer_name = parsed.data.name;
  if (parsed.data.email !== undefined) update.contact_email = parsed.data.email;
  if (parsed.data.whatsapp !== undefined) update.contact_whatsapp = parsed.data.whatsapp;
  if (Object.keys(intake).length > 0) update.intake_info = intake;
  await db.from('conversations').update(update).eq('id', conversation.id);

  // Escalate + notify here (the single notification carries the intake).
  let replyDueAt = conversation.reply_due_at;
  if (conversation.status !== 'escalated') {
    const result = await escalateConversation(deps, conversation, parsed.data.reason ?? 'other', intake);
    replyDueAt = result.reply_due_at;
  }

  return c.json({ status: 'escalated', reply_due_at: replyDueAt });
}
