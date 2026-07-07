-- Geiger Property — base bootstrap. Run by `npm run db:push` (scripts/run-sqls.js,
-- which executes supabase/sqls/*.sql in filename order). Self-contained and
-- idempotent: safe to re-run.
--
-- Property owns the `property` Postgres schema (per-product isolation); the
-- suite-shared shell tables (notifications, teams) live in `public` and are read
-- through a plain public-schema client. Feature areas add their own
-- supabase/sqls/<area>.sql creating tables under `property`.

-- This product's dedicated schema (already exposed in Supabase → API settings).
create schema if not exists property;

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
