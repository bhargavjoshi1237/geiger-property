# Tenants & Leasing Modules — Design

**Date:** 2026-07-08
**Status:** Approved (build Tenants group first, then Leasing)

## Goal

Turn every sidebar sub-item under **Tenants** (7) and **Leasing** (10) into its own
registered workspace screen — a list + a right-hand-tabbed detail editor — reusing
the existing config-driven Entity engine (`EntityListScreen` / `EntityDetailScreen`).
Full Supabase persistence: real tables + data layers for every distinct entity.

## Decisions (from brainstorm)

1. **Nav:** keep `Tenants` and `Leasing` as two separate sidebar parents (both already
   named correctly). No merge.
2. **Persistence:** full Supabase. New SQL tables + `lib/supabase/*.js` data layers for
   every distinct entity. Lenses reuse an existing table.
3. **Lenses vs entities:**
   - Lenses (share a table, own columns/stats/sections): Tenant Directory, Tenant
     Profiles, Resident Portal (→ `tenants`); Lease Builder (→ `leases`, drafts);
     State-specific Leases (→ `lease_templates`, `state` filter); Move-in / Move-out
     (→ `moves`, `kind` filter).
   - Entities (own table): Household & Occupants (`tenant_households` + new
     `tenant_occupants`), Documents (`tenant_documents`), Communication Log
     (`tenant_communications`), Leases (`leases`), Lease Templates (`lease_templates`),
     E-signature (`esign_requests`), Addenda (`lease_addenda`), Security Deposits
     (`security_deposits`), Moves (`moves`), Inspections (`inspections`).
4. **Delivery:** Tenants group first (review checkpoint), then Leasing.

## Architecture

No new plumbing. Each sidebar title → a screen `<EntityListScreen config={X} />`,
registered in `registry.jsx`. Reuse `tenantsData` etc. for lenses.

### Generic section factories (new) — `components/internal/screens/entity/sections/`

To avoid ~60 bespoke section files, add config-driven factories that return section
components bound to a descriptor. Each receives the engine's section props
(`{ item, config, headerItem, onPatch, onCommit }`).

- `makeFieldsSection(fields)` — an editable form. `fields`:
  `{ key, label, type: text|textarea|number|date|select|switch, options?, meta? }`.
  Real columns persist via `onCommit`; `meta: true` fields persist into the entity's
  `metadata` bag (read-modify-write; see below).
- `makeOverviewSection({ fields, note? })` — read-mostly summary of key fields + status.
- `makeNotesSection({ field, label, placeholder, meta? })` — a single textarea field.
- `makeMetaListSection({ field, singular, itemFields, icon })` — add/remove rows stored
  in `item.metadata[field]` (array). For light sub-lists (signers, deductions, rooms,
  checklist, clauses…). Persisted via the metadata bag.
- `makeChildListSection({ data, parentKey, singular, fields, icon })` — add/remove rows
  backed by a real child data layer (`list(parentId)/create/softDelete`). Used for
  household **Occupants** (`tenant_occupants`).

### Metadata persistence

Every entity `toRow` gains a `metadata` passthrough (`if ("metadata" in input)
row.metadata = input.metadata`) and every `normalize` exposes the bag as a nested
`metadata` object **in addition to** spreading its keys. `makeFieldsSection` /
`makeMetaListSection` commit a full read-modify-write of `metadata`, so section fields
persist without a per-field column. Single-user optimistic model — no merge RPC needed.

## Screens

### Tenants group

| Title | Data | Sections |
|---|---|---|
| All Tenants (enrich) | `tenants` | overview · details · lease · payments · household · documents · communication · portal · screening · activity · settings |
| Tenant Directory (lens) | `tenants` | overview · contact · emergency · documents · activity |
| Tenant Profiles (lens) | `tenants` | profile · identity · employment · vehiclesPets · documents · activity |
| Household & Occupants | `tenant_households` + `tenant_occupants` | overview · occupants · petsVehicles · documents · activity |
| Resident Portal (lens) | `tenants` | overview · access · portalActivity · settings |
| Documents | `tenant_documents` | overview · file · sharing · activity |
| Communication Log | `tenant_communications` | overview · message · followups · activity |

### Leasing group

| Title | Data | Sections |
|---|---|---|
| Leases | `leases` | overview · terms · parties · unit · charges · documents · renewal · activity |
| Lease Builder (lens: drafts) | `leases` | builder · clauses · terms · parties · preview · activity |
| Lease Templates | `lease_templates` | overview · body · mergeFields · usage · settings |
| State-specific Leases (lens) | `lease_templates` | overview · requirements · disclosures · body |
| E-signature | `esign_requests` | overview · signers · document · audit · reminders |
| Addenda & Documents | `lease_addenda` | overview · content · linkedLease · signatures · activity |
| Security Deposits | `security_deposits` | overview · holding · deductions · refund · documents · activity |
| Move-in (lens: kind=in) | `moves` | overview · checklist · keys · utilities · inspection · documents |
| Move-out (lens: kind=out) | `moves` | overview · checklist · finalInspection · reconciliation · documents |
| Move-in Inspection | `inspections` | overview · rooms · photos · notes · signoff |

## SQL

- Extend `supabase/sqls/tenants.sql` with `property.tenant_occupants`.
- New `supabase/sqls/leasing.sql`: `leases`, `lease_templates`, `esign_requests`,
  `lease_addenda`, `security_deposits`, `moves`, `inspections`. Idempotent, `property`
  schema, `updated_at` triggers, open demo RLS — mirroring `tenants.sql`.

## Conventions

`@geiger/ui` + shared `screen_kit` only; semantic tokens; three list states; optimistic
+ persisted mutations; data layers pure (return `null`/`false`/`[]`, never throw/toast);
`npx eslint` clean.
