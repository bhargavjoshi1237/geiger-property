# Registrations Module — Design Spec

Date: 2026-06-28
Status: Approved scope, pending spec review
Reference build: the **Events** area (`components/internal/screens/events`,
`lib/supabase/events.js`, `supabase/sqls/events.sql`).

---

## 1. Goal & scope

Build the **Registrations** workspace area — the cross-event "people-coming"
pipeline. Per-event RSVP *config* already exists in the event editor
(`events/rsvp.jsx`, persisted in the event `metadata` bag); this module adds the
workspace-level **operational** layer that manages the actual registration
records across all events, backed by a real database table with rich UX.

**Confirmed decisions (from requirements round):**

1. **Scope — "Core 6 deep, rest folded."** Six substantive screens get full
   screens + DB + rich UX. The other 10 sidebar sub-items resolve to real
   controls/views *inside* those six (form-builder settings, registration detail,
   rules panels) — every sidebar item leads somewhere real; none stays
   `ComingSoonScreen`; no thin duplicate screens.
2. **Data model — new `flow_registrations` table** (+ `flow_registration_forms`),
   separate from the paid-ticket `flow_event_orders` table.
3. **Gating — none for now.** Screens are reachable by default, like Events.

### The six substantive screens (registry entries)

| Sidebar title | Screen | Purpose |
|---|---|---|
| **RSVPs** | `RegistrationsScreen` | Master registrations list across all events — the hub |
| **Registration Forms** | `RegistrationFormsScreen` | Reusable form library + field/logic builder |
| **Waitlist** | `WaitlistScreen` | Per-event waitlist queues + auto-promotion rules |
| **Approval Gates** | `ApprovalGatesScreen` | Pending-approval inbox — approve/deny with reason |
| **Capacity Limits** | `CapacityLimitsScreen` | Cross-event fill monitor (caps, fill %, buffer) |
| **Dietary & Accessibility** | `DietaryAccessibilityScreen` | Aggregated needs report for catering/venue ops, exportable |

### How the other 10 sub-items resolve (folded)

| Sub-item | Where it lives |
|---|---|
| **Register on Behalf** | "Add registrant" dialog on `RegistrationsScreen` (source = Organizer) |
| **Plus-ones** | Registration detail drawer (named-guest roster) + party-size column |
| **Conditional Questions** | Form builder — per-field "show when" logic rule |
| **Group Registration** | Form builder setting (collect-per-seat) + party-size on registration |
| **Token-gated** | Form builder access setting (wallet/token rule) |
| **Member-only** | Form builder access setting (members list / email domain) |
| **Registration Deadlines** | Form builder open/close window setting |
| **Confirmation Page** | Form builder tab (editable post-registration content) |
| **Autofill Returning** | Form builder toggle (contact-book prefill) |
| **Waitlist Auto-promotion** | Rules panel inside `WaitlistScreen` |

All 16 sidebar titles get registered in `registry.jsx`. The 10 folded titles map
to a small `RegistrationsRedirectScreen` that renders the relevant host screen
(e.g. **Plus-ones** → `RegistrationsScreen`, **Conditional Questions** →
`RegistrationFormsScreen`) with a short context banner explaining where the
feature lives. This keeps every sidebar entry "real" without duplicating tables.

> Default taken: folded items use a thin redirect-to-host screen rather than 10
> bespoke pages. Rationale: matches the architecture rule (per-entity config is
> not a top-level screen) and avoids 10 near-empty CRUD surfaces.

---

## 2. Data model

### 2.1 `flow_registrations` (new table)

One row per person per event.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()`; caller may supply for optimistic insert |
| `event_id` | uuid | FK → `flow_events(id)`; the event they signed up for |
| `form_id` | uuid null | FK → `flow_registration_forms(id)`; which form was used |
| `name` | text | registrant name |
| `email` | text | registrant email |
| `phone` | text | optional |
| `status` | text | `Confirmed · Pending · Waitlisted · Declined · Cancelled · Checked-in` (default `Confirmed`) |
| `source` | text | `Online · Organizer · Import · API` (default `Online`) |
| `party_size` | integer | total seats incl. registrant (default 1) |
| `plus_ones` | jsonb | `[{ name, email? }]` named guests (default `[]`) |
| `dietary` | text | dietary needs note |
| `accessibility` | text | accessibility needs note |
| `answers` | jsonb | `{ [questionId]: value }` custom/conditional answers (default `{}`) |
| `waitlist_position` | integer null | rank in the event's waitlist; null unless Waitlisted |
| `approved_by` | uuid null | organizer who approved (→ `auth.users`) |
| `approved_at` | timestamptz null | when approved/denied |
| `created_by` | uuid null | owner (→ `auth.users`), for RLS later |
| `metadata` | jsonb | expansion bag (default `{}`) |
| `created_at` / `updated_at` | timestamptz | standard; `flow_touch_updated_at` trigger |
| `deleted_at` | timestamptz null | soft delete; lists filter `is null` |

Indexes: `(event_id) where deleted_at is null`, `(status) where deleted_at is
null`, `(created_at desc)`.

### 2.2 `flow_registration_forms` (new table)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | form name |
| `description` | text | |
| `status` | text | `Draft · Published` (default `Draft`) |
| `fields` | jsonb | ordered `[{ id, label, type, required, options?, showWhen? }]`. `showWhen = { fieldId, equals }` drives Conditional Questions |
| `settings` | jsonb | `{ tokenGated, memberOnly, group, autofill, opensAt, closesAt, confirmation: { title, body, showCalendar, showShare } }` |
| `created_by` | uuid null | |
| `metadata` | jsonb | |
| `created_at` / `updated_at` / `deleted_at` | timestamptz | standard |

### 2.3 RPCs

- `flow_promote_waitlist(p_event_id uuid, p_count int default 1)` — promote the
  next N Waitlisted regs (lowest `waitlist_position`) to Confirmed, atomically,
  and resequence remaining positions. Returns promoted rows.
- `flow_approve_registration(p_id uuid, p_approve bool, p_by uuid)` — set status
  Confirmed/Declined, stamp `approved_by/at`.

Both are idempotent-safe and defined in the registrations SQL file. Capacity is
read from `flow_events.capacity`; promotion respects it (no oversell).

### 2.4 SQL file

`supabase/sqls/registrations.sql` — self-contained + idempotent per conventions:
`create extension pgcrypto`, local `flow_touch_updated_at()`, both `create table
if not exists`, `alter … add column if not exists` back-fills, triggers, indexes,
the two RPCs, **RLS on** with the demo `for all to anon, authenticated using
(true)` policy, and **seed rows** for ~30–40 demo registrations spread across the
8 seeded `flow_events` UUIDs (mix of statuses/sources, a few with plus-ones,
dietary, and a waitlist with positions) plus 2–3 demo forms. Runs via
`npm run db:push`.

---

## 3. Data layer

### `lib/supabase/registrations.js`

Pure, tri-state returns (`null` / `[]` / object|`true` / `false`), `normalize` +
`toRow`, `isSupabaseConfigured` guard on every call (imported from `events.js`).

- `listRegistrations()` — all, newest first (joins nothing; event names resolved
  in the screen from `listEvents()`).
- `listRegistrationsByEvent(eventId)`
- `createRegistration(input)` — honors caller `id`.
- `updateRegistration(id, patch)` — `toRow` emits only present keys (serves both
  full save and single-field inline status change).
- `softDeleteRegistration(id)`
- `promoteWaitlist(eventId, count)` → calls `flow_promote_waitlist` RPC.
- `approveRegistration(id, approve, by)` → calls `flow_approve_registration` RPC.

`normalizeRegistration` maps snake→camel, defaults every field, spreads
`metadata` last. `toRow` maps camel→snake, coerces numerics, empty→null.

### `lib/supabase/registration_forms.js`

`listForms` / `getForm` / `createForm` / `updateForm` / `softDeleteForm` with the
same shape.

---

## 4. Screens

All built from the shared kit (`screen_kit.jsx`) + shadcn, semantic tokens only,
three list states (loading / empty / filtered-empty), optimistic mutations +
`toast`, `useMemo`-derived lists & stats. Constants live in
`components/internal/screens/registrations/constants.js`
(`REGISTRATION_STATUS_MAP`, `SOURCE_MAP`, `*_FILTER_OPTIONS`, reuse
`formatDate`). Event-name lookup map is derived from `listEvents()`.

### 4.1 RSVPs — `RegistrationsScreen` (the hub)

- **Header:** "RSVPs" + description; primary action **Add registrant** (opens
  create dialog → source = Organizer = "Register on Behalf").
- **StatsBar KPIs:** Total registrations · Confirmed · Pending approval ·
  Waitlisted · Checked-in.
- **Toolbar:** FilterDropdowns (Event, Status, Source) + SearchInput
  (name/email).
- **DataTable columns:** Registrant (name + email), Event, Status (`StatusPill` +
  `REGISTRATION_STATUS_MAP`), Source (Badge), Party (party_size, "+N" if
  plus-ones), Registered (date), row-actions menu (View, Approve/Decline if
  Pending, Move to waitlist, Delete).
- **Detail:** row click opens a **Sheet drawer** (right side) — registrant info,
  status control, named plus-ones roster, dietary/accessibility, custom answers,
  approve/decline + delete. (Local state, not URL — lightweight quick-look; the
  drawer is the per-record surface, not a full screen.)
- **Export:** toolbar "Export CSV" of the filtered set.

### 4.2 Registration Forms — `RegistrationFormsScreen`

- **List view:** header + **New form**; StatsBar (Total forms · Published ·
  Drafts · Avg fields); table (Name, Status, Fields count, Updated, actions:
  Edit/Duplicate/Delete).
- **Builder view** (early-return detail, like `event_detail`): a tabbed editor
  (`Tabs` from `components/ui/tabs`) with a back affordance:
  - **Fields** tab — add/edit/reorder fields (label, type select [text, email,
    select, checkbox, textarea, number], required toggle); per-field
    **conditional logic** (`show when <field> equals <value>`) → *Conditional
    Questions*.
  - **Access** tab — Token-gated, Member-only, Group registration, Autofill
    returning toggles + open/close **deadline** window → *Token-gated,
    Member-only, Group, Deadlines, Autofill*.
  - **Confirmation** tab — editable confirmation-page title/body + show-calendar /
    show-share toggles → *Confirmation Page*.
  - Saves persist through `updateForm` (optimistic + toast).

### 4.3 Waitlist — `WaitlistScreen`

- Filtered to `Waitlisted` regs, grouped by event. Per group: event name, count,
  capacity/fill, **Promote next** button (→ `promoteWaitlist` RPC) and a
  per-row **Promote** action. Position column, joined/wait-time.
- **Auto-promotion rules panel** (`SectionCard` + `SettingsList`/`SettingRow`):
  enable auto-promote, claim-window hours, notify-on-promote. Persisted per-event
  in the event `metadata` bag (`waitlist` key) via `updateEventMeta` — reuses the
  existing merge-meta RPC; no new storage.

### 4.4 Approval Gates — `ApprovalGatesScreen`

- Inbox of `Pending` regs across events. StatsBar (Pending · Approved today ·
  Declined · Avg wait). Each row: registrant, event, requested date, **Approve** /
  **Decline** (decline opens a small reason dialog) → `approveRegistration` RPC,
  optimistic removal from the inbox + toast. Bulk approve/decline on selection.

### 4.5 Capacity Limits — `CapacityLimitsScreen`

- Cross-event monitor: one row per event with capacity, confirmed count, fill %
  (progress bar like All Events sell-through), remaining, waitlist size, and an
  **overbooking buffer** inline number edit (persisted to event `metadata`
  `capacityBuffer` via `updateEventMeta`). KPIs: events at/over capacity, total
  seats, avg fill. Read-mostly; the editable bit is the buffer + a cap edit that
  writes `flow_events.capacity` through `updateEvent`.

### 4.6 Dietary & Accessibility — `DietaryAccessibilityScreen`

- Aggregated report: a table of registrants who have dietary/accessibility notes
  (filter by event), plus a summary breakdown (counts per common dietary tag,
  e.g. Vegetarian/Vegan/Gluten-free/Nut allergy derived from the free-text +
  tags). **Export CSV** for catering/venue ops. KPIs: registrants with needs,
  distinct dietary tags, accessibility requests.

---

## 5. Wiring & files

### New files

```
supabase/sqls/registrations.sql
lib/supabase/registrations.js
lib/supabase/registration_forms.js
components/internal/screens/registrations/constants.js
components/internal/screens/registrations/registrations.jsx        (RegistrationsScreen + detail Sheet + add dialog)
components/internal/screens/registrations/registration_forms.jsx   (list + builder tabs)
components/internal/screens/registrations/waitlist.jsx
components/internal/screens/registrations/approval_gates.jsx
components/internal/screens/registrations/capacity_limits.jsx
components/internal/screens/registrations/dietary_accessibility.jsx
components/internal/screens/registrations/folded_redirect.jsx       (RegistrationsRedirectScreen for the 10 folded titles)
```

### Edited files

- `components/internal/screens/registry.jsx` — import + register all 16 titles
  (6 real screens, 10 → `RegistrationsRedirectScreen` configured per host).

No `sidebar_nav.jsx` change needed — the 16 titles already exist there.

---

## 6. Build sequence

1. **Data track:** `registrations.sql` (+ RPCs + seed) → `registrations.js` +
   `registration_forms.js`. Lint.
2. **Constants:** `registrations/constants.js`.
3. **Hub:** `registrations.jsx` (RSVPs list + detail drawer + add dialog).
4. **Forms:** `registration_forms.jsx` (list + builder tabs).
5. **Ops screens:** `waitlist.jsx`, `approval_gates.jsx`, `capacity_limits.jsx`,
   `dietary_accessibility.jsx`.
6. **Folded + wiring:** `folded_redirect.jsx`, register all 16 in `registry.jsx`.
7. **Lint** all changed files (`npx eslint`), then tell the user to run
   `npm run db:push` to create the table + seed.

---

## 7. Quality bar (from `crafting.md`)

Loading / empty / filtered-empty on every list; optimistic + persisted mutations
with `crypto.randomUUID()` ids; semantic color tokens only; shared-kit reuse
(ScreenHeader, StatsBar, Toolbar, DataTable, StatusPill, EmptyState, SectionCard,
SettingsList, Field); dropdowns/dialogs/drawers visibly elevated; Sonner toasts;
`npx eslint` clean. Data access only through `createClient()`; screens render
camelCase view models; data layer stays pure (no toasts, no throws).

---

## 8. What the user runs after build

- `npm run db:push` — creates `flow_registrations` + `flow_registration_forms`,
  the two RPCs, and seeds demo data. Until then the screens degrade to the empty
  state (no DB), consistent with the convention.
