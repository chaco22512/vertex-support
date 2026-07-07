import type { KbRule } from '@vertex/shared';

export type ReasonTab = 'A' | 'B';

// Tab A: confirm strikethrough removal. Tab B: confirm internal auto-classification.
// Classify strictly by what the review is ABOUT (review_reason), not by audience:
// a strikethrough fix (A) can still sit on an internal-audience rule (e.g. R257),
// so keying off audience misfiled it into B. Check strikethrough first.
export function classify(rule: Pick<KbRule, 'review_reason'>): ReasonTab {
  const reason = (rule.review_reason ?? '').toLowerCase();
  if (reason.includes('strikethrough')) return 'A';
  if (reason.includes('auto-tagged internal') || reason.includes('internal')) return 'B';
  return 'A'; // unknown reason → generic review under A
}
