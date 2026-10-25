-- spec v1.8 §7.4.2 (Phase 3): safe bulk knowledge operations.
-- Whole-knowledge snapshots taken before every bulk operation (latest 5 kept),
-- plus set-based functions so a bulk change is ONE request from the Worker
-- (per-rule updates would exceed the Workers subrequest limit). Nothing here
-- deletes a rule: bulk changes only switch status, and every change is logged
-- in kb_change_log. Additive only.

create table if not exists kb_rule_snapshots (
  id uuid primary key default gen_random_uuid(),
  -- 'replace_all' | 'disable_view' | 'restore'
  kind text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  rule_count integer not null default 0,
  -- Rules the operation touched (Undo restores only these).
  affected_ids text[] not null default '{}',
  -- Every rule's full row as it was just before the operation.
  rows jsonb not null,
  undone boolean not null default false,
  note text not null default ''
);

create index if not exists kb_rule_snapshots_recent on kb_rule_snapshots (created_at desc);

-- Only the service role (the API) reads or writes snapshots.
alter table kb_rule_snapshots enable row level security;

-- Snapshot every rule; keep the newest 5 snapshots (spec: at least 3).
-- Older SNAPSHOT rows are pruned — this is backup rotation, never rule data.
create or replace function kb_take_snapshot(
  p_kind text,
  p_staff uuid,
  p_affected text[],
  p_note text default ''
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into kb_rule_snapshots (kind, created_by, rule_count, affected_ids, rows, note)
  select p_kind, p_staff, count(*), coalesce(p_affected, '{}'),
         coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb), coalesce(p_note, '')
  from kb_rules r
  returning id into v_id;

  delete from kb_rule_snapshots
  where id in (select id from kb_rule_snapshots order by created_at desc offset 5);

  return v_id;
end;
$$;

-- Set one status on many rules at once; log each real change.
create or replace function kb_bulk_set_status(
  p_ids text[],
  p_status text,
  p_staff uuid,
  p_source text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  with target as (
    select id, status::text as old_status
    from kb_rules
    where id = any(p_ids) and status::text <> p_status
  ),
  upd as (
    update kb_rules r
    set status = p_status::rule_status_t, updated_by = p_staff, updated_at = now()
    from target t
    where r.id = t.id
    returning r.id, t.old_status
  )
  insert into kb_change_log (rule_id, changed_by, before, after, source)
  select id, p_staff, jsonb_build_object('status', old_status), jsonb_build_object('status', p_status), p_source
  from upd;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Apply CSV patches ([{id, patch:{rule_text?, fee_amounts_jpy?, fee_is_fixed?,
-- links?, audience?, ai_can_answer?, status?}}]) in one call; log before/after.
create or replace function kb_apply_patches(
  p_patches jsonb,
  p_staff uuid,
  p_source text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_patch jsonb;
  v_before jsonb;
  v_after jsonb;
  v_n integer := 0;
begin
  for v_item in select * from jsonb_array_elements(p_patches) loop
    v_patch := v_item -> 'patch';
    select to_jsonb(r) into v_before from kb_rules r where r.id = v_item ->> 'id';
    if v_before is null then
      continue;
    end if;
    update kb_rules r set
      rule_text = case when v_patch ? 'rule_text' then v_patch ->> 'rule_text' else r.rule_text end,
      fee_amounts_jpy = case when v_patch ? 'fee_amounts_jpy'
        then array(select jsonb_array_elements_text(v_patch -> 'fee_amounts_jpy'))::integer[]
        else r.fee_amounts_jpy end,
      fee_is_fixed = case when v_patch ? 'fee_is_fixed' then (v_patch ->> 'fee_is_fixed')::boolean else r.fee_is_fixed end,
      links = case when v_patch ? 'links'
        then array(select jsonb_array_elements_text(v_patch -> 'links'))
        else r.links end,
      audience = case when v_patch ? 'audience' then (v_patch ->> 'audience')::audience_t else r.audience end,
      ai_can_answer = case when v_patch ? 'ai_can_answer' then (v_patch ->> 'ai_can_answer')::boolean else r.ai_can_answer end,
      status = case when v_patch ? 'status' then (v_patch ->> 'status')::rule_status_t else r.status end,
      updated_by = p_staff,
      updated_at = now()
    where r.id = v_item ->> 'id'
    returning to_jsonb(r) into v_after;
    insert into kb_change_log (rule_id, changed_by, before, after, source)
    values (v_item ->> 'id', p_staff, v_before, v_after, p_source);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Put rules back as they were in a snapshot.
-- p_only_affected = true  → Undo: only the snapshot's affected_ids.
-- p_only_affected = false → full restore: every rule.
-- Rules that did not exist at snapshot time (added later) in that scope are
-- archived, not deleted. Marks the snapshot undone for an Undo.
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
  v_extra integer := 0;
begin
  select rows, affected_ids into v_rows, v_affected from kb_rule_snapshots where id = p_snapshot;
  if v_rows is null then
    raise exception 'snapshot_not_found';
  end if;

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

  -- Rules added after the snapshot (within scope) are set aside, never deleted.
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
  return v_n + v_extra;
end;
$$;

-- The API calls these with the service role; nobody else may.
revoke all on function kb_take_snapshot(text, uuid, text[], text) from public, anon, authenticated;
revoke all on function kb_bulk_set_status(text[], text, uuid, text) from public, anon, authenticated;
revoke all on function kb_apply_patches(jsonb, uuid, text) from public, anon, authenticated;
revoke all on function kb_restore_snapshot(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function kb_take_snapshot(text, uuid, text[], text) to service_role;
grant execute on function kb_bulk_set_status(text[], text, uuid, text) to service_role;
grant execute on function kb_apply_patches(jsonb, uuid, text) to service_role;
grant execute on function kb_restore_snapshot(uuid, uuid, boolean) to service_role;
