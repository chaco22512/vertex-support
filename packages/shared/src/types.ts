/**
 * Domain types mirroring the Supabase schema in build_spec_v1_4.md §3.
 * The actual tables/enums are created as migrations in M1; these TS types are the
 * shared contract used by the API, scripts, and (row shapes) the front-ends.
 */

// --- enums (§3) ---
export type Audience = 'customer' | 'internal';
export type RuleStatus = 'active' | 'pending_review' | 'disabled';
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
  | 'other';

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
  assigned_staff: string | null;
  escalated_at: string | null;
  reply_due_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Persisted on AI messages (spec §4.2 / §4.3). */
export interface AiMeta {
  escalate: boolean;
  reason: EscalationReason;
  rule_ids: string[];
  model: string;
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
