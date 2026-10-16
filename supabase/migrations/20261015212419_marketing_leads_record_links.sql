-- Marketing & Leads record links
--
-- Soft-uuid links (house pattern: no FK) so the leasing funnel references records
-- by id: listing → lease, prospect → property/listing, showing → property,
-- application → listing name + converted tenant/lease, waitlist → unit/prospect/application.

-- @up
alter table if exists property.listings add column if not exists lease_id uuid;

alter table if exists property.prospects add column if not exists property_id uuid;
alter table if exists property.prospects add column if not exists property_name text;
alter table if exists property.prospects add column if not exists listing_id uuid;
alter table if exists property.prospects add column if not exists listing_name text;
create index if not exists prospects_listing_id_idx on property.prospects (listing_id) where deleted_at is null;
create index if not exists prospects_unit_id_idx on property.prospects (unit_id) where deleted_at is null;

alter table if exists property.showings add column if not exists property_id uuid;
alter table if exists property.showings add column if not exists property_name text;
create index if not exists showings_prospect_id_idx on property.showings (prospect_id) where deleted_at is null;
create index if not exists showings_listing_id_idx on property.showings (listing_id) where deleted_at is null;

alter table if exists property.applications add column if not exists listing_name text;
alter table if exists property.applications add column if not exists tenant_id uuid;
alter table if exists property.applications add column if not exists lease_id uuid;
create index if not exists applications_prospect_id_idx on property.applications (prospect_id) where deleted_at is null;
create index if not exists applications_listing_id_idx on property.applications (listing_id) where deleted_at is null;

alter table if exists property.waitlist_entries add column if not exists unit_id uuid;
alter table if exists property.waitlist_entries add column if not exists unit text;
alter table if exists property.waitlist_entries add column if not exists prospect_id uuid;
alter table if exists property.waitlist_entries add column if not exists application_id uuid;
create index if not exists waitlist_entries_property_id_idx on property.waitlist_entries (property_id) where deleted_at is null;

-- @down
drop index if exists property.waitlist_entries_property_id_idx;
alter table if exists property.waitlist_entries drop column if exists application_id;
alter table if exists property.waitlist_entries drop column if exists prospect_id;
alter table if exists property.waitlist_entries drop column if exists unit;
alter table if exists property.waitlist_entries drop column if exists unit_id;

drop index if exists property.applications_listing_id_idx;
drop index if exists property.applications_prospect_id_idx;
alter table if exists property.applications drop column if exists lease_id;
alter table if exists property.applications drop column if exists tenant_id;
alter table if exists property.applications drop column if exists listing_name;

drop index if exists property.showings_listing_id_idx;
drop index if exists property.showings_prospect_id_idx;
alter table if exists property.showings drop column if exists property_name;
alter table if exists property.showings drop column if exists property_id;

drop index if exists property.prospects_unit_id_idx;
drop index if exists property.prospects_listing_id_idx;
alter table if exists property.prospects drop column if exists listing_name;
alter table if exists property.prospects drop column if exists listing_id;
alter table if exists property.prospects drop column if exists property_name;
alter table if exists property.prospects drop column if exists property_id;

alter table if exists property.listings drop column if exists lease_id;
