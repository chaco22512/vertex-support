-- Pre-escalation "intake" details captured on the situation card (spec §6.2, v1.6 Phase 3).
-- Additive and non-destructive: a jsonb column defaulting to an empty object, so
-- existing rows and inserts that omit it keep working.
alter table conversations
  add column if not exists intake_info jsonb not null default '{}'::jsonb;
