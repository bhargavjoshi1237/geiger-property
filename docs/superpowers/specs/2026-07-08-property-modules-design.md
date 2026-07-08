# Property Modules — Design Spec

Date: 2026-07-08
Area: Geiger Property → "Property" sidebar group
Status: Approved (build directly)

## Goal

Build out every sub-item under the Property sidebar group as a fully-functional,
DB-backed workspace screen using the existing config-driven **Entity engine**
(`components/internal/screens/entity/*`). Areas:

1. **Properties** (upgrade the existing half-built area to a real data layer)
2. **Units**
3. **Portfolios**
4. **Buildings & Blocks**
5. **Floor Plans**
6. **Unit Types**
7. **Amenities**
8. **Property Photos & Media**

Plus the cross-cutting relationships the user called out: amenities attach to
properties/units; floor plans link to units/properties; media attaches to
properties/units; every editor gets Documents / Activity / Settings.

## Non-negotiables (from repo conventions)

- Reuse the Entity engine + shared kit (`@/components/internal/shared/screen_kit`)
  and shadcn primitives (`@/components/ui/*`). No bespoke layout where the kit fits.
- Data-layer-first: screens fetch on mount through `lib/supabase/<area>.js`; no
  static seed. Data layer is pure (guarded by `isSupabaseConfigured()`, returns
  `null`/`[]`/`false`, `console.error` on failure, never throws/toasts).
- DB snake_case ↔ UI camelCase mapped at the data-layer boundary
  (`normalize*` / `toRow`).
- Tables live in the `property` schema, self-contained + idempotent SQL under
  `supabase/sqls/`. Cross-area references are **soft `uuid` columns** (no hard
  cross-file FKs), matching `tenants.sql`.
- Semantic color tokens only. Optimistic mutations + `toast` in the screen/section.

## Architecture: generic-first

The Entity engine already drives list + editor from a `config`. We extend the
**config-driven** philosophy so an area is almost entirely declarative:

### Config additions

- `config.detailFields`: `[{ key, label, type: text|number|select|textarea|date,
  options?, placeholder?, hint?, span?: 1|2 }]` — drives the generic Details form
  and the Overview "quick facts".
- `config.overviewStats(item)`: optional `[{ label, value, hint? }]` for the
  Overview KPI tiles (falls back to headerMeta).
- `config.sectionProps`: `{ [sectionKey]: {...props} }` — extra props merged into
  a section's props by the engine, so one generic section serves multiple roles
  (e.g. `FloorPlansSection` in `single` vs `multi` mode; a second `DetailsSection`
  bound to a different field set for "Lease & Occupancy").
- `config.data`: the data-layer contract `{ list, create, update, softDelete,
  normalize }` (already supported).

### Engine change

`entity_detail_screen.jsx`: when rendering the active section, spread
`config.sectionProps?.[active]` into the section's props. One-line addition; no
behavior change for areas that don't set it.

### Generic reusable sections (`components/internal/screens/entity/shared_sections/`)

| Section | Driven by | Behavior |
|---|---|---|
| `OverviewSection` | `config.overviewStats`, `detailFields` | status + KPI tiles + quick-facts grid, read-only snapshot |
| `DetailsSection` | `config.detailFields` (or `props.fields`) | editable form → `onPatch`; header Save persists |
| `SettingsSection` | `config.statusFilterOptions` | status select (commit), a couple metadata toggles, danger-zone delete → `data.softDelete` + `onBack` |
| `DocumentsSection` | polymorphic `documents` | upload to storage, list, delete; owner = `config.key`/`item.id` |
| `ActivitySection` | polymorphic `activity` | timeline; post-a-note + system entries |
| `AmenitiesSection` | `amenity_links` | attach/detach amenities to this owner via a picker |
| `MediaSection` | polymorphic `media` | upload images, grid, set-cover, delete |
| `FloorPlansSection` | `floor_plan_links` (+ `units.floor_plan_id`) | `multi`: attach plans via links; `single`: pick one plan → FK |
| `RelatedUnitsSection` | `props.filterField` | units where `filterField == item.id`; add-unit pre-linked; open in Units tab |
| `PortfolioPropertiesSection` | `properties.portfolio_id` | assign/remove member properties |

### Bespoke sections (small)

- `PlanFileSection` (Floor Plans): upload/replace the drawing → `floor_plans.image_url`.
- `FloorPlanLinkedSection` (Floor Plans): reverse — units + owners using this plan.
- `AmenityAttachedSection` (Amenities): reverse — owners in `amenity_links`.
- `MediaPlacementSection` (Media): assign owner (property/unit) + set-as-cover.

## Data model (`property` schema)

Standard columns on every table: `id uuid pk default gen_random_uuid()`,
`created_by uuid`, `metadata jsonb not null default '{}'`, `created_at`,
`updated_at` (touch trigger), `deleted_at` (soft delete). Lists filter
`deleted_at is null`.

### Entity tables

- **properties** — `name, address, city, state, zip, type, status, portfolio_id,
  year_built, description, cover_url, unit_count`
  (status: Active/Vacant/Maintenance/Off-market/Draft).
- **units** — `label, property_id, building_id, unit_type_id, floor_plan_id, floor,
  bedrooms, bathrooms, sqft, rent, deposit, status, occupant_name, tenant_id,
  lease_start, lease_end`
  (status: Occupied/Vacant/Notice/Make-ready/Down/Draft).
- **portfolios** — `name, description, manager, region, color, status`
  (Active/Archived/Draft).
- **buildings** — `name, block_code, property_id, floors, year_built,
  structure_type, wing, description, status`
  (Active/Under construction/Inactive/Draft).
- **floor_plans** — `name, bedrooms, bathrooms, sqft, dimensions, image_url,
  property_id, description, status` (Active/Draft/Archived).
- **unit_types** — `name, bedrooms, bathrooms, sqft, market_rent, deposit,
  floor_plan_id, description, status` (Active/Inactive/Draft).
- **amenities** — `name, category, scope, icon, fee_type, fee_amount, description,
  status` (Active/Inactive/Draft). category ∈ Community/Unit/Building/Outdoor/
  Parking/Security/Utilities/Accessibility. scope ∈ property/unit/both.

### Cross-cutting tables (`supabase/sqls/property_shared.sql`)

- **media** — `owner_type, owner_id (nullable), kind (photo/video/360/document),
  name, url, thumb_url, is_cover, sort, size_bytes, status` (Published/Draft).
- **documents** — `owner_type, owner_id, kind, name, url, size_bytes`.
- **activity** — `owner_type, owner_id, verb, summary, actor_id, actor_name,
  occurred_at`.
- **amenity_links** — `amenity_id, owner_type, owner_id` (unique together).
- **floor_plan_links** — `floor_plan_id, owner_type, owner_id` (unique together).

`owner_type` ∈ property/unit/building/unit_type/portfolio.

## Storage

Reuse the existing public **`products`** bucket (already configured for events)
under a `property/<ownerType>/<ownerId>/` prefix and `property/floor-plans/<id>/`.
New helpers in `lib/supabase/property_storage.js`: `uploadPropertyImage`,
`uploadFloorPlanImage`, `removePropertyImage`, reusing `compressImageUnder` and
`buildPublicUrl`. Persist public URLs (not paths) on rows.

## Editor section maps (right-nav)

- **Properties**: overview · details · units(`RelatedUnits` filter=property_id) ·
  amenities · floorplans(multi) · media · documents · activity · settings
- **Units**: overview · details · lease(`Details` w/ lease fields) · amenities ·
  floorplan(single) · media · documents · activity · settings
- **Amenities**: overview · details · attached(`AmenityAttached`) · documents ·
  activity · settings
- **Portfolios**: overview · details · properties(`PortfolioProperties`) ·
  documents · activity · settings
- **Buildings**: overview · details · units(filter=building_id) · floorplans(multi)
  · amenities · media · documents · activity · settings
- **Floor Plans**: overview · details · planfile(`PlanFile`) · linked(`FloorPlanLinked`)
  · documents · activity · settings
- **Unit Types**: overview · details · amenities · units(filter=unit_type_id) ·
  documents · activity · settings
- **Media**: overview · details · placement(`MediaPlacement`) · activity · settings

## Sidebar & registry

- `sidebar_nav.jsx`: top-level `Properties` → `Property`; sub `All Properties` →
  `Properties`.
- `registry.jsx`: wire `Properties, Units, Portfolios, Buildings & Blocks, Floor
  Plans, Unit Types, Property Photos & Media, Amenities` to their screens.

## File inventory

- SQL: `properties.sql, units.sql, portfolios.sql, buildings.sql, floor_plans.sql,
  unit_types.sql, amenities.sql, property_shared.sql`
- Data: `lib/supabase/{properties,units,portfolios,buildings,floor_plans,
  unit_types,amenities,media,documents,activity,amenity_links,floor_plan_links,
  property_storage}.js`
- Engine: edit `entity_detail_screen.jsx`; new `entity/shared_sections/*`
- Areas: `screens/{properties,units,portfolios,buildings,floor_plans,unit_types,
  amenities,media}/{config.jsx, <screen>.jsx}` (+ bespoke section files where noted)
- `registry.jsx`, `sidebar_nav.jsx`

## Out of scope

- RBAC per-area keys (nav defaults to visible; add later if gated).
- Auth-scoped RLS (open demo policy, replaced when auth lands).
- Bucket provisioning (reuses existing `products` bucket).

## Verification

`npx eslint` clean on all changed files. Screens render loading→empty with no DB
(guards return `null`), and full CRUD + attach flows when configured.
