-- Integration secrets (PLAT-01h)
--
-- property.integration_secrets: per-project webhook signing secrets and provider tokens (QuickBooks OAuth, screening, e-sign).
-- Values arrive encrypted by the app (AES-256-GCM under GEIGER_SECRETS_KEY, lib/secrets/integration_secrets.js). Closed to
-- every client role: RLS on, no policies, nothing granted to anon or authenticated; only the service role reads and writes.
-- Owns property.integration_secrets and its trigger; redefines touch_updated_at with its body unchanged and search_path pinned.

-- @up
create table if not exists property.integration_secrets (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  key         text not null check (key ~ '^[a-z][a-z0-9_.:-]{1,80}$'),
  ciphertext  text not null,
  metadata    jsonb not null default '{}'::jsonb,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  rotated_at  timestamptz,
  deleted_at  timestamptz
);

create unique index if not exists integration_secrets_project_key_uidx
  on property.integration_secrets (project_id, key) where deleted_at is null;

create or replace function property.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function property.touch_updated_at() from public, anon, authenticated;

drop trigger if exists integration_secrets_touch_updated_at on property.integration_secrets;
create trigger integration_secrets_touch_updated_at
before update on property.integration_secrets
for each row execute function property.touch_updated_at();

-- Server-only: no client policy, and neither client role holds a privilege.
alter table property.integration_secrets enable row level security;
revoke all on property.integration_secrets from anon, authenticated;
grant select, insert, update on property.integration_secrets to service_role;

-- @down
drop table if exists property.integration_secrets cascade;
alter function property.touch_updated_at() reset search_path;
