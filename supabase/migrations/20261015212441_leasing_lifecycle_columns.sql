-- Leasing lifecycle columns
--
-- Promotes the lease and security-deposit dates that lists, reports and scheduled
-- jobs filter on (lease type/term type, signed, move-in, notice, move-out; deposit
-- move-out, return deadline, returned on, refund) from metadata to real columns,
-- and backfills renewals.response_due / inspections.kind / deposit refunds from
-- the metadata keys the older screens wrote. Owns no tables or functions.

-- @up
create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

alter table property.leases add column if not exists lease_type text;
alter table property.leases add column if not exists term_type text;
alter table property.leases add column if not exists signed_date date;
alter table property.leases add column if not exists move_in_date date;
alter table property.leases add column if not exists notice_date date;
alter table property.leases add column if not exists move_out_date date;

alter table property.security_deposits add column if not exists move_out_date date;
alter table property.security_deposits add column if not exists return_due date;
alter table property.security_deposits add column if not exists returned_on date;
alter table property.security_deposits add column if not exists refund_amount numeric;

create index if not exists leases_status_term_end_idx on property.leases (status, term_end);
create index if not exists leases_move_out_idx on property.leases (move_out_date);
create index if not exists leases_renewal_of_idx on property.leases (renewal_of_id);
create index if not exists security_deposits_return_due_idx on property.security_deposits (status, return_due);
create index if not exists renewals_lease_idx on property.renewals (lease_id);
create index if not exists notices_lease_idx on property.notices (lease_id);

-- Backfill promoted values from the metadata keys the earlier screens used.
update property.renewals
set response_due = (metadata->>'responseDue')::date
where response_due is null
  and metadata->>'responseDue' ~ '^\d{4}-\d{2}-\d{2}$';

update property.inspections
set kind = case metadata->>'inspectionType'
  when 'Move-in' then 'move_in'
  when 'Move-out' then 'move_out'
  when 'Routine' then 'routine'
  when 'Annual' then 'annual'
  when 'Drive-by' then 'drive_by'
  else null end
where kind is null
  and metadata ? 'inspectionType';

update property.security_deposits
set returned_on = (metadata->>'refundDate')::date
where returned_on is null
  and metadata->>'refundDate' ~ '^\d{4}-\d{2}-\d{2}$';

update property.security_deposits
set refund_amount = (metadata->>'refundAmount')::numeric
where refund_amount is null
  and metadata->>'refundAmount' ~ '^-?\d+(\.\d+)?$';

-- @down
drop index if exists property.notices_lease_idx;
drop index if exists property.renewals_lease_idx;
drop index if exists property.security_deposits_return_due_idx;
drop index if exists property.leases_renewal_of_idx;
drop index if exists property.leases_move_out_idx;
drop index if exists property.leases_status_term_end_idx;

alter table property.security_deposits drop column if exists refund_amount;
alter table property.security_deposits drop column if exists returned_on;
alter table property.security_deposits drop column if exists return_due;
alter table property.security_deposits drop column if exists move_out_date;

alter table property.leases drop column if exists move_out_date;
alter table property.leases drop column if exists notice_date;
alter table property.leases drop column if exists move_in_date;
alter table property.leases drop column if exists signed_date;
alter table property.leases drop column if exists term_type;
alter table property.leases drop column if exists lease_type;
