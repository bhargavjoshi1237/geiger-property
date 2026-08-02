-- Imported from init.sql by geiger-orm.
-- No @down section — this migration cannot be rolled back.

-- @up
-- Geiger Property — base bootstrap. Run by `npm run db:push` (scripts/run-sqls.js,
-- which executes supabase/sqls/*.sql in filename order). Self-contained and
-- idempotent: safe to re-run.
--
-- Property owns the `property` Postgres schema (per-product isolation); the
-- suite-shared shell tables (notifications, teams) live in `public` and are read
-- through a plain public-schema client. Feature areas add their own
-- supabase/sqls/<area>.sql creating tables under `property`.

-- This product's dedicated schema. NOTE: exposing it to the REST API is a
-- project-level step that db:push can't do from area SQL — add `property` to
-- Supabase → Settings → API → Exposed schemas (or `alter role authenticator set
-- pgrst.db_schemas = '…, property'; notify pgrst, 'reload schema';`). Without it
-- PostgREST returns PGRST106 "Invalid schema: property".
create schema if not exists property;

-- Grant the PostgREST API roles access to the schema. Raw `create schema` (unlike
-- the Supabase dashboard) grants nothing, so anon/authenticated would otherwise
-- get 42501 "permission denied for schema property". RLS still gates rows.
grant usage on schema property to anon, authenticated, service_role;
alter default privileges in schema property
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema property
  grant all on sequences to anon, authenticated, service_role;

-- Suite-shared shell tables in `public` (mirrors geiger-events/supabase/sqls/init.sql).
create table if not exists public.flow_teams (
  id uuid not null default gen_random_uuid (),
  members jsonb null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  constraint flow_teams_pkey primary key (id)
);

create table if not exists public.flow_notifications (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  extra jsonb null default '{}'::jsonb,
  title text not null,
  description text not null,
  time timestamp with time zone not null default now(),
  type text not null,
  read boolean not null default false,
  icon text not null,
  icon_color text not null,
  bg_color text not null,
  constraint flow_notifications_pkey primary key (id)
);
