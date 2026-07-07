/**
 * Slack Incoming Webhook client (§8). Posts mrkdwn text to the configured
 * #cs-escalation channel. Notification failures must never break the request
 * that triggered them, so errors are logged and swallowed.
 */
export async function postSlack(webhookUrl: string, text: string): Promise<void> {
  if (!webhookUrl) return;
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.error(`slack webhook returned ${res.status}`);
    }
  } catch (e) {
    console.error('slack webhook failed', e instanceof Error ? e.message : String(e));
  }
}
