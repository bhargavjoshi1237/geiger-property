# Migration Conventions (@geiger/orm)

Every schema change in this app — tables, columns, indexes, functions, RPCs,
triggers, RLS policies, enums, grants — ships as a **timestamped SQL migration**
run by **`@geiger/orm`**. There is no other route to the database.

> **This product's schema is `property`.** Its migration ledger is
> `property.geiger_migrations`. Substitute `property` wherever this doc writes
> `<schema>` — the authoritative value is `schema` in `geiger-orm.config.mjs`.

This doc is the **migration** playbook. For the JS data-access layer that reads
those tables see `SUPABASE_CONVENTIONS.md`; for screens and UI see
`MODULE_CONVENTIONS.md` and `crafting.md`.

```bash
npm run db:status                                   # what's applied, what's pending
npm run db:new -- add_seat_maps --template table    # scaffold a migration
npm run db:push                                     # apply everything pending
npm run db:rollback                                 # undo the last push
npm run db:seed                                     # re-runnable data (never ledgered)
```

---

## 0. The rules, in one place

If you read nothing else, read this. Everything below is the justification.

1. **One change = one new file.** `npm run db:new -- <name>`. Never hand-name a
   migration file; the 14-digit version must be unique and monotonic.
2. **Never edit a migration that has already been applied.** That is *drift* —
   the file and the database no longer agree. Write a new migration instead.
3. **Every migration has an `@up` and a `@down`.** `@down` is not optional
   because "we'd never roll this back"; write it while the change is fresh.
4. **Every migration is self-contained and idempotent.** It must succeed on an
   empty database and on a database that already has half of it.
5. **Qualify every object with the schema** — `<schema>.tickets`, never bare
   `tickets`, never `public.` for a product-owned table.
6. **Never run raw DDL by hand** — no Supabase SQL editor, no `psql -f`, no
   ad-hoc `scripts/*.mjs` runner. If it isn't a ledgered migration, it doesn't
   exist, and the next developer's `db:push` will not reproduce it.
7. **Check `npm run db:status` before and after `npm run db:push`.** Push is not
   fire-and-forget.
8. **Data that is re-run on purpose is a *seed*, not a migration** — put it in
   `supabase/seeds/`.

---

## 1. The mental model

Two things are cross-referenced on every command:

| | |
|---|---|
| **The files** | `supabase/migrations/<version>_<name>.sql`, sorted by version |
| **The ledger** | `<schema>.geiger_migrations` — one row per version that has run |

`status`, `push`, and `rollback` all read the world through the same
cross-reference, so they can never disagree. A migration is in exactly one
state:

| State | Meaning |
|---|---|
| `applied` | file + ledger row, checksums match |
| `pending` | file, no ledger row → `push` will run it |
| `DRIFTED` | file + ledger row, but the `@up` body was edited → `push` refuses |
| `FAILED` | a `@no-transaction` run crashed part-way → `push` refuses until `repair` |
| `no file` | ledger row whose file was deleted or renamed → warning only |

### The guarantee

**The `@up` body and its ledger row commit in a single transaction.** A failure
rolls back both, so the database can never end up changed-but-unrecorded or
recorded-but-unchanged. If statement 7 of a migration fails, statements 1–6 are
rolled back too.

Concurrency uses `pg_advisory_xact_lock` taken inside that transaction, plus a
re-check of the ledger once the lock is granted: a second `push` running at the
same time blocks, then sees the committed row and skips. (Session-level advisory
locks are deliberately never used — Supabase's default connection string is the
transaction pooler on `:6543`, where a session lock is held by a pooled backend
that outlives the client, so disconnecting leaks it and every later push hangs
forever.)

---

## 2. Setup

### `geiger-orm.config.mjs` (project root)

```js
// Migration config for @geiger/orm. This product's tables live in the dedicated
// "property" Postgres schema of the suite-shared Supabase project, and so does
// its migration ledger (property.geiger_migrations).
export default {
  schema: "property",
  url: process.env.STRING_URI,
};
```

Optional keys and their defaults: `migrationsDir` (`supabase/migrations`),
`seedsDir` (`supabase/seeds`), `table` (`geiger_migrations`), `ssl`
(`{ rejectUnauthorized: false }`). `schema` and `table` are interpolated into
DDL, so they are **validated** against `^[a-z_][a-z0-9_]*$` rather than escaped.

### `package.json` scripts

```jsonc
{
  "dependencies": { "@geiger/orm": "github:bhargavjoshi1237/geiger-orm#main" },
  "scripts": {
    "db:push":     "geiger-orm push",
    "db:status":   "geiger-orm status",
    "db:rollback": "geiger-orm rollback",
    "db:new":      "geiger-orm create",
    "db:seed":     "geiger-orm seed"
  }
}
```

### Environment

`.env` is loaded first, then `.env.local` on top — the same layering Next.js
uses, so the CLI sees exactly what the app sees.

```bash
# Server-only. Direct Postgres connection, used by migrations ONLY.
STRING_URI=postgresql://...
```

`STRING_URI` is **never** `NEXT_PUBLIC_`. It is a superuser-grade credential and
must not reach the browser bundle. The app itself talks to Supabase over
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` and never over
`STRING_URI`.

A `:6543` (transaction pooler) URL works and `push` warns about it; a direct
`:5432` connection gives better error reporting and is preferred locally.

### One schema per product

The Supabase project is shared across the whole suite, so each product owns a
Postgres schema — and its own ledger inside it. Only genuinely cross-product
tables (`public.projects`) live in `public`.

| Product | Schema | | Product | Schema |
|---|---|---|---|---|
| Geiger Notes | `notes` | | Geiger Content | `content` |
| Geiger Flow | `flow` | | Geiger Campaign | `campaign` |
| Geiger Events | `events` | | Geiger Comms | `comms` |
| Geiger Forms | `forms` | | Geiger Chat | `chat` |
| Geiger Docs | `docs` | | Geiger Property | `property` |
| Geiger Dash | `public` | | | |

Inside a dedicated schema a table prefix is redundant: name tables plainly
(`property.tickets`), never `property.flow_tickets`.

---

## 3. Anatomy of a migration file

`supabase/migrations/20260728143000_add_seat_maps.sql`

```sql
-- Add seat maps
--
-- Owns property.seat_maps. Free-form header: what this changes and why.

-- @up
create table if not exists property.seat_maps (
  id uuid primary key default gen_random_uuid(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- @down
drop table if exists property.seat_maps;
```

### The filename

`<14-digit UTC timestamp>_<snake_case name>.sql` — matched against
`^(\d{14})_([a-zA-Z0-9_-]+)\.sql$`.

- Run order is **by version, globally**. Files may sit in **subfolders**
  (`migrations/conference/2026….sql`) purely for grouping; the folder never
  affects when they run.
- An unrecognised `.sql` file anywhere in the migrations tree is a **hard
  error**, not a silent skip — a mistyped filename that quietly never runs is
  the worst possible failure mode.
- A duplicate version is a hard error. `db:new` walks forward a second at a time
  to pick a free one, so always scaffold rather than hand-name.
- Never rename or renumber a migration after it has been pushed anywhere.

### The markers

| Marker | Effect |
|---|---|
| `-- @up` | what `push` runs. Everything above it is a header comment. |
| `-- @down` | what `rollback` runs. Missing ⇒ irreversible; `rollback` refuses it by name. |
| `-- @no-transaction` | (above `@up`) run outside a transaction. See §7. |

A file with **no `@up` marker at all** is treated as legacy — the whole body is
the up, and it is irreversible. That exists only so `import`ed pre-ORM SQL still
runs; **never write a new migration this way.**

---

## 4. The workflow

```bash
npm run db:status                                          # 1. know the starting state
npm run db:new -- add_seat_maps --template table           # 2. scaffold
#                                                            3. write @up and @down
npm run db:push -- --dry-run                               # 4. confirm what will run
npm run db:push                                            # 5. apply
npm run db:status                                          # 6. confirm it landed
```

`db:new` flags: `--template raw|table|rls`, `--table <t>` (the table the
template targets — inferred from the name by stripping a leading
`create_`/`add_`/`new_`/`make_`/`init_`), `--dir <subfolder>`, `--schema <s>`.

Templates:

- **`table`** — schema + grants, the shared `<schema>.touch_updated_at()`
  trigger function, a table with `id` / `metadata jsonb` / `created_by` /
  `created_at` / `updated_at` / `deleted_at`, indexes, the trigger, and demo-open
  RLS. **Start here for any new entity.**
- **`rls`** — enable RLS + a policy on an existing table.
- **`raw`** — empty `@up`/`@down`.

`db:push` flags: `--dry-run` (list, apply nothing), `--to <version>` (stop
after that version), `--check` (apply nothing, exit 1 if anything is pending —
for CI), `--allow-drift` (see §8).

### Merging branches

Two branches each adding a migration is fine — versions are unique and both run.
If the merged-in migration predates the newest applied one, `push` warns
`out of order` and still runs it in version order. That warning is a prompt to
check the two changes don't depend on each other; it is not an error.

---

## 5. Writing the `@up`

### Self-contained and idempotent

A migration must succeed on a fresh database **and** on one where a previous
partial attempt already created half of it. Never assume another migration ran
first.

```sql
create extension if not exists pgcrypto;
create schema if not exists events;
grant usage on schema property to anon, authenticated, service_role;

-- Define the shared trigger function locally rather than depending on another
-- migration having created it.
create or replace function property.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists property.tickets (...);
alter table property.tickets add column if not exists tier text;   -- back-fill older copies
create index if not exists tickets_event_idx on property.tickets (event_id);

drop trigger if exists tickets_touch_updated_at on property.tickets;
create trigger tickets_touch_updated_at
before update on property.tickets
for each row execute function property.touch_updated_at();

drop policy if exists tickets_demo_all on property.tickets;
create policy tickets_demo_all on property.tickets for all to anon, authenticated
  using (true) with check (true);
```

The idempotent vocabulary: `create … if not exists`, `create or replace
function`, `alter table … add column if not exists`, `drop … if exists` before
re-creating a trigger/policy, `insert … on conflict do nothing`.

### Standard columns

Every product table carries:

```sql
id          uuid primary key default gen_random_uuid(),
metadata    jsonb not null default '{}'::jsonb,   -- expansion bag
created_by  uuid,
created_at  timestamptz not null default now(),
updated_at  timestamptz not null default now(),
deleted_at  timestamptz                            -- soft delete
```

- **Soft delete only.** Lists filter `deleted_at is null`; the data layer's
  `softDelete*` sets it. Never `delete from` a product table in application code.
- **`metadata jsonb` is the expansion bag** — park not-yet-promoted per-section
  config there so a feature can grow without a migration. Promote it to a real
  column the moment it needs an index, a constraint, or its own RLS.
- **`created_by` is a plain `uuid` with no foreign key.** There is no
  `public.users` table in this database; an FK to it fails at `db:push` time.
- **Project scoping** foreign-keys the one genuinely shared table:
  `project_id uuid references public.projects(id) on delete cascade`.

### RLS

RLS is **enabled on every table**. The current suite-wide policy is demo-open:

```sql
alter table property.tickets enable row level security;
drop policy if exists tickets_demo_all on property.tickets;
create policy tickets_demo_all on property.tickets for all to anon, authenticated
  using (true) with check (true);
```

Tightening it to an org/project-scoped policy is a **new migration** that drops
the demo policy and creates the real one — not an edit to the original file.

### Functions and RPCs

Business logic that must be atomic (purchase, seat assignment, shallow-merge of
a metadata patch) belongs in a `plpgsql` function in the product schema, created
with `create or replace function`. Name the owning migration in a header comment
and keep **one owner per function** — a second migration redefining the same
function is how two files silently fight over it.

### Never put in a migration

- `drop table` / `drop column` on live data as part of a feature change. Deprecate
  in one release, drop in a later, deliberate one.
- Long-running backfills over large tables inside the default transaction —
  batch them, or use a seed.
- Environment-specific values (a hard-coded URL, a personal user id). Demo rows
  with stable hard-coded UUIDs are fine and belong in `supabase/seeds/`.

---

## 6. Writing the `@down`

The `@down` reverses the `@up`, and is written **at the same time**. Mirror it
statement for statement, in reverse, using the same `if exists` discipline:

| `@up` | `@down` |
|---|---|
| `create table if not exists <s>.t (…)` | `drop table if exists <s>.t cascade` |
| `alter table <s>.t add column if not exists c …` | `alter table <s>.t drop column if exists c` |
| `create index if not exists i …` | `drop index if exists <s>.i` |
| `create or replace function <s>.f …` | `drop function if exists <s>.f(<argtypes>)` — or re-`create or replace` the **previous** body when the function already existed |
| `create policy p …` | `drop policy if exists p on <s>.t` |

A migration with no `@down` is irreversible and `rollback` names it and refuses.
That is acceptable only for `import`ed legacy files — never for new work.

A `@down` that would destroy production data (dropping a column users have been
filling for weeks) is still correct to write; the safety valve is that
`rollback` is a deliberate, local operation, not something CI runs.

Adding a `@down` to an already-applied migration is **not drift** — the checksum
covers the `@up` body only. Backfilling a missing `@down` is always safe.

---

## 7. `@no-transaction` (the escape hatch)

Some statements refuse to run inside a transaction block —
`create index concurrently`, `alter type … add value` on older Postgres,
`vacuum`. Put the directive above `@up`:

```sql
-- @no-transaction
-- @up
create index concurrently if not exists tickets_event_idx on property.tickets (event_id);
```

The body is then split into top-level statements (dollar-quoted function bodies
and single-quoted literals are kept intact) and sent one at a time.

**You lose the atomicity guarantee.** These migrations write a `failed` ledger
row up front, run, then flip it to `applied`. A crash leaves the `failed` row
behind, `push` refuses to continue, and you fix the database by hand and then:

```bash
geiger-orm repair --version 20260728143000              # SQL did NOT land → forget it, push retries
geiger-orm repair --version 20260728143000 --applied    # SQL DID land → keep it recorded
```

Use `@no-transaction` only when Postgres genuinely forbids the alternative.

---

## 8. Drift

The ledger stores a sha256 of the `@up` body (whitespace-normalised). If the
file changes after it was applied, `status` shows `DRIFTED` and `push` **stops**:

```
These migrations have already been applied but their SQL has changed since:
  - 20260728143000_add_seat_maps.sql
```

- **The fix is a new migration.** The database already has the old version; the
  edit will never run on any environment that already pushed.
- **`push --allow-drift` re-records the checksums without running anything.** It
  is only for genuinely cosmetic edits — a comment, whitespace, a typo in a
  header. Using it to "apply" a real SQL change silently does nothing to the
  database and permanently desynchronises every other environment.

---

## 9. Rollback

```bash
npm run db:rollback                     # undo the whole most recent batch
npm run db:rollback -- --step 1         # undo the last N migrations, batch-agnostic
npm run db:rollback -- --to 20260728143000   # undo everything applied after that version
npm run db:rollback -- --dry-run        # list what would be reverted
```

A *batch* is one `push`. Rollback runs each `@down` newest-first, deleting the
ledger row in the same transaction. It refuses when:

- any selected migration has **no `@down`**;
- an applied migration's **file is missing** (its `@down` can't be read) —
  `--force` reverts only what is still on disk;
- a selected row was recorded by `baseline` (batch `0`) — it describes schema
  this tool never created, so `--force` is required.

Rollback is a **local development** tool. On a shared or production database the
forward fix — a new migration — is almost always the right move.

---

## 10. Seeds

Seeds are **re-runnable data**, not schema history, so they are **never recorded
in the ledger**.

```
supabase/seeds/articles/core-features/event-ticketing-payments.sql
```

```bash
npm run db:seed                  # every file, in path order, each in its own transaction
npm run db:seed -- articles      # only paths containing "articles"
npm run db:seed -- --dry-run
```

Write them idempotently (`insert … on conflict (id) do nothing`) with stable
hard-coded UUIDs, and run them as often as you like. Anything the app's empty
state must survive without belongs in a seed, never in a migration — a screen
never depends on seeded rows existing.

---

## 11. Adopting a database that already has the schema

For a repo whose SQL was applied by hand or by a pre-ORM runner:

```bash
geiger-orm import --dry-run    # preview: legacy folder -> timestamped migrations
geiger-orm import              # git mv's the files, wraps each body in @up
geiger-orm status              # sanity-check the resulting order
geiger-orm baseline            # record them as applied WITHOUT running them
```

`import` assigns versions that **preserve the old alphabetical run order**,
anchored to each file's first-commit date from git and forced strictly
increasing, so a fresh database still builds correctly. Ordering hacks like
`zzz_` prefixes are stripped — timestamps replace them. `--from` takes a
comma-separated list of trees applied in the given order.

`baseline` records rows with batch `0` and runs nothing; it is the on-ramp for
an existing database and must never be used to "skip" a migration that has not
actually been applied.

Both are **one-off adoption commands**. In day-to-day work you only ever use
`new`, `status`, `push`, `rollback`, and `seed`.

---

## 12. CI

```bash
npm run db:push -- --check    # applies nothing; exits 1 if anything is pending
```

Use it to fail a build when a branch ships code that expects a migration nobody
pushed. CI never runs `push`, `rollback`, or `baseline` against a shared
database.

---

## 13. Anti-patterns — explicitly retired

| Don't | Do |
|---|---|
| Run DDL in the Supabase SQL editor | Write a migration and `npm run db:push` |
| Add a `scripts/run-sqls.js` / `apply-*.mjs` runner | `@geiger/orm` is the only runner |
| Keep schema in a `supabase/sqls/` folder of "idempotent SQL run in filename order" | `supabase/migrations/<version>_<name>.sql`, ordered by timestamp and ledgered |
| Prefix files `z_`, `zz_`, `zzz_` to force ordering | The 14-digit version *is* the order |
| Edit an applied migration to change the schema | New migration |
| Re-`push` to "re-apply" a file | Applied files are skipped; a re-run is a no-op by design |
| Prefix tables `flow_` inside a product schema | `<schema>.tickets` |
| Put product tables in `public` | Only `public.projects` is shared |
| `references public.users(id)` | Plain `created_by uuid` — that table does not exist here |
| Expose `STRING_URI` to the client | Server-only, migrations only |
| Seed demo rows from a migration | `supabase/seeds/`, idempotent, never ledgered |

---

## 14. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `not valid migration names` | A stray `.sql` in the migrations tree. Rename it, or move it out. |
| `Duplicate migration version` | Two files share a version. Bump one by a second. |
| `already been applied but their SQL has changed` | Drift — §8. New migration, or `--allow-drift` for a cosmetic edit. |
| `left the ledger dirty` / `FAILED` | A crashed `@no-transaction` run — §7. Fix by hand, then `repair`. |
| `applied but no file on disk` | A migration was deleted or renamed. Harmless warning; blocks `rollback` without `--force`. |
| `out of order` | A merged branch's migration predates the newest applied one. It still runs, in version order. |
| `Could not connect` | `STRING_URI` missing or wrong. The CLI reads `.env` then `.env.local` from the project root. |
| Push hangs forever | Historically a leaked session advisory lock on the `:6543` pooler. This tool only takes transaction-scoped locks; if it hangs, another push is genuinely in flight. |
| `No geiger-orm.config.mjs found` | Run the command from the project root. |

---

## 15. Checklist for a new migration

- [ ] Scaffolded with `npm run db:new -- <name>` (never hand-named)
- [ ] Header comment says what it changes and which tables/functions it owns
- [ ] Every object is `<schema>`-qualified; no `flow_` prefix; not in `public`
- [ ] `@up` is idempotent and self-contained (extensions, schema, trigger fn included)
- [ ] Standard columns present; `created_by` is a plain `uuid`; `deleted_at` for soft delete
- [ ] RLS enabled and a policy created
- [ ] `@down` written and mirrors the `@up`
- [ ] `@no-transaction` only if Postgres genuinely requires it
- [ ] No demo/seed data in the migration (that's `supabase/seeds/`)
- [ ] `npm run db:push -- --dry-run`, then `npm run db:push`, then `npm run db:status` is clean
- [ ] The data layer in `lib/supabase/<area>.js` was updated to match
