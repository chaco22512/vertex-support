-- Fix R-series rules whose rule_text was a raw Google-Sheets formula (v1.6 data fix).
-- Read-only generator: review, then apply with apply_migration.ts. Reversible.
-- 41 rules cleaned to their cached value; 37 disabled (no clean cache).

update kb_rules set rule_text = 'SHORT TERM PLAN' where id = 'R343';
update kb_rules set rule_text = 'for arrival 12/11/2025 onward' where id = 'R344';
update kb_rules set rule_text = 'Requirements' where id = 'R350';
update kb_rules set rule_text = '1. ID (Residence Card or Passport)' where id = 'R351';
update kb_rules set rule_text = '2. Address' where id = 'R352';
update kb_rules set rule_text = '3. Email Address or any contact information (FB, LINE, Whatsapp)' where id = 'R353';
update kb_rules set rule_text = 'Shipping and Payment Method' where id = 'R354';
update kb_rules set rule_text = '⚠️Selling to Japanese national customer is prohibited by provider''s regulation . failure in following regulation can result in huge penalties' where id = 'R355';
update kb_rules set rule_text = 'Delivery within 2-3 days with Yamato; except for areas such as: Hiroshima, Hokkaido, Fukuoka, Fukui, Shizouka (3-4 days delivery)' where id = 'R356';
update kb_rules set rule_text = 'Monthly Payment: can choose from 3 payment methods (GMO, Stripe and Smartpit)' where id = 'R357';
update kb_rules set rule_text = 'Shipping Discounts' where id = 'R358';
update kb_rules set rule_text = 'Purchase Date Groups' where id = 'R364';
update kb_rules set rule_text = 'The customer’s purchase date determines the deadline for the first month:' where id = 'R365';
update kb_rules set rule_text = 'Monthly Period' where id = 'R370';
update kb_rules set rule_text = 'Each month’s period is from the previous month’s start (or first month start) to the current month’s deadline.' where id = 'R371';
update kb_rules set rule_text = 'Example: If purchase is Jan 5 (1–10 group), 1st month = Jan 1 – Feb 5, 2nd month = Feb 6 – Mar 5, and so on.' where id = 'R372';
update kb_rules set rule_text = 'SIM Usage and Features' where id = 'R373';
update kb_rules set rule_text = 'Rules' where id = 'R382';
update kb_rules set rule_text = 'Monthly usage and Payment Term for Extension: Click this link for more information Detailed Explanation : Short Term Plan' where id = 'R383';
update kb_rules set rule_text = 'Notice Deadline if customer want to extend : Customer must request an extension 3 weeks (21 days) before the month’s validity ending. Missing the extension request → must purchase as new plan.' where id = 'R388';
update kb_rules set rule_text = 'For Extended Plans' where id = 'R389';
update kb_rules set rule_text = 'Extension fee every month will be based on the regular monthly fee, see VDM price list for the updated price.' where id = 'R390';
update kb_rules set rule_text = 'Extension requests can be for 1 month, 2 months, 3 months, and so on.' where id = 'R391';
update kb_rules set rule_text = 'Payment for the extension can be monthly or paid all at once.' where id = 'R392';
update kb_rules set rule_text = '¥300 Fine for payment after deadline' where id = 'R393';
update kb_rules set rule_text = 'Late payment 5-7days after payment due date, signal will be stopped' where id = 'R394';
update kb_rules set rule_text = 'Late payment 7days after signal stopped, signal will be permanently disconnected/re-issue (reissue fee need to be paid)' where id = 'R395';
update kb_rules set rule_text = 'Reissue Fee(Not Applicable for this plan)' where id = 'R396';
update kb_rules set rule_text = 'Lost and Damaged SIM Card' where id = 'R397';
update kb_rules set rule_text = 'No lost fee will be charged, and no replacement will be provided. The customer may place a new order instead.' where id = 'R398';
update kb_rules set rule_text = 'Cancellation' where id = 'R399';
update kb_rules set rule_text = 'SIM cancels automatically at the end of the plan.' where id = 'R400';
update kb_rules set rule_text = 'No SIM return needed.' where id = 'R401';
update kb_rules set rule_text = 'No extension request = cancellation.' where id = 'R402';
update kb_rules set rule_text = 'Replacement' where id = 'R403';
update kb_rules set rule_text = 'PUK lock will be charged ¥3300, we will send new one (unless PUK locked upon receiving, its free)' where id = 'R404';
update kb_rules set rule_text = 'PUK PIN can be informed by request in ALL REQUEST (2-3 Working days is required)' where id = 'R405';
update kb_rules set rule_text = 'If there is signal problem within 7 days, we will offer free replacement?' where id = 'R406';
update kb_rules set rule_text = 'Change Plan (Not Applicable For this plan)' where id = 'R407';
update kb_rules set rule_text = 'SMS Charges (Domestic & International)' where id = 'R408';
update kb_rules set rule_text = 'Rates are for plans that support SMS transmission effective from July 1, 2025 - New Orders' where id = 'R409';

update kb_rules set status = 'disabled', review_reason = 'disabled v1.6: unprocessed spreadsheet formula, no clean cache value' where id in ('R345', 'R346', 'R347', 'R348', 'R349', 'R359', 'R360', 'R361', 'R362', 'R363', 'R366', 'R367', 'R368', 'R369', 'R374', 'R375', 'R376', 'R377', 'R378', 'R379', 'R380', 'R381', 'R384', 'R385', 'R386', 'R387', 'R410', 'R411', 'R412', 'R413', 'R414', 'R415', 'R416', 'R417', 'R418', 'R419', 'R420');
