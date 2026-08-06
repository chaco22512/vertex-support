import type { Audience, RuleStatus } from '@vertex/shared';

/** Shape of each object in data/kb_rules_import.json. */
export interface RawKbRule {
  id: string;
  category: string;
  subcategory: string;
  rule_text: string;
  date_updated: string;
  fee_amounts_jpy: number[];
  links: string[];
  audience: Audience;
  ai_can_answer: boolean;
  requires_fee_disclaimer: boolean;
  needs_review: boolean;
  review_reason: string;
}

/** Row inserted into kb_rules (updated_by / updated_at use DB defaults). */
export interface KbRuleInsert {
  id: string;
  category: string;
  subcategory: string;
  rule_text: string;
  date_updated: string | null;
  fee_amounts_jpy: number[];
  links: string[];
  audience: Audience;
  ai_can_answer: boolean;
  requires_fee_disclaimer: boolean;
  status: RuleStatus;
  review_reason: string;
}

/**
 * Normalize a legacy date string to an ISO `YYYY-MM-DD` the Postgres `date`
 * column accepts, or null if not a real date.
 *
 * The source data mixes two formats: most rows are `YYYY-MM-DD`, but 32 rows are
 * `YYYY-DD-MM` (their middle field is > 12, so it can only be a day). We detect
 * that unambiguous case and swap day/month; anything that still isn't a valid
 * calendar date becomes null. date_updated is non-critical display metadata.
 */
export function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  const parts = raw.split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  let mo = Number(parts[1]);
  let da = Number(parts[2]);
  if (![y, mo, da].every((n) => Number.isInteger(n))) return null;
  if (mo > 12 && da <= 12) [mo, da] = [da, mo]; // provably YYYY-DD-MM → swap
  const dt = new Date(Date.UTC(y, mo - 1, da));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== da) {
    return null; // e.g. Feb 30, or still-invalid month/day
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(mo)}-${pad(da)}`;
}

/**
 * Unfilled-placeholder detector (build_spec_v1_6.md §3, ★v1.6). A rule whose
 * text still contains an authoring placeholder (`[insert …]`, `[TBD]`, `[TODO]`,
 * or a run of `xxx`) must never go live: it is a public-facing blocker. Matches
 * are case-insensitive; `xxx` requires a word boundary so it doesn't fire inside
 * ordinary words.
 */
const PLACEHOLDER_RE = /\[\s*insert|\[\s*tbd|\[\s*todo|\bx{3,}\b/i;

export function hasUnfilledPlaceholder(text: string): boolean {
  return PLACEHOLDER_RE.test(text);
}

const PLACEHOLDER_REASON = 'contains an unfilled placeholder — fill in before approving';

/**
 * Map an import record to a kb_rules row (build_spec_v1_6.md §3 "初期データ投入").
 * - needs_review === true, OR an unfilled placeholder in rule_text → status
 *   'pending_review' (excluded from the AI prompt until a human clears it)
 * - otherwise → status 'active'
 * - date_updated normalized via normalizeDate (empty/invalid → null)
 * The `needs_review` field is not a column and is dropped.
 */
export function toKbRuleRow(raw: RawKbRule): KbRuleInsert {
  const placeholder = hasUnfilledPlaceholder(raw.rule_text);
  const baseReason = raw.review_reason ?? '';
  const review_reason =
    placeholder && !baseReason.includes(PLACEHOLDER_REASON)
      ? baseReason
        ? `${baseReason}; ${PLACEHOLDER_REASON}`
        : PLACEHOLDER_REASON
      : baseReason;
  return {
    id: raw.id,
    category: raw.category,
    subcategory: raw.subcategory ?? '',
    rule_text: raw.rule_text,
    date_updated: normalizeDate(raw.date_updated),
    fee_amounts_jpy: raw.fee_amounts_jpy ?? [],
    links: raw.links ?? [],
    audience: raw.audience,
    ai_can_answer: raw.ai_can_answer,
    requires_fee_disclaimer: raw.requires_fee_disclaimer,
    status: raw.needs_review || placeholder ? 'pending_review' : 'active',
    review_reason,
  };
}
