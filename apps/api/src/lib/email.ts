/**
 * Resend email client (§8). Sends the customer notification on staff reply.
 * Like Slack, failures are logged and swallowed so they never break the reply.
 *
 * NOTE (M8): `onboarding@resend.dev` only delivers to the Resend account owner's
 * address and is for testing. Replace with a verified Vertex domain sender at
 * deploy time (see docs/TODO-M8.md).
 */
/** Test sender: only delivers to the Resend account owner. Override via EMAIL_FROM. */
export const DEFAULT_EMAIL_FROM = 'Vertex Support <onboarding@resend.dev>';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export async function sendResend(apiKey: string, from: string, msg: EmailMessage): Promise<void> {
  if (!apiKey) return;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to: msg.to, subject: msg.subject, html: msg.html }),
    });
    if (!res.ok) {
      console.error(`resend returned ${res.status}`);
    }
  } catch (e) {
    console.error('resend email failed', e instanceof Error ? e.message : String(e));
  }
}
