-- 2026-11-07 CS feedback (additive only — no column/table is dropped or rewritten).
--
-- 1. ai_call_log.purpose: what each Gemini call was for, so the admin can see
--    calls per customer question ('reply' | 'reply_retry' | 'fallback' |
--    'translate' | 'draft' | 'safety_test' | 'try_it'). Older rows: ''.
-- 2. messages.translation_en: the staff-side English translation of a customer
--    message, saved once so re-opening a conversation never calls the AI again.
-- 3. kb_topic_codes: CS-added links between a Rule ID topic code (e.g. ESP) and
--    the chat tiles whose AI range uses it (admin "Topic codes" screen). The
--    built-in links stay in data/menu_categories.json; this only adds to them.

alter table ai_call_log add column if not exists purpose text not null default '';

alter table messages add column if not exists translation_en text;

create table if not exists kb_topic_codes (
  code text primary key check (code ~ '^[A-Z]{2,4}$'),
  label text not null default '',
  -- Tile ids from data/menu_categories.json (e.g. 'plans', 'lost').
  topics text[] not null default '{}',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- Only the service role (the API) reads or writes it.
alter table kb_topic_codes enable row level security;
