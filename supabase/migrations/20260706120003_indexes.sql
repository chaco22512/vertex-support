-- Practical indexes for Inbox ordering (§7.2) and AI prompt scoping (§4.1).
-- Not in the spec's DDL, but non-controversial performance support.

-- Inbox default view: status=escalated ordered by reply_due_at asc (§7.2)
create index idx_conversations_status_due on conversations (status, reply_due_at);
create index idx_conversations_assigned on conversations (assigned_staff);

-- Message history lookups per conversation (§4.1 last-20, §7.3 full thread)
create index idx_messages_conversation on messages (conversation_id, created_at);

-- Prompt scoping: active customer rules by category (§4.1)
create index idx_kb_rules_category on kb_rules (category);
create index idx_kb_rules_status_audience on kb_rules (status, audience);

-- Change history listing by rule / time (§7.7)
create index idx_kb_change_log_rule on kb_change_log (rule_id, changed_at);
