# 4. Affordable, regulated, condo and HOA housing

### Scope
- **MRI products covered:** MRI Affordable Housing (HUD multifamily, LIHTC, HOME, USDA RD compliance; TRACS; certifications; subsidy accounting), PHA Pro / Voucher Management / WaitListCheck (housing-authority software), the DHCR module (NYC rent stabilization), Jenark / CondoPlus / Condo Sales / DuesPayment (associations).
- **Geiger areas touched:** ledger (`lib/ledger/*`, default chart RPC), financial jobs (`lib/jobs/financial.js`), Leasing (lease Terms and Money tabs, Renewals, Inspections, Notices), People (a new Housing Authorities screen), Properties ("Regulation & programs" and "Association" tabs), Legal Resources, Reports, resident portal, RBAC catalog.
- **Market call:** Full affordable-housing compliance and housing-authority software are out of scope. They are enterprise purchases, need HUD certification, and incumbents are entrenched (see "Not building here"). Two things are in scope because small US landlords hit them every month:
  - **Housing Choice Voucher (Section 8) tenants:** split billing between the tenant and the housing authority (HOUS-01–06).
  - **Rent-increase caps and notice periods:** checked against a rule table the user maintains, never against hard-coded law (HOUS-07–12).
- **Condo/HOA:** Geiger keeps a landlord's own obligations to an external HOA (HOUS-13). Whether to manage associations at all is an open decision (HOUS-15–19).

### Summary
| ID | Feature | MRI product | Geiger today | Priority | Effort |
|---|---|---|---|---|---|
| HOUS-01 | Voucher split billing: tenant share vs housing-assistance receivable | Affordable Housing (subsidy accounting) | **Done** — 'your share' email copy needs a geiger-dash template edit (2026-11-08) | P1 | M |
| HOUS-02 | Housing authorities as payers (directory and contacts) | PHA Pro (landlord side), Affordable Housing | Saved-unused | P2 | S |
| HOUS-03 | HAP contracts with effective-dated rent splits and retroactive changes | Affordable Housing | Saved-unused | P2 | M |
| HOUS-04 | HAP payment receipt and reconciliation | Affordable Housing (HAP Reconciliation Wizard) | Missing | P2 | M |
| HOUS-05 | Housing-authority inspections (HQS / NSPIRE-V) and HAP abatements | PHA Pro (inspections), Affordable Housing | Missing | P2 | M |
| HOUS-06 | Voucher reminders, rent-roll split and Housing Assistance report | Affordable Housing | Missing | P2 | S |
| HOUS-07 | Jurisdiction rule table, user-maintained, linked to Legal Resources | DHCR; PMX calculated deposits | Missing | P2 | M |
| HOUS-08 | Rule applicability per property and unit (exemptions) | DHCR | Saved-unused | P2 | S |
| HOUS-09 | Rent change log per tenancy | DHCR (legal rent history) | Missing | P2 | S |
| HOUS-10 | Rent-increase cap checks on renewals, escalations and amendments | DHCR | Missing | P2 | M |
| HOUS-11 | Notice periods and rent-increase notices | DHCR (renewal letters) | Partial | P2 | S |
| HOUS-12 | Shared rule kinds: deposit caps (CORE) and source of income (RISK) | PMX calculated deposits | Missing | P2 | S |
| HOUS-13 | Rented-condo association obligations (dues, minimum term, board approval) | CondoPlus (sublet screening) | Saved-unused | P2 | S |
| HOUS-14 | NYC rent stabilization, minimal (recommend deferring) | DHCR | Missing | P3 | M |
| HOUS-15 | Association foundation: managed associations, homeowners, association books | Jenark, CondoPlus | Missing | P3 | L |
| HOUS-16 | Assessments and dues billing, online dues payments | Jenark, DuesPayment | Missing | P3 | L |
| HOUS-17 | Reserve funds and association budgets | Jenark, CondoPlus | Missing | P3 | M |
| HOUS-18 | Violations and fines, architectural requests, board approvals | Jenark, CondoPlus | Missing | P3 | L |
| HOUS-19 | Homeowner and board portals | Jenark, CondoPlus | Missing | P3 | M |

### Build order
1. **HOUS-01**: fixes a live correctness bug. Geiger shows a tenant portion, then bills the full rent.
   - **Coordinate:** the split must live in the single rent-posting path that the CORE item for gap 0.1 (billing source of truth, in CORE-01–39) creates.
   - **Interim:** if that item hasn't landed, patch `lib/jobs/financial.js:189-225` directly.
2. **HOUS-02 → 03 → 04 → 05 → 06**: the voucher workflow, in dependency order (payer → contract and terms → remittance → abatements → reminders and reports).
   - HOUS-05 links to COMM's inspection work (gap 5.3: templates, findings → work orders).
3. **HOUS-07 → 08 → 09 → 10 → 11**: rule table → applicability → history → checks → notices.
   - HOUS-10 hooks into LEAS renewals (gap 2.12, bulk offers) and LEAS amendments (gap 2.13). Ship HOUS-10 before or with those LEAS items, so new rent-changing flows call the check from day one.
4. **HOUS-12**: gives CORE (gap 3.10, calculated deposits) and RISK (screening criteria, source-of-income rules) one place to read jurisdiction limits. Build it right after HOUS-07, even if HOUS-08–11 slip.
5. **HOUS-13**: small. It wires fields already on the property. Its dues bill uses recurring bills (CORE-40+, gap 6.44) when present.
6. **HOUS-14**: only if a NYC rent-stabilized customer appears.
7. **HOUS-15 → 19**: only if the user decides to enter the association market.
   - Needs CORE-40+ entities (gap 1.1), so each association keeps its own books.
   - Needs PLAT-01 before any homeowner or board portal goes live.

### Items

#### HOUS-01 · Voucher split billing: tenant share vs housing-assistance receivable
- **MRI equivalent:** MRI Affordable Housing (PMX add-on). Covers subsidy accounting, HAP payment posting and third-party assistance, and keeps subsidy charge codes out of the move-out deposit statement (SODA).
- **Status · priority · effort:** Broken · P1 · M
- **Refs:** Gap 8.1 · Inventory 8.1, 8.2, 8.3, 8.4, 8.5 · PMX-8.04

**Geiger today**
- **Lease fields:** the lease Terms tab has a "Housing assistance" block (`components/internal/screens/leasing/config.jsx:140-150`) with three fields: `subsidized`, `subsidyProgram` and `hapAmount`. A read-only "Tenant portion" shows `rent − hapAmount`. That formatter (`:149`) is the only code that reads `hapAmount`.
- **Billing:** rent posting charges the full `rent_accounts.rent` to the tenant (`lib/jobs/financial.js:189-225`). There is no housing-authority party and no separate receivable.
- **Late fees:** percent late fees use the full `lease.rent` (`lib/jobs/financial.js:295`). For a voucher tenant this overcharges. *(New finding; not in the inventory.)*
- **Resident portal:** it shows the full `l.rent` (`lib/portal/resident.js:56`).
- **Renewals drop the subsidy:** `CARRY_META` (`lib/leasing/workflows.js:167-178`) leaves out `subsidized`, `subsidyProgram` and `hapAmount`. So `acceptRenewal` (`:183-240`) creates an unsubsidized lease. *(New finding.)*
- **Duplicate unread fields:**
  - Tenant: `subsidized`, `subsidyProgram`, `subsidyAmount` (`components/internal/screens/tenants/config.jsx:148-150`)
  - Application: `voucher`, `voucherAmount` (`components/internal/screens/marketing/sections/application_sections.jsx:125-126`)
- **Property labels:** "Affordable program" offers LIHTC and "Section 8 project-based" (`components/internal/screens/properties/sections/property_tabs.jsx:229-231`). These are labels only.
- **Ledger:** there is one receivable system account, `accounts_receivable` (`supabase/migrations/20261015212744_ledger_core.sql:469`). The `buildCharge`, `buildPayment` and `buildCredit` builders hard-code it (`lib/ledger/postings.js:204-260`).
- **Marketing:** a grep for "section 8", "affordable", "voucher", "rent control", "HOA" and "LIHTC" over `components/landing`, `app/page.js` and `README.md` finds no claim today.

**What's missing**
- A housing-authority receivable separate from tenant AR, so the tenant's balance, portal, autopay, late fees and deposit disposition see only the tenant's share.
- A way to record a housing-authority payment against the HAP share.
- Carrying the subsidy across renewals.
- Copy that cannot be read as a compliance claim.

**How to build**
- *Data model:* migration `npm run db:new -- housing_assistance_ledger`.
  - Redefine `property.ledger_ensure_default_chart` (owned by `20261015212744_ledger_core.sql:453-495`). The header comment must say ownership moves, as `20261015212915_ledger_post_line_dimensions.sql` did for `ledger_post`.
  - Add two rows:
    - `('subsidy_receivable','1220','Housing Assistance Receivable','Asset','subsidy_receivable',false,null)`
    - `('hap_abatements','4055','HAP Abatements','Income','contra_income',false,null)`
  - `@down` restores the previous body.
  - No data backfill and no new tables.
  - If another plan item also redefines this function, merge both into one migration.
- *Server logic:*
  - `lib/ledger/store.js:9-22`: add `subsidy_receivable` to `REQUIRED_KEYS`, so `loadAccountIndex` seeds it lazily.
  - `lib/ledger/postings.js`:
    - `buildCharge`, `buildPayment` and `buildCredit` take `input.arKey` (default `accounts_receivable`).
    - Add `buildHapCharge(input, acct)`. It uses `arKey: "subsidy_receivable"`, sets no `tenantId` (lines get `tenant_id` null), keeps `leaseId`/`unitId`/`propertyId`/`ownerId`, and writes `metadata: { payer: "housing_authority", housingAuthorityId?, hapContractId?, period }`. Register it in `BUILDERS` (`:453`).
    - `summarize` (`:473`): add a `subsidyReceivable` bucket.
    - `SCOPE_FOCUS` (`:576-585`): add `lease_subsidy: { subtypes: ["subsidy_receivable"], sign: 1, label: "Housing authority balance" }`.
  - New `lib/housing/hap.js` (pure, no I/O):
    - `rentSplit(lease, hapIndex, date)` → `{ total, tenant, hap, source: "lease"|"contract", contractId, termId, abated }`
    - `tenantShare(lease, hapIndex, date)`
    - In HOUS-01, `hapIndex` is empty and the split reads `lease.metadata.subsidized` / `hapAmount`. HOUS-03 swaps in contract terms behind the same signature, so callers never change.
  - `lib/jobs/financial.js`:
    - Rent loop (`:189-225`): batch-load the rent accounts' leases with `byIds` (`:66`). Post the tenant share under the existing `rent:<account>:<yyyy-mm>` key. Post the HAP share via `buildHapCharge` under `hap:<leaseId>:<yyyy-mm>`. Keep that key format permanently so later items never double-post.
    - Late fees (`:295`): the base becomes `tenantShare(...)`.
    - If CORE's gap-0.1 item has moved rent posting, make the same change in its single rent-posting function.
  - `lib/supabase/ledger.js:248` `listOpenCharges`: accept `subtype`.
  - `lib/portal/resident.js:56`: `rent` = tenant share. Add `assistance: { hap }` so the portal can say "Your share".
  - `lib/leasing/workflows.js:167-178`: add `subsidized`, `subsidyProgram` and `hapAmount` to `CARRY_META`.
- *API routes / jobs:* none new. The existing recurring-charges job (`recurringChargesJob`, `lib/jobs/financial.js:492`) does the split.
- *UI:*
  - Lease Ledger tab (`makeLedgerSection`, `components/internal/screens/accounting/ledger_section.jsx:332`): a "Tenant / Housing authority" segmented toggle when the lease is subsidized. The housing-authority view uses scope `lease_subsidy`.
  - `PostEntryDialog` (`components/internal/screens/accounting/ledger_dialogs.jsx:203`), payment kind: a "Paid by" select (Tenant / Housing authority) on subsidized leases. Housing authority → `arKey` is the subsidy receivable, and its open items are listed.
  - Lease fields (`leasing/config.jsx:140-150`):
    - Rename "Subsidized (e.g. Section 8)" → "Housing Choice Voucher / rental assistance".
    - Add the hint: "The tenant is billed the tenant portion; the assistance portion is billed to the housing authority."
  - Tenant fields (`tenants/config.jsx:148-150`): replace them with a read-only summary from the tenant's live lease, so there is one source.
  - Property "Affordable program" (`property_tabs.jsx:229`): add the hint "For your records only. Geiger does not run LIHTC, HUD or HOME compliance."
- *Permissions:* existing `accounting.post`.
- *Integrations:* none.

**Marketing guardrails**

| May claim | May not claim |
|---|---|
| "Bill voucher (Section 8) tenants their share and the housing authority the rest" | "HUD compliant", "HUD-approved", "affordable housing compliance" |
| "Track HAP contracts, HAP payments, inspections and abatements" | "LIHTC", "TRACS", "income certification", "recertification", "50059/50058" |
| "Rent-increase checks against the rules you set" | "Rent-control compliance", "always legal", "automatically up to date with the law" |

**Steps**
1. Migration; extend `REQUIRED_KEYS`.
2. `arKey` in the builders; `buildHapCharge`; `summarize` and `SCOPE_FOCUS`.
3. `lib/housing/hap.js`.
4. Job split and late-fee base.
5. Portal rent and `CARRY_META`.
6. Ledger toggle and "Paid by" in the payment dialog.
7. Field relabels and the read-only tenant summary.
8. Copy review against the guardrails table.
9. Verify on demo project `ebcc7910` with "Run now".

**Research before building**
- 24 CFR 982.451 (HAP payments; no side payments; who owes late fees) and 982.308/982.309 (rent to owner, initial term): https://www.ecfr.gov/current/title-24/subtitle-B/chapter-IX/part-982. Confirm that an owner may not charge the family more than the PHA-approved tenant rent, and that late fees apply only to the family's share.
- How Buildium, AppFolio, Rentec Direct and DoorLoop present Section 8 split rent (separate payer vs split charge), so the UX matches what switchers expect.
- Accounting basis: whether small landlords expect HAP accrued monthly or recorded on receipt (see Open decisions).

**Acceptance criteria**
- **Split posting:** lease rent 1,500, subsidized, `hapAmount` 1,100. "Run now" posts:
  - a tenant charge of 400 (AR 1200, `tenant_id` set)
  - a HAP charge of 1,100 (account 1210, `tenant_id` null, `lease_id` set)
  - A second run posts nothing. `ledgerHealth` reports 0 unbalanced entries.
- **Totals:** trial balance AR + Housing Assistance Receivable = 1,500 for the month; Rental Income = 1,500.
- **Tenant-facing balances:** portal balance 400; an autopay plan charges 400; the delinquency and rent-roll balances show 400 owed until the tenant pays.
- **Late fees:** a 5% percent-type fee assesses 20, not 75. An unpaid HAP charge never triggers a tenant late fee.
- **Housing-authority payment:** a 1,100 payment with "Paid by: Housing authority" leaves Housing Assistance Receivable open at 0 and the tenant's balance unchanged.
- **Edge cases:**
  - `hapAmount` ≥ rent → no tenant charge; HAP = rent.
  - `hapAmount` blank or `subsidized` off → behaves exactly as today.
- **Renewal:** accepting a renewal keeps `subsidized` and `hapAmount` on the new lease.
- **Move-out:** the deposit disposition never applies the deposit to open HAP (`buildDepositReturn` uses `accounts_receivable` only).
- **Copy:** a grep of landing, README and in-app copy finds none of the "may not claim" phrases.

**Depends on / unblocks**
- Depends on: the CORE item for gap 0.1 (billing source of truth, CORE-01–39); PLAT-01 (ledger RPCs are granted to `anon` today).
- Unblocks: HOUS-02–06; RISK's voucher income check (via HOUS-12).

**Open decisions**
- Accrue HAP monthly (recommended: missing HAP shows as an open receivable), or record HAP only when it arrives (simpler, but a short-paid month is invisible)?

#### HOUS-02 · Housing authorities as payers
- **MRI equivalent:** PHA Pro (landlord records, landlord portal, direct deposit) seen from the owner side; Affordable Housing third-party assistance.
- **Status · priority · effort:** Saved-unused · P2 · S
- **Refs:** Gap 8.1 · Inventory 8.2 (`subsidyProgram` is free text)

**Geiger today** — The housing authority is a free-text "Program / housing authority" field on the lease (`components/internal/screens/leasing/config.jsx:142`) and the tenant (`components/internal/screens/tenants/config.jsx:149`). There is no record, contact list or balance. People screens exist for Tenants, Owners and Vendors only (`components/internal/sidebar/sidebar_nav.jsx:120-127`).

**What's missing** — A housing-authority (PHA) record that acts as a payer. It needs:
- PHA code and payment details
- contacts (HAP specialist, inspector, landlord liaison)
- landlord-portal link
- inspection standard
- a balance across all its contracts

**How to build**
- *Data model:* migration `npm run db:new -- housing_authorities --template table`.
  - Table `property.housing_authorities`, with the standard columns and `project_id`:
    - identity and contact: `name`, `pha_code`, `status` (default `'Active'`), `email`, `phone`, `address`, `website`
    - payments: `landlord_portal_url`, `payment_method` (`'ACH'`/`'Check'`), `payment_day int`, `landlord_reference` (the landlord's ID at the PHA)
    - `inspection_standard` (`'HQS'`/`'NSPIRE-V'`; null = derive by date, see HOUS-05)
  - Index `(project_id) where deleted_at is null`. RLS is demo-open per the current convention; PLAT-01 tightens it.
  - Contacts are `record_items` with `owner_type 'housing_authority'`, `kind 'contact'` and `metadata.role`.
  - Before `db:push`, confirm the name is unused on the live DB (orphan tables): `select to_regclass('property.housing_authorities')`.
- *Server logic:*
  - `lib/supabase/housing_authorities.js` via `makeEntityData` (`lib/supabase/entity_factory.js:16`).
  - `pickHousingAuthority()` options loader for relation fields.
- *UI:*
  - New `components/internal/screens/housing_authorities/{config.jsx,housing_authorities.jsx}`, following `components/internal/screens/owners/`.
  - Register "Housing Authorities" in `components/internal/screens/registry.jsx` and add `{ title: "Housing Authorities", icon: Landmark }` to the People group in `sidebar_nav.jsx:120-127`.
  - Tabs:
    - Overview: KPIs for active contracts, expected HAP this month, received and open
    - Details
    - Contacts: `makeChildRecordsSection` with `recordItemsAdapter("contact")`, as in `owners/config.jsx:427`
    - Contracts (HOUS-03), Remittances (HOUS-04), Ledger (HOUS-04)
  - On the lease, `subsidyProgram` becomes a relation to `housingAuthorityId`, keeping the text as a fallback label.
- *Permissions:*
  - Add `housing.manage` ("Manage housing assistance", group "Housing assistance", `inherits: "view.leases"`) to `lib/rbac.js:4`.
  - The nav key is derived: `view.housing_authorities`.

**Steps**
1. Migration and data layer.
2. Screen, registry and nav.
3. Lease relation field.
4. Contacts section.

**Research before building**
- HUD PHA codes (two-letter state + three digits) and where landlords see them (HUD PHA contact list): https://www.hud.gov/contactus/public-housing-contacts. hud.gov blocks bots; open it in a browser.

**Acceptance criteria**
- Create a PHA with two contacts; link a lease to it; the lease Terms tab shows the PHA name.
- List with search, empty and filtered-empty states; soft delete hides it from pickers.
- A role without `housing.manage` sees the screen read-only.

**Depends on / unblocks** — Depends on HOUS-01. Unblocks HOUS-03, HOUS-04.

#### HOUS-03 · HAP contracts with effective-dated rent splits and retroactive changes
- **MRI equivalent:** Affordable Housing. It records contract rent, assistance and tenant rent per certification, auto-corrects for retroactive certifications, and maps special claims to contracts.
- **Status · priority · effort:** Saved-unused · P2 · M
- **Refs:** Gap 8.1 · Inventory 8.2, 8.5 · PMX-8.02 (retro corrections only), PMX-8.04

**Geiger today**
- One `hapAmount` per lease, with no history (`leasing/config.jsx:143`). A reexamination or a rent change overwrites it.
- Billing can't tell what the tenant owed in a past month.
- No HAP contract number, contract dates, caseworker, reexam date or program type.

**What's missing**
- A HAP contract per lease: housing authority, program, contract number, start and end dates, status.
- Effective-dated terms (contract rent = HAP + tenant rent), each with a reason: initial, rent increase, annual or interim reexam, correction.
- Owner rent-increase requests to the PHA. They need 60 days' notice and are subject to the PHA's rent-reasonableness review. Track them as `requested` → `approved`/`denied`.
- Retroactive adjustments when the PHA processes a change late.

**How to build**
- *Data model:* migration `npm run db:new -- hap_contracts --template table`. Two tables, standard columns plus `project_id`:
  - `property.hap_contracts`:
    - links: `housing_authority_id`, `lease_id`, `tenant_id`, `unit_id`, `property_id`
    - contract: `name`, `program` (`hcv|pbv|vash|mainstream|other`), `contract_number`, `status` (`Pending|Active|Ended|Terminated`), `starts_on`, `ends_on`, `payment_day int`
    - dates and caseworker: `next_reexam_on`, `next_inspection_on`, `caseworker_name`, `caseworker_email`, `caseworker_phone`
    - Indexes: `(lease_id)`, `(housing_authority_id)`, `(project_id, status)`
  - `property.hap_contract_terms`:
    - columns: `hap_contract_id not null`, `effective_from date not null`, `contract_rent numeric(12,2)`, `hap_amount numeric(12,2)`, `tenant_rent numeric(12,2)`, `utility_allowance numeric(12,2)` (info only), `reason text` (`initial|rent_increase|annual_reexam|interim_reexam|correction`), `status text default 'approved'` (`requested|approved|denied`), `requested_on`, `notice_received_on`, `document_id`
    - `check (abs(contract_rent - hap_amount - tenant_rent) < 0.01)`
    - unique `(hap_contract_id, effective_from) where deleted_at is null and status = 'approved'`
  - Confirm both names are unused on the live DB first.
- *Server logic:*
  - Data layers: `lib/supabase/hap_contracts.js`, `lib/supabase/hap_contract_terms.js` (`makeEntityData`).
  - `lib/housing/hap.js`:
    - `loadHapIndex(sb, projectId)` (server and browser) → maps of contracts by lease, approved terms sorted by date, and abatements (HOUS-05).
    - `rentSplit` reads the approved term in force on the due date; it falls back to lease metadata when there is no contract.
    - `retroDeltas(contract, terms, postedCharges)` → per-month `{ period, tenantDelta, hapDelta }` for months already billed under an older term.
  - `lib/housing/workflows.js`:
    - `setUpHapContract(lease, v)` pre-fills from `lease.metadata.hapAmount` and `subsidyProgram`.
    - `applyRetroChange(term)` posts the deltas:
      - tenant: `buildCharge`, or `buildCredit` against `rent_income`, keyed `hapadj:<termId>:<yyyy-mm>:t`
      - HAP: `buildHapCharge`, or `buildCredit` with `arKey` subsidy, keyed `hapadj:<termId>:<yyyy-mm>:h`
  - `acceptRenewal` (`lib/leasing/workflows.js:183`): re-point the Active contract to the new lease (update `lease_id`). Contracts survive a renewal unless the PHA issues a new one.
- *API routes / jobs:* the rent split in the recurring-charges job reads `loadHapIndex` (one query per project per run).
- *UI:*
  - Lease editor: a "Housing Assistance" tab in the Money group (`leasing/config.jsx:326-339`), icon `HandCoins`, `showIf` subsidized. It holds:
    - contract card (`FieldsForm`)
    - terms table (`makeChildRecordsSection` over `childLayerAdapter`), with a "Request rent increase" action that creates a `requested` term and shows the 60-day PHA notice date
    - HAP ledger mini-view (scope `lease_subsidy`)
  - Wizards:
    - "Set up HAP contract" on subsidized leases with no contract.
    - "Apply change retroactively" when a new approved term's `effective_from` is before the last billed period. It previews the deltas per month before posting.
  - After a contract exists, the Terms-tab `hapAmount` becomes read-only from the current term.
  - When an approved `contract_rent` ≠ `lease.rent`, show a banner and an "Update lease rent" action through CORE's rent-change path; HOUS-09 logs it.
  - The offer-renewal wizard (`leasing/lease_actions.jsx:192-248`) gets a "Housing authority" step on subsidized leases. It creates the `requested` term and reminds the user that no increase is allowed in the initial term (HOUS-10 enforces this).
- *Permissions:* `housing.manage` edits contracts and terms; posting deltas needs `accounting.post`.

**Steps**
1. Migration and layers.
2. `loadHapIndex` and the term-based `rentSplit`.
3. Lease tab and set-up wizard.
4. Renewal re-pointing.
5. Retro preview and post.
6. Lease-rent mismatch banner.

**Research before building**
- HUD-52641 (HAP contract) and HUD-52641-A (tenancy addendum), current versions on HUD's forms page. Which fields belong on the contract record?
- 24 CFR 982.308(g)(4) (60-day owner notice and rent reasonableness); 982.309 (no rent increase in the initial term).
- How PHAs notify owners of reexam changes (HAP change notice, "HAP contract amendment"). Is the effective date always the first of a month? Check two or three PHA admin plans (San Diego County, Houston HA).

**Acceptance criteria**
- **Term switch:** two approved terms, `{2026-01-01: tenant 400, HAP 1,100}` and `{2026-06-01: tenant 250, HAP 1,250}`. Billing June posts tenant 250 and HAP 1,250; May stays at 400/1,100.
- **Retro change:** entering the June term on July 10 (May and June already billed). The preview shows June only; posting gives a tenant credit of 150 and a HAP charge of 150. Rerunning posts nothing.
- **Request lifecycle:** a `requested` term never affects billing until it is approved.
- **Integrity:** the DB check rejects a term where contract_rent ≠ HAP + tenant rent.
- **Renewal:** accepting a renewal keeps the Active contract attached to the new lease.

**Depends on / unblocks** — Depends on HOUS-01, HOUS-02; CORE-01 (gap 0.1) (rent-change path). Unblocks HOUS-04, HOUS-05, HOUS-06, HOUS-10 (HCV rules).

#### HOUS-04 · HAP payment receipt and reconciliation
- **MRI equivalent:** Affordable Housing. "Subsidy accounting for HAP Reconciliation and payment posting" (HAP Reconciliation Wizard, X.5.9).
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gap 8.1 · Inventory 8.5 · PMX-8.04

**Geiger today** — After HOUS-01, a HAP payment can be posted one lease at a time. But a PHA pays one ACH deposit for all its tenants, with a remittance list. Nothing records that deposit, splits it across leases or flags short payments.

**What's missing**
- A remittance record: PHA, date, amount, bank account, ACH trace or check number, attached remittance file.
- Allocation across the PHA's contracts, pre-filled with the expected HAP.
- Short-pay and over-pay handling.
- Expected vs received per PHA per month; HAP aging.
- Bank reconciliation that clears the whole deposit at once.

**How to build**
- *Data model:* migration `npm run db:new -- hap_remittances --template table`.
  - `property.hap_remittances`: `housing_authority_id`, `received_on date`, `amount numeric(12,2)`, `bank_account_id`, `reference`, `period text` (`yyyy-mm`), `status` (`Posted|Partially posted|Void`), `document_id`, `unapplied numeric(12,2) default 0`, standard columns.
  - Index `(housing_authority_id, received_on)`.
- *Server logic:* `lib/housing/remittances.js`, `recordHapRemittance({ projectId, remittance, allocations })`:
  - Writes one ledger entry per lease allocation via `buildPayment` with `arKey: "subsidy_receivable"`.
  - Each entry carries `ownerOf(property)`, so owner trust positions stay right when one deposit covers several owners.
  - Each entry has `metadata.hapRemittanceId`, `sourceId` = remittance id, and idempotency key `hapr:<remittanceId>:<leaseId>`.
  - Retrying is safe; the status reflects partial success.
  - Over-payment: allowed only when assigned to a lease. It becomes that lease's unapplied HAP credit via the builder's "Unapplied credit" line.
  - Short-pay: the item stays open, or the user marks it "abated" → HOUS-05 credit.
  - `voidHapRemittance(id)` voids all its entries (`lib/ledger/store.js:62`).
- *API routes:* `app/api/housing/remittances/route.js`:
  - POST records a remittance; DELETE voids one.
  - Server-side with `lib/supabase/admin.js`, because it is a multi-entry post.
  - Auth via `requireStaff` from `lib/messaging/auth`, as in `app/api/payments/refund/route.js`.
- *Reports:* in `lib/reports/ledger_math.js:280`, `receivableAging(lines, accounts, asOf, subtype = "receivable")` gains a subtype parameter. HAP aging is grouped by PHA through contracts.
- *UI:*
  - "Record HAP payment" wizard (`components/internal/shared/wizard_dialog.jsx`), launched from the Housing Authority record and from the Rent Collection toolbar (`components/internal/screens/accounting/rent_collection.jsx:528`). Steps:
    - Payment: date, amount, bank, reference, file.
    - Allocate: one row per contract with expected HAP, open HAP and an editable "received" value; the difference is highlighted.
    - Review: applied, unapplied and short-paid rows, each with a reason.
  - Housing Authority tabs:
    - Remittances: list with void.
    - Ledger: subsidy lines across its contracts.
    - Overview: expected vs received by month.
  - Bank reconciliation (`components/internal/screens/accounting/bank_reconciliation.jsx`): group lines that share `hapRemittanceId` into one tickable row.
- *Permissions:* `accounting.post` to record; `accounting.void` to void.

**Steps**
1. Migration and layer.
2. `remittances.js` and the route.
3. Wizard.
4. PHA tabs.
5. Aging parameter.
6. Bank-rec grouping.

**Research before building**
- HUD-52641 Part B on payment timing and the PHA late-payment penalty (24 CFR 982.451(a)(5)): should Geiger flag a late HAP?
- Typical PHA remittance formats (CSV or PDF "HAP register") from two or three large PHAs, to judge whether a CSV import is worth adding later.

**Acceptance criteria**
- **Allocation:** a 3,300 deposit for three leases (1,100 each, two owners) posts three entries. Trust cash per owner increases by its leases' share. Housing Assistance Receivable for the month is 0.
- **Bank reconciliation:** one tick clears 3,300.
- **Short-pay:** 2,200 received leaves one lease's 1,100 open in HAP aging (0–30 bucket); tenant balances are untouched.
- **Over-pay:** an over-payment assigned to lease A shows as a 1,100 unapplied HAP credit, consumed by next month's HAP charge.
- **Void:** voiding the remittance voids all its entries and reopens the HAP items.
- **Retry:** retrying after a simulated failure creates no duplicate entries.

**Depends on / unblocks**
- Depends on: HOUS-01, HOUS-02, HOUS-03; PLAT-01 (server posting auth).
- Unblocks: HOUS-06.

#### HOUS-05 · Housing-authority inspections (HQS / NSPIRE-V) and HAP abatements
- **MRI equivalent:** PHA Pro (HQS/NSPIRE mobile inspections, from the PHA side); Affordable Housing.
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gap 8.1 · Inventory 8.6 · PMX-8.04 · COMM-02, COMM-03, COMM-04, COMM-07 (gap 5.3)

**Geiger today**
- Inspections have kinds move-in, move-out, routine, annual and drive-by (`components/internal/screens/leasing/shared.js:213-219`), with `lease_id`, `tenant_id` and `unit_id` columns (`supabase/migrations/20261015210600_engine_foundations.sql:133-138`).
- There is no housing-authority inspection type, deficiency list, cure deadline or abatement.

**What's missing**
- **PHA inspection records:** initial, annual or biennial, special/complaint, reinspection. The standard used:
  - HQS until the PHA switches to NSPIRE-V.
  - The NSPIRE-V compliance date for HCV, PBV and Mod Rehab is **February 1, 2027**, the third extension (Federal Register 2025-19070; PIH 2026-18). PHAs may adopt it earlier. Smoke and carbon-monoxide alarm requirements already apply.
- **Deficiencies:** life-threatening (24-hour cure) or not (30 days, or the period the PHA sets); owner- or tenant-caused.
- **Abatements:**
  - "Withheld": the PHA is holding HAP and may release it once repairs are made.
  - "Abated": HAP is lost for the period.
  - In both cases billing must not shift the HAP share onto the tenant.

**How to build**
- *Data model:* no new tables.
  - Inspections: add a `housing_authority` kind. Its metadata holds `standard` (`HQS|NSPIRE-V`), `phaInspectionType`, `result` (`pass|fail|inconclusive|no_show`), `reinspectionOn`, `hapContractId` and `housingAuthorityId`.
  - Deficiencies: `record_items` with `owner_type 'inspection'`, `kind 'inspection_deficiency'`, `ends_on` = cure-by, `status`, and metadata `lifeThreatening`, `responsible`, `correctedOn`, `workOrderId`.
  - Abatements: `record_items` with `owner_type 'hap_contract'`, `kind 'hap_abatement'`, `starts_on`, `ends_on` (null until lifted), `status` (`Withheld|Abated|Lifted`), and metadata `inspectionId`, `noticeOn`, `reason`.
- *Server logic:* in `lib/housing/hap.js`:
  - `defaultStandard(pha, date)`: `pha.inspection_standard`, or `date >= NSPIRE_V_COMPLIANCE_DATE ("2027-02-01") ? "NSPIRE-V" : "HQS"`. Cite the Federal Register notice in a one-line comment.
  - `cureBy(deficiency, inspectedOn)`.
  - `rentSplit` takes abatements into account:
    - **Withheld** → still post the HAP charge (it is expected) and flag it.
    - **Abated** → no HAP charge for fully abated months. Prorate partial months with the `prorationMethod` policy (`lib/policies.js`).
    - The tenant amount is unchanged in every case.
  - `postAbatementCredits(abatement)` reverses HAP already posted inside the abated window. It uses `buildCredit` with `arKey` subsidy and `glAccountId` = `hap_abatements`, keyed `hapab:<abatementId>:<yyyy-mm>`.
  - "Create work order" per deficiency uses the existing work-order layer. COMM's gap-5.3 item may generalise this to all findings.
- *UI:*
  - Add `{ value: "housing_authority", label: "Housing authority (HQS / NSPIRE-V)" }` to `INSPECTION_TYPE_OPTIONS` (`leasing/shared.js:213-219`). That kind gets extra fields and a deficiencies child table with a "Create work order" row action.
  - Lease "Housing Assistance" tab (HOUS-03):
    - Inspections list (related section).
    - Abatements table with "Record abatement" and "Lift abatement" wizards.
    - While an abatement is open, a banner reads: "HAP withheld/abated since <date>. Don't bill the tenant for the housing authority's share."
  - "Paid by: Tenant" allocations against subsidy items are blocked in `PostEntryDialog`.
- *Permissions:* `housing.manage`; `accounting.post` for the credits.

**Steps**
1. Inspection kind and fields.
2. Deficiencies child table and work-order action.
3. Abatement records and wizards.
4. `rentSplit` abatement logic.
5. Abatement credits.
6. Banner and allocation guard.

**Research before building**
- Current 24 CFR 982.404 (eCFR) after the HOTMA rule (FR 2024-08601): withhold-then-abate, PHA-set cure periods, and the 180-day limit before contract termination.
  - Confirm whether the current text still bars owners from charging the family for abated HAP. Older guidance says so; check the eCFR text and one or two PHA admin plans.
- Federal Register 2025-19070 and PIH 2026-18 for the NSPIRE-V date, and whether HUD moves it again before February 2027: https://public-inspection.federalregister.gov/2025-19070.pdf, https://www.hud.gov/sites/default/files/PIH/documents/PIH-2026-18.pdf
- NSPIRE-V deficiency categories for HCV (life-threatening vs other), to label severity correctly.

**Acceptance criteria**
- **Fail and cure:** a failed inspection with one life-threatening and one other deficiency shows cure-by dates 1 day and 30 days later. The editor can override the PHA period.
- **Full-month abatement:** Abated from 2026-08-01 to open. August billing posts tenant 400 and no HAP charge.
- **Partial abatement:** an abatement lifted on 2026-08-16 under actual-days proration posts HAP for Aug 16–31 only.
- **Retro abatement:** a HAP already posted for an abated month is reversed by one `hapab:` credit; a rerun posts nothing.
- **Withheld:** a withheld period keeps the HAP open (aging), and the tenant balance never includes it.
- **Standard default:** inspections dated on or after 2027-02-01 default to NSPIRE-V when the PHA's standard is blank.

**Depends on / unblocks**
- Depends on: HOUS-03; COMM-02, COMM-03, COMM-04, COMM-07 (gap 5.3) (inspection templates, findings → work orders).
- Unblocks: HOUS-06.

#### HOUS-06 · Voucher reminders, rent-roll split and Housing Assistance report
- **MRI equivalent:** Affordable Housing (recert reminders, subsidy reports).
- **Status · priority · effort:** Missing · P2 · S
- **Refs:** Gap 8.1 · Inventory 8.14 (reminder pattern) · PMX-8.08 (reminders only)

**Geiger today**
- The expiring-documents job already sends a staff digest for any `record_items` row of `kind 'compliance_item'` at 30 and 0 days (`lib/messaging/reminder_jobs.js:485-500`). Its party map covers vendor, tenant and owner only (`:346`).
- The rent roll has a single "Lease rent" column (`lib/reports/defs_operations.js:75-86`).

**What's missing**
- Staff reminders for the HAP dates: next reexam, next inspection, contract end, deficiency cure-by, and the PHA rent-increase request deadline (60 days before a proposed renewal rent).
- Tenant share and HAP on the rent roll.
- A Housing Assistance report.

**How to build**
- *Server logic:*
  - `lib/housing/hap.js` gets `syncHapReminders(contract)`. It runs after any contract, term-request or deficiency save and upserts `compliance_item` rows (`owner_type 'lease'`, `metadata.source: { hapContractId, field }`), one per date.
  - In `reminder_jobs.js:346`, add `lease` to `parties`, so digest lines name the lease.
- *Reports:*
  - `housingAssistanceReport` in `lib/reports/defs_operations.js` (added to `OPERATIONS_REPORTS`). Sections:
    - Contracts: tenant, unit, PHA, contract/HAP/tenant rent, next reexam, next inspection, status, open abatement.
    - HAP by month per PHA: expected, received, open.
    - HAP aging (HOUS-04).
  - Rent roll (`:43-86`): add "Tenant share" and "HAP" columns from `rentSplit`.
- *UI:* nav entry `{ title: "Housing Assistance", icon: HandCoins }` under Reports (`sidebar_nav.jsx:177-197`), mapped in `registry.jsx` the way other report titles resolve via `reportByTitle` (`lib/reports/catalog.js:13`).
- *Integrations:* email digest through the existing geiger-dash path. In-app bell via geiger-notify only if the suite adopts it for Property (not today).

**Steps**
1. `syncHapReminders` and the parties map.
2. Report definition and nav.
3. Rent-roll columns.

**Acceptance criteria**
- A contract with `next_reexam_on` 30 days out produces one digest line today and one on the due day; no duplicates on rerun.
- The report totals for expected HAP equal the sum of HAP charges for the period. Received equals the sum of HOUS-04 allocations.
- The rent roll shows tenant share + HAP = lease rent for each subsidized unit; unsubsidized units show the full rent as the tenant share.

**Depends on / unblocks** — Depends on HOUS-03, HOUS-04, HOUS-05.

#### HOUS-07 · Jurisdiction rule table, user-maintained, linked to Legal Resources
- **MRI equivalent:**
  - DHCR (NYC rules), Canadian rent-control guidelines (regional; not US).
  - PMX calculated deposits "for legal requirements" (PMX-3.28, PMX-8.16).
  - MRI ships region packs; Geiger lets the user own the values.
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gap 8.2 (partly), 3.10 (cross-ref) · Inventory 8.9, 8.10, 8.11, 8.12 · PMX-8.10, PMX-8.16

**Geiger today**
- Legal Resources stores one row per state (`supabase/migrations/20261019184635_legal_resources.sql:22-44`): statewide cap flag, preemption, summary, source URL, local programs. Data layer: `lib/supabase/legal_resources.js:63-131`.
- The jurisdiction page shows a read-only Rent Regulation card (`components/internal/screens/legal/jurisdiction_detail.jsx:40-92`, rendered at `:190`). Nothing reads it from rules, policies or notices (inventory 8.11).
- The seed already holds dated cap facts (`supabase/seeds/legal_resources/01_legal_jurisdictions.sql`):

  | State | Seed line | Facts held |
  |---|---|---|
  | CA | 12 | Civ. Code 1947.12: 5% + CPI or 10%; sunset January 1, 2030 |
  | OR | 45 | ORS 90.323/90.324: lesser of 10% or 7% + CPI; 9.5% for 2026, 10% for 2027 |
  | WA | 55 | RCW 59.18.700 (HB 1217, from May 7, 2025): 9.683% for 2026, 10% for 2027; 90-day notice |
  | NY | 40 | Good Cause: CPI + 5%, max 10%; RGB Order #58 |

- Policies carry only hints ("Check your local limits", `lib/policies.js:44`; "Required in some jurisdictions", `:110`).
- `resolveStateCode` sits in a screen file (`components/internal/screens/legal/constants.js:148-153`).

**What's missing**
- Structured, effective-dated rule rows that code can evaluate. The **user** maintains them. Geiger may offer reference rows taken from public sources, which must be reviewed and adopted before they apply.
- Periods for formula caps: the CPI-based maximum changes yearly and, in California, by region.

**How to build**
- *Data model:* migration `npm run db:new -- jurisdiction_rules --template table`. Table `property.jurisdiction_rules`, standard columns plus:
  - Scope and status:
    - `project_id`: null = shared reference row
    - `jurisdiction_code text not null` (matches `legal_jurisdictions.code`), `locality text` (null = statewide), `property_id uuid` (set = one property: regulatory agreement, inclusionary unit, a local ordinance the user scopes by hand)
    - `kind`: check `rent_increase_cap|increase_notice|deposit_cap|late_fee_cap|source_of_income`
    - `name`, `status` (check `reference|draft|active|retired`), `enforcement` (check `warn|block`, default `warn`)
  - Content: `params jsonb`, `applies_to jsonb`, `citation`, `source_url`, `effective_from`, `effective_to`
  - Provenance: `reference_rule_id`, `reviewed_at`, `reviewed_by`
  - Indexes: `(project_id, jurisdiction_code, kind) where deleted_at is null`, `(property_id)`.
  - Periods are `record_items` with `owner_type 'jurisdiction_rule'`, `kind 'rule_period'`, `starts_on`, `ends_on`, `amount` = max % for the window, and `metadata { cpiPct, region, sourceUrl }`.
  - Confirm the table name is unused on the live DB.
- *`params` by kind* (example values only; each must be verified):
  - `rent_increase_cap`:
    ```
    {
      method: "cpi_plus" | "fixed_pct" | "published" | "term_based",
      plusPct, ceilingPct, fixedPct,
      lookback: "lowest_in_window" | "current",
      windowMonths: 12,
      maxIncrementsPerWindow,
      firstTenancyFreezeMonths
    }
    ```
  - `increase_notice`: `{ tiers: [{ minIncreasePct, maxIncreasePct, minTenancyMonths, maxTenancyMonths, days }], mailingExtraDays }`
  - The other kinds' params come in HOUS-12.
- *`applies_to`:* `{ minBuildingAgeYears, propertyTypes, excludePropertyTypes, minUnits, excludeSubsidized, requiresExemptionNotice }`, used by HOUS-08.
- *Seeds:* `supabase/seeds/legal_resources/03_jurisdiction_rules.sql` adds reference rows (`status 'reference'`, `project_id` null), each with a citation and source URL:

  | Jurisdiction | Reference rows |
  |---|---|
  | CA | Civ. Code 1947.12 cap; Civ. Code 827 notice (30 days ≤10%, 90 days >10%) |
  | OR | ORS 90.323/90.324 cap; 90-day notice; first-year freeze |
  | WA | RCW 59.18.700 cap; RCW 59.18.140 90-day notice |
  | NY | RPL 226-c notice tiers by tenancy length; NYC Good Cause local rent standard |

  - Periods only where an official body publishes the number: OR (OEA) and WA (Commerce).
  - Regenerate the seed rather than hand-editing it, as for the existing legal seeds.
- *Server logic:*
  - `lib/supabase/jurisdiction_rules.js`: `normalize`/`toRow`; `listRules({ jurisdictionCode })` returns project rows and reference rows (via `scopeQuery`, as `legal_resources.js:63`); `adoptRule(referenceId)` copies a reference row into the project as a `draft` with `reference_rule_id`; `update`, `softDelete`, `listPeriods`.
  - Move `resolveStateCode` to `lib/housing/jurisdiction.js` and re-export it from `legal/constants.js`, so jobs and pure checks can use it.
  - `lib/housing/rent_rules.js` (pure): `rulesFor({ property, unit, rules, asOf })` and `capFor({ rule, periods, asOf })`.
- *UI:*
  - Legal Resources gets a fourth view, "Your Rules", next to Directory, Library and Map (`components/internal/screens/legal/legal_resources.jsx`).
    - List: kind, jurisdiction, locality or property, status, enforcement, last reviewed.
    - Rule editor dialog with kind-specific fields and a periods child table.
  - On the jurisdiction page, add a `RentRulesCard` after `RentRegulationCard` (`jurisdiction_detail.jsx:190`). It shows the project's active rules for that state and "Suggested from public sources — review before use" reference rows with an "Adopt" button.
  - Every rule view carries one line of fixed copy: "You maintain these rules. Geiger applies the numbers you enter; it doesn't track law changes and isn't legal advice."
- *Permissions:* add to `lib/rbac.js`:
  - `rules.manage` ("Manage rent & deposit rules", group "Administration")
  - `rules.override` ("Override a rule check with a reason", used by HOUS-10)

**Steps**
1. Migration and data layer.
2. Move `resolveStateCode`.
3. Pure `rulesFor` and `capFor`.
4. Seed reference rows.
5. "Your Rules" view and editor.
6. Jurisdiction-page card with Adopt.

**Research before building**
- **CA:** Civ. Code 1947.12, including the meaning of "lowest gross rental rate", the two-increment limit, exemptions, regional CPI and the (o) sunset on January 1, 2030.
  - Status of the 2025–26 bill to change the sunset, which reportedly stalled in January 2026. Check leginfo.
  - Civ. Code 827 notice tiers.
  - Sources: https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1947.12, https://oag.ca.gov/rentcaps
- **OR:** ORS 90.323 and 90.324 (SB 608 formula 7% + CPI; SB 611 ceiling 10%; 15-year new-construction exemption; first-year freeze) and the OEA published cap: https://www.oregon.gov/das/OEA/pages/rent-stabilization.aspx
- **WA:** RCW 59.18.700 and following (HB 1217, 2025): exemptions (new-construction age, affordable, owner-occupied), manufactured-home rules, Commerce's yearly number, and the 90-day notice under RCW 59.18.140: https://app.leg.wa.gov/RCW/default.aspx?cite=59.18.700
- **NY:** RPL 226-c notice tiers; NYC Good Cause local rent standard: https://hcr.ny.gov/good-cause-eviction
- **Local ordinances:** use the seed's local lists (CA, line 12) as the backlog of `locality` rules the user may add. Don't seed values for cities.
- **Liability:** whether to ship reference values at all (see Open decisions). Have counsel review the disclaimer text.

**Acceptance criteria**
- **Adoption:** a reference CA cap row can't affect any check until it is adopted and set to `active`. Adopting copies it with `reference_rule_id` set.
- **Periods:** a rule with periods returns the right max % for dates inside, at the edge of and outside each period. With no period covering the date, the result is `needs_review`, never a guessed number.
- **Matching:** `rulesFor` matches a property whose `state` is "California", "CA" or "Calif." through `resolveStateCode`. A locality rule matches only when the city matches.
- **Isolation:** reference rows are visible in every project; project rows are not visible to other projects.
- **Copy:** every rule surface shows the disclaimer.

**Depends on / unblocks**
- Depends on: none.
- Unblocks: HOUS-08, HOUS-10, HOUS-11, HOUS-12; CORE-20 (gap 3.10); RISK source-of-income rules.

**Open decisions**
- Ship reference rows for CA, OR, WA and NY (faster, adoption step required), or ship an empty table plus links (lower liability)?
- Default enforcement for adopted rules: `warn` (recommended) or `block`?

#### HOUS-08 · Rule applicability per property and unit
- **MRI equivalent:** DHCR (unit regulation status).
- **Status · priority · effort:** Saved-unused · P2 · S
- **Refs:** Gap 8.2 · Inventory 8.7

**Geiger today**
- The property's "Regulation & programs" card (`components/internal/screens/properties/sections/property_tabs.jsx:222-233`) stores `rentControlled`, `rentIncreaseCapPct` and `rentRegistrationId`. Nothing reads them.
- Each renewal also has its own unread "Local rent cap" `rentCapPct` (`components/internal/screens/leasing/renewals.jsx:549`). *(New finding; not in inventory 8.7.)*
- The property has `yearBuilt` (`property_tabs.jsx:31`) and `type`.

**What's missing** — For each property, and optionally each unit: which active rules apply, which are exempt and why (user-confirmed), and which are still unknown. Exemptions are fact-heavy (building age, single-family owned by an individual with an exemption notice, owner-occupied duplex, regulated affordable), so Geiger suggests and the user confirms.

**How to build**
- *Data model:* no table.
  - Property metadata: `rentSettings.ruleStatus = { [ruleId]: { status: "applies"|"exempt"|"unknown", reason, documentId, confirmedBy, confirmedAt } }` via `merge_meta`.
  - New property meta field `firstOccupancyDate` (certificate of occupancy).
  - Unit overrides in `units.metadata.ruleStatus`.
- *Server logic:* `lib/housing/rent_rules.js`:
  - `suggestApplicability(rule, property, unit)` evaluates `applies_to` → `likely_applies|likely_exempt|unknown` with reasons. Building age comes from `firstOccupancyDate`, falling back to `yearBuilt`.
  - `ruleStatusFor(rule, property, unit)`: a unit override wins over the property status, which wins over the suggestion. Only `applies` and `unknown` feed HOUS-10; `unknown` gives a warning, never a pass.
- *UI:*
  - Replace the "Regulation & programs" card with a custom `RentRulesApplicabilitySection`. Each candidate rule (state, locality and property rules) shows its suggestion and a status select with reason and evidence upload.
  - Keep `rentRegistrationId`, plus the affordable fields with the HOUS-01 hint.
  - Migration path: if `rentControlled && rentIncreaseCapPct`, show the action "Create a property rule from these values". It creates a `jurisdiction_rules` row (`property_id` set, `kind rent_increase_cap`, `method fixed_pct`), then hides the old fields.
  - Remove the renewal-level `rentCapPct` field (`renewals.jsx:549`); HOUS-10 shows the computed cap instead.
  - The Units editor gets an override list.
- *Permissions:* `rules.manage` to confirm statuses.

**Steps**
1. Suggestion logic.
2. Property section.
3. Legacy-field conversion action.
4. Unit overrides.
5. Remove the renewal `rentCapPct` field.

**Acceptance criteria**
- **Building age:** a CA property built 2015 (under 15 years old in 2026) is suggested `likely_exempt (new construction)`; one built 1980 is suggested `likely_applies`. Neither affects checks until confirmed, except that `unknown` warns.
- **Unit override:** a unit set to `exempt` while its property `applies` is not checked.
- **Legacy conversion:** a property with `rentIncreaseCapPct` 5 converts to a property rule; the old fields disappear from the card.

**Depends on / unblocks** — Depends on HOUS-07. Unblocks HOUS-10.

#### HOUS-09 · Rent change log per tenancy
- **MRI equivalent:** DHCR ("records historical legal rent").
- **Status · priority · effort:** Missing · P2 · S
- **Refs:** Gap 8.2 · Inventory 2b.9, 2b.61

**Geiger today** — Rent changes overwrite `leases.rent`:
- escalation "Apply due" (`components/internal/screens/leasing/sections/lease_money.jsx:111-123`), which keeps `metadata.baseRent` and `rentSchedule[].appliedOn`
- renewals, which create a new lease linked by `renewal_of_id` (`lib/leasing/workflows.js:183-210`)

No single history exists. Caps such as California's need "the lowest rent in the prior 12 months" across the tenancy.

**What's missing** — An append-only log of rent changes per lease. Each entry records old and new rent, effective date, kind, source, the notice served, and a snapshot of the HOUS-10 check (including any override reason).

**How to build**
- *Data model:* migration `npm run db:new -- rent_changes --template table`. Table `property.rent_changes`, standard columns plus:
  - links: `lease_id`, `unit_id`, `tenant_id`, `property_id`
  - change: `effective_date date not null`, `previous_rent numeric(12,2)`, `new_rent numeric(12,2) not null`
  - `kind`: check `move_in|renewal|escalation|amendment|mtm_premium|hap_contract|correction`
  - source and notice: `source_type`, `source_id`, `notice_id`, `notice_served_on`
  - check: `check_result jsonb default '{}'`, `override_reason`, `overridden_by`
  - Index `(lease_id, effective_date)`. Confirm the name is unused on the live DB.
  - This is an **audit log**, not a billing source. CORE's gap-0.1 item owns what is billed.
- *Server logic:*
  - `lib/supabase/rent_changes.js`: `logRentChange(input)`, `listRentChanges(leaseId)`.
  - `lib/housing/rent_history.js` (pure):
    - `tenancyChain(leases, leaseId)` walks `renewal_of_id`.
    - `rentHistory(changes, chain)` returns sorted entries.
    - `rentOn(date)` and `lowestRentIn(window)`.
  - `rebuildRentHistory(leaseId)` backfills from four sources: the lease chain, `metadata.baseRent`, applied `rentSchedule` steps, and Accepted renewals (`proposedRent`/`newStart`).
  - Writers, each calling `logRentChange`:
    - `acceptRenewal` (`workflows.js:183`)
    - `applyDue` (`lease_money.jsx:111`)
    - lease activation (CORE/LEAS)
    - LEAS amendments (gap 2.13)
    - month-to-month rollover with a premium
    - HOUS-03 contract-rent updates
- *UI:* the lease "Rent & Escalations" tab gets a "Rent history" table across the tenancy, with a "Rebuild history" action.
- *Permissions:* writes follow the editor's existing permissions.

**Steps**
1. Migration and layer.
2. Pure history functions.
3. Wire the writers.
4. Rebuild action.
5. History table.

**Acceptance criteria**
- **Chain:** a three-lease renewal chain shows one continuous history with correct previous/new pairs.
- **Lookback:** `lowestRentIn` returns the right base for a 12-month window that spans a renewal.
- **Rebuild:** running "Rebuild history" twice creates no duplicates (keyed by `source_type` + `source_id` + `effective_date`).

**Depends on / unblocks**
- Depends on: none (coordinate writers with CORE-01 (gap 0.1) and LEAS-16 (gap 2.13)).
- Unblocks: HOUS-10, HOUS-14.

#### HOUS-10 · Rent-increase cap checks on renewals, escalations and amendments
- **MRI equivalent:** DHCR (renewals managed under DHCR rules); Canada Regional Pack (rent-control guidelines in renewals; regional, not US).
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gap 8.2 · Inventory 8.8, 2b.9, 2b.55, 2b.56 · PMX-8.10, PMX-8.11

**Geiger today** — Nothing checks a rent increase against a cap:
- **Offer-renewal wizard** (`components/internal/screens/leasing/lease_actions.jsx:192-248`): pre-fills `proposedRent` from the lease's `increasePct` (`:204`); its only validation is "end after start" (`:225`).
- **Renewals screen:** proposed rent is editable (`renewals.jsx:522`) and drafts can be created (`:332-360`).
- **Escalation steps** (`lease_money.jsx:69-140`) and month-to-month premiums apply unchecked.

**What's missing** — A single pure check that every rent-changing flow calls. It returns ok, warn, block or needs-review, with:
- the computed maximum rent
- the basis rent and date
- findings with citations
- an override with a reason, logged

**How to build**
- *Server logic:* `lib/housing/rent_rules.js`:
  ```
  checkRentIncrease({ lease, property, unit, proposedRent, effectiveDate, noticeServedOn,
                      rules, periods, history, hap })
    → { status: "ok"|"warn"|"block"|"needs_review", maxRent, maxPct, basis: { rent, date },
        findings: [{ code, message, ruleId, citation }] }
  ```
  - Finding codes:

    | Code | Meaning |
    |---|---|
    | `CAP_EXCEEDED` | Over the computed maximum |
    | `FIRST_TENANCY_FREEZE` | Increase falls inside the first-tenancy freeze |
    | `TOO_MANY_INCREMENTS` | More increases in the window than the rule allows |
    | `NOTICE_TOO_SHORT` | Notice served is shorter than required (from HOUS-11) |
    | `NO_PERIOD_VALUE` | No period covers the date |
    | `RULE_UNCONFIRMED` | Applicability is still `unknown` |
    | `HCV_INITIAL_TERM` | Voucher lease; no increase allowed in the initial term |
    | `HCV_PHA_NOTICE` | Voucher lease; under 60 days before the effective date, or no approved PHA term |

  - The basis comes from HOUS-09 (`lowestRentIn` or the current rent, per `params.lookback`).
  - The status is the strictest finding. Each rule's `enforcement` decides warn or block.
  - `useRentRuleContext({ propertyId, leaseId })` (client hook) loads the rules, periods, statuses, history and HAP index once per screen.
- *Hook points* (each logs the result into `rent_changes.check_result` when the change takes effect):
  - Offer-renewal wizard, "terms" step:
    - a `render` panel showing the maximum rent and findings
    - `validate` returns a message on `block` unless "Override with reason" is set; the override needs `rules.override`
    - the result is stored in `renewals.metadata.ruleCheck`
  - Renewals screen, Increase section (`renewals.jsx:533-556`): the computed cap replaces `rentCapPct`. Re-check when status moves to "Offer sent" or "Accepted", and inside `acceptRenewal` before creating the lease.
  - Bulk renewal worksheet (LEAS-18 (gap 2.12)): a "Max allowed" column and row status.
  - Escalation steps (`lease_money.jsx`): check each future step on add, and again on "Apply due".
  - Lease amendments (LEAS-16 (gap 2.13)): call before saving a rent amendment.
  - Month-to-month rollover premium (lease `mtmPremium`; policy `mtmPremium`): treated as an increase.
  - Rent-increase notice (HOUS-11).
- *UI:* one shared `RentCheckPanel` component (`components/internal/screens/leasing/sections/rent_check_panel.jsx`) built from `@geiger/ui` `Badge` and `SectionCard`. Status colour comes from a `RENT_CHECK_MAP` in `leasing/shared.js`.
- *Permissions:* `rules.override`.

**Steps**
1. The pure check, with table-driven cases.
2. Context hook.
3. Panel.
4. Wire the renewal wizard and screen.
5. Escalations and MTM premium.
6. Expose the check for LEAS 2.12/2.13.
7. Logging into `rent_changes`.

**Research before building**
- California: is the base the "gross rental rate" (with or without concessions or separately stated fees), how are two increments counted, and how does the regional CPI period map to the effective date?
- Oregon and Washington: how the first-tenancy freeze applies to fixed-term renewals versus month-to-month tenancies.
- Whether HCV rent changes need a separate owner→tenant notice under state law in addition to the PHA's approval.

**Acceptance criteria**
- **CA cap:** active CA rule, property `applies`, period max 8.8%, current rent 2,000, lowest rent in the prior 12 months 2,000. Proposed 2,200 → `block` (max 2,176); proposed 2,150 → `ok`.
- **Two increments:** a second increase within 12 months that totals over the cap → `CAP_EXCEEDED`; a third increase where the rule allows two → `TOO_MANY_INCREMENTS`.
- **Missing period:** no period for the date → `needs_review`, never `ok`.
- **Exempt and unknown:** an exempt unit → `ok` with "exempt: <reason>"; an `unknown` status → `warn` with `RULE_UNCONFIRMED`.
- **Override:** a `block` overridden by a user with `rules.override` saves the offer and stores `override_reason` and `overridden_by` in `rent_changes` when the renewal is accepted.
- **Voucher lease:** an increase inside the initial term → `HCV_INITIAL_TERM`.
- **No rules:** with no rules configured, every flow behaves as today (status `ok`, no panel noise).

**Depends on / unblocks**
- Depends on: HOUS-07, HOUS-08, HOUS-09; HOUS-03 (HCV findings).
- Unblocks: LEAS-18 (gap 2.12) and 2.13 (they call the check); HOUS-11.

#### HOUS-11 · Notice periods and rent-increase notices
- **MRI equivalent:** DHCR (standard and ETPA renewal letters).
- **Status · priority · effort:** Partial · P2 · S
- **Refs:** Gap 8.2 · Inventory 8.7, 8.8

**Geiger today**
- A "Rent increase" notice template exists (`lib/leasing/notice_templates.js:81-84`). It misuses `{{notice.cure_by}}` as the effective date and `{{notice.amount_due}}` as the new rent.
- "Serve a notice" is a lease action (`components/internal/screens/leasing/lease_actions.jsx:548`).
- The policy `renewalNoticeDays` defaults to 90 (`lib/policies.js:103`), with no link to any rule.

**What's missing**
- The required notice days, from rules: tiers by increase % and tenancy length.
- The earliest lawful effective date for a given service date.
- Proper merge fields.
- Linking the notice to the rent change.

**How to build**
- *Server logic:*
  - `lib/housing/rent_rules.js`: `noticeRequirement({ rules, increasePct, tenancyMonths, deliveryMethod })` → `{ days, extraDays, earliestEffective(servedOn) }`. HOUS-10 consumes it as `NOTICE_TOO_SHORT`.
  - `lib/leasing/notice_templates.js`:
    - add merge fields `notice.new_rent`, `notice.effective_date`, `notice.increase_pct`, `notice.current_rent` to the field list (`:5-10`)
    - rewrite the "Rent increase" template to use them
- *UI:*
  - "Serve a notice" wizard, type "Rent increase": fields new rent and effective date. It validates against `earliestEffective(servedOn)` and runs the HOUS-10 panel. Finishing creates the notice and links `rent_changes.notice_id` when the change applies.
  - Offer-renewal wizard: show "Earliest effective date if served today: <date>".
  - Policy section (`makePolicySection`): warn when `renewalNoticeDays` is below the longest notice an active rule requires for that property.
  - Delivery by email follows LEAS-40+ resident communications.
- *Permissions:* existing.

**Steps**
1. `noticeRequirement`.
2. Merge fields and template.
3. Wizard fields and validation.
4. Renewal hint.
5. Policy warning.

**Acceptance criteria**
- **CA tiers:** a 7% increase served 2026-11-05 → earliest effective date 2026-12-05 (30 days). An 11% increase → 2027-02-03 (90 days).
- **NY tiers:** a tenant of 3 years with a 6% increase → 90 days.
- **Merge:** the generated letter shows the new rent and effective date, not the cure-by or amount-due values.
- **Policy warning:** `renewalNoticeDays` 60 with an active 90-day rule shows the warning.

**Depends on / unblocks**
- Depends on: HOUS-07, HOUS-10.
- Unblocks: LEAS-40+ notice delivery.

#### HOUS-12 · Shared rule kinds: deposit caps (CORE) and source of income (RISK)
- **MRI equivalent:** PMX calculated deposits ("restricts the entry of variable amounts" to meet legal requirements); Engage Protect (location-specific screening rules).
- **Status · priority · effort:** Missing · P2 · S
- **Refs:** Gap 3.10 · Inventory 8.4, 8.9, 2a.40 · PMX-3.28, PMX-8.16, PMX-8.17

**Geiger today**
- **Deposits:** the policy offers "one month's rent" or a fixed amount (`lib/policies.js:88-98`), with no cap.
- **Late fees:** `maxLateFee` is typed by hand with the hint "Check your local limits" (`:44`).
- **Vouchers in screening:** `voucherAmount` on applications is unread (`components/internal/screens/marketing/sections/application_sections.jsx:126`). So the income-to-rent check (`:54-111`; `components/internal/screens/marketing/flows.js:68-96`) tests the voucher holder's income against the full rent.

**What's missing** — The same rule table carrying:
- deposit caps (e.g. California AB 12: one month from July 1, 2024, with a small-landlord exception)
- late-fee caps
- source-of-income protections (in many states and cities, vouchers count as income, and income tests apply only to the tenant's share)

The consumers live in CORE and RISK.

**How to build**
- *Data model:* none beyond HOUS-07. The kinds are already allowed by its check constraint.
- *`params` by kind:*
  - `deposit_cap`: `{ maxMonthsRent, smallLandlord: { maxMonthsRent, maxProperties, maxUnits }, includesPetDeposit, furnishedMaxMonthsRent }`
  - `late_fee_cap`: `{ maxPct, maxAmount, minGraceDays }`
  - `source_of_income`: `{ protectsVouchers: true, incomeTestOnTenantShare: true }`
- *Server logic:* readers in `lib/housing/rent_rules.js`: `depositCapFor({ property, lease, asOf })`, `lateFeeCapFor(...)`, `sourceOfIncomeFor(property)`.
  - Consumers:
    - CORE-20 (gap 3.10) calculated deposits: deposit wizard and `depositRule`.
    - CORE late-fee policy validation: `lib/policies.js` hints become live warnings.
    - RISK screening criteria: income-to-rent on `tenantShare` using `voucherAmount`; block "voucher" as a denial reason where protected; listing-copy check (inventory 2a.12).
  - HOUS-01's `tenantShare` already gives the applicant-side calculation `rent − voucherAmount`.
- *UI:* rule-editor field sets for the three kinds, in the HOUS-07 editor.

**Steps**
1. Param schemas and editor field sets.
2. Readers.
3. A reference row for CA AB 12 only if Open decision HOUS-07 allows reference rows.
4. Hand the readers to CORE and RISK.

**Research before building**
- California AB 12 (Civ. Code 1950.5 as amended) and New York GOL 7-108 deposit limits.
- California Gov. Code 12955 (SB 329 / SB 222, vouchers as source of income; income standard applied to the tenant's portion), plus the Washington and Oregon equivalents.
- A current multi-state source-of-income list (e.g. PRRAC's appendix) to size the backlog.

**Acceptance criteria**
- A CA `deposit_cap` rule (1 month) makes `depositCapFor` return 1× rent for a corporate owner and 2× for a qualifying small landlord.
- `sourceOfIncomeFor` returns protection for a property in a jurisdiction with an active rule. RISK's check then passes an applicant with income 1,500, rent 1,500, voucher 1,100 and a 3× multiple (1,500 ≥ 3 × 400 = 1,200).
- With no rules, CORE and RISK behave as today.

**Depends on / unblocks**
- Depends on: HOUS-07, HOUS-01.
- Unblocks: CORE-20 (gap 3.10); RISK screening criteria and source-of-income rules.

#### HOUS-13 · Rented-condo association obligations (dues, minimum term, board approval)
- **MRI equivalent:** CondoPlus / Jenark sublet screening and lease approvals, seen from the unit owner's side.
- **Status · priority · effort:** Saved-unused · P2 · S
- **Refs:** Gap 8.3 · Inventory 8.19

**Geiger today**
- The property Association tab (`components/internal/screens/properties/sections/property_tabs.jsx:335-379`, shown via `hasAssociation`, `components/internal/screens/properties/constants.js:39-41`) stores:
  - association contact
  - dues: amount, frequency, payer, due day
  - special assessment and its end date
  - CC&Rs and bylaws links
  - `leaseApprovalRequired`, `minLeaseTermMonths`, `rentalCap`
- Nothing reads them. No bill, no reminder, no lease check.

**What's missing** — For landlords renting units inside someone else's HOA:
- the dues bill, or a reminder
- a minimum-term check
- the board-approval step before activation
- a rental-cap warning on listings
- a special-assessment end reminder

**How to build**
- *Server logic:* `lib/housing/association.js` (pure): `associationChecks({ property, lease })` → findings `MIN_TERM`, `BOARD_APPROVAL_REQUIRED`, `RENTAL_CAP_NOTE`.
- *UI and actions:*
  - Lease create dialog and the Activate wizard (`lease_actions.jsx:110`): show the findings. `BOARD_APPROVAL_REQUIRED` adds a step recording "Board approval received on" and a document, stored in `lease.metadata.associationApproval`. Warn, or block when the property sets it.
  - Listing publish: `RENTAL_CAP_NOTE` warning.
  - Association tab actions:
    - "Create association payee": creates a `vendors` row (`metadata.kind 'association'`) from the association fields.
    - "Set up dues bill" (when dues are paid by "Manager on owner's behalf"): uses CORE-40+ recurring bills (gap 6.44). Until those exist, it creates `compliance_item` reminders per due date.
    - "Tenant pays" → optional pass-through recurring charge on the lease.
    - `specialAssessmentEnds` → a `compliance_item`.
- *Permissions:* existing.

**Steps**
1. `associationChecks`.
2. Lease create and activate hooks.
3. Listing warning.
4. Payee and dues actions.
5. Reminders.

**Acceptance criteria**
- A 6-month lease on a property with `minLeaseTermMonths` 12 shows `MIN_TERM` at create and at activation.
- `leaseApprovalRequired` on: activation requires an approval date, or an override with a reason.
- Dues of 300 per month paid by the manager produce a monthly bill (or a reminder) to the association vendor, attributed to the owner's property.

**Depends on / unblocks** — Depends on CORE-40+ recurring bills (gap 6.44) for the bill; reminders work without it.

#### HOUS-14 · NYC rent stabilization, minimal (recommend deferring)
- **MRI equivalent:** the DHCR module. Features:
  - historical legal rent
  - the rent registration file for DHCR
  - standard and ETPA renewal letters
  - lease riders
  - fire-safety, window-guard and lead-paint notices
  - LRO integration
- **Status · priority · effort:** Missing · P3 · M
- **Refs:** Gap 8.2 · Inventory 8.7, 8.18 · PMX-8.10

**Geiger today** — There is only a property-level "Rent registration #" (`property_tabs.jsx:228`, unread). The seed's NY row (line 40) records RGB Order #58 (0% for 1- and 2-year leases starting October 1, 2026 to September 30, 2027) and Good Cause Eviction.

**Recommendation: defer.**
- **Scope:** stabilization mostly covers buildings of 6+ units built before 1974. Many 10–500-unit NYC owners have some of these, but nationally it's a niche.
- **Liability:** legal-rent history must be reconstructed from DHCR registration records. Post-HSTPA (2019) rules apply, and overcharge findings carry treble damages.
- **Coverage:** HOUS-07/10/11 already cover Good Cause and RPL 226-c for non-stabilized NYC units, which is more useful to small NYC landlords.

**Minimal spec if a NYC customer needs it:**
- *Data model:* unit metadata `regulation = { status: "stabilized"|"controlled"|"market"|"exempt", legalRegulatedRent, preferentialRent }`. `rent_changes` (HOUS-09) gains `legal_rent` and `preferential_rent` columns (new migration).
- *Rules:* a `rent_increase_cap` rule with `method: "term_based"`. Periods per RGB order carry `metadata { oneYearPct, twoYearPct, orderNo }`; the user enters each order.
- *Checks:* the renewal offer date must fall 90–150 days before expiry; term choice 1 or 2 years; the proposed legal rent must not exceed legal rent × (1 + pct for the term); the preferential rent base is used per HSTPA.
- *Registration aid:* a report exporting each unit's April 1 snapshot as CSV, to help file in DHCR's ARRO system by July 31. Not a direct upload.
- *Documents:* the user uploads the current DHCR renewal form (RTP-8) and lease rider as templates. Geiger doesn't ship copies, because DHCR revises them.

**Research before building**
- Rent Stabilization Code 2523.5 (renewal window, response period); HSTPA 2019 preferential rent; DHCR ARRO registration (due July 31 for the April 1 status; https://hcr.ny.gov/operational-bulletin-2024-1); RGB orders (https://rentguidelinesboard.cityofnewyork.us/); RTP-8 and rider current versions.

**Acceptance criteria (if built)**
- A stabilized unit, legal rent 1,800, RGB 2-year 2.75%: a 2-year offer above 1,849.50 → `block`.
- An offer created 80 days before expiry → window finding.
- The CSV export lists every stabilized unit with its April 1 legal rent.

**Depends on / unblocks** — Depends on HOUS-07, HOUS-09, HOUS-10, HOUS-11.

**Open decisions**
- Build only on a signed NYC rent-stabilized customer (recommended), or now?

#### HOUS-15 · Association foundation: managed associations, homeowners, association books
- **MRI equivalent:** Jenark and CondoPlus (condo, co-op and HOA management: owner records, allocations, board management), plus Condo Management.
- **Status · priority · effort:** Missing · P3 · L
- **Refs:** Gap 8.3 · Inventory 8.20, 1.1, 6.24

**Geiger today**
- "HOA", "Condo" and "Townhome" property types and an Association tab describe the landlord's relationship to an **external** association (`properties/constants.js:19-41`; `property_tabs.jsx:335-379`).
- There are no homeowner ledgers, no association-level books and no board.
- The ledger has one book per project, with owners as a dimension (inventory 6.24).

**What's missing** — Managing an association as the client:
- association books separate from rental owners
- homeowners (members) and their ownership accounts per unit
- board members with terms
- unit allocation shares
- a management agreement with the association

**How to build** (recommended model A; see Open decisions)
- *Data model:*
  - Property metadata `association.managed = true` ("We manage this association"), distinct from the HOUS-13 external-HOA case.
  - Ownership accounts = leases with `lease_type 'ownership'` (add to `LEASE_TYPE_OPTIONS`, `components/internal/screens/leasing/shared.js:117-120`), no term end, no rent.
  - Homeowners = tenants with `metadata.partyType 'homeowner'`.
  - Unit allocation in `units.metadata.ownershipSharePct`.
  - Board members as `record_items` (`owner_type 'property'`, `kind 'board_member'`, `starts_on`/`ends_on`, `metadata.role`).
  - The association as the client = an `owners` row with `metadata.kind 'association'`, so management fees and owner statements work.
  - Association books: a CORE-40+ entity (gap 1.1) per association, with its own bank and GL. No owner distributions.
- *Server logic:*
  - Hide rental-only flows for `lease_type 'ownership'`: renewals, rent, escalations, move-out deposits and rent caps.
  - Move ownership on sale: end the account and open a new one (a transfer wizard).
- *UI:*
  - An "Associations" filter tab on Properties (`properties/config.jsx:120` already has one).
  - "Homeowners" and "Board" tabs on the property.
  - Ownership accounts show only Ledger, Recurring Charges, People, Documents and Notices.
- *Permissions:* add `associations.manage`.

**Research before building**
- How Buildium (association ownership accounts) and AppFolio (community associations) model homeowners, so switchers find the same concepts.
- State rules on association funds (separate accounts, reserve disclosures), e.g. California Davis-Stirling (Civ. Code 4000 and following).

**Acceptance criteria** — Converting a property to "managed association":
- creates the association owner and links its entity
- 20 units get ownership accounts and homeowners
- the rent roll and renewals ignore them
- the association's trial balance is separate from every rental owner's

**Depends on / unblocks**
- Depends on: CORE-40+ entities (gap 1.1); PLAT-01.
- Unblocks: HOUS-16–19.

**Open decisions**
- Enter the association market at all? The portfolio report advises staying off unless chosen deliberately, against Jenark and CondoPlus.
- Model A (reuse leases and tenants with type flags; faster, M–L overall) or model B (new `ownership_accounts` table, members and a ledger dimension, which means redefining `ledger_post`; cleaner, XL)?

#### HOUS-16 · Assessments and dues billing, online dues payments
- **MRI equivalent:** Jenark (assessments, delinquency); DuesPayment (HOA dues payments via RentPayment).
- **Status · priority · effort:** Missing · P3 · L
- **Refs:** Gap 8.3 · Inventory 8.20

**Geiger today** — Recurring charges, late fees, Stripe portal payments and autopay all exist for leases. Under model A they apply to ownership accounts unchanged. There is no assessment calculation.

**What's missing**
- Regular assessments computed from the association budget and allocation (equal, by share %, by square feet).
- Special assessments: one-time or instalments.
- Assessment late fees and interest within state caps.
- Dues payments online.

**How to build**
- *Data model:*
  - Default-chart rows `assessment_income` (4070) and `special_assessment_income` (4080). Add them in the same `ledger_ensure_default_chart` redefinition, or a later one.
  - Assessment schedule in `properties.metadata.association.assessment = { annualBudget, method, effectiveFrom }`.
- *Server logic:* `lib/housing/assessments.js`:
  - `computeAssessments(units, method, budget)`: amounts per unit; rounding remainder goes to the first unit.
  - `generateAssessmentCharges(property)`: creates or updates `recurring_charges` per ownership account.
  - `createSpecialAssessment({ total, method, instalments, startOn })`.
- *Rules:* late fees through the policy cascade; caps through HOUS-12 `late_fee_cap` rules with `applies_to.propertyTypes ['HOA','Condo']`.
- *Payments:* the existing resident-portal Stripe flow and autopay (`lib/payments/*`, `app/api/payments/*`) cover online dues. No new provider. Reuse geiger-forms payments only if a public pay link without login is wanted.

**Acceptance criteria**
- A 240,000 budget over 20 units at equal allocation gives 1,000 per unit per month.
- A 50,000 special assessment by share % in 5 instalments posts the right per-unit charges.
- The sum of allocated charges equals the budget to the cent.

**Depends on / unblocks** — Depends on HOUS-15. Unblocks HOUS-17, HOUS-19.

#### HOUS-17 · Reserve funds and association budgets
- **MRI equivalent:** Jenark and CondoPlus (association financials, reserves).
- **Status · priority · effort:** Missing · P3 · M
- **Refs:** Gap 8.3 · Inventory 8.20

**Geiger today** — Budgets and budget lines exist (`budgets`, `budget_lines` tables). Bank accounts exist. There is no reserve concept.

**What's missing**
- A reserve bank account and fund balance.
- Monthly reserve transfers.
- Reserve components (useful life, remaining life, replacement cost) with a percent-funded figure.
- Reserve study upload.

**How to build**
- *Data model:*
  - Default-chart rows `reserve_cash` (1030, Asset, cash) and `reserve_fund` (3300, Equity).
  - `bank_accounts.metadata.purpose 'reserve'`.
  - Components as `record_items` (`kind 'reserve_component'`, `amount` = replacement cost, metadata `usefulLifeYears`, `remainingLifeYears`, `lastReplacedOn`).
- *Server logic:* `lib/housing/reserves.js`:
  - `fullyFundedBalance(components)` = Σ cost × (useful − remaining) / useful.
  - `percentFunded(balance)`.
  - A monthly transfer as a recurring journal (the CORE-40+ recurring-entries item if it exists; otherwise a job using `buildJournal`).
- *UI:* a "Reserves" tab on managed associations: components table, funding KPI, transfer schedule, study documents. The budget screen gets an association template.

**Acceptance criteria**
- Components summing to a 100,000 fully funded balance against a reserve cash of 40,000 show 40% funded.
- A monthly 2,000 transfer posts Dr reserve_cash / Cr operating cash with reserve fund equity tracked.

**Depends on / unblocks** — Depends on HOUS-15, HOUS-16.

#### HOUS-18 · Violations and fines, architectural requests, board approvals
- **MRI equivalent:** Jenark and CondoPlus (owner violations, architectural review, board vote administration).
- **Status · priority · effort:** Missing · P3 · L
- **Refs:** Gap 8.3 · Inventory 8.20

**Geiger today** — Lease notices and violations exist (the `notices` table; `createLeaseNotice` in `lib/leasing/workflows.js:370`). There are no architectural requests and no vote records.

**What's missing**
- Homeowner violations: rule cited, photos, cure-by, an escalation ladder (courtesy notice → fine → hearing), and fines posted as charges.
- Architectural (ARC) requests with plans and a board decision.
- Board votes on requests and on rental or sublet approvals (links to HOUS-13).

**How to build**
- *Data model:*
  - Violations: `notices` rows with `notice_type 'Association violation'` and metadata `{ ruleRef, photos, fineSchedule, hearingOn }`.
  - New table `property.association_requests` (migration `npm run db:new -- association_requests --template table`): `property_id`, `unit_id`, `lease_id` (ownership account), `tenant_id` (homeowner), `kind` (`architectural|other`), `description`, `status` (`Submitted|Under review|Approved|Approved with conditions|Denied|Withdrawn`), `submitted_on`, `decide_by`, `decided_on`, `conditions`. Confirm the name is unused.
  - Votes: `record_items` (`owner_type 'association_request'|'lease'`, `kind 'board_vote'`, `metadata { boardMemberId, vote }`).
  - Quorum: `association.quorum`.
- *Server logic:*
  - Fines post through `buildCharge` with income `fine_income`.
  - `tallyVotes(request)`.
  - Optional auto-approval after `decide_by` when the CC&Rs say so.
- *UI:* a "Violations" view filtered on the association and an "Architectural Requests" screen under Leasing or the association. Intake can use a geiger-forms public form if homeowners submit without a portal login.

**Research before building**
- Notice-and-hearing rules before fines (e.g. California Civ. Code 5850–5855) and fine caps, to add as rule kinds or warnings.

**Acceptance criteria**
- A violation escalated to "fine" posts a 100 charge to the homeowner's account.
- A request with 3 of 5 board votes "approve" under a majority quorum becomes Approved and notifies staff.

**Depends on / unblocks** — Depends on HOUS-15, HOUS-16.

#### HOUS-19 · Homeowner and board portals
- **MRI equivalent:** Jenark and CondoPlus portals (board communications, vote administration, association documents); Engage Connect.
- **Status · priority · effort:** Missing · P3 · M
- **Refs:** Gap 8.3 · Inventory 8.20

**Geiger today** — Resident and owner portals exist (`lib/portal/resident.js`, `lib/portal/owner.js`, `app/portal/*`). Neither knows about homeowners or boards.

**What's missing**
- **Homeowner mode:** balance, pay dues and autopay, violations with a reply, ARC submission with uploads, association documents (CC&Rs, bylaws, rules, minutes).
- **Board mode:** association financials, delinquency list, approvals queue with voting.

**How to build**
- *Portals:*
  - Homeowner mode: `lib/portal/resident.js` branches on `lease_type 'ownership'`.
  - Board mode: `lib/portal/owner.js` branches when the owner is `metadata.kind 'association'`.
  - Board members sign in through `portal_members` with a board role.
- *Messaging:* mass email via geiger-campaign; in-app notices via geiger-notify if adopted. Don't build a parallel sender.
- *Security:* every portal surface depends on PLAT-01.

**Acceptance criteria**
- A homeowner sees only their own account and can pay through Stripe.
- A board member sees the association's books and can vote on an open request.
- A board member who is also a homeowner sees both modes.

**Depends on / unblocks** — Depends on HOUS-15, HOUS-16, HOUS-18; PLAT-01.

### Not building here
| MRI product | Why not | Revisit trigger |
|---|---|---|
| MRI Affordable Housing: LIHTC and HOME compliance (tenant income certifications, set-asides, student rule, utility allowances, annual owner certification, state-agency file submissions) | Enterprise purchase (requires RM, GL, AP and more); program rules change yearly; errors cost tax credits; entrenched incumbents. Geiger has only labels (`property_tabs.jsx:229-230`). | A paying customer with a tax-credit portfolio commits to co-fund, and a compliance partner (specialist firm or API) can own the rules. |
| MRI Affordable Housing: HUD multifamily and project-based Section 8 compliance, TRACS (HUD-50059, MAT voucher and certification files) | TRACS submissions require HUD-specified formats, testing and certified workflows. Project-based Section 8 subsidy is billed to HUD, not a PHA, so HOUS-01–06 doesn't apply. | HUD publishes a modern TRACS API, or a partner offers TRACS-as-a-service that Geiger can call. |
| Income certifications and recertifications (HOTMA, EIV, verifications) | Same as above. A compliance function with audit exposure, not property operations. | Same as the two rows above. |
| PHA Pro / Voucher Management (housing-authority side: HUD-50058, PIC/IMS, paying HAP to landlords, rent reasonableness, FSS) | Different buyer (public agencies), procurement-driven, 1,260+ entrenched MRI clients. Geiger serves the landlord who receives HAP (HOUS-01–06), not the agency that pays it. | Never for Geiger Property. A separate suite product only if the business targets public agencies. |
| Public housing (agency-owned units, ACC, operating fund, NSPIRE scoring) | Agency software; not our buyer. | Same as PHA Pro. |
| WaitListCheck / PHA online applications and waitlists | Agency waitlists with preferences and HUD rules. Geiger's market-rate waitlist (`waitlist_entries`) stays separate. | A PHA customer, which isn't planned. |
| USDA Rural Development (Section 515; MINC transmissions) | Same profile as HUD multifamily, with an even smaller market. | A rural-housing customer with a compliance partner. |
| DHCR module, full (registration file upload, LRO integration, fire-safety, window-guard and lead-paint notice packs) | NYC-only, high liability. HOUS-14 is the minimal path. | Several NYC rent-stabilized customers, after HOUS-14 ships. |
| Condo Sales (developer condo sales by project) | New-development sales, not property management. | Never in Property; would be a separate product. |
| Jenark / CondoPlus full suites (beyond HOUS-15–19: collections and liens, elections, amenity sales, accountant packages) | Only if the association market is entered, and even then start with HOUS-15–19. | HOUS-15–19 in use by paying associations asking for more. |
