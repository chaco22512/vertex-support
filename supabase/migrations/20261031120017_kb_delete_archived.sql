-- spec v1.8 §7.4.2 (owner decision 2026-10-31): permanently delete ARCHIVED
-- rules only, keeping their change history and a restorable backup.
--
-- Schema change (no data is removed by this migration):
--   kb_change_log.rule_id no longer references kb_rules(id). The column and
--   every history row stay; the link is kept as the Rule ID text, so the
--   history of a deleted rule (including who deleted it) remains readable.

do $$
declare
  v_name text;
begin
  select conname into v_name
  from pg_constraint
  where conrelid = 'kb_change_log'::regclass
    and contype = 'f'
    and confrelid = 'kb_rules'::regclass;
  if v_name is not null then
    execute format('alter table kb_change_log drop constraint %I', v_name);
  end if;
end;
$$;

-- Delete every archived rule in one transaction: backup first, a history row
-- per deleted rule, then the delete. Refuses if the count differs from what
-- the admin confirmed on screen.
create or replace function kb_delete_archived(
  p_staff uuid,
  p_expected integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids text[];
  v_snapshot uuid;
  v_deleted integer;
begin
  v_ids := array(select id from kb_rules where status = 'archived' order by id);
  if coalesce(array_length(v_ids, 1), 0) <> p_expected then
    raise exception 'count_mismatch';
  end if;
  if p_expected = 0 then
    return jsonb_build_object('snapshot_id', null, 'deleted', 0);
  end if;

  v_snapshot := kb_take_snapshot('delete_archived', p_staff, v_ids, format('Deleted %s archived rules', p_expected));

  insert into kb_change_log (rule_id, changed_by, before, after, source)
  select r.id, p_staff, to_jsonb(r), jsonb_build_object('deleted', true), 'delete_archived'
  from kb_rules r
  where r.id = any(v_ids);

  delete from kb_rules where id = any(v_ids);
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('snapshot_id', v_snapshot, 'deleted', v_deleted);
end;
$$;

-- Restore now also RE-CREATES rules that were deleted after the snapshot
-- (within scope), so "Undo" / "Restore everything" bring deleted rules back.
create or replace function kb_restore_snapshot(
  p_snapshot uuid,
  p_staff uuid,
  p_only_affected boolean
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_affected text[];
  v_n integer := 0;
  v_recreated integer := 0;
  v_extra integer := 0;
begin
  select rows, affected_ids into v_rows, v_affected from kb_rule_snapshots where id = p_snapshot;
  if v_rows is null then
    raise exception 'snapshot_not_found';
  end if;

  -- 1. Rules deleted since the snapshot: put them back as they were.
  with snap as (
    select * from jsonb_populate_recordset(null::kb_rules, v_rows)
  ),
  missing as (
    select s.* from snap s
    where (not p_only_affected or s.id = any(v_affected))
      and not exists (select 1 from kb_rules r where r.id = s.id)
  ),
  ins as (
    insert into kb_rules
    select * from missing
    returning *
  )
  insert into kb_change_log (rule_id, changed_by, before, after, source)
  select ins.id, p_staff, jsonb_build_object('deleted', true), to_jsonb(ins), 'snapshot_restore' from ins;
  get diagnostics v_recreated = row_count;

  -- 2. Rules that changed since the snapshot: restore their values.
  with snap as (
    select * from jsonb_populate_recordset(null::kb_rules, v_rows)
  ),
  target as (
    select s.* from snap s where not p_only_affected or s.id = any(v_affected)
  ),
  changed as (
    select t.*, to_jsonb(r) as before_row
    from target t join kb_rules r on r.id = t.id
    where (r.rule_text, r.fee_amounts_jpy, r.fee_is_fixed, r.links, r.audience, r.ai_can_answer,
           r.status, r.review_reason, r.category, r.subcategory, r.requires_fee_disclaimer)
      is distinct from
          (t.rule_text, t.fee_amounts_jpy, t.fee_is_fixed, t.links, t.audience, t.ai_can_answer,
           t.status, t.review_reason, t.category, t.subcategory, t.requires_fee_disclaimer)
  ),
  upd as (
    update kb_rules r set
      rule_text = c.rule_text,
      fee_amounts_jpy = c.fee_amounts_jpy,
      fee_is_fixed = c.fee_is_fixed,
      links = c.links,
      audience = c.audience,
      ai_can_answer = c.ai_can_answer,
      status = c.status,
      review_reason = c.review_reason,
      category = c.category,
      subcategory = c.subcategory,
      requires_fee_disclaimer = c.requires_fee_disclaimer,
      updated_by = p_staff,
      updated_at = now()
    from changed c
    where r.id = c.id
    returning r.id, c.before_row, to_jsonb(r) as after_row
  )
  insert into kb_change_log (rule_id, changed_by, before, after, source)
  select id, p_staff, before_row, after_row, 'snapshot_restore' from upd;
  get diagnostics v_n = row_count;

  -- 3. Rules added after the snapshot (within scope) are set aside, never deleted.
  with extra as (
    select r.id, r.status::text as old_status
    from kb_rules r
    where r.status <> 'archived'
      and not exists (select 1 from jsonb_array_elements(v_rows) e where e ->> 'id' = r.id)
      and (not p_only_affected or r.id = any(v_affected))
  ),
  upd2 as (
    update kb_rules r set status = 'archived', updated_by = p_staff, updated_at = now()
    from extra x where r.id = x.id
    returning r.id, x.old_status
  )
  insert into kb_change_log (rule_id, changed_by, before, after, source)
  select id, p_staff, jsonb_build_object('status', old_status), jsonb_build_object('status', 'archived'),
         'snapshot_restore'
  from upd2;
  get diagnostics v_extra = row_count;

  if p_only_affected then
    update kb_rule_snapshots set undone = true where id = p_snapshot;
  end if;
  return v_recreated + v_n + v_extra;
end;
$$;

revoke all on function kb_delete_archived(uuid, integer) from public, anon, authenticated;
grant execute on function kb_delete_archived(uuid, integer) to service_role;
revoke all on function kb_restore_snapshot(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function kb_restore_snapshot(uuid, uuid, boolean) to service_role;
