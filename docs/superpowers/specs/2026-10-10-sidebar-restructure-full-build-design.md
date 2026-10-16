# Sidebar restructure + full build-out — design

Date: 2026-10-10 · Status: approved ("Everything, thinner"; AI Assistant stays Coming soon)

## Goal

Replace the 19-group / 171-link sidebar (131 pages "Coming soon", 5 exact duplicates,
many lenses posing as pages, out-of-scope fintech/HOA/AI pages) with a 13-group /
57-page sidebar where every page except AI Assistant is a working, DB-backed screen.
Fix the foundation issues found in the audit along the way.

## Non-goals

- Real third-party integrations: e-signing, card/ACH payments, credit/background
  checks, ILS syndication, outbound email/SMS. These are **tracked workflows**
  (status + record), labelled honestly in the UI.
- Automation execution (rules are stored; no background runner).
- AI Assistant (stays ComingSoonScreen).
- Running `npm run db:push` (no `.env` locally — the user runs it).

## 1. New sidebar (13 groups, 57 pages)

| Group | Pages (exact titles) |
|---|---|
| Overview | (top-level) |
| Properties | Properties · Units · Buildings · Portfolios · Floor Plans · Unit Types · Amenities · Media Library |
| Marketing & Leads | Listings · Prospects · Showings · Applications · Waitlist · Rent Comparables |
| Leases | Leases · Renewals · Move-ins & Move-outs · Inspections · Security Deposits · Notices & Violations |
| People | Tenants · Owners · Vendors |
| Maintenance | Work Orders · Preventive & Recurring · Unit Turns · Inventory & Parts |
| Accounting | Rent Collection · Transactions · Recurring Charges · Bills & Payables · Chart of Accounts · Budgets · Bank Accounts |
| Communications | Inbox · Announcements · Message Templates |
| Documents | Document Library · Templates · E-signature |
| Reports | Rent Roll · Delinquency · Occupancy & Vacancy · Owner Statements · Financial Statements · Maintenance Report · Leasing Report |
| Automations | (top-level) |
| AI Assistant | (top-level, Coming soon) |
| Settings | Company Profile · Team & Members · Roles & Permissions · Custom Fields · Fees & Policies · Branding & Portals · Integrations |

Titles are unique across the whole nav (slugs and permission keys derive from them).

### Legacy slug redirects

`lib/workspace/tabs.js` gains `LEGACY_TABS` (old title → new title); `slugToTab`
resolves old slugs to the new title so bookmarks keep working. Mapping:

| Old | New |
|---|---|
| Buildings & Blocks | Buildings |
| Property Photos & Media | Media Library |
| Property Groups | Portfolios |
| All Tenants, Tenant Directory, Tenant Profiles, Household & Occupants, Resident Portal | Tenants |
| Documents (tenant docs), Addenda & Documents, Shared Files, Owner Documents, Compliance Documents | Document Library |
| Communication Log | Inbox |
| Lease Builder | Leases |
| Lease Templates, State-specific Leases | Templates |
| Move-in, Move-out, Move-out Pipeline | Move-ins & Move-outs |
| Move-in Inspection | Inspections |
| Rent Increases, Lease Expirations | Renewals |
| Notices | Notices & Violations |
| All Maintenance, Maintenance Requests, Mobile Maintenance, Vendor Assignments, Photos & Attachments | Work Orders |
| Recurring Work Orders, Preventive Maintenance | Preventive & Recurring |
| Unit Turns & Make-ready, Make-ready Boards | Unit Turns |
| Vacancy Listings | Listings |
| Online Applications, Tenant Screening | Applications |
| Showings & Tours | Showings |
| Owner Directory | Owners |
| Rent Roll (unchanged), Occupancy | Occupancy & Vacancy |
| Message Templates (unchanged), Bulk Messaging | Announcements |

## 2. Foundations (built first, by the lead)

### 2.1 Project scoping
- `lib/supabase/project_scope.js`: `setActiveProjectId(id)`, `getActiveProjectId()`,
  `scopeQuery(q)` → `q.or("project_id.eq.<id>,project_id.is.null")` (legacy rows with
  no project stay visible), `stampProject(payload)` → adds `project_id` on insert.
- `ProjectProvider` calls `setActiveProjectId` when the active project resolves (the
  screen is already keyed by project id, so it remounts and refetches).
- `makeEntityData` applies both. Hand-written top-level layers (properties, units,
  buildings, portfolios, floor_plans, unit_types, amenities, media, documents,
  tenants, tenant_households, tenant_communications, tenant_documents) apply both
  in their list/create.
- Migration adds `project_id uuid` + index to every `property.*` table.

### 2.2 Linked records
- Soft-uuid relation columns (house pattern — no FK), mapped in the data layers:
  - leases: `unit_id`, `tenant_id`, `property_id`
  - tenants: `unit_id`, `property_id`, `lease_id`
  - rent_accounts: `unit_id`, `tenant_id`, `property_id`, `lease_id`
  - work_orders: `unit_id`, `property_id`, `tenant_id`, `vendor_id`
  - moves / inspections / security_deposits: `unit_id`, `tenant_id`, `lease_id`
  - vendor_assignments: `vendor_id`, `work_order_id`
- `FieldsForm` gains `type: "relation"`: `{ key: "unitId", label, load: () => Promise<[{value,label,patch}]> }`.
  Selecting commits `{ [key]: value, ...patch }` so the denormalized display column
  (`unit`, `tenantName`…) stays in sync. A "None" option clears both.
- `lib/supabase/options.js`: cached loaders returning `{value,label,patch}` —
  `propertyOptions`, `unitOptions`, `tenantOptions`, `leaseOptions`, `vendorOptions`,
  `ownerOptions`, `glAccountOptions`, `prospectOptions`, `workOrderOptions`.
  `createFields` use the same loaders via `loadCreateOptions` + `optionsFrom`.

### 2.3 Engine additions
- `config.views: [{ value, label, filter(row) }]` → `SegmentedTabs` above the toolbar
  in `EntityListScreen`; the active view filters before status/search. Optional
  `view.createDefaults` merged into new rows.
- `config.rowsLoader` (optional): `async () => rows` override for screens that need
  to join data (e.g. Tenants computing balance from rent accounts).
- `makeUploadSection({ field, ownerType, singular })` in factories: image upload
  (compressed, via `uploadPropertyImage`) into `metadata[field] = [{id,label,url}]`,
  thumbnails grid, remove.
- `makeCustomFieldsSection(entityKey)`: loads definitions from settings
  (`custom_fields`) and renders them as meta fields.
- `makeActionSection` is NOT added — custom per-area sections are plain components.

### 2.4 Settings store
`property.settings (id, project_id, key text, value jsonb, …standard)`, unique
`(project_id, key)`. `lib/supabase/settings.js`: `getSetting(key)`, `saveSetting(key, value)`
(upsert on project+key). Keys: `company_profile`, `fees_policies`, `branding_portals`,
`integrations`, `custom_fields`, `roles`.

### 2.5 New tables (one migration, `<ts>_full_build_tables.sql`) and data layers

Every table: standard columns (id, project_id, metadata, created_by uuid, created_at,
updated_at, deleted_at), touch trigger, demo-open RLS. Data layer = `makeEntityData`
config in `lib/supabase/<file>.js`, exporting `<x>Layer` and `<x>Data`.

| Table / layer file | Fields (key: col type) · status default |
|---|---|
| listings / listings.js | name, propertyId, propertyName, unitId, unit, rent:n, availableDate:d, bedrooms:n, bathrooms:n · status Draft |
| prospects / prospects.js | name, email, phone, source, unitId, unit, moveInDate:d, budget:n · status New |
| showings / showings.js | name, prospectId, prospectName, unitId, unit, showingDate:d, showingTime, showingType, agent · status Scheduled |
| applications / applications.js | name, email, phone, unitId, unit, moveInDate:d, monthlyIncome:n, applicationFee:n, feePaid:b, prospectId · status Submitted |
| waitlist_entries / waitlist.js | name, email, phone, propertyId, propertyName, unitPreference, moveInDate:d, position:n · status Waiting |
| rent_comps / rent_comps.js | name, propertyId, propertyName, distanceMi:n, bedrooms:n, bathrooms:n, sqft:n, rent:n, source, observedDate:d · status Active |
| renewals / renewals.js | name, leaseId, tenantId, tenantName, unitId, unit, currentRent:n, proposedRent:n, currentEnd:d, newStart:d, newEnd:d · status Not started |
| notices / notices.js | name, noticeType, tenantId, tenantName, unitId, unit, servedDate:d, cureBy:d, deliveryMethod · status Draft |
| owners / owners.js | name, email, phone, company, managementFeePct:n, payoutMethod, taxIdLast4 · status Active |
| pm_schedules / pm_schedules.js | name, propertyId, propertyName, unitId, unit, category, frequency, nextDue:d, vendorId, vendorName, estimatedCost:n · status Active |
| unit_turns / unit_turns.js | name, unitId, unit, propertyName, moveOutDate:d, targetReadyDate:d, budget:n · status Not started |
| inventory_items / inventory.js | name, sku, category, location, quantity:n, reorderLevel:n, unitCost:n · status In stock |
| transactions / transactions.js | name, txnDate:d, txnType, account, propertyId, propertyName, amount:n, payee, reference · status Cleared |
| recurring_charges / recurring_charges.js | name, tenantId, tenantName, unitId, unit, amount:n, frequency, nextDate:d, account · status Active |
| bills / bills.js | name, vendorId, vendorName, propertyName, billDate:d, dueDate:d, amount:n, amountPaid:n, account · status Open |
| gl_accounts / gl_accounts.js | name, number, accountType, description · status Active |
| budgets / budgets.js | name, propertyId, propertyName, year:n, totalIncome:n, totalExpense:n · status Draft |
| bank_accounts / bank_accounts.js | name, bankName, accountType, last4, balance:n · status Active |
| announcements / announcements.js | name, audience, propertyId, propertyName, channel, scheduledFor:d, body · status Draft |
| message_templates / message_templates.js | name, category, channel, subject, body · status Active |
| team_members / team_members.js | name, email, role · status Invited |
| automations / automations.js | name, triggerEvent, actionType, enabled:b · status Draft |

(Settings table per §2.4.) Columns: camelCase key → snake_case col
(e.g. `availableDate` → `available_date`, `txnType` → `txn_type`).

## 3. Screens (built in parallel by helper agents)

All list/detail screens use `EntityListScreen` + factories. Each screen has a
`stats` bar (4 KPIs), status map + filter, search, create dialog, tabbed editor with
Overview first and an Activity/notes tab last. Status maps live in the area's
`shared.js`. Semantic tokens only; `npx eslint` clean.

### A. Marketing & Leads — `components/internal/screens/marketing/`
- Listings: views All/Active/Draft; tabs Overview, Details (relations unit/property),
  Description, Photos (upload), Syndication (checklist of channels, "tracked, not
  published"), Promotions, Activity. Statuses Draft/Active/Paused/Leased.
- Prospects: statuses New/Contacted/Touring/Applied/Leased/Lost; tabs Overview,
  Contact, Preferences, Follow-ups (checklist w/ date), Activity.
- Showings: types In-person/Self-guided/Virtual; statuses Scheduled/Completed/No-show/Cancelled;
  prospect + unit relations; Feedback tab.
- Applications: statuses Submitted/Screening/Approved/Conditionally approved/Denied/Withdrawn;
  tabs Overview, Applicant, Co-applicants (meta list), Income, Screening (recorded
  results: credit score, background, eviction, income verified), Fees, Decision
  (with **"Convert to tenant + draft lease"** action: creates a tenants row and a
  Draft leases row linked by ids, sets status Approved), Activity.
- Waitlist: statuses Waiting/Offered/Converted/Removed; position column.
- Rent Comparables: stats avg comp rent, avg $/sqft, our avg unit rent (units layer), gap.

### B. Leases — `components/internal/screens/leasing/`
- Leases: merges Lease Builder — views All/Active/Drafts/Ending; unit/tenant/property
  relations; Builder tabs (Clauses, Preview) shown in the editor; Preview assembles
  terms + clauses into read-only text (no longer a blank textarea); Addenda tab lists
  addenda rows for this lease (child list by lease_id); E-sign status tab lists
  esign requests for this lease.
- Renewals: views All/Expiring ≤60d/Open/Closed; increase % column; "Renew lease"
  action on Accepted → updates lease term/rent.
- Move-ins & Move-outs: one screen over `moves`, views Move-ins/Move-outs (createDefaults kind).
- Inspections, Security Deposits: add unit/tenant/lease relations; Inspections photos → upload.
- Notices & Violations: types Late rent/Lease violation/Entry/Non-renewal/Rent increase/Other;
  statuses Draft/Served/Cured/Escalated/Closed.
- Templates: Lease Templates with views All/Generic/State-specific (replaces State Leases);
  merge-field preview that substitutes `{{field}}` with sample values.

### C. People & Maintenance
- Tenants (`tenants/`): one screen; views All/Current/Applicants/Past; rowsLoader
  computes balance from rent accounts (by tenantId, fallback name); balance field
  read-only; tabs from current tenant config (household, portal, documents, comms).
  Unit relation.
- Owners (`owners/`): statuses Active/Onboarding/Inactive; Properties & Splits
  (meta list label + %), Fees, Tax & 1099, Documents, Activity.
- Vendors: unchanged screen (moved group).
- Work Orders (`maintenance/`): merges All/Requests/Field — views All/Work orders/Requests/Field;
  unit/property/tenant/vendor relations; Photos tab → upload; Vendor assignment tab lists
  vendor_assignments for this work order.
- Preventive & Recurring: frequency Weekly/Monthly/Quarterly/Semi-annually/Annually;
  **"Create work order now"** action: inserts a work_orders row and advances `nextDue`.
- Unit Turns: Checklist, Costs (meta list w/ amount → total vs budget), statuses
  Not started/In progress/Ready/Leased.
- Inventory & Parts: status derived from quantity vs reorder level (In stock/Low/Out of stock);
  stock value KPI.

### D. Accounting — `components/internal/screens/accounting/`
- Rent Collection: add unit/tenant/lease relations.
- Transactions: types Income/Expense/Transfer; statuses Pending/Cleared/Reconciled/Void; account relation (gl).
- Recurring Charges: tenant relation; statuses Active/Paused/Ended.
- Bills & Payables: vendor relation; "Record payment" (meta list of payments → amountPaid, status).
  Statuses Draft/Open/Partially paid/Paid/Void; overdue KPI.
- Chart of Accounts: types Asset/Liability/Equity/Income/Expense; views by type; "Add standard
  accounts" one-click seed for an empty chart.
- Budgets: line items (meta list category + amount) → totals; Actuals tab compares to
  transactions for property+year.
- Bank Accounts: types Operating/Trust/Security deposit/Reserve; total balance KPI.

### E. Communications, Documents, Settings, Automations
- Inbox: existing communication log screen, retitled; views by channel.
- Announcements: audience/channel; "Mark as sent" (delivery not connected — stated in UI).
- Message Templates: merge-field list + preview.
- Document Library: custom screen — union of `documents`, `tenant_documents`,
  `maintenance_attachments` with source filter + search; upload new file to `documents`
  with owner_type `library`.
- Settings pages (`settings/`, SecondaryScreenWrapper, `getSetting/saveSetting`):
  Company Profile, Fees & Policies (late fee rules, grace days, app fee, accepted
  payment methods), Branding & Portals (portal toggles, accent, logo URL),
  Integrations (gateway/webhooks — "not connected" states), Custom Fields (definitions
  per entity: properties/units/tenants/leases), Roles & Permissions (role list + permission
  matrix from `WORKSPACE_PERMISSIONS`, stored under `roles`), Team & Members (team_members entity).
- Automations: rules list (trigger × action × enabled), with a clear "rules are saved; the
  runner isn't connected yet" note.

### F. Reports + Overview — `components/internal/screens/reports/`, `overview/`
- Shared `report_kit.jsx`: header, property filter, StatsBar, DataTable, client-side
  **CSV export**.
- Rent Roll (units × active lease × tenant × rent × balance), Delinquency (aging
  0–30/31–60/61–90/90+ from rent-account charges), Occupancy & Vacancy, Owner Statements
  (per owner: income/expense/fee/net across their properties), Financial Statements
  (tabs P&L / Balance Sheet / Cash Flow from transactions, rent payments, bills,
  bank accounts, deposits held), Maintenance Report, Leasing Report (funnel prospects →
  showings → applications → leases; expirations by month).
- Overview: replaces the Events dashboard — occupancy, rent due vs collected this month,
  delinquent balance, open work orders, leases expiring ≤60 days, needs-attention list.

## 4. Ownership & sequencing

1. Lead: foundations (§2) — project scope, relation field, views, upload/custom-field
   sections, options loaders, settings store, all data layers, both migrations,
   sidebar + registry + legacy redirects + permissions.
2. Six helper agents in parallel (A–F), each owning only its folder; they must not
   edit shared engine/sidebar/registry/lib files and report the `title → Screen`
   exports to register.
3. Lead: wire registry, lint everything, delete dead files (old lens screens,
   `PropertyPlayground*` if unused), summary to the user.

## 5. Verification
- `npx eslint` on every changed file.
- No build (per CLAUDE.md) unless needed; migrations validated with `db:push --dry-run`
  only if `STRING_URI` becomes available.
