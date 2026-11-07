-- Record events for maintenance requests (ORCH-01)
--
-- Supersedes property.record_event_trigger() from
-- 20261015214949_fix_record_event_trigger_array_append and owns it from here
-- on (LEAS-42 extends this version when it adds work_order.status_changed).
-- Resident-portal requests (kind = request) now emit maintenance_request.created;
-- converting a request (kind request -> work_order on the same row) emits
-- work_order.created once with convertedFromRequest; work_order.completed fires
-- for both kinds. Payloads carry kind and source so workflows can target them.
-- The emit_record_event grant to anon is untouched (PLAT-01 owns it).

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
  wk text;
  converted boolean := false;
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
      -- Requests (resident portal / staff intake) and work orders share the table; a request converts by flipping kind.
      wk := lower(coalesce(n->>'kind', 'work_order'));
      if tg_op = 'INSERT' then
        if wk = 'request' then evs := array_append(evs, 'maintenance_request.created');
        elsif wk = 'work_order' then evs := array_append(evs, 'work_order.created');
        end if;
      elsif wk = 'work_order' and lower(coalesce(o->>'kind', '')) = 'request' then
        converted := true;
        evs := array_append(evs, 'work_order.created');
      end if;
      if wk in ('work_order', 'request') and ns = 'completed' and changed then
        evs := array_append(evs, 'work_order.completed');
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
        jsonb_strip_nulls(jsonb_build_object(
          'status', n->>'status',
          'previousStatus', o->>'status',
          'kind', case when tg_table_name = 'work_orders' then n->>'kind' end,
          'source', case when tg_table_name = 'work_orders' then n->'metadata'->>'source' end,
          'convertedFromRequest', case when converted and e = 'work_order.created' then true end
        ))
      );
    end loop;
  exception when others then
    raise warning 'record_event_trigger(%): %', tg_table_name, sqlerrm;
  end;
  return new;
end;
$$;

-- @down
-- Restore the body from 20261015214949.
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
