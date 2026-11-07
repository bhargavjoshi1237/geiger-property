-- Immutable audit log (PLAT-09 step 1 slice, for the orchestration layer)
--
-- Owns property.audit_log, property.audit_row(), property.audit_log_reject_change()
-- and property.enable_audit(text). Append-only, database-written change history:
-- the trigger records the changed columns, the actor (auth.uid() / JWT email,
-- or the x-geiger-actor-* headers a service-role server call sets) and the
-- source (x-geiger-source header, e.g. app, job:signals, portal). No client role
-- can insert, update or delete rows; a trigger rejects UPDATE and DELETE for
-- everyone (as pods.audit_events does). PLAT-09 later attaches enable_audit to
-- the financial tables and adds the viewer.

-- @up
create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

create table if not exists property.audit_log (
  id bigint generated always as identity primary key,
  project_id uuid,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('insert', 'update', 'soft_delete', 'restore', 'delete')),
  changed text[] not null default '{}',
  before jsonb,
  after jsonb,
  actor_id uuid,
  actor_email text,
  actor_role text,
  source text,
  request_id text,
  occurred_at timestamptz not null default now()
);

create index if not exists audit_log_record_idx
  on property.audit_log (project_id, table_name, record_id, occurred_at desc);

-- Append-only: reject UPDATE and DELETE regardless of role.
create or replace function property.audit_log_reject_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'property.audit_log is append-only';
end;
$$;

drop trigger if exists audit_log_append_only on property.audit_log;
create trigger audit_log_append_only
before update or delete on property.audit_log
for each row execute function property.audit_log_reject_change();

alter table property.audit_log enable row level security;
revoke insert, update, delete on property.audit_log from anon, authenticated;
grant select on property.audit_log to authenticated, service_role;
drop policy if exists audit_log_read on property.audit_log;
create policy audit_log_read on property.audit_log for select to authenticated using (true);

-- Generic row audit trigger (AFTER INSERT/UPDATE/DELETE). Never blocks the write.
create or replace function property.audit_row()
returns trigger
language plpgsql
security definer
set search_path = property, public
as $$
declare
  n jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  o jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  rec jsonb := coalesce(n, o);
  headers jsonb;
  claims jsonb;
  cols text[] := '{}';
  b jsonb := '{}'::jsonb;
  a jsonb := '{}'::jsonb;
  k text;
  act text;
  actor uuid;
  email text;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then headers := null;
  end;
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then claims := null;
  end;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at') and (n->k) is distinct from (o->k) then
        cols := array_append(cols, k);
        b := b || jsonb_build_object(k, o->k);
        a := a || jsonb_build_object(k, n->k);
      end if;
    end loop;
    if coalesce(array_length(cols, 1), 0) = 0 then return null; end if;
    act := case
      when (o->>'deleted_at') is null and (n->>'deleted_at') is not null then 'soft_delete'
      when (o->>'deleted_at') is not null and (n->>'deleted_at') is null then 'restore'
      else 'update' end;
  elsif tg_op = 'INSERT' then
    act := 'insert';
    a := n;
  else
    act := 'delete';
    b := o;
  end if;

  actor := nullif(claims->>'sub', '')::uuid;
  email := claims->>'email';
  -- A service-role server call vouches for the signed-in user via headers.
  if actor is null and coalesce(claims->>'role', '') = 'service_role' then
    actor := nullif(headers->>'x-geiger-actor-id', '')::uuid;
    email := coalesce(email, nullif(headers->>'x-geiger-actor-email', ''));
  end if;

  insert into property.audit_log
    (project_id, table_name, record_id, action, changed, before, after, actor_id, actor_email, actor_role, source, request_id)
  values (
    nullif(rec->>'project_id', '')::uuid, tg_table_name, nullif(rec->>'id', '')::uuid, act, cols,
    case when act = 'insert' then null else b end,
    case when act = 'delete' then null else a end,
    actor, email, claims->>'role',
    coalesce(nullif(headers->>'x-geiger-source', ''), case when claims is null then 'db' else 'app' end),
    headers->>'x-request-id'
  );
  return null;
exception when others then
  raise warning 'audit_row(%): %', tg_table_name, sqlerrm;
  return null;
end;
$$;

-- Attach the audit trigger to a property table (idempotent).
create or replace function property.enable_audit(p_table text)
returns void
language plpgsql
as $$
begin
  if p_table !~ '^[a-z_][a-z0-9_]*$' then
    raise exception 'enable_audit: invalid table name %', p_table;
  end if;
  execute format('drop trigger if exists %I on property.%I', p_table || '_audit', p_table);
  execute format(
    'create trigger %I after insert or update or delete on property.%I for each row execute function property.audit_row()',
    p_table || '_audit', p_table
  );
end;
$$;

-- Workflow definitions are the first audited table; review_items, signals and
-- playbook_installs enable it in their own migrations.
select property.enable_audit('automations');

-- @down
drop trigger if exists automations_audit on property.automations;
drop function if exists property.enable_audit(text);
drop function if exists property.audit_row();
drop table if exists property.audit_log cascade;
drop function if exists property.audit_log_reject_change();
