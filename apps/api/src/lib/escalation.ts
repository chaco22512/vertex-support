import type { Conversation, EscalationReason } from '@vertex/shared';
import type { Deps } from '../types';
import { notifyEscalation } from './notify';
import { pickAssignee } from './assign';

/** 24-hour reply SLA (§8). */
export const REPLY_SLA_MS = 24 * 60 * 60 * 1000;

export interface EscalationResult {
  escalated_at: string;
  reply_due_at: string;
  reason: EscalationReason;
}

type EscalatableConversation = Pick<Conversation, 'id' | 'language' | 'channel' | 'source_tag'>;

/**
 * Escalate a conversation (§8): set status='escalated', escalated_at=now,
 * reply_due_at=now+24h; record the reason on a system marker message; auto-assign
 * the least-loaded matching staff member; then Slack-notify. Notification/assign
 * failures never break escalation (sendSlack swallows; assign is best-effort).
 */
export async function escalateConversation(
  deps: Deps,
  conversation: EscalatableConversation,
  reason: EscalationReason,
): Promise<EscalationResult> {
  const { db } = deps;
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

  // Auto-assign the least-loaded staff member who speaks the customer language.
  const assignee = await pickAssignee(db, conversation.language);
  if (assignee) {
    await db.from('conversations').update({ assigned_staff: assignee.id }).eq('id', conversation.id);
  }

  await notifyEscalation(deps, {
    conversationId: conversation.id,
    reason,
    replyDueAt: dueIso,
    language: conversation.language,
    channel: conversation.channel,
    sourceTag: conversation.source_tag,
    assigneeSlackId: assignee?.slackMemberId || null,
  });
  return { escalated_at: nowIso, reply_due_at: dueIso, reason };
}
