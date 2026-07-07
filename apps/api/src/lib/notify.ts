import type { EscalationReason } from '@vertex/shared';
import type { Deps } from '../types';
import { buildEscalationMessage } from './slackMessage';
import { buildStaffReplyEmail } from './emailTemplates';

/** Whole hours until an ISO deadline, as a Slack label like "24h" (min "0h"). */
function hoursLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  return `${Math.max(0, Math.round(ms / 3_600_000))}h`;
}

export interface EscalationNotice {
  conversationId: string;
  reason: EscalationReason;
  replyDueAt: string;
  language: string;
  channel: string;
  sourceTag: string;
  /** Slack member id of the assignee, or null when unassigned. */
  assigneeSlackId: string | null;
}

/** Slack notification on escalation (§8). Never throws (sendSlack swallows). */
export async function notifyEscalation(deps: Deps, notice: EscalationNotice): Promise<void> {
  const { data } = await deps.db
    .from('messages')
    .select('sender,body')
    .eq('conversation_id', notice.conversationId)
    .eq('sender', 'customer')
    .order('id', { ascending: true })
    .limit(1);
  const question = ((data ?? []) as { body: string }[])[0]?.body ?? '';

  const text = buildEscalationMessage(
    {
      channel: notice.channel,
      sourceTag: notice.sourceTag,
      language: notice.language,
      question,
      reason: notice.reason,
      assigneeSlackId: notice.assigneeSlackId,
      conversationId: notice.conversationId,
      adminUrl: deps.adminOrigin,
    },
    hoursLabel(notice.replyDueAt),
  );
  await deps.sendSlack(text);
}

export interface StaffReplyNotice {
  conversationId: string;
  contactEmail: string;
  language: string;
  sessionToken: string;
}

/** Customer email on staff reply (§8). Never throws (sendEmail swallows). */
export async function notifyStaffReply(deps: Deps, notice: StaffReplyNotice): Promise<void> {
  const chatUrl = `${deps.chatOrigin.replace(/\/$/, '')}/?t=${notice.sessionToken}`;
  const logoUrl = `${deps.adminOrigin.replace(/\/$/, '')}/logo-horizontal.webp`;
  const { subject, html } = buildStaffReplyEmail(notice.language, { chatUrl, logoUrl });
  await deps.sendEmail({ to: notice.contactEmail, subject, html });
}
