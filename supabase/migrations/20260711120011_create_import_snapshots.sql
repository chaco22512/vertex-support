-- Pre-apply snapshots for CSV knowledge imports so an import can be undone
-- (spec v1.7 §7.4, "Undo import"). `rows` holds the affected rules' full state
-- before the import; undo restores them and marks the snapshot undone.
create table if not exists kb_import_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  rows jsonb not null,
  applied_count integer not null default 0,
  undone boolean not null default false
);

create index if not exists kb_import_snapshots_recent
  on kb_import_snapshots (created_at desc);
