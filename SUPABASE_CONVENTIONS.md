# Supabase Module Conventions (Data Layer)

How to wire a new feature area to Supabase **cleanly** — one reusable client,
one pure data-access file per area, a snake_case ↔ camelCase boundary, and the
screen owning all UX. Reference implementation: **events**
(`lib/supabase/events.js`, `lib/supabase/client.js`). Mirror it.

This doc covers the *data* layer only. For screens/registry/UI craft see
`MODULE_CONVENTIONS.md` and `crafting.md`; this is the focused playbook for the
Supabase plumbing. The pattern here is ported from **geiger-flow**
(`features/issues/*` + `supabase/components/flow-client.js`) and adapted to this
project's layout.

---

## 0. The principle

> **Build the Supabase client once, in one place, and import it everywhere.**

Never call `createBrowserClient(...)` ad hoc inside a screen or a data file. There
is exactly **one** base client factory (`lib/supabase/client.js`) and **one**
shared "is the DB even configured?" guard that every data file imports. If a
detail of the client changes (activity tracking, env, headers), it changes in one
file.

---

## 1. Schemas — one per product (NOT everything in `public`)

This doc is **shared across the entire Geiger suite**. The Supabase project is
shared too, so each product gets its **own Postgres schema** to keep its tables
isolated and namespaced. **Create this product's tables in its own schema** — not
`public`. Look up your schema in the table below (it is the lowercased product
name); everywhere this doc writes `<schema>`, substitute that value.

| Product | Schema | | Product | Schema |
|---|---|---|---|---|
| Geiger Notes | `notes` | | Geiger Content | `content` |
| Geiger Flow | `flow` | | Geiger Campaign | `campaign` |
| Geiger Assets | `assets` | | Geiger Pods | `pods` |
| Geiger Grey | `grey` | | Geiger Comms | `comms` |
| Geiger Office | `office` | | Geiger Chat | `chat` |
| Geiger Forms | `forms` | | Geiger Canvas | `canvas` |
| Geiger Property | `property` | | Geiger Docs | `docs` |

**Only genuinely cross-product tables stay in `public`** — the shared entities every
product reads, e.g. `users` and `project`. Everything a product owns lives in its
own `<schema>`. Inside a dedicated schema the old `flow_<area>` table prefix is
redundant — name tables plainly (`<schema>.messages`, `<schema>.conversations`),
the way geiger-flow uses `flow.issues`.

All product schemas are **already exposed** in the Supabase dashboard
(Settings → API → Exposed schemas), so `supabase-js` reaches them via `.schema()`
with no extra config.

### What this changes

- **SQL (`supabase/sqls/<area>.sql`):** open with `create schema if not exists
  <schema>;`, then create every table qualified by the schema —
  `create table if not exists <schema>.<table> (...)`. Foreign-key the common
  tables from `public` (e.g. `created_by uuid references public.users(id)`,
  `project_id uuid references public.project(id)`). Keep the shared
  `public.flow_touch_updated_at()` trigger and RLS as before.
- **Client:** scope the client to the schema, the way flow's `flowClient()` does.
  Add one tiny shared helper — name it for your product (`<schema>Client`) — and
  import it everywhere instead of a bare `createClient()`:

  ```js
  // supabase/components/<schema>-client.js
  import { createClient } from "@/lib/supabase/client";

  export function isSupabaseConfigured() {
    return Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }

  // Pre-guarded client pinned to this product's schema (null when unconfigured).
  export function schemaClient() {
    return isSupabaseConfigured() ? createClient().schema("<schema>") : null;
  }
  ```

  Data files then call `schemaClient()` so every `.from("<table>")` resolves
  inside the product's schema — no schema prefix in the string.
- **Common tables** (`public.users`, `public.project`) are read through a plain
  `createClient()` (default `public` schema), **not** the schema-scoped client.

---

## 2. How this project differs from geiger-flow

Same principles, different layout — keep these straight when reading flow's
`SUPABASE_CONVENTIONS.md`:

| | geiger-flow | geiger-property |
|---|---|---|
| Schema | dedicated `flow` schema (`flow.issues`) | **a dedicated per-product schema** (`<schema>.<table>`); only shared `users`/`project` stay in `public` |
| Client wrapper | `flowClient()` = `createClient().schema("flow")` | `schemaClient()` = `createClient().schema("<schema>")` (see §1) |
| Data layer | `features/<module>/actions.js` | `lib/supabase/<area>.js` |
| Config guard | (always configured) | **`isSupabaseConfigured()`** — guards against a missing env so calls return `null`/`[]`/`false` instead of crashing; the screen then renders an empty state (it does **not** fall back to static sample data) |
| SQL | `supabase/migrations/NNNN_*.sql` | `supabase/sqls/*.sql` (idempotent), run via `npm run db:push` |

The headline difference: the **data layer is the source of truth** — screens fetch
their rows from it, they do **not** seed from a static in-file array. Every action
is still guarded by `isSupabaseConfigured()` and returns `null`/`[]`/`false` when
the DB is absent, but that is a no-crash guard: the screen renders its **loading**
then **empty** state, never bundled sample data.

---

## 3. Where things go

| Concern | Location | Naming |
|---|---|---|
| Base browser client (auth + fetch tracking) | `lib/supabase/client.js` | `createClient()` |
| **Shared guard / config helper** (imported everywhere) | `lib/supabase/events.js` today; ideally `supabase/components/events-client.js` | `isSupabaseConfigured()` |
| Data-access layer (one per area) | `lib/supabase/<area>.js` | `list*/get*/create*/update*/softDelete*`, `normalize*`, `toRow` |
| Storage helpers | `lib/supabase/storage.js` | `uploadEventImage`, `buildPublicUrl`, `eventMediaPrefix` |
| SQL schema / policies | `supabase/sqls/<area>.sql` | plain, **idempotent** DDL |
| Migration runner | `scripts/run-sqls.js` (`npm run db:push`) | runs `supabase/sqls/*` in order |

Files use snake_case names; React components are PascalCase; all imports use the
`@/` root alias.

---

## 4. The reusable Supabase component

This is the "create separate, import in all others" piece. Today the shared guard
lives in `lib/supabase/events.js` and is imported by the sibling data files:

```js
// lib/supabase/events.js
export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

// lib/supabase/orders.js  /  lib/supabase/storage.js
import { isSupabaseConfigured } from "./events";
```

That works, but it couples `orders`/`storage` to the `events` data file. To match
flow's clean separation, **promote shared helpers into `supabase/components/`**
(flow keeps `flow-client.js` there) so every data file imports a neutral helper,
not another feature:

```js
// supabase/components/<schema>-client.js  (recommended)
import { createClient } from "@/lib/supabase/client";

// True only when both Supabase env vars are present. Guard every DB call with it
// so a missing env returns null/[]/false (the screen shows an empty state) rather
// than crashing — there is no static sample-data fallback.
export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

// Pre-guarded client pinned to this product's schema (null when unconfigured) so
// callers don't repeat the guard + createClient().schema("<schema>") dance. Read
// the shared public tables (users, project) through a plain createClient() instead.
export function schemaClient() {
  return isSupabaseConfigured() ? createClient().schema("<schema>") : null;
}
```

Rules for this folder: keep helpers **tiny and reusable** — one job each. Anything
feature-specific belongs in the area's `lib/supabase/<area>.js`, not here. A
product's tables live in its **own schema** (see §1), so the shared client is
**`.schema("<schema>")`-scoped** (`schemaClient()`) — prefer it over a bare
`createClient()` everywhere except when reading the common `public` tables
(`users`, `project`).

---

## 5. The data-access layer (`lib/supabase/<area>.js`)

One file per area. It is the **only** place that talks to that area's table,
through the schema-scoped client (`schemaClient()` from §1) — e.g. a `messages.js`
owns `<schema>.messages`.

### Shape

1. **A header comment** naming the table it owns and the snake_case ↔ camelCase
   contract.
2. **`normalize<Entity>(row)`** — DB row (snake_case) → camelCase view model.
   Returns `null` for a missing row. Spreads any `metadata` jsonb keys onto the
   view model so they read as first-class fields.
3. **`toRow(input)`** — camelCase patch → snake_case columns. Emits a column
   **only when its key is present** in `input`, so the same helper serves a full
   create and a partial inline update (`{ status }`, `{ visibility }`).
4. **CRUD functions** — `list*`, `get*`, `create*`, `update*`, `softDelete*`.

### Hard rules

- **Guard every call with `isSupabaseConfigured()`** and `try/catch`; a missing
  env or missing table degrades to "no DB" (`return null`/`[]`/`false`), never a
  crash.
- **Actions are pure data access:** validate inputs, `console.error("[events.<x>]", …)`
  on failure, and **return `null` / `false` / `[]`**. Never throw, never `toast`
  here — the screen owns UX.
- **Map at the boundary.** DB is snake_case, UI is camelCase. Always return
  view-model objects the screen can render directly; never leak raw rows.
- **Soft delete** sets `deleted_at`; `list*`/`get*` filter `.is("deleted_at", null)`.
- **Honor a caller-supplied `id`** on create (the UI mints a UUID up front for
  optimistic rendering) so the row and the optimistic list entry stay in sync.

### Canonical example (condensed, schema-scoped)

```js
import { schemaClient, isSupabaseConfigured } from "@/supabase/components/<schema>-client";

const TABLE = "messages"; // resolves to <schema>.messages via the scoped client

export function normalizeEvent(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    name: row.name ?? "",
    status: row.status ?? "Draft",
    date: row.event_date ?? "",
    capacity: row.capacity ?? 0,
    revenue: Number(row.revenue ?? 0),
    coverUrl: row.cover_url ?? "",
    createdBy: row.created_by ?? null,
    ...meta, // expansion-bag keys surface as first-class fields
  };
}

function toRow(input) {
  const row = {};
  const map = { name: "name", status: "status", coverUrl: "cover_url" /* … */ };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key];
  if ("date" in input) row.event_date = input.date || null;        // "" -> null
  if ("capacity" in input) row.capacity = Number(input.capacity) || 0;
  return row;
}

export async function listEvents() {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data, error } = await sb
      .from(TABLE).select("*").is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) { console.error("[events.list]", error.message); return null; }
    return (data || []).map(normalizeEvent);
  } catch (e) { console.error("[events.list]", e); return null; }
}

export async function createEvent(input) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const payload = toRow(input);
    if (input.id) payload.id = input.id;  // honor optimistic UUID
    const { data, error } = await sb.from(TABLE).insert(payload).select("*").single();
    if (error) { console.error("[events.create]", error.message); return null; }
    return normalizeEvent(data);
  } catch (e) { console.error("[events.create]", e); return null; }
}

export async function updateEvent(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data, error } = await sb
      .from(TABLE).update(toRow(patch)).eq("id", id).select("*").single();
    if (error) { console.error("[events.update]", error.message); return null; }
    return normalizeEvent(data);
  } catch (e) { console.error("[events.update]", e); return null; }
}

export async function softDeleteEvent(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = schemaClient();
    const { error } = await sb
      .from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) { console.error("[events.delete]", error.message); return false; }
    return true;
  } catch (e) { console.error("[events.delete]", e); return false; }
}
```

---

## 6. The metadata expansion bag

A schema table (e.g. `<schema>.messages`) carries a `metadata jsonb not null default '{}'::jsonb`
column. Store new, not-yet-promoted attributes (page design, ticket tiers, custom
questions…) there so the feature grows without a migration. `normalizeEvent`
spreads the bag's keys onto the view model; `toRow` folds known keys back on
write. Promote a field to a real column once it needs indexing, constraints, or
its own RLS.

---

## 7. SQL & migrations

- One file per area under `supabase/sqls/<area>.sql`, **self-contained and
  idempotent**: `create schema if not exists <schema>;`, `create … if not exists`,
  `create or replace function`, `alter table … add column if not exists`, and
  `drop policy if exists` before `create policy`.
- **Qualify every object with the schema** (`<schema>.<table>`, indexes/triggers
  on `<schema>.*`); foreign-key the shared tables from `public`
  (`references public.users(id)` / `public.project(id)`).
- Reuse the shared `public.flow_touch_updated_at()` trigger for `updated_at`.
- Run with `npm run db:push` (`scripts/run-sqls.js`) — it executes
  `supabase/sqls/*` in order. Add an area → drop in `<area>.sql` and re-run.
- RLS is enabled; the demo policy currently grants open `anon`/`authenticated`
  access. When auth lands, replace it with an organization-scoped policy and drop
  the open one.

---

## 8. The screen's half of the contract

Actions never toast. The **screen** fetches from the data layer (no static seed),
calls an action, and decides UX from the return value:

```js
// Load: start empty + loading, fetch on mount.
const [events, setEvents] = useState([]);
const [loading, setLoading] = useState(true);
useEffect(() => {
  listEvents().then((rows) => { setEvents(rows ?? []); setLoading(false); });
}, []);

// Mutate: optimistic, then persist and reconcile.
const optimistic = { ...draft, id: crypto.randomUUID() };
setEvents((prev) => [optimistic, ...prev]);          // instant UI
const created = await createEvent(optimistic);        // null on failure/no-DB
if (created) {
  setEvents((prev) => prev.map((e) => (e.id === created.id ? created : e)));
  toast.success("Event created");
} else {
  setEvents((prev) => prev.filter((e) => e.id !== optimistic.id)); // roll back
  toast.error("Couldn't save the event.");
}
```

Loading + empty states on every list; mutate optimistically; map a `null`/`false`
return to a `toast.error` and reconcile (re-fetch or roll back). There is no
sample-data fallback — an unconfigured/empty DB renders the empty state.

---

## 9. New-area checklist

1. **SQL:** `supabase/sqls/<area>.sql` — `create schema if not exists <schema>;`,
   table in the **product's schema** (`<schema>.<name>`, no `flow_` prefix),
   indexes, `updated_at` trigger, `metadata jsonb` bag, RLS, FKs to `public.users`/
   `public.project`. Run `npm run db:push`.
2. **Shared client:** reuse the schema-scoped `schemaClient()` +
   `isSupabaseConfigured()`; only add a new file under `supabase/components/` if you
   need a genuinely shared helper.
3. **Data layer:** `lib/supabase/<area>.js` — guarded `createClient()` access,
   `normalize*`/`toRow`, `list/get/create/update/softDelete`, return
   `null`/`false`/`[]`, `console.error` on failure, `isSupabaseConfigured()` guard.
4. **Screen:** import the actions, **fetch on mount** (start empty + loading; no
   static seed), render camelCase view models, own all toasts and optimistic
   state, and reconcile failed writes. An unconfigured/empty DB renders the empty
   state — never static sample data. `npx eslint` clean before you call it done.
