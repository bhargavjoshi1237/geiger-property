-- Job runs running lock (CORE-10)
--
-- Owns the job_runs_running_lock unique index (one running row per job and project scope; a second start gets
-- a unique violation and is logged as skipped_locked), job_runs_project_job_idx, property.job_projects() (the
-- live projects a cron run fans out to) and property.job_run_status() (latest run, last success and last
-- scheduled success per project and job, for the watchdog and the Scheduled Jobs dialog). Both functions are
-- service-role only (PLAT-01c).

-- @up
create schema if not exists property;

-- Older duplicate running rows (none expected) would block the unique index: keep the newest per scope.
do $$
begin
  if to_regclass('property.job_runs') is null then
    return;
  end if;
  update property.job_runs r
  set status = 'abandoned',
      finished_at = coalesce(r.finished_at, now()),
      errors = coalesce(r.errors, '[]'::jsonb) || '["The run stopped part-way (superseded by a newer run)"]'::jsonb
  where r.status = 'running'
    and r.deleted_at is null
    and exists (
      select 1 from property.job_runs o
      where o.status = 'running'
        and o.deleted_at is null
        and o.job_key = r.job_key
        and coalesce(o.project_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(r.project_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and (o.started_at, o.id) > (r.started_at, r.id)
    );
  create unique index if not exists job_runs_running_lock
    on property.job_runs (job_key, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid))
    where status = 'running' and deleted_at is null;
  create index if not exists job_runs_project_job_idx
    on property.job_runs (project_id, job_key, started_at desc)
    where deleted_at is null;
end $$;

-- Live projects with Property data: the projects a cron run fans out to.
create or replace function property.job_projects()
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select pr.id
  from public.projects pr
  where pr.deleted_at is null
    and (
      exists (select 1 from property.properties x where x.project_id = pr.id and x.deleted_at is null)
      or exists (select 1 from property.leases x where x.project_id = pr.id and x.deleted_at is null)
      or exists (select 1 from property.settings x where x.project_id = pr.id and x.deleted_at is null)
      or exists (select 1 from property.team_members x where x.project_id = pr.id and x.deleted_at is null)
    )
  order by pr.created_at, pr.id;
end;
$$;
revoke all on function property.job_projects() from public, anon, authenticated;
grant execute on function property.job_projects() to service_role;

-- Per project and job since p_since (default 14 days): the latest run, the one before it, the last success
-- (succeeded, partial or skipped) and the last scheduled ones; p_project null also returns the cron parent rows.
create or replace function property.job_run_status(p_project uuid default null, p_since timestamptz default null)
returns table (
  project_id uuid,
  job_key text,
  last_run_id uuid,
  last_status text,
  last_trigger text,
  last_started_at timestamptz,
  prev_status text,
  last_ok_at timestamptz,
  last_scheduled_ok_at timestamptz,
  last_scheduled_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  with r as (
    select j.id, j.project_id, j.job_key, j.status, j.trigger_source, j.started_at,
      row_number() over (partition by j.project_id, j.job_key order by j.started_at desc, j.id desc) as n
    from property.job_runs j
    where j.deleted_at is null
      and j.started_at >= coalesce(p_since, now() - interval '14 days')
      and (p_project is null or j.project_id = p_project)
  )
  select r.project_id, r.job_key,
    (array_agg(r.id order by r.n))[1],
    (array_agg(r.status order by r.n))[1],
    (array_agg(r.trigger_source order by r.n))[1],
    max(r.started_at),
    (array_agg(r.status order by r.n))[2],
    max(r.started_at) filter (where r.status in ('succeeded', 'partial', 'skipped')),
    max(r.started_at) filter (where r.trigger_source = 'cron' and r.status in ('succeeded', 'partial', 'skipped')),
    max(r.started_at) filter (where r.trigger_source = 'cron')
  from r
  group by r.project_id, r.job_key;
end;
$$;
revoke all on function property.job_run_status(uuid, timestamptz) from public, anon, authenticated;
grant execute on function property.job_run_status(uuid, timestamptz) to service_role;

-- @down
drop function if exists property.job_run_status(uuid, timestamptz);
drop function if exists property.job_projects();
drop index if exists property.job_runs_project_job_idx;
drop index if exists property.job_runs_running_lock;
