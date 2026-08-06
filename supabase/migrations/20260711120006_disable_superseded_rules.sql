-- Disable rules the CS team confirmed give wrong answers (spec v1.6 Phase 4-2).
-- Superseded by the CS-feedback manual (F-series): F013/F014 (payment methods),
-- F038 ("your old SIM card or device", not "your old plan").
-- Non-destructive and reversible: status change only (rows are kept), so they can
-- be re-enabled from the admin Knowledge page if ever needed.
--
--   Bank-transfer-as-monthly (reads as still possible; Yucho retired 2023-12):
--     R034, R035        → superseded by F013 (SmartPit/Stripe/GMO only) + F014
--   "OLD PLAN must be returned … within 7 days" (wrong wording):
--     R082, R525, P013, P190, P986  → superseded by F038
update kb_rules
set status = 'disabled',
    review_reason = 'disabled v1.6 Phase 4: superseded by CS-feedback (F-series)'
where id in ('R034', 'R035', 'R082', 'R525', 'P013', 'P190', 'P986');
