import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conversation, EscalationReason } from '@vertex/shared';
import { notifyEscalation } from './notify';

/** 24-hour reply SLA (§8). */
export const REPLY_SLA_MS = 24 * 60 * 60 * 1000;

export interface EscalationResult {
  escalated_at: string;
  reply_due_at: string;
  reason: EscalationReason;
}

/**
 * Escalate a conversation (§8) — M3 scope: set status + timestamps only.
 * status='escalated', escalated_at=now, reply_due_at=now+24h. The reason is
 * recorded on a system marker message's ai_meta so M6 can surface it in Slack.
 * Staff auto-assignment and the actual notification are M6 (notifyEscalation is
 * a no-op hook for now).
 */
export async function escalateConversation(
  db: SupabaseClient,
  conversation: Pick<Conversation, 'id'>,
  reason: EscalationReason,
): Promise<EscalationResult> {
  const now = new Date();
  const nowIso = now.toISOString();
  const dueIso = new Date(now.getTime() + REPLY_SLA_MS).toISOString();

  const { error } = await db
    .from('conversations')
    .update({
      status: 'escalated',
      escalated_at: nowIso,
      reply_due_at: dueIso,
      updated_at: nowIso,
    })
    .eq('id', conversation.id);
  if (error) throw new Error(`escalate failed: ${error.message}`);

  // Internal marker (body empty so the chat UI can skip it); carries the reason.
  await db.from('messages').insert({
    conversation_id: conversation.id,
    sender: 'system',
    body: '',
    ai_meta: { escalate: true, reason, rule_ids: [], model: '' },
  });

  await notifyEscalation({ conversationId: conversation.id, reason, replyDueAt: dueIso });
  return { escalated_at: nowIso, reply_due_at: dueIso, reason };
}
