-- Fix record event trigger array append
--
-- Supersedes property.record_event_trigger() from
-- 20261015212609_messaging_scheduler_automations: `text[] || 'literal'` parsed
-- the literal as an array ("malformed array literal"), so the swallowed error
-- meant no events were ever queued. Now uses array_append(). Owns
-- property.record_event_trigger() from here on.

-- @up
create or replace function property.record_event_trigger()
returns trigger
language plpgsql
security definer
set search_path = property, public
as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  ns text := lower(coalesce(n->>'status', ''));
  os text := lower(coalesce(o->>'status', ''));
  changed boolean := tg_op = 'INSERT' or ns is distinct from os;
  evs text[] := array[]::text[];
  e text;
  kind text;
begin
  if n->>'deleted_at' is not null then return new; end if;
  begin
    if tg_table_name = 'leases' then
      if tg_op = 'INSERT' then evs := array_append(evs, 'lease.created'); end if;
      if ns = 'active' and changed then evs := array_append(evs, 'lease.activated'); end if;
    elsif tg_table_name = 'applications' then
      if tg_op = 'INSERT' and ns <> 'draft' then evs := array_append(evs, 'application.submitted'); end if;
      if ns = 'approved' and changed then evs := array_append(evs, 'application.approved'); end if;
    elsif tg_table_name = 'work_orders' then
      if coalesce(n->>'kind', 'work_order') = 'work_order' then
        if tg_op = 'INSERT' then evs := array_append(evs, 'work_order.created'); end if;
        if ns = 'completed' and changed then evs := array_append(evs, 'work_order.completed'); end if;
      end if;
    elsif tg_table_name = 'transactions' then
      if tg_op = 'INSERT'
         and lower(coalesce(n->>'txn_type', n->>'kind', '')) in ('income', 'payment', 'receipt')
         and (n->>'tenant_id' is not null or n->>'lease_id' is not null) then
        evs := array_append(evs, 'payment.received');
      end if;
    elsif tg_table_name = 'moves' then
      kind := lower(coalesce(n->>'kind', 'in'));
      if n->>'move_date' is not null
         and (tg_op = 'INSERT' or (n->>'move_date') is distinct from (o->>'move_date')) then
        evs := array_append(evs, case when kind = 'out' then 'move_out.scheduled' else 'move_in.scheduled' end);
      end if;
    end if;

    foreach e in array evs loop
      perform property.emit_record_event(
        nullif(n->>'project_id', '')::uuid, e, tg_table_name, (n->>'id')::uuid,
        jsonb_build_object('status', n->>'status', 'previousStatus', o->>'status')
      );
    end loop;
  exception when others then
    raise warning 'record_event_trigger(%): %', tg_table_name, sqlerrm;
  end;
  return new;
end;
$$;

-- @down
-- Restore the previous (buggy) body from 20261015212609.
create or replace function property.record_event_trigger()
returns trigger
language plpgsql
security definer
set search_path = property, public
as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  ns text := lower(coalesce(n->>'status', ''));
  os text := lower(coalesce(o->>'status', ''));
  changed boolean := tg_op = 'INSERT' or ns is distinct from os;
  evs text[] := array[]::text[];
  e text;
  kind text;
begin
  if n->>'deleted_at' is not null then return new; end if;
  begin
    if tg_table_name = 'leases' then
      if tg_op = 'INSERT' then evs := evs || 'lease.created'; end if;
      if ns = 'active' and changed then evs := evs || 'lease.activated'; end if;
    elsif tg_table_name = 'applications' then
      if tg_op = 'INSERT' and ns <> 'draft' then evs := evs || 'application.submitted'; end if;
      if ns = 'approved' and changed then evs := evs || 'application.approved'; end if;
    elsif tg_table_name = 'work_orders' then
      if coalesce(n->>'kind', 'work_order') = 'work_order' then
        if tg_op = 'INSERT' then evs := evs || 'work_order.created'; end if;
        if ns = 'completed' and changed then evs := evs || 'work_order.completed'; end if;
      end if;
    elsif tg_table_name = 'transactions' then
      if tg_op = 'INSERT'
         and lower(coalesce(n->>'txn_type', n->>'kind', '')) in ('income', 'payment', 'receipt')
         and (n->>'tenant_id' is not null or n->>'lease_id' is not null) then
        evs := evs || 'payment.received';
      end if;
    elsif tg_table_name = 'moves' then
      kind := lower(coalesce(n->>'kind', 'in'));
      if n->>'move_date' is not null
         and (tg_op = 'INSERT' or (n->>'move_date') is distinct from (o->>'move_date')) then
        evs := evs || case when kind = 'out' then 'move_out.scheduled' else 'move_in.scheduled' end;
      end if;
    end if;

    foreach e in array evs loop
      perform property.emit_record_event(
        nullif(n->>'project_id', '')::uuid, e, tg_table_name, (n->>'id')::uuid,
        jsonb_build_object('status', n->>'status', 'previousStatus', o->>'status')
      );
    end loop;
  exception when others then
    raise warning 'record_event_trigger(%): %', tg_table_name, sqlerrm;
  end;
  return new;
end;
$$;
