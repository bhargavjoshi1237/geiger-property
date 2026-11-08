-- Project scope required (PLAT-01b): every live row of a project table has a project.
-- Owns amenity_links/floor_plan_links.project_id (+ *_set_project triggers), the <table>_project_required checks and property.project_scope_audit().
-- Checks are NOT VALID (new and updated rows); soft-deleted rows may keep a null project, so a later migration can validate them.
-- Unconstrained by design: legal_*, settings (spec), job_runs (cron covers every project), audit_log, stripe_events; review_items allows source_type 'job_run'.
-- Also seeds each property project's own chart of accounts (the unscoped chart is soft-deleted and no longer read).

-- @up

-- Link tables carry their parent's project.
do $$
begin
  if to_regclass('property.amenity_links') is not null then
    alter table property.amenity_links add column if not exists project_id uuid references public.projects(id) on delete cascade;
    update property.amenity_links l set project_id = a.project_id
      from property.amenities a where a.id = l.amenity_id and l.project_id is distinct from a.project_id;
    create index if not exists amenity_links_project_idx on property.amenity_links (project_id);
  end if;
  if to_regclass('property.floor_plan_links') is not null then
    alter table property.floor_plan_links add column if not exists project_id uuid references public.projects(id) on delete cascade;
    update property.floor_plan_links l set project_id = f.project_id
      from property.floor_plans f where f.id = l.floor_plan_id and l.project_id is distinct from f.project_id;
    create index if not exists floor_plan_links_project_idx on property.floor_plan_links (project_id);
  end if;
end $$;

-- The parent decides a link's project, whatever the client stamped (definer: sees the parent under any RLS).
create or replace function property.amenity_links_set_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.project_id := coalesce((select a.project_id from property.amenities a where a.id = new.amenity_id), new.project_id);
  return new;
end;
$$;
revoke all on function property.amenity_links_set_project() from public, anon, authenticated;

create or replace function property.floor_plan_links_set_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.project_id := coalesce((select f.project_id from property.floor_plans f where f.id = new.floor_plan_id), new.project_id);
  return new;
end;
$$;
revoke all on function property.floor_plan_links_set_project() from public, anon, authenticated;

do $$
begin
  if to_regclass('property.amenity_links') is not null then
    drop trigger if exists amenity_links_set_project on property.amenity_links;
    create trigger amenity_links_set_project
      before insert or update of amenity_id, project_id on property.amenity_links
      for each row execute function property.amenity_links_set_project();
  end if;
  if to_regclass('property.floor_plan_links') is not null then
    drop trigger if exists floor_plan_links_set_project on property.floor_plan_links;
    create trigger floor_plan_links_set_project
      before insert or update of floor_plan_id, project_id on property.floor_plan_links
      for each row execute function property.floor_plan_links_set_project();
  end if;
end $$;

-- No new or updated live row without a project (soft-deleted rows may keep a null one).
do $$
declare
  t text;
  v_soft boolean;
  v_check text;
begin
  foreach t in array array[
    'activity', 'amenities', 'amenity_links', 'amenity_reservations', 'announcement_deliveries', 'announcements',
    'applications', 'automation_events', 'automation_runs', 'automations', 'autopay_plans', 'bank_accounts',
    'bank_reconciliations', 'bills', 'briefings', 'budget_lines', 'budgets', 'buildings', 'cam_reconciliations',
    'cost_jobs', 'documents', 'esign_requests', 'floor_plan_links', 'floor_plans', 'gl_accounts', 'impact_daily',
    'inspections', 'inventory_items', 'lease_addenda', 'lease_parties', 'lease_rent_steps', 'lease_templates', 'leases',
    'ledger_entries', 'ledger_lines', 'listings', 'maintenance_attachments', 'media', 'message_templates',
    'message_threads', 'moves', 'notices', 'notification_sends', 'online_payments', 'owners', 'playbook_installs',
    'pm_schedules', 'portal_members', 'portfolios', 'properties', 'property_owners', 'prospects', 'record_items',
    'recurring_charges', 'renewals', 'rent_accounts', 'rent_comps', 'report_runs', 'report_schedules',
    'resident_events', 'review_items', 'role_grants', 'security_deposits', 'showings', 'signals', 'team_members',
    'tenant_communications', 'tenant_documents', 'tenant_households', 'tenant_occupants', 'tenants', 'thread_messages',
    'transactions', 'unit_turns', 'unit_types', 'units', 'utility_allocations', 'vendor_assignments', 'vendors',
    'waitlist_entries', 'work_orders'
  ]
  loop
    if to_regclass(format('property.%I', t)) is null then continue; end if;
    if exists (
      select 1 from pg_constraint
      where conrelid = format('property.%I', t)::regclass and conname = t || '_project_required'
    ) then continue; end if;
    select exists (
      select 1 from pg_attribute
      where attrelid = format('property.%I', t)::regclass and attname = 'deleted_at' and not attisdropped
    ) into v_soft;
    v_check := 'project_id is not null' || case when v_soft then ' or deleted_at is not null' else '' end;
    if t = 'review_items' then v_check := v_check || ' or source_type = ''job_run'''; end if;
    execute format('alter table property.%I add constraint %I check (%s) not valid', t, t || '_project_required', v_check);
  end loop;
end $$;

-- The null-project report: per property table with a project_id, live and soft-deleted rows without one.
create or replace function property.project_scope_audit()
returns table (table_name text, required boolean, live_null bigint, deleted_null bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  v_soft boolean;
begin
  for r in
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'project_id' and not a.attisdropped
    where n.nspname = 'property' and c.relkind in ('r', 'p')
    order by c.relname
  loop
    select exists (
      select 1 from pg_attribute where attrelid = r.oid and attname = 'deleted_at' and not attisdropped
    ) into v_soft;
    table_name := r.relname;
    required := exists (select 1 from pg_constraint where conrelid = r.oid and conname = r.relname || '_project_required');
    execute format(
      'select count(*) filter (where project_id is null and %s), count(*) filter (where project_id is null and %s) from property.%I',
      case when v_soft then 'deleted_at is null' else 'true' end,
      case when v_soft then 'deleted_at is not null' else 'false' end,
      r.relname
    ) into live_null, deleted_null;
    return next;
  end loop;
end;
$$;
revoke all on function property.project_scope_audit() from public, anon, authenticated;
grant execute on function property.project_scope_audit() to service_role;

-- Each property project gets its own chart of accounts (idempotent), so nothing reads the unscoped one.
do $$
declare
  p uuid;
begin
  if to_regprocedure('property.ledger_ensure_default_chart(uuid)') is null
     or to_regclass('property.properties') is null or to_regclass('property.gl_accounts') is null
     or to_regclass('property.ledger_entries') is null or to_regclass('property.settings') is null then
    return;
  end if;
  for p in
    select pr.id from public.projects pr
    where pr.deleted_at is null and (
      exists (select 1 from property.properties x where x.project_id = pr.id and x.deleted_at is null)
      or exists (select 1 from property.gl_accounts x where x.project_id = pr.id and x.deleted_at is null)
      or exists (select 1 from property.ledger_entries x where x.project_id = pr.id and x.deleted_at is null)
      or exists (select 1 from property.settings x where x.project_id = pr.id and x.deleted_at is null)
    )
  loop
    perform property.ledger_ensure_default_chart(p);
  end loop;
end $$;

-- @down

-- Charts seeded above stay: they are project data.
drop function if exists property.project_scope_audit();

do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'property' and c.contype = 'c' and c.conname like '%\_project\_required'
  loop
    execute format('alter table %s drop constraint if exists %I', r.tbl, r.conname);
  end loop;
end $$;

drop trigger if exists amenity_links_set_project on property.amenity_links;
drop trigger if exists floor_plan_links_set_project on property.floor_plan_links;
drop function if exists property.amenity_links_set_project();
drop function if exists property.floor_plan_links_set_project();
drop index if exists property.amenity_links_project_idx;
drop index if exists property.floor_plan_links_project_idx;
alter table if exists property.amenity_links drop column if exists project_id;
alter table if exists property.floor_plan_links drop column if exists project_id;
