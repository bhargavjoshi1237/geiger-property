-- Recurring charges billing columns (CORE-03)
--
-- The billing job (lib/billing/charges.js) reads a charge's end date, proration, rent alignment,
-- portal visibility and type from columns instead of metadata, and books it to its real GL id.
-- Adds those columns plus property_id (live and DRIFT-01 already have it; listed so this file is
-- self-contained), gives frequency the live default, and indexes the job's lookups.
-- Backfill (idempotent): the values from metadata, gl_account_id from the `account` label
-- ("<number> · <name>", same project), property_id from the lease, and Active charges the old job
-- skipped (metadata.autoPost = false) become Paused, marked legacyAutoPostOff so @down can undo it.

-- @up
alter table property.recurring_charges add column if not exists property_id uuid;
alter table property.recurring_charges add column if not exists ends_on date;
alter table property.recurring_charges add column if not exists prorate boolean not null default false;
alter table property.recurring_charges add column if not exists bill_with_rent boolean not null default true;
alter table property.recurring_charges add column if not exists show_in_portal boolean not null default true;
alter table property.recurring_charges add column if not exists charge_type text;

update property.recurring_charges set frequency = 'Monthly' where frequency is null;
alter table property.recurring_charges alter column frequency set default 'Monthly';
alter table property.recurring_charges alter column frequency set not null;

create index if not exists recurring_charges_lease_status_idx
  on property.recurring_charges (lease_id, status) where deleted_at is null;
create index if not exists recurring_charges_due_idx
  on property.recurring_charges (next_date) where status = 'Active' and deleted_at is null;

-- ends_on from metadata.endsOn (rows whose value isn't a date are left alone).
do $$
declare
  r record;
  d date;
begin
  for r in
    select id, metadata->>'endsOn' as v from property.recurring_charges
    where ends_on is null and coalesce(metadata->>'endsOn', '') <> ''
  loop
    begin
      d := r.v::date;
    exception when others then
      d := null;
    end;
    if d is not null then
      update property.recurring_charges set ends_on = d where id = r.id;
    end if;
  end loop;
end
$$;

update property.recurring_charges set prorate = true
where not prorate and metadata->>'prorate' = 'true';

update property.recurring_charges set show_in_portal = false
where show_in_portal and metadata->>'showInPortal' = 'false';

update property.recurring_charges set charge_type = metadata->>'chargeType'
where charge_type is null and coalesce(metadata->>'chargeType', '') <> '';

update property.recurring_charges rc set gl_account_id = (
  select g.id from property.gl_accounts g
  where g.project_id is not distinct from rc.project_id and g.deleted_at is null
    and rc.account = case when coalesce(g.number, '') <> '' then g.number || ' · ' || g.name else g.name end
  order by g.created_at limit 1
)
where rc.gl_account_id is null and coalesce(rc.account, '') <> ''
  and exists (
    select 1 from property.gl_accounts g
    where g.project_id is not distinct from rc.project_id and g.deleted_at is null
      and rc.account = case when coalesce(g.number, '') <> '' then g.number || ' · ' || g.name else g.name end
  );

update property.recurring_charges rc set property_id = l.property_id
from property.leases l
where rc.property_id is null and rc.lease_id = l.id and l.property_id is not null;

update property.recurring_charges
set status = 'Paused', metadata = (metadata - 'autoPost') || '{"legacyAutoPostOff": true}'::jsonb
where status = 'Active' and metadata->>'autoPost' = 'false';

-- @down
-- Copies the promoted values back into metadata, restores the old autoPost switch, then drops the new
-- indexes and columns. property_id (live before this file, owned by DRIFT-01), the frequency default
-- and the gl_account_id / property_id backfills are kept: they match the live schema and are correct data.
update property.recurring_charges
set metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
  'endsOn', to_char(ends_on, 'YYYY-MM-DD'),
  'prorate', case when prorate then true end,
  'showInPortal', case when not show_in_portal then false end,
  'chargeType', charge_type
))
where ends_on is not null or prorate or not show_in_portal or charge_type is not null;

update property.recurring_charges
set status = case when status = 'Paused' then 'Active' else status end,
    metadata = (metadata - 'legacyAutoPostOff') || '{"autoPost": false}'::jsonb
where metadata ? 'legacyAutoPostOff';

drop index if exists property.recurring_charges_due_idx;
drop index if exists property.recurring_charges_lease_status_idx;
alter table property.recurring_charges drop column if exists charge_type;
alter table property.recurring_charges drop column if exists show_in_portal;
alter table property.recurring_charges drop column if exists bill_with_rent;
alter table property.recurring_charges drop column if exists prorate;
alter table property.recurring_charges drop column if exists ends_on;
