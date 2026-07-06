-- Vertex Support Bot — initial schema (build_spec_v1_4.md §3)
-- Faithful to the spec. No triggers added (not in spec); updated_at is set by the API.

-- enums
create type audience_t as enum ('customer','internal');
create type rule_status_t as enum ('active','pending_review','disabled');
create type channel_t as enum ('webchat','whatsapp','line','messenger');
create type conv_status_t as enum ('ai_handling','escalated','staff_replied','resolved','closed');
create type sender_t as enum ('customer','ai','staff','system');
create type role_t as enum ('admin','staff');

create table kb_rules (
  id            text primary key,          -- 'R001' form. Keep imported IDs.
  category      text not null,
  subcategory   text default '',
  rule_text     text not null,
  date_updated  date,
  fee_amounts_jpy integer[] default '{}',
  links         text[] default '{}',
  audience      audience_t not null,
  ai_can_answer boolean not null,
  requires_fee_disclaimer boolean not null default false,
  status        rule_status_t not null default 'active',
  review_reason text default '',
  updated_by    uuid references auth.users(id),
  updated_at    timestamptz not null default now()
);

create table kb_change_log (
  id serial primary key,
  rule_id text not null references kb_rules(id),
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now(),
  before jsonb not null,
  after  jsonb not null
);

create table staff (
  id uuid primary key references auth.users(id),
  name text not null,
  email text not null,
  role role_t not null default 'staff',
  languages text[] not null default '{en}',   -- 'en','id','tl','ne','vi'
  channels channel_t[] not null default '{webchat}',
  slack_member_id text default '',
  is_active boolean not null default true
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  channel channel_t not null default 'webchat',
  session_token text unique not null,
  language text not null default 'en',
  status conv_status_t not null default 'ai_handling',
  source_tag text default '',
  topic_category text default '',             -- selected menu category id (menu_categories.json)
  contact_email text default '',
  contact_whatsapp text default '',
  assigned_staff uuid references staff(id),
  escalated_at timestamptz,
  reply_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table messages (
  id serial primary key,
  conversation_id uuid not null references conversations(id),
  sender sender_t not null,
  staff_id uuid references staff(id),
  body text not null,
  ai_meta jsonb,   -- AI reply: {escalate, reason, rule_ids, model}
  created_at timestamptz not null default now()
);

create table reply_drafts (   -- admin reply draft autosave
  conversation_id uuid primary key references conversations(id),
  staff_id uuid not null references staff(id),
  body text not null default '',
  updated_at timestamptz not null default now()
);
