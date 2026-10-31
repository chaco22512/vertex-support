-- spec v1.8 §7.1: one row per Gemini call made by the bot, so the admin can see
-- "AI requests used today / left" without anyone's Google login. Counts only —
-- no prompt or customer text is stored. Additive only.

create table if not exists ai_call_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  model text not null default '',
  -- 'ok' | 'error' | 'rate_limited' (temporary cap) | 'daily_limit' (daily cap reached)
  outcome text not null
);

create index if not exists ai_call_log_at on ai_call_log (at desc);

-- Only the service role (the API) reads or writes it.
alter table ai_call_log enable row level security;
