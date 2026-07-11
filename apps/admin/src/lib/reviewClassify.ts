import type { KbRule } from '@vertex/shared';

export type ReasonTab = 'A' | 'B' | 'C' | 'D';

export interface TabMeta {
  id: ReasonTab;
  label: string;
}

// Review-queue tabs (spec v1.5 §7.5). The per-plan manual (P-series) added two
// new review_reason kinds, so the queue now has four tabs:
//   A — strikethrough removal        (confirm current wording)
//   B — internal auto-classification (staff-ops keyword; Split available)
//   C — price exposure               (contains COD / discount amounts — §4.2)
//   D — "don't use yet" sheet        (retired source sheet; usually Disable)
export const REVIEW_TABS: TabMeta[] = [
  { id: 'A', label: 'A · Strikethrough removal' },
  { id: 'B', label: 'B · Internal classification' },
  { id: 'C', label: 'C · Price exposure (COD/discount)' },
  { id: 'D', label: 'D · "Don\'t use yet" sheet' },
];

/**
 * Classify by the PRIMARY (first) segment of review_reason — the reasons are
 * seeded as `"<primary> ; <secondary>"`, and the primary tag is the clean
 * partition (e.g. an internal rule that also mentions COD stays under B, its
 * auto-classification concern, rather than jumping to C). Keying off the first
 * segment keeps the buckets deterministic and disjoint. Never key off audience:
 * a strikethrough fix (A) can sit on an internal-audience rule (regression R257).
 */
export function classify(rule: Pick<KbRule, 'review_reason'>): ReasonTab {
  const primary = (rule.review_reason ?? '').toLowerCase().split(';')[0] ?? '';
  if (primary.includes('strikethrough')) return 'A';
  if (primary.includes('dont use yet') || primary.includes("don't use")) return 'D';
  if (primary.includes('cod') || primary.includes('discount')) return 'C';
  if (primary.includes('internal')) return 'B';
  return 'A'; // unknown reason → generic review under A
}
