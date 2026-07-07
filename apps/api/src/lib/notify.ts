import type { EscalationReason } from '@vertex/shared';

export interface EscalationNotice {
  conversationId: string;
  reason: EscalationReason;
  replyDueAt: string;
}

/**
 * Escalation notification hook. M3 provides the call site only; the Slack webhook
 * and Resend email are implemented in M6 (§8). Intentionally a no-op for now.
 */
export async function notifyEscalation(_notice: EscalationNotice): Promise<void> {
  // M6: send Slack webhook + assign staff + (on staff reply) Resend email.
}
