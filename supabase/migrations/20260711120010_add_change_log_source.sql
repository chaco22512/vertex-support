-- Record how a knowledge change was made (spec v1.7 §7.4). CSV imports set
-- 'csv_import'; existing/admin edits default to 'admin_edit'. Additive.
alter table kb_change_log
  add column if not exists source text not null default 'admin_edit';
