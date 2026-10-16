-- Maintenance links and turn ready date
--
-- Soft id links from property.work_orders to the preventive schedule, unit turn
-- and inspection that spawned them, plus pm_due_date as the occurrence key that
-- keeps preventive generation idempotent (one work order per schedule, due date
-- and unit). Also adds property.unit_turns.ready_date (actual ready date).

-- @up
create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

alter table property.work_orders add column if not exists pm_schedule_id uuid;
alter table property.work_orders add column if not exists pm_due_date date;
alter table property.work_orders add column if not exists unit_turn_id uuid;
alter table property.work_orders add column if not exists inspection_id uuid;

alter table property.unit_turns add column if not exists ready_date date;

create index if not exists work_orders_pm_schedule_idx on property.work_orders (pm_schedule_id);
create index if not exists work_orders_unit_turn_idx on property.work_orders (unit_turn_id);
create index if not exists work_orders_inspection_idx on property.work_orders (inspection_id);

-- One live work order per preventive occurrence (schedule + due date + unit).
create unique index if not exists work_orders_pm_occurrence_uidx
  on property.work_orders (pm_schedule_id, pm_due_date, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where deleted_at is null and pm_schedule_id is not null and pm_due_date is not null;

-- @down
drop index if exists property.work_orders_pm_occurrence_uidx;
drop index if exists property.work_orders_inspection_idx;
drop index if exists property.work_orders_unit_turn_idx;
drop index if exists property.work_orders_pm_schedule_idx;

alter table property.work_orders drop column if exists inspection_id;
alter table property.work_orders drop column if exists unit_turn_id;
alter table property.work_orders drop column if exists pm_due_date;
alter table property.work_orders drop column if exists pm_schedule_id;
-- unit_turns.ready_date predates this migration on live databases, so it stays.
