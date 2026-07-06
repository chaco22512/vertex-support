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
 * Map an import record to a kb_rules row (build_spec_v1_4.md §3 "初期データ投入").
 * - needs_review === true  → status 'pending_review' (the 42 excluded from the AI prompt)
 * - otherwise              → status 'active'
 * - empty date_updated ''  → null (column type is `date`)
 * The `needs_review` field is not a column and is dropped.
 */
export function toKbRuleRow(raw: RawKbRule): KbRuleInsert {
  return {
    id: raw.id,
    category: raw.category,
    subcategory: raw.subcategory ?? '',
    rule_text: raw.rule_text,
    date_updated: raw.date_updated ? raw.date_updated : null,
    fee_amounts_jpy: raw.fee_amounts_jpy ?? [],
    links: raw.links ?? [],
    audience: raw.audience,
    ai_can_answer: raw.ai_can_answer,
    requires_fee_disclaimer: raw.requires_fee_disclaimer,
    status: raw.needs_review ? 'pending_review' : 'active',
    review_reason: raw.review_reason ?? '',
  };
}
