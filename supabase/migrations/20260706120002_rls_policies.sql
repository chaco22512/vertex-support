-- Row Level Security (build_spec_v1_4.md §2, acceptance criterion 7)
--
-- Model:
--   * Customers are anonymous. All customer traffic goes through the Workers API
--     using the service_role key, which BYPASSES RLS. So no anon policies exist.
--   * Admin/staff authenticate via Supabase Auth (JWT). RLS below governs those.
--   * staff role must NOT write kb_rules or manage staff (criterion 7).
--
-- Helper functions are SECURITY DEFINER so they read the staff table with the
-- definer's rights, avoiding infinite recursion in the staff table policies.

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff s
    where s.id = auth.uid() and s.is_active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff s
    where s.id = auth.uid() and s.is_active and s.role = 'admin'
  );
$$;

grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- enable RLS on all tables
alter table kb_rules      enable row level security;
alter table kb_change_log enable row level security;
alter table staff         enable row level security;
alter table conversations enable row level security;
alter table messages      enable row level security;
alter table reply_drafts  enable row level security;

-- kb_rules: staff may read; only admin may write (criterion 7)
create policy kb_rules_select on kb_rules for select to authenticated using (is_staff());
create policy kb_rules_insert on kb_rules for insert to authenticated with check (is_admin());
create policy kb_rules_update on kb_rules for update to authenticated using (is_admin()) with check (is_admin());
create policy kb_rules_delete on kb_rules for delete to authenticated using (is_admin());

-- kb_change_log: staff may read; admin writes
create policy kb_change_log_select on kb_change_log for select to authenticated using (is_staff());
create policy kb_change_log_insert on kb_change_log for insert to authenticated with check (is_admin());

-- staff: staff may read; only admin may manage (criterion 7)
create policy staff_select on staff for select to authenticated using (is_staff());
create policy staff_insert on staff for insert to authenticated with check (is_admin());
create policy staff_update on staff for update to authenticated using (is_admin()) with check (is_admin());
create policy staff_delete on staff for delete to authenticated using (is_admin());

-- conversations / messages / reply_drafts: any active staff (incl. admin) handles the inbox
create policy conversations_select on conversations for select to authenticated using (is_staff());
create policy conversations_insert on conversations for insert to authenticated with check (is_staff());
create policy conversations_update on conversations for update to authenticated using (is_staff()) with check (is_staff());

create policy messages_select on messages for select to authenticated using (is_staff());
create policy messages_insert on messages for insert to authenticated with check (is_staff());
create policy messages_update on messages for update to authenticated using (is_staff()) with check (is_staff());

create policy reply_drafts_select on reply_drafts for select to authenticated using (is_staff());
create policy reply_drafts_insert on reply_drafts for insert to authenticated with check (is_staff());
create policy reply_drafts_update on reply_drafts for update to authenticated using (is_staff()) with check (is_staff());
