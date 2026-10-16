-- Full build tables
--
-- Owns the tables behind the restructured sidebar (spec:
-- docs/superpowers/specs/2026-10-10-sidebar-restructure-full-build-design.md):
-- announcements, applications, automations, bank_accounts, bills, budgets, gl_accounts, inventory_items, listings, message_templates, notices, owners, pm_schedules, prospects, recurring_charges, renewals, rent_comps, showings, team_members, transactions, unit_turns, waitlist_entries, settings.
-- Every table carries project_id (soft uuid) and the standard columns.

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

-- announcements
create table if not exists property.announcements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  audience text,
  property_id uuid,
  property_name text,
  channel text,
  scheduled_for date,
  body text,
  status text not null default 'Draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.announcements add column if not exists project_id uuid;
alter table property.announcements add column if not exists audience text;
alter table property.announcements add column if not exists property_id uuid;
alter table property.announcements add column if not exists property_name text;
alter table property.announcements add column if not exists channel text;
alter table property.announcements add column if not exists scheduled_for date;
alter table property.announcements add column if not exists body text;
alter table property.announcements add column if not exists status text not null default 'Draft';
create index if not exists announcements_project_idx on property.announcements (project_id) where deleted_at is null;
create index if not exists announcements_status_idx on property.announcements (status) where deleted_at is null;
drop trigger if exists announcements_touch_updated_at on property.announcements;
create trigger announcements_touch_updated_at
before update on property.announcements
for each row execute function property.touch_updated_at();
alter table property.announcements enable row level security;
drop policy if exists announcements_demo_all on property.announcements;
create policy announcements_demo_all on property.announcements for all to anon, authenticated
  using (true) with check (true);
grant all on property.announcements to anon, authenticated, service_role;

-- applications
create table if not exists property.applications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  email text,
  phone text,
  unit_id uuid,
  unit text,
  move_in_date date,
  monthly_income numeric not null default 0,
  application_fee numeric not null default 0,
  fee_paid boolean not null default false,
  prospect_id uuid,
  status text not null default 'Submitted',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.applications add column if not exists project_id uuid;
alter table property.applications add column if not exists email text;
alter table property.applications add column if not exists phone text;
alter table property.applications add column if not exists unit_id uuid;
alter table property.applications add column if not exists unit text;
alter table property.applications add column if not exists move_in_date date;
alter table property.applications add column if not exists monthly_income numeric not null default 0;
alter table property.applications add column if not exists application_fee numeric not null default 0;
alter table property.applications add column if not exists fee_paid boolean not null default false;
alter table property.applications add column if not exists prospect_id uuid;
alter table property.applications add column if not exists status text not null default 'Submitted';
create index if not exists applications_project_idx on property.applications (project_id) where deleted_at is null;
create index if not exists applications_status_idx on property.applications (status) where deleted_at is null;
drop trigger if exists applications_touch_updated_at on property.applications;
create trigger applications_touch_updated_at
before update on property.applications
for each row execute function property.touch_updated_at();
alter table property.applications enable row level security;
drop policy if exists applications_demo_all on property.applications;
create policy applications_demo_all on property.applications for all to anon, authenticated
  using (true) with check (true);
grant all on property.applications to anon, authenticated, service_role;

-- automations
create table if not exists property.automations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  trigger_event text,
  action_type text,
  enabled boolean not null default false,
  status text not null default 'Draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.automations add column if not exists project_id uuid;
alter table property.automations add column if not exists trigger_event text;
alter table property.automations add column if not exists action_type text;
alter table property.automations add column if not exists enabled boolean not null default false;
alter table property.automations add column if not exists status text not null default 'Draft';
create index if not exists automations_project_idx on property.automations (project_id) where deleted_at is null;
create index if not exists automations_status_idx on property.automations (status) where deleted_at is null;
drop trigger if exists automations_touch_updated_at on property.automations;
create trigger automations_touch_updated_at
before update on property.automations
for each row execute function property.touch_updated_at();
alter table property.automations enable row level security;
drop policy if exists automations_demo_all on property.automations;
create policy automations_demo_all on property.automations for all to anon, authenticated
  using (true) with check (true);
grant all on property.automations to anon, authenticated, service_role;

-- bank_accounts
create table if not exists property.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  bank_name text,
  account_type text,
  last4 text,
  balance numeric not null default 0,
  status text not null default 'Active',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.bank_accounts add column if not exists project_id uuid;
alter table property.bank_accounts add column if not exists bank_name text;
alter table property.bank_accounts add column if not exists account_type text;
alter table property.bank_accounts add column if not exists last4 text;
alter table property.bank_accounts add column if not exists balance numeric not null default 0;
alter table property.bank_accounts add column if not exists status text not null default 'Active';
create index if not exists bank_accounts_project_idx on property.bank_accounts (project_id) where deleted_at is null;
create index if not exists bank_accounts_status_idx on property.bank_accounts (status) where deleted_at is null;
drop trigger if exists bank_accounts_touch_updated_at on property.bank_accounts;
create trigger bank_accounts_touch_updated_at
before update on property.bank_accounts
for each row execute function property.touch_updated_at();
alter table property.bank_accounts enable row level security;
drop policy if exists bank_accounts_demo_all on property.bank_accounts;
create policy bank_accounts_demo_all on property.bank_accounts for all to anon, authenticated
  using (true) with check (true);
grant all on property.bank_accounts to anon, authenticated, service_role;

-- bills
create table if not exists property.bills (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  vendor_id uuid,
  vendor_name text,
  property_name text,
  bill_date date,
  due_date date,
  amount numeric not null default 0,
  amount_paid numeric not null default 0,
  account text,
  status text not null default 'Open',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.bills add column if not exists project_id uuid;
alter table property.bills add column if not exists vendor_id uuid;
alter table property.bills add column if not exists vendor_name text;
alter table property.bills add column if not exists property_name text;
alter table property.bills add column if not exists bill_date date;
alter table property.bills add column if not exists due_date date;
alter table property.bills add column if not exists amount numeric not null default 0;
alter table property.bills add column if not exists amount_paid numeric not null default 0;
alter table property.bills add column if not exists account text;
alter table property.bills add column if not exists status text not null default 'Open';
create index if not exists bills_project_idx on property.bills (project_id) where deleted_at is null;
create index if not exists bills_status_idx on property.bills (status) where deleted_at is null;
drop trigger if exists bills_touch_updated_at on property.bills;
create trigger bills_touch_updated_at
before update on property.bills
for each row execute function property.touch_updated_at();
alter table property.bills enable row level security;
drop policy if exists bills_demo_all on property.bills;
create policy bills_demo_all on property.bills for all to anon, authenticated
  using (true) with check (true);
grant all on property.bills to anon, authenticated, service_role;

-- budgets
create table if not exists property.budgets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  property_id uuid,
  property_name text,
  year numeric not null default 0,
  total_income numeric not null default 0,
  total_expense numeric not null default 0,
  status text not null default 'Draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.budgets add column if not exists project_id uuid;
alter table property.budgets add column if not exists property_id uuid;
alter table property.budgets add column if not exists property_name text;
alter table property.budgets add column if not exists year numeric not null default 0;
alter table property.budgets add column if not exists total_income numeric not null default 0;
alter table property.budgets add column if not exists total_expense numeric not null default 0;
alter table property.budgets add column if not exists status text not null default 'Draft';
create index if not exists budgets_project_idx on property.budgets (project_id) where deleted_at is null;
create index if not exists budgets_status_idx on property.budgets (status) where deleted_at is null;
drop trigger if exists budgets_touch_updated_at on property.budgets;
create trigger budgets_touch_updated_at
before update on property.budgets
for each row execute function property.touch_updated_at();
alter table property.budgets enable row level security;
drop policy if exists budgets_demo_all on property.budgets;
create policy budgets_demo_all on property.budgets for all to anon, authenticated
  using (true) with check (true);
grant all on property.budgets to anon, authenticated, service_role;

-- gl_accounts
create table if not exists property.gl_accounts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  number text,
  account_type text,
  description text,
  status text not null default 'Active',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.gl_accounts add column if not exists project_id uuid;
alter table property.gl_accounts add column if not exists number text;
alter table property.gl_accounts add column if not exists account_type text;
alter table property.gl_accounts add column if not exists description text;
alter table property.gl_accounts add column if not exists status text not null default 'Active';
create index if not exists gl_accounts_project_idx on property.gl_accounts (project_id) where deleted_at is null;
create index if not exists gl_accounts_status_idx on property.gl_accounts (status) where deleted_at is null;
drop trigger if exists gl_accounts_touch_updated_at on property.gl_accounts;
create trigger gl_accounts_touch_updated_at
before update on property.gl_accounts
for each row execute function property.touch_updated_at();
alter table property.gl_accounts enable row level security;
drop policy if exists gl_accounts_demo_all on property.gl_accounts;
create policy gl_accounts_demo_all on property.gl_accounts for all to anon, authenticated
  using (true) with check (true);
grant all on property.gl_accounts to anon, authenticated, service_role;

-- inventory_items
create table if not exists property.inventory_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  sku text,
  category text,
  location text,
  quantity numeric not null default 0,
  reorder_level numeric not null default 0,
  unit_cost numeric not null default 0,
  status text not null default 'In stock',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.inventory_items add column if not exists project_id uuid;
alter table property.inventory_items add column if not exists sku text;
alter table property.inventory_items add column if not exists category text;
alter table property.inventory_items add column if not exists location text;
alter table property.inventory_items add column if not exists quantity numeric not null default 0;
alter table property.inventory_items add column if not exists reorder_level numeric not null default 0;
alter table property.inventory_items add column if not exists unit_cost numeric not null default 0;
alter table property.inventory_items add column if not exists status text not null default 'In stock';
create index if not exists inventory_items_project_idx on property.inventory_items (project_id) where deleted_at is null;
create index if not exists inventory_items_status_idx on property.inventory_items (status) where deleted_at is null;
drop trigger if exists inventory_items_touch_updated_at on property.inventory_items;
create trigger inventory_items_touch_updated_at
before update on property.inventory_items
for each row execute function property.touch_updated_at();
alter table property.inventory_items enable row level security;
drop policy if exists inventory_items_demo_all on property.inventory_items;
create policy inventory_items_demo_all on property.inventory_items for all to anon, authenticated
  using (true) with check (true);
grant all on property.inventory_items to anon, authenticated, service_role;

-- listings
create table if not exists property.listings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  property_id uuid,
  property_name text,
  unit_id uuid,
  unit text,
  rent numeric not null default 0,
  available_date date,
  bedrooms numeric not null default 0,
  bathrooms numeric not null default 0,
  status text not null default 'Draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.listings add column if not exists project_id uuid;
alter table property.listings add column if not exists property_id uuid;
alter table property.listings add column if not exists property_name text;
alter table property.listings add column if not exists unit_id uuid;
alter table property.listings add column if not exists unit text;
alter table property.listings add column if not exists rent numeric not null default 0;
alter table property.listings add column if not exists available_date date;
alter table property.listings add column if not exists bedrooms numeric not null default 0;
alter table property.listings add column if not exists bathrooms numeric not null default 0;
alter table property.listings add column if not exists status text not null default 'Draft';
create index if not exists listings_project_idx on property.listings (project_id) where deleted_at is null;
create index if not exists listings_status_idx on property.listings (status) where deleted_at is null;
drop trigger if exists listings_touch_updated_at on property.listings;
create trigger listings_touch_updated_at
before update on property.listings
for each row execute function property.touch_updated_at();
alter table property.listings enable row level security;
drop policy if exists listings_demo_all on property.listings;
create policy listings_demo_all on property.listings for all to anon, authenticated
  using (true) with check (true);
grant all on property.listings to anon, authenticated, service_role;

-- message_templates
create table if not exists property.message_templates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  category text,
  channel text,
  subject text,
  body text,
  status text not null default 'Active',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.message_templates add column if not exists project_id uuid;
alter table property.message_templates add column if not exists category text;
alter table property.message_templates add column if not exists channel text;
alter table property.message_templates add column if not exists subject text;
alter table property.message_templates add column if not exists body text;
alter table property.message_templates add column if not exists status text not null default 'Active';
create index if not exists message_templates_project_idx on property.message_templates (project_id) where deleted_at is null;
create index if not exists message_templates_status_idx on property.message_templates (status) where deleted_at is null;
drop trigger if exists message_templates_touch_updated_at on property.message_templates;
create trigger message_templates_touch_updated_at
before update on property.message_templates
for each row execute function property.touch_updated_at();
alter table property.message_templates enable row level security;
drop policy if exists message_templates_demo_all on property.message_templates;
create policy message_templates_demo_all on property.message_templates for all to anon, authenticated
  using (true) with check (true);
grant all on property.message_templates to anon, authenticated, service_role;

-- notices
create table if not exists property.notices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  notice_type text,
  tenant_id uuid,
  tenant_name text,
  unit_id uuid,
  unit text,
  served_date date,
  cure_by date,
  delivery_method text,
  status text not null default 'Draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.notices add column if not exists project_id uuid;
alter table property.notices add column if not exists notice_type text;
alter table property.notices add column if not exists tenant_id uuid;
alter table property.notices add column if not exists tenant_name text;
alter table property.notices add column if not exists unit_id uuid;
alter table property.notices add column if not exists unit text;
alter table property.notices add column if not exists served_date date;
alter table property.notices add column if not exists cure_by date;
alter table property.notices add column if not exists delivery_method text;
alter table property.notices add column if not exists status text not null default 'Draft';
create index if not exists notices_project_idx on property.notices (project_id) where deleted_at is null;
create index if not exists notices_status_idx on property.notices (status) where deleted_at is null;
drop trigger if exists notices_touch_updated_at on property.notices;
create trigger notices_touch_updated_at
before update on property.notices
for each row execute function property.touch_updated_at();
alter table property.notices enable row level security;
drop policy if exists notices_demo_all on property.notices;
create policy notices_demo_all on property.notices for all to anon, authenticated
  using (true) with check (true);
grant all on property.notices to anon, authenticated, service_role;

-- owners
create table if not exists property.owners (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  email text,
  phone text,
  company text,
  management_fee_pct numeric not null default 0,
  payout_method text,
  tax_id_last4 text,
  status text not null default 'Active',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.owners add column if not exists project_id uuid;
alter table property.owners add column if not exists email text;
alter table property.owners add column if not exists phone text;
alter table property.owners add column if not exists company text;
alter table property.owners add column if not exists management_fee_pct numeric not null default 0;
alter table property.owners add column if not exists payout_method text;
alter table property.owners add column if not exists tax_id_last4 text;
alter table property.owners add column if not exists status text not null default 'Active';
create index if not exists owners_project_idx on property.owners (project_id) where deleted_at is null;
create index if not exists owners_status_idx on property.owners (status) where deleted_at is null;
drop trigger if exists owners_touch_updated_at on property.owners;
create trigger owners_touch_updated_at
before update on property.owners
for each row execute function property.touch_updated_at();
alter table property.owners enable row level security;
drop policy if exists owners_demo_all on property.owners;
create policy owners_demo_all on property.owners for all to anon, authenticated
  using (true) with check (true);
grant all on property.owners to anon, authenticated, service_role;

-- pm_schedules
create table if not exists property.pm_schedules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  property_id uuid,
  property_name text,
  unit_id uuid,
  unit text,
  category text,
  frequency text,
  next_due date,
  vendor_id uuid,
  vendor_name text,
  estimated_cost numeric not null default 0,
  status text not null default 'Active',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.pm_schedules add column if not exists project_id uuid;
alter table property.pm_schedules add column if not exists property_id uuid;
alter table property.pm_schedules add column if not exists property_name text;
alter table property.pm_schedules add column if not exists unit_id uuid;
alter table property.pm_schedules add column if not exists unit text;
alter table property.pm_schedules add column if not exists category text;
alter table property.pm_schedules add column if not exists frequency text;
alter table property.pm_schedules add column if not exists next_due date;
alter table property.pm_schedules add column if not exists vendor_id uuid;
alter table property.pm_schedules add column if not exists vendor_name text;
alter table property.pm_schedules add column if not exists estimated_cost numeric not null default 0;
alter table property.pm_schedules add column if not exists status text not null default 'Active';
create index if not exists pm_schedules_project_idx on property.pm_schedules (project_id) where deleted_at is null;
create index if not exists pm_schedules_status_idx on property.pm_schedules (status) where deleted_at is null;
drop trigger if exists pm_schedules_touch_updated_at on property.pm_schedules;
create trigger pm_schedules_touch_updated_at
before update on property.pm_schedules
for each row execute function property.touch_updated_at();
alter table property.pm_schedules enable row level security;
drop policy if exists pm_schedules_demo_all on property.pm_schedules;
create policy pm_schedules_demo_all on property.pm_schedules for all to anon, authenticated
  using (true) with check (true);
grant all on property.pm_schedules to anon, authenticated, service_role;

-- prospects
create table if not exists property.prospects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  email text,
  phone text,
  source text,
  unit_id uuid,
  unit text,
  move_in_date date,
  budget numeric not null default 0,
  status text not null default 'New',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.prospects add column if not exists project_id uuid;
alter table property.prospects add column if not exists email text;
alter table property.prospects add column if not exists phone text;
alter table property.prospects add column if not exists source text;
alter table property.prospects add column if not exists unit_id uuid;
alter table property.prospects add column if not exists unit text;
alter table property.prospects add column if not exists move_in_date date;
alter table property.prospects add column if not exists budget numeric not null default 0;
alter table property.prospects add column if not exists status text not null default 'New';
create index if not exists prospects_project_idx on property.prospects (project_id) where deleted_at is null;
create index if not exists prospects_status_idx on property.prospects (status) where deleted_at is null;
drop trigger if exists prospects_touch_updated_at on property.prospects;
create trigger prospects_touch_updated_at
before update on property.prospects
for each row execute function property.touch_updated_at();
alter table property.prospects enable row level security;
drop policy if exists prospects_demo_all on property.prospects;
create policy prospects_demo_all on property.prospects for all to anon, authenticated
  using (true) with check (true);
grant all on property.prospects to anon, authenticated, service_role;

-- recurring_charges
create table if not exists property.recurring_charges (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  tenant_id uuid,
  tenant_name text,
  unit_id uuid,
  unit text,
  amount numeric not null default 0,
  frequency text,
  next_date date,
  account text,
  status text not null default 'Active',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.recurring_charges add column if not exists project_id uuid;
alter table property.recurring_charges add column if not exists tenant_id uuid;
alter table property.recurring_charges add column if not exists tenant_name text;
alter table property.recurring_charges add column if not exists unit_id uuid;
alter table property.recurring_charges add column if not exists unit text;
alter table property.recurring_charges add column if not exists amount numeric not null default 0;
alter table property.recurring_charges add column if not exists frequency text;
alter table property.recurring_charges add column if not exists next_date date;
alter table property.recurring_charges add column if not exists account text;
alter table property.recurring_charges add column if not exists status text not null default 'Active';
create index if not exists recurring_charges_project_idx on property.recurring_charges (project_id) where deleted_at is null;
create index if not exists recurring_charges_status_idx on property.recurring_charges (status) where deleted_at is null;
drop trigger if exists recurring_charges_touch_updated_at on property.recurring_charges;
create trigger recurring_charges_touch_updated_at
before update on property.recurring_charges
for each row execute function property.touch_updated_at();
alter table property.recurring_charges enable row level security;
drop policy if exists recurring_charges_demo_all on property.recurring_charges;
create policy recurring_charges_demo_all on property.recurring_charges for all to anon, authenticated
  using (true) with check (true);
grant all on property.recurring_charges to anon, authenticated, service_role;

-- renewals
create table if not exists property.renewals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  lease_id uuid,
  tenant_id uuid,
  tenant_name text,
  unit_id uuid,
  unit text,
  current_rent numeric not null default 0,
  proposed_rent numeric not null default 0,
  current_end date,
  new_start date,
  new_end date,
  status text not null default 'Not started',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.renewals add column if not exists project_id uuid;
alter table property.renewals add column if not exists lease_id uuid;
alter table property.renewals add column if not exists tenant_id uuid;
alter table property.renewals add column if not exists tenant_name text;
alter table property.renewals add column if not exists unit_id uuid;
alter table property.renewals add column if not exists unit text;
alter table property.renewals add column if not exists current_rent numeric not null default 0;
alter table property.renewals add column if not exists proposed_rent numeric not null default 0;
alter table property.renewals add column if not exists current_end date;
alter table property.renewals add column if not exists new_start date;
alter table property.renewals add column if not exists new_end date;
alter table property.renewals add column if not exists status text not null default 'Not started';
create index if not exists renewals_project_idx on property.renewals (project_id) where deleted_at is null;
create index if not exists renewals_status_idx on property.renewals (status) where deleted_at is null;
drop trigger if exists renewals_touch_updated_at on property.renewals;
create trigger renewals_touch_updated_at
before update on property.renewals
for each row execute function property.touch_updated_at();
alter table property.renewals enable row level security;
drop policy if exists renewals_demo_all on property.renewals;
create policy renewals_demo_all on property.renewals for all to anon, authenticated
  using (true) with check (true);
grant all on property.renewals to anon, authenticated, service_role;

-- rent_comps
create table if not exists property.rent_comps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  property_id uuid,
  property_name text,
  distance_mi numeric not null default 0,
  bedrooms numeric not null default 0,
  bathrooms numeric not null default 0,
  sqft numeric not null default 0,
  rent numeric not null default 0,
  source text,
  observed_date date,
  status text not null default 'Active',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.rent_comps add column if not exists project_id uuid;
alter table property.rent_comps add column if not exists property_id uuid;
alter table property.rent_comps add column if not exists property_name text;
alter table property.rent_comps add column if not exists distance_mi numeric not null default 0;
alter table property.rent_comps add column if not exists bedrooms numeric not null default 0;
alter table property.rent_comps add column if not exists bathrooms numeric not null default 0;
alter table property.rent_comps add column if not exists sqft numeric not null default 0;
alter table property.rent_comps add column if not exists rent numeric not null default 0;
alter table property.rent_comps add column if not exists source text;
alter table property.rent_comps add column if not exists observed_date date;
alter table property.rent_comps add column if not exists status text not null default 'Active';
create index if not exists rent_comps_project_idx on property.rent_comps (project_id) where deleted_at is null;
create index if not exists rent_comps_status_idx on property.rent_comps (status) where deleted_at is null;
drop trigger if exists rent_comps_touch_updated_at on property.rent_comps;
create trigger rent_comps_touch_updated_at
before update on property.rent_comps
for each row execute function property.touch_updated_at();
alter table property.rent_comps enable row level security;
drop policy if exists rent_comps_demo_all on property.rent_comps;
create policy rent_comps_demo_all on property.rent_comps for all to anon, authenticated
  using (true) with check (true);
grant all on property.rent_comps to anon, authenticated, service_role;

-- showings
create table if not exists property.showings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  prospect_id uuid,
  prospect_name text,
  unit_id uuid,
  unit text,
  showing_date date,
  showing_time text,
  showing_type text,
  agent text,
  status text not null default 'Scheduled',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.showings add column if not exists project_id uuid;
alter table property.showings add column if not exists prospect_id uuid;
alter table property.showings add column if not exists prospect_name text;
alter table property.showings add column if not exists unit_id uuid;
alter table property.showings add column if not exists unit text;
alter table property.showings add column if not exists showing_date date;
alter table property.showings add column if not exists showing_time text;
alter table property.showings add column if not exists showing_type text;
alter table property.showings add column if not exists agent text;
alter table property.showings add column if not exists status text not null default 'Scheduled';
create index if not exists showings_project_idx on property.showings (project_id) where deleted_at is null;
create index if not exists showings_status_idx on property.showings (status) where deleted_at is null;
drop trigger if exists showings_touch_updated_at on property.showings;
create trigger showings_touch_updated_at
before update on property.showings
for each row execute function property.touch_updated_at();
alter table property.showings enable row level security;
drop policy if exists showings_demo_all on property.showings;
create policy showings_demo_all on property.showings for all to anon, authenticated
  using (true) with check (true);
grant all on property.showings to anon, authenticated, service_role;

-- team_members
create table if not exists property.team_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  email text,
  role text,
  status text not null default 'Invited',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.team_members add column if not exists project_id uuid;
alter table property.team_members add column if not exists email text;
alter table property.team_members add column if not exists role text;
alter table property.team_members add column if not exists status text not null default 'Invited';
create index if not exists team_members_project_idx on property.team_members (project_id) where deleted_at is null;
create index if not exists team_members_status_idx on property.team_members (status) where deleted_at is null;
drop trigger if exists team_members_touch_updated_at on property.team_members;
create trigger team_members_touch_updated_at
before update on property.team_members
for each row execute function property.touch_updated_at();
alter table property.team_members enable row level security;
drop policy if exists team_members_demo_all on property.team_members;
create policy team_members_demo_all on property.team_members for all to anon, authenticated
  using (true) with check (true);
grant all on property.team_members to anon, authenticated, service_role;

-- transactions
create table if not exists property.transactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  txn_date date,
  txn_type text,
  account text,
  property_id uuid,
  property_name text,
  amount numeric not null default 0,
  payee text,
  reference text,
  status text not null default 'Cleared',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.transactions add column if not exists project_id uuid;
alter table property.transactions add column if not exists txn_date date;
alter table property.transactions add column if not exists txn_type text;
alter table property.transactions add column if not exists account text;
alter table property.transactions add column if not exists property_id uuid;
alter table property.transactions add column if not exists property_name text;
alter table property.transactions add column if not exists amount numeric not null default 0;
alter table property.transactions add column if not exists payee text;
alter table property.transactions add column if not exists reference text;
alter table property.transactions add column if not exists status text not null default 'Cleared';
create index if not exists transactions_project_idx on property.transactions (project_id) where deleted_at is null;
create index if not exists transactions_status_idx on property.transactions (status) where deleted_at is null;
drop trigger if exists transactions_touch_updated_at on property.transactions;
create trigger transactions_touch_updated_at
before update on property.transactions
for each row execute function property.touch_updated_at();
alter table property.transactions enable row level security;
drop policy if exists transactions_demo_all on property.transactions;
create policy transactions_demo_all on property.transactions for all to anon, authenticated
  using (true) with check (true);
grant all on property.transactions to anon, authenticated, service_role;

-- unit_turns
create table if not exists property.unit_turns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  unit_id uuid,
  unit text,
  property_name text,
  move_out_date date,
  target_ready_date date,
  budget numeric not null default 0,
  status text not null default 'Not started',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.unit_turns add column if not exists project_id uuid;
alter table property.unit_turns add column if not exists unit_id uuid;
alter table property.unit_turns add column if not exists unit text;
alter table property.unit_turns add column if not exists property_name text;
alter table property.unit_turns add column if not exists move_out_date date;
alter table property.unit_turns add column if not exists target_ready_date date;
alter table property.unit_turns add column if not exists budget numeric not null default 0;
alter table property.unit_turns add column if not exists status text not null default 'Not started';
create index if not exists unit_turns_project_idx on property.unit_turns (project_id) where deleted_at is null;
create index if not exists unit_turns_status_idx on property.unit_turns (status) where deleted_at is null;
drop trigger if exists unit_turns_touch_updated_at on property.unit_turns;
create trigger unit_turns_touch_updated_at
before update on property.unit_turns
for each row execute function property.touch_updated_at();
alter table property.unit_turns enable row level security;
drop policy if exists unit_turns_demo_all on property.unit_turns;
create policy unit_turns_demo_all on property.unit_turns for all to anon, authenticated
  using (true) with check (true);
grant all on property.unit_turns to anon, authenticated, service_role;

-- waitlist_entries
create table if not exists property.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Untitled',
  email text,
  phone text,
  property_id uuid,
  property_name text,
  unit_preference text,
  move_in_date date,
  position numeric not null default 0,
  status text not null default 'Waiting',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table property.waitlist_entries add column if not exists project_id uuid;
alter table property.waitlist_entries add column if not exists email text;
alter table property.waitlist_entries add column if not exists phone text;
alter table property.waitlist_entries add column if not exists property_id uuid;
alter table property.waitlist_entries add column if not exists property_name text;
alter table property.waitlist_entries add column if not exists unit_preference text;
alter table property.waitlist_entries add column if not exists move_in_date date;
alter table property.waitlist_entries add column if not exists position numeric not null default 0;
alter table property.waitlist_entries add column if not exists status text not null default 'Waiting';
create index if not exists waitlist_entries_project_idx on property.waitlist_entries (project_id) where deleted_at is null;
create index if not exists waitlist_entries_status_idx on property.waitlist_entries (status) where deleted_at is null;
drop trigger if exists waitlist_entries_touch_updated_at on property.waitlist_entries;
create trigger waitlist_entries_touch_updated_at
before update on property.waitlist_entries
for each row execute function property.touch_updated_at();
alter table property.waitlist_entries enable row level security;
drop policy if exists waitlist_entries_demo_all on property.waitlist_entries;
create policy waitlist_entries_demo_all on property.waitlist_entries for all to anon, authenticated
  using (true) with check (true);
grant all on property.waitlist_entries to anon, authenticated, service_role;

-- settings — one JSON value per (project, key): company profile, fees, branding,
-- integrations, custom field definitions, roles.
create table if not exists property.settings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists settings_project_key_uidx
  on property.settings (coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), key);
drop trigger if exists settings_touch_updated_at on property.settings;
create trigger settings_touch_updated_at
before update on property.settings
for each row execute function property.touch_updated_at();
alter table property.settings enable row level security;
drop policy if exists settings_demo_all on property.settings;
create policy settings_demo_all on property.settings for all to anon, authenticated
  using (true) with check (true);
grant all on property.settings to anon, authenticated, service_role;

-- @down
drop table if exists property.settings cascade;
drop table if exists property.waitlist_entries cascade;
drop table if exists property.unit_turns cascade;
drop table if exists property.transactions cascade;
drop table if exists property.team_members cascade;
drop table if exists property.showings cascade;
drop table if exists property.rent_comps cascade;
drop table if exists property.renewals cascade;
drop table if exists property.recurring_charges cascade;
drop table if exists property.prospects cascade;
drop table if exists property.pm_schedules cascade;
drop table if exists property.owners cascade;
drop table if exists property.notices cascade;
drop table if exists property.message_templates cascade;
drop table if exists property.listings cascade;
drop table if exists property.inventory_items cascade;
drop table if exists property.gl_accounts cascade;
drop table if exists property.budgets cascade;
drop table if exists property.bills cascade;
drop table if exists property.bank_accounts cascade;
drop table if exists property.automations cascade;
drop table if exists property.applications cascade;
drop table if exists property.announcements cascade;
