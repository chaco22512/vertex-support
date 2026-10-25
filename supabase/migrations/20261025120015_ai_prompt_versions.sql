-- spec v1.8 §4.2.1 / §7.8 (Phase 2): CS-editable AI behaviour, versioned.
-- Each save creates a new immutable version row; at most one is 'published'.
-- Only layers ② (common behaviour) and ③ (per-topic guidance) live here — the
-- ① safety rules stay in code and cannot be edited. Additive only.

create table if not exists ai_prompt_versions (
  id serial primary key,
  -- 'draft' | 'published' | 'superseded'
  state text not null default 'draft' check (state in ('draft', 'published', 'superseded')),
  common_behaviour text not null default '',
  -- { "<menu topic id>": "<guidance text>", ... }
  topic_instructions jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  published_by uuid references auth.users(id),
  published_at timestamptz,
  -- Result of the last pre-publish safety test run on this version.
  safety_report jsonb,
  note text not null default '',
  -- The version this one was edited from / restored from.
  based_on integer references ai_prompt_versions(id)
);

-- At most one published version.
create unique index if not exists ai_prompt_versions_one_published
  on ai_prompt_versions (state) where state = 'published';

create table if not exists ai_prompt_change_log (
  id serial primary key,
  version_id integer references ai_prompt_versions(id),
  -- 'save_draft' | 'publish' | 'publish_blocked' | 'restore'
  action text not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb
);

create index if not exists ai_prompt_change_log_recent on ai_prompt_change_log (changed_at desc);

-- Only the service role (the API) reads or writes these.
alter table ai_prompt_versions enable row level security;
alter table ai_prompt_change_log enable row level security;
