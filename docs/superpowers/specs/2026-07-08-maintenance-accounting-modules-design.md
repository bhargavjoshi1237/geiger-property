# Maintenance & Accounting Modules — Design

**Date:** 2026-07-08
**Status:** Approved (build Maintenance group first with a checkpoint, then Accounting)

## Goal

Turn every sidebar sub-item under **Maintenance** (7) and **Accounting** (8) into its
own registered workspace screen — a list + a right-hand-tabbed detail editor —
reusing the existing config-driven Entity engine (`EntityListScreen` /
`EntityDetailScreen`, `makeEntityData`, section factories). Full Supabase
persistence: real `property.*` tables + data layers. Mirrors the approved
Tenants/Leasing build exactly. Both parent nav titles already read **Maintenance**
and **Accounting** in `sidebar_nav.jsx`.

## Decisions (from brainstorm)

1. **Maintenance model:** unified `work_orders` table; Work Orders and Maintenance
   Requests are **lenses** (`kind = 'work_order' | 'request'`); "convert request to
   work order" flips `kind`. Mobile Maintenance is a field lens (`is_field = true`).
2. **Editor depth:** full, tailored section set per screen (Costs, Labor, Materials,
   Timeline, Assigned Vendor/Technician, etc.), composed from the factories.
3. **Delivery:** Maintenance group first → review checkpoint → Accounting group.
4. **Persistence:** full Supabase; author `maintenance.sql` + `accounting.sql` and run
   `npm run db:push`.

## Architecture

No new plumbing. Each sidebar title → `<EntityListScreen config={X} />`, registered
in `registry.jsx`. Lenses reuse a base layer via `lensData(base, { where, defaults })`.
Sections come from `entity/sections/factories.jsx`
(`makeFieldsSection`/`makeOverviewSection`/`makeMetaListSection`/`makeNotesSection`).
The current `maintenance/` folder is on the pre-engine pattern (demo rows + bespoke
`sections/*`) and is migrated: bespoke sections deleted, config rebuilt on the engine.

## Maintenance group (schema `property`)

**Tables:** `work_orders` (core), `vendors`, `vendor_assignments`, `maintenance_attachments`.

| Title | Data | Sections |
|---|---|---|
| All Maintenance | `work_orders` (all rows) | overview · details · schedule · assignment · priority · labor · materials · costs · photos · timeline · documents · activity · settings |
| Work Orders | lens `kind='work_order'` | (same rich set as All Maintenance) |
| Maintenance Requests | lens `kind='request'` | overview · details · requester · approval · photos · activity · settings |
| Vendors | `vendors` | overview · details · specialty · compliance · rates · ratings · documents · notes · settings |
| Vendor Assignments | `vendor_assignments` | overview · details · schedule · status · notes · activity · settings |
| Photos & Attachments | `maintenance_attachments` | overview · file · preview · notes · settings |
| Mobile Maintenance | lens `is_field=true` on `work_orders` | overview · field · technician · checklist · inspection · fieldReport · sync · activity |

`work_orders` columns: name, kind, is_field, property_label, tenant_name, category,
priority, status, vendor_name, technician, scheduled_date, labor_cost, material_cost,
total_cost + `metadata` bag (description, labor[], materials[], photos[], timeline[],
documents[], checklist[], notes, activityNotes, requester fields, sync state…).

## Accounting group (schema `property`) — after checkpoint

**Tables:** `transactions` (ledger), `recurring_charges`, `autopay_enrollments`,
`late_fee_rules`, `payment_plans`, `payment_methods`.

| Title | Data |
|---|---|
| Transaction History | `transactions` (all) |
| Rent Collection | lens `transactions` (rent charges + balances) |
| Online Payments | lens `transactions` (online/card/ACH methods) |
| Recurring Charges | `recurring_charges` |
| Autopay | `autopay_enrollments` |
| Late Fees | `late_fee_rules` |
| Payment Plans | `payment_plans` |
| Payment Methods | `payment_methods` |

## SQL

New `supabase/sqls/maintenance.sql` and `supabase/sqls/accounting.sql` — idempotent,
`property` schema, local `property.touch_updated_at()` trigger, `metadata jsonb` bag,
soft delete, open demo RLS, grants to anon/authenticated/service_role — mirroring
`leasing.sql`. Run via `npm run db:push`.

## Conventions

`@geiger/ui` + shared `screen_kit` only; semantic tokens; three list states;
optimistic + persisted mutations; data layers pure (`null`/`false`/`[]`, never
throw/toast); `npx eslint` clean. Registry titles match `sidebar_nav.jsx` exactly.
