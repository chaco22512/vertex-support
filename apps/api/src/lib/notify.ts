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

export interface StaffReplyNotice {
  conversationId: string;
  contactEmail: string;
  language: string;
}

/**
 * Customer email on staff reply (§8). M5 provides the call site; the Resend
 * email is implemented in M6. No-op for now.
 */
export async function notifyStaffReply(_notice: StaffReplyNotice): Promise<void> {
  // M6: send Resend email (5-language template) when contact_email is present.
}
