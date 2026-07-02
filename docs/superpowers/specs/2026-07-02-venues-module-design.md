# Venues Module — Design Spec

**Date:** 2026-07-02
**Status:** Approved

## Goal

Add a top-level **Venues** area to the Geiger Events workspace: a project-scoped
entity for creating and maintaining reusable venues. When creating/editing an
event, venues appear in the venue dropdown; on the live public event page
(`/e/[id]`), clicking the venue opens a detail dialog. Full implementation —
database, data layer, screens, and event integration — following
`MODULE_CONVENTIONS.md`, `SUPABASE_CONVENTIONS.md`, and `crafting.md`.

## Entity: `events.venues`

Project-scoped, soft-deletable. Organized into 5 editor sections.

| Section | Fields |
|---|---|
| **Details** | `name` (required), `type` (Indoor / Outdoor / Hybrid / Virtual), `status` (Active / Inactive / Archived), `description` |
| **Location** | `address`, `city`, `region`, `postcode`, `country`, `timezone`, `latitude`, `longitude`, `parking_notes`, `transit_notes` |
| **Capacity & amenities** | `seated_capacity`, `standing_capacity`, `spaces` (rooms), `amenities` (jsonb string array) |
| **Contact** | `contact_name`, `contact_email`, `contact_phone`, `website` |
| **Media** | `cover_url`, `gallery` (jsonb URL array) — Supabase Storage, `products` bucket, `venues/<id>/` |

- Status colors: Active = `success`/emerald, Inactive = `neutral`, Archived = `outline`.
- Type badges: Indoor = neutral, Outdoor = success, Hybrid = purple, Virtual = info.
- Amenities catalog: Wi-Fi, Parking, Wheelchair accessible, Catering, AV / Sound,
  Stage, Bar, Air conditioning, Outdoor space.
- `metadata jsonb` expansion bag; `venue_merge_meta(p_id, p_patch)` RPC for
  per-section metadata merges (parity with events/series).

## Persistence

- **`supabase/sqls/venues.sql`** — self-contained + idempotent: `events.venues`
  table, `touch_updated_at` trigger, indexes, `venue_merge_meta` RPC, open demo
  RLS, and `alter table events.events add column venue_id → events.venues(id) on
  delete set null`. Text `venue` / `address` / `city` remain as a snapshot.
- **`supabase/sqls/zz_project_access.sql`** — add `events.venues` to the truncate
  list, a NOT NULL `project_id` column + index, a member `for all` policy, and a
  **public read** policy (so `/e/[id]` can load a linked venue's detail).
- **`lib/supabase/venues.js`** — `normalizeVenue` / `toRow`, `listVenues(projectId)`,
  `getVenue(id)`, `createVenue`, `updateVenue`, `mergeVenueMeta`,
  `softDeleteVenue`. Pure; returns `null` / `[]` / `false`.
- **`lib/supabase/storage.js`** — add `uploadVenueImage` / `venueMediaPrefix`
  reusing the products bucket under `venues/<id>/`.
- **`lib/supabase/events.js`** — add `venueId` to `normalizeEvent` + `toRow`
  (`venue_id`).

## Screens (`components/internal/screens/venues/`)

- **`all_venues.jsx`** (`VenuesScreen`) — registered under sidebar title
  **"Venues"**. `ScreenHeader` + `StatsBar` (Total venues · Total capacity ·
  Active · Cities) + `Toolbar` (status & type `FilterDropdown` + search) +
  `DataTable`; loading / empty / filtered-empty states; optimistic
  create / duplicate / delete. Create dialog: name + type + city.
- **`venue_detail.jsx`** (`VenueDetailScreen`) — left content pane + right 260px
  section nav (mirrors `event_detail.jsx`); active section in `?section=`;
  inline edits lift back to the list; a Save button persists.
- **`venue_sections.js`** — `VENUE_NAV` + 5 section components.
- **`constants.js`** — `VENUE_STATUS_MAP`, `VENUE_TYPE_MAP`, filter options,
  `AMENITIES`, formatters, sample venues fallback.

## Wiring

- **Sidebar:** top-level **"Venues"** (icon `Building2`, after Events, no
  sub-items → direct screen) in `sidebar_nav.jsx`.
- **Registry:** `Venues → VenuesScreen` in `registry.jsx`.
- **RBAC:** add `view.venues` to `WORKSPACE_PERMISSIONS`.
- **URL hook:** add a `venue` query param + `openVenue` / `closeVenue` to
  `use-workspace-url.js`; reuse the existing `section` param.

## Event integration

- **Create-event dialog** (`all_events.jsx`) + **event editor location section**
  (`location_time.jsx`): venue dropdown fetches real venues via
  `listVenues(projectId)`; picking one sets `venueId` and auto-fills the event's
  `venue` / `address` / `city` snapshot. Free-text still allowed when there's no
  DB or no venues (sample `VENUES` fallback preserved).
- **Live `/e/[id]` page** (`event_public_page.jsx`): the venue line becomes a
  clickable button → a **Venue details dialog** (map link, capacity, amenities,
  contact, directions), fetched via `getVenue(event.venueId)`. Falls back to
  plain text when no venue is linked.

## Non-goals

- No standalone public venue page (venues surface only through events).
- No booking/availability calendar. No seating charts.
