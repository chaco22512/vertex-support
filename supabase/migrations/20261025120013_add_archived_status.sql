-- spec v1.8 §7.4.2 (Phase 3): 'archived' = a rule set aside by "Replace all"
-- (not in the uploaded sheet). Kept in the table and restorable; never in the
-- AI prompt (fetchScopedRules only reads status='active'). Additive only.
-- Kept in its own migration: a new enum value cannot be used in the same
-- transaction that adds it.
alter type rule_status_t add value if not exists 'archived';
