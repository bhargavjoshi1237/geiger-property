-- Lease ended stamp (CORE-02)
--
-- Owns property.lease_mark_ended() and its trigger leases_mark_ended on property.leases.
-- When a lease's status changes to Ended or Terminated it records, unless the same update sets them:
--   metadata.endedFrom = the status it ended from (billing skips a lease that never went live),
--   metadata.endedOn   = the project's business date, only when the lease has no move-out date,
-- so billing (lib/billing/rent.js billingWindow) knows where every ended lease stops, whichever path ended it.
-- Inserts are left alone (imported history). Trigger functions can't be called directly; execute is revoked from public and anon.

-- @up
create or replace function property.lease_mark_ended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.metadata, '{}'::jsonb);
  v_old jsonb := coalesce(old.metadata, '{}'::jsonb);
  v_tz text;
  v_day date;
begin
  if new.status is not distinct from old.status or new.status not in ('Ended', 'Terminated') then
    return new;
  end if;
  if (v_meta->>'endedFrom') is not distinct from (v_old->>'endedFrom') then
    v_meta := v_meta || jsonb_build_object('endedFrom', old.status);
  end if;
  if new.move_out_date is null and (v_meta->>'endedOn') is not distinct from (v_old->>'endedOn') then
    begin
      select nullif(s.value->>'timezone', '') into v_tz
      from property.settings s
      where s.project_id = new.project_id and s.key = 'company_profile' and s.deleted_at is null
      limit 1;
      v_day := (now() at time zone coalesce(v_tz, 'America/New_York'))::date;
    exception when others then
      v_day := current_date;
    end;
    v_meta := v_meta || jsonb_build_object('endedOn', to_char(v_day, 'YYYY-MM-DD'));
  end if;
  new.metadata := v_meta;
  return new;
end;
$$;

revoke all on function property.lease_mark_ended() from public, anon;
grant execute on function property.lease_mark_ended() to authenticated, service_role;

drop trigger if exists leases_mark_ended on property.leases;
create trigger leases_mark_ended
before update of status on property.leases
for each row execute function property.lease_mark_ended();

-- @down
drop trigger if exists leases_mark_ended on property.leases;
drop function if exists property.lease_mark_ended();
