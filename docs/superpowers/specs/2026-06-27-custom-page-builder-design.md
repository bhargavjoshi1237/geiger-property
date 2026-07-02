# Custom Page Builder — Design Spec

**Date:** 2026-06-27
**Area:** Events module — Page Design
**Status:** Approved design, pending implementation plan

## 1. Summary

Replace the current "Custom" page-design mode (a vertical block-list manager) with a
**freeform, Wix/Elementor-style visual canvas editor**. When an event's page mode is
`custom`, the public page (`/e/<id>`) is rendered entirely from a user-designed canvas
of absolutely-positioned elements — including **smart event elements** (tickets, RSVP,
schedule, map, hosts, countdown) so a fully custom page can still sell tickets.

The canvas is stored in a **dedicated table** (`flow_event_layouts`), separate from the
existing `metadata.pageDesign` bag. The builder lives **inline inside the Page Design
section** of the event editor, scaled to fit the column.

### Decisions locked during brainstorming

| Decision | Choice |
|---|---|
| Edit model | Freeform absolute x/y canvas (Wix-style), drag + resize + snap |
| Responsive | Scale the canvas proportionally to fit any viewport (one layout) |
| Element palette | Generic content **+** smart event elements (tickets, RSVP, schedule, map, hosts, countdown) |
| Storage | Dedicated `flow_event_layouts` table + new migration |
| Drag engine | `react-rnd` (fallback `react-moveable` if React 19 incompat) |
| Editor surface | Inline, fit-scaled inside the Page Design section (zoom-to-fit + zoom control) |

## 2. Scope

### In scope
- `custom` mode becomes the canvas builder; the old custom block-list UI is removed.
- A read-only canvas renderer shared by the public route and the editor preview overlay.
- Dedicated storage table, RLS, upsert RPC, and a pure data-access layer.
- Element library (content + smart) driven by a registry, mirroring `BLOCK_LIBRARY`.
- A seeded starter canvas on first switch to `custom` (so it is never blank and always
  ships with a Tickets element).

### Out of scope (deliberate; structured to allow later without migration churn)
- Per-breakpoint mobile editing (we scale instead of reflowing).
- Multi-page sites, version history / draft-vs-publish, animations, custom font uploads.

### Unchanged
- `standard` and `themed` modes. Themed keeps the existing block show/hide/reorder list.
  Content blocks (heading/text/etc.) only ever existed in custom mode, which is now the
  canvas — so no block is orphaned.

## 3. Entry point & navigation

No new route or registry entry (per `MODULE_CONVENTIONS.md`: per-entity features are
sections inside the event editor, not registered screens).

1. Workspace → **All Events** screen.
2. Click an event row → **Event Detail** editor (`event_detail.jsx`).
3. Right-hand section nav → **Page design** (`design` section).
4. Page mode → **Custom** → the canvas builder renders in place of the old block list.

Same canvas is reused read-only by:
- **Preview** — editor's existing Preview button → `EventPublicPage` overlay.
- **Live** — public route `/e/<event-id>`.

## 4. Data model

The canvas is one JSON document, kept **separate** from `metadata.pageDesign`
(`pageDesign` continues to hold `{ mode, accent, cover, font, showGallery, blocks }`).

```js
// lib/events/canvas.js
canvas = {
  version: 1,
  width: 1200,            // fixed design width; the public page scales to fit
  height: 2400,           // total height (design px); grows as elements are added
  background: {           // page background behind all elements
    type: "color" | "gradient" | "image",
    value: "...",         // hex | css gradient | image url
  },
  elements: [ Element, ... ],
}

element = {
  id,                     // `el_${counter}` local id
  type,                   // key into ELEMENT_LIBRARY ("heading" | "image" | "tickets" | …)
  x, y, w, h,             // design-space px on the 1200-wide canvas
  z,                      // stacking order (paint order)
  rotation,               // optional degrees, default 0
  props: { ... },         // type-specific (text, url, color, fontSize, align, …)
  name,                   // optional editor label
  locked,                 // optional; locked elements skip drag/resize
}
```

`ELEMENT_LIBRARY` is a registry array (mirrors `BLOCK_LIBRARY` in `page_design.jsx`):

```js
{
  type: "heading",
  label: "Heading",
  icon: Heading,                  // lucide
  category: "content" | "event",
  defaultSize: { w, h },
  defaultProps: { text: "Heading" },
  fields: [{ key, label, type }], // inspector field schema
}
```

### Element library (initial set)
- **Content:** heading, text, image, button, shape/box, divider, spacer, icon, video, embed.
- **Smart (event-bound):** cover image, event title, date/venue meta, hosts, **tickets**
  (selector + checkout), **RSVP**, schedule, location + map, countdown, gallery, FAQ.

Smart renderers reuse the existing block renderers in `page_blocks.jsx`
(schedule/location/faq/whosgoing/about/expect) and the checkout flow in
`event_public_page.jsx` (`TicketCheckout`, `buildTickets`).

## 5. Storage & migration

New idempotent file `supabase/sqls/events_layouts.sql`. **Filename note:** runs in
`.sort()` (alphabetical) order; `events.sql` < `events_layouts.sql` < `events_meta.sql`
because `.` (0x2E) precedes `_` (0x5F) — so the parent `flow_events` always exists first.

```sql
create table if not exists public.flow_event_layouts (
  event_id   uuid primary key references public.flow_events(id) on delete cascade,
  canvas     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- RLS: public read (published /e/<id> pages must load it); write restricted to the
-- event's creator (flow_events.created_by = auth.uid()).
alter table public.flow_event_layouts enable row level security;
-- (drop-then-create policies, mirroring storage.sql)
--   "Layouts public read"        for select to public  using (true)
--   "Layouts owner upsert/update" gated by the parent event's created_by

-- Upsert RPC (security definer, granted to authenticated), mirroring
-- flow_event_merge_meta in events_meta.sql:
create or replace function public.flow_event_save_layout(p_event_id uuid, p_canvas jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.flow_event_layouts (event_id, canvas, updated_at)
  values (p_event_id, coalesce(p_canvas, '{}'::jsonb), now())
  on conflict (event_id) do update
    set canvas = excluded.canvas, updated_at = now();
  return p_canvas;
end;
$$;
```

Runs via `npm run db:push`.

## 6. Data layer

New `lib/supabase/layouts.js` (pure: validate, `console.error` on failure, return
`null`/`false`; never throw or toast — mirrors `events.js`):

- `defaultCanvas()` — empty canvas document.
- `normalizeCanvas(row)` — DB row → canvas view model (guards shape).
- `getEventLayout(eventId)` → `canvas | null`.
- `saveEventLayout(eventId, canvas)` → via `flow_event_save_layout` RPC; returns
  `true` / `false` / `null` (null = Supabase not configured = local-only, treated as OK).

The **public page** loads the canvas in one round-trip: `getEvent` in `lib/supabase/events.js`
changes its select to `*, flow_event_layouts(canvas)` (Supabase resource embedding via the
FK), and `normalizeEvent` maps `row.flow_event_layouts?.canvas` → `event.canvas`. The
**editor** lazy-loads via `getEventLayout` only when the Page Design tab opens in custom
mode, keeping the list query light.

## 7. Rendering (shared, read-only) — `components/internal/screens/events/canvas/canvas_view.jsx`

`CanvasView({ canvas, event, accent, live })`:

- Renders each element absolutely positioned inside a 1200px-wide stage (paint order by `z`).
- **Scales proportionally:** a `ResizeObserver` on the wrapper sets
  `transform: scale(containerWidth / 1200)` (origin top-left) and the wrapper height to
  `canvasHeight × scale`, so the layout fills any viewport identically (chosen responsive model).
- Owns its own `<TicketCheckout>` dialog; placed **Tickets/RSVP** elements open it.
- Element renderers: a `CANVAS_ELEMENT_RENDERERS` map keyed by `type`. Content types get
  new small renderers; smart types delegate to existing `page_blocks.jsx` / checkout code.

Used by **both** `/e/[id]` (when `mode === "custom"`) and the editor preview overlay.

## 8. The editor — `components/internal/screens/events/canvas/canvas_editor.jsx`

Inline three-pane surface inside the Page Design section, fit-scaled to the column:

```
┌ Palette ┐┌──── Canvas (react-rnd) ────┐┌ Inspector ┐
│ Content ││  zoom-to-fit stage,        ││ position  │
│ Heading ││  snap grid, drag/resize,   ││ size      │
│ Image…  ││  selection outline,        ││ props for │
│ Event   ││  alignment guides          ││ selected  │
│ Tickets ││                            ││ element   │
└─────────┘└────────────────────────────┘└───────────┘
```

- **react-rnd** wraps each element for drag + resize (grid snap, canvas bounds). Click to
  select; the inspector edits geometry + `props` (from the element's `fields` schema);
  a toolbar provides duplicate, delete, lock, bring-forward/send-back.
- **Zoom-to-fit** with a zoom control; palette and inspector are compact/collapsible so the
  three panes fit the narrow editor column.
- Image elements upload through the existing `uploadEventImage` (bucket `products`,
  `events/<id>/`).
- A **canvas settings** panel edits background and total height.

### State & persistence
- Canvas state is **lifted into `EventDetailScreen`** alongside `design`, lazy-loaded on
  first entry to custom mode.
- **Save changes** persists both: `updateEventMeta(id, { pageDesign })` **and**
  `saveEventLayout(id, canvas)`. Optimistic/local when Supabase is absent (UI-first convention).
- First switch to `custom` seeds a **starter canvas** (cover image + title + date/venue +
  a text block + a Tickets element) so the page is never empty and can always sell tickets.

## 9. Integration points (exact)

| File | Change |
|---|---|
| `supabase/sqls/events_layouts.sql` | **new** — table + RLS + `flow_event_save_layout` RPC |
| `lib/supabase/layouts.js` | **new** — `defaultCanvas`, `normalizeCanvas`, `getEventLayout`, `saveEventLayout` |
| `lib/supabase/events.js` | `getEvent` select embeds `flow_event_layouts(canvas)`; `normalizeEvent` maps `canvas` |
| `lib/events/canvas.js` | **new** — canvas model, `ELEMENT_LIBRARY`, factories, `CANVAS_WIDTH` |
| `components/internal/screens/events/canvas/canvas_editor.jsx` | **new** — builder UI |
| `components/internal/screens/events/canvas/canvas_view.jsx` | **new** — read-only scaled renderer + element renderers |
| `components/internal/screens/events/page_design.jsx` | `custom` mode renders `<CanvasEditor>` instead of the block list |
| `components/internal/screens/events/event_detail.jsx` | lift `canvas` state, lazy-load, save via `saveEventLayout` |
| `components/internal/screens/events/event_public_page.jsx` | branch `mode === "custom"` → `<CanvasView live>`; export `TicketCheckout` / `buildTickets` |
| `app/e/[id]/page.js` | passes `event.canvas` through (no structural change; canvas arrives via `getEvent`) |
| `package.json` | add `react-rnd` |

## 10. Risks & mitigations

- **react-rnd on React 19.2** — wraps `react-draggable`; if a `findDOMNode` issue appears,
  switch to **react-moveable** (React-19-native). Verify early in the build (smoke-test a
  single draggable element before building the full editor).
- **Custom = whole page.** A custom page has no built-in cover/title/sidebar; ticketing
  exists only via a placed Tickets/RSVP element. Mitigated by the seeded starter template
  (always includes Tickets).
- **Narrow editor column.** Inline three-pane is tight; mitigated by zoom-to-fit, compact
  palette, and collapsible inspector.
- **Canvas document size.** Lazy-load in the editor and embed only in single-event
  `getEvent` (not in the list query) to avoid bloating `listEvents`.

## 11. Build sequence (high level)

1. Migration (`events_layouts.sql`) + run `db:push`.
2. Canvas model (`lib/events/canvas.js`) + data layer (`lib/supabase/layouts.js`) +
   `getEvent`/`normalizeEvent` embedding.
3. `react-rnd` install + a one-element drag/resize smoke test (React-19 check).
4. `canvas_view.jsx` read-only renderer + element renderers (content first, then smart).
5. `canvas_editor.jsx` builder (palette → drag-drop → inspector → toolbar → canvas settings).
6. Wire into `page_design.jsx` (custom mode) + `event_detail.jsx` (state, lazy-load, save).
7. Public-page branch in `event_public_page.jsx` + starter-template seeding.
8. Lint clean (`npx eslint <changed files>`); verify preview + `/e/<id>` render the canvas.
