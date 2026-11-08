-- Prospect contact keys (LEAS-02)
--
-- Lead intake matches a new inquiry to an existing prospect by email, then phone, within the project. Adds to
-- property.prospects: email_lc (lower-cased, trimmed email) and phone_e164 (E.164, US default), both generated so
-- staff edits, imports and intake always agree, and first_touch_at (when the lead first reached us; backfilled from
-- created_at). Owns property.phone_e164(text), which mirrors normalizePhone() in lib/leasing/leads/contact.js.
-- Also indexes inquiry record_items by provider message id (retries file once) and by hashed client IP (rate limit).

-- @up
create schema if not exists property;

-- E.164 from free text: drops an extension, keeps a +/00 international number of 8-15 digits, else US (10 digits, or 11 starting 1).
create or replace function property.phone_e164(p_phone text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  with s as (
    select regexp_replace(regexp_replace(coalesce(p_phone, ''), '^\s+|\s+$', '', 'g'), '\s*(ext\.?|extension|x|#)\s*\d+\s*$', '', 'i') as main
  ), d as (
    select main, regexp_replace(main, '\D', '', 'g') as digits from s
  )
  select case
    when main ~ '^\+' then case when length(digits) between 8 and 15 then '+' || digits end
    when main ~ '^00' then case when length(digits) - 2 between 8 and 15 then '+' || substr(digits, 3) end
    when length(digits) = 10 then '+1' || digits
    when length(digits) = 11 and left(digits, 1) = '1' then '+' || digits
  end
  from d
$$;
revoke all on function property.phone_e164(text) from public, anon;
grant execute on function property.phone_e164(text) to authenticated, service_role;

alter table property.prospects add column if not exists email_lc text generated always as (lower(btrim(email))) stored;
alter table property.prospects add column if not exists phone_e164 text generated always as (property.phone_e164(phone)) stored;
alter table property.prospects add column if not exists first_touch_at timestamptz;

update property.prospects set first_touch_at = created_at where first_touch_at is null;
alter table property.prospects alter column first_touch_at set default now();

create index if not exists prospects_email_lc_idx on property.prospects (project_id, email_lc) where deleted_at is null;
create index if not exists prospects_phone_e164_idx on property.prospects (project_id, phone_e164) where deleted_at is null;

create index if not exists record_items_inquiry_external_idx
  on property.record_items (project_id, (metadata ->> 'externalId'))
  where kind = 'inquiry' and deleted_at is null;
create index if not exists record_items_inquiry_ip_idx
  on property.record_items ((metadata ->> 'ipHash'), created_at)
  where kind = 'inquiry' and deleted_at is null;

-- @down
drop index if exists property.record_items_inquiry_ip_idx;
drop index if exists property.record_items_inquiry_external_idx;
drop index if exists property.prospects_phone_e164_idx;
drop index if exists property.prospects_email_lc_idx;
alter table property.prospects drop column if exists first_touch_at;
alter table property.prospects drop column if exists phone_e164;
alter table property.prospects drop column if exists email_lc;
drop function if exists property.phone_e164(text);
