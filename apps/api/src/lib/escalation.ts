import type { Conversation, EscalationReason, IntakeInfo } from '@vertex/shared';
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

type OpenCaseConversation = EscalatableConversation &
  Pick<Conversation, 'status' | 'escalated_at' | 'reply_due_at' | 'assigned_staff'>;

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
  intake?: IntakeInfo,
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
    ai_meta: { action: 'escalate', escalate: true, reason, rule_ids: [], follow_up: null, model: '' },
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
    intake,
  });
  return { escalated_at: nowIso, reply_due_at: dueIso, reason };
}

/**
 * ★v1.8 §4.1.1: the AI escalated in a conversation whose contact details are
 * already on file (it was escalated before). Do NOT re-run the intake/contact
 * cards; instead hand the new message to staff:
 * - still 'escalated' → keep the deadline and assignee, just notify;
 * - otherwise (staff_replied / resolved …) → back to 'escalated' with a fresh
 *   24h deadline, keeping the existing assignee when there is one.
 * Records the reason on a system marker and sends a "follow-up" Slack notice
 * quoting the customer's latest message.
 */
export async function escalateFollowUp(
  deps: Deps,
  conversation: OpenCaseConversation,
  reason: EscalationReason,
  latestQuestion: string,
): Promise<EscalationResult> {
  const { db } = deps;
  const now = new Date();
  const nowIso = now.toISOString();
  const stillOpen = conversation.status === 'escalated' && conversation.reply_due_at;
  const dueIso = stillOpen
    ? (conversation.reply_due_at as string)
    : new Date(now.getTime() + REPLY_SLA_MS).toISOString();

  let assigneeId = conversation.assigned_staff;
  if (!assigneeId) assigneeId = (await pickAssignee(db, conversation.language))?.id ?? null;

  const update: Record<string, unknown> = { updated_at: nowIso, assigned_staff: assigneeId };
  if (!stillOpen) Object.assign(update, { status: 'escalated', escalated_at: nowIso, reply_due_at: dueIso });
  const { error } = await db.from('conversations').update(update).eq('id', conversation.id);
  if (error) throw new Error(`follow-up escalate failed: ${error.message}`);

  await db.from('messages').insert({
    conversation_id: conversation.id,
    sender: 'system',
    body: '',
    ai_meta: { action: 'escalate', escalate: true, reason, rule_ids: [], follow_up: null, model: '' },
  });

  let slackId: string | null = null;
  if (assigneeId) {
    const { data } = await db.from('staff').select('slack_member_id').eq('id', assigneeId).maybeSingle();
    slackId = (data as { slack_member_id?: string } | null)?.slack_member_id || null;
  }
  await notifyEscalation(deps, {
    conversationId: conversation.id,
    reason,
    replyDueAt: dueIso,
    language: conversation.language,
    channel: conversation.channel,
    sourceTag: conversation.source_tag,
    assigneeSlackId: slackId,
    followUpQuestion: latestQuestion,
  });
  return { escalated_at: (stillOpen && conversation.escalated_at) || nowIso, reply_due_at: dueIso, reason };
}
