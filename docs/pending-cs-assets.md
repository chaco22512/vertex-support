# Pending CS assets (awaiting content from the CS team)

Items the CS team still needs to provide before the related knowledge / UX can be
finalized. Tracked here so nothing is silently dropped (spec v1.6 Phase 5-4).

| # | Item | Why it's needed | Blocks / related |
|---|------|-----------------|------------------|
| 1 | **SIM Point YouTube channel link** | Payment/setup tutorial links currently point to the old **VDM** channel — a rebrand leak that is customer-visible. Replace with the SIM Point channel. | Rule **F024** (internal, pending_review) notes this; keep it internal until the link is supplied. |
| 2 | **Poster image URL(s)** | A static poster alternative to the video tutorials, for customers on weak connections (CS request). | Complements item 1. |
| 3 | **Pocket Wi-Fi device photos (per model)** | To let the lost/replacement flow identify which device the customer has. | Lost SIM / device topic; helps the intake "device model" field. |
| 4 | **Free-replacement conditions table** | Currently only exists as an image; needs transcription into text rules so the AI can answer which conditions apply to SIM vs pocket Wi-Fi. | Rule **F039** (pending_review) is a placeholder for this. |
| 6 | **Holiday Plans — knowledge (Q&A)** (2026-11-06) | CS asked for a "Holiday Plans" tile. There is no knowledge for it yet, so a tile now would hand every question to staff. **On hold until CS sends the Q&A** (as a CSV with Rule IDs; a new topic code will be added then). | New tile + topic code. |
| 7 | **Discounts and Promo — knowledge (Q&A) + agreed boundary** (2026-11-06) | CS asked for a "Discounts and Promo" tile. **Boundary to agree with CS before writing the Q&A:** the AI may answer a campaign's **conditions, who is eligible, and how to apply**; the **discount amount itself is never stated by the AI** (spec §4.2, Hard rule 2) and goes to staff. Please write the Q&A on that basis. **On hold until the Q&A arrives.** | New tile + topic code. |
| 8 | **GN001 — "signal is stopped when payment is 2–5 days late"** (2026-11-06) | Needed on every tile where customers report a stopped signal (connection, payment, lost/re-issue). Today it exists only as **PY007** (payment tile). Please add the same explanation as **GN001** (General, used on every tile) in your next CSV. Keep PY007 as it is. Do not ask us to add it in the database directly — a later Replace all would archive anything that is not in your sheet. | Until then, the connection and lost tiles reach PY007 only through the full-manual search. |
| 5 | **Cheapest plan name & price** | The Plans FAQ has `[insert cheapest plan name/price]` unfilled — a public-facing blocker. | Rule **F070** is quarantined in pending_review (placeholder guard) until filled. Note: monthly plan totals remain AI-forbidden; this value is for the FAQ/staff wording, not for the AI to quote as a monthly price. |

## How to clear an item
1. Get the asset/URL/text from CS.
2. For F024 / F039 / F070: edit the rule in **Admin → Knowledge** (or the source
   import file), fill in the content, and approve it out of the Review queue.
3. For images/links used in tutorials or email: host them and update the
   referencing rule/template.
