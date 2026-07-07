import type { EscalationReason } from '@vertex/shared';
import type { Deps } from '../types';
import { buildReminderMessage } from './slackMessage';

const WARN_WINDOW_MS = 4 * 60 * 60 * 1000; // <4h remaining → ⚠️ (§8)

interface ConvRow {
  id: string;
  language: string;
  channel: string;
  source_tag: string;
  assigned_staff: string | null;
  reply_due_at: string | null;
}

/**
 * Hourly reminder sweep (§8): for still-escalated conversations, re-notify Slack
 * with ⚠️ when under 4h remain and 🚨 when past the reply deadline. Conversations
 * with more than 4h left are left alone. Returns counts for observability/tests.
 */
export async function runReminders(
  deps: Deps,
  nowMs: number,
): Promise<{ warned: number; overdue: number }> {
  const { db } = deps;
  const { data: convData } = await db
    .from('conversations')
    .select('id,language,channel,source_tag,assigned_staff,reply_due_at')
    .eq('status', 'escalated');
  const convs = (convData ?? []) as ConvRow[];
  if (convs.length === 0) return { warned: 0, overdue: 0 };

  const ids = convs.map((c) => c.id);
  const { data: staffData } = await db.from('staff').select('id,slack_member_id');
  const slackById = new Map(
    ((staffData ?? []) as { id: string; slack_member_id: string | null }[]).map((s) => [
      s.id,
      s.slack_member_id ?? '',
    ]),
  );

  // First customer question + escalation reason (from the system marker) per conv.
  const { data: msgData } = await db
    .from('messages')
    .select('conversation_id,sender,body,ai_meta,id')
    .in('conversation_id', ids)
    .order('id', { ascending: true });
  const question = new Map<string, string>();
  const reason = new Map<string, EscalationReason>();
  for (const m of (msgData ?? []) as {
    conversation_id: string;
    sender: string;
    body: string;
    ai_meta: { reason?: EscalationReason } | null;
  }[]) {
    if (m.sender === 'customer' && !question.has(m.conversation_id)) {
      question.set(m.conversation_id, m.body);
    }
    if (m.sender === 'system' && m.ai_meta?.reason && !reason.has(m.conversation_id)) {
      reason.set(m.conversation_id, m.ai_meta.reason);
    }
  }

  let warned = 0;
  let overdue = 0;
  for (const c of convs) {
    if (!c.reply_due_at) continue;
    const diff = new Date(c.reply_due_at).getTime() - nowMs;
    const kind: 'warn' | 'overdue' | null =
      diff <= 0 ? 'overdue' : diff < WARN_WINDOW_MS ? 'warn' : null;
    if (!kind) continue;

    const text = buildReminderMessage(
      kind,
      {
        channel: c.channel,
        sourceTag: c.source_tag,
        language: c.language,
        question: question.get(c.id) ?? '',
        reason: reason.get(c.id) ?? 'other',
        assigneeSlackId: (c.assigned_staff && slackById.get(c.assigned_staff)) || null,
        conversationId: c.id,
        adminUrl: deps.adminOrigin,
      },
      `${Math.max(0, Math.round(diff / 3_600_000))}h`,
    );
    await deps.sendSlack(text);
    if (kind === 'overdue') overdue += 1;
    else warned += 1;
  }
  return { warned, overdue };
}
