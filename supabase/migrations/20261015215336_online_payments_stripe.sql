-- Online payments (Stripe)
--
-- Owns property.online_payments (one row per Stripe card/ACH payment or payment
-- link, with fees, ledger entry ids, returns and payout), property.autopay_plans
-- (saved-method autopay enrollments per lease) and property.stripe_events (the
-- verified webhook event log used for dedupe and the Online Payments screen).

-- @up
create extension if not exists pgcrypto;
create schema if not exists property;
grant usage on schema property to anon, authenticated, service_role;

create or replace function property.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- Payments collected online (and staff payment links awaiting payment).
create table if not exists property.online_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  lease_id uuid,
  tenant_id uuid,
  property_id uuid,
  unit_id uuid,
  autopay_plan_id uuid,
  description text,
  payer_name text,
  payer_email text,
  source text not null default 'portal',
  method text,
  method_label text,
  status text not null default 'pending',
  currency text not null default 'usd',
  amount numeric(12,2) not null default 0,
  convenience_fee numeric(12,2) not null default 0,
  processor_fee numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  refunded_amount numeric(12,2) not null default 0,
  link_token text,
  link_expires_at timestamptz,
  stripe_session_id text,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_customer_id text,
  stripe_payment_method_id text,
  ledger_entry_id uuid,
  fee_entry_id uuid,
  nsf_entry_id uuid,
  idempotency_key text,
  paid_at timestamptz,
  failed_at timestamptz,
  returned_at timestamptz,
  return_reason text,
  payout_id text,
  payout_arrival_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists online_payments_project_idx on property.online_payments (project_id, created_at desc);
create index if not exists online_payments_lease_idx on property.online_payments (lease_id);
create index if not exists online_payments_tenant_idx on property.online_payments (tenant_id);
create index if not exists online_payments_status_idx on property.online_payments (status);
create index if not exists online_payments_charge_idx on property.online_payments (stripe_charge_id);
create index if not exists online_payments_payout_idx on property.online_payments (payout_id);
create unique index if not exists online_payments_pi_uidx on property.online_payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create unique index if not exists online_payments_session_uidx on property.online_payments (stripe_session_id)
  where stripe_session_id is not null;
create unique index if not exists online_payments_token_uidx on property.online_payments (link_token)
  where link_token is not null;
create unique index if not exists online_payments_idem_uidx on property.online_payments (idempotency_key)
  where idempotency_key is not null;

drop trigger if exists online_payments_touch_updated_at on property.online_payments;
create trigger online_payments_touch_updated_at
before update on property.online_payments
for each row execute function property.touch_updated_at();

alter table property.online_payments enable row level security;
drop policy if exists online_payments_demo_all on property.online_payments;
create policy online_payments_demo_all on property.online_payments for all to anon, authenticated
  using (true) with check (true);

-- Autopay enrollment per lease: Stripe customer + saved payment method.
create table if not exists property.autopay_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  lease_id uuid,
  tenant_id uuid,
  property_id uuid,
  unit_id uuid,
  name text,
  payer_email text,
  status text not null default 'pending_setup',
  amount_mode text not null default 'balance',
  fixed_amount numeric(12,2),
  max_amount numeric(12,2),
  charge_day integer,
  method text,
  method_label text,
  stripe_customer_id text,
  stripe_payment_method_id text,
  setup_session_id text,
  link_token text,
  last_run_on date,
  last_run_period text,
  last_status text,
  last_error text,
  failure_count integer not null default 0,
  activated_at timestamptz,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists autopay_plans_project_idx on property.autopay_plans (project_id, status);
create index if not exists autopay_plans_lease_idx on property.autopay_plans (lease_id);
create index if not exists autopay_plans_tenant_idx on property.autopay_plans (tenant_id);
create unique index if not exists autopay_plans_token_uidx on property.autopay_plans (link_token)
  where link_token is not null;

drop trigger if exists autopay_plans_touch_updated_at on property.autopay_plans;
create trigger autopay_plans_touch_updated_at
before update on property.autopay_plans
for each row execute function property.touch_updated_at();

alter table property.autopay_plans enable row level security;
drop policy if exists autopay_plans_demo_all on property.autopay_plans;
create policy autopay_plans_demo_all on property.autopay_plans for all to anon, authenticated
  using (true) with check (true);

-- Verified Stripe webhook events (dedupe + audit trail).
create table if not exists property.stripe_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  event_id text not null,
  event_type text not null,
  livemode boolean not null default false,
  object_id text,
  status text not null default 'received',
  error text,
  processed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists stripe_events_event_uidx on property.stripe_events (event_id);
create index if not exists stripe_events_project_idx on property.stripe_events (project_id, created_at desc);

drop trigger if exists stripe_events_touch_updated_at on property.stripe_events;
create trigger stripe_events_touch_updated_at
before update on property.stripe_events
for each row execute function property.touch_updated_at();

alter table property.stripe_events enable row level security;
drop policy if exists stripe_events_demo_all on property.stripe_events;
create policy stripe_events_demo_all on property.stripe_events for all to anon, authenticated
  using (true) with check (true);

grant select, insert, update, delete on property.online_payments, property.autopay_plans, property.stripe_events
  to anon, authenticated, service_role;

-- @down
drop table if exists property.stripe_events cascade;
drop table if exists property.autopay_plans cascade;
drop table if exists property.online_payments cascade;
