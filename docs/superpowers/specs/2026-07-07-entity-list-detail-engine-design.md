# Reusable Entity List + Detail Engine — Design

Date: 2026-07-07
Status: Approved (implementing)

## Goal

Port geiger-events' "All Events → event editor (right-hand section list)" pattern
into geiger-property as a **single reusable, config-driven engine** used by four
sidebar areas — Properties, Tenants, Maintenance, Leasing — and any future area.
Frontend only in this pass; features + DB for one area come later.

## Reference (geiger-events)

- `screens/events/all_events.jsx` — list screen; swaps to the editor by reading
  `?event=<id>` from the URL and early-returning `<EventDetailScreen>`.
- `screens/events/event_detail.jsx` — editor shell: header/topbar (back link,
  title, status pill, Save) + two-column grid (active section left, grouped
  right-hand nav list right).
- `screens/events/event_sections.js` — `NAV_GROUPS` (right list) + `SECTIONS`
  (key → component). Each section is its own file with a common prop contract.

## Architecture

One generic pair drives every area; nothing area-specific lives in the engine.

- **`EntityListScreen({ config })`** — `ScreenHeader` + `StatsBar` + `Toolbar`
  (search + status filter) + `DataTable` + create dialog + row actions
  (edit/duplicate/delete). Reads `?item=<id>`; early-returns `EntityDetailScreen`.
- **`EntityDetailScreen({ item, config, onBack, onUpdate })`** — header/topbar +
  two-column grid; left renders the active section, right renders
  `config.navGroups`. Section active key lives in `?section=<key>`.

## File hierarchy

```
components/internal/screens/
  entity/
    entity_list_screen.jsx
    entity_detail_screen.jsx
    section_placeholder.jsx      # shared "designed next" section body
    default_sections.jsx         # DEFAULT_SECTION_META + buildNavGroups(singular)
  properties/    { config.js, all_properties.jsx, sections/{overview,details,documents,activity,settings}.jsx }
  tenants/       { config.js, all_tenants.jsx,     sections/… }
  maintenance/   { config.js, all_maintenance.jsx, sections/… }
  leasing/       { config.js, all_leases.jsx,      sections/… }
```

Each area owns its 5 section files (they render `<SectionPlaceholder>` for now),
so real per-entity content later edits only that area's `sections/*`.

## config shape

`{ key, singular, plural, title, description, entityLabel, icon, columns,
statusMap, statusFilterOptions, stats(rows), createDraft, createFields, newRow(draft),
demoRows, navGroups, sections, titleField, headerMeta(item) }`

- `columns` → `DataTable` columns `[{ key, header, align?, className?, render(row) }]`.
- `statusMap` → `StatusPill` map `{ [status]: { label, variant, dotClass } }`.
- `createFields` → `[{ key, label, type: 'text'|'select', options?, placeholder? }]`.
- `navGroups`/`sections` → right-hand nav + key→component map (built from
  `buildNavGroups(singular)` + the area's own section imports).

## Starter sections (shared set, per-area files)

Overview, Details, Documents, Activity, Settings. `default_sections.jsx` owns the
labels/icons/desc/grouping; each area maps the five keys to its own component
files. All five render `<SectionPlaceholder>` in this pass.

## URL / state

Extend `useWorkspaceUrl` with a generic selection param mirroring `event`:
`itemId` (from `?item`), `openItem(id)`, `closeItem()`. `?item=<id>&section=<key>`.
One editor open per tab (tab already scopes the path).

## Data (intentional deviation, temporary)

Per the chosen "in-memory placeholder rows" approach, the list holds rows in
`useState(config.demoRows)` — **not** a data-layer fetch — so the editor is
clickable before the DB exists. Clearly marked TEMP; swaps to
`list*/create*/softDelete*` fetch-on-mount when each area's data layer is built.
Everything else follows MODULE/SUPABASE conventions and the shared kit.

## Sidebar + registry

- Properties already has `All Properties (P0)` — wire it (no duplicate).
- Add top sub-items `All Tenants (P0)`, `All Maintenance (P0)`, `All Leases (P0)`.
- Registry maps each exact title → the area's thin `All*Screen`.
- Rows represent: Property, Tenant, Work Order, Lease.
