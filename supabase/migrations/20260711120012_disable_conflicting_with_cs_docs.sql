-- Disable existing rules that contradict the CS AI-docs manual's contract-group
-- model (spec v1.7 CS-docs update, Phase 1). The C-series (2024/12/11 boundary) is
-- authoritative. Reversible: status change only.
--   R276, P615 — state the SIM deposit as a flat "¥800" (would quote it to a
--                PREVIOUS customer, who must never be told an amount).
--   R067, P125 — state SIM/device return on cancellation generally (C-series:
--                return only for a CURRENT cancellation notified under 1 month).
-- Kept (different system / plan-specific, not the SIM ¥800 group): R277/P616
--   (pocket-wifi ¥3000 bank transfer), P1656/P1694/P1910 (long-term ¥2000).
update kb_rules
set status = 'disabled',
    review_reason = 'disabled v1.7: superseded by CS AI docs (contract-group model)'
where id in ('R276', 'P615', 'R067', 'P125');
