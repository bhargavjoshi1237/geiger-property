-- Rls project isolation (PLAT-01d): every property table moves from demo-open RLS to project-membership policies.
-- Owns property.rls_tightening_backup (the pre-01d policies, table/column grants, RLS states and redefined function bodies; @down restores them exactly),
--   apply_member_rls(), permitted_project_ids(), settings_write_permission(), link_owner_in_project(), team_role_within_rights(),
--   team_members_guard() (+ trigger), chat_readable_conversation_ids(), chat_can_add_member() and ledger_foreign_dimension().
-- Redefines and now owns: ledger_post (signed-in callers' dimension ids must be in the entry's project), ledger_lines_guard (line metadata is
--   trusted-only), ledger_check_balance (definer, so the deferred check sees every line under RLS), chat_toggle_reaction (definer; it checks membership).
-- Member = property.member_project_ids() (dash org membership); gated reads/writes add property.permitted_project_ids(<key>), evaluated once per statement.
-- Categories: member read/write; financial (accounting.view reads, accounting.post writes; ledger_* RPC-only bar the reconciliation columns);
--   server-written (members read, the service role writes; automation run cancel needs automation.manage); settings by key; team roster (team.invite
--   plus a guard); legal reference (anon reads global rows); chat; audit log (audit.view); tables without a project and unused: closed to clients.
-- Anon keeps only select on legal_*; authenticated hard-deletes only amenity_links, floor_plan_links and its own chat_members rows.
-- Any other table with a project_id (e.g. one a parallel branch pushed first) gets member read/write; one without is closed.

-- @up

-- Snapshot for @down: policies, table and column grants of anon/authenticated, RLS states, and the bodies redefined below.
create table if not exists property.rls_tightening_backup (
  id boolean primary key default true check (id),
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table property.rls_tightening_backup enable row level security;
revoke all on property.rls_tightening_backup from public, anon, authenticated;

insert into property.rls_tightening_backup (id, payload)
select true, jsonb_build_object(
  'policies', (
    select coalesce(jsonb_agg(to_jsonb(p) order by p.tablename, p.policyname), '[]'::jsonb)
      from pg_policies p
     where p.schemaname = 'property' and p.tablename <> 'rls_tightening_backup'
  ),
  'grants', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'relation', c.relname, 'kind', c.relkind, 'grantee', pg_get_userbyid(a.grantee),
             'privilege', a.privilege_type, 'grantable', a.is_grantable) order by c.relname), '[]'::jsonb)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace,
      lateral aclexplode(c.relacl) a
     where n.nspname = 'property' and c.relkind in ('r', 'p', 'v', 'm', 'S') and c.relname <> 'rls_tightening_backup'
       and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
  ),
  'column_grants', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'relation', c.relname, 'column', att.attname, 'grantee', pg_get_userbyid(a.grantee),
             'privilege', a.privilege_type, 'grantable', a.is_grantable)), '[]'::jsonb)
      from pg_attribute att
      join pg_class c on c.oid = att.attrelid
      join pg_namespace n on n.oid = c.relnamespace,
      lateral aclexplode(att.attacl) a
     where n.nspname = 'property' and att.attacl is not null and not att.attisdropped
       and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
  ),
  'table_states', (
    select coalesce(jsonb_agg(jsonb_build_object('table', c.relname, 'rls', c.relrowsecurity, 'force', c.relforcerowsecurity)), '[]'::jsonb)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'property' and c.relkind in ('r', 'p') and c.relname <> 'rls_tightening_backup'
  ),
  'functions', (
    select coalesce(jsonb_agg(pg_get_functiondef(p.oid)), '[]'::jsonb)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'property'
       and p.proname in ('ledger_post', 'ledger_lines_guard', 'ledger_check_balance', 'chat_toggle_reaction')
  )
)
on conflict (id) do nothing;

-- The caller's projects where they hold a permission, for `project_id in (select property.permitted_project_ids(key))`.
create or replace function property.permitted_project_ids(p_permission text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from property.member_project_ids() as m(id) where property.rbac_allows(p_permission, m.id);
$$;
revoke all on function property.permitted_project_ids(text) from public, anon;
grant execute on function property.permitted_project_ids(text) to authenticated, service_role;

-- The permission a settings key needs to write (null: any member); keys not listed need settings.manage.
create or replace function property.settings_write_permission(p_key text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_key = 'roles' then 'property.role.manage'
    when p_key = 'integrations' then 'property.integration.manage'
    when p_key in ('automation_guardrails', 'automation_value', 'intake_rules', 'signal_settings') then 'property.automation.manage'
    when p_key in ('onboarding', 'screening_criteria') then null
    else 'property.settings.manage'
  end;
$$;
revoke all on function property.settings_write_permission(text) from public, anon;
grant execute on function property.settings_write_permission(text) to authenticated, service_role;

-- Whether a link's owner record (property, building, unit, unit type, floor plan, portfolio) is in the project.
create or replace function property.link_owner_in_project(p_type text, p_id uuid, p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_id is not null and p_project is not null and coalesce(case
    when replace(lower(p_type), '_', '') in ('property', 'properties') then
      exists (select 1 from property.properties x where x.id = p_id and x.project_id = p_project)
    when replace(lower(p_type), '_', '') in ('building', 'buildings') then
      exists (select 1 from property.buildings x where x.id = p_id and x.project_id = p_project)
    when replace(lower(p_type), '_', '') in ('unit', 'units') then
      exists (select 1 from property.units x where x.id = p_id and x.project_id = p_project)
    when replace(lower(p_type), '_', '') in ('unittype', 'unittypes') then
      exists (select 1 from property.unit_types x where x.id = p_id and x.project_id = p_project)
    when replace(lower(p_type), '_', '') in ('floorplan', 'floorplans') then
      exists (select 1 from property.floor_plans x where x.id = p_id and x.project_id = p_project)
    when replace(lower(p_type), '_', '') in ('portfolio', 'portfolios') then
      exists (select 1 from property.portfolios x where x.id = p_id and x.project_id = p_project)
  end, false);
$$;
revoke all on function property.link_owner_in_project(text, uuid, uuid) from public, anon;
grant execute on function property.link_owner_in_project(text, uuid, uuid) to authenticated, service_role;

-- Whether the caller holds every Property key of the role a roster row names, resolved as rbac_ensure_membership claims it (the project's
-- role by key or name, else the system definition, else Manager; Owner and Admin always by definition), so an invite never out-ranks its writer.
create or replace function property.team_role_within_rights(p_project uuid, p_role text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text := trim(both '_' from regexp_replace(lower(coalesce(p_role, '')), '[^a-z0-9]+', '_', 'g'));
  v_perms text[];
begin
  if p_project is null or not property.can_access_project(p_project) then
    return false;
  end if;
  if v_key = '' then
    return true;
  end if;
  if v_key in ('owner', 'admin') then
    select r.permissions into v_perms from property.rbac_system_role(v_key) r;
  end if;
  if v_perms is null then
    select r.permissions into v_perms
      from public.roles r
     where r.project_id = p_project and r.deleted_at is null
       and (r.key = v_key or lower(r.name) = lower(trim(p_role)))
     order by (r.key = v_key) desc nulls last
     limit 1;
  end if;
  if v_perms is null then
    select r.permissions into v_perms from property.rbac_system_role(v_key) r;
  end if;
  if v_perms is null then
    select r.permissions into v_perms from public.roles r
     where r.project_id = p_project and r.key = 'manager' and r.deleted_at is null
     limit 1;
  end if;
  if v_perms is null then
    select r.permissions into v_perms from property.rbac_system_role('manager') r;
  end if;
  return not exists (
    select 1 from unnest(coalesce(v_perms, '{}'::text[])) k
     where (k = '*' or k like 'property.%') and not property.rbac_allows(k, p_project)
  );
end;
$$;
revoke all on function property.team_role_within_rights(uuid, text) from public, anon;
grant execute on function property.team_role_within_rights(uuid, text) to authenticated, service_role;

-- Roster writes from a signed-in client never link an account, never plant or lift a Disabled row without being a project role
-- administrator, and never name a role beyond the writer's rights. Invoker on purpose: current_user tells a client write apart from
-- rbac_ensure_membership's claim (a definer, running as the owner) and from the server.
create or replace function property.team_members_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.metadata ? 'userId')
     or (tg_op = 'UPDATE' and (new.metadata -> 'userId') is distinct from (old.metadata -> 'userId')) then
    raise exception 'Only the database links a team member to an account.' using errcode = '42501';
  end if;
  if ((new.status = 'Disabled'
       and (tg_op = 'INSERT' or old.status is distinct from 'Disabled' or new.email is distinct from old.email
            or new.project_id is distinct from old.project_id))
      or (tg_op = 'UPDATE' and old.status = 'Disabled' and new.status is distinct from 'Disabled'))
     and not public.can_administer_project_roles(new.project_id) then
    raise exception 'Only an org owner or admin can disable or re-enable a team member.' using errcode = '42501';
  end if;
  if coalesce(new.role, '') <> ''
     and (tg_op = 'INSERT' or new.role is distinct from old.role or new.email is distinct from old.email)
     and (not (new.metadata ? 'userId')
          or not exists (select 1 from property.role_grants g
                          where g.project_id = new.project_id and g.user_id::text = new.metadata ->> 'userId'))
     and not property.team_role_within_rights(new.project_id, new.role) then
    raise exception 'You can''t invite someone to a role with more access than your own.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function property.team_members_guard() from public, anon;

-- Conversations the caller may read: public channels in their projects, DMs they're part of, and channels they created or belong to.
create or replace function property.chat_readable_conversation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
    from property.chat_conversations c
   where c.project_id in (select property.member_project_ids())
     and (
       (c.kind = 'channel' and c.visibility = 'public')
       or (c.kind = 'dm' and auth.uid()::text = any (string_to_array(coalesce(c.dm_key, ''), ':')))
       or c.created_by = auth.uid()
       or exists (select 1 from property.chat_members m where m.conversation_id = c.id and m.profile_id = auth.uid())
     );
$$;
revoke all on function property.chat_readable_conversation_ids() from public, anon;
grant execute on function property.chat_readable_conversation_ids() to authenticated, service_role;

-- Who may add a profile to a conversation: anyone in the project for a public channel, the two participants of a DM,
-- and the creator or a member of a private channel.
create or replace function property.chat_can_add_member(p_conversation uuid, p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
      from property.chat_conversations c
     where c.id = p_conversation
       and c.project_id in (select property.member_project_ids())
       and case
         when c.kind = 'dm' then
           auth.uid()::text = any (string_to_array(coalesce(c.dm_key, ''), ':'))
           and p_profile::text = any (string_to_array(coalesce(c.dm_key, ''), ':'))
         when c.visibility = 'public' then true
         else c.created_by = auth.uid()
           or exists (select 1 from property.chat_members m where m.conversation_id = c.id and m.profile_id = auth.uid())
       end
  );
$$;
revoke all on function property.chat_can_add_member(uuid, uuid) from public, anon;
grant execute on function property.chat_can_add_member(uuid, uuid) to authenticated, service_role;

-- The first ledger dimension in p_dims whose id isn't a row of the project (null when all are), for ledger_post.
create or replace function property.ledger_foreign_dimension(p_project uuid, p_dims jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dim text;
  v_id uuid;
  v_ok boolean;
begin
  foreach v_dim in array array['property_id', 'unit_id', 'lease_id', 'tenant_id', 'owner_id', 'vendor_id', 'bank_account_id', 'job_id', 'applies_to_entry_id'] loop
    v_id := nullif(p_dims ->> v_dim, '')::uuid;
    continue when v_id is null;
    v_ok := case v_dim
      when 'property_id' then exists (select 1 from property.properties x where x.id = v_id and x.project_id = p_project)
      when 'unit_id' then exists (select 1 from property.units x where x.id = v_id and x.project_id = p_project)
      when 'lease_id' then exists (select 1 from property.leases x where x.id = v_id and x.project_id = p_project)
      when 'tenant_id' then exists (select 1 from property.tenants x where x.id = v_id and x.project_id = p_project)
      when 'owner_id' then exists (select 1 from property.owners x where x.id = v_id and x.project_id = p_project)
      when 'vendor_id' then exists (select 1 from property.vendors x where x.id = v_id and x.project_id = p_project)
      when 'bank_account_id' then exists (select 1 from property.bank_accounts x where x.id = v_id and x.project_id = p_project)
      when 'job_id' then exists (select 1 from property.cost_jobs x where x.id = v_id and x.project_id = p_project)
      else exists (select 1 from property.ledger_entries x where x.id = v_id and x.project_id = p_project)
    end;
    if not v_ok then
      return v_dim;
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function property.ledger_foreign_dimension(uuid, jsonb) from public, anon, authenticated;

-- Balanced post; a signed-in caller needs property.accounting.post on the entry's project, posts as themselves, and may only use that project's records.
create or replace function property.ledger_post(p_entry jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := coalesce(nullif(p_entry->>'id', '')::uuid, gen_random_uuid());
  v_project uuid := nullif(p_entry->>'project_id', '')::uuid;
  v_key text := nullif(p_entry->>'idempotency_key', '');
  v_date date := coalesce(nullif(p_entry->>'entry_date', '')::date, current_date);
  v_trusted boolean := property.is_trusted_session();
  v_actor uuid;
  v_existing uuid;
  v_line jsonb;
  v_d numeric;
  v_c numeric;
  v_debit numeric := 0;
  v_credit numeric := 0;
  v_count integer := 0;
  v_bad text;
begin
  if not v_trusted and (v_project is null or not property.rbac_allows('property.accounting.post', v_project)) then
    raise exception 'You don''t have permission to post to the ledger.' using errcode = '42501';
  end if;
  v_actor := case when v_trusted then nullif(p_entry->>'created_by', '')::uuid else auth.uid() end;

  if v_key is not null then
    select id into v_existing from property.ledger_entries
    where idempotency_key = v_key and project_id is not distinct from v_project
    limit 1;
    if v_existing is not null then return v_existing; end if;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'ledger_post: lines must be an array';
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_d := round(coalesce(nullif(v_line->>'debit', '')::numeric, 0), 2);
    v_c := round(coalesce(nullif(v_line->>'credit', '')::numeric, 0), 2);
    if v_d < 0 or v_c < 0 then raise exception 'ledger_post: amounts must be positive'; end if;
    if v_d > 0 and v_c > 0 then raise exception 'ledger_post: a line is either a debit or a credit'; end if;
    if (v_d > 0 or v_c > 0) and nullif(v_line->>'gl_account_id', '') is null then
      raise exception 'ledger_post: every line needs a GL account';
    end if;
    -- Definer bypasses RLS, so the account must be this project's own.
    if (v_d > 0 or v_c > 0) and not exists (
      select 1 from property.gl_accounts a
      where a.id = (v_line->>'gl_account_id')::uuid and a.project_id is not distinct from v_project
    ) then
      raise exception 'ledger_post: GL account % is not in this project', v_line->>'gl_account_id';
    end if;
    v_debit := v_debit + v_d;
    v_credit := v_credit + v_c;
    if v_d > 0 or v_c > 0 then v_count := v_count + 1; end if;
  end loop;
  if v_count < 2 then raise exception 'ledger_post: an entry needs at least two lines'; end if;
  if v_debit <> v_credit then
    raise exception 'ledger_post: unbalanced entry (debits %, credits %)', v_debit, v_credit;
  end if;
  -- Definer bypasses RLS, so a signed-in caller's dimension ids must be this project's own (trusted sessions are the server's responsibility).
  if not v_trusted then
    v_bad := property.ledger_foreign_dimension(v_project, p_entry);
    if v_bad is null then
      select property.ledger_foreign_dimension(v_project, l.value) into v_bad
        from jsonb_array_elements(p_lines) l
       where property.ledger_foreign_dimension(v_project, l.value) is not null
       limit 1;
    end if;
    if v_bad is not null then
      raise exception 'ledger_post: % is not in this project', v_bad;
    end if;
  end if;

  insert into property.ledger_entries (
    id, project_id, entry_date, memo, source_type, source_id, status, idempotency_key, total,
    property_id, unit_id, lease_id, tenant_id, owner_id, vendor_id, metadata, created_by
  ) values (
    v_id, v_project, v_date, nullif(p_entry->>'memo', ''),
    coalesce(nullif(p_entry->>'source_type', ''), 'adjustment'),
    nullif(p_entry->>'source_id', '')::uuid, 'posted', v_key, v_debit,
    nullif(p_entry->>'property_id', '')::uuid, nullif(p_entry->>'unit_id', '')::uuid,
    nullif(p_entry->>'lease_id', '')::uuid, nullif(p_entry->>'tenant_id', '')::uuid,
    nullif(p_entry->>'owner_id', '')::uuid, nullif(p_entry->>'vendor_id', '')::uuid,
    coalesce(p_entry->'metadata', '{}'::jsonb), v_actor
  );

  insert into property.ledger_lines (
    project_id, entry_id, entry_date, line_no, gl_account_id, debit, credit, memo,
    property_id, unit_id, lease_id, tenant_id, owner_id, vendor_id, bank_account_id, job_id,
    applies_to_entry_id, metadata, created_by
  )
  select
    v_project, v_id, v_date, l.n::int, (l.line->>'gl_account_id')::uuid,
    round(coalesce(nullif(l.line->>'debit', '')::numeric, 0), 2),
    round(coalesce(nullif(l.line->>'credit', '')::numeric, 0), 2),
    coalesce(nullif(l.line->>'memo', ''), nullif(p_entry->>'memo', '')),
    (case when l.line ? 'property_id' then nullif(l.line->>'property_id', '') else nullif(p_entry->>'property_id', '') end)::uuid,
    (case when l.line ? 'unit_id' then nullif(l.line->>'unit_id', '') else nullif(p_entry->>'unit_id', '') end)::uuid,
    (case when l.line ? 'lease_id' then nullif(l.line->>'lease_id', '') else nullif(p_entry->>'lease_id', '') end)::uuid,
    (case when l.line ? 'tenant_id' then nullif(l.line->>'tenant_id', '') else nullif(p_entry->>'tenant_id', '') end)::uuid,
    (case when l.line ? 'owner_id' then nullif(l.line->>'owner_id', '') else nullif(p_entry->>'owner_id', '') end)::uuid,
    (case when l.line ? 'vendor_id' then nullif(l.line->>'vendor_id', '') else nullif(p_entry->>'vendor_id', '') end)::uuid,
    nullif(l.line->>'bank_account_id', '')::uuid,
    nullif(l.line->>'job_id', '')::uuid,
    nullif(l.line->>'applies_to_entry_id', '')::uuid,
    coalesce(l.line->'metadata', '{}'::jsonb),
    v_actor
  from jsonb_array_elements(p_lines) with ordinality as l(line, n)
  where round(coalesce(nullif(l.line->>'debit', '')::numeric, 0), 2) > 0
     or round(coalesce(nullif(l.line->>'credit', '')::numeric, 0), 2) > 0;

  return v_id;
exception when unique_violation then
  -- A concurrent post with the same idempotency key won the race.
  if v_key is not null then
    select id into v_existing from property.ledger_entries
    where idempotency_key = v_key and project_id is not distinct from v_project limit 1;
    if v_existing is not null then return v_existing; end if;
  end if;
  raise;
end;
$$;
revoke all on function property.ledger_post(jsonb, jsonb) from public, anon;
grant execute on function property.ledger_post(jsonb, jsonb) to authenticated, service_role;

-- Lines: only the reconciliation columns change after posting (metadata too for trusted sessions); nothing is deleted (trusted sessions excepted).
create or replace function property.ledger_lines_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_free text[] := array['cleared', 'cleared_on', 'reconciliation_id', 'updated_at'];
begin
  if property.is_trusted_session() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Ledger lines can''t be deleted; void the entry instead.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
    raise exception 'Posted ledger lines can''t be changed; void the entry instead.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function property.ledger_lines_guard() from public, anon, authenticated;

-- Deferred balance check: a definer, so it sees every line of the entry whoever commits (member RLS would hide them).
create or replace function property.ledger_check_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry uuid := coalesce(new.entry_id, old.entry_id);
  v_debit numeric;
  v_credit numeric;
begin
  if tg_op = 'DELETE' then v_entry := old.entry_id; end if;
  if not exists (select 1 from property.ledger_entries where id = v_entry) then return null; end if;
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into v_debit, v_credit
  from property.ledger_lines where entry_id = v_entry and deleted_at is null;
  if v_debit <> v_credit then
    raise exception 'ledger: entry % is unbalanced (debits %, credits %)', v_entry, v_debit, v_credit;
  end if;
  return null;
end;
$$;
revoke all on function property.ledger_check_balance() from public, anon, authenticated;

-- React as yourself: a definer (chat_messages updates are author-only under RLS), so it checks project access and private/DM membership itself.
create or replace function property.chat_toggle_reaction(p_message uuid, p_reaction text, p_profile uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reactions jsonb;
  v_list jsonb;
  v_conversation uuid;
  v_project uuid;
  v_kind text;
  v_visibility text;
begin
  if p_profile is null or p_profile is distinct from auth.uid() then
    raise exception 'You can only react as yourself.' using errcode = '42501';
  end if;
  select c.id, c.project_id, c.kind, c.visibility into v_conversation, v_project, v_kind, v_visibility
    from property.chat_messages m
    join property.chat_conversations c on c.id = m.conversation_id
   where m.id = p_message and m.deleted_at is null and c.deleted_at is null;
  if not found then
    return null;
  end if;
  if not property.can_access_project(v_project)
     or ((v_kind = 'dm' or v_visibility = 'private') and not exists (
       select 1 from property.chat_members cm where cm.conversation_id = v_conversation and cm.profile_id = p_profile
     )) then
    raise exception 'You''re not a member of this conversation.' using errcode = '42501';
  end if;

  select coalesce(metadata -> 'reactions', '{}'::jsonb) into v_reactions
    from property.chat_messages
   where id = p_message and deleted_at is null
   for update;
  if not found then
    return null;
  end if;

  v_list := coalesce(v_reactions -> p_reaction, '[]'::jsonb);
  if v_list @> jsonb_build_array(p_profile::text) then
    v_list := v_list - p_profile::text;
  else
    v_list := v_list || jsonb_build_array(p_profile::text);
  end if;

  if jsonb_array_length(v_list) = 0 then
    v_reactions := v_reactions - p_reaction;
  else
    v_reactions := v_reactions || jsonb_build_object(p_reaction, v_list);
  end if;

  update property.chat_messages
     set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{reactions}', v_reactions)
   where id = p_message;
  return v_reactions;
end;
$$;
revoke all on function property.chat_toggle_reaction(uuid, text, uuid) from public, anon;
grant execute on function property.chat_toggle_reaction(uuid, text, uuid) to authenticated;

-- Member RLS for one project table: drops its open policies and creates <t>_member_select / _insert / _update on
-- `project_id in (select property.member_project_ids())`, narrowed to projects where the caller holds p_read / p_write.
-- p_client_writes false leaves writes to the service role. Every later migration that creates a table calls it.
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

-- Anon reaches nothing in property except the legal_* global rows granted back at the end.
revoke all on all tables in schema property from anon;
revoke all on all sequences in schema property from anon, authenticated;

do $$
declare
  t text;
begin
  -- Standard project data: members read and write.
  foreach t in array array[
    'properties', 'buildings', 'units', 'unit_types', 'floor_plans', 'portfolios', 'amenities', 'amenity_links', 'floor_plan_links',
    'tenants', 'tenant_households', 'tenant_occupants', 'tenant_documents', 'tenant_communications', 'leases', 'lease_parties',
    'lease_addenda', 'lease_templates', 'lease_rent_steps', 'record_items', 'property_owners', 'owners', 'vendors', 'vendor_assignments',
    'work_orders', 'maintenance_attachments', 'inspections', 'moves', 'notices', 'renewals', 'listings', 'prospects', 'showings',
    'applications', 'waitlist_entries', 'rent_comps', 'documents', 'media', 'activity', 'message_templates', 'message_threads',
    'thread_messages', 'announcements', 'resident_events', 'amenity_reservations', 'unit_turns', 'pm_schedules', 'inventory_items',
    'esign_requests', 'security_deposits', 'recurring_charges', 'rent_accounts', 'automations', 'report_schedules',
    'review_items', 'signals', 'briefings', 'impact_daily', 'playbook_installs',
    'chat_conversations', 'chat_files', 'chat_calls', 'chat_scheduled_calls', 'legal_jurisdictions', 'legal_resources'
  ] loop
    perform property.apply_member_rls(t);
  end loop;

  -- Financial: accounting.view reads, accounting.post writes (conversion_* arrive with INTL-04).
  foreach t in array array[
    'gl_accounts', 'bank_accounts', 'bank_reconciliations', 'transactions', 'bills', 'budgets', 'budget_lines', 'cost_jobs',
    'utility_allocations', 'cam_reconciliations', 'conversion_batches', 'conversion_lines'
  ] loop
    perform property.apply_member_rls(t, 'property.accounting.view', 'property.accounting.post');
  end loop;

  -- The ledger: accounting.view reads; writes only through the definer RPCs (and the reconciliation columns below).
  foreach t in array array['ledger_entries', 'ledger_lines', 'online_payments', 'stripe_events'] loop
    perform property.apply_member_rls(t, 'property.accounting.view', null, false);
  end loop;

  -- Server-written: members read, the service role writes.
  foreach t in array array[
    'autopay_plans', 'job_runs', 'notification_sends', 'automation_events', 'automation_runs', 'report_runs',
    'announcement_deliveries', 'portal_members'
  ] loop
    perform property.apply_member_rls(t, null, null, false);
  end loop;

  -- Roster, settings and the audit log get their own write rules below.
  perform property.apply_member_rls('team_members', null, 'property.team.invite');
  perform property.apply_member_rls('settings');
  perform property.apply_member_rls('audit_log', 'property.audit.view', null, false);

  -- role_grants keeps 01a's member read and team.assign + role-administrator writes.
  foreach t in array array['role_grants'] loop
    if to_regclass(format('property.%I', t)) is not null then
      execute format('alter table property.%I enable row level security', t);
      execute format('revoke delete, truncate, references, trigger on property.%I from authenticated', t);
    end if;
  end loop;

  -- Chat tables without a project_id: policies through the parent conversation or the profile itself.
  foreach t in array array['chat_members', 'chat_threads', 'chat_messages', 'chat_profiles', 'chat_notifications'] loop
    if to_regclass(format('property.%I', t)) is not null then
      execute format('alter table property.%I enable row level security', t);
      execute format('drop policy if exists %I on property.%I', t || '_demo_all', t);
      execute format('revoke all on property.%I from anon, authenticated', t);
      execute format('grant select, insert, update on property.%I to authenticated', t);
    end if;
  end loop;

  -- Backups and the migration ledger: owner and service role only.
  foreach t in array array['ledger_owner_backfill_backup', 'geiger_migrations', 'rls_tightening_backup'] loop
    if to_regclass(format('property.%I', t)) is not null then
      execute format('alter table property.%I enable row level security', t);
      execute format('revoke all on property.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- The ledger stays immutable for clients: entries change only through ledger_void, lines only in their reconciliation columns.
revoke update on property.ledger_entries from authenticated;
revoke update on property.ledger_lines from authenticated;
grant update (cleared, cleared_on, reconciliation_id) on property.ledger_lines to authenticated;
drop policy if exists ledger_lines_reconcile_update on property.ledger_lines;
create policy ledger_lines_reconcile_update on property.ledger_lines
  for update to authenticated
  using (project_id in (select property.permitted_project_ids('property.accounting.view'))
         and project_id in (select property.permitted_project_ids('property.accounting.post')))
  with check (project_id in (select property.permitted_project_ids('property.accounting.view'))
              and project_id in (select property.permitted_project_ids('property.accounting.post')));

-- Run history: the only client write is cancelling a run (lib/supabase/automation_runs.js), which needs automation.manage.
grant update (status, finished_at) on property.automation_runs to authenticated;
drop policy if exists automation_runs_cancel_update on property.automation_runs;
create policy automation_runs_cancel_update on property.automation_runs
  for update to authenticated
  using (project_id in (select property.permitted_project_ids('property.automation.manage')))
  with check (project_id in (select property.permitted_project_ids('property.automation.manage')) and status = 'cancelled');

-- Settings: members read; a key's write permission applies to the row before and after the change.
drop policy if exists settings_member_insert on property.settings;
create policy settings_member_insert on property.settings
  for insert to authenticated
  with check (project_id in (select property.member_project_ids())
              and (property.settings_write_permission(key) is null
                   or property.rbac_allows(property.settings_write_permission(key), project_id)));
drop policy if exists settings_member_update on property.settings;
create policy settings_member_update on property.settings
  for update to authenticated
  using (project_id in (select property.member_project_ids())
         and (property.settings_write_permission(key) is null
              or property.rbac_allows(property.settings_write_permission(key), project_id)))
  with check (project_id in (select property.member_project_ids())
              and (property.settings_write_permission(key) is null
                   or property.rbac_allows(property.settings_write_permission(key), project_id)));

-- Team roster: team.invite writes (policies above); the guard stops account links, planted Disabled rows and over-granting invites.
drop trigger if exists team_members_guard on property.team_members;
create trigger team_members_guard
before insert or update on property.team_members
for each row execute function property.team_members_guard();

-- Link tables: the parent's project (set by the *_set_project triggers) must be the member's, and so must the owner record.
drop policy if exists amenity_links_owner_insert_guard on property.amenity_links;
create policy amenity_links_owner_insert_guard on property.amenity_links
  as restrictive for insert to authenticated
  with check (property.link_owner_in_project(owner_type, owner_id, project_id));
drop policy if exists amenity_links_owner_update_guard on property.amenity_links;
create policy amenity_links_owner_update_guard on property.amenity_links
  as restrictive for update to authenticated
  using (property.link_owner_in_project(owner_type, owner_id, project_id))
  with check (property.link_owner_in_project(owner_type, owner_id, project_id));
drop policy if exists amenity_links_member_delete on property.amenity_links;
create policy amenity_links_member_delete on property.amenity_links
  for delete to authenticated
  using (project_id in (select property.member_project_ids()));
grant delete on property.amenity_links to authenticated;

drop policy if exists floor_plan_links_owner_insert_guard on property.floor_plan_links;
create policy floor_plan_links_owner_insert_guard on property.floor_plan_links
  as restrictive for insert to authenticated
  with check (property.link_owner_in_project(owner_type, owner_id, project_id));
drop policy if exists floor_plan_links_owner_update_guard on property.floor_plan_links;
create policy floor_plan_links_owner_update_guard on property.floor_plan_links
  as restrictive for update to authenticated
  using (property.link_owner_in_project(owner_type, owner_id, project_id))
  with check (property.link_owner_in_project(owner_type, owner_id, project_id));
drop policy if exists floor_plan_links_member_delete on property.floor_plan_links;
create policy floor_plan_links_member_delete on property.floor_plan_links
  for delete to authenticated
  using (project_id in (select property.member_project_ids()));
grant delete on property.floor_plan_links to authenticated;

-- Legal reference: everyone reads the global rows; members read and write their own project's rows (globals come from seeds).
drop policy if exists legal_jurisdictions_global_select on property.legal_jurisdictions;
create policy legal_jurisdictions_global_select on property.legal_jurisdictions
  for select to anon, authenticated
  using (project_id is null and deleted_at is null);
drop policy if exists legal_resources_global_select on property.legal_resources;
create policy legal_resources_global_select on property.legal_resources
  for select to anon, authenticated
  using (project_id is null and deleted_at is null);

-- Chat membership: read with the conversation, join where chat_can_add_member allows, change or leave only your own row.
drop policy if exists chat_members_member_select on property.chat_members;
create policy chat_members_member_select on property.chat_members
  for select to authenticated
  using (conversation_id in (select property.chat_readable_conversation_ids()));
drop policy if exists chat_members_member_insert on property.chat_members;
create policy chat_members_member_insert on property.chat_members
  for insert to authenticated
  with check (property.chat_can_add_member(conversation_id, profile_id));
drop policy if exists chat_members_member_update on property.chat_members;
create policy chat_members_member_update on property.chat_members
  for update to authenticated
  using (profile_id = (select auth.uid()) and conversation_id in (select property.chat_readable_conversation_ids()))
  with check (profile_id = (select auth.uid()) and conversation_id in (select property.chat_readable_conversation_ids()));
drop policy if exists chat_members_member_delete on property.chat_members;
create policy chat_members_member_delete on property.chat_members
  for delete to authenticated
  using (profile_id = (select auth.uid()) and conversation_id in (select property.chat_readable_conversation_ids()));
grant delete on property.chat_members to authenticated;

-- Threads follow their conversation.
drop policy if exists chat_threads_member_select on property.chat_threads;
create policy chat_threads_member_select on property.chat_threads
  for select to authenticated
  using (conversation_id in (select property.chat_readable_conversation_ids()));
drop policy if exists chat_threads_member_insert on property.chat_threads;
create policy chat_threads_member_insert on property.chat_threads
  for insert to authenticated
  with check (conversation_id in (select property.chat_readable_conversation_ids())
              and (created_by is null or created_by = (select auth.uid())));
drop policy if exists chat_threads_member_update on property.chat_threads;
create policy chat_threads_member_update on property.chat_threads
  for update to authenticated
  using (conversation_id in (select property.chat_readable_conversation_ids()))
  with check (conversation_id in (select property.chat_readable_conversation_ids()));

-- Messages: read with the conversation; post, edit and delete only as yourself (reactions go through chat_toggle_reaction).
drop policy if exists chat_messages_member_select on property.chat_messages;
create policy chat_messages_member_select on property.chat_messages
  for select to authenticated
  using (conversation_id in (select property.chat_readable_conversation_ids()));
drop policy if exists chat_messages_member_insert on property.chat_messages;
create policy chat_messages_member_insert on property.chat_messages
  for insert to authenticated
  with check (author_id = (select auth.uid()) and conversation_id in (select property.chat_readable_conversation_ids()));
drop policy if exists chat_messages_member_update on property.chat_messages;
create policy chat_messages_member_update on property.chat_messages
  for update to authenticated
  using (author_id = (select auth.uid()) and conversation_id in (select property.chat_readable_conversation_ids()))
  with check (author_id = (select auth.uid()) and conversation_id in (select property.chat_readable_conversation_ids()));

-- Profiles: the people of your projects plus yourself; you write only your own (the profile id is the auth user id).
drop policy if exists chat_profiles_member_select on property.chat_profiles;
create policy chat_profiles_member_select on property.chat_profiles
  for select to authenticated
  using (id = (select auth.uid()) or project_ids && array(select property.member_project_ids()));
drop policy if exists chat_profiles_own_insert on property.chat_profiles;
create policy chat_profiles_own_insert on property.chat_profiles
  for insert to authenticated
  with check (id = (select auth.uid()));
drop policy if exists chat_profiles_own_update on property.chat_profiles;
create policy chat_profiles_own_update on property.chat_profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Notifications: sent by members (as themselves) to anyone in the project; read and marked only by their recipient.
drop policy if exists chat_notifications_member_select on property.chat_notifications;
create policy chat_notifications_member_select on property.chat_notifications
  for select to authenticated
  using (profile_id = (select auth.uid()) and project_id in (select property.member_project_ids()));
drop policy if exists chat_notifications_member_insert on property.chat_notifications;
create policy chat_notifications_member_insert on property.chat_notifications
  for insert to authenticated
  with check (project_id in (select property.member_project_ids()) and (actor_id is null or actor_id = (select auth.uid())));
drop policy if exists chat_notifications_member_update on property.chat_notifications;
create policy chat_notifications_member_update on property.chat_notifications
  for update to authenticated
  using (profile_id = (select auth.uid()) and project_id in (select property.member_project_ids()))
  with check (profile_id = (select auth.uid()) and project_id in (select property.member_project_ids()));

-- Everything else: a table with a project_id and only open policies gets member RLS; one without a project is closed to clients.
do $$
declare
  r record;
  v_policy record;
begin
  for r in
    select c.relname,
           exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'project_id' and not a.attisdropped) as scoped
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'property' and c.relkind in ('r', 'p') and c.relname <> 'rls_tightening_backup'
       and not exists (
         select 1 from pg_policies p
          where p.schemaname = 'property' and p.tablename = c.relname
            and coalesce(p.qual, '') <> 'true' and coalesce(p.with_check, '') <> 'true'
       )
  loop
    if r.scoped then
      perform property.apply_member_rls(r.relname);
    else
      execute format('alter table property.%I enable row level security', r.relname);
      for v_policy in select p.policyname from pg_policies p where p.schemaname = 'property' and p.tablename = r.relname loop
        execute format('drop policy %I on property.%I', v_policy.policyname, r.relname);
      end loop;
      execute format('revoke all on property.%I from anon, authenticated', r.relname);
    end if;
  end loop;
end $$;

-- Views (security_invoker, so their tables' RLS applies): authenticated reads, nobody writes through them.
do $$
declare
  v text;
begin
  for v in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'property' and c.relkind in ('v', 'm')
  loop
    execute format('revoke all on property.%I from anon, authenticated', v);
    execute format('grant select on property.%I to authenticated', v);
  end loop;
end $$;

-- The playground reads the global legal rows signed out.
grant select on property.legal_jurisdictions, property.legal_resources to anon;

-- Tables created later start closed to anon and without hard deletes; their migration calls property.apply_member_rls().
alter default privileges for role postgres in schema property revoke all on tables from anon;
alter default privileges for role postgres in schema property revoke delete, truncate on tables from authenticated;
alter default privileges for role postgres in schema property revoke all on sequences from anon;

-- @down
drop trigger if exists team_members_guard on property.team_members;

do $$
declare
  v_saved jsonb;
  v_item jsonb;
  v_cur record;
  v_roles text;
  v_kind text;
begin
  select payload into v_saved from property.rls_tightening_backup where id;
  if v_saved is null then
    raise exception 'RLS rollback snapshot is unavailable';
  end if;

  -- Bodies first, so nothing restored below references this migration's helpers.
  for v_item in select value from jsonb_array_elements(v_saved -> 'functions') loop
    execute v_item #>> '{}';
  end loop;

  for v_cur in select * from pg_policies where schemaname = 'property' and tablename <> 'rls_tightening_backup' loop
    execute format('drop policy %I on %I.%I', v_cur.policyname, v_cur.schemaname, v_cur.tablename);
  end loop;
  for v_item in select value from jsonb_array_elements(v_saved -> 'policies') loop
    continue when to_regclass(format('%I.%I', v_item ->> 'schemaname', v_item ->> 'tablename')) is null;
    select string_agg(quote_ident(x), ', ') into v_roles from jsonb_array_elements_text(v_item -> 'roles') x;
    execute format('create policy %I on %I.%I as %s for %s to %s%s%s',
      v_item ->> 'policyname', v_item ->> 'schemaname', v_item ->> 'tablename', v_item ->> 'permissive', v_item ->> 'cmd', v_roles,
      case when v_item ->> 'qual' is not null then ' using (' || (v_item ->> 'qual') || ')' else '' end,
      case when v_item ->> 'with_check' is not null then ' with check (' || (v_item ->> 'with_check') || ')' else '' end);
  end loop;

  for v_cur in
    select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'property' and c.relkind in ('r', 'p', 'v', 'm', 'S') and c.relname <> 'rls_tightening_backup'
  loop
    execute format('revoke all on %s property.%I from anon, authenticated',
                   case when v_cur.relkind = 'S' then 'sequence' else 'table' end, v_cur.relname);
  end loop;
  for v_item in select value from jsonb_array_elements(v_saved -> 'grants') loop
    continue when to_regclass(format('property.%I', v_item ->> 'relation')) is null;
    v_kind := case when v_item ->> 'kind' = 'S' then 'sequence' else 'table' end;
    execute format('grant %s on %s property.%I to %I%s', v_item ->> 'privilege', v_kind, v_item ->> 'relation', v_item ->> 'grantee',
                   case when (v_item ->> 'grantable')::boolean then ' with grant option' else '' end);
  end loop;
  for v_item in select value from jsonb_array_elements(v_saved -> 'column_grants') loop
    continue when to_regclass(format('property.%I', v_item ->> 'relation')) is null;
    execute format('grant %s (%I) on property.%I to %I%s', v_item ->> 'privilege', v_item ->> 'column', v_item ->> 'relation', v_item ->> 'grantee',
                   case when (v_item ->> 'grantable')::boolean then ' with grant option' else '' end);
  end loop;

  for v_item in select value from jsonb_array_elements(v_saved -> 'table_states') loop
    continue when to_regclass(format('property.%I', v_item ->> 'table')) is null;
    execute format('alter table property.%I %s row level security', v_item ->> 'table',
                   case when (v_item ->> 'rls')::boolean then 'enable' else 'disable' end);
    execute format('alter table property.%I %s row level security', v_item ->> 'table',
                   case when (v_item ->> 'force')::boolean then 'force' else 'no force' end);
  end loop;
end $$;

alter default privileges for role postgres in schema property grant all on tables to anon;
alter default privileges for role postgres in schema property grant delete, truncate on tables to authenticated;
alter default privileges for role postgres in schema property grant all on sequences to anon;

drop function if exists property.apply_member_rls(text, text, text, boolean);
drop function if exists property.team_members_guard();
drop function if exists property.team_role_within_rights(uuid, text);
drop function if exists property.chat_can_add_member(uuid, uuid);
drop function if exists property.chat_readable_conversation_ids();
drop function if exists property.link_owner_in_project(text, uuid, uuid);
drop function if exists property.settings_write_permission(text);
drop function if exists property.ledger_foreign_dimension(uuid, jsonb);
drop function if exists property.permitted_project_ids(text);
drop table if exists property.rls_tightening_backup;
