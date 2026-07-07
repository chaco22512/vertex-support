import type { EscalationReason } from '@vertex/shared';

/** Fields shared by escalation + reminder Slack notices (§8). */
export interface SlackNoticeFields {
  channel: string;
  sourceTag: string;
  language: string;
  question: string;
  reason: EscalationReason | string;
  /** Slack member id of the assignee, or null when unassigned. */
  assigneeSlackId: string | null;
  conversationId: string;
  /** Admin base URL, e.g. https://admin.example.com (no trailing slash needed). */
  adminUrl: string;
}

function bodyLines(f: SlackNoticeFields): string[] {
  const src = f.sourceTag ? ` (src: ${f.sourceTag})` : '';
  const q = (f.question || '(no message)').slice(0, 120);
  const assigned = f.assigneeSlackId ? `<@${f.assigneeSlackId}>` : '@channel';
  const link = `${f.adminUrl.replace(/\/$/, '')}/inbox/${f.conversationId}`;
  return [
    `Channel: ${f.channel}${src} | Lang: ${f.language.toUpperCase()}`,
    `Q: "${q}"`,
    `AI reason: ${f.reason}`,
    `Assigned: ${assigned}`,
    `▶ Open conversation: ${link}`,
  ];
}

/** New-escalation notice. `dueLabel` e.g. "24h" → "🔔 Escalation — due in 24h". */
export function buildEscalationMessage(f: SlackNoticeFields, dueLabel: string): string {
  return [`🔔 Escalation — due in ${dueLabel}`, ...bodyLines(f)].join('\n');
}

/** Hourly reminder (§8): ⚠️ when <4h remain, 🚨 when past due. */
export function buildReminderMessage(
  kind: 'warn' | 'overdue',
  f: SlackNoticeFields,
  dueLabel: string,
): string {
  const header =
    kind === 'overdue'
      ? '🚨 Overdue — reply deadline passed'
      : `⚠️ Reminder — due in ${dueLabel}`;
  return [header, ...bodyLines(f)].join('\n');
}
