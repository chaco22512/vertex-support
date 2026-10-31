-- spec v1.8 §7.4.1 / §7.4.2 (CS-managed knowledge): apply a CSV import as ONE
-- transaction — backup, update, add, archive (Replace all) and change log
-- together. If any step fails nothing changes, so the knowledge base is never
-- seen empty or half replaced. Nothing is deleted. Additive only (new function).

create or replace function kb_import_apply(
  p_mode text,          -- 'update' (Add/Update only) | 'replace' (Replace all)
  p_patches jsonb,      -- [{id, patch:{rule_text?, fee_amounts_jpy?, …}}]
  p_new jsonb,          -- [{id, category, subcategory, rule_text, fee_amounts_jpy, fee_is_fixed, links, audience, ai_can_answer, status}]
  p_archive text[],     -- ids to archive (Replace all only)
  p_staff uuid,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text := case when p_mode = 'replace' then 'replace_all' else 'csv_import' end;
  v_snapshot uuid;
  v_applied integer := 0;
  v_added integer := 0;
  v_archived integer := 0;
  v_affected text[];
begin
  if p_mode not in ('update', 'replace') then
    raise exception 'invalid_mode';
  end if;
  if p_mode = 'update' and coalesce(array_length(p_archive, 1), 0) > 0 then
    raise exception 'archive_requires_replace';
  end if;

  v_affected :=
    array(select x ->> 'id' from jsonb_array_elements(coalesce(p_patches, '[]'::jsonb)) x)
    || array(select x ->> 'id' from jsonb_array_elements(coalesce(p_new, '[]'::jsonb)) x)
    || coalesce(p_archive, '{}');

  -- Backup first (Undo puts these ids back; added rules are archived on Undo).
  v_snapshot := kb_take_snapshot(v_source, p_staff, v_affected, coalesce(p_note, ''));

  if jsonb_array_length(coalesce(p_patches, '[]'::jsonb)) > 0 then
    v_applied := kb_apply_patches(p_patches, p_staff, v_source);
  end if;

  with ins as (
    insert into kb_rules (
      id, category, subcategory, rule_text, fee_amounts_jpy, fee_is_fixed, links,
      audience, ai_can_answer, status, updated_by, updated_at
    )
    select
      x ->> 'id',
      x ->> 'category',
      coalesce(x ->> 'subcategory', ''),
      x ->> 'rule_text',
      coalesce(array(select jsonb_array_elements_text(x -> 'fee_amounts_jpy'))::integer[], '{}'),
      coalesce((x ->> 'fee_is_fixed')::boolean, false),
      coalesce(array(select jsonb_array_elements_text(x -> 'links')), '{}'),
      coalesce(x ->> 'audience', 'customer')::audience_t,
      coalesce((x ->> 'ai_can_answer')::boolean, true),
      coalesce(x ->> 'status', 'active')::rule_status_t,
      p_staff,
      now()
    from jsonb_array_elements(coalesce(p_new, '[]'::jsonb)) x
    returning *
  )
  insert into kb_change_log (rule_id, changed_by, before, after, source)
  select ins.id, p_staff, '{}'::jsonb, to_jsonb(ins), v_source from ins;
  get diagnostics v_added = row_count;

  if p_mode = 'replace' and coalesce(array_length(p_archive, 1), 0) > 0 then
    v_archived := kb_bulk_set_status(p_archive, 'archived', p_staff, v_source);
  end if;

  return jsonb_build_object(
    'snapshot_id', v_snapshot,
    'applied', v_applied,
    'added', v_added,
    'archived', v_archived
  );
end;
$$;

revoke all on function kb_import_apply(text, jsonb, jsonb, text[], uuid, text) from public, anon, authenticated;
grant execute on function kb_import_apply(text, jsonb, jsonb, text[], uuid, text) to service_role;
