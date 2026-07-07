/** "Due" formatting for the Inbox (§7.2): remaining time, <4h flagged red. */
export interface Due {
  text: string;
  soon: boolean; // < 4h remaining
}

export function formatDue(replyDueAt: string | null, nowMs: number): Due {
  if (!replyDueAt) return { text: '—', soon: false };
  const diffMs = new Date(replyDueAt).getTime() - nowMs;
  const soon = diffMs < 4 * 3600_000;
  if (diffMs <= 0) return { text: 'Overdue', soon: true };
  const h = Math.floor(diffMs / 3600_000);
  const m = Math.floor((diffMs % 3600_000) / 60_000);
  return { text: h > 0 ? `${h}h ${m}m` : `${m}m`, soon };
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
