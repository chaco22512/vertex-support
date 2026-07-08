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

/** HH:MM in the device timezone (message clock, matches the chat, §6.2). */
export function clock(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return '';
  }
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Date-separator label: Today / Yesterday / else a locale date (English admin UI). */
export function dayLabel(iso: string, nowMs: number): string {
  const d = new Date(iso);
  const now = new Date(nowMs);
  const diff = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86_400_000,
  );
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  try {
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
  } catch {
    return iso.slice(0, 10);
  }
}

/** True when `iso` starts a new local day vs `prevIso` (or prevIso is null). */
export function startsNewDay(iso: string, prevIso: string | null): boolean {
  if (!prevIso) return true;
  return localDayKey(new Date(iso)) !== localDayKey(new Date(prevIso));
}
