-- Mark rules whose fees are statutory/booklet-fixed so the AI can quote them
-- WITHOUT the "final amount confirmed by staff" disclaimer (spec §4.2, v1.6 Phase 5).
-- Additive and non-destructive: defaults false, so every existing rule keeps the
-- disclaimer until explicitly marked fixed.
alter table kb_rules
  add column if not exists fee_is_fixed boolean not null default false;
