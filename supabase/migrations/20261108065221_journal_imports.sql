-- Journal imports (CORE-46): one row per journal-entry or opening-balance file import, from preview to posted / failed.
-- Owns property.journal_imports. Journal entries post through ledger_post under jeimp:<importId>:<entry_ref>; opening balances post
--   through INTL-04's conversion batches (conv:<batchId>:<lineId>), so there is one opening-balance path.
-- Adds ledger_entries_import_fp_idx on metadata->>'importFingerprint' so a re-import finds entries already on the ledger.
-- Reads follow the ledger (accounting.view); only the server routes write.

-- @up
set local lock_timeout = '10s';
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
revoke all on function property.touch_updated_at() from public, anon;

create table if not exists property.journal_imports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null default 'journal',
  file_name text,
  format text,
  status text not null default 'preview',
  entry_count integer not null default 0,
  posted_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  as_of date,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint journal_imports_kind_chk check (kind in ('journal', 'opening_balances')),
  constraint journal_imports_status_chk check (status in ('preview', 'posted', 'failed')),
  constraint journal_imports_format_chk check (format is null or format in ('csv', 'tsv', 'xlsx'))
);

create index if not exists journal_imports_project_idx
  on property.journal_imports (project_id, created_at desc) where deleted_at is null;

drop trigger if exists journal_imports_touch_updated_at on property.journal_imports;
create trigger journal_imports_touch_updated_at
before update on property.journal_imports
for each row execute function property.touch_updated_at();

alter table property.journal_imports enable row level security;
revoke all on property.journal_imports from anon, authenticated;
grant select, insert, update, delete on property.journal_imports to service_role;
do $$
begin
  if to_regprocedure('property.apply_member_rls(text, text, text, boolean)') is not null then
    perform property.apply_member_rls('journal_imports', 'property.accounting.view', null, false);
  else
    grant select on property.journal_imports to authenticated;
    drop policy if exists journal_imports_member_select on property.journal_imports;
    create policy journal_imports_member_select on property.journal_imports for select to authenticated
      using (property.can_access_project(project_id));
  end if;
end $$;

-- A re-import skips entries whose fingerprint is already on the ledger.
create index if not exists ledger_entries_import_fp_idx
  on property.ledger_entries (project_id, (metadata->>'importFingerprint'))
  where metadata ? 'importFingerprint';

-- @down
drop index if exists property.ledger_entries_import_fp_idx;
drop table if exists property.journal_imports cascade;
