-- Billing rent schedule (CORE-01)
--
-- Owns property.lease_rent_steps (the lease's dated monthly rent, the only source of billed
-- rent) and property.lease_sync_current_rent (the only writer of leases.rent, now a cache of
-- the step in force). Makes rent_accounts the 1:1 collection record per lease (unique lease_id)
-- and deprecates rent_accounts.rent / due_day / frequency (dropped in a later release).
-- Backfills an initial step per lease, schedule steps from metadata.rentSchedule and an
-- mtm_premium step from metadata.mtmSince / mtmPremium, keeping each lease's rent in force today.

-- @up
create extension if not exists pgcrypto;

create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

create or replace function property.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists property.lease_rent_steps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  lease_id uuid not null,
  effective_date date not null,
  amount numeric(14,2) not null,
  change_mode text,
  change_value numeric,
  source text not null default 'manual',
  note text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint lease_rent_steps_change_mode_chk check (change_mode in ('amount', 'percent')),
  constraint lease_rent_steps_source_chk check (source in ('initial', 'schedule', 'mtm_premium', 'renewal', 'amendment', 'manual')),
  constraint lease_rent_steps_status_chk check (status in ('active', 'cancelled'))
);

create unique index if not exists lease_rent_steps_lease_date_uidx
  on property.lease_rent_steps (lease_id, effective_date)
  where deleted_at is null and status = 'active';
create index if not exists lease_rent_steps_lease_idx on property.lease_rent_steps (lease_id) where deleted_at is null;
create index if not exists lease_rent_steps_project_idx on property.lease_rent_steps (project_id) where deleted_at is null;

drop trigger if exists lease_rent_steps_touch_updated_at on property.lease_rent_steps;
create trigger lease_rent_steps_touch_updated_at
before update on property.lease_rent_steps
for each row execute function property.touch_updated_at();

-- Demo-open RLS per convention; PLAT-01 tightens it.
alter table property.lease_rent_steps enable row level security;
drop policy if exists lease_rent_steps_demo_all on property.lease_rent_steps;
create policy lease_rent_steps_demo_all on property.lease_rent_steps
  for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on property.lease_rent_steps to anon, authenticated, service_role;

-- leases.rent ← the latest active step on or before p_as_of, else the earliest step; no steps → unchanged.
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

revoke all on function property.lease_sync_current_rent(uuid, date) from public;
grant execute on function property.lease_sync_current_rent(uuid, date) to authenticated, service_role;

-- One collection record per lease.
create unique index if not exists rent_accounts_lease_uidx
  on property.rent_accounts (lease_id)
  where deleted_at is null and lease_id is not null;

comment on column property.rent_accounts.rent is 'Deprecated (CORE-01): billed rent comes from property.lease_rent_steps; drop in a later release.';
comment on column property.rent_accounts.due_day is 'Deprecated (CORE-01): the due day is the rentDueDay policy; drop in a later release.';
comment on column property.rent_accounts.frequency is 'Deprecated (CORE-01): rent is monthly only; drop in a later release.';

-- Backfill (idempotent: leases that already have steps are skipped).
do $$
declare
  l record;
  s jsonb;
  v_sched jsonb;
  v_start date;
  v_rent numeric;
  v_eff date;
  v_mode text;
  v_val numeric;
  v_amount numeric;
  v_mtm date;
  v_premium numeric;
  v_num constant text := '^-?[0-9]+(\.[0-9]+)?$';
  v_day constant text := '^\d{4}-\d{2}-\d{2}';
begin
  for l in
    select id, project_id, rent, term_start, created_at, metadata
    from property.leases
    where deleted_at is null
  loop
    if exists (select 1 from property.lease_rent_steps where lease_id = l.id and deleted_at is null) then
      continue;
    end if;
    v_sched := case when jsonb_typeof(l.metadata->'rentSchedule') = 'array' then l.metadata->'rentSchedule' else '[]'::jsonb end;
    v_start := coalesce(l.term_start, l.created_at::date);
    v_mtm := case when coalesce(l.metadata->>'mtmSince', '') ~ v_day then left(l.metadata->>'mtmSince', 10)::date end;
    v_premium := case when coalesce(l.metadata->>'mtmPremium', '') ~ v_num then (l.metadata->>'mtmPremium')::numeric else 0 end;
    if v_mtm is null or v_mtm <= v_start then v_premium := 0; end if;

    -- Initial amount: the schedule's base rent, else today's rent less an applied month-to-month premium.
    if jsonb_array_length(v_sched) > 0 then
      v_rent := case when coalesce(l.metadata->>'baseRent', '') ~ v_num then (l.metadata->>'baseRent')::numeric else l.rent end;
    else
      v_rent := greatest(coalesce(l.rent, 0) - v_premium, 0);
    end if;
    insert into property.lease_rent_steps (project_id, lease_id, effective_date, amount, change_mode, change_value, source, note, metadata)
    values (l.project_id, l.id, v_start, round(coalesce(v_rent, 0), 2), 'amount', round(coalesce(v_rent, 0), 2), 'initial', null, '{"backfill": true}'::jsonb);

    -- Schedule rows chain from the base rent in date order, as the old editor projected them.
    for s in
      select value from jsonb_array_elements(v_sched)
      where coalesce(value->>'effectiveDate', '') ~ v_day
      order by left(value->>'effectiveDate', 10)
    loop
      v_eff := left(s->>'effectiveDate', 10)::date;
      v_mode := case when s->>'mode' = 'percent' then 'percent' else 'amount' end;
      if v_mode = 'percent' then
        v_val := case when coalesce(s->>'percent', '') ~ v_num then (s->>'percent')::numeric else 0 end;
        v_amount := round(v_rent * (1 + v_val / 100), 2);
      else
        v_val := case when coalesce(s->>'amount', '') ~ v_num then (s->>'amount')::numeric else v_rent end;
        v_amount := round(v_val, 2);
      end if;
      v_rent := v_amount;
      if not exists (
        select 1 from property.lease_rent_steps
        where lease_id = l.id and effective_date = v_eff and deleted_at is null and status = 'active'
      ) then
        insert into property.lease_rent_steps (project_id, lease_id, effective_date, amount, change_mode, change_value, source, note, metadata)
        values (l.project_id, l.id, v_eff, v_amount, v_mode, v_val, 'schedule', nullif(s->>'note', ''),
                jsonb_build_object('backfill', true, 'scheduleId', s->>'id', 'appliedOn', s->>'appliedOn'));
      end if;
    end loop;

    -- Month-to-month premium: the rent in force today (which the old wizard raised by the premium).
    if v_premium > 0 and not exists (
      select 1 from property.lease_rent_steps
      where lease_id = l.id and effective_date = v_mtm and deleted_at is null and status = 'active'
    ) then
      insert into property.lease_rent_steps (project_id, lease_id, effective_date, amount, change_mode, change_value, source, note, metadata)
      values (l.project_id, l.id, v_mtm, round(l.rent, 2), 'amount', round(l.rent, 2), 'mtm_premium', 'Month-to-month premium',
              jsonb_build_object('backfill', true, 'premium', v_premium));
    end if;
  end loop;
end $$;

-- @down
comment on column property.rent_accounts.frequency is null;
comment on column property.rent_accounts.due_day is null;
comment on column property.rent_accounts.rent is null;
drop index if exists property.rent_accounts_lease_uidx;
drop function if exists property.lease_sync_current_rent(uuid, date);
drop table if exists property.lease_rent_steps cascade;
