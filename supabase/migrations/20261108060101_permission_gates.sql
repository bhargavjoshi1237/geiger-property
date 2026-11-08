-- Permission gates (PLAT-01e): permission checks the database enforces on top of 01d's project-member RLS.
-- Soft-delete guard: a client changing deleted_at (delete or restore) needs property.record.delete on the row's project, or the
--   table's own key from property.soft_delete_permission(); settings, team_members, role_grants (key-gated writes) and chat_* (authorship) have none.
-- "Member" now means an active Property grant: member_project_ids() requires one, so a disabled member reads and writes nothing.
-- Server-written columns: guard_server_columns(<col>, ...) refuses client writes to them (security_deposits' ledger links).
-- Narrower write keys: conversion_* need accounting.convert, report_schedules report.schedule, accounting_export settings accounting.post,
--   and lease_sync_current_rent rent.manage for signed-in callers.
-- Owns: soft_delete_permission(), guard_soft_delete(), attach_soft_delete_guard(), guard_server_columns() and their triggers.
-- Redefines and now owns: member_project_ids (01a), apply_member_rls (01d), settings_write_permission (CORE-41), lease_sync_current_rent (CORE-01);
--   apply_member_rls now attaches the soft-delete guard, so every table a later migration classifies gets it.
-- Client writes = current_user anon/authenticated (as team_members_guard): the service role, migrations and definer RPCs run their own checks.

-- @up
-- Every statement below locks one table at a time; fail fast rather than queue behind live sessions.
set local lock_timeout = '20s';

-- The caller's projects: org access (dash's is_project_member) and an active grant on a live role, once per statement.
create or replace function property.member_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct g.project_id
    from property.role_grants g
    join public.roles r on r.id = g.role_id and r.project_id = g.project_id and r.deleted_at is null
    join public.projects p on p.id = g.project_id and p.deleted_at is null
   where g.user_id = auth.uid()
     and g.status = 'active'
     and g.deleted_at is null
     and public.is_project_member(g.project_id);
$$;
revoke all on function property.member_project_ids() from public, anon;
grant execute on function property.member_project_ids() to authenticated, service_role;

-- The key a client needs to soft-delete or restore a row of p_table (null: no guard; the table's writes are gated otherwise).
create or replace function property.soft_delete_permission(p_table text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_table in ('settings', 'team_members', 'role_grants') then null
    when p_table like 'chat\_%' then null
    when p_table = 'budget_lines' then 'property.accounting.post'
    when p_table = 'conversion_lines' then 'property.accounting.convert'
    when p_table = 'report_schedules' then 'property.report.schedule'
    else 'property.record.delete'
  end;
$$;
revoke all on function property.soft_delete_permission(text) from public, anon;
grant execute on function property.soft_delete_permission(text) to authenticated, service_role;

-- BEFORE UPDATE OF deleted_at: a client deleting or restoring a row needs the table's delete key on its project (old and new).
create or replace function property.guard_soft_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_key text;
begin
  if current_user not in ('anon', 'authenticated') or new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;
  v_key := property.soft_delete_permission(tg_table_name);
  if v_key is not null
     and (old.project_id is null
          or not property.rbac_allows(v_key, old.project_id)
          or (new.project_id is distinct from old.project_id
              and (new.project_id is null or not property.rbac_allows(v_key, new.project_id)))) then
    raise exception '%', case when new.deleted_at is null then 'Your role can''t restore deleted records.' else 'Your role can''t delete records.' end
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function property.guard_soft_delete() from public, anon;

-- Attach (or remove) the soft-delete guard on one table: tables with project_id and deleted_at whose key isn't null.
create or replace function property.attach_soft_delete_guard(p_table text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rel regclass := to_regclass(format('property.%I', p_table));
begin
  if v_rel is null then
    return;
  end if;
  if property.soft_delete_permission(p_table) is not null
     and exists (select 1 from pg_attribute a where a.attrelid = v_rel and a.attname = 'project_id' and not a.attisdropped)
     and exists (select 1 from pg_attribute a where a.attrelid = v_rel and a.attname = 'deleted_at' and not a.attisdropped) then
    execute format('create or replace trigger guard_soft_delete before update of deleted_at on property.%I for each row execute function property.guard_soft_delete()', p_table);
  elsif exists (select 1 from pg_trigger t where t.tgrelid = v_rel and t.tgname = 'guard_soft_delete') then
    execute format('drop trigger guard_soft_delete on property.%I', p_table);
  end if;
end;
$$;
revoke all on function property.attach_soft_delete_guard(text) from public, anon, authenticated, service_role;

-- Member RLS for one project table (01d's helper) plus the soft-delete guard; every later migration that creates a table calls it.
create or replace function property.apply_member_rls(
  p_table text,
  p_read text default null,
  p_write text default null,
  p_client_writes boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_read text;
  v_write text;
  v_policy record;
begin
  if to_regclass(format('property.%I', p_table)) is null then
    return;
  end if;
  v_read := case when p_read is null then 'project_id in (select property.member_project_ids())'
                 else format('project_id in (select property.permitted_project_ids(%L))', p_read) end;
  v_write := case when p_write is null then v_read
                  else v_read || format(' and project_id in (select property.permitted_project_ids(%L))', p_write) end;
  execute format('alter table property.%I enable row level security', p_table);
  for v_policy in
    select p.policyname
      from pg_policies p
     where p.schemaname = 'property' and p.tablename = p_table
       and (p.policyname in (p_table || '_demo_all', 'property_' || p_table || '_demo_all')
            or p.policyname like replace(p_table, '_', '\_') || '\_member\_%'
            or p.qual = 'true' or p.with_check = 'true')
  loop
    execute format('drop policy %I on property.%I', v_policy.policyname, p_table);
  end loop;
  execute format('revoke all on property.%I from anon, authenticated', p_table);
  execute format('create policy %I on property.%I for select to authenticated using (%s)', p_table || '_member_select', p_table, v_read);
  if p_client_writes then
    execute format('grant select, insert, update on property.%I to authenticated', p_table);
    execute format('create policy %I on property.%I for insert to authenticated with check (%s)', p_table || '_member_insert', p_table, v_write);
    execute format('create policy %I on property.%I for update to authenticated using (%s) with check (%s)',
                   p_table || '_member_update', p_table, v_write, v_write);
  else
    execute format('grant select on property.%I to authenticated', p_table);
  end if;
  perform property.attach_soft_delete_guard(p_table);
end;
$$;
revoke all on function property.apply_member_rls(text, text, text, boolean) from public, anon, authenticated, service_role;

-- Client writes may not set or change the columns named as trigger arguments (the server owns them).
create or replace function property.guard_server_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_col text;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  foreach v_col in array tg_argv loop
    if (v_new ->> v_col) is distinct from (v_old ->> v_col) then
      raise exception 'Only the server sets % on %.', v_col, tg_table_name using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function property.guard_server_columns() from public, anon;

-- Deposit ledger links are written by the /api/billing/deposits routes and deposit_link_ledger (service role) only.
create or replace trigger security_deposits_server_columns
before insert or update on property.security_deposits
for each row execute function property.guard_server_columns('charge_entry_id', 'apply_entry_id', 'refund_bill_id');

-- The permission a settings key needs to write (null: any member; CORE-41's body plus accounting_export); keys not listed need settings.manage.
create or replace function property.settings_write_permission(p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_key = 'roles' then 'property.role.manage'
    when p_key = 'integrations' then 'property.integration.manage'
    when p_key in ('automation_guardrails', 'automation_value', 'intake_rules', 'signal_settings') then 'property.automation.manage'
    when p_key = 'accounting_export' then 'property.accounting.post'
    when p_key in ('onboarding', 'screening_criteria') then null
    when auth.uid() is not null and p_key = 'report_favorites:' || auth.uid()::text then null
    else 'property.settings.manage'
  end;
$$;
revoke all on function property.settings_write_permission(text) from public, anon;
grant execute on function property.settings_write_permission(text) to authenticated, service_role;

-- leases.rent ← the step in force on p_as_of (else the earliest step; no steps: unchanged); a signed-in caller needs rent.manage.
create or replace function property.lease_sync_current_rent(p_lease_id uuid, p_as_of date)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_amount numeric;
  v_project uuid;
begin
  if current_user in ('anon', 'authenticated') then
    select l.project_id into v_project from property.leases l where l.id = p_lease_id;
    if v_project is null or not property.rbac_allows('property.rent.manage', v_project) then
      raise exception 'Your role can''t change rent schedules.' using errcode = '42501';
    end if;
  end if;
  select s.amount into v_amount from property.lease_rent_steps s
  where s.lease_id = p_lease_id and s.deleted_at is null and s.status = 'active'
    and s.effective_date <= coalesce(p_as_of, current_date)
  order by s.effective_date desc limit 1;
  if v_amount is null then
    select s.amount into v_amount from property.lease_rent_steps s
    where s.lease_id = p_lease_id and s.deleted_at is null and s.status = 'active'
    order by s.effective_date asc limit 1;
  end if;
  if v_amount is null then
    select l.rent into v_amount from property.leases l where l.id = p_lease_id;
    return v_amount;
  end if;
  update property.leases set rent = v_amount where id = p_lease_id and rent is distinct from v_amount;
  return v_amount;
end;
$$;
revoke all on function property.lease_sync_current_rent(uuid, date) from public, anon;
grant execute on function property.lease_sync_current_rent(uuid, date) to authenticated, service_role;

-- Opening balances need accounting.convert to edit (INTL-04's key); report schedules need report.schedule (the UI's gate).
select property.apply_member_rls('conversion_batches', 'property.accounting.view', 'property.accounting.convert');
select property.apply_member_rls('conversion_lines', 'property.accounting.view', 'property.accounting.convert');
select property.apply_member_rls('report_schedules', null, 'property.report.schedule');

-- The guard on every other project table (apply_member_rls attaches it to tables created later).
do $$
declare
  t text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'property' and c.relkind in ('r', 'p')
       and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'project_id' and not a.attisdropped)
       and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'deleted_at' and not a.attisdropped)
     order by 1
  loop
    perform property.attach_soft_delete_guard(t);
  end loop;
end $$;

-- @down
set local lock_timeout = '20s';

drop trigger if exists security_deposits_server_columns on property.security_deposits;

-- 01d's helper without the guard, then the policies it replaced above.
create or replace function property.apply_member_rls(
  p_table text,
  p_read text default null,
  p_write text default null,
  p_client_writes boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_read text;
  v_write text;
  v_policy record;
begin
  if to_regclass(format('property.%I', p_table)) is null then
    return;
  end if;
  v_read := case when p_read is null then 'project_id in (select property.member_project_ids())'
                 else format('project_id in (select property.permitted_project_ids(%L))', p_read) end;
  v_write := case when p_write is null then v_read
                  else v_read || format(' and project_id in (select property.permitted_project_ids(%L))', p_write) end;
  execute format('alter table property.%I enable row level security', p_table);
  for v_policy in
    select p.policyname
      from pg_policies p
     where p.schemaname = 'property' and p.tablename = p_table
       and (p.policyname in (p_table || '_demo_all', 'property_' || p_table || '_demo_all')
            or p.policyname like replace(p_table, '_', '\_') || '\_member\_%'
            or p.qual = 'true' or p.with_check = 'true')
  loop
    execute format('drop policy %I on property.%I', v_policy.policyname, p_table);
  end loop;
  execute format('revoke all on property.%I from anon, authenticated', p_table);
  execute format('create policy %I on property.%I for select to authenticated using (%s)', p_table || '_member_select', p_table, v_read);
  if p_client_writes then
    execute format('grant select, insert, update on property.%I to authenticated', p_table);
    execute format('create policy %I on property.%I for insert to authenticated with check (%s)', p_table || '_member_insert', p_table, v_write);
    execute format('create policy %I on property.%I for update to authenticated using (%s) with check (%s)',
                   p_table || '_member_update', p_table, v_write, v_write);
  else
    execute format('grant select on property.%I to authenticated', p_table);
  end if;
end;
$$;
revoke all on function property.apply_member_rls(text, text, text, boolean) from public, anon, authenticated, service_role;

select property.apply_member_rls('conversion_batches', 'property.accounting.view', 'property.accounting.post');
select property.apply_member_rls('conversion_lines', 'property.accounting.view', 'property.accounting.post');
select property.apply_member_rls('report_schedules');

do $$
declare
  r record;
begin
  for r in
    select c.relname
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'property' and t.tgname = 'guard_soft_delete'
  loop
    execute format('drop trigger guard_soft_delete on property.%I', r.relname);
  end loop;
end $$;

-- 01a's membership: org access alone.
create or replace function property.member_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.projects p where p.deleted_at is null and public.is_project_member(p.id);
$$;
revoke all on function property.member_project_ids() from public, anon;
grant execute on function property.member_project_ids() to authenticated, service_role;

-- CORE-41's mapping (own report favorites, no accounting_export line).
create or replace function property.settings_write_permission(p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_key = 'roles' then 'property.role.manage'
    when p_key = 'integrations' then 'property.integration.manage'
    when p_key in ('automation_guardrails', 'automation_value', 'intake_rules', 'signal_settings') then 'property.automation.manage'
    when p_key in ('onboarding', 'screening_criteria') then null
    when auth.uid() is not null and p_key = 'report_favorites:' || auth.uid()::text then null
    else 'property.settings.manage'
  end;
$$;
revoke all on function property.settings_write_permission(text) from public, anon;
grant execute on function property.settings_write_permission(text) to authenticated, service_role;

-- CORE-01's body (any member may sync).
create or replace function property.lease_sync_current_rent(p_lease_id uuid, p_as_of date)
returns numeric
language plpgsql
security invoker
set search_path = property
as $$
declare
  v_amount numeric;
begin
  select s.amount into v_amount from property.lease_rent_steps s
  where s.lease_id = p_lease_id and s.deleted_at is null and s.status = 'active'
    and s.effective_date <= coalesce(p_as_of, current_date)
  order by s.effective_date desc limit 1;
  if v_amount is null then
    select s.amount into v_amount from property.lease_rent_steps s
    where s.lease_id = p_lease_id and s.deleted_at is null and s.status = 'active'
    order by s.effective_date asc limit 1;
  end if;
  if v_amount is null then
    select l.rent into v_amount from property.leases l where l.id = p_lease_id;
    return v_amount;
  end if;
  update property.leases set rent = v_amount where id = p_lease_id and rent is distinct from v_amount;
  return v_amount;
end;
$$;
revoke all on function property.lease_sync_current_rent(uuid, date) from public, anon;
grant execute on function property.lease_sync_current_rent(uuid, date) to authenticated, service_role;

drop function if exists property.guard_server_columns();
drop function if exists property.attach_soft_delete_guard(text);
drop function if exists property.guard_soft_delete();
drop function if exists property.soft_delete_permission(text);
