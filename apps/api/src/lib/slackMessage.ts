import type { EscalationReason, IntakeInfo } from '@vertex/shared';

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
  /** Pre-escalation intake details, if any (§6.2, v1.6). */
  intake?: IntakeInfo;
}

/** Short human labels for intake keys, in a stable display order (§6.2). */
const INTAKE_LABELS: [keyof IntakeInfo, string][] = [
  ['customer_number', 'Customer #'],
  ['smartpit', 'SmartPit'],
  ['gmo', 'GMO'],
  ['registered_phone', 'Phone'],
  ['sim_iccid', 'ICCID'],
  ['device_model', 'Device'],
  ['tried_already', 'Tried'],
];

/** One-line "Info: k=v | k=v" from the filled intake fields, or '' if none. */
export function intakeLine(intake: IntakeInfo | undefined): string {
  if (!intake) return '';
  const parts = INTAKE_LABELS.flatMap(([key, label]) => {
    const v = intake[key]?.trim();
    return v ? [`${label}=${v}`] : [];
  });
  return parts.length ? `Info: ${parts.join(' | ')}` : '';
}

function bodyLines(f: SlackNoticeFields): string[] {
  const src = f.sourceTag ? ` (src: ${f.sourceTag})` : '';
  const q = (f.question || '(no message)').slice(0, 120);
  const assigned = f.assigneeSlackId ? `<@${f.assigneeSlackId}>` : '@channel';
  const link = `${f.adminUrl.replace(/\/$/, '')}/inbox/${f.conversationId}`;
  const info = intakeLine(f.intake);
  return [
    `Channel: ${f.channel}${src} | Lang: ${f.language.toUpperCase()}`,
    `Q: "${q}"`,
    ...(info ? [info] : []),
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
