/**
 * Domain types mirroring the Supabase schema in build_spec_v1_4.md §3.
 * The actual tables/enums are created as migrations in M1; these TS types are the
 * shared contract used by the API, scripts, and (row shapes) the front-ends.
 */

// --- enums (§3) ---
export type Audience = 'customer' | 'internal';
/** ★v1.8: 'archived' = set aside by Replace all (kept, restorable, never in the AI prompt). */
export type RuleStatus = 'active' | 'pending_review' | 'disabled' | 'archived';
export type Channel = 'webchat' | 'whatsapp' | 'line' | 'messenger';
export type ConvStatus = 'ai_handling' | 'escalated' | 'staff_replied' | 'resolved' | 'closed';
export type Sender = 'customer' | 'ai' | 'staff' | 'system';
export type Role = 'admin' | 'staff';

/** Supported UI / AI languages (spec §1). */
export type LanguageCode = 'en' | 'id' | 'tl' | 'ne' | 'vi';

/** Escalation reasons emitted by the AI pipeline (spec §4.2). */
export type EscalationReason =
  | 'none'
  | 'price_question'
  | 'not_in_manual'
  | 'account_specific'
  | 'complaint'
  | 'other'
  /** ★v1.8: the customer is chasing / adding info to a case already with staff. */
  | 'pending_case';

/** AI turn outcome (spec §4.2, ★v1.6 diagnostic flow). */
export type AiAction = 'answer' | 'ask' | 'escalate';

/** A one-question clarifier the AI asks before answering (action='ask'). */
export interface FollowUp {
  question: string;
  options: string[];
}

/**
 * Optional situation details collected on the pre-escalation "intake" card
 * (spec §6.2, ★v1.6 Phase 3). Every field is optional/skippable; only filled
 * fields are stored. Surfaced in the Slack notice and the admin detail header.
 */
export interface IntakeInfo {
  customer_number?: string;
  smartpit?: string;
  registered_phone?: string;
  sim_iccid?: string;
  device_model?: string;
  tried_already?: string;
  gmo?: string;
}

// --- table rows (§3) ---
export interface KbRule {
  id: string; // 'R001' form
  category: string;
  subcategory: string;
  rule_text: string;
  date_updated: string | null;
  fee_amounts_jpy: number[];
  links: string[];
  audience: Audience;
  ai_can_answer: boolean;
  requires_fee_disclaimer: boolean;
  /**
   * True when the rule's fees are statutory/booklet-fixed amounts (late fee,
   * re-issue, cancellation) that do NOT need the "final amount confirmed by
   * staff" disclaimer (spec §4.2, ★v1.6 Phase 5). Variable amounts stay false.
   */
  fee_is_fixed: boolean;
  status: RuleStatus;
  review_reason: string;
  updated_by: string | null;
  updated_at: string;
}

export interface KbChangeLog {
  id: number;
  rule_id: string;
  changed_by: string;
  changed_at: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface Staff {
  id: string;
  name: string;
  email: string;
  role: Role;
  languages: LanguageCode[];
  channels: Channel[];
  slack_member_id: string;
  is_active: boolean;
}

export interface Conversation {
  id: string;
  channel: Channel;
  session_token: string;
  language: LanguageCode;
  status: ConvStatus;
  source_tag: string;
  topic_category: string;
  contact_email: string;
  contact_whatsapp: string;
  /** Pre-escalation intake details (★v1.6 Phase 3); '{}' when none collected. */
  intake_info: IntakeInfo;
  assigned_staff: string | null;
  escalated_at: string | null;
  reply_due_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Persisted on AI messages (spec §4.2 / §4.3). */
export interface AiMeta {
  /** The turn outcome (★v1.6). `escalate` is kept as a derived convenience. */
  action: AiAction;
  /** Derived: action === 'escalate'. Retained for existing consumers. */
  escalate: boolean;
  reason: EscalationReason;
  rule_ids: string[];
  /** Present only when action === 'ask' (the clarifier + its options). */
  follow_up: FollowUp | null;
  model: string;
  /** ★v1.8: menu topic id the model assigned to the customer's latest question. */
  topic?: string | null;
  /** ★v1.8: escalation / fallback diagnostics (spec §4.1.1). */
  diag?: AiDiag;
}

/** Outcome of the keyword-retrieval retry before a not_in_manual escalation (★v1.8). */
export type FallbackResult =
  | 'answered'
  | 'not_found'
  | 'policy_escalation'
  | 'no_candidates'
  | 'rate_limited'
  | 'timeout'
  | 'skipped_no_time'
  | 'scope_was_all'
  | 'error';

/** Why an AI call failed (★v1.8). Recorded instead of a silent escalation. */
export type AiErrorKind =
  | 'rate_limited'
  | 'timeout'
  | 'llm_error'
  | 'parse_failed'
  | 'rule_fetch_failed'
  /** ★v1.8 Phase 3: no active customer rules at all — escalated without calling the model. */
  | 'no_active_rules';

/**
 * Per-turn AI diagnostics (spec v1.8 §4.1.1 / §7.9). Recorded on every
 * escalation and on every turn that ran the retrieval fallback, so admins can
 * see why the bot escalated and validate the top-K threshold.
 */
export interface AiDiag {
  /** Conversation topic the turn was scoped to ('' = none). */
  topic: string;
  /** Topic the model assigned to the latest question (null when absent). */
  topic_guess: string | null;
  /** Rules in the scoped prompt. */
  scoped_rule_count: number;
  /** Reason of the first (scoped) attempt. */
  primary_reason: EscalationReason | null;
  fallback_tried: boolean;
  fallback_result: FallbackResult | null;
  /** Candidates handed to the fallback attempt (≤ top-K). */
  candidate_count: number;
  /** Candidate rule ids in rank order (rank 1 first). */
  candidate_ids: string[];
  /** Scores of the top 10 candidates, rank order. */
  top_scores: number[];
  /** Query terms used for retrieval. */
  keywords: string[];
  error: AiErrorKind | null;
  timings: { primary_ms: number | null; retrieve_ms: number | null; fallback_ms: number | null; total_ms: number };
}

export interface Message {
  id: number;
  conversation_id: string;
  sender: Sender;
  staff_id: string | null;
  body: string;
  ai_meta: AiMeta | null;
  created_at: string;
}

export interface ReplyDraft {
  conversation_id: string;
  staff_id: string;
  body: string;
  updated_at: string;
}
