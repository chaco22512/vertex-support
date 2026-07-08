-- Add an optional customer display name captured on the escalation card.
-- Additive and non-destructive: nullable-by-default via an empty-string default,
-- so existing rows and inserts that omit it keep working.
alter table conversations
  add column if not exists customer_name text not null default '';
