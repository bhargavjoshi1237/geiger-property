# 5. Commercial tenants, facilities, occupier and investment

### Scope
- **MRI products covered (built here, scoped to Geiger's buyer):**
  - Purchase Order add-on
  - Facility Management add-on: chargebacks and equipment
  - MRI Inspections powered by HappyCo
  - PMX On the Go and MRI Service Hub (staff and technician mobile)
  - Debt Management, as owner mortgage tracking only
  - Fixed Asset Accounting (Asset4000), as owner depreciation schedules only
  - Tenant Connect and Engage @Work, as a commercial mode of the resident portal
  - MRI Angus, as tenant service requests and COI tracking only
  - Contract Intelligence (LEVERTON), as manual abstract fields; the AI is deferred
  - Investor Connect, as owner annual summaries and documents only
- **Reviewed and not built:** ProLease/ProCalc, ManhattanONE, Workplace Central, Space Scheduling, MRI Energy, OnLocation, Evolution, NETfacilities, Asset4000 (enterprise) and Project4000, Investment Accounting, Asset and Fund Modeling, Valuations, enterprise Debt Management, Investment Central, Lease Flow, Findspace, Engage @Work (enterprise), Advanced Retail. See "Not building here".
- **Geiger areas touched:**
  - Maintenance: work orders, Preventive & Recurring, Inventory & Parts, a new Equipment screen, a new Purchase Orders screen
  - Leasing: Inspections, a new Inspection Templates screen, and lease editor commercial terms
  - People: tenants (company tenants, insurance), owners
  - Portals: resident (commercial mode) and owner portals
  - Accounting: Chart of Accounts, Bills, Job Costing, and new Loans and Fixed Assets screens
  - Reports, scheduled jobs, and a new `/field` installable web app
- **Framing:** the buyer is a US residential manager, often a fee manager for individual owners, who may run a few storefronts in mixed-use buildings. Anything sized for office/retail landlords, corporate occupiers or funds is out of scope.
- **Cross-reference notation:** `CORE(0.9)` means "the CORE-file item that closes gap 0.9". Exact CORE/LEAS/RISK/HOUS numbers are assigned in those files. `PLAT-01` is the security item.

### Summary
| ID | Feature | MRI product | Geiger today | Priority | Effort |
|---|---|---|---|---|---|
| COMM-01 | Post work-order chargebacks to the resident ledger | Facility Management add-on | Partial | P2 | S |
| COMM-02 | Inspection templates | MRI Inspections (HappyCo) | Missing | P2 | M |
| COMM-03 | Inspection scheduling: lifecycle triggers and periodic schedules | MRI Inspections (HappyCo) | Partial | P2 | M |
| COMM-04 | Inspection findings → work orders, chargebacks, move-out deductions | MRI Inspections / HappyCo sync | Partial | P2 | M |
| COMM-05 | Technician assignment and "My work" | Service Hub, PMX On the Go | Tracking-only | P2 | S |
| COMM-06 | Field PWA (installable app for techs and inspectors) | Service Hub, PMX On the Go | Missing | P2 | L |
| COMM-07 | Offline capture and sync (work orders, inspections, photos) | Service Hub, MRI Inspections | Missing | P2 | L |
| COMM-08 | Schedule E line mapping on GL accounts | Investor Connect (reporting basis) | Missing | P2 | S |
| COMM-09 | Owner annual summary and multi-property rollup | Investor Connect (lite) | Partial | P2 | M |
| COMM-10 | Owner document sharing and year-end packet | Investor Connect (lite) | Partial | P2 | S |
| COMM-11 | Commercial tenant COI tracking | MRI Angus (COI tracking) | Missing | P2 | S |
| COMM-12 | Commercial tenant profile and portal mode | Tenant Connect, Engage @Work | Partial | P2 | M |
| COMM-13 | Commercial lease abstract and critical dates (no AI) | Contract Intelligence (LEVERTON) | Saved-unused | P2 | M |
| COMM-14 | Purchase orders: lines, budget lookup, approval limits | Purchase Order add-on | Missing | P2 | L |
| COMM-15 | PO receiving, inventory restock and PO-to-bill match | Purchase Order add-on | Missing | P2 | M |
| COMM-16 | Commercial service requests (Angus-lite) | MRI Angus, Tenant Connect | Partial | P3 | M |
| COMM-17 | Equipment register linked to units and work orders | Facility Management add-on, NETfacilities | Partial | P3 | M |
| COMM-18 | Equipment-driven PM and warranty alerts | Facility Management add-on | Missing | P3 | S |
| COMM-19 | Owner mortgage register and amortization | Debt Management | Missing | P3 | M |
| COMM-20 | Capital improvements and depreciation schedules | Fixed Asset Accounting (Asset4000) | Partial | P3 | L |

### Build order
1. **COMM-01 chargebacks.** Small and self-contained. COMM-04 and COMM-16 post charges through it. It uses the existing `postCharge` and needs nothing from other files.
2. **COMM-02 → COMM-03 → COMM-04 inspections.** These have the highest day-to-day value and extend working code (`inspection_sections.jsx`, the PM engine).
   - COMM-03's periodic job runs only once CORE(0.10) schedules crons.
   - COMM-04's deposit side writes deductions; CORE(3.3) and CORE(0.4) post them.
   - HOUS voucher inspections reuse COMM-02 and COMM-03.
3. **COMM-08 → COMM-09 → COMM-10 owner reporting.**
   - Fee managers are Geiger's core buyer, and the year-end packet is needed every January.
   - COMM-09 must not start before CORE(0.8) fixes co-owner tagging and the portal's fee-income double count.
   - COMM-10 attaches the owner 1099 from CORE(6.5). Distributions and payouts come from CORE(11.3).
4. **COMM-05 → COMM-06 → COMM-07 field app.**
   - COMM-05 gives the app a "my work" query.
   - COMM-07 needs PLAT-01: private photo storage, and a server-side write path that the sync route reuses.
   - LEAS(4.3) owns the resident update emails the app's status changes trigger.
5. **COMM-11 → COMM-12 → COMM-13 mixed-use commercial.**
   - COI tracking is a quick reuse of vendor COI.
   - The portal mode depends on PLAT-01 and the LEAS resident portal work.
   - The abstract feeds COI requirements (COMM-11) and the responsibility routing in COMM-16.
   - CAM depth and percentage rent stay in CORE.
6. **COMM-14 → COMM-15 purchasing.** These come after CORE(6.2) builds the approval engine and CORE(0.9) routes WO bills through approval and AP. POs register as one more approvable document there; they don't build a second approval system.
7. **COMM-16 commercial service requests (P3).** Needs COMM-01, COMM-12 and COMM-13.
8. **COMM-17 → COMM-18 equipment (P3).** COMM-17 replaces two inconsistent asset lists. COMM-18 plugs it into PM.
9. **COMM-19 → COMM-20 owner tax helpers (P3).** Both need COMM-08 so their output lands on Schedule E lines 12 and 18 in COMM-09. COMM-20 links to COMM-17 equipment.

### Items

#### COMM-01 · Post work-order chargebacks to the resident ledger
- **MRI equivalent:** Facility Management add-on: "Bill for expenses related to work orders … and service requests".
- **Status · priority · effort:** Partial · P2 · S
- **Refs:** Gap 5.4 · Inventory 5.38, 5.11 · PMX-5.07

**Geiger today**
- **Billable lines are summed.** Each cost line has a "Billable" checkbox (`components/internal/screens/maintenance/sections/wo_costs.jsx:183-189`). `lineItemTotals` sums the billable lines into `tenantChargeback` (`components/internal/screens/maintenance/shared.js:257-277`). `lineItemsPartial` saves that sum in metadata (`wo_costs.jsx:24-32`).
- **The billing tab only records a decision.** It has "Charge the tenant", an override, a reason, a date and a **manual "Posted to tenant ledger" switch** (`wo_costs.jsx:211-224`). Grep `chargebackPosted|chargeTenant|chargebackOverride` outside `wo_costs.jsx` finds only a display line (`sections/wo_overview.jsx:85`). Nothing posts.
- **The "Tenant-caused damage" switch is saved but unused** (`sections/wo_general.jsx:101`).
- **The posting plumbing already exists:**
  - `postCharge` (`lib/supabase/ledger.js:356`) runs the shared pipeline (`:321-344`).
  - `buildCharge` accepts `glAccountId` and `incomeKey` (`lib/ledger/postings.js:204-220`).
  - The `idempotency_key` unique index (`supabase/migrations/20261015212744_ledger_core.sql:78-80`) and `ledger_post` (`:308-320`) dedupe repeat posts.
  - `voidEntry` (`lib/supabase/ledger.js:388`) reverses an entry.

**What's missing**
- A real posting (Dr AR / Cr income) tagged to the lease, tenant, unit and property, so the charge shows in the resident ledger and the portal.
- An income account choice.
- Void and adjust after posting.
- Protection against double posting.

**How to build**
- *Data model:* no migration. Work-order metadata gains these keys:
  - `chargebackEntryId`, `chargebackPostedAt`, `chargebackPostedAmount`, `chargebackGlAccountId`
  - `chargebackVoidedEntryIds[]`

  Add the company setting `accounting_settings.chargebackGlAccountId`, following the `billApprovalLimit` pattern (`components/internal/screens/accounting/bills.jsx:83-88`). It defaults to the system account `other_income` (4100).
- *Server logic:* new pure module `lib/maintenance/chargeback.js`:
  - `chargebackAmountOf(wo)` returns `chargebackOverride` ?? `metadata.tenantChargeback`.
  - `chargebackInput(wo, { date, glAccountId, memo, seq })` returns the `postCharge` input: `{ amount, date, glAccountId, leaseId, tenantId, unitId, propertyId, sourceType: "charge", sourceId: wo.id, idempotencyKey: \`wo_chargeback:${wo.id}:${seq}\`, memo }`.
  - `resolveChargeLease(wo)` uses `wo.leaseId`, else the live lease for `wo.unitId` (reuse `leaseForUnit` from `lib/reports/lookups.js`).

  This module is reused by COMM-04 and COMM-16. Posting stays in the browser data layer, like bills, until PLAT-01 moves ledger writes server-side.
- *API routes / jobs:* none.
- *UI:*
  - In `sections/wo_actions.jsx`, add a **"Charge the tenant…"** wizard action modelled on `createBill` (`:463-528`). Steps:
    - Amount, prefilled from `chargebackAmountOf`.
    - Lease, prefilled; the action is blocked when there is none.
    - Charge date.
    - Income account: `AccountSelect` (`components/internal/screens/accounting/ledger_dialogs.jsx:85`) filtered to Income.
    - The memo the resident sees.

    On finish it calls `postCharge`, then `commitMeta`.
  - Add a **"Void chargeback"** action that calls `voidEntry`.
  - In `BILLING_FIELDS`, replace the `chargebackPosted` switch with a read-only status row: "Posted {amount} on {date}", with a link to the entry.
  - Show an amber notice when the line items change after posting, with an "Adjust" action that posts the difference as a charge or a credit (`postCredit`).
  - Turning on `tenantCaused` defaults `chargeTenant` to on.
- *Permissions:* `accounting.post` (exists, `lib/rbac.js:11`).
- *Integrations:* none.

**Steps**
1. Add `lib/maintenance/chargeback.js` with unit-testable helpers.
2. Add the wizard and void actions in `wo_actions.jsx`, and replace the switch in `wo_costs.jsx:223`.
3. Add the setting field to the accounting settings UI, next to `billApprovalLimit`.
4. Backfill: none, since nothing was posted before. Leave the old `chargebackPosted` key ignored.
5. Add the posted entry to the WO activity log (`ctx.log`).

**Research before building**
- State rules on tenant damage charges during tenancy. Are they itemized-notice requirements, or limited to the deposit? Use the in-app Legal Resources data and the `us-landlord-tenant-resources` skill.
- How do AppFolio and Buildium label chargeback income? This decides between a separate income account and a contra-expense; see open decision 1.

**Acceptance criteria**
- **Posting:** a $150 chargeback posts one entry: Dr 1200 AR $150 / Cr 4100 $150, tagged lease, tenant, unit, property and the primary owner. The trial balance stays balanced.
- **Visibility:** the resident's portal ledger shows the charge with the memo, and the tenant's open charges include it.
- **No double posting:** running the action twice with the same sequence returns the same entry id.
- **Void:** voiding posts the reversal, the tenant balance returns to its prior value, and the WO shows "Voided".
- **Blocked cases:** a WO with no lease and no live lease on the unit is blocked with a clear message. An amount ≤ 0 is blocked.
- **Owner statements** show the chargeback as property income.

**Depends on / unblocks**
- Depends on: none. CORE(0.7) is needed for list balances to reflect the charge everywhere.
- Unblocks: COMM-04, COMM-16.

**Open decisions**
1. **Where chargeback income lands.** Options:
   - A dedicated "Resident Chargebacks" income account.
   - `Other Income` 4100. This is the recommended default, configurable.
   - A credit to the repair expense account, so the owner sees net repair cost.

#### COMM-02 · Inspection templates
- **MRI equivalent:** MRI Inspections powered by HappyCo: configurable templates, scoring, branded reports. The legacy product is for existing clients only; HappyCo is the current partner.
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gap 5.3 · Inventory 2b.84–2b.90 · PMX-5.09, PMX-5.10

**Geiger today**
- **Rooms are hard-coded.** They come from `ROOM_PRESETS` (`components/internal/screens/leasing/sections/inspection_sections.jsx:32-42`).
- **Items are rated on a fixed 5-point scale,** `CONDITION_SCALE` (`components/internal/screens/leasing/shared.js:230-237`). There are 5 kinds (`shared.js:213-219`).
- **The data lives in metadata.** Rooms and items sit in `metadata.rooms` (`roomsOf`, `inspection_sections.jsx:46-58`). The table has typed columns only for name, unit, dates, links, kind and status (`lib/supabase/inspections.js:5-23`; `supabase/migrations/20260708132810_leasing.sql:246-266`).
- **The move-out comparison matches rooms and items by name** (`inspection_sections.jsx:466-479`), so renamed items break it.

**What's missing**
- Company templates per kind: rooms, items, rating scale per item, photo-required rules and a default responsibility.
- Rooms that repeat per bedroom or bathroom.
- Pass/fail scales (needed for voucher and HQS/NSPIRE-style checks by HOUS).
- Template versioning, so editing a template does not rewrite past reports.

**How to build**
- *Data model:* migration `npm run db:new -- inspection_templates --template table`.
  - First check the name is free in the live DB with `select to_regclass('property.inspection_templates')`. Fallback name: `inspection_checklists`.
  - Table `property.inspection_templates`: standard columns plus `project_id`, `name`, `kind text` (`move_in|move_out|pre_move_out|routine|annual|drive_by|turn|commercial|voucher`), `status` (`Active|Archived`), `is_default bool`, `version int default 1`.
  - Template metadata shape: `{ rooms: [{ id, name, repeat: null|"bedrooms"|"bathrooms", items: [{ id, name, scale: "condition"|"pass_fail"|"yes_no", photoRequiredOn: ["poor","damaged","fail"], chargeable: bool, woCategory, equipmentCategory }] }], propertyIds: [] }`.
  - The same migration alters `property.inspections` to add `template_id uuid` and `template_version int`, plus an index on `template_id`.
  - RLS: demo-open per `conventions/MIGRATION_CONVENTIONS.md` §RLS. List the table for PLAT-01.
- *Server logic:*
  - `lib/supabase/inspection_templates.js` via `makeEntityData`.
  - Pure module `lib/inspections/templates.js`:
    - `SYSTEM_TEMPLATES`: today's presets as code fallbacks.
    - `instantiate(template, unit)` returns rooms with fresh ids. It keeps `templateItemId` on each item and expands `repeat` using `units.bedrooms` and `units.bathrooms`.
    - `pickTemplate(templates, { kind, propertyId })`.
  - Change the comparison (`inspection_sections.jsx:466-479`) to match on `templateItemId` first and fall back to the name.
- *UI:*
  - New screen `components/internal/screens/leasing/inspection_templates.jsx` (`EntityListScreen`). Register it as "Inspection Templates" in `components/internal/screens/registry.jsx` and in `components/internal/sidebar/sidebar_nav.jsx` after "Inspections" (`:113`).
  - The editor is a rooms → items builder, reusing the row patterns in `InspectionRoomsSection`, with a scale select per item.
  - The Inspections create dialog (`inspections.jsx:166-190`) gains a Template select, defaulted by `pickTemplate`. `newRow` snapshots `instantiate(...)` into `metadata.rooms`.
  - The rooms editor renders pass/fail items as two buttons.
- *Permissions:* `settings.manage` to edit templates. Viewing follows `view.inspections`.
- *Integrations:*
  - **geiger-forms considered and rejected.** It builds public-respondent forms. Inspections need unit-linked ratings for comparison, deductions, work orders and offline capture inside COMM-06. Revisit if Forms ships an embeddable, offline renderer.

**Steps**
1. Migration, then the data layer.
2. `lib/inspections/templates.js` with the system templates and `instantiate`.
3. Templates screen and nav entry.
4. Template picker in the create dialog, and in `scheduleMoveIn` / `scheduleMoveOut` (`lib/leasing/workflows.js:251-317`).
5. Comparison by `templateItemId`.
6. Seed one default per kind in `supabase/seeds/demo_project/generate`.

**Research before building**
- Which states mandate a move-in condition checklist as a precondition for deposit deductions? Examples: WA RCW 59.18.260 (https://app.leg.wa.gov/RCW/default.aspx?cite=59.18.260), GA O.C.G.A. § 44-7-33, MI MCL 554.608. Ship matching system templates and wording, using the Legal Resources dataset.
- HUD NSPIRE standards (https://www.hud.gov/program_offices/public_indian_housing/reac/nspire). Agree the `voucher` template shape with HOUS.
- HappyCo's public template features (https://www.happy.co) for the items a buyer expects: scoring, required photos.

**Acceptance criteria**
- A template with "Bedroom (repeat per bedroom)" creates 3 bedroom rooms for a 3-bed unit.
- Editing a template does not change existing inspections: their rooms are a snapshot, and `template_version` is recorded.
- Move-out vs move-in comparison still pairs items after an item is renamed in the template.
- Legacy inspections with no `template_id` render unchanged (`roomsOf` tolerant reader).
- Pass/fail items count as "damaged" for stats only when they fail.

**Depends on / unblocks**
- Depends on: none.
- Unblocks: COMM-03, COMM-04, COMM-07, and HOUS voucher inspections.

#### COMM-03 · Inspection scheduling: lifecycle triggers and periodic schedules
- **MRI equivalent:** MRI Inspections / HappyCo: "Move-in, move-out, and transfer inspections are automatically scheduled". With HappyCo, a notice to vacate auto-creates the move-out inspection.
- **Status · priority · effort:** Partial · P2 · M
- **Refs:** Gap 5.3 · Inventory 2b.70, 2b.77, 2b.91 · PMX-5.09, PMX-5.10

**Geiger today**
- **The gap report says there is "no scheduling". That is partly wrong.**
  - Lease activation can schedule the move-in and its inspection (switch at `components/internal/screens/leasing/lease_actions.jsx:152`, call at `:162` → `scheduleMoveIn`, `lib/leasing/workflows.js:251-281`).
  - The Move-out wizard always creates the move-out inspection (`lease_actions.jsx:363` → `scheduleMoveOut`, `workflows.js:285-317`).
- **What is missing:**
  - The notice-to-vacate wizard (`lease_actions.jsx:249-305`) creates no inspection.
  - There is no pre-move-out inspection.
  - Nothing creates routine or annual inspections (inventory 2b.91).
- **A recurrence engine already exists, built for PM:**
  - `advanceDue` and `isOccurrenceDue` (`lib/maintenance/pm.js:62-88`).
  - The idempotent daily job (`lib/jobs/preventive_work_orders.js:49-141`).
  - The `pm_schedules` table (`lib/supabase/pm_schedules.js:4-21`).

**What's missing**
- Periodic inspection schedules: one unit, or every occupied unit in a property.
- A move-out inspection when notice is recorded.
- An optional pre-move-out inspection (California requires the offer).
- An entry-notice email to the resident before a routine inspection.

**How to build**
- *Data model:* migration `inspection_scheduling`. Extend PM schedules rather than adding a parallel table.
  - `pm_schedules`: add `generates text not null default 'work_order'` (`work_order|inspection`) and `inspection_template_id uuid`.
  - `inspections`: add `schedule_id uuid` and `due_date date`.
  - Add a unique index on `inspections (schedule_id, due_date, unit_id) where deleted_at is null and schedule_id is not null`, the same idempotency trick as the WO occurrence index.
- *Server logic:*
  - `lib/maintenance/pm.js`: add `buildPmInspections(schedule, { dueDate, units })`, mirroring `buildPmWorkOrders` (`:97-155`). For `all_units`, include only units with a live lease, unless `includeVacant`.
  - `lib/leasing/workflows.js`: add `scheduleInspection(lease, { kind, date, templateId })`, factored out of `scheduleMoveOut`.
- *API routes / jobs:*
  - `lib/jobs/preventive_work_orders.js` branches on `schedule.generates === "inspection"`. It inserts into `inspections`, with 23505 meaning skipped, as at `:103-105`.
  - New op in the same job: send the entry notice `noticeHours` before `due_date` through geiger-dash, using template `property.inspection_notice` (add it to `lib/email/catalog.js` and `C:\Pro\geiger-dash\mails`). Dedupe the notice through `notification_sends`.
- *UI:*
  - The Preventive & Recurring editor (`components/internal/screens/maintenance/preventive.jsx`) gets a "Creates" select (Work orders / Inspections) and a template picker, and hides vendor and estimate fields for inspections.
  - The Inspections screen (`inspections.jsx:106-111`) gets views "Due in 14 days" and "Overdue".
  - The notice-to-vacate wizard gets a "Schedule the move-out inspection" switch, defaulted from a policy.
  - New kinds `pre_move_out`, `turn` and `commercial` in `INSPECTION_TYPE_OPTIONS` (`leasing/shared.js:213-219`).
- *Permissions:* none new.
- *Integrations:* geiger-dash email. SMS notices wait on LEAS(4.1).

**Steps**
1. Migration.
2. `buildPmInspections` and the job branch, with a test for duplicate runs.
3. Editor changes.
4. New policies in `lib/policies.js`, maintenance group next to `:125`:
   - `inspectionNoticeHours` (default 24)
   - `autoMoveOutInspectionOnNotice` (default on)
   - `offerPreMoveOutInspection` (default off; on for CA properties)
5. Notice wizard switch, and `scheduleInspection`.
6. Email template and notice op.

**Research before building**
- California Civ. Code § 1950.5(f): the initial pre-move-out inspection offer and its timing (https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1950.5).
- § 1954: the 24-hour written entry notice.
- Other states' notice-of-entry hours. Store them as Legal Resources rules, not code.
- How often small managers run routine inspections (quarterly vs annual), to set defaults.

**Acceptance criteria**
- A quarterly schedule on a 12-unit property with 10 occupied units creates 10 inspections per occurrence. A second job run creates 0 (unique index), and next due advances by 3 months.
- A paused or ended schedule creates none.
- Recording a notice to vacate with the switch on creates exactly one move-out inspection. Running the Move-out wizard later reuses it rather than creating a second.
- The entry-notice email goes once per inspection, `inspectionNoticeHours` before the due date, and respects the project email toggle.

**Depends on / unblocks**
- Depends on: COMM-02, and CORE(0.10) for the job to run unattended. Until then it runs through "Run now".
- Unblocks: COMM-07 (due inspections to download) and HOUS (annual voucher inspections).

#### COMM-04 · Inspection findings → work orders, chargebacks and move-out deductions
- **MRI equivalent:** HappyCo partner sync: "tasks sync back to MRI as work orders"; the make-ready project comes from the vacate date.
- **Status · priority · effort:** Partial · P2 · M
- **Refs:** Gap 5.3 · Inventory 2b.88, 2b.92, 3.58 · PMX-5.10

**Geiger today**
- **Move-out damage reaches the deposit only.** The move-out comparison pushes chosen damage to deposit deductions (`inspection_sections.jsx:439-515` → `addDepositDeductions`, `lib/leasing/workflows.js:390-399`), and the deposit screen labels these "From inspection" (`components/internal/screens/leasing/security_deposits.jsx:293`).
- **The work-order link already exists; only the creation path is missing.** Work orders carry `inspection_id` (`lib/supabase/work_orders.js:27, 52`; `supabase/migrations/20261015212617_maintenance_links_and_turn_ready_date.sql:15, 21`), and the WO editor shows "From inspection" (`sections/wo_general.jsx:51-57`). But no inspection action creates a WO; the gap report doesn't mention this column.
- **Turn tasks can already create linked WOs** (`sections/turn_sections.jsx:393-421`).

**What's missing**
- A findings list: items rated poor or damaged, or failed.
- A responsibility per finding: tenant, owner, or wear and tear.
- Bulk "Create work orders", grouped by trade.
- A "Charge the resident" path for in-tenancy findings, through COMM-01.
- Linking a deposit deduction to its repair WO, and updating the deduction from the actual cost.
- At move-out, attaching the WOs to the unit turn.

**How to build**
- *Data model:* no migration. Findings live in inspection metadata: `findings: [{ id, roomId, itemId, templateItemId, label, condition, responsibility: "tenant"|"owner"|"wear", action: "work_order"|"charge"|"deduction"|"none", estimate, workOrderId, chargeEntryId, deductionId, photos[] }]`. The WO side uses `inspection_id` (exists) plus `metadata.findingIds`.
- *Server logic:* pure `lib/inspections/findings.js`:
  - `deriveFindings(inspection, baseline?)`
  - `groupForWorkOrders(findings)` groups by `woCategory` from the template item.
  - `woInputFromFindings(inspection, group)` sets `source: "inspection"`, copies photos, checklist and `tenantCaused`, links `unitTurnId` when the move has a turn, and marks line items billable when the responsibility is tenant.
  - `deductionFromFinding(f)`.

  Reuse `addDepositDeductions`, extended to store `workOrderId` on each deduction. Charges go through `lib/maintenance/chargeback.js` (COMM-01) with `sourceId = inspection.id`.
- *API routes / jobs:* none. The offline path goes through the COMM-07 sync route.
- *UI:*
  - New "Findings" tab in the inspection nav (`components/internal/screens/leasing/inspections.jsx:256-280`). It lists findings with responsibility and action selects.
  - Bulk actions:
    - "Create N work orders"
    - "Charge resident" (non-move-out kinds only)
    - "Add to deposit deductions": reuse the comparison's `push`, and keep the existing Comparison tab for picking from move-in diffs.
  - The deposit deduction row shows "Repair WO #…", with "Update from actual cost" once the WO completes.
  - The WO completion wizard (`sections/wo_actions.jsx:279-346`) offers to update the linked deduction amount.
- *Permissions:* `accounting.post` for charges. WO creation follows `view.work_orders`.

**Steps**
1. `findings.js` with tests: derivation from ratings and from the baseline diff.
2. Findings tab.
3. WO bulk creation (with turn link).
4. Charge path via COMM-01.
5. Deduction ↔ WO link, and update-from-actual.

**Research before building**
- Normal wear and tear vs damage guidance, and useful-life proration of deductions (e.g. carpet age). Check state guidance in Legal Resources; HUD's tenant-damage useful-life tables are one public reference.
- Whether deduction amounts must be actual cost or a good-faith estimate with later true-up, by state. This decides whether "update from actual" changes a letter already sent; coordinate with CORE(3.3).

**Acceptance criteria**
- A move-out with 4 damaged items in 2 trades creates 2 WOs, each linked to the inspection and the unit turn, with the photos copied.
- Re-running "Create work orders" skips findings that already have a `workOrderId`.
- A routine-inspection finding charged to the resident posts one AR charge (via COMM-01) with `sourceId` = the inspection, and appears in the portal ledger.
- A deduction linked to a WO updates from $120 (estimate) to the completed WO's billable total, but only when staff confirm, and only before the deposit disposition is finalised (CORE(3.3) status check).
- Wear-and-tear findings create nothing chargeable.

**Depends on / unblocks**
- Depends on: COMM-01, COMM-02, and CORE(3.3)/CORE(0.4) for deductions to post to the ledger.
- Unblocks: COMM-07 (offline findings).

#### COMM-05 · Technician assignment and "My work"
- **MRI equivalent:** MRI Service Hub ("instant job receipt in the field", sort by priority, status or overdue); PMX On the Go tasks.
- **Status · priority · effort:** Tracking-only · P2 · S
- **Refs:** Gap 5.2 (prerequisite) · Inventory 5.20, 5.113 · PMX-5.12, PMX-9.23

**Geiger today**
- **Technician and inspector are free text:** the technician on work orders (`components/internal/screens/maintenance/sections/wo_general.jsx:254-255`; column `technician`, `lib/supabase/work_orders.js:30`) and the inspector on inspections (`lib/supabase/inspections.js:11`).
- **The "Maintenance tech" role only hides navigation** (`components/internal/screens/settings/permissions.js:108-116`).
- **The "Field" view is an `isField` flag filter** (`components/internal/screens/maintenance/config.jsx:54-59`).
- **The signed-in staff member is already resolved** to a `team_members` row by email or `metadata.userId` (`context/rbac-context.js:40-49`).

**What's missing**
- Assignment to a team member.
- A "My work" view, for today, overdue and upcoming.
- Notification on assignment.

**How to build**
- *Data model:* migration `work_assignee_members`. Add these columns, with indexes:
  - `work_orders.assignee_member_id uuid`
  - `inspections.inspector_member_id uuid`

  Keep the text columns as display snapshots.
- *Server logic:* add `assigneeMemberId` and `inspectorMemberId` fields in `lib/supabase/work_orders.js` and `lib/supabase/inspections.js`. Add `teamMemberOptions()` in `lib/supabase/options.js`.
- *UI:*
  - The Technician field becomes a relation to team members (`wo_general.jsx:254`), patching the `technician` text. The same applies to Inspector (`inspections.jsx:287`).
  - New views "My work" in `maintenance/config.jsx` `BASE_VIEWS` and "Mine" in Inspections, filtering on `useRbac().member?.id`.
  - The Overview "next step" (`sections/wo_overview.jsx:28-71`) names the assignee.
- *Permissions:* none new.
- *Integrations:*
  - **In-app bell:** reuse **geiger-notify** (`@geiger/notify/server` `createServerNotifier`) for "Assigned to you". It is not yet a dependency (`package.json:19` lists only `@geiger/ui`); add it and set `transpilePackages`.
  - **Email:** fallback through geiger-dash, template `property.work_assigned`.

**Steps**
1. Migration and data layer.
2. Relation pickers.
3. Views.
4. Add geiger-notify and send on assignment change.

**Research before building**
- Read `C:\Pro\geiger-notify\README.md` §2: wiring, the `notify` exposed schema, and the type registry for app `property`.
- Does each staff user have a `team_members` row with a matching email in practice, or is a `userId` backfill needed?

**Acceptance criteria**
- Assigning a team member stores the id and the name snapshot.
- "My work" shows only that member's open items, ordered overdue → today → upcoming.
- The assignee gets one bell notification per assignment change, and none when re-saving the same assignee.
- Old free-text technicians still display.

**Depends on / unblocks**
- Depends on: none.
- Unblocks: COMM-06, COMM-07.

#### COMM-06 · Field PWA: installable app for technicians and inspectors
- **MRI equivalent:** MRI Service Hub (iPad app, possibly legacy): job receipt, photos, resident signatures, ad-hoc jobs, offline. PMX On the Go (free, read-mostly staff app).
- **Status · priority · effort:** Missing · P2 · L
- **Refs:** Gap 5.2 · Inventory 5.112, 9.40, 9.41 · PMX-5.12, PMX-9.23

**Geiger today**
- **Responsive web only.** There is no manifest, service worker or native project: `public/` holds favicons and SVGs only, and a grep for `manifest|serviceWorker|capacitor` finds nothing.
- **The staff workspace is easy to cache.** It is a force-static shell (`app/project/[projectId]/layout.js`) with a client catch-all (`app/project/[projectId]/[[...rest]]/page.js`), and all data is fetched client-side. That suits PWA shell caching.
- **Vendors already have a responsive portal** (`app/portal`, `lib/portal/vendor.js`).

**What's missing**
- An installable, mobile-first field surface: a day list, a WO runner, an inspection runner, camera capture, signatures and ad-hoc requests.
- Offline is in COMM-07.

**How to build (recommendation: PWA first, no native app)**
- *Data model:* none; the app uses the existing tables.
- *Server logic:* none new beyond COMM-07.
- *Routes:*
  - New segment `app/field/[projectId]/` with a `layout.js` (`dynamic = "force-static"`, like the project layout) and a client `page.js` that reuses `ProjectProvider` and `RbacProvider`.
  - Keep the PWA scope to `/field/` so the landing page and portals are unaffected.
  - Manifest: `metadata.manifest = "/field.webmanifest"` in the field layout (static file in `public/`). Verify per-segment manifests in the Next 16 docs first (see research).
  - Service worker `/field-sw.js` via Serwist. It precaches the shell and caches photo GETs stale-while-revalidate. Add the security headers from the Next PWA guide §8.
- *UI:* `components/field/`, mobile-first, `@geiger/ui` components only.
  - **Bottom tabs:** Today, Inspections, New request, Sync.
  - **Today:** "My work" from COMM-05, grouped overdue, today and next 7 days.
  - **Work order runner:**
    - Address with a maps link, access details (as `lib/portal/vendor.js:38-46` exposes to vendors), and resident contact if permitted.
    - Checklist, before/after photos with `<input type="file" accept="image/*" capture="environment">`, and parts used from inventory.
    - Time log start/stop, field report, and status buttons.
    - Completion with a resident signature on a canvas.
  - **Inspection runner:** room by room with large rating buttons, per-item camera, notes and signatures.
  - **New request:** an ad-hoc WO with photos.
  - **Loaders and install prompt:** `LogoLoading` for screen and section loaders, `Loader2` on buttons. Android uses the `beforeinstallprompt` install prompt; iOS gets a one-time "Add to Home Screen" sheet.
- *Permissions:* entry requires `view.work_orders` or `view.inspections`. Portal users are bounced to `/portal`.
- *Integrations:* push notifications are deferred. Use the geiger-notify bell (COMM-05) and email. Web Push with VAPID keys is a later add (Next PWA guide §2–4).

**Steps**
1. Spike Serwist with Turbopack on Next 16.3: build, register, and update flow.
2. Field route, layout and providers.
3. Day list and WO runner, online-only at first, writing through the existing data layers.
4. Inspection runner, reusing `instantiate` and rating logic from COMM-02.
5. Manifest, icons (192/512, maskable), SW and install prompt.
6. Sidebar link "Open field app" in the Maintenance group, plus a QR code on Settings → Team for phones.

**Research before building**
- `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` and `offline-support.md`. This repo has no `node_modules` installed; the same Next 16.3 docs are in `C:\Pro\geiger-flow\node_modules\next\dist\docs\01-app\02-guides\`.
- Serwist Next integration and the Turbopack example (https://github.com/serwist/serwist).
- Whether `metadata.manifest` per segment is honoured, and whether one origin can host two installable apps (field plus a future portal app).
- iOS PWA limits:
  - no Background Sync
  - storage eviction rules for home-screen apps (WebKit blog, "Updates to Storage Policy")
  - camera capture behaviour
- Suite precedent: none found (no manifest in geiger-flow or geiger-notes). Agree icon and branding with the suite.

**Acceptance criteria**
- Lighthouse "Installable" passes on `/field`. Installing on Android and iOS opens straight into Today.
- A technician completes a WO with 2 photos, a checklist and a signature on a 375px-wide screen, with no horizontal scroll.
- `/project/...` and `/portal` are not controlled by the service worker (scope check).
- A user without the Work Orders view sees the no-access state.

**Depends on / unblocks**
- Depends on: COMM-05, COMM-02, and PLAT-01 (private photo storage before field photos of homes scale up).
- Unblocks: COMM-07.

**Open decisions**
1. **Native wrapper later?** Should a Capacitor wrapper or app-store listing be planned if iOS PWA limits bite (storage eviction, no background sync), or stay web-only? Recommendation: stay a PWA until a customer asks for an app-store app.

#### COMM-07 · Offline capture and sync for work orders and inspections
- **MRI equivalent:** Service Hub ("Full online and offline access"); HappyCo native offline inspections.
- **Status · priority · effort:** Missing · P2 · L
- **Refs:** Gap 5.2, 5.3 · Inventory 5.112, 2b.93, 9.41 · PMX-5.09, PMX-5.12

**Geiger today**
- **No offline layer.** All writes go straight from the browser through `makeEntityData` and `merge_meta`.
- **`merge_meta` is a shallow merge** (`lib/supabase/meta.js:5-25`). Replaying a queued array write would clobber concurrent appends to `photos`, `statusHistory`, `timeLog` and checklists.
- **Photos upload to a public bucket** (`lib/supabase/property_storage.js:77`; inventory 9.48).
- **Reusable pieces:**
  - Client compression `compressImageUnder` (`lib/image/compress.js:56`).
  - Staff server auth helper `requireStaff` (`lib/messaging/auth.js:22`).

**What's missing**
- A local snapshot of the user's day.
- A durable outbox.
- A server sync endpoint with idempotent, conflict-aware replay.
- Queued photo uploads.

**How to build (offline scope)**
- **Cached for offline ("Download my day"):**
  - Assigned open WOs (overdue, plus scheduled within ±7 days) with unit, property and access fields.
  - Assigned inspections (Scheduled or In progress within 7 days) with their template snapshot, plus the move-in baseline for move-out comparison.
  - Inventory item names and quantities.
  - The unit's equipment, once COMM-17 lands.
- **Allowed offline (queued):**
  - WO status start, hold or complete, checklist ticks, time log, field report, before/after photos, resident signature, and parts-used entries (applied on sync).
  - New ad-hoc request with a client UUID.
  - Inspection ratings, notes, photos, findings flags (COMM-04), signatures, and complete.
- **Online-only:**
  - Anything touching the ledger: chargebacks, bills, deposit deductions.
  - Approvals, POs, vendor assignment and email sends.
- *Data model:* migration `field_sync`.
  - Table `property.field_sync_ops`: standard columns plus `project_id`, `op_id uuid unique`, `member_id`, `kind`, `target_table`, `target_id`, `status` (`applied|conflict|error`), `result jsonb`. It is the idempotency ledger.
  - New RPC `property.append_meta_items(p_table text, p_id uuid, p_key text, p_items jsonb) returns jsonb`. It appends array items, deduped by `id`. Name this migration as its owner in the header comment.
  - Check the table name is free; fallback `field_ops`.
- *Server logic:* `lib/field/ops.js` (pure) has one validator and applier per op kind. Status transitions use the existing rules in `components/internal/screens/maintenance/shared.js:81-103` and `CLOSED_WORK_STATUSES` (`:279`). It returns `conflict` when, for example, a WO was cancelled while offline. Scalar fields go through `merge_meta`; arrays go through `append_meta_items`. Parts usage replays `adjustInventory` (`lib/supabase/inventory.js:28-45`) server-side. That needs an admin-client variant; move the shared math into `lib/maintenance/inventory_math.js`.
- *API routes:*
  - `app/api/field/snapshot/route.js` (GET) returns the day's data for the member.
  - `app/api/field/sync/route.js` (POST `{ projectId, ops[] }`) checks `requireStaff`, applies each op once (keyed by `op_id`), and returns per-op results.
  - `app/api/field/upload/route.js` takes a photo upload and returns a storage path. It uses PLAT-01's private bucket and signed URLs.
- *Client:* `lib/field/store.js` on IndexedDB (the small `idb` package), with stores `snapshot`, `outbox` and `blobs`.
  - **When sync runs:** on the `online` event, on app open, and on a manual "Sync now". Don't rely on Background Sync, which iOS lacks.
  - **Photos:** compressed before storing.
  - **Cleanup:** the outbox clears on success. Snapshots purge after 14 days. Sign-out wipes IndexedDB.
  - **Persistent storage:** request `navigator.storage.persist()`.
- *UI:* a Sync tab with pending ops, photo upload progress, and a conflicts list with "Keep mine / Keep server". Show an offline banner, using Next `useOffline` only if the experimental flag is adopted.
- *Permissions:* sync applies only to records assigned to the member, or created by them.

**Steps**
1. Migration and RPC.
2. `lib/field/ops.js` with tests per op, including replay twice and a conflict.
3. Snapshot, sync and upload routes.
4. IndexedDB store and outbox.
5. Wire the COMM-06 runners to write through the outbox when offline (and always, for uniformity).
6. Conflict UI.
7. Session-expiry handling: keep the queue, and ask the user to sign in before syncing.

**Research before building**
- The Supabase auth session lifetime vs offline days: does the refresh token survive, and how is a 401 on replay handled? See the Supabase SSR docs and how `utils/supabase/server.js` reads the suite cookie.
- IndexedDB quotas on iOS Safari; `navigator.storage.estimate()` and `persist()` support (MDN).
- Whether the experimental `useOffline` flag is worth adopting (Next 16 offline guide) vs a simple `navigator.onLine` banner.

**Acceptance criteria**
- **Offline round trip:** in airplane mode, a tech starts a WO, ticks 3 checklist items, adds 2 photos, completes it with a signature, and creates a new request. On reconnect, all of it syncs, and the WO's `statusHistory` contains both offline transitions with their original timestamps.
- **No lost appends:** two devices add photos to the same WO offline. After both sync, all photos are present.
- **Idempotent replay:** replaying the same `op_id` returns the first result and writes nothing.
- **Conflicts:** completing a WO that staff cancelled meanwhile returns `conflict` and changes nothing.
- **Ledger stays online:** no ledger entry is ever created by the sync route.
- **Sign-out** leaves no WO or tenant data in IndexedDB.

**Depends on / unblocks**
- Depends on: COMM-06, PLAT-01 (private storage, server-side writes), and COMM-04 (findings ops).
- Unblocks: none in this file. It gives HOUS offline voucher inspections.

#### COMM-08 · Schedule E line mapping on GL accounts
- **MRI equivalent:** no direct MRI product. Investor Connect and investor reporting presuppose tax-ready categories. For Geiger's owners the target form is IRS Schedule E, Part I.
- **Status · priority · effort:** Missing · P2 · S
- **Refs:** Supports gaps 6.5, 6.9, 6.10 and owner reporting · Inventory 6.77, 6.78

**Geiger today**
- **No tax mapping on accounts.** `normalizeGlAccount` carries type and subtype only (`lib/ledger/postings.js:57-72`). The default chart has 30 accounts (`supabase/migrations/20261015212744_ledger_core.sql:466-494`). The Chart of Accounts editor fields are at `components/internal/screens/accounting/chart_of_accounts.jsx:94-102`.
- **Owner statement math exists:** `ownerStatement` and `incomeStatement` in `lib/reports/ledger_math.js:135, 446`.

**What's missing**
- A Schedule E line per account, so owner summaries total by tax line.

**How to build**
- *Data model:* migration `gl_account_tax_lines`: `alter table property.gl_accounts add column if not exists tax_line text`. Promote this to a column rather than metadata, because the portal and server readers normalize raw rows.
- *Server logic:* `lib/ledger/tax_lines.js`.
  - `SCHEDULE_E_LINES`: 3 Rents received, 5 Advertising, 6 Auto and travel, 7 Cleaning and maintenance, 8 Commissions, 9 Insurance, 10 Legal and other professional fees, 11 Management fees, 12 Mortgage interest paid to banks, 13 Other interest, 14 Repairs, 15 Supplies, 16 Taxes, 17 Utilities, 18 Depreciation, 19 Other.
  - Default map by `system_key`:

    | System key | Line |
    |---|---|
    | `rent_income`, `late_fee_income`, `utility_income`, `cam_income`, `other_income` | 3 |
    | `concessions` | 3, negative |
    | `repairs_maintenance` | 14 |
    | `turnover` | 7 |
    | `utilities` | 17 |
    | `insurance` | 9 |
    | `property_taxes` | 16 |
    | `management_fees` | 11 |
    | `deposit_interest` | 13 |
    | `payroll` | 19 |
    | `management_fee_income` | excluded (manager's own) |
    | `bad_debt` | flagged; only deductible if previously reported as income |

  - `taxLineOf(account)`: the column, else the default, else 19 for expenses and 3 for income.
  - Map `tax_line` in `normalizeGlAccount`.
- *UI:* add a "Schedule E line" select in the Chart of Accounts editor, plus a column in the list.
- *Permissions:* `settings.manage`.

**Steps**
1. Migration.
2. `tax_lines.js` and the normalizer.
3. Editor field.
4. A test that every default account resolves to a line or "excluded".

**Research before building**
- Current Schedule E line numbers and instructions for tax year 2026 (https://www.irs.gov/instructions/i1040se). Lines can shift between years, so store a `taxYear` for the map.
- Treatment of security deposits applied to rent (rental income), and of tenant-paid expenses (Pub 527, https://www.irs.gov/publications/p527).

**Acceptance criteria**
- Every system account resolves to a line or "excluded".
- A custom expense account with no mapping falls into line 19, and is flagged in the owner summary as "unmapped".
- Changing a mapping changes the next summary run, not stored history.

**Depends on / unblocks**
- Depends on: none.
- Unblocks: COMM-09, COMM-19, COMM-20, and CORE(6.5) owner 1099 (rents total cross-check).

#### COMM-09 · Owner portal annual summary and multi-property rollup (Investor Connect-lite)
- **MRI equivalent:** Investor Connect: a branded portal with dashboards, a document repository and distribution statements. The K-1s, capital calls and waterfalls are not in scope.
- **Status · priority · effort:** Partial · P2 · M
- **Refs:** Inventory 6.77–6.80 · PMX-6.54 · Gap report "Where Geiger matches or leads PMX"

**Geiger today**
- **The portfolio page already rolls up several properties.** It shows units, occupancy, scheduled rent and open WOs for each owned property (`lib/portal/owner.js:39-95`).
- **Statements are monthly only and cannot be filtered by property.** They sum across properties by ownership share (`lib/portal/owner.js:104-195`). The portal's Financials group has one item, "Statements" (`components/portal/portal_nav.js:37-42`). The page can be printed (`components/portal/owner/owner_statements.jsx:52`).
- **Staff have a range-based Owner Statements report** (`lib/reports/defs_operations.js:326-345`).
- **The owner's statement frequency preference is saved but unused** (`components/internal/screens/owners/shared.js:133-134`).
- **Known defect, CORE(0.8):** the portal statement math differs from the staff `ownerLines`, which excludes fee income.

**What's missing**
- A year view: income and expenses by Schedule E line, per property and in total.
- Year-to-date on the portfolio cards.
- A property filter on statements.
- A staff "Owner annual summary" report.

**How to build**
- *Data model:* none.
- *Server logic:*
  - First rebase the portal statements onto `lib/reports/ledger_math.js` (`ownerLines`, `ownerStatement`) as part of CORE(0.8). Do not fork the math again.
  - Add `ownerAnnualSummary(ctx, year, { propertyId })` in `lib/portal/owner.js`. It returns:
    - `{ properties: [{ id, name, pct, lines: { [taxLine]: amount }, income, expense, net }], totals, distributions, contributions, endingTrustBalance }`
    - placeholder sections for line 12 (COMM-19) and line 18 (COMM-20)
    - `unmapped` accounts

    Line totals use `taxLineOf` (COMM-08).
  - Add `ytd` to each property in `ownerPortfolio`.
- *API routes:*
  - `app/api/portal/owner/summary/route.js` (GET `?year=&propertyId=`), via `requirePortal` like the existing owner routes.
  - Extend `app/api/portal/owner/statements` with `propertyId`.
- *UI:*
  - New portal tab "Annual summary" in `portal_nav.js` Financials, as `components/portal/owner/owner_annual.jsx`. It has a year picker, a property filter, a Schedule E table per property and in total, print, and CSV download.
  - YTD income, expense and NOI on the portfolio cards (`owner_home.jsx`).
  - Property filter on Statements.
  - Staff report `ownerAnnualSummaryReport` in `lib/reports/defs_operations.js`, registered in `lib/reports/catalog.js`, with owner and year filters.
- *Permissions:* portal: the existing `portalShowStatements` (`components/internal/screens/owners/sections.jsx:327`). Staff: `view.reports`.

**Steps**
1. Wait for or pair with CORE(0.8).
2. `ownerAnnualSummary` with fixture tests: 2 owners at 60/40 on one property, plus a sole-owned property.
3. Route and tab.
4. Portfolio YTD.
5. Staff report.

**Research before building**
- What owners and their CPAs expect in a year-end owner statement. Compare AppFolio and Buildium year-end packets from their help centres.
- Should management-fee-inclusive totals reconcile to the 1099-MISC rents box (CORE(6.5))?

**Acceptance criteria**
- **Co-owner split:** for a 60/40 co-owned property with $24,000 rent and $6,000 repairs in a year, the 60% owner sees $14,400 on line 3, $3,600 on line 14, and net $10,800. The 40% owner's figures sum with these to the property totals.
- **Fees:** management fee income (4500) never appears. Management fees expense appears on line 11.
- **Rollup:** the portfolio YTD equals the summary totals for the same year.
- **Consistency:** the staff report and the portal show identical numbers for the same owner and year.

**Depends on / unblocks**
- Depends on: CORE(0.8), COMM-08.
- Unblocks: COMM-10.

#### COMM-10 · Owner document sharing and year-end packet
- **MRI equivalent:** Investor Connect document repository and distribution statements.
- **Status · priority · effort:** Partial · P2 · S
- **Refs:** Inventory 4.26, 6.79, 6.80 · PMX-6.54

**Geiger today**
- **Owners see every non-internal document.** The portal lists the owner's own documents and all property documents not flagged `metadata.internal` (`lib/portal/owner.js:197-203` → `lib/portal/common.js:58-76`).
- **Nothing sets that flag** (inventory 4.26), so every property document reaches the owner, including policies and vendor contracts.
- **Generated documents are plain text.** They are stored as `.txt` (`storeTextDocument`, `lib/leasing/workflows.js:99`).
- **The "Receives statements" switch exists** (`components/internal/screens/owners/shared.js:160`).

**What's missing**
- Per-document owner visibility control.
- A "publish to owner" action with a notice.
- A batch year-end packet per owner: annual summary, December statement, and the 1099 from CORE(6.5).

**How to build**
- *Data model:* no migration. Documents carry `metadata.portal = { owner: bool, resident: bool }`. Agree the key with LEAS, which fixes resident visibility (4.26). Document kind `year_end_packet`.
- *Server logic:*
  - `listDocumentsFor` reads `portal.owner === true` for property documents. Owner-file documents stay visible unless `internal`.
  - Add a migration-free compatibility rule: documents created before the release keep today's behaviour until staff review them. See the open decision.
  - `lib/owners/year_end.js` builds the packet as HTML via `lib/reports/html.js`, stores it as a document on the owner, and links the 1099 document from CORE(6.5).
- *API routes / jobs:* `app/api/owners/year-end/route.js` (POST, `requireStaff`) runs the batch for owners with `receivesStatements`. It emails via the geiger-dash template `property.owner_document_published`.
- *UI:*
  - A "Visible in owner portal" toggle on rows in `components/internal/screens/entity/shared_sections/documents_section.jsx`, shown when the owner type is property, building or owner.
  - Owners screen action "Publish year-end packets…", a wizard with year, owners and preview.
- *Permissions:* new `owners.publish` ("Publish owner documents", group "Records").

**Steps**
1. Visibility flag and reader change.
2. Toggle UI.
3. Packet builder.
4. Batch route, email template and wizard.

**Research before building**
- PDF output: does CORE's reports item (7.5 attachments) or LEAS (2.6 lease PDF) deliver a server PDF renderer? Use it instead of HTML once available.

**Acceptance criteria**
- A property document without the toggle is not returned by `/api/portal/owner/documents`; toggling it on makes it appear.
- A packet run for 3 owners creates 3 documents and sends 3 emails. Re-running for the same year replaces the documents rather than duplicating them.
- An owner with "Receives statements" off is skipped.

**Depends on / unblocks**
- Depends on: COMM-09, CORE(6.5) for the 1099, and CORE's reports item for PDF output.
- Unblocks: none.

**Open decisions**
1. **Existing property documents.** Hide them from owners by default (safer) or keep them visible (today's behaviour)? Recommendation: hidden by default.

#### COMM-11 · Commercial tenant COI tracking
- **MRI equivalent:** MRI Angus: certificate-of-insurance tracking for tenants and contractors.
- **Status · priority · effort:** Missing · P2 · S
- **Refs:** Inventory 8.13–8.17, 5.61, 5.105

**Geiger today**
- **Vendor COI tracking works:**
  - COI fields (`components/internal/screens/vendors/shared.js:136-149`) and requirement fields (`:108-115`).
  - `complianceOf` (`lib/compliance.js:41-54`).
  - Reminders at 30, 14 and 0 days with a staff alert (`lib/messaging/reminder_jobs.js:405-421`).
- **Tenants get renters insurance only:**
  - Section `components/internal/screens/tenants/sections/insurance.jsx:19-52`.
  - Reminders at 30, 7 and 0 days with a "renters insurance" message (`reminder_jobs.js:435-447`).
  - Portal upload (`lib/portal/resident.js:336-382`).
- **Company tenants exist** (`components/internal/screens/tenants/shared.js:51-56`).
- **Unreviewed uploads count as compliant.** A portal upload is saved as "Pending" yet counts as in force (`complianceOf` ignores status other than Cancelled; inventory 5.61).

**What's missing**
- For company tenants or commercial leases: COI records (CGL per occurrence and aggregate, additional insured, waiver of subrogation, property, liquor), coverage minimums from the lease, COI-style reminders, a review step, and a report section.

**How to build**
- *Data model:* none. Reuse `record_items` kind `insurance_policy` with owner type `tenant`. Requirements live in tenant metadata, or in the lease abstract (COMM-13) when present.
- *Server logic:*
  - Move `COI_FIELDS` and the requirement fields into a shared `components/internal/screens/people/coi_fields.js`, used by vendors and tenants.
  - Add `coverageGaps(policies, requirements)` in `lib/compliance.js`: below-minimum CGL, missing additional insured, missing workers' comp. If RISK builds the same helper for vendors (5.105), whichever lands first owns it.
  - `complianceOf` gains `{ countPending: false }`.
  - Add `isCommercialTenant(tenant, leases)`: `tenantType === "Company"`, or a live lease with `leaseType === "commercial"`.
- *API routes / jobs:* the tenant loop in `reminder_jobs.js:435` branches for commercial tenants. It uses marks `[30, 14, 0]`, the label "Certificate of insurance (COI)", `staffOnExpiry: true`, and COI wording.
- *UI:*
  - The tenant Insurance tab switches to a COI section and requirement fields when the tenant is commercial.
  - The portal insurance page (`components/portal/resident/resident_insurance.jsx`) shows COI fields, and `addInsurance` stores them.
  - Add a "Needs review" filter and "Approve" / "Reject" actions on records.
  - The Insurance Compliance report (`lib/reports/defs_operations.js:596-663`) gets a "Commercial tenants" section.
- *Permissions:* none new.

**Steps**
1. Shared COI fields.
2. `coverageGaps`, and the `countPending` option.
3. Tenant tab branch.
4. Reminder branch.
5. Portal form branch.
6. Report section.

**Research before building**
- ACORD 25 certificate fields (https://www.acord.org) to mirror. Manual entry only; AI extraction is deferred.
- Typical small-retail lease insurance minimums (e.g. $1M per occurrence / $2M aggregate) to seed defaults.

**Acceptance criteria**
- A company tenant with a COI expiring in 14 days gets the 14-day reminder, and staff get a digest line at 0 days.
- A COI with $500k CGL against a $1M requirement shows "Below minimum" and counts as non-compliant.
- A pending portal upload does not make the tenant compliant until approved.
- Residential tenants are unchanged.

**Depends on / unblocks**
- Depends on: none. COMM-13 later supplies lease-level requirements.
- Unblocks: COMM-12.

#### COMM-12 · Commercial tenant profile and portal mode (Tenant Connect-lite)
- **MRI equivalent:** Tenant Connect (payments, sales entry, account status, service requests) and Engage @Work (commercial tenant portal, 2023).
- **Status · priority · effort:** Partial · P2 · M
- **Refs:** Inventory 2b.4, 4.1–4.6 · MRI commercial notes Q1

**Geiger today**
- **Company tenants and commercial leases are recorded but don't change the portal.**
  - Tenant type Individual/Company and company name (`components/internal/screens/tenants/shared.js:51-56`).
  - Lease type `commercial` (`components/internal/screens/leasing/shared.js:117-120`).
  - The resident portal nav is residential-only, e.g. "My home" and "Renters insurance" (`components/portal/portal_nav.js:17-36`).
- **One login per tenant.** `portal_members` is unique on `(role, party)` (`supabase/migrations/20261015215447_portal_members_access.sql:68-69`), and invites update the existing member (`lib/portal/invite.js:57-90`). A store needing both an accounts contact and a manager login can't have both.
- **Portal permissions are per tenant** (`lib/portal/resident.js:14-24`).

**What's missing**
- Business profile fields and multiple contacts.
- A commercial portal variant: labels, COI page, lease summary with key dates.
- Several logins per company tenant, each with its own permissions.

**How to build**
- *Data model:*
  - Migration `portal_members_multi_contact`: drop and recreate the unique index as `(role, coalesce(tenant_id, owner_id, vendor_id), lower(email))`. The `@down` restores the old index only if there are no duplicates.
  - Tenant contacts use `record_items` kind `contact`, the same as vendor contacts (`components/internal/screens/vendors/shared.js:173-180`), with a per-contact `portal` permission set in metadata.
  - Business fields in tenant metadata: DBA, entity type, business use, store hours, after-hours contact.
- *Server logic:*
  - `memberView` (`lib/portal/session.js:103-128`) adds `variant: "commercial"` when the tenant is commercial (`isCommercialTenant` from COMM-11).
  - `residentPermissions` reads per-contact overrides from the member's metadata.
  - `invitePortalMember` gets a `contactId` path, with `findMember` matching by email.
- *UI:*
  - Change `PORTAL_NAV` to a `navFor(member)` function with labels "My space", "Insurance (COI)" and "Lease summary", and a new tab rendering COMM-13 key dates and options.
  - The tenant editor gets a "Business" section, a "Contacts" section and a Portal tab listing contacts with invite and disable per contact.
- *Permissions:* none new.
- *Integrations:* statements and invoices come from CORE(3.2). CAM estimates and reconciliations come from CORE's CAM item.

**Steps**
1. Index migration, and update invite and disable for per-contact members.
2. Tenant business and contact sections.
3. `variant` in `memberView`, plus `navFor`.
4. Lease summary tab, completed after COMM-13.
5. Regression: residential portals unchanged.

**Research before building**
- What small-retail tenants expect from a landlord portal. Use the public pages of Tenant Connect (https://www.mrisoftware.com/au/?p=858) and AppFolio/Buildium commercial tenant portals.
- Whether owners (LLC co-managers) and vendors (office plus field) also benefit from multi-login now. Coordinate with LEAS and PLAT-01.

**Acceptance criteria**
- One company tenant has 2 active logins, each with different permissions: one can pay and one cannot.
- A commercial tenant sees "Insurance (COI)" and "Lease summary". A residential tenant sees today's nav.
- Re-inviting the same email updates the existing member, not a duplicate.
- Disabling one contact leaves the other signed in.

**Depends on / unblocks**
- Depends on: PLAT-01, COMM-11, and LEAS resident portal items. COMM-13 is needed for the lease summary.
- Unblocks: COMM-16.

**Open decisions**
1. **Multiple portal logins per party.** Allow it for all portal roles (owners and vendors too), or only for commercial tenants? Recommendation: all roles; the index change is the same.

#### COMM-13 · Commercial lease abstract and critical dates (non-AI precursor to Contract Intelligence)
- **MRI equivalent:** Contract Intelligence (ex-LEVERTON): AI lease abstraction with contract compliance alerts. Lease Flow and ProLease cover critical dates on the occupier side.
- **Status · priority · effort:** Saved-unused · P2 · M
- **Refs:** Inventory 2b.16, 6.75 · MRI commercial notes Q1, Q2

**Geiger today**
- **Commercial terms are saved but never read.** They show only when the lease type is commercial: permitted use, expense structure, square feet, CAM per month, TI allowance and personal guarantee (`components/internal/screens/leasing/config.jsx:133-139`). A grep for `camCharges|sqftLeased|expenseStructure|tiAllowance` outside the definitions finds no reader.
- **No options or critical dates.**

**What's missing**
- A structured abstract: premises, dates, options, use and exclusives, a responsibility matrix, insurance requirements, security and guaranty, assignment, holdover, estoppel and SNDA.
- Critical-date reminders.
- A tenant-facing summary.

**How to build**
- *Data model:* no migration.
  - Lease `metadata.abstract`, grouped:
    - **Premises:** suite, rentable sq ft (reuse `sqftLeased`), pro-rata share %.
    - **Dates:** commencement, rent commencement, free-rent months.
    - **Use:** permitted use, exclusive use, radius, signage, operating-hours covenant.
    - **Responsibility matrix:** `{ roof, structure, hvac, plumbing, electrical, glass, parkingLot, janitorial }` → `landlord|tenant|shared`.
    - **Insurance:** CGL minimum, umbrella, property, additional insured, waiver of subrogation.
    - **Security and assignment:** deposit or letter of credit with expiry, guarantor, consent to assign, holdover %, estoppel days, SNDA status.
  - Repeaters in `record_items`:
    - kind `lease_option` (`type renew|extend|terminate|expand|rofr|rofo`, notice window start and end, terms, status)
    - kind `critical_date` (`ends_on` = deadline, `source` = option or LOC or other)
  - Provenance hook for later AI: `abstract._sources = { [field]: { documentId, page, method: "manual" } }`.
- *Server logic:*
  - `lib/leasing/abstract.js`: `deriveCriticalDates(lease, options)` creates and updates `critical_date` rows (option notice deadlines, LOC expiry, lease expiry, rent commencement).
  - `coiRequirementsOf(lease)` feeds COMM-11.
  - `responsibilityFor(lease, category)` feeds COMM-16.
- *API routes / jobs:* add `critical_date` to the expiring-documents job kinds (`lib/messaging/reminder_jobs.js:340`), with staff-only digest marks at 180, 90, 30 and 0 days.
- *UI:*
  - The lease editor gets an "Abstract" tab, shown when the lease type is commercial. It uses `FieldsForm` groups plus `makeRecordItemsSection` for options and critical dates.
  - The Leases list gets a "Critical dates in 90 days" view.
  - The COMM-12 portal tab shows dates and options read-only.
- *Permissions:* none new.
- *Integrations:* AI abstraction is deferred to the suite AI package (PLAT AI item). The hook is `_sources`, plus a future "Extract from document" action on the lease document.

**Steps**
1. Abstract field config and tab.
2. Option and critical-date sections.
3. `deriveCriticalDates` on save.
4. Reminder kind.
5. Leases view.
6. Portal summary (with COMM-12).

**Research before building**
- Lease abstract checklists for small retail: BOMA and ICSC abstract templates, and MRI Contract Intelligence's data-point list from the product index (https://www.mrisoftware.com/products/). Keep fields a small storefront landlord uses.
- Which CAM and recovery fields CORE's CAM item will add (base year, caps, admin fee), so there is one source of truth.

**Acceptance criteria**
- A renewal option with a notice window ending 2027-03-31 creates one critical date. Editing the window updates it rather than adding a second.
- The staff digest lists it at 180, 90, 30 and 0 days.
- Changing the lease type to residential hides the tab and keeps the data.
- COMM-11 reads the CGL minimum from the abstract when present.

**Depends on / unblocks**
- Depends on: none.
- Unblocks: COMM-11 (requirements), COMM-12 (summary), COMM-16 (routing).

#### COMM-14 · Purchase orders: line items, budget lookup, approval limits
- **MRI equivalent:** Purchase Order add-on: "track orders and line items separately", "Interfaces with the general ledger to grab budget data", "controls over approval limits and override capabilities".
- **Status · priority · effort:** Missing · P2 · L
- **Refs:** Gap 5.1 · Inventory 5.94, 5.26, 5.90, 6.35 · PMX-6.34, PMX-5.17

**Geiger today**
- **PO numbers are free text with no reader:** on work orders (`components/internal/screens/maintenance/sections/wo_general.jsx:268`) and in inventory "Mark ordered" (`components/internal/screens/maintenance/inventory.jsx:213, 437-459`). There is no PO table in `supabase/migrations/`.
- **Bills carry one amount and one GL account** (`lib/supabase/bills.js:4-27`), behind one project-wide approval limit (`components/internal/screens/accounting/bills.jsx:73-88`). Yet `buildBill` already accepts split `lines` (`lib/ledger/postings.js:262-282`).
- **Budgets are per property, GL account and month** (`budget_lines`, `ledger_core.sql:150-166`).
- **Owner approval fields are saved but unused** (`components/internal/screens/owners/shared.js:147-148`). The owner portal approves WOs only (`lib/portal/owner.js:260-302`).

**What's missing**
- POs with lines (description, inventory item, GL, qty, cost).
- Budget position at entry (budget, actual, committed, remaining).
- Approval by limit, with a budget override and reason.
- Owner approval over the owner threshold.
- Numbering, PDF or email to the vendor, and links to WOs and jobs.

**How to build**
- *Data model:* migration `purchase_orders`.
  - Check `to_regclass` for both names first, since a deleted branch is a likely source of orphans named like this. Fallbacks: `po_headers` and `po_lines`.
  - `property.purchase_orders`: standard columns plus `project_id`, `number text`, `name`, `vendor_id`, `vendor_name`, `property_id`, `unit_id`, `work_order_id`, `job_id` (`cost_jobs`), `status` (`Draft|Pending approval|Approved|Rejected|Sent|Partially received|Received|Closed|Cancelled`), `order_date`, `needed_by`, `subtotal`, `tax`, `shipping`, `total`, `approval_status`, `approver_name`, `approved_at`, `sent_at`. Indexes on vendor, property, work order and status.
  - `property.purchase_order_lines`: `purchase_order_id`, `sort`, `description`, `inventory_item_id`, `gl_account_id`, `unit_id`, `qty`, `unit_cost`, `amount`, `qty_received`, `amount_billed`.
  - Table `property.doc_sequences (project_id, kind, next_value)` with RPC `property.next_doc_number(p_project_id uuid, p_kind text) returns text` (atomic `update … returning`, format `PO-000123`).
  - `alter table property.bills add column if not exists purchase_order_id uuid`.
- *Server logic:*
  - Data layers: `lib/supabase/purchase_orders.js` and `purchase_order_lines.js`.
  - `lib/purchasing/budget.js` `budgetPosition({ propertyId, glAccountId, date, period: "month"|"ytd"|"year", excludePoId })` returns `{ budget, actual, committed, remaining }`, computed as follows:
    - Budget from `budget_lines`, approved budgets only.
    - Actual from ledger lines (reuse `listLedger` filters).
    - Committed = approved, unclosed PO lines minus `amount_billed`.
  - `lib/purchasing/approval.js` `requiredApprovals(po, { limits, ownerThreshold, budgetPositions })` returns steps `[internal, owner?]`.
  - **Register PO as an approvable document type in CORE(6.2)'s engine.** If that engine has not shipped, use one step against `accounting_settings.poApprovalLimit`.
  - The owner step reuses `decideApproval`'s shape, generalised to `{ table: "purchase_orders" }`.
- *API routes / jobs:*
  - `app/api/purchasing/send/route.js` emails the vendor through geiger-dash template `property.purchase_order`, with an HTML PO via `lib/reports/html.js`.
  - Add owner-portal PO approvals to `app/api/portal/owner/work-orders` (or a sibling `approvals` route).
- *UI:*
  - New screen "Purchase Orders" under Maintenance, after Inventory & Parts (`components/internal/sidebar/sidebar_nav.jsx:136`; `registry.jsx`), built with `EntityListScreen`. Views: Draft, Awaiting approval, Open, Received, All.
  - Lines editor modelled on `CostsSection` (`wo_costs.jsx:44-207`). Each line shows a budget chip (green, amber or red) from `budgetPosition`.
  - Actions:
    - Submit for approval
    - Approve / Reject. "Approve over budget" asks for a reason and needs the override permission.
    - Send to vendor
    - Cancel
  - From a WO: a "Create purchase order" action prefills vendor, property, unit and WO. The WO "PO number" field becomes a relation, keeping the text for external numbers.
  - From inventory: "Mark ordered" creates a draft PO.
- *Permissions:* new in `lib/rbac.js`, group "Purchasing controls":
  - `purchasing.create`, inheriting `view.purchase_orders`
  - `purchasing.approve`
  - `purchasing.override_budget`

  Role-level amount limits live in `accounting_settings.poApprovalLimits[roleId]`.

**Steps**
1. Migration and RPC.
2. Data layers.
3. `budget.js` with tests: budget $1,000/month, actual $400, committed $300 → remaining $300.
4. Approval rules via CORE(6.2).
5. Screen, line editor and actions.
6. WO and inventory entry points.
7. Send to vendor.
8. Owner-portal approval.

**Research before building**
- CORE(6.2)'s approval engine API: document registration, steps and limits.
- Which PO features small managers actually use: AppFolio's "Purchase orders" help article, and Buildium. Is receiving needed, or is "PO → bill" enough for most?
- Tax and shipping lines: are they needed for maintenance supplies?

**Acceptance criteria**
- A $2,400 PO with a $1,500 limit for the "Property manager" role goes to "Pending approval". An Accountant-role approver with a $5,000 limit approves it.
- A PO line that pushes a GL account over its monthly budget shows red. Approval without `purchasing.override_budget` is refused. With it, a reason is mandatory and logged.
- A PO above the owner's `approvalThreshold` adds an owner step visible in the owner portal. Rejection there sets the PO to Rejected.
- PO numbers are unique and sequential per project under concurrent creation.
- Committed totals drop as lines are billed (COMM-15).

**Depends on / unblocks**
- Depends on: CORE(6.2) (approvals), CORE(0.9) (bills posted to AP on approval), PLAT-01.
- Unblocks: COMM-15.

**Open decisions**
1. **Owner approval for POs.** Should POs over the owner's threshold require owner approval in the portal, as WOs do today? Recommendation: yes.

#### COMM-15 · PO receiving, inventory restock and PO-to-bill match
- **MRI equivalent:** Purchase Order add-on: receiving and invoice matching (mirrored in Job Cost commitments).
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gap 5.1 · Inventory 5.88–5.90, 6.36 · PMX-6.34

**Geiger today**
- **Restocking is manual.** `adjustInventory` records restocks with unit cost (`lib/supabase/inventory.js:28-45`), and "Mark ordered" is tracking-only (`components/internal/screens/maintenance/inventory.jsx:426-466`).
- **Vendors already submit invoices** in the portal (inventory 6.36; `app/api/portal/vendor/invoices`).
- **Bills post single-line** (`bills.jsx:102-115`).

**What's missing**
- Receiving PO lines, with partial receipts that restock inventory items.
- Converting received or ordered lines to a split bill.
- Matching a vendor's portal invoice to a PO.
- Closing the PO.

**How to build**
- *Data model:* none beyond COMM-14. Receipts live in PO metadata `receipts: [{ id, date, lines: [{ lineId, qty }], by }]`. `qty_received` and `amount_billed` are updated on the line rows.
- *Server logic:* `lib/purchasing/fulfil.js`:
  - `receive(po, lines)` updates quantities and calls `adjustInventory(itemId, +qty, { type: "restock", unitCost, poId })`.
  - `billFromPo(po, { lines })` returns a bill input with `metadata.lines` and `purchase_order_id`.
  - `matchInvoice(po, invoice)` returns per-line variance, with a tolerance setting.

  Change `postBillToLedger` (`bills.jsx:102-115`) to pass `lines` when present, so each PO line debits its own GL. Coordinate with CORE(0.9), which touches the same function.
- *UI:*
  - PO actions "Receive…" (a wizard with per-line qty) and "Create bill…".
  - A bill created from a PO shows its lines and the PO link.
  - The vendor portal invoice form gains a PO picker for that vendor's open POs.
- *Permissions:* `purchasing.create` to receive. `accounting.post` to bill.

**Steps**
1. `fulfil.js` with tests.
2. Receive wizard.
3. Split-bill support in `bills.jsx`, coordinated with CORE(0.9).
4. Create-bill action.
5. Vendor portal PO picker.
6. Auto-close when fully received and billed.

**Research before building**
- Two-way (PO ↔ bill) vs three-way (PO ↔ receipt ↔ bill) matching expectations for small managers.
- Variance tolerance defaults.

**Acceptance criteria**
- **Partial receipt:** receiving 6 of 10 filters adds 6 to stock at the PO unit cost, and the PO shows "Partially received".
- **Split bill:** a 2-line PO (GL 5000 $300, GL 5700 $200) becomes one bill whose AP entry is Dr 5000 $300, Dr 5700 $200, Cr 2000 $500. `amount_billed` updates, and COMM-14's committed amount drops by $500.
- **Over-billing:** billing more than ordered beyond tolerance needs approval.
- **Auto-close:** a fully received and billed PO closes automatically.

**Depends on / unblocks**
- Depends on: COMM-14, CORE(0.9).
- Unblocks: none.

#### COMM-16 · Commercial service requests (Angus-lite)
- **MRI equivalent:** MRI Angus (tenant service requests, billable services, after-hours HVAC) and Tenant Connect ("initiate service requests").
- **Status · priority · effort:** Partial · P3 · M
- **Refs:** Inventory 4.28–4.31, 5.6 · MRI commercial notes Q1, Q3

**Geiger today**
- **Requests work, but only with residential vocabulary.** Commercial tenants can submit requests through the resident portal (`lib/portal/resident.js:200-250`), but the categories are residential (`components/internal/screens/maintenance/shared.js:114-137`).
- **No billable services and no tenant quote approval.** The only approval pattern is the owner's (`lib/portal/owner.js:260-302`).

**What's missing**
- Commercial categories: HVAC, after-hours HVAC, access cards and keys, janitorial, signage, loading dock, lot lighting, roof leak.
- Responsibility lookup from the lease (landlord vs tenant).
- Billable services with tenant pre-approval and automatic chargeback on completion.

**How to build**
- *Data model:* none.
  - Property metadata `billableServices: [{ id, name, unit: "hour"|"each", rate }]`.
  - WO metadata `tenantApproval: { status, amount, at, by }` and `responsibility`.
- *Server logic:*
  - `lib/portal/resident.js` `createRequest` takes commercial categories when `variant === "commercial"`.
  - It looks up `responsibilityFor(lease, category)` (COMM-13):
    - **Tenant-responsible:** the request is flagged and the tenant sees guidance.
    - **Billable service:** WO line items are created as billable.
  - New `decideTenantApproval(ctx, id, decision)`, mirroring `decideApproval`.
  - On WO completion with an approved billable amount, the chargeback is created via COMM-01. Posting stays staff-confirmed by default.
- *UI:*
  - The portal request form shows a commercial category set, a requested time window (after-hours), and the quoted price.
  - The portal request detail has "Approve quote".
  - The WO editor shows the responsibility badge and the tenant approval status.
  - A property "Billable services" section (`makeMetaListSection`).
- *Permissions:* none new.

**Steps**
1. Categories and variant.
2. Responsibility lookup.
3. Billable services list.
4. Tenant approval route and UI.
5. Completion → chargeback prompt.

**Research before building**
- Which Angus features matter to a 2–5 storefront landlord. MRI Angus public pages; keep to requests, billing and COI.
- Typical after-hours HVAC billing practice: hourly, with a minimum.

**Acceptance criteria**
- A tenant-responsible request (HVAC under NNN) is flagged and doesn't auto-dispatch.
- A 3-hour after-hours HVAC request at $85/hour shows a $255 quote. The tenant approves it, and on completion the staff "Charge the tenant" action is prefilled with $255.
- Residential requests are unchanged.

**Depends on / unblocks**
- Depends on: COMM-01, COMM-12, COMM-13.
- Unblocks: none.

#### COMM-17 · Equipment register linked to units and work orders
- **MRI equivalent:** Facility Management add-on ("Set up work order … equipment"; "automated work orders, include costs, and equipment"). NETfacilities CMMS asset tracking.
- **Status · priority · effort:** Partial · P3 · M
- **Refs:** Gap 5.5 · Inventory 1.30, 5.18, 5.70, 5.82–5.85 · PMX-5.04, PMX-5.05

**Geiger today**
- **Two incompatible asset lists exist,** both in `record_items` kind `asset`. The gap report does not mention this.
  - **Property and building assets** use `make`, `serviceIntervalMonths`, `lastServicedOn`, `expectedLifeYears` (`components/internal/screens/properties/record_kinds.js:111-148, 277-286`).
  - **Unit assets** use `brand`, `lastServiceOn`, `nextServiceOn` (`components/internal/screens/units/config.jsx:572-597`).
- **Equipment on a WO is free text** (`components/internal/screens/maintenance/sections/wo_general.jsx:178-186`), as is the PM assets list (`components/internal/screens/maintenance/preventive.jsx:200-206`). Work orders have no asset id (`lib/supabase/work_orders.js:11-35`).
- **Expected life is never read** (`record_kinds.js:130`).

**What's missing**
- One register.
- A WO → equipment link with service history.
- Warranty awareness at dispatch.
- Updating last-serviced on completion.
- End-of-life forecasting.

**How to build**
- *Data model:* migration `equipment_register`.
  - Check `to_regclass('property.equipment')` first; fallback `equipment_items`.
  - `property.equipment`: standard columns plus `project_id`, `property_id`, `building_id`, `unit_id`, `name`, `category`, `make`, `model`, `serial_number`, `tag_code`, `location`, `status` (`In service|Needs repair|Out of service|Retired`), `condition`, `installed_on`, `warranty_ends_on`, `warranty_provider`, `service_interval_months`, `last_serviced_on`, `next_service_on`, `replacement_cost`, `expected_life_years`, `fixed_asset_id`. Indexes on `(property_id)`, `(unit_id)` and `(next_service_on) where deleted_at is null`.
  - Idempotent backfill from `record_items where kind='asset'`. Keep the ids. Map `brand→make` and `lastServiceOn→last_serviced_on`, set `property_id` and `unit_id` from `owner_type` and `owner_id`, and use `on conflict (id) do nothing`.
  - `alter table property.work_orders add column if not exists equipment_id uuid` plus an index.
  - Update the demo seed generator.
- *Server logic:* `lib/supabase/equipment.js` (`makeEntityData`). `lib/maintenance/equipment.js` (pure): `nextServiceDue`, `warrantyState` (reuse `expiryState` from `lib/compliance.js:19-26`), and `endOfLife(e)`.
- *UI:*
  - New screen "Equipment" under Maintenance (`sidebar_nav.jsx:130-136`; `registry.jsx`). Tabs:
    - Overview
    - Details
    - Service history (`makeRelatedSection` over WOs by `equipmentId`)
    - PM schedules
    - Documents (manuals, warranty)
    - Photos (nameplate)
  - Property and unit "Assets" tabs switch to a related-equipment section with "Add equipment".
  - WO General "Equipment" becomes a relation picker filtered by unit or property. It patches the existing display keys, so the vendor portal keeps working. A banner reads "Under warranty with {provider} until {date}".
  - The completion wizard (`sections/wo_actions.jsx:279-346`) gets "Update equipment": last serviced, condition, and "Replaced". Replaced retires the old record and creates a new one installed today.
  - Equipment views: "Warranty ending in 90 days" and "End of life in 12 months".
- *Permissions:* none new.

**Steps**
1. Migration with backfill.
2. Data layer.
3. Equipment screen.
4. Replace the two record sections.
5. WO picker and banner.
6. Completion hook.
7. Seed update.

**Research before building**
- Typical useful lives for appliances, water heaters and HVAC, for `expected_life_years` defaults. One source is HUD's useful-life tables used for tenant-damage proration; also manufacturer data.
- Whether `BarcodeDetector` (MDN) is usable on iOS Safari for QR tags in COMM-06, or whether a JS fallback is needed.

**Acceptance criteria**
- After the migration, every former property and unit asset appears once in Equipment with the same id, and old field names are mapped.
- A WO linked to a water heater shows in its service history.
- Completing the WO sets `last_serviced_on`.
- Dispatching a WO for equipment under warranty shows the banner.
- Marking "Replaced" leaves one retired and one active record.

**Depends on / unblocks**
- Depends on: none.
- Unblocks: COMM-18, COMM-20, and equipment in COMM-07 snapshots.

#### COMM-18 · Equipment-driven PM and warranty alerts
- **MRI equivalent:** Facility Management add-on: preventive maintenance tied to equipment.
- **Status · priority · effort:** Missing · P3 · S
- **Refs:** Gap 5.5 · Inventory 5.65, 5.70, 5.83 · PMX-5.06

**Geiger today**
- **The PM "assets" scope lists free-text labels.** Scope options are at `components/internal/screens/maintenance/shared.js:339-344`. Those labels become checklist lines (`lib/maintenance/pm.js:131-137`).
- **The expiring-documents job ignores assets** (`lib/messaging/reminder_jobs.js:340`).

**What's missing**
- PM schedules that reference equipment ids.
- One WO per equipment item carrying `equipment_id`.
- "Create service schedule" from an equipment record.
- Warranty-ending and service-overdue alerts.

**How to build**
- *Data model:*
  - `pm_schedules.metadata.equipmentIds[]` replaces `assets` (read both).
  - Migration `pm_occurrence_equipment_key`: recreate the WO occurrence unique index (`supabase/migrations/20261015212617_maintenance_links_and_turn_ready_date.sql:25-26`) as `(pm_schedule_id, pm_due_date, coalesce(unit_id, '0…0'), coalesce(equipment_id, '0…0'))`. Otherwise 3 property-level furnaces would collide on one key.
- *Server logic:* `buildPmWorkOrders` with scope `assets`:
  - When `equipmentIds` is present, emit one WO per item with `equipmentId`, the unit, and the checklist "Service {name}".
  - The job loads equipment rows in `lib/jobs/preventive_work_orders.js` (as it loads units at `:87-95`).
  - Add `equipmentId` to `toWorkOrderRow`.
- *API routes / jobs:* the expiring-documents job adds equipment `warranty_ends_on` at 60, 30 and 0 days, and service overdue, to the staff digest only.
- *UI:*
  - Equipment action "Create service schedule": prefilled with frequency from `service_interval_months` and opened in Preventive & Recurring.
  - The PM Scope tab's asset list becomes an equipment multi-picker.

**Steps**
1. Builder change with tests.
2. Job loader.
3. Picker.
4. Equipment action.
5. Digest lines.

**Acceptance criteria**
- A semi-annual schedule over 3 property-level furnaces creates 3 WOs each occurrence, each linked to its furnace. Re-running the job creates none.
- Warranty ending in 30 days appears once in the staff digest.

**Depends on / unblocks**
- Depends on: COMM-17, and CORE(0.10) for unattended runs.
- Unblocks: none.

#### COMM-19 · Owner mortgage register and amortization
- **MRI equivalent:** Debt Management: a loan register and amortization engine that adds "the calculated principal and interest payments as journal entries back into your accounting system". Here it is cut down to owners' mortgages; no portfolio debt or covenants.
- **Status · priority · effort:** Missing · P3 · M
- **Refs:** Gap 6.9 · PMX-6.51

**Geiger today**
- **Nothing exists.** A grep for `mortgage|lender|loan` finds nothing in properties, owners or policies.
- **Acquisition fields are saved but unused** (`components/internal/screens/properties/sections/property_tabs.jsx:65-72`).
- **Ledger pieces to reuse:**
  - `buildBill` accepts split lines to any account, and `resolve` does not type-check (`lib/ledger/postings.js:178-181, 262-282`).
  - System accounts are unique per project by `system_key` (`ledger_core.sql:42-44`).

**What's missing**
- A loan record per property and owner.
- An amortization schedule.
- Splitting a payment into interest, principal and escrow when the manager pays it from trust.
- Interest for the owner's annual summary (Schedule E line 12).
- Maturity, balloon and ARM-reset reminders.

**How to build**
- *Data model:* migration `property_loans`.
  - `property.property_loans`: standard columns plus `project_id`, `property_id`, `owner_id`, `lender_name`, `lender_vendor_id`, `loan_number`, `loan_type` (`fixed|arm|interest_only|heloc|seller`), `original_principal`, `interest_rate`, `term_months`, `amortization_months`, `first_payment_date`, `payment_amount`, `escrow_amount`, `maturity_date`, `balloon_date`, `paid_by` (`manager|owner`), `status`. Metadata holds `rateChanges[]`, `extraPayments[]` and `escrowIncludes[]`.
  - Check the name is free.
- *Server logic:*
  - `lib/loans/amortization.js` (pure):
    - `schedule(loan)` returns `[{ n, date, payment, interest, principal, escrow, balance }]`. It handles extra principal, rate changes and interest-only periods.
    - `yearTotals(loan, year)`.
  - System accounts are created on demand by a new `ensureSystemAccounts(keys)` in `lib/supabase/ledger.js` (idempotent via the `system_key` unique index), so `ledger_ensure_default_chart` (`ledger_core.sql:453`) is not redefined:
    - `mortgage_payable` 2500 (Liability)
    - `mortgage_interest` 5900 (Expense, `tax_line` 12)
    - `escrow_deposits` 1300 (Asset)
  - `recordLoanPayment(loan, n)` calls `postBill` with lines interest → 5900, principal → 2500, escrow → 1300. It uses `idempotencyKey: loan:{id}:{n}` and pays through the normal bill payment.
- *API routes / jobs:* the expiring-documents job adds maturity, balloon and ARM-reset dates at 90, 30 and 0 days.
- *UI:*
  - New screen "Loans" under Accounting near Job Costing (`sidebar_nav.jsx:156`). Tabs: Overview (balance, rate, next payment), Schedule (table and CSV), Payments.
  - Property "Loans" related section.
  - Owner portal property card shows lender, balance and rate (read-only).
  - COMM-09's line 12 shows "Mortgage interest (from loan schedule — confirm against lender Form 1098)" when `paid_by = owner`, and the posted figure when the manager pays.
- *Permissions:* `accounting.post` to record payments.

**Steps**
1. Migration.
2. Amortization engine with test vectors.
3. `ensureSystemAccounts`.
4. Screen and schedule.
5. Record-payment action.
6. Reminders.
7. Annual-summary hook.

**Research before building**
- Whether fee managers usually book principal to a liability or treat the whole payment as an owner draw. Check how AppFolio, Buildium and Rentvine handle owner mortgages; public search found no clear answer.
- The Form 1098 boxes owners rely on (https://www.irs.gov/forms-pubs/about-form-1098). Escrow handling for taxes and insurance paid by the lender.

**Acceptance criteria**
- $200,000 at 6.5% over 360 months gives a P&I of $1,264.14. Month 1 interest is $1,083.33 and principal $180.81. The final balance is $0.00 after rounding the last payment.
- A $50 extra principal payment in month 12 shortens the schedule, and the balance matches lender-style calculators.
- Recording payment 1 with $300 escrow posts Dr 5900 $1,083.33, Dr 2500 $180.81, Dr 1300 $300, Cr 2000 $1,564.14. Paying the bill clears AP from trust.
- The annual summary line 12 equals the posted interest for the year.

**Depends on / unblocks**
- Depends on: COMM-08, COMM-09.
- Unblocks: none.

**Open decisions**
1. **Where the loan lives in the books.** Carry the mortgage liability on the property's books (principal to 2500), or keep loans informational and book manager-paid mortgage payments as an owner draw or expense? Recommendation: a liability, but only when the manager pays the mortgage.

#### COMM-20 · Capital improvements and depreciation schedules (owner tax support)
- **MRI equivalent:** Fixed Asset Accounting (Asset4000): depreciation by asset, multi-book, disposals and a "USA Taxation" setup. Here it is cut down to schedules a small landlord's CPA can use.
- **Status · priority · effort:** Partial · P3 · L
- **Refs:** Gap 6.10 · Inventory 6.71, 6.72 · PMX-6.50

**Geiger today**
- **Costs can be capitalized, but there is no register.** Account 1500 "Capital Improvements" has subtype `fixed_asset` (`ledger_core.sql:470`), and job costing marks Asset-type cost lines "Capitalized" (`components/internal/screens/accounting/job_costing.jsx:35, 105`).
- **The property purchase date and price are saved but unused** (`property_tabs.jsx:65-72`).
- **No depreciation anywhere:** a grep for `depreciat|amortiz|useful life` finds nothing.

**What small landlords need (and what to build)**
- **Building basis:** purchase price plus closing costs, minus land value, with a placed-in-service date.
- **Improvements register:** each improvement with cost, date and class:
  - 27.5-year straight-line, mid-month, for residential rental structures and their components (roof, HVAC)
  - 39-year for nonresidential
  - 15-year 150% declining balance, half-year, for land improvements
  - 5-year 200% declining balance for appliances, carpet and furniture in residential rentals
- **Per-asset annual depreciation** for Form 4562 and Schedule E line 18, plus a disposal year.
- **Mixed-use rule:** a building is "residential rental property" only if at least 80% of gross rents come from dwelling units (IRC §168(e)(2)(A)); otherwise it is 39-year property. Geiger can compute that ratio from the ledger by lease type.
- **Report-only by default.** Posting depreciation into a trust ledger would distort owner cash statements.

**How to build**
- *Data model:* migration `fixed_assets`.
  - `property.fixed_assets`: standard columns plus `project_id`, `property_id`, `unit_id`, `owner_id`, `equipment_id`, `cost_job_id`, `bill_id`, `name`, `asset_class` (`building_27_5|building_39|improvement_27_5|improvement_39|land_improvement_15|personal_5|personal_7|land`), `method` (`SL|200DB|150DB`), `convention` (`mid_month|half_year|mid_quarter`), `recovery_years`, `placed_in_service_on`, `cost_basis`, `land_value`, `bonus_pct`, `section179_amount`, `prior_depreciation`, `disposed_on`, `disposal_proceeds`, `status`.
  - Check the name is free; fallback `capital_assets`.
- *Server logic:* `lib/depreciation/macrs.js` (pure):
  - `annualDepreciation(asset, year)` and `scheduleOf(asset)`.
  - Rates are the IRS Pub 946 Appendix A percentage tables (A-1, A-6, A-7a; A-2 to A-5 for mid-quarter), stored as data. Partial-year disposal follows the convention rules.
  - Use the formula (declining balance switching to straight-line) only for classes without a table.
  - `classify(category, buildingUse)` suggests a class.
  - `residentialShare(propertyId, year)` reads rents by lease type from ledger lines, for the 80% test.
- *UI:*
  - New screen "Fixed Assets" under Accounting. Views by property, owner, year, and disposed.
  - Asset editor with a Schedule tab.
  - An "Add to fixed assets" prompt when a bill or job line posts to a `fixed_asset` account (`bills.jsx`, `job_costing.jsx`), prefilled with cost, date and equipment link (COMM-17).
  - Property Acquisition section action "Set up building basis".
  - Staff report "Depreciation schedule" (owner and year, CSV in Form 4562-like columns).
  - COMM-09 line 18 reads it, labelled "Prepared for your tax advisor".
  - Help text on de minimis ($2,500 per item or invoice) and the routine-maintenance and small-taxpayer safe harbors. The expensing decision stays with the owner and CPA.
- *Permissions:* `accounting.post` to edit. Viewing follows `view.fixed_assets`.

**Steps**
1. Migration.
2. MACRS engine with IRS table test vectors.
3. Screen and editor.
4. Building basis action.
5. Capitalization prompt.
6. Report and annual-summary hook.
7. Mixed-use 80% check banner.

**Research before building**
- Pub 946 tables and conventions (https://www.irs.gov/publications/p946); Pub 527 rental specifics (https://www.irs.gov/publications/p527); Form 4562 instructions (https://www.irs.gov/instructions/i4562).
- 100% bonus depreciation for property acquired after 19 Jan 2025 (OBBBA), and its limit to recovery periods of 20 years or less. Verify against IRS guidance (secondary summary: https://www.bdo.com/insights/tax/one-big-beautiful-bill-act-expands-100-depreciation-expensing-opportunities).
- Section 179 limits for residential rentals (lodging exclusion) vs qualified improvements to nonresidential property.
- Tangible property regulations safe harbors (https://www.irs.gov/businesses/small-businesses-self-employed/tangible-property-final-regulations).
- Whether competing PM tools offer depreciation at all; public search found none. If not, this is a differentiator; keep its scope small.

**Acceptance criteria**
- A $275,000 residential building basis placed in service in January depreciates $9,583.75 in year 1 (Table A-6, 3.485%) and $9,999.00 in year 2 (3.636%). Every later year matches Table A-6 to the cent, and the schedule sums to the basis. The engine is table-driven, as tax software is.
- A $39,000 nonresidential improvement placed in service in January gives $959.79 in year 1 (2.461%).
- A $1,000 appliance on 5-year 200% declining balance, half-year, gives 200, 320, 192, 115.20, 115.20, 57.60.
- A disposal mid-year applies the convention.
- A mixed-use property with 25% of rents from commercial leases is flagged "below 80% residential — 39-year".
- No ledger entry is created unless the posting option is turned on.

**Depends on / unblocks**
- Depends on: COMM-08, COMM-09, and COMM-17 (optional equipment link).
- Unblocks: none.

**Open decisions**
1. **Ledger posting.** Keep depreciation report-only (recommended), or offer optional posting (Dr Depreciation expense / Cr Accumulated depreciation) to property books?
2. **Tax-advice disclaimer.** Agree the disclaimer wording.

### Not building here
| MRI product | Why not | Revisit trigger |
|---|---|---|
| ProLease / ProCalc (occupier lease admin, ASC 842 / IFRS 16 / GASB 87) | Serves corporate tenants accounting for leases they hold. Geiger's buyer is the landlord. | A customer asks to track leases they rent *as tenant*, e.g. an office HQ, with lease-accounting entries. |
| ManhattanONE, Workplace Central, Space Scheduling (IWMS, desk/room booking) | Corporate workplace tools. Residential managers book amenities, which Geiger already has. | A mixed-use customer runs a coworking or flex-office floor needing desk booking. |
| MRI Energy (eSight) | UK enterprise energy management. Geiger has meters and RUBS. | A customer must file a US building benchmarking report (e.g. NYC LL97, Boston BERDO) and asks for utility data aggregation. |
| OnLocation (presence, visitor, footfall, sales ingestion) | Workplace safety and retail footfall analytics; irrelevant to 10–500-unit residential. | Package or visitor management demand (gap 4.8) grows into a visitor-log requirement. |
| Asset4000 enterprise and Project4000 (multi-book, revaluations, 25 analysis levels) | COMM-20 covers US tax schedules for owners; multi-book and IFRS are corporate. | A customer needs GAAP book plus tax book for an owner entity, or capital project tracking beyond CORE(6.13) job cost. |
| Investment Accounting (investor ledgers, capital calls, waterfalls) | Syndicator and fund accounting; Geiger's owners are individuals or LLCs with ownership percentages. | A customer manages syndications needing preferred return or waterfall distributions. |
| Asset Modeling, Fund Modeling, Valuations (DCF) | Institutional underwriting; owners use spreadsheets or brokers. | Owners ask for hold/sell analysis in the portal. Consider a simple cap-rate valuation card first. |
| Debt Management (enterprise: covenants, hedges, portfolio debt) | COMM-19 covers owner mortgages only. | A customer reports lender covenants (DSCR) across a portfolio. |
| Investment Central (asset management, LIHTC portfolios) | LIHTC and asset-management workflows are affordable/institutional; affordable is Skip (gap 8.1). | Geiger enters affordable housing (HOUS scope change). |
| Investor Connect (enterprise: K-1s, subscriptions, SSO) | COMM-09 and COMM-10 cover owner reporting lite; K-1s belong to partnership accounting. | Syndication customers (see Investment Accounting row). |
| Lease Flow (commercial leasing CRM and deal modelling) | Commercial deal pipelines are broker-scale; Geiger's prospect pipeline covers storefront vacancies. | Customers with more than about 10 commercial units ask for deal or LOI tracking. |
| Findspace (marketing listings, product not researched) | Not researched in the MRI notes; commercial listing is not the buyer's need. | Listing syndication (LEAS 2.3) is built and commercial listings are requested. |
| Engage @Work (enterprise commercial portal across mixed tech stacks) | COMM-12 gives commercial tenants a portal mode; a multi-system office portal is out of market. | Office-building customers with multi-tenant amenities and communications. |
| Advanced Retail (enterprise: sales ingestion, breakpoints, co-tenancy) | Percentage rent and CAM depth for storefronts belong to CORE. Mall-scale sales analytics and co-tenancy are out of market. | A customer manages a strip center with 10 or more retail tenants on percentage rent. |
| MRI Angus (enterprise building operations), Evolution (CAFM), NETfacilities (CMMS) | Geiger's maintenance already covers WOs, PM, turns and inventory. COMM-16 and COMM-17 add the Angus and CMMS slices this buyer needs. | Office or industrial buildings needing BMS or IoT work-order triggers or a CAFM floor-plan-based asset model. |
| Contract Intelligence (AI lease abstraction) | No AI now (standing decision). COMM-13 builds the manual abstract and a `_sources` hook. | The suite AI package ships (PLAT AI item). |
