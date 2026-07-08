import type { UiStrings } from '../i18n';
import type { ChatMessage, SubmittedContact } from '../state/flow';

/** HH:MM in the device timezone/locale via Intl (no date library, §6.2). */
export function clock(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return '';
  }
}

/** Stable local-day key for grouping (year-month-day in the device timezone). */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Whole local-day difference: 0 today, 1 yesterday, … */
function dayDiff(iso: string, nowMs: number): number {
  const d = new Date(iso);
  const now = new Date(nowMs);
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Date-separator label: Today / Yesterday (localized) / else a locale date (§6.2). */
export function dayLabel(
  iso: string,
  nowMs: number,
  locale: string,
  today: string,
  yesterday: string,
): string {
  const diff = dayDiff(iso, nowMs);
  if (diff <= 0) return today;
  if (diff === 1) return yesterday;
  try {
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export type FeedItem = { kind: 'sep'; label: string; key: string } | { kind: 'msg'; message: ChatMessage };

/** Interleave date-separator chips before the first message of each local day. */
export function withSeparators(
  messages: ChatMessage[],
  nowMs: number,
  locale: string,
  today: string,
  yesterday: string,
): FeedItem[] {
  const out: FeedItem[] = [];
  let lastKey: string | null = null;
  for (const m of messages) {
    if (m.at) {
      const key = localDayKey(new Date(m.at));
      if (key !== lastKey) {
        out.push({ kind: 'sep', label: dayLabel(m.at, nowMs, locale, today, yesterday), key: `sep-${key}` });
        lastKey = key;
      }
    }
    out.push({ kind: 'msg', message: m });
  }
  return out;
}

export interface SuccessLines {
  title: string;
  within24: string;
  contactNote?: string;
}

/** Localized lines for the escalation success card (§6.2). Email vs WhatsApp via
 *  the same @-detection used on submit; the name (if any) is woven into the title. */
export function successCardLines(ui: UiStrings, contact: SubmittedContact): SuccessLines {
  const name = contact.name?.trim();
  const title = name ? ui.sentTitleNamed.replace('{name}', name) : ui.sentTitle;
  let contactNote: string | undefined;
  if (contact.email) contactNote = ui.sentEmailNote.replace('{contact}', contact.email);
  else if (contact.whatsapp) contactNote = ui.sentWhatsappNote.replace('{contact}', contact.whatsapp);
  return { title, within24: ui.sentWithin24, contactNote };
}
