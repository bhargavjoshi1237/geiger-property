# Geiger Property: feature-level inventory for the PMX Residential gap analysis (code audit, 2026-11-04)

**Scope.** A read-only, feature-level inventory of Geiger Property (`C:/Pro/geiger-property`) at HEAD `4fdcbd7`. It is organized under the 10-module taxonomy shared with the PMX inventory, so the two can be compared line by line. Every rating is grounded in code with path:line citations. No web sources were used, and MRI was not researched.

**Starting point.** The work builds on three earlier notes, which were verified again and broken down to a finer grain:
- the 2026-11-03 capability profile: [geiger_capability_profile.md](C:/Pro/geiger-property/mri/notes/MRI%20Software%20product%20portfolio/geiger_capability_profile.md)
- the 2026-11-02 fact-check notes: [geiger_financials_leasing.md](C:/Pro/geiger-property/research_notes/Geiger%20vs%20MRI%20PMX%20fact%20check/geiger_financials_leasing.md) and [geiger_investment_platform_ai.md](C:/Pro/geiger-property/research_notes/Geiger%20vs%20MRI%20PMX%20fact%20check/geiger_investment_platform_ai.md)

The stale 2026-10-16 `geiger_current_state.md` was not used.

**Method.**
- **Coverage.** Each module was read screen by screen (`components/internal/screens/**`), data layer by data layer (`lib/supabase/*`), and through server logic (`lib/jobs`, `lib/payments`, `lib/portal`, `lib/messaging`, `lib/automations`, `lib/reports`, `lib/ledger`), API routes (`app/api/**`) and migrations.
- **Saved-but-unused and Absent.** A field is "Saved-but-unused" only after a grep for its key outside its own definition found no reader. An "Absent" feature carries the grep (pattern and scope) that found nothing.
- **Re-checks.** The highest-impact corrections were re-checked by hand:
  - deposit postings have no caller
  - lease-tab GL account stored as a label
  - daily late fee blocked by the monthly key
  - overview rent KPIs read legacy metadata
  - primary-owner-only tagging
  - ledger RPCs granted to `anon`
  - lease documents written as `.txt`
  - no transfer flow
  - no announcement composer
  - receipts are sent
  - property banking-tab fields unread
  - `@xyflow` used only by automations
  - `maintenance_attachments` has no writer

**Maturity scale** (exactly one per row):

| Rating | Meaning |
|---|---|
| **Working** | End to end, persisted, and used by other code (another screen, a job, a report, a portal or the ledger). Purely staff-side record-keeping that is complete for its purpose also counts. |
| **Partial** | Wired, but with a material gap or defect, described in the Notes column. "(defect)" marks a code-level bug, not a missing extra. |
| **Tracking-only** | Records a status or value by hand; no provider or automation stands behind it. |
| **Stub/placeholder** | UI, route or builder exists, but no reachable behaviour. |
| **Saved-but-unused** | The field persists, and nothing reads it. |
| **Absent** | Nothing in the schema, code or UI. |

**[job]** marks behaviour that runs only inside a scheduled job (see the global caveats).

**Global caveats** (apply to every row; not repeated per row):
1. **Not production-secure.** Row-level security on every `property.*` table is demo-open (`using (true)` for `anon` and `authenticated`), and the ledger RPCs are granted to `anon` (9.45, 6.7). Documents, photos and portal uploads sit in public buckets (9.48). Role permissions are UI-only (9.4).
2. **No crons are configured.** `vercel.json` holds only `$schema`. Every [job] row runs only when staff click "Run now" or an external caller hits `/api/cron/*` with `CRON_SECRET` (9.44).
3. **USD and US only.** Single currency; US tax (1099/W-9) only (6.29).
4. **Pre-launch.** No customers ("app is in dev, no clients"). The live database was not compared with the migrations, the app was not run, and the `@geiger/ui` source was not available (no `node_modules`).
5. **Live providers.** Stripe and geiger-dash email are the only live third-party providers (9.29), and both need environment keys that the repo cannot show.

**Path legend.**
- `scr/` = `components/internal/screens/`
- `mig/` = `supabase/migrations/`

All other paths are relative to `C:/Pro/geiger-property/`. Line numbers are as of `4fdcbd7`.

**Counting rules.**
- Each table row is one feature.
- Where a feature touches two modules, it is counted once, in the module that owns it, and listed under "Cross-references (not counted here)" elsewhere.
- Rows in the report-catalogue table (module 7) and the policy-key table (module 3) are reference material and are not counted.

## Summary: features by maturity

| Module | Working | Partial | Tracking-only | Stub/placeholder | Saved-but-unused | Absent | Total |
|---|---|---|---|---|---|---|---|
| 1. Property & unit setup | 17 | 9 | 3 | 0 | 15 | 6 | 50 |
| 2. Marketing & leasing (2a + 2b) | 67 | 23 | 25 | 2 | 22 | 28 | 167 |
|   2a. Marketing, leads, applications | 21 | 10 | 11 | 1 | 5 | 11 | 59 |
|   2b. Leases, documents, renewals, moves, inspections, notices | 46 | 13 | 14 | 1 | 17 | 17 | 108 |
| 3. Resident billing & receivables | 30 | 17 | 2 | 2 | 9 | 11 | 71 |
| 4. Resident experience | 35 | 11 | 2 | 2 | 2 | 16 | 68 |
| 5. Maintenance & facilities | 50 | 16 | 13 | 1 | 20 | 17 | 117 |
| 6. Accounting & finance | 37 | 13 | 3 | 1 | 10 | 35 | 99 |
| 7. Reporting & analytics | 13 | 2 | 0 | 0 | 0 | 16 | 31 |
| 8. Compliance & specialty residential | 7 | 0 | 0 | 1 | 6 | 8 | 22 |
| 9. Platform & admin | 27 | 13 | 0 | 3 | 1 | 14 | 58 |
| 10. AI & automation | 0 | 0 | 0 | 1 | 0 | 11 | 12 |
| **Total** | **283** | **104** | **48** | **13** | **85** | **162** | **695** |

**Counts of note:**
- 24 rows are tagged [job].
- 12 rows are flagged "(defect)": 1.22, 2b.9, 2b.10, 2b.61, 3.7, 3.8, 3.22, 3.47, 3.49, 6.25, 6.78, 7.26.

**How to read this against PMX.**
- **Rows to treat as "Geiger lacks it":**
  - **Absent** and **Stub** rows are gaps outright.
  - **Saved-but-unused** rows are gaps too: the field exists, but the behaviour does not.
  - **Tracking-only** rows mean there is a place to record the outcome, but no automation or provider.
- **Where the gap is a missing provider integration**, not a missing record, the rating is Tracking-only. This applies to screening, e-signature, syndication, smart locks and insurance.
- **Systemic gaps** cut across modules and should be compared at platform level:
  - RLS and storage security (9.45, 9.48)
  - unscheduled jobs (9.44)
  - no public API (9.25)
  - no multi-entity or multi-currency books (6.24, 6.29)
## 1. Property & unit setup

| # | Feature | Maturity | Evidence (path:line) | Notes / what is missing |
|---|---|---|---|---|
| 1.1 | Portfolio → property → building → unit hierarchy | Working | `mig/20260708132813_properties.sql:37`; `mig/20260715161206_units.sql:28-31`; `mig/20260708132807_buildings.sql:28` | Links are soft uuids with no foreign key. There is no legal-entity, region or district level (1.46). |
| 1.2 | Portfolio overview roll-up, computed client-side: units, occupancy, rent roll, leases, work orders, average rent, vacancy loss, target alerts | Working | `scr/portfolios/sections.jsx:77-140` | Only the occupancy and rent-roll targets are compared (`:95-99`). |
| 1.3 | Portfolio settings: target NOI, maximum delinquency, budget year, fiscal year, reporting cadence and recipients, "consolidated statement", strategy, ownership entity | Saved-but-unused | `scr/portfolios/sections.jsx:290-334` | No reader outside the editor. |
| 1.4 | Portfolio as a ledger dimension or report roll-up | Absent | `mig/20261015212744_ledger_core.sql:97-104` (line dimensions); grep `portfolio` in lib/reports, lib/ledger and lib/jobs: 0 hits | — |
| 1.5 | Property record: 7 statuses, activate / deactivate / archive actions, list views | Working | `scr/properties/constants.js:4-43`; `scr/properties/config.jsx:116-122, 223-228`; `scr/properties/actions.jsx:16-70` | — |
| 1.6 | 11 property types (Single-family, Multi-family, Apartment, Condo, Townhome, HOA, Commercial, Mixed-use, Student housing, Senior living, Manufactured housing) | Partial | `scr/properties/constants.js:19-43`; `scr/properties/config.jsx:119, 262` | Commercial and Mixed-use only filter the list. Condo, Townhome and HOA add the Association tab. Student, Senior and Manufactured are labels only (see 8.21). |
| 1.7 | Property ownership (`property_owners`): ownership %, primary owner, start/end dates, 100% check, assign wizard | Working | `mig/20261015210600_engine_foundations.sql:91-108`; `scr/properties/sections/owners.jsx:14-60` | Read by the management-fee job (`lib/jobs/financial.js:92`), the owner portal (`lib/portal/owner.js:26`) and owner statements (`lib/reports/lookups.js:58`). |
| 1.8 | Bulk "Add units" wizard: 1-200 units by prefix / number / suffix with increment, floor, building, specs and initial status; skips duplicates; syncs the unit count | Working | `scr/properties/actions.jsx:118-228` | The only bulk-create path in the product (see 9.31). |
| 1.9 | Buildings, with a unit and occupancy roll-up and a "building tenants" announcement audience | Working | `mig/20260708132807_buildings.sql:24-42`; `scr/properties/joins.js:71-77`; `lib/messaging/announcements.js:61-62`; `lib/portal/common.js:31` | — |
| 1.10 | Building floors register | Partial | `scr/properties/record_kinds.js:236-251`; `scr/buildings/sections.jsx:46` | Descriptive only. A unit's floor is free text, not linked to a floor record. |
| 1.11 | Unit types: specs, market rent, deposit; "Apply specs" to units; "Push rent to units" with rent history; availability roll-up | Working | `mig/20260715161205_unit_types.sql:24-41`; `scr/unit_types/config.jsx:222-271`; `scr/units/actions.js:348-368` | — |
| 1.12 | Unit-type pricing and marketing fields (rent range, pricing strategy, lease terms, fees, website flag, marketing copy) | Saved-but-unused | `scr/unit_types/config.jsx:96-128` | Grep finds only the definitions. |
| 1.13 | "Default charges" on units and unit types | Saved-but-unused | `scr/units/config.jsx:467-473`; `scr/unit_types/config.jsx:313` | `defaultCharges` appears only at these two definitions; leases do not inherit them. |
| 1.14 | Floor plans: specs, uploaded drawing (image or PDF), links to units, properties and buildings, roll-up | Working | `mig/20260708132808_floor_plans.sql:25-43`; `mig/20260708132814_property_shared.sql:167`; `scr/entity/shared_sections/floor_plans_section.jsx:23-25`; `scr/entity/shared_sections/plan_file_section.jsx:11-12` | The plan is a file, not an interactive canvas (`@xyflow/react` is used only by automations). The plan's own pricing and marketing fields are unread. |
| 1.15 | Amenity catalogue attached to properties, buildings, units and unit types | Working | `mig/20260708132806_amenities.sql:25-43`; `mig/20260708132814_property_shared.sql:149`; `scr/entity/shared_sections/amenities_section.jsx:24-26` | Reservations are covered in module 4 (4.55-4.58). |
| 1.16 | Amenity resident fee and "show in marketing" highlight | Saved-but-unused | `scr/amenities/config.jsx:73-77` | No reader outside the data layer. |
| 1.17 | Unit core columns: beds, baths, square feet, rent, deposit, status, occupant, lease dates | Working | `mig/20260715161206_units.sql:27-44` | Feeds the rent roll, occupancy, CAM, RUBS and listings. |
| 1.18 | Unit descriptive metadata (features, layout, view, ADA, utilities, pets, parking, storage…) | Saved-but-unused | `scr/units/config.jsx:159-206` | Not copied to listings (`scr/units/actions.js:88-93`). |
| 1.19 | Unit square footage drives the CAM share and the RUBS split | Working | `scr/accounting/cam_reconciliation.jsx:178-180`; `scr/accounting/utility_billing.jsx:72, 83` | — |
| 1.20 | Property total and rentable square feet, lot size | Saved-but-unused | `scr/properties/sections/property_tabs.jsx:54-57` | Total square feet is only displayed (`scr/properties/sections/overview.jsx:121`). |
| 1.21 | Unit status model (7 statuses) with actions, auto-synced from leases and moves | Working | `scr/units/shared.js:8-16`; `scr/units/actions.js:148-465`; `lib/leasing/workflows.js:342-360`; `scr/leasing/moves.jsx:410-418` | The sync runs in browser code, not a DB trigger. |
| 1.22 | Non-revenue units excluded from occupancy | Partial (defect) | `scr/units/shared.js:71`; `lib/reports/defs_operations.js:207`; `lib/reports/maps.js:7-14` | Excluded on the Units screen, but counted in the Occupancy report, which excludes only Draft. |
| 1.23 | Market-rent change wizard with dated rent history | Working | `scr/units/actions.js:105-147`; `scr/units/sections/rent.jsx:115-125` | Read by listings, vacancy loss, the rent roll and income qualification. |
| 1.24 | Unit pricing fields (floor/ceiling, preferential rent, term pricing, premiums, fees, concession) | Saved-but-unused | `scr/units/sections/rent.jsx:18-47` | — |
| 1.25 | Unit availability date and ready status | Partial | `scr/units/sections/marketing.jsx:20-44`; `scr/units/actions.js:49, 92` | `availableDate` and `readyStatus` are used. "Hide from vacancies" and furnished rates are unread. |
| 1.26 | Unit access and entry instructions | Partial | `scr/units/config.jsx:208-227`; `scr/units/actions.js:290` | Copied only onto quick-action work orders, and nothing then reads them (5.17). |
| 1.27 | Smart-lock access codes on units | Tracking-only | `scr/units/config.jsx:478-518` | No lock provider. |
| 1.28 | Keys and fobs register | Tracking-only | `scr/properties/record_kinds.js:152-175`; `scr/units/config.jsx:519-543` | — |
| 1.29 | Meters and utility accounts register | Tracking-only | `scr/properties/record_kinds.js:179-208` | Readings never reach utility billing (3.69). |
| 1.30 | Property / building asset and equipment register with service-due and warranty badges | Partial | `scr/properties/record_kinds.js:111-148` | Expected life is unread. Not linked to PM schedules (`scr/maintenance/preventive.jsx:200-206`) or work orders (5.82-5.85). |
| 1.31 | Property insurance policies register | Partial | `scr/properties/record_kinds.js:33-66`; `scr/properties/sections/overview.jsx:35-43` | Overview alert only. The expiry job covers vendor and tenant policies, not property policies (`lib/messaging/reminder_jobs.js:405-462`). |
| 1.32 | Property and building compliance items (permits, fire inspection, rental registration), with a staff digest at 30 and 0 days | Working [job] | `scr/properties/record_kinds.js:70-107`; `lib/messaging/reminder_jobs.js:485-500` | The recurrence field is unread (5.81). |
| 1.33 | Preferred vendors by trade, with a not-to-exceed limit, on the property | Saved-but-unused | `scr/properties/record_kinds.js:212-232` | Work-order approval never reads the limit. |
| 1.34 | Property-level policy overrides (fee and payment policy cascade) | Working | `scr/properties/sections/property_tabs.jsx:248-251`; `lib/jobs/financial.js:289, 385, 458` | See the policy table in module 3. |
| 1.35 | Banking & Accounting tab: linked operating, deposit and reserve accounts; separate trust; accounting basis (Cash / Accrual / Modified cash); fiscal-year start; reserves; 1099; "require bill approval above"; 9 default GL accounts | Saved-but-unused | `scr/properties/sections/property_tabs.jsx:164-205` | Only the "no operating account linked" alert reads it (`scr/properties/sections/overview.jsx:57-58`). Grep `accountingBasis\|billApprovalAbove\|requireBillApproval` outside property_tabs.jsx: no hits. |
| 1.36 | Rent & Market tab (pricing strategy, target increase %, rent-review date) | Saved-but-unused | `scr/properties/sections/property_tabs.jsx:209-221` | — |
| 1.37 | Property utility-billing settings | Saved-but-unused | `scr/properties/sections/property_tabs.jsx:234-243` | Utility Billing does not read them. |
| 1.38 | Property marketing and leasing-office defaults, including "Accept online applications" and "Publish vacancies" | Saved-but-unused | `scr/properties/sections/property_tabs.jsx:131-158` | There is no online application or public listing for these to switch on. |
| 1.39 | Management agreement details on the property | Partial | `scr/properties/sections/property_tabs.jsx:264-299`; `scr/properties/sections/overview.jsx:52-56` | Overview alert only. The reminder job reads the owner's agreement date, not this one (`lib/messaging/reminder_jobs.js:469-476`). |
| 1.40 | Assigned team and on-site contacts | Saved-but-unused | `scr/properties/sections/property_tabs.jsx:305-333` | No routing or assignment uses them. |
| 1.41 | Construction and building-systems details | Partial | `scr/properties/sections/property_tabs.jsx:98-127`; `scr/buildings/sections.jsx:44` | Read at building level only. |
| 1.42 | Acquisition, valuation, parcel and tax fields (purchase price, current value, assessed value, APN, county, annual tax) | Saved-but-unused | `scr/properties/sections/property_tabs.jsx:52-73` | APN and county are displayed only; no valuation or tax logic. |
| 1.43 | Latitude/longitude, time zone, website | Saved-but-unused | `scr/properties/sections/property_tabs.jsx:47-48, 77-86` | — |
| 1.44 | Property overview KPIs and "needs attention" list | Working | `scr/properties/sections/overview.jsx:25-145` | — |
| 1.45 | Media library and per-record photo galleries (client-side image compression) | Working | `scr/media/config.jsx:30-44`; `scr/entity/shared_sections/media_section.jsx:18-19`; `lib/image/compress.js:3-9` | Public bucket; nothing is published externally. |
| 1.46 | Legal-entity / company layer, and region or district grouping above properties | Absent | table list in `mig/`; no `legal_entities` or region table | See 6.24 on multi-entity books. |
| 1.47 | Interactive stack plan, site map or clickable floor-plan canvas | Absent | grep `@xyflow` → only `scr/automations/canvas/*` | "Stack plan" appears only in landing-page art. |
| 1.48 | Map view of properties and geocoding | Absent | `leaflet` is declared in `package.json` but no file imports it; grep `tileLayer\|geocod\|nominatim`: no hits | — |
| 1.49 | Rentable parking-space and storage-unit inventory (leasable non-unit items) | Absent | parking and storage exist only as unit or lease text fields (`scr/units/config.jsx:159-206`; `scr/leasing/config.jsx:157-168`) | Parking can be billed only as a free-form recurring charge. |
| 1.50 | Amenity-based unit pricing; rentable vs usable square feet and load factor | Absent | covered by the greps in 1.12 and 1.24 | — |

Cross-references (not counted here): rent-control and affordable fields (8.1, 8.7); HOA dues (8.19); custom fields (9.23); data import (9.31).

**Notable absent features (module 1):** legal-entity or region hierarchy (1.46); interactive stack plan or site map (1.47); map view and geocoding (1.48); leasable parking and storage inventory (1.49); amenity-based pricing and load factors (1.50); portfolio as a ledger or report dimension (1.4).

## 2. Marketing & leasing

### 2a. Marketing, leads and applications

| # | Feature | Maturity | Evidence (path:line) | Notes / what is missing |
|---|---|---|---|---|
| 2a.1 | Listing record (unit, specs, rent, deposit, availability, copy, pets, features, terms, furnished/mid-term, tours, contact) | Working | `mig/20261010165221_full_build_tables.sql:320-338`; `lib/supabase/listings.js:5-30`; `scr/marketing/listings.jsx:106-198` | — |
| 2a.2 | Create a listing from a unit | Working | `scr/units/actions.js:41-102` | Unit features are not copied. |
| 2a.3 | Listing lifecycle (publish, unpublish, leased, relist, archive) and days on market | Working | `scr/marketing/listings.jsx:200-212, 304-319, 353-408` | "Publish" changes internal state only. |
| 2a.4 | Listing auto-marked Leased when its application converts | Working | `scr/marketing/flows.js:284-289` | — |
| 2a.5 | Listing photos and tour links | Partial | `scr/marketing/listings.jsx:181-187, 468-469` | Shown in the app only; never published. |
| 2a.6 | ILS syndication (Zillow, Apartments.com and 6 more channels) | Tracking-only | `scr/marketing/shared.js:267-285`; `scr/marketing/sections/listing_sections.jsx:157-228` ("nothing is sent", `:176-179`) | Per-channel status and URL entered by hand. |
| 2a.7 | Public listing page, property website or vacancy search | Absent | routes under `app/` are only org, pallet, playground, portal, project and the landing page | — |
| 2a.8 | Listing specials with an effective-rent calculation | Partial | `scr/marketing/sections/listing_sections.jsx:72-152` | Specials do not flow into quotes, applications or leases. |
| 2a.9 | Listing fee fields (application fee, admin fee, holding deposit, negotiable) | Saved-but-unused | `scr/marketing/sections/listing_sections.jsx:102-111` | — |
| 2a.10 | Listing lead-tracking fields (email alias, tracking phone, campaign, ad spend) | Saved-but-unused | `scr/marketing/sections/listing_sections.jsx:249-261` | No call tracking. |
| 2a.11 | Per-listing lead-source table and funnel | Working | `scr/marketing/sections/listing_sections.jsx:230-343` | — |
| 2a.12 | Fair-housing check and published screening-criteria text | Saved-but-unused | `scr/marketing/listings.jsx:124`; `scr/marketing/sections/application_sections.jsx:507` | — |
| 2a.13 | Guest card / prospect profile, consent to text, do-not-contact | Partial | `scr/marketing/prospects.jsx:96-109` | Consent and do-not-contact are not enforced, because prospects cannot be messaged from the UI (2a.23). |
| 2a.14 | Lead source and attribution on the prospect | Partial | `scr/marketing/prospects.jsx:111-120` | Campaign and referral bonus are unread. No company-wide source report (2a.59). |
| 2a.15 | Pipeline stages, stage history, auto-advance on showing / application / conversion | Working | `scr/marketing/shared.js:88-103`; `scr/marketing/flows.js:38-59, 146, 176, 265` | — |
| 2a.16 | Prospect preferences (beds, budget, move date…) | Partial | `scr/marketing/prospects.jsx:124-145` | No unit matching for prospects; the waitlist has matching (2a.51). |
| 2a.17 | Rent quotes on the prospect | Tracking-only | `scr/marketing/prospects.jsx:147-158, 593-611` | Ignored when the application converts (`scr/marketing/applications.jsx:538`). |
| 2a.18 | Unit hold with holding deposit | Tracking-only | `scr/marketing/prospects.jsx:424-458` | Unit status is unchanged; the deposit is not charged. |
| 2a.19 | Follow-up tasks with a due-date view | Partial | `scr/marketing/prospects.jsx:84-94, 160-167, 613-630` | No reminders. |
| 2a.20 | Assigned leasing agent | Saved-but-unused | `scr/marketing/prospects.jsx:103` | — |
| 2a.21 | Lost reason and re-engage date | Partial | `scr/marketing/prospects.jsx:169-175, 495-534` | No report and no reminder. |
| 2a.22 | Move a prospect onto the waitlist | Working | `scr/marketing/prospects.jsx:459-494` | — |
| 2a.23 | Email or text a prospect | Stub/placeholder | `lib/messaging/send.js:28`; `app/api/messages/send/route.js:8` | The API exists; no screen calls it. |
| 2a.24 | Lead intake from a web form, ILS email or phone | Absent | `app/api/messages/inbound/route.js:6-14` (stub) | — |
| 2a.25 | Duplicate-lead detection and merge | Absent | grep `-i "duplicate\|dedupe\|merge prospect"` in `scr/marketing` and `lib/supabase/prospects.js` (excluding row-duplicate handlers): no hits | — |
| 2a.26 | Lead scoring | Absent | grep `-i "lead.?score\|leadScore"` over components and lib: no hits | — |
| 2a.27 | Funnel KPIs on list headers | Working | `scr/marketing/flows.js:98-121` | — |
| 2a.28 | Staff schedule a showing / tour (date, time, agent) | Working | `scr/marketing/flows.js:123-149`; `scr/marketing/prospects.jsx:308-363` | — |
| 2a.29 | Showing lifecycle (confirmed, completed, no-show, cancelled) and feedback | Working | `scr/marketing/showings.jsx:110-127, 266-410` | — |
| 2a.30 | Showing confirmations and reminders | Tracking-only | `scr/marketing/showings.jsx:97-99` | Switches only; no reminder job. |
| 2a.31 | Self-guided tour access code | Tracking-only | `scr/marketing/sections/showing_sections.jsx:29-57` | No lock provider. |
| 2a.32 | Virtual tour link | Tracking-only | `scr/marketing/showings.jsx:103-108` | — |
| 2a.33 | Prospect self-scheduling, calendar sync and conflict checks | Absent | grep `-i "self.?schedul\|calendar sync\|google calendar\|\.ics"` over components, lib, app (excluding landing): no hits | Contradicts the landing claim "Prospects book a showing from open slots" (`components/landing/product_explorer.jsx:35`). |
| 2a.34 | Staff-entered rental applications | Working | `scr/marketing/applications.jsx:326-368` | — |
| 2a.35 | Online application form or applicant portal | Absent | portal roles are only resident, owner and vendor (`lib/portal/constants.js:7-32`) | Contradicts `components/landing/product_explorer.jsx:17`. |
| 2a.36 | Applicant profile and disclosures | Working | `scr/marketing/applications.jsx:115-140` | — |
| 2a.37 | Co-applicants, cosigners and guarantors, carried into lease parties | Working | `scr/marketing/applications.jsx:149-160`; `scr/marketing/flows.js:87-96, 230-256` | — |
| 2a.38 | Occupants, pets and vehicles on the application | Partial | `scr/marketing/applications.jsx:162-184` | Not carried to the tenant on conversion (`scr/marketing/flows.js:191-203`). |
| 2a.39 | Rental history and references | Tracking-only | `scr/marketing/applications.jsx:186-207` | — |
| 2a.40 | Income-to-rent qualification against policy | Working | `scr/marketing/sections/application_sections.jsx:54-111`; `scr/marketing/flows.js:68-96` | — |
| 2a.41 | Screening-criteria settings | Partial | `scr/marketing/sections/application_sections.jsx:477-528` | Eviction look-back and "allow cosigner" are unread. |
| 2a.42 | Screening results (criminal, credit, eviction, income) | Tracking-only | `scr/marketing/sections/application_sections.jsx:145-263`; `scr/marketing/applications.jsx:78-81` ("provider not connected") | Entered by hand. |
| 2a.43 | Screening provider integration | Absent | grep for bureau and vendor names finds only option labels; Integrations card disabled (`scr/settings/integrations.jsx:32`) | Contradicts landing / README claims that checks run. |
| 2a.44 | ID and fraud verification | Absent | only "ID type" and "ID last 4" text fields, unread (`scr/marketing/applications.jsx:120-121`) | — |
| 2a.45 | Income and employment verification | Tracking-only | `scr/marketing/sections/application_sections.jsx:113-134` | No bank or payroll verification. |
| 2a.46 | Application fee ledger (Paid / Waived / Refunded) | Tracking-only | `scr/marketing/sections/application_sections.jsx:265-344` | "Recorded only": no GL posting and no Stripe charge. |
| 2a.47 | Decision wizard: approve, approve with conditions, deny with adverse-action reasons | Working | `scr/marketing/applications.jsx:390-485` | — |
| 2a.48 | Adverse-action notice letter generation or sending | Absent | `scr/marketing/applications.jsx:406-407` stores only reasons and a "notice sent on" date | — |
| 2a.49 | Convert an application to tenant + draft lease + parties | Working | `scr/marketing/flows.js:181-292` | Doesn't set the unit status. Carries no fees, pets, quotes or specials. |
| 2a.50 | Waitlist queue with position and priority | Working | `scr/marketing/waitlist.jsx:58-171, 399-400` | — |
| 2a.51 | Waitlist matching to available units | Working | `scr/marketing/sections/waitlist_sections.jsx:26-50` | — |
| 2a.52 | Waitlist offers | Partial | `scr/marketing/sections/waitlist_sections.jsx:52-170` | Status set by hand; no auto-expiry; the offer is not sent; the unit is not held. |
| 2a.53 | Waitlist notifications | Tracking-only | `scr/marketing/waitlist.jsx:299-312` | Logged only. |
| 2a.54 | Waitlist fee, alert consent, entry expiry | Saved-but-unused | `scr/marketing/waitlist.jsx:139, 160-162` | — |
| 2a.55 | Waitlist → application, and auto-placement | Working | `scr/marketing/waitlist.jsx:347-397`; `scr/marketing/flows.js:269-282` | — |
| 2a.56 | Unit availability and vacancy views | Working | `scr/units/config.jsx:283-334`; `lib/reports/defs_operations.js:223-236` | — |
| 2a.57 | Pricing engine or revenue management | Absent | grep `-iw "revenue management\|yieldstar\|pricing engine\|dynamic pricing"`: no hits | — |
| 2a.58 | Rent comparables, entered by hand and adjusted for concessions | Working | `scr/marketing/rent_comps.jsx:48-123`; `scr/marketing/sections/comp_sections.jsx:13-87` | No market feed; not tied to pricing. |
| 2a.59 | Company-wide lead-source, conversion and lost-reason reports | Absent | the Leasing Report covers leases, not leads (`lib/reports/defs_operations.js:489-589`) | Per-listing funnel only (2a.11). |

**Notable absent features (2a):**
- Public listing site and ILS feeds (2a.6-2a.7).
- Online application or applicant portal (2a.35).
- Screening provider; ID and fraud checks; bank or payroll income verification (2a.43-2a.45).
- Prospect self-scheduling and calendar sync (2a.33).
- Prospect messaging from the UI (2a.23).
- Lead intake, dedupe and scoring (2a.24-2a.26).
- Call tracking (2a.10).
- Showing reminders (2a.30).
- Adverse-action letters (2a.48).
- Collecting application fees and holding deposits (2a.18, 2a.46).
- Revenue management (2a.58).
- Lead-source and lost-reason reporting (2a.59).

### 2b. Leasing: leases, documents, renewals, moves, inspections, notices

| # | Feature | Maturity | Evidence (path:line) | Notes / what is missing |
|---|---|---|---|---|
| 2b.1 | Lease record: rent, deposit, term start/end, lease type, term type; signed / move-in / notice / move-out dates; unit, tenant, property, template and renewal-of links | Working | `mig/20260708132810_leasing.sql:42-62`; `mig/20261015212441_leasing_lifecycle_columns.sql:13-18`; `lib/supabase/leases.js:6-30` | Read by the rent roll, late-fee job, reminders and resident portal. |
| 2b.2 | 10 lease statuses (Draft, Pending, Active, Expiring soon, Month-to-month, Notice given, Eviction, Renewed, Terminated, Ended) | Working | `scr/leasing/shared.js:99-115`; `scr/leasing/lease_actions.jsx:107-682` | Every status change is made by hand through a wizard. |
| 2b.3 | Automatic status changes by date (to Expiring soon, month-to-month or Ended) | Absent | server code only reads `leases` (`lib/jobs/financial.js:258, 427`; `lib/payments/posting.js:124`; `lib/portal/resident.js:34`) | No job writes lease status; "Expiring soon" is never set automatically. |
| 2b.4 | Lease types: residential, commercial | Working | `scr/leasing/shared.js:117-120`; `scr/leasing/config.jsx:133-150`; `lib/leasing/merge.js:124` | Controls which fields show, a merge field, and CAM's "commercial only" filter. |
| 2b.5 | Term types: fixed, month-to-month | Working | `scr/leasing/shared.js:122-125`; `lib/leasing/merge.js:125-128` | — |
| 2b.6 | Lease list views and KPIs (In force, Drafts, Ending ≤60 days, Notice & move-out, Month-to-month, Closed) | Working | `scr/leasing/config.jsx:186-267` | No bulk actions or list export. |
| 2b.7 | Activate wizard | Working | `scr/leasing/lease_actions.jsx:57-76, 107-191`; `lib/leasing/workflows.js:343-367` | Runs a readiness check, marks the unit Occupied and the tenant Current, schedules the move-in and inspection, and creates a "Held" deposit row. Creates no rent account (3.1). |
| 2b.8 | Lease onboarding to-do list (8 steps) | Working | `scr/leasing/sections/lease_overview.jsx:81-90` | — |
| 2b.9 | Rent schedule and escalations (dated fixed-amount or % steps; "Apply N due") | Partial (defect) | `scr/leasing/sections/lease_money.jsx:78-121`; `lib/jobs/financial.js:190`; `lib/reports/defs_operations.js:64` | Apply is manual, and no job applies due steps. It writes `leases.rent`, but billing reads `rent_accounts.rent`. The rent roll shows `leases.rent`, so the roll and what is billed can disagree. No CPI indexation. |
| 2b.10 | Convert-to-month-to-month wizard with premium | Partial (defect) | `scr/leasing/lease_actions.jsx:591-621` | Same billing disconnect as 2b.9. |
| 2b.11 | Auto-roll to month-to-month (lease `autoMtm` switch; policy `autoMonthToMonth`) | Saved-but-unused | `scr/leasing/config.jsx:130`; `lib/policies.js:105` | No reader. |
| 2b.12 | Lease "Notice required (days)" | Saved-but-unused | `scr/leasing/config.jsx:132`; `lib/leasing/merge.js:167` | The merge field uses the policy value instead. |
| 2b.13 | Lease market rent and first-rent-due date | Saved-but-unused | `scr/leasing/sections/lease_money.jsx:73-74` | — |
| 2b.14 | Premises address override | Working | `scr/leasing/config.jsx:156`; `lib/leasing/merge.js:160` | — |
| 2b.15 | Premises extras (description, furnished, parking, storage, mailbox, appliances) | Saved-but-unused | `scr/leasing/config.jsx:157-168` | — |
| 2b.16 | Commercial terms (permitted use; expense structure Gross … NNN; square feet leased; CAM per month; TI allowance; personal guarantee) | Saved-but-unused | `scr/leasing/config.jsx:133-139` | Grep `camCharges\|sqftLeased\|expenseStructure\|tiAllowance` outside the definitions: no reader. No percentage rent, CPI or recovery terms. |
| 2b.17 | Per-lease policy overrides | Working | `scr/leasing/config.jsx:413-414`; `lib/policies.js:176-191`; `lib/jobs/financial.js:289`; `lib/payments/context.js:105` | — |
| 2b.18 | Lease parties (tenant, co-signer, guarantor, occupant; primary; contacts) | Working | `mig/20261015210600_engine_foundations.sql:70-87`; `scr/leasing/sections/lease_people.jsx:40-126` | Used by the merge, the e-sign signer list, the portal, renewal copy and reminders. |
| 2b.19 | Rent responsibility % per party | Partial | `scr/leasing/sections/lease_people.jsx:46, 69-82` | Checked to total 100% and displayed. Never used to split charges or payments. |
| 2b.20 | Party extras (guarantee limit, portal switch, date of birth, maximum occupants, leasing agent, manager contact) | Saved-but-unused | `scr/leasing/sections/lease_people.jsx:23-28, 48-51` | — |
| 2b.21 | Landlord / managing-agent override on the lease | Working | `scr/leasing/sections/lease_people.jsx:23`; `lib/leasing/merge.js:153`; `scr/leasing/renewals.jsx:209` | — |
| 2b.22 | Pets on the lease | Saved-but-unused | `scr/leasing/sections/lease_people.jsx:130-182` | Pet rent is not billed from it. Vaccination reminders read tenant-level pets only (`lib/messaging/reminder_jobs.js:450-451`). |
| 2b.23 | Vehicles and parking permits on the lease | Saved-but-unused | `scr/leasing/sections/lease_people.jsx:145-206` | Same reason as 2b.22. |
| 2b.24 | Renters-insurance requirement on the lease (required, minimum liability) | Partial | `scr/leasing/sections/lease_terms.jsx:38-109`; `lib/leasing/merge.js:166` | Merged into the document. The portal, reminders and compliance report read tenant-level data instead (`lib/portal/resident.js:328-346`; `lib/messaging/reminder_jobs.js:442`; `lib/reports/sources_server.js:55-59`). |
| 2b.25 | Insurance policies recorded on the lease | Saved-but-unused | `scr/leasing/sections/lease_terms.jsx:58-70` | Every other reader looks only at tenant-level policies. |
| 2b.26 | Utilities responsibility matrix (who pays for 10 utilities) | Working | `scr/leasing/sections/lease_terms.jsx:144-253`; `lib/leasing/merge.js:118-120` | Merged into the lease document. |
| 2b.27 | Utility billing method, provider, account number and monthly fee on the lease | Saved-but-unused | `scr/leasing/sections/lease_terms.jsx:201-243` | Utility Billing does not read them. |
| 2b.28 | Access codes (keypad, smart lock, gate, fob) | Tracking-only | `scr/leasing/sections/lease_terms.jsx:257-310` | No lock provider; not shown in the portal. |
| 2b.29 | Move-in costs summary (prorated rent, deposits, fees, credits, total due) | Working (display) | `scr/leasing/sections/lease_money.jsx:385-427` | Posting is covered in 3.16. |
| 2b.30 | Deposit terms on the lease | Partial | `scr/leasing/sections/lease_money.jsx:579-584` | Deposit due date and "last month's rent collected" are unread. |
| 2b.31 | Concessions / specials on the lease (free months, amount off, percent off, one-time credit, waived fee; approved by) | Tracking-only | `scr/leasing/sections/lease_money.jsx:412-425, 532-575`; `scr/leasing/shared.js:399-405` | One-time credits only reduce the move-in "total due" display. Nothing posts a concession or reduces billed rent; grep `concession` in lib/jobs: none. Staff can post a manual credit to 4050 (`scr/accounting/ledger_dialogs.jsx:59`). |
| 2b.32 | Renewal incentive (free text) | Tracking-only | `scr/leasing/lease_actions.jsx:231`; `scr/leasing/renewals.jsx:205` | — |
| 2b.33 | Early-termination wizard, with the fee posted to the ledger (`early-term:` key) | Working | `scr/leasing/lease_actions.jsx:385-445` | — |
| 2b.34 | Early termination "fee paid" and "months forfeited" | Saved-but-unused | `scr/leasing/sections/lease_lifecycle.jsx:539-540` | — |
| 2b.35 | Lease templates (generic or state-specific; Draft / Published / Archived) | Working | `scr/leasing/lease_templates.jsx:49-56, 223-304` | — |
| 2b.36 | Merge-field catalogue (39 fields) | Working | `lib/leasing/merge.js:47-87, 103-170` | — |
| 2b.37 | Template body editor | Working | `scr/leasing/lease_templates.jsx:412-417` | Plain text; no rich text. |
| 2b.38 | Template preview against sample values or a real lease | Working | `scr/leasing/lease_templates.jsx:105-166` | — |
| 2b.39 | Template custom merge fields | Partial | `scr/leasing/lease_templates.jsx:59-61, 419-425`; `lib/leasing/workflows.js:117-123` | Preview only. Generated documents print them as `[key]`. |
| 2b.40 | Clause library; insert clauses into a lease | Working | `scr/leasing/lease_templates.jsx:170-198`; `scr/leasing/sections/lease_document.jsx:231-298` | — |
| 2b.41 | Clause "required in every lease" and "only for states" | Saved-but-unused | `scr/leasing/lease_templates.jsx:174-175` | — |
| 2b.42 | Conditional clauses or clause rules | Absent | no rule engine in `lib/leasing/merge.js` or `lib/leasing/workflows.js` | — |
| 2b.43 | Template versioning | Partial | `scr/leasing/lease_templates.jsx:307-341` | A version number and change note only. The text is not saved per version, and leases do not record the version they used. |
| 2b.44 | State requirements and disclosure checklists on templates (e.g. lead-based paint) | Tracking-only | `scr/leasing/lease_templates.jsx:428-438` | A checklist only; no enforcement. |
| 2b.45 | Template settings (default template, language, default term, legal review) | Saved-but-unused | `scr/leasing/lease_templates.jsx:442-452` | — |
| 2b.46 | Lease document generation | Partial | `lib/leasing/workflows.js:99-137`; `scr/leasing/sections/lease_document.jsx:73-120` | Merges the template into a **.txt** file (`storeTextDocument`, workflows.js:99-114) in the public bucket, visible in the resident portal. No PDF or DOCX; addenda are not merged. |
| 2b.47 | Live merged preview and copy text | Working | `scr/leasing/sections/lease_document.jsx:169-227` | — |
| 2b.48 | Per-lease document language and governing state | Saved-but-unused | `scr/leasing/sections/lease_document.jsx:48-49` | — |
| 2b.49 | Lease addenda | Tracking-only | `scr/leasing/sections/lease_document.jsx:302-335` | Not merged into the document or sent. |
| 2b.50 | E-signature requests: signers, statuses (sent, viewed, signed, declined…) | Tracking-only | `scr/leasing/sections/lease_document.jsx:341-498`; `scr/leasing/esignature.jsx:35-78`; `lib/supabase/esign.js:3-18` | "No e-signature provider is connected; statuses are updated by hand." |
| 2b.51 | Marking a request "Signed" stamps the lease's signed date | Working | `scr/leasing/sections/lease_document.jsx:393-396`; `scr/leasing/esignature.jsx:71-74` | — |
| 2b.52 | E-signature audit trail | Tracking-only | `scr/leasing/esignature.jsx:66-69` | Entries are "recorded manually". |
| 2b.53 | E-signature signing order, expiry and reminder cadence | Saved-but-unused | `scr/leasing/esignature.jsx:236-262` | — |
| 2b.54 | E-signature provider; resident or applicant signing in a portal | Absent | the Integrations card is disabled (`scr/settings/integrations.jsx:31`) | Planned to come from geiger-docs (memory full_build_decisions.md). |
| 2b.55 | Renewal offers (current vs proposed rent, 6 statuses) | Working | `scr/leasing/renewals.jsx:50-52`; `mig/20261010165221_full_build_tables.sql:604-624` | — |
| 2b.56 | Offer-renewal wizard (rent pre-filled from the target increase %) | Working | `scr/leasing/lease_actions.jsx:192-248`; `lib/leasing/workflows.js:140-165` | — |
| 2b.57 | Renewal views and KPIs | Working | `scr/leasing/renewals.jsx:242-330` | — |
| 2b.58 | Renewal offer letter draft | Partial | `scr/leasing/renewals.jsx:191-225` | Text only; not saved as a document or emailed. |
| 2b.59 | Renewal-offer email | Stub/placeholder | `lib/email/catalog.js:56-63` | Catalogue entry marked `live: false`; no sender. |
| 2b.60 | Counter-offer history | Working | `scr/leasing/renewals.jsx:382-415` | — |
| 2b.61 | Accept renewal: new lease created, recurring charges and held deposits moved across | Partial (defect) | `lib/leasing/workflows.js:167-240` | The rent account is not repointed. It stays on the old lease with the old rent, and AR stays on the old lease's ledger (see 3.1). |
| 2b.62 | Decline renewal | Working | `lib/leasing/workflows.js:243-248` | — |
| 2b.63 | Renewal chain on the lease | Working | `scr/leasing/sections/lease_lifecycle.jsx:306-384` | — |
| 2b.64 | Renewal settings on the lease | Partial | `scr/leasing/sections/lease_lifecycle.jsx:288-304`; `scr/leasing/lease_actions.jsx:204-209` | Only the target % is read. No auto-renew. |
| 2b.65 | Multiple term options in one offer | Absent | `lib/leasing/workflows.js:161` | The field exists in code; nothing writes or reads it. |
| 2b.66 | Renewal rent cap % and market rent on the offer | Saved-but-unused | `scr/leasing/renewals.jsx:548-549` | — |
| 2b.67 | Renewal-window staff alerts and "lease expiring" resident emails at 60 and 30 days | Working [job] | `lib/messaging/reminder_jobs.js:130-222` | — |
| 2b.68 | Bulk renewal offers; renewal pricing recommendations | Absent | no batch caller of the offer workflow (`lib/leasing/workflows.js:140-165`) | — |
| 2b.69 | Move records (in/out) | Working | `scr/leasing/moves.jsx:64-93` | — |
| 2b.70 | Schedule a move-in (with a linked inspection) | Working | `lib/leasing/workflows.js:251-281` | — |
| 2b.71 | Move-in checklist | Tracking-only | `lib/leasing/workflows.js:50-59` | — |
| 2b.72 | Move-in details (keys issued, utilities transferred, portal invited, welcome packet) | Saved-but-unused | `scr/leasing/sections/lease_lifecycle.jsx:131-138` | — |
| 2b.73 | Keys log on a move | Tracking-only | `scr/leasing/moves.jsx:235-240, 510-522` | — |
| 2b.74 | Utility transfers and meter readings on a move | Tracking-only | `scr/leasing/moves.jsx:224-233` | Utility Billing does not read them. |
| 2b.75 | Complete-move wizard (updates the unit, lease and tenant) | Working | `scr/leasing/moves.jsx:366-438` | — |
| 2b.76 | Notice-to-vacate wizard | Working | `scr/leasing/lease_actions.jsx:249-305` | Staff only; residents cannot give notice online (4.27). |
| 2b.77 | Move-out wizard (creates the move, inspection and unit turn, and sets the deposit deadline) | Working | `scr/leasing/lease_actions.jsx:306-384`; `lib/leasing/workflows.js:285-340` | — |
| 2b.78 | Move-out checklist | Tracking-only | `lib/leasing/workflows.js:61-70` | — |
| 2b.79 | Move-out details (forwarding address, unit-available date, lease-violated flag, remarks) | Partial | `scr/leasing/sections/lease_lifecycle.jsx:198-209` | Unit-available date, lease-violated flag and remarks are unread. |
| 2b.80 | Final account statement at move-out | Absent | only wizard wording mentions it (`scr/tenants/actions.js:209, 241`) | See also 3.18 (move-out proration) and 3.12 (billing does not stop). |
| 2b.81 | End-lease wizard | Working | `scr/leasing/lease_actions.jsx:622-657` | Leaves rent accounts and recurring charges untouched (3.12). |
| 2b.82 | Tenant-side "Move to past tenant" wizard | Partial | `scr/tenants/actions.js:201-271` | A separate path that does not update the lease record. |
| 2b.83 | Unit-to-unit transfer | Absent | grep `-i transfer` over `scr/leasing` and `lib/leasing`: only bank/ledger transfers, utility labels and the renewal carry-over switches (`scr/leasing/renewals.jsx:427-434`) | A transfer would be an end-lease plus a new lease by hand. |
| 2b.84 | Inspection records (5 types) | Working | `scr/leasing/inspections.jsx:53-111, 281-296` | — |
| 2b.85 | Room-by-room items rated on a 5-point scale | Working | `scr/leasing/sections/inspection_sections.jsx:32-42, 87-120` | Room presets are hard-coded. |
| 2b.86 | Inspection item photos | Working | `scr/leasing/sections/inspection_sections.jsx:133-141` | Public bucket. |
| 2b.87 | Inspection signatures | Tracking-only | `scr/leasing/sections/inspection_sections.jsx:358` | Typed names, not e-signatures. |
| 2b.88 | Move-out vs move-in condition comparison, pushed as itemized deposit deductions | Working | `scr/leasing/sections/inspection_sections.jsx:439-513` | See 3.58. |
| 2b.89 | Inspection report saved as a .txt document | Working | `scr/leasing/inspections.jsx:73-88, 232-253` | — |
| 2b.90 | Configurable inspection templates | Absent | presets fixed in `scr/leasing/sections/inspection_sections.jsx:32-42` | — |
| 2b.91 | Scheduled or recurring (periodic) inspections | Absent | nothing in `lib/jobs` or `lib/maintenance` creates inspections | — |
| 2b.92 | Inspection findings turned into work orders or tenant charges | Absent | inspections push damage only into deposit deductions | — |
| 2b.93 | Resident self-inspection or a mobile inspection app | Absent | no portal inspection route (`app/api/portal/`) | — |
| 2b.94 | Notices register (11 types, 6 statuses, cure-by date, overdue flag) | Working | `scr/leasing/notices.jsx:49-51, 121-245` | — |
| 2b.95 | Notice wording from 11 built-in templates (incl. pay-or-quit, eviction) | Working | `lib/leasing/notice_templates.js:4-103` | Templates are fixed in code; the amount due is typed by hand, not taken from the ledger. |
| 2b.96 | Save notice text to Documents | Working | `scr/leasing/notices.jsx:89` | — |
| 2b.97 | Service record (how and when served) | Tracking-only | `scr/leasing/notices.jsx:248-279` | — |
| 2b.98 | Delivering notices by email, portal or mail | Absent | "Email" and "Portal" are labels only (`scr/leasing/notices.jsx:248-279`) | — |
| 2b.99 | Lease violation tracking | Working | `scr/leasing/notices.jsx:139, 280-292` | — |
| 2b.100 | Violation fines or charges | Absent | no posting call in `scr/leasing/notices.jsx` | — |
| 2b.101 | Jurisdiction-specific notice periods | Absent | cure-by defaults are hard-coded | See 8.9. |
| 2b.102 | Eviction case tracker (status, filing and court dates, attorney, amounts) | Tracking-only | `scr/leasing/sections/lease_lifecycle.jsx:484-532`; `scr/leasing/lease_actions.jsx:447-540` | Online payments are blocked during an eviction (3.33). |
| 2b.103 | Escalate a served notice to eviction | Working | `scr/leasing/notices.jsx:293-325` | — |
| 2b.104 | Eviction legal-cost posting, court e-filing, attorney integration | Absent | none in `scr/leasing` or `lib/` | — |
| 2b.105 | Lease expiration reporting (Leasing Report) | Working | `lib/reports/defs_operations.js:489-590` | See module 7. |
| 2b.106 | Move activity in the Occupancy report | Working | `lib/reports/defs_operations.js:236-249` | — |
| 2b.107 | Lease approval workflow (manager sign-off before activation) | Absent | the only "approved" field in leasing is a concession's "Approved by" (`scr/leasing/sections/lease_money.jsx:540`) | — |
| 2b.108 | Third-party guarantor, deposit-alternative or insurance provider integration | Absent | grep `-i "theguarantors\|insurent\|leap guarant\|rhino\|jetty"` over lib and components: no hits | The deposit alternative is tracking-only (3.64). |

Cross-references (not counted here): billing defects on per-lease recurring charges (3.7-3.12); move-in posting and first-month proration (3.16-3.17); deposit records, disposition and return deadline (3.55-3.60); housing-assistance fields (8.2); lease automation triggers (9.15).

**Notable absent features (2b):**
- **Lifecycle automation:** no automatic status changes or month-to-month rollover at term end (2b.3, 2b.11).
- **Transfers:** no unit-to-unit transfer flow (2b.83).
- **Move-out money:** no final account statement (2b.80).
- **Signing and output:** no e-signature provider or portal signing (2b.54); no PDF or DOCX lease output (2b.46).
- **Templates:** no conditional clauses (2b.42).
- **Concessions:** never billed (2b.31).
- **Renewals:** no multiple term options, bulk offers or pricing recommendations (2b.65, 2b.68).
- **Notices:** no delivery, fines or jurisdiction rules (2b.98, 2b.100, 2b.101).
- **Inspections:** no inspection templates or scheduling, no work orders from findings, no mobile inspections (2b.90-2b.93).
- **Approvals and integrations:** no lease approval (2b.107); no guarantor or deposit-alternative provider integration (2b.108).
- **Eviction:** no court or e-filing integration (2b.104).

## 3. Resident billing & receivables

| # | Feature | Maturity | Evidence (path:line) | Notes / what is missing |
|---|---|---|---|---|
| **Rent and recurring billing** | | | | |
| 3.1 | Rent account: the billed rent obligation per lease or tenant, whose ledger balance is the lease's AR | Partial | `scr/accounting/rent_collection.jsx:293-412`; `lib/supabase/rent_collection.js:7-25` | Created by hand only. No lease activation, application conversion or renewal creates or updates one. Rent is copied once, and the only other writers set autopay fields (`lib/payments/fulfill.js:250-254`; `lib/payments/autopay.js:263`). Root cause of 2b.9, 2b.10 and 2b.61. |
| 3.2 | "Post this month's rent" (manual, idempotent key `rent:<acct>:<YYYY-MM>`) | Working | `scr/accounting/rent_collection.jsx:88-100, 417-434` | — |
| 3.3 | Auto-post rent | Partial [job] | `lib/jobs/financial.js:189-225`; `scr/accounting/rent_collection.jsx:398-412, 495` | Opt-in per account (`metadata.autoPostRent`, off by default). Monthly only. Ignores lease status, lease end and account status. |
| 3.4 | Rent account frequency (Weekly / Biweekly / Quarterly) | Saved-but-unused | `scr/accounting/rent_collection.jsx:59-64, 483-487` | The job never reads `rent_accounts.frequency`; its key is per month (`lib/jobs/financial.js:200`). |
| 3.5 | Recurring Charges screen: Monthly / Quarterly / Annually / One-time, GL income account, post next occurrence, void a posting | Working | `scr/accounting/recurring_charges.jsx:46-61, 64-120, 189-198`; `scr/accounting/shared.js:124, 143` | This screen's frequencies match the job's map. |
| 3.6 | Recurring-charge auto-post with catch-up (up to 24 occurrences, key `rc:<id>:<date>`) | Working [job] | `lib/jobs/financial.js:128-187` | Skips rows with `autoPost === false` (`:139`). |
| 3.7 | Per-lease "Charges" tab: frequency | Partial (defect) | `scr/leasing/shared.js:385`; `scr/leasing/sections/lease_money.jsx:172`; `lib/jobs/financial.js:24, 144` | Offers Semi-annually and Weekly, and the job bills both as monthly (`FREQUENCY_MONTHS[...] ?? 1`). |
| 3.8 | Per-lease "Charges" tab: GL account | Partial (defect) | `scr/leasing/sections/lease_money.jsx:175`; `lib/supabase/options.js:86-93`; `lib/supabase/recurring_charges.js:16-17`; `lib/jobs/financial.js:157` | The pick is stored as a text label in `account`, never in `gl_account_id`, so these charges post to the default income account. |
| 3.9 | Recurring charge end date (`endsOn`) | Saved-but-unused | `scr/leasing/sections/lease_money.jsx:174`; `scr/leasing/adapters.js:7-16` | Grep `endsOn` in lib/jobs: none. Charges bill past their end date. |
| 3.10 | "Prorate the first charge" switch | Saved-but-unused | `scr/leasing/sections/lease_money.jsx:186` | — |
| 3.11 | "Show in resident portal" switch on a charge | Saved-but-unused | `scr/leasing/sections/lease_money.jsx:187` | — |
| 3.12 | Stop billing at lease end or move-out | Absent | `scr/leasing/lease_actions.jsx:623-652`; `scr/leasing/moves.jsx:405`; `lib/jobs/financial.js:133-135, 190` | Ending a lease leaves charges and rent accounts active; neither job checks lease status. |
| 3.13 | Resident benefits package billed as one recurring charge | Working | `scr/leasing/sections/lease_money.jsx:225-265` | Package components are labels only. |
| **One-time charges and proration** | | | | |
| 3.14 | Staff ad-hoc charge on a lease or tenant ledger, with an income GL picker | Working | `scr/accounting/ledger_section.jsx:65-67`; `scr/accounting/ledger_dialogs.jsx:56, 203-276`; `lib/ledger/postings.js:203-219` | — |
| 3.15 | Charge codes | Partial | `scr/accounting/ledger_dialogs.jsx:56` | No charge-code table. Classification is by GL income account, plus a `chargeType` metadata label. |
| 3.16 | Move-in posting: prorated first month plus unpaid one-time move-in fees (keys `movein:<lease>:*`) | Working | `scr/leasing/sections/lease_money.jsx:368-377, 410, 430-463` | Manual button. Excludes the security deposit (3.56). |
| 3.17 | First-month proration (actual days, or a 30-day month) | Working | `lib/policies.js:46-59, 205-212`; `scr/leasing/sections/lease_money.jsx:410, 438` | Move-in only. Risk: auto-rent posts full rent under a different key, so the move-in month can be billed twice. |
| 3.18 | Move-out (final-month) proration | Absent | grep `-i prorat` over lib, components, app: only the policy, lease_money, merge.js and a nav label | — |
| 3.19 | Mid-term proration on charge or rent changes | Absent | same grep | — |
| **Late fees** | | | | |
| 3.20 | Late-fee policy: flat, percent of rent, initial + daily, or none; grace days; maximum; company → property → lease cascade | Working | `lib/policies.js:26-44, 193-203` | — |
| 3.21 | Automated late-fee assessment, once per lease per month (`late:<lease>:<YYYY-MM>`) | Working [job] | `lib/jobs/financial.js:253-333` | Percent fees use `lease.rent` (`:295`). Any open charge dated on or before the due date triggers it. No minimum balance. Still charges leases in Eviction (`:23`). |
| 3.22 | Daily late-fee accrual | Partial (defect) | `lib/policies.js:200`; `lib/jobs/financial.js:290-300` | The monthly key blocks every day after the first assessment, so the daily amount never accrues. |
| 3.23 | Manual "Post late fee" (same key as the job, so they dedupe) | Working | `scr/accounting/rent_collection.jsx:102-185` | — |
| 3.24 | Late notice email when a fee is assessed | Working [job] | `lib/jobs/financial.js:231-251, 326`; `lib/email/notifications.js:52-67` | — |
| 3.25 | Per-tenant "Late fee exempt" | Saved-but-unused | `scr/tenants/shared.js:102` | Grep `lateFeeExempt`: definition only. |
| 3.26 | Late-fee waiver | Partial | `scr/accounting/ledger_dialogs.jsx:59, 366-430` | No waive action. Staff void the entry or post a credit. |
| **Receiving money** | | | | |
| 3.27 | Manual payment entry: ACH, check, card, cash, money order, wire; reference #; deposit bank account | Working | `scr/accounting/ledger_dialogs.jsx:52, 58, 303-333`; `lib/ledger/postings.js:221-242` | — |
| 3.28 | Payment allocation: oldest-first by default, manual per-charge override for staff | Working | `lib/ledger/postings.js:561-573`; `scr/accounting/ledger_dialogs.jsx:141-196, 264`; `lib/payments/posting.js:62-63` | Online and autopay are oldest-first only. No priority by charge type. |
| 3.29 | Unapplied credits and prepaid rent | Partial | `lib/ledger/postings.js:234-235, 539`; `lib/reports/ledger_math.js:296-297` | The remainder stays on AR as "Unapplied credit". Nothing posts to 2200 Prepaid Rent. Credits are not auto-applied to later charges. |
| 3.30 | Receipts for manual (office) payments | Absent | grep `receipt` over `scr/accounting` and `lib/supabase/ledger.js`: 0 hits | Online receipts: 4.20. |
| 3.31 | Deposit batching, deposit slips, undeposited funds | Absent | grep `-iE "deposit slip\|deposit_batch\|undeposited\|bank deposit"`: 0 hits | Online payments post gross straight to the bank's GL (`lib/payments/posting.js:26-39`). |
| 3.32 | Tenant payment restrictions (no online, certified funds only, no partial, no checks) | Partial | `scr/tenants/shared.js:41-48`; `lib/payments/context.js:151-163`; `lib/payments/checkout.js:60`; `lib/portal/resident.js:17-18` | Enforced on online payments only. "No checks" is display-only. Staff manual entry checks none of them. |
| 3.33 | Online payments blocked during an eviction (policy `blockAfterEviction`) | Working | `lib/payments/context.js:148-150`; `lib/policies.js:78` | — |
| 3.34 | Online partial-payment policy and maximum amount | Working | `lib/payments/context.js:156-163` | — |
| 3.35 | Convenience fees (card %, flat ACH), shown at checkout and posted as Other Income | Working | `lib/payments/context.js:129-136`; `lib/payments/posting.js:83-106` | — |
| 3.36 | Staff payment links (14-day token) and "take payment now" | Working | `scr/payments/collect_payment.jsx:28-40`; `lib/payments/checkout.js:16, 216-290`; `app/api/payments/link/[token]/route.js` | — |
| 3.37 | Refunds: a full refund voids the payment; a partial one re-opens AR; refunds made in the Stripe dashboard arrive via webhook | Working | `lib/payments/refunds.js:18-77`; `lib/payments/fulfill.js:321-330` | — |
| 3.38 | ACH credited on submit or on settlement (setting) | Working | `lib/payments/constants.js:189-190`; `lib/payments/fulfill.js:188-189` | — |
| 3.39 | Autopay charges the open balance (or a fixed amount, with a cap) on the due day + offset | Working [job] | `lib/payments/autopay.js:316-416`; `lib/jobs/autopay.js:45` | Resident enrolment: 4.16. |
| 3.40 | `payment.received` automation event | Partial | `lib/payments/fulfill.js:176`; `mig/20261015214949_fix_record_event_trigger_array_append.sql:38-43` | Fires for online payments and `transactions` rows. Manual ledger payments emit nothing. |
| **NSF, returns and disputes** | | | | |
| 3.41 | Online ACH return or failure: voids the payment and fee entries (charges re-open), charges the policy NSF fee (ACH only), flags the tenant, switches to certified funds after N returns, pauses autopay after N failures, emits `payment.returned` | Working | `lib/payments/fulfill.js:93-144`; `lib/payments/posting.js:120-160, 268-283`; `lib/payments/constants.js:199-201` | — |
| 3.42 | Card dispute: ledger void with no NSF fee; a won dispute re-posts (`:reinstated`) | Working | `lib/payments/fulfill.js:332-360` | — |
| 3.43 | Returned check or other manual-payment NSF | Partial | `scr/accounting/ledger_dialogs.jsx:366-430` | Void only. No automatic NSF fee, tenant flag or restriction. |
| 3.44 | Tenant `nsfCount` field | Saved-but-unused | `scr/tenants/shared.js:103` | The webhook writes `metadata.returnedPayments` instead (`lib/payments/posting.js:273-277`). |
| **Delinquency and collections** | | | | |
| 3.45 | Delinquency report from ledger AR: 0-30 / 31-60 / 61-90 / 90+ buckets, unapplied credit, last payment, collected in the last 30 days | Working | `lib/reports/defs_operations.js:134-196`; `lib/reports/ledger_math.js:250-300` | — |
| 3.46 | Rent Collection views (Owing, In credit, Autopay) and stats on the ledger balance | Working | `scr/accounting/rent_collection.jsx:224-291`; `lib/supabase/rent_collection.js:32-44` | — |
| 3.47 | Balances in the Tenants list and the Overview "needs attention" panel | Partial (defect) | `scr/tenants/config.jsx:106-124`; `scr/overview/property_overview.jsx:110, 791, 808-814`; `scr/accounting/shared.js:61-74` | Uses rent accounts without ledger balances (legacy metadata fallback), not GL AR. See 7.26. |
| 3.48 | "Overdue" and "In collections" statuses on rent accounts | Tracking-only | `scr/accounting/shared.js:36-43`; `mig/20260715161203_rent_collection.sql:45` | Set by hand only. |
| 3.49 | "Collections follow-up" workflow (`rent.overdue` → email → wait → notify team) | Partial (defect) | `lib/automations/catalog.js:46-57, 341-360`; `lib/automations/runner.js:188-199` | The trigger reads `tenants.balance` (`runner.js:191`), which nothing syncs from the ledger (only explicit patches write it, `lib/supabase/tenants.js:67`). |
| 3.50 | Collections-agency placement or export | Absent | grep `sentToCollections\|collectionAgency\|collections_agency`: 0 hits | — |
| 3.51 | Payment plans or promise-to-pay | Absent | grep `-iE "payment.?plan\|promise.?to.?pay\|installment\|repayment"` (excluding autopay): only the deposit-alternative "installments" label (`scr/leasing/shared.js:420`) | — |
| 3.52 | Write-off to bad debt | Partial | `scr/accounting/ledger_dialogs.jsx:59`; `lib/ledger/postings.js:244-259`; `mig/20261015212744_ledger_core.sql:494` | No write-off action. A generic credit against an expense account such as 5800 Bad Debt works. No recovery tracking. Grep `write.?off\|bad_debt`: chart seed only. |
| **Resident statements** | | | | |
| 3.53 | Printable or emailable resident statement | Absent | `lib/email/catalog.js:102-107` (only `owner_statement`); `components/portal/resident/resident_payments.jsx:227` ("Contact the office for a statement") | The portal ledger view is 4.13. |
| 3.54 | Tenant "statement delivery" and "receives statements" preferences | Saved-but-unused | `scr/tenants/shared.js:88, 217` | — |
| **Security deposits** | | | | |
| 3.55 | Deposit records per lease (kind, held at, received, status); used by moves, inspections, the Deposit Detail report and renewal carry-over | Working | `scr/leasing/security_deposits.jsx:376-552`; `scr/leasing/sections/lease_money.jsx:586-655`; `lib/leasing/workflows.js:232-234` | A record table, separate from the GL. |
| 3.56 | Deposit received posted to the GL (Dr 1020 / Cr 2100) | Stub/placeholder | `lib/ledger/postings.js:356-371`; `lib/supabase/ledger.js:378`; `scr/accounting/ledger_dialogs.jsx:64` | The builder and dialog exist, but there is no caller: no ledger-section action list includes `deposit_held` (`scr/accounting/ledger_section.jsx:65-74`), and move-in posting excludes deposits. Only a manual journal entry (6.8) can book it. |
| 3.57 | Deposit return / disposition posted to the GL | Stub/placeholder | `lib/ledger/postings.js:373-390`; `lib/supabase/ledger.js:379` | No caller. The Return wizard updates the record and saves a letter only (`scr/leasing/security_deposits.jsx:448-494`). |
| 3.58 | Itemized deductions, auto-added from the move-in vs move-out inspection comparison | Working | `scr/leasing/security_deposits.jsx:277-311`; `scr/leasing/sections/inspection_sections.jsx:486-512`; `lib/leasing/workflows.js:390-400` | — |
| 3.59 | Deposit disposition letter saved to Documents | Working | `scr/leasing/security_deposits.jsx:215-275` | Not emailed or mailed. |
| 3.60 | Deposit return deadline (policy days after move-out), with overdue badges and views | Working | `scr/leasing/security_deposits.jsx:57-68, 190-213, 427-446`; `scr/leasing/lease_actions.jsx:351-372` | One configured number of days (default 30); no per-state statutory values. |
| 3.61 | Interest on the deposit record (simple interest at the policy or override rate) | Partial | `scr/leasing/security_deposits.jsx:70-78, 132-175` | Computed on the record only; not posted. "Interest paid annually" is unused. |
| 3.62 | Deposit-interest accrual (Dr 5600 / Cr 2110) | Partial [job] | `lib/jobs/financial.js:422-490, 517-519`; `lib/ledger/postings.js:392-407` | Accrues on GL deposit balances, which no UI path creates (3.56). Not credited to the tenant. Ignores the record's interest-bearing flag. |
| 3.63 | Deposit Detail report: records vs ledger, flags "unposted" records | Working | `lib/reports/defs_financial.js:470-560` | Given 3.56, most records will show as unposted. |
| 3.64 | Deposit alternatives (surety bond, deposit insurance, installments) | Tracking-only | `scr/leasing/sections/lease_money.jsx:600-621, 661-705` | No provider. The monthly fee can be billed through a recurring charge. |
| 3.65 | `depositHeldIn` policy | Saved-but-unused | `lib/policies.js:111-122` | — |
| 3.66 | Deposit due date, last month's rent collected, interest paid annually | Saved-but-unused | `scr/leasing/sections/lease_money.jsx:582-583`; `scr/leasing/security_deposits.jsx:167` | — |
| **Utility billing** | | | | |
| 3.67 | RUBS: split a utility bill by square feet, occupants or equal share; per-lease include and override; posts per-lease charges (4030, key `rubs:`); void; copies the source bill's total | Working | `scr/accounting/utility_billing.jsx:31-96, 165-235, 316, 425` | — |
| 3.68 | RUBS vacancy share, common-area deduction, admin fee, caps | Absent | `scr/accounting/utility_billing.jsx:47, 54-75` | Only active leases are included, and 100% of the bill is allocated to them. |
| 3.69 | Submetering or meter-read billing | Absent | meter readings are saved fields only (`scr/leasing/moves.jsx:226-230`; `scr/properties/record_kinds.js:179-208`) | — |
| 3.70 | Recurring or automated RUBS runs | Absent | no such job in `lib/jobs/registry.js:7` | — |
| **CAM as a receivable** | | | | |
| 3.71 | Monthly CAM estimate billing from lease terms | Partial | `scr/leasing/config.jsx:133-139` (`camCharges` unread) | Only through a hand-made recurring charge. The year-end true-up is 6.75. |

Cross-references (not counted here): escalation, month-to-month and renewal rent disconnects (2b.9, 2b.10, 2b.61); concessions (2b.31); early-termination fee (2b.33); eviction tracking (2b.102); resident portal ledger, receipts and autopay enrolment (4.13, 4.16, 4.20); rent reminder emails (4.51); Stripe processor fees and payouts (6.63); CAM true-up (6.75).

**Policy keys: read vs unused** (company → property → lease cascade, `lib/policies.js`)

| Key | Status | Reader |
|---|---|---|
| rentDueDay | Read | `lib/jobs/financial.js:290`; `lib/payments/autopay.js:34`; reminder jobs; `lib/automations/runner.js:196` |
| graceDays, lateFeeType, lateFeeAmount, dailyLateFee, maxLateFee | Read | `computeLateFee` (`lib/policies.js:193-203`), called by `lib/jobs/financial.js:295` and `scr/accounting/rent_collection.jsx:125`. The daily component is defective (3.22). |
| nsfFee | Read | `lib/payments/posting.js:136` (Stripe ACH only); `lib/leasing/merge.js:136` |
| prorateFirstMonth, prorationMethod | Read | `scr/leasing/sections/lease_money.jsx:410`; `lib/leasing/merge.js:132` (move-in only) |
| paymentMethods, allowPartialPayments, certifiedFundsOnly, blockAfterEviction, cardFeePct, achFee | Read | `lib/payments/context.js:70-73, 129-163` (online only) |
| autopayRequired | Display only | `lib/payments/autopay.js:306`; `scr/payments/autopay_panel.jsx:194` (not enforced) |
| depositReturnDays | Read | security deposits, lease actions, moves |
| depositInterestRate | Read | `lib/jobs/financial.js:459`; `scr/leasing/security_deposits.jsx:135` |
| managementFeePct, managementFeeMin | Read | `lib/jobs/financial.js:386-387` |
| ownerApprovalLimit, entry-permission defaults | Read | maintenance (5.14, 5.27) |
| moveOutNoticeDays, mtmPremium | Merge fields only | `lib/leasing/merge.js:137, 167` |
| depositHeldIn, renewalFee, leasingFeePct, ownerReserve, ownerDistributionDay, autoMonthToMonth, defaultLeaseTermMonths, petsAllowed, after-hours emergency line | Unused | grep finds no reader outside `lib/policies.js` |

**Notable absent features (module 3):**
- **Collections:** payment plans and promise-to-pay (3.51); collections-agency placement (3.50).
- **Write-offs and NSF:** no dedicated write-off action (3.52); no NSF fee or flag on manual-payment returns (3.43).
- **Statements and receipts:** printable resident statement (3.53); office-payment receipts (3.30).
- **Proration and billing stops:** move-out and mid-term proration (3.18, 3.19); billing does not stop at lease end (3.12).
- **Deposits:** no GL posting of deposits held or returned (3.56, 3.57).
- **Banking:** deposit batching and undeposited funds (3.31).
- **Utilities:** RUBS refinements (3.68); submetering (3.69); automated RUBS (3.70).
- **Other:** charge codes (3.15); prepaid-rent posting (3.29); charge-priority allocation (3.28).

## 4. Resident experience

| # | Feature | Maturity | Evidence (path:line) | Notes / what is missing |
|---|---|---|---|---|
| **Portal infrastructure** | | | | |
| 4.1 | Passwordless portal sign-in (email code or magic link), invite-only | Working | `lib/portal/auth.js:16-35, 49-104`; `components/portal/login_screen.jsx:29-52`; `app/api/portal/auth/otp/route.js`; `app/api/portal/auth/verify/route.js`; `app/portal/auth/callback/route.js` | Only emails with a live membership in a project whose portal is on can sign in. |
| 4.2 | Staff invite, re-invite and disable of portal access per tenant (owners and vendors use the same path) | Working | `lib/portal/invite.js:57-170`; `app/api/portal/staff/access/route.js:7-21`; `scr/tenants/actions.js:41-50` | One at a time; no bulk invite. The invite email bypasses the notification toggle (`lib/portal/invite.js:101`). |
| 4.3 | Per-project on/off switch for each portal (resident, owner, vendor) | Working | `scr/settings/branding_portals.jsx:17-19, 101-112`; `lib/portal/session.js:37-38` | — |
| 4.4 | Per-resident permissions: pay online, submit requests, see documents, message the office, show ledger | Working | `scr/tenants/sections/portal.jsx:14-19`; `lib/portal/resident.js:14-24` | Hiding the ledger hides the rows but still shows the balance. |
| 4.5 | One login with several memberships, plus a switcher | Working | `lib/portal/session.js:47-63`; `components/portal/portal_shell.jsx:55-94` | — |
| 4.6 | Portal data scoped on the server to the member's own records | Working | `lib/portal/session.js:6-9`; `lib/portal/resident.js:8-9, 193-196` | — |
| 4.7 | Portal activity log and "last seen" on the tenant | Working | `lib/portal/common.js:248-255`; `lib/portal/session.js:65-88` | — |
| 4.8 | Portal branding: display name, logo (URL field), welcome text | Working | `components/portal/portal_topbar.jsx:34-38`; `components/portal/resident/resident_home.jsx:91` | No logo upload. |
| 4.9 | Portal branding: accent colour | Saved-but-unused | `scr/settings/branding_portals.jsx:72-93`; `lib/portal/session.js:122` | No portal component reads `brand.accent`. |
| 4.10 | Portal branding: support email and phone | Partial | `lib/portal/invite.js:114-115` | Used only in the invite email; never shown in the portal. |
| 4.11 | Custom domain or white-label portal URL | Absent | grep `custom.?domain\|subdomain\|cname`: nothing | — |
| **Home, ledger and payments** | | | | |
| 4.12 | Resident home: balance, open requests, lease-end countdown, insurance state, recent activity, announcements, autopay | Working | `app/api/portal/resident/overview/route.js:15-42`; `components/portal/resident/resident_home.jsx:63-191` | — |
| 4.13 | Resident ledger with running balance from the GL, open charges and credit on account | Working | `lib/portal/resident.js:76-110`; `components/portal/resident/resident_payments.jsx:191-228` | Falls back to the tenant's stored balance when there are no ledger lines. |
| 4.14 | One-time online payment through Stripe hosted checkout, by card and/or ACH (bank verified through Stripe), amount chosen within the partial-payment and maximum rules, convenience fee shown per method | Working | `components/portal/resident/resident_payments.jsx:19-94`; `lib/payments/checkout.js:60, 75-208`; `lib/payments/context.js:128-165` | Redirects to Stripe; not embedded. Payment rules: 3.32-3.35. |
| 4.15 | Saving and managing payment methods | Partial | `lib/payments/checkout.js:172, 187` | The method is saved only on the Stripe customer. There is no portal screen to list, reuse or remove it, and autopay uses its own separate setup. |
| 4.16 | Autopay self-enrolment (card or ACH) and cancellation | Working [job] | `components/portal/resident/resident_payments.jsx:96-161`; `lib/payments/autopay.js:55-161, 245-265`; `lib/jobs/autopay.js:45` | Pauses after repeated failures (`lib/payments/fulfill.js:66`). |
| 4.17 | Resident chooses the autopay amount, cap or charge day | Partial | `lib/portal/payments.js:152-162` | Supported by the library, but the portal always enrols "pay the balance on the due day". Only a staff-sent link can set these. |
| 4.18 | Autopay status (method, next charge date, last run) | Working | `lib/payments/autopay.js:288-310` | — |
| 4.19 | Online payment history (last 50, with status) | Working | `lib/portal/resident.js:113-150` | — |
| 4.20 | Receipt email when an online payment settles | Working | `lib/payments/posting.js:288-320`; `lib/payments/fulfill.js:177` | The Notifications screen still says "Not sent automatically yet" (`lib/email/catalog.js:30-37`, `live: false`), which is stale. |
| 4.21 | Downloadable or printable payment receipts in the portal | Absent | no print or download in `components/portal/resident/` | Statements: 3.53. |
| 4.22 | Emailed autopay sign-up link | Working | `lib/payments/autopay.js:165-215` | — |
| 4.23 | Cash or retail payment network; Apple Pay / Google Pay explicitly configured | Absent | checkout passes only card and US bank account (`lib/payments/checkout.js:190-198`) | — |
| **Lease and documents** | | | | |
| 4.24 | Lease summary (rent, deposit, dates, status) and lease history | Working | `components/portal/resident/resident_lease.jsx:37-70` | — |
| 4.25 | Portal documents: tenant files, lease documents (including generated leases) | Working | `lib/portal/resident.js:295-307`; `lib/portal/common.js:58-81`; `scr/leasing/sections/lease_document.jsx:73-88` | — |
| 4.26 | Hiding a document from the portal | Partial | `lib/portal/common.js:73, 80` | The server filters on an "internal" flag, but no staff screen sets it, so every tenant and lease document is visible. |
| 4.27 | Resident accepts a renewal or gives notice to vacate online | Absent | no portal route for either; the only "renew" text in the portal is a status label (`components/portal/resident/resident_lease.jsx:16`) | The renewal-offer email is not live (2b.59). |
| **Maintenance requests (resident side)** | | | | |
| 4.28 | Submit a request: title, category, area, description, emergency (forces Urgent), entry permission, preferred times, pets, access notes, phone, photos | Working | `lib/portal/resident.js:200-250`; `components/portal/resident/resident_requests.jsx:41-115` | Staff see these fields (`scr/maintenance/sections/wo_general.jsx:203-218`). |
| 4.29 | Track a request: status, timeline, scheduled date, before/after photos | Working | `lib/portal/resident.js:154-183` | Staff names and owner notes are hidden. |
| 4.30 | Resident follow-up comments and photos on a request | Partial | `lib/portal/resident.js:262-268, 289` | The comment text is stored, but no staff screen shows it (only an activity line), and staff cannot reply. Added photos do reach staff. |
| 4.31 | Resident cancels a request before work starts | Working | `lib/portal/resident.js:269-279` | — |
| 4.32 | Work-order status emails to the resident | Absent | `lib/email/catalog.js:65-73` (`work_order_update`, `live: false`) | Only a hand-built workflow can email on created/completed. |
| **Renters insurance (resident side)** | | | | |
| 4.33 | Resident uploads a policy (carrier, dates, coverage, interested party, declarations page) for staff review | Working | `lib/portal/resident.js:348-382`; `components/portal/resident/resident_insurance.jsx:17-78` | Upload only. Staff-side tracking and reminders: 8.13-8.14. |
| 4.34 | Insurance requirement and minimum liability shown to the resident | Partial | `lib/portal/resident.js:340-345` | Reads the tenant record only; the lease's own requirement fields are ignored (2b.24). |
| 4.35 | Insurance carrier integration, verification feed or in-portal purchase | Absent | no provider code; grep for insurer names: none | — |
| 4.36 | Master policy or force-placed coverage | Tracking-only | `scr/leasing/sections/lease_terms.jsx:41-51`; `scr/leasing/shared.js:388-397`; `scr/leasing/sections/lease_money.jsx:238-261` | "Master policy" is a dropdown option plus a $12 line inside the benefits-package charge. No carrier, no auto-enrolment on lapse, no force-placed charge. |
| 4.37 | Rent (credit) reporting enrolment | Tracking-only | `scr/tenants/sections/insurance.jsx:55-69` | "Reporting provider not connected." |
| **Communications** | | | | |
| 4.38 | Resident messages the office from the portal | Partial | `lib/portal/common.js:102-188`; `components/portal/shared/portal_messages.jsx:16-34` | Staff see the text only in the tenant communications log. Office messages reach the thread only from automation steps (`lib/automations/runner.js:273-286`). No attach button in the portal. |
| 4.39 | Staff inbox to read and reply to portal threads | Absent | removed 2026-10-20 (memory communications_chat.md); no component reads the thread tables | — |
| 4.40 | Staff one-to-one email to a resident (template plus merge fields) | Partial | `app/api/messages/send/route.js`; `lib/messaging/send.js:43-181` | Works on the server, but no screen calls it. |
| 4.41 | Tenant communications log (manual entries plus auto-logged messages) | Working | `scr/tenants/sections/communications.jsx:30-61`; `lib/messaging/send.js:107-118` | Manual entries are a record, not a delivery. |
| 4.42 | Announcements feed in the portal (all tenants, one property, one building; owners; vendors) | Working | `lib/portal/common.js:14-43` | Read side only. |
| 4.43 | Staff screen to write or send announcements | Absent | removed 2026-10-20; no component calls `app/api/messages/announce` | — |
| 4.44 | Announcement delivery: per-recipient email, delivery stats, scheduled sends | Partial [job] | `lib/messaging/announcements.js:27-164`; `app/api/messages/announce/route.js`; `lib/messaging/reminder_jobs.js:520-542` | No screen calls it. SMS is not sent. No targeting by unit, lease status or list. No open tracking, although the landing page claims it (`components/landing/product_explorer.jsx:55`). |
| 4.45 | Message templates with merge fields | Partial | `lib/messaging/merge_fields.js:7-76`; `lib/messaging/send.js:17-26, 60-68`; `scr/automations/messaging_kit.jsx:21-56` | Templates can only be picked inside workflow steps. The template editor screen was removed on 2026-10-20. |
| 4.46 | Email delivery through geiger-dash and Resend, with per-project notification toggles | Working | `lib/email/client.js:18-52`; `lib/email/notifications.js:52-67`; `lib/email/catalog.js:19-128` | — |
| 4.47 | SMS delivery | Stub/placeholder | `lib/messaging/deliver.js:22-25` | Records "not sent"; no provider chosen. |
| 4.48 | Inbound email or SMS replies | Stub/placeholder | `app/api/messages/inbound/route.js:6-13` | Not wired to a provider. |
| 4.49 | Resident edits profile and contact preferences (phones, language, email and SMS opt-in, quiet hours) | Working | `lib/portal/common.js:192-245`; `components/portal/shared/portal_profile.jsx:17-91` | Stored and visible to staff. |
| 4.50 | Sending respects opt-out, SMS consent, quiet hours or preferred channel | Absent | `lib/email/notifications.js:52-67` checks only project toggles; nothing else in `lib/` reads these preferences | — |
| 4.51 | Rent reminder email a few days before the due date | Working [job] | `lib/messaging/reminder_jobs.js:227-290` | The amount comes from the lease rent, and the balance merge field reads the stale `tenants.balance` (`:272`). |
| 4.52 | Pet-vaccination and parking-permit expiry reminders (30 and 0 days) | Working [job] | `lib/messaging/reminder_jobs.js:449-458` | Tenant-level pets and vehicles only. |
| 4.53 | Notifications settings: toggles, alert recipients, reminder timing, integration status | Working | `scr/settings/notification_settings.jsx:20-31, 163, 174-204` | The "not sent yet" badges on receipts and portal invites are wrong; both are sent. |
| 4.54 | In-portal notifications (unread badges, live updates) | Absent | no realtime or badge code in `components/portal/` | — |
| **Amenities and community** | | | | |
| 4.55 | Amenity booking rules (hours, durations, lead time, approval…) | Partial | `scr/amenities/sections/booking.jsx:15-31`; `scr/amenities/shared.js:119-155` | The staff booking dialog enforces most rules. The free-cancellation window, guest limit, maximum occupancy and rules text are saved but never checked. |
| 4.56 | Amenity reservations with approve, decline and cancel, plus a community calendar | Working (staff only) | `scr/amenities/sections/reservations.jsx:22-60`; `scr/amenities/shared.js:213-231`; `scr/amenities/community_calendar.jsx:105-146, 212` | Staff book on a resident's behalf. |
| 4.57 | Residents book amenities themselves in the portal | Absent | `components/portal/portal_nav.js:17-36` has no amenity page; no portal route | — |
| 4.58 | Amenity booking fee and deposit charged | Saved-but-unused | `scr/amenities/shared.js:206-208, 225-226` | Stored on the reservation; never posted. |
| 4.59 | Resident events on the staff community calendar | Working (staff only) | `lib/supabase/resident_events.js:5-21`; `scr/amenities/community_calendar.jsx:236` | — |
| 4.60 | Event list or RSVP for residents | Absent | no portal event route | — |
| 4.61 | Package and parcel management | Absent | only a "mailroom" switch on buildings (`scr/buildings/sections.jsx:120`) and a "Package lockers" amenity label (`scr/marketing/shared.js:235`) | — |
| 4.62 | Community board, resident surveys, referral or rewards programme | Absent | grep `survey\|referral\|community board` in components/portal and lib/portal: none | — |
| 4.63 | Guest and visitor access; smart-lock or access-control integration | Absent | the smart lock is a text field (`scr/units/config.jsx:225`; `scr/amenities/config.jsx:79`) | — |
| **Staff team chat (Communications screen, staff only)** | | | | |
| 4.64 | Direct messages, channels, threads, mentions, reactions, edit and delete, typing and presence, realtime | Working | `mig/20261019205301_chat_workspace.sql:24-189, 314-319`; `scr/communications/communications.jsx:23-35` | A port of Flow's Grounding chat. |
| 4.65 | Browser-to-browser voice and video calls; scheduled calls with reminders | Working | `lib/chat/use_call.js`; `lib/supabase/chat_call_signaling.js:15-26` | No recording. |
| 4.66 | File sharing in chat | Working | `mig/20261019205301_chat_workspace.sql:127, 325-335` | Public `property-chat` bucket. |
| 4.67 | Chat inbox and browser desktop notifications | Working | `scr/communications/inbox_screen.jsx`; `lib/chat/browser_notifications.js:70-82` | — |
| 4.68 | Live chat between residents and staff | Absent | "external" chat contacts are other suite users (`scr/communications/parts/external_contact_dialog.jsx:10-25`) | — |

Cross-references (not counted here): payment restrictions, convenience fees and staff payment links (3.32-3.36); renters-insurance compliance tracking and reminders (8.13-8.14); lease-expiry emails (2b.67); late notice emails (3.24); legal notice delivery (2b.98); work-order visibility toggles (5.52); satisfaction surveys (5.47); e-signature (2b.54); mobile and native apps (9.40-9.41); portal languages (9.57).

**Notable absent features (module 4):**
- **Self-service:** residents cannot book amenities, RSVP to events, sign documents, accept a renewal or give notice online (4.57, 4.60, 2b.54, 4.27).
- **Notifications and receipts:** no in-portal notifications (4.54); no downloadable receipts (4.21).
- **Messaging:**
  - no staff inbox or reply (4.39)
  - no screen to write announcements (4.43)
  - no work-order status emails (4.32)
  - opt-outs are not respected (4.50)
  - SMS and inbound email are stubs (4.47-4.48)
  - no resident live chat (4.68)
- **Community and building services:**
  - no package management (4.61)
  - no surveys, referrals or community board (4.62)
  - no smart-lock or access-control integration (4.63)
- **Insurance:** no carrier integration or force-placed coverage (4.35-4.36).
- **Payments and branding:** no cash or retail payments (4.23); no custom domain (4.11).
- **Mobile:** no native app or PWA (9.41).

## 5. Maintenance & facilities

| # | Feature | Maturity | Evidence (path:line) | Notes / what is missing |
|---|---|---|---|---|
| **Work orders: core** | | | | |
| 5.1 | Work orders, tenant requests and field visits in one table and screen. Views: All, Work orders, Requests, Field, Open, Overdue, Awaiting approval. Filters by priority, vendor and property. | Working | `scr/maintenance/config.jsx:40-77`; `lib/supabase/work_orders.js:8-36` | — |
| 5.2 | 4 priorities; 8 categories with subcategories; area, room and floor | Working | `scr/maintenance/shared.js:105-137, 151-165` | Feeds reports (`lib/reports/defs_operations.js:466-468`) and automation conditions (`lib/automations/catalog.js:150-156`). |
| 5.3 | Status set and lifecycle actions: assign, schedule, start, hold with reason, completion wizard, reopen, cancel with reason | Working | `scr/maintenance/shared.js:81-103`; `scr/maintenance/sections/wo_actions.jsx:107-558` | — |
| 5.4 | Automatic status history, including changes from the three portals | Working | `scr/maintenance/sections/wo_shared.js:26-36`; `lib/portal/vendor.js:122-128`; `lib/portal/resident.js:178-180` | — |
| 5.5 | Source and channel tracking | Partial | `scr/maintenance/shared.js:139-149`; `lib/portal/resident.js:224-225`; `lib/maintenance/pm.js:117` | Set automatically for portal, staff, PM and turn jobs. "Inspection" and "owner" are set by hand. Jobs created by automations get no source (`lib/automations/runner.js:351-355`). |
| 5.6 | Triage a request and convert it to a work order | Working | `scr/maintenance/sections/wo_approval.jsx:178-222` | — |
| 5.7 | Six ways to create a work order: staff screen, unit quick action, PM schedule, turn vendor task, automation step, resident portal | Working | `scr/units/actions.js:251-300`; `scr/maintenance/pm_generate.js:18-38`; `scr/maintenance/sections/turn_sections.jsx:393-421`; `lib/automations/runner.js:335-361`; `lib/portal/resident.js:200-250` | — |
| 5.8 | Due date, overdue flag and view, days open, average days to complete | Working | `scr/maintenance/shared.js:284-296`; `scr/maintenance/config.jsx:143-165` | — |
| 5.9 | Response SLA hours | Saved-but-unused | `scr/maintenance/sections/wo_general.jsx:98` | Grep `slaHours`: only this line. |
| 5.10 | Emergency handling | Partial | `lib/portal/resident.js:203-204`; `components/portal/resident/resident_requests.jsx:93-96`; `lib/policies.js:139` | Emergency forces Urgent priority and shows a badge. No escalation or on-call routing. The after-hours emergency-line policy is never read, and the portal tells residents to call it without showing the number. |
| 5.11 | Tenant-caused and recurring-issue flags | Saved-but-unused | `scr/maintenance/sections/wo_general.jsx:100-101` | — |
| 5.12 | "Next step" guidance (assign, schedule, start, complete, approval prompt) | Working | `scr/maintenance/sections/wo_overview.jsx:28-71` | — |
| 5.13 | Links to property, unit, tenant and lease | Working | `scr/maintenance/sections/wo_general.jsx:118-198` | Drive portal visibility and reports. |
| 5.14 | Entry permission defaulted from the company → property → lease policy cascade | Working | `scr/maintenance/sections/wo_general.jsx:221-247`; `lib/policies.js:126-138` | — |
| 5.15 | Access details passed to the vendor portal (key location, gate code, pets, notes, preferred times) | Working | `scr/maintenance/sections/wo_general.jsx:202-219`; `lib/portal/vendor.js:38-46` | — |
| 5.16 | Lockbox and alarm codes, notice hours, preferred days, contact method | Tracking-only | `scr/maintenance/sections/wo_general.jsx:203-213` | Staff-only reference fields. |
| 5.17 | Unit "vendor entry instructions" copied onto quick-action work orders | Saved-but-unused | `scr/units/actions.js:290` | Nothing reads `metadata.entryInstructions`. |
| 5.18 | Equipment on the work order (make, model, serial, warranty) | Tracking-only | `scr/maintenance/sections/wo_general.jsx:178-185` | Free text, not linked to the asset register. |
| **Dispatch and scheduling** | | | | |
| 5.19 | Assign-vendor wizard and dispatch history | Partial | `scr/maintenance/sections/wo_actions.jsx:107-190` | History rows stay "Assigned"; the vendor's accept/decline never updates them. |
| 5.20 | Internal technician assignment | Partial | `scr/maintenance/sections/wo_general.jsx:252-258` | Technician is free text, not a team member. No "my work orders" view. The Maintenance tech role only hides navigation (`scr/settings/permissions.js:108-116`). |
| 5.21 | Scheduled date, time window, ETA, estimated hours | Working | `scr/maintenance/sections/wo_actions.jsx:191-239` | Shown in the resident and vendor portals. |
| 5.22 | Dispatch calendar or board | Absent | `scr/maintenance/config.jsx:40-63` (list views only); no calendar code under `scr/maintenance` | — |
| 5.23 | Notifying the vendor when dispatched | Absent | `scr/maintenance/sections/wo_actions.jsx:153-188` | "Dispatched via" is a label. Automations can email the vendor only on the created/completed triggers. |
| 5.24 | Staff "vendor accepted" switch | Tracking-only | `scr/maintenance/sections/wo_general.jsx:260` | Separate from the portal's accept field. |
| 5.25 | Not-to-exceed amount | Partial | `scr/maintenance/sections/wo_costs.jsx:91-95` | Staff get a warning; the vendor portal never shows the limit. |
| 5.26 | PO number on a work order | Saved-but-unused | `scr/maintenance/sections/wo_general.jsx:268` | — |
| **Owner approval** | | | | |
| 5.27 | Owner-approval threshold from the policy cascade (default $500), with a "required" badge | Working | `lib/policies.js:125`; `scr/maintenance/sections/wo_approval.jsx:56-73` | — |
| 5.28 | Request, approve and reject wizards with history (staff record the decision) | Working | `scr/maintenance/sections/wo_actions.jsx:357-462` | — |
| 5.29 | Owner approves or rejects in the owner portal (per-owner toggle) | Working | `lib/portal/owner.js:260-302` | — |
| 5.30 | Enforcing approval (auto-request, or blocking work over the limit) | Absent | `scr/maintenance/sections/wo_actions.jsx:240-249` | "Start work" checks only that the job is open. |
| 5.31 | Notifying the owner of an approval request | Absent | `scr/maintenance/sections/wo_actions.jsx:365` ("isn't connected yet"); `lib/portal/owner.js:297-300` | The portal tells the owner the office "has been notified", but only an activity row is written. |
| 5.32 | Per-owner approval threshold | Saved-but-unused | `scr/owners/shared.js:147` | — |
| 5.33 | "Proceed without approval in emergencies" | Saved-but-unused | `scr/maintenance/sections/wo_approval.jsx:52` | — |
| **Estimates, costs and billing** | | | | |
| 5.34 | Vendor estimates (entered by staff) feeding the approval amount | Working | `scr/maintenance/work_order_sections.jsx:204-233`; `scr/maintenance/sections/wo_approval.jsx:31-44` | Vendors cannot submit quotes (5.63). |
| 5.35 | Cost lines (labour, material, trip; qty × rate + markup) rolling into cost totals | Working | `scr/maintenance/sections/wo_costs.jsx:24-207`; `scr/maintenance/shared.js:254-276` | Totals feed reports, the owner portal and unit turns. |
| 5.36 | Time log | Tracking-only | `scr/maintenance/work_order_sections.jsx:243-249` | Hours do not roll into costs; no clock-in or clock-out. |
| 5.37 | Parts from inventory: deduct, return to stock, add to costs | Working | `scr/maintenance/sections/wo_execution.jsx:53-156` | — |
| 5.38 | Tenant chargeback | Partial | `scr/maintenance/sections/wo_costs.jsx:211-224` | The amount is computed and shown, but "Posted to tenant ledger" is a manual switch; nothing posts a charge. |
| 5.39 | Bill to owner with markup | Saved-but-unused | `scr/maintenance/sections/wo_costs.jsx:226-228` | — |
| 5.40 | Create a vendor bill from a work order | Partial | `scr/maintenance/sections/wo_actions.jsx:463-528` | Skips the bill approval limit (default "Not required", `mig/20261015212744_ledger_core.sql:241`) and is not posted to AP on creation (compare `scr/accounting/bills.jsx:120-132`). No GL account pre-filled. |
| 5.41 | Vendor invoice number, date, amount and terms on the work order | Tracking-only | `scr/maintenance/sections/wo_costs.jsx:229-238` | Only pre-fills the bill wizard. |
| **On site and close-out** | | | | |
| 5.42 | Technician checklist (manual, or copied from PM steps) | Working | `scr/maintenance/work_order_sections.jsx:236-242`; `lib/maintenance/pm.js:90-137` | — |
| 5.43 | Field report text | Tracking-only | `scr/maintenance/work_order_sections.jsx:251` | — |
| 5.44 | Before/after photos from staff, residents and vendors | Working | `scr/maintenance/sections/wo_execution.jsx:375-389` | Images only; public bucket. |
| 5.45 | Completion wizard (resolution, hours, root cause, parts deduction, follow-up) | Working | `scr/maintenance/sections/wo_actions.jsx:279-346` | — |
| 5.46 | Root cause, workmanship warranty days, follow-up needed | Saved-but-unused | `scr/maintenance/sections/wo_execution.jsx:258-269` | No report or task reads them. |
| 5.47 | Tenant feedback / satisfaction rating | Tracking-only | `scr/maintenance/sections/wo_execution.jsx:303-321` | Staff type in the rating; "ask for feedback" only sets a flag. A repair-follow-up workflow template can email the tenant. |
| 5.48 | Auto-close after N days | Saved-but-unused | `scr/maintenance/work_order_sections.jsx:155` | — |
| 5.49 | "Internal only" and "Exclude from reports" | Saved-but-unused | `scr/maintenance/work_order_sections.jsx:156-157` | Ignored by the owner portal and the Maintenance Report. |
| 5.50 | Related records, documents, activity, notes, custom fields, duplicate | Working | `scr/maintenance/sections/wo_execution.jsx:393-490` | — |
| 5.51 | Work-order automation coverage (created/completed triggers, "create work order" step, templates) | Partial [job] | `lib/automations/catalog.js:43-44, 413-447`; `mig/20261015214949_fix_record_event_trigger_array_append.sql:34-37` | The trigger fires only on inserts of kind `work_order`. Resident-portal requests are kind `request`, so "Maintenance request received" never fires for them, and converting one fires nothing. No triggers for assignment, overdue or other statuses. |
| **Portal visibility controls** | | | | |
| 5.52 | Per-work-order tenant visibility toggles (share, notify on status, show photos/schedule, note to tenant) | Saved-but-unused | `scr/maintenance/sections/wo_approval.jsx:233-237`; `scr/maintenance/sections/wo_actions.jsx:228-229` | The resident portal shows every non-draft job with photos and schedule (`lib/portal/resident.js:190`). |
| 5.53 | Owner portal: work orders on the owner's properties, with cost, photos and approvals (per-owner toggle) | Working | `lib/portal/owner.js:212-257` | — |
| 5.54 | Per-work-order owner sharing toggles (share, show costs, internal only) | Saved-but-unused | `scr/maintenance/sections/wo_approval.jsx:228-231` | The owner portal returns all non-draft jobs and always shows cost. |
| **Vendor portal** | | | | |
| 5.55 | Assigned jobs with address, access details and optional tenant contact | Working | `lib/portal/vendor.js:10-103` | — |
| 5.56 | Vendor accepts or declines (with reason) | Partial | `lib/portal/vendor.js:131-143` | Staff never see it; a declined job stays assigned to that vendor. |
| 5.57 | Vendor status updates (Scheduled, In progress, On hold) | Working | `lib/portal/vendor.js:144-156` | — |
| 5.58 | Vendor notes | Partial | `lib/portal/vendor.js:157-162` | Not shown to staff. |
| 5.59 | Vendor photos | Working | `lib/portal/vendor.js:164-171` | — |
| 5.60 | Vendor marks a job complete | Partial | `lib/portal/vendor.js:172-183` | Completion notes are hidden from staff. Skips the parts deduction and the completion wizard. |
| 5.61 | Vendor uploads insurance certificates and licences | Partial | `lib/portal/vendor.js:310-347`; `lib/compliance.js:41-51` | No review queue, and an unreviewed "Pending" upload counts as compliant. |
| 5.62 | Per-vendor portal permissions, invite and disable | Working | `lib/portal/vendor.js:10-18`; `scr/vendors/config.jsx:128-158` | Invoices raised in the portal: 6.36. |
| 5.63 | Vendor submits a quote or estimate through the portal | Absent | grep `estimate` in `lib/portal/vendor.js`: none | — |
| **Preventive maintenance** | | | | |
| 5.64 | PM recurrence rules (weekly to annual, custom intervals, day-of-month, seasons, lead days) | Working | `lib/maintenance/pm.js:5-72`; `scr/maintenance/preventive.jsx:165-178` | — |
| 5.65 | PM scopes: property-wide, one unit, every unit, listed assets | Working | `lib/maintenance/pm.js:131-154` | — |
| 5.66 | Daily PM generation job (no duplicates, catch-up, skips while a job is open, stops at end date) | Working [job] | `lib/jobs/preventive_work_orders.js:39-150` | — |
| 5.67 | Generate now, skip, pause, resume | Working | `scr/maintenance/preventive.jsx:403-462` | — |
| 5.68 | Work-order defaults from the schedule (vendor, priority, checklist, estimates, require approval) | Working | `lib/maintenance/pm.js:97-130` | — |
| 5.69 | "Notify residents before the visit" | Saved-but-unused | `lib/maintenance/pm.js:121-122` | Sets flags that nothing sends. |
| 5.70 | Linking PM schedules to the asset register | Absent | `scr/maintenance/preventive.jsx:200-206` | PM assets are a free-text list. |
| 5.71 | Generated-job history, estimated annual cost, due-soon and overdue views | Working | `scr/maintenance/preventive.jsx:316-378` | — |
| 5.72 | Vendor auto-assignment rules (by trade, area, rotation) | Absent | `lib/maintenance/pm.js:107-109` | One fixed vendor per schedule. |
| **Make-ready / unit turns** | | | | |
| 5.73 | Turn record (unit, move-out link, target and actual ready dates, type, rush) | Working | `scr/maintenance/sections/turn_sections.jsx:161-200` | — |
| 5.74 | Turn created automatically when a move-out is scheduled (optional) | Working | `lib/leasing/workflows.js:315-329` | Target is move-out + 7 days. |
| 5.75 | 7-task standard checklist with owner, due date and status | Working | `scr/maintenance/shared.js:361-372` | — |
| 5.76 | Vendor tasks created as linked work orders | Working | `scr/maintenance/sections/turn_sections.jsx:393-421` | — |
| 5.77 | Turn budget vs actual; over-budget and past-target views | Working | `scr/maintenance/unit_turns.jsx:71-95, 323-328` | — |
| 5.78 | Turn list and board views (cards move by menu, no drag) | Working | `scr/maintenance/unit_turns.jsx:112-246` | — |
| 5.79 | Mark ready, mark leased, reopen; turn days and variance | Working | `scr/maintenance/unit_turns.jsx:363-467` | — |
| 5.80 | Turn status synced to the unit or listing | Absent | no unit or listing write in `scr/maintenance/unit_turns.jsx` | The unit "Make-ready" status is set by hand. |
| **Property compliance and assets** | | | | |
| 5.81 | Recurrence on property compliance items | Saved-but-unused | `scr/properties/record_kinds.js:81` | Nothing advances the next due date. The items themselves: 1.32. |
| 5.82 | Unit appliance list | Tracking-only | `scr/units/config.jsx:572-597` | Dates entered by hand; no reminders. |
| 5.83 | Asset service reminders, or PM generated from asset intervals | Absent | `lib/messaging/reminder_jobs.js:340` | The reminder job excludes assets. |
| 5.84 | Work-order-to-asset link and per-asset service history | Absent | no asset id in `lib/supabase/work_orders.js:11-35` | — |
| 5.85 | Asset lifecycle / replacement forecasting | Saved-but-unused | `scr/properties/record_kinds.js:129-130` | "Expected life" has no reader. |
| **Inventory** | | | | |
| 5.86 | Inventory items: SKU, location, bin, barcode text, quantity, reorder levels | Working | `scr/maintenance/inventory.jsx:176-187` | — |
| 5.87 | Stock status and reorder list with suggested quantities | Working | `scr/maintenance/inventory.jsx:66-73, 470-490` | — |
| 5.88 | Stock movements and cycle counts | Working | `lib/supabase/inventory.js:31-44` | — |
| 5.89 | Inventory valuation | Partial | `scr/maintenance/inventory.jsx:61` | Quantity × last unit cost only; not on the GL. |
| 5.90 | "Mark ordered", supplier, lead time | Tracking-only | `scr/maintenance/inventory.jsx:203-214, 426-466` | — |
| 5.91 | Stock in several locations, with transfers | Absent | one quantity per item | — |
| 5.92 | Inventory on the GL (asset account, expense on use) | Absent | grep `inventory` in `lib/ledger`: none | — |
| 5.93 | Barcode scanning | Absent | `scr/maintenance/inventory.jsx:682` (text field only) | — |
| **Purchasing** | | | | |
| 5.94 | Purchase orders, requisitions, PO approval, receiving, three-way match, catalogues | Absent | grep `-i "purchase.?order\|requisition"`: only free-text "PO number" fields (`scr/maintenance/sections/wo_general.jsx:268`; `scr/maintenance/inventory.jsx:213, 307, 447`); no PO table in `mig/` | — |
| **Vendor management** | | | | |
| 5.95 | Vendor profile and status (incl. Onboarding, Do not use) | Working | `scr/vendors/shared.js:15-49` | — |
| 5.96 | Multiple vendor contacts | Working | `scr/vendors/shared.js:173-180` | — |
| 5.97 | Preferred-vendor flag ("shown first when assigning work") | Partial | `lib/supabase/options.js:72-79` | The badge works; the vendor picker ignores the flag. |
| 5.98 | Vendor trades | Working | `scr/vendors/shared.js:63-65` | — |
| 5.99 | Service areas, ZIP codes, radius, largest job | Saved-but-unused | `scr/vendors/shared.js:66-69` | — |
| 5.100 | Vendor rates (hourly, trip, multipliers, markup, estimate required over) | Saved-but-unused | `scr/vendors/shared.js:72-82` | Displayed only. |
| 5.101 | Vendor payment setup (terms, method, payee, discount) | Tracking-only | `scr/vendors/shared.js:84-92` | Bills do not read the terms (6.38). |
| 5.102 | Vendor default GL account ("pre-fills the expense account on bills") | Saved-but-unused | `scr/vendors/shared.js:89` | — |
| 5.103 | Vendor "hold payments" | Tracking-only | `scr/vendors/config.jsx:255-288` | Banner only; Bills & Payables does not block payment. |
| 5.104 | 1099 form and box on the vendor | Saved-but-unused | `scr/vendors/shared.js:99` | W-9 and the 1099 report: 6.48-6.50. |
| 5.105 | Coverage requirements (minimum liability, additional insured, workers' comp) | Saved-but-unused | `scr/vendors/shared.js:110-112` | Nothing checks policies against them. COI expiry tracking: 8.15. |
| 5.106 | Blocking inactive or non-compliant vendors from assignment | Absent | `lib/supabase/options.js:72-79` | The picker lists every vendor. |
| 5.107 | Manual vendor reviews averaged into a rating | Working | `scr/vendors/sections.jsx:311-345` | — |
| 5.108 | Vendor performance from work orders | Partial | `lib/reports/defs_operations.js:457-480` | Only "Top vendors" by job count and cost. |
| 5.109 | Vendor availability | Partial | `scr/vendors/config.jsx:348` | Only the 24/7 flag is used. |
| 5.110 | Vendor tabs for work orders, bills and ledger | Working | `scr/vendors/config.jsx:483-526` | — |
| 5.111 | Vendor onboarding | Tracking-only | `scr/vendors/shared.js:17` | A status value only. |
| **Mobile and reporting** | | | | |
| 5.112 | Native or offline mobile technician app | Absent | no manifest, service worker or native project (grep `manifest\|serviceWorker\|react-native\|capacitor`: none) | The staff UI and vendor portal are responsive web only (9.40). |
| 5.113 | "Field / mobile visit" flag and Field view | Tracking-only | `scr/maintenance/config.jsx:54-59` | — |
| 5.114 | Maintenance Report (volume, time to close, cost, breakdowns, top vendors) | Working | `lib/reports/defs_operations.js:445-486` | — |
| 5.115 | Work-order section in owner statements | Working | `lib/reports/defs_operations.js:354, 416` | — |
| 5.116 | SLA, first-response, cost-per-unit and recurring-issue analytics | Absent | none in `lib/reports` | — |
| 5.117 | `maintenance_attachments` table | Stub/placeholder | `scr/documents/document_library.jsx:105`; `lib/supabase/maintenance_attachments.js:6-18` | Read by the Document Library; nothing writes to it. |

Cross-references (not counted here):
- Resident request submission and tracking (4.28-4.32).
- Inspection findings to work orders (2b.92).
- Property compliance items (1.32); asset register (1.30).
- Vendor COI and licence tracking (8.15-8.16).
- W-9, 1099 and vendor invoices (6.36-6.38, 6.48-6.50).
- Insurance Compliance report (8.17).

**Notable absent features (module 5):**
- **Purchasing:** purchase orders (5.94).
- **Dispatch:** dispatch calendar (5.22); vendor dispatch notifications (5.23); vendor auto-assignment (5.72).
- **Owner approval:** enforced approval and owner notification (5.30-5.31).
- **Mobile:** mobile technician app (5.112).
- **Assets:** asset-linked work orders and PM (5.70, 5.83-5.84).
- **Inventory:** multi-location stock, inventory on the GL, barcode scanning (5.91-5.93).
- **Vendors:** non-compliant vendors are not blocked (5.106); vendor quotes in the portal (5.63).
- **Turns:** turn-to-unit status sync (5.80).
- **Analytics:** SLA analytics (5.116).

## 6. Accounting & finance

| # | Feature | Maturity | Evidence (path:line) | Notes / what is missing |
|---|---|---|---|---|
| **General ledger core** | | | | |
| 6.1 | Double-entry journal: entry headers and lines; each line is a debit or a credit, `numeric(14,2)` | Working | `mig/20261015212744_ledger_core.sql:49-126` | Feeds every financial screen and report. |
| 6.2 | Balanced posting RPC `ledger_post` with a deferred balance trigger | Working | `mig/20261015212744_ledger_core.sql:264-393`; `mig/20261015212915_ledger_post_line_dimensions.sql:1-6` | Rejects entries with fewer than 2 lines, unbalanced or negative amounts, and lines with no GL account. |
| 6.3 | Idempotent posting (unique key per project, safe under races) | Working | `mig/20261015212744_ledger_core.sql:78-80, 318-323, 384-391` | Key prefixes: `bill:`, `billpay:`, `txn:`, `rubs:`, `cam:`, `mgmt:`, `stripe:`, … |
| 6.4 | Eight line dimensions (property, unit, lease, tenant, owner, vendor, bank_account, job); a line can override the entry's dimension | Working | `mig/20261015212744_ledger_core.sql:97-104`; `lib/ledger/postings.js:39-48, 156-157` | — |
| 6.5 | Fixed vocabulary of 13 ledger source types | Working | `mig/20261015212744_ledger_core.sql:73-76`; `lib/ledger/postings.js:6-36` | Adding a kind (depreciation, loan) needs a constraint migration. |
| 6.6 | Void by mirror reversal (`reversal_of`; reopens applied charges; void date ≥ original; a reversal cannot be voided) | Working | `mig/20261015212744_ledger_core.sql:395-448`; `scr/accounting/ledger_dialogs.jsx:366` | — |
| 6.7 | Ledger immutability enforced in the database | Partial | `mig/20261015212744_ledger_core.sql:251-262, 287-291, 623-625` | Voiding is by convention only. With demo-open RLS, and `ledger_post` / `ledger_void` granted to `anon`, posted lines can be updated or deleted through PostgREST; the only guard is the per-entry balance trigger. |
| 6.8 | Manual journal entry (multiple lines, balance check, date, memo, line memos) | Partial | `scr/accounting/ledger_dialogs.jsx:435-514`; `scr/accounting/general_ledger.jsx:335, 423`; `scr/accounting/ledger_section.jsx:65-74` | The GL-screen editor has no per-line property, owner or other dimension picker, so manual JEs drop out of property-filtered statements. |
| 6.9 | Recurring or memorized journal entries | Absent | grep `recurring (journal\|entr\|bill)\|memorized`: none | — |
| 6.10 | Journal-entry approval workflow | Absent | no approval field on `ledger_entries` (`mig/20261015212744_ledger_core.sql:49-77`) | — |
| 6.11 | Attachments on journal entries, bills or transactions (staff side) | Absent | no documents section on bills, transactions or GL (`scr/accounting/bills.jsx:750-765`; `scr/accounting/transactions.jsx:362-373`); the Document Library's sources exclude financial records (`scr/documents/document_library.jsx:75-83`) | — |
| 6.12 | Period close, lock date, fiscal-year close, retained-earnings roll | Absent | grep `period close\|lock date\|retained earnings\|closing entr`: none | The trial-balance opening accumulates since inception (`lib/reports/ledger_math.js:36-52`); the balance sheet shows all-time "Current earnings" (`lib/reports/ledger_math.js:155-176`). |
| 6.13 | "Fiscal year starts" on property and portfolio | Saved-but-unused | `scr/properties/sections/property_tabs.jsx:181`; `scr/portfolios/sections.jsx:321` | — |
| 6.14 | Cash vs accrual basis toggle | Absent | grep `basis` in lib/reports: only the comment at `lib/reports/ledger_math.js:420` | Accrual-style AR/AP only. The per-property "accounting basis" field is unread (1.35). |
| 6.15 | General Ledger screen: journal list, type and date filters, search, entry detail with dimensions, trial-balance tab, balance check | Partial | `scr/accounting/general_ledger.jsx:40-42, 74-110, 143, 224, 250-258` | The journal query is capped at the 500 newest entries in the filter (`general_ledger.jsx:224`; `lib/supabase/ledger.js:172`). |
| 6.16 | Ledger health checks: unbalanced entries, lines with no GL account, negative trust positions | Working | `lib/ledger/postings.js:649-677`; `lib/supabase/ledger.js:279-293`; `scr/accounting/bank_reconciliation.jsx:100-153` | Computed client-side; shown on Bank Reconciliation. |
| 6.17 | SQL balance views (`ledger_account_balances`, `ledger_party_balances`, `ledger_trust_positions`, `ledger_unbalanced_entries`) and the `ledger_subledger` RPC | Saved-but-unused | `mig/20261015212744_ledger_core.sql:530-618` | Grep over all .js/.jsx: no reader; the app recomputes in JS. |
| **Chart of accounts** | | | | |
| 6.18 | Chart of accounts: 5 types, 14 subtypes driving the sub-ledgers, numbering, Active/Inactive (inactive hidden from pickers) | Working | `scr/accounting/chart_of_accounts.jsx:89-104`; `scr/accounting/shared.js:186-218`; `lib/supabase/gl_accounts.js:30-37` | — |
| 6.19 | Default 29-account system chart: idempotent seed, adopts matching accounts, auto-seeds when required keys are missing | Working | `mig/20261015212744_ledger_core.sql:453-528`; `lib/ledger/store.js:8-53`; `scr/accounting/chart_of_accounts.jsx:61-81` | — |
| 6.20 | User-defined GL accounts | Working | `scr/accounting/chart_of_accounts.jsx:108-138` | — |
| 6.21 | Account hierarchy (`parent_id`) | Partial | `scr/accounting/chart_of_accounts.jsx:42-59` | Indentation only; no parent-level roll-up in any report (grep `parentId` in lib/reports: none). |
| 6.22 | Trust flag on accounts | Working | `mig/20261015212744_ledger_core.sql:38`; `lib/ledger/postings.js:503-506` | Drives trust cash, owner statements and trust positions. |
| **Entities, consolidation, currency** | | | | |
| 6.23 | One set of books per suite project; many projects per install | Working | `mig/20261015212744_ledger_core.sql:25, 51, 89, 453` | — |
| 6.24 | Legal-entity / multi-company books within a project | Absent | no entity table; one `company_profile` per project (`scr/settings/company_profile.jsx:15, 31-33`) | Owners are ledger dimensions, not entities. |
| 6.25 | Owner sub-ledgers via the owner dimension | Partial (defect) | `lib/supabase/ledger.js:296-306, 328`; `lib/jobs/financial.js:89-95` | Every staff and job posting auto-tags only the **primary** owner of the property (`ownerOfProperty`), so co-ownership is never split at posting time. |
| 6.26 | Intercompany due-to / due-from | Absent | grep `intercompany\|due to\|due from\|elimination`: only UI "Due today" labels | — |
| 6.27 | Consolidation across projects or entities | Absent | grep `consolidat`: only the portfolio switch (6.28) | — |
| 6.28 | Portfolio "Send one consolidated statement" switch and target NOI | Saved-but-unused | `scr/portfolios/sections.jsx:318, 331` | — |
| 6.29 | Multi-currency / FX | Absent | grep `exchange rate\|multi.?currency`: none; Stripe hard-codes `"usd"` (`lib/payments/checkout.js:107`) | At least nine formatters hard-code USD (see the 2026-11-02 notes). |
| 6.30 | Company currency picker (USD/CAD/GBP/EUR/AUD/INR) | Saved-but-unused | `scr/settings/shared.js:53-60`; `scr/settings/company_profile.jsx:99` | The only reader is the picker itself. |
| **Accounts payable** | | | | |
| 6.31 | Bill fields: vendor, invoice #, bill and due dates, amount, Expense/Asset GL account, property, unit, job, work order | Working | `scr/accounting/bills.jsx:441-458`; `lib/supabase/bills.js:6-28` | — |
| 6.32 | Bill posts to AP (Dr expense / Cr AP) on create or approval; amount and account lock once posted | Working | `scr/accounting/bills.jsx:101-133, 446-450, 710-724` | — |
| 6.33 | Split-line bills (several GL lines on one bill) | Absent (engine only) | the builder supports it (`lib/ledger/postings.js:261-281`), but the only caller passes one account (`scr/accounting/bills.jsx:103`) | Vendor-portal invoices are single-amount too. |
| 6.34 | Bill approval: one project-wide `billApprovalLimit`; any `accounting.post` user approves; free-text approver; reject; "Require approval" | Partial | `scr/accounting/bills.jsx:73-88, 337-438, 621-709` | No tiers, routing, role-based approvers or approval-step history. |
| 6.35 | Owner approval of bills (`approveBills`, `approvalThreshold`) | Saved-but-unused | `scr/owners/shared.js:147-148`; `scr/owners/sections.jsx:330` | The owner portal approves work orders only (grep `bill` in `lib/portal/owner.js`: none). |
| 6.36 | Vendor-portal invoice becomes a bill pending approval (due date from terms, work-order link, attachment) | Working | `lib/portal/vendor.js:213-269` | — |
| 6.37 | Vendor invoice attachment visible to staff | Saved-but-unused | written at `lib/portal/vendor.js:249-250`; read only by the vendor's own view (`:74`) | Grep `attachmentUrl` in components: none. |
| 6.38 | Vendor payment terms on bills | Partial | `lib/portal/vendor.js:226, 244` | Portal invoices use `metadata.paymentTermsDays` (default 30), which no staff field sets. Staff enter due dates by hand. |
| 6.39 | Record bill payments: partial payments, method label, pay-from bank, Dr AP / Cr cash applied to the bill, mirrored to Transactions; removing one voids both | Working | `scr/accounting/bills.jsx:135-236`; `lib/ledger/postings.js:283-298` | — |
| 6.40 | Vendor payment execution (ACH, check or card money movement) | Absent | method is a label (`scr/accounting/bills.jsx:79`); grep `transfers.create\|payouts\|nacha`: none | — |
| 6.41 | Check printing; check numbers on bill payments | Absent | no reference field on the bill-payment panel (`scr/accounting/bills.jsx:257-295`); grep `print checks\|MICR`: none | The check register reads `checkNumber` only from the generic Post dialog (`scr/accounting/ledger_dialogs.jsx:198, 262, 331`). |
| 6.42 | Payment batches (pay many bills at once) | Absent | grep `payment batch\|bulk pay\|payment run`: none | — |
| 6.43 | Vendor credits / credit memos | Absent | grep: none | — |
| 6.44 | Recurring bills | Absent | grep: none | — |
| 6.45 | Duplicate-invoice detection | Absent | grep: none | — |
| 6.46 | AP aging: bucket tiles on the bills list and the A/P Aging report from the ledger | Working | `scr/accounting/bills.jsx:563-580`; `lib/reports/defs_financial.js:404-468`; `lib/reports/ledger_math.js:306` | — |
| 6.47 | Vendor ledger with running payable balance | Working | `scr/accounting/bills.jsx:785-790`; `scr/accounting/ledger_section.jsx:30-41` | — |
| **1099** | | | | |
| 6.48 | W-9 capture for vendors and owners (taxpayer, TIN type, TIN last 4, received date, 1099 flag) | Working | `scr/vendors/config.jsx:188-226`; `scr/owners/shared.js:118-128` | Feeds the 1099 report. |
| 6.49 | December W-9 reminders to vendors and owners | Working [job] | `lib/messaging/reminder_jobs.js:323, 426-429, 477-479` | Part of the `expiring-documents` job. |
| 6.50 | 1099 Summary report (vendors only): cash paid from the ledger net of voids; threshold by tax year ($600, $2,000 from 2026); W-9 status | Working | `lib/reports/defs_financial.js:597-678` | — |
| 6.51 | Owner 1099 (rents / 1099-MISC) reporting | Absent | the report reads vendors only (`lib/reports/defs_financial.js:605-630`) | Owner `delivery1099` has no reader. |
| 6.52 | 1099 form generation or e-file | Absent | grep `e-file\|1096\|IRIS`: none | — |
| **Banking and cash** | | | | |
| 6.53 | Bank accounts: Operating, Trust, Security deposit, Reserve; last 4 digits; linked cash GL or a default by type; property | Working | `scr/accounting/bank_accounts.jsx:41-61`; `scr/accounting/shared.js:232`; `lib/supabase/ledger.js:309-318` | Without a linked GL, a "Reserve" account posts to Operating Cash. |
| 6.54 | Bank-account balance field | Tracking-only | `scr/accounting/bank_accounts.jsx:29-34` | Entered by hand ("bank feeds aren't connected"). The ledger book balance is shown separately (`:172, 197`). |
| 6.55 | Inter-account transfers | Working | `lib/ledger/postings.js:430-440`; `scr/accounting/transactions.jsx:186` | — |
| 6.56 | Cash-basis Transactions screen: income, expense or transfer straight to cash; deleting voids | Working | `scr/accounting/transactions.jsx:40-103`; `lib/ledger/postings.js:422-451` | — |
| 6.57 | Manual bank reconciliation | Working | `scr/accounting/bank_reconciliation.jsx:39-42, 262-269, 321-412, 422-441`; `lib/supabase/ledger.js:399-420` | Draft save and resume. Clear lines up to the statement date. Finalize at zero difference (stamps `cleared` and `reconciliation_id`). Undo the latest. History. |
| 6.58 | Bank statement import (CSV, OFX, BAI2) and auto-matching | Absent | grep `ofx\|bai2\|qfx\|statement import`: none | — |
| 6.59 | Adjustments (fees, interest) inside a reconciliation | Absent | not in the reconciliation workflow | Must be posted separately in Transactions. |
| 6.60 | Printable reconciliation report | Absent | history table only (`scr/accounting/bank_reconciliation.jsx:422-441`) | — |
| 6.61 | Bank feeds (Plaid etc.) | Absent | `scr/accounting/bank_accounts.jsx:30, 34`; grep `plaid\|yodlee\|finicity`: none | — |
| 6.62 | Positive pay, cash management, NACHA files | Absent | grep `positive pay\|nacha`: none | — |
| 6.63 | Stripe payout tracking and processor fees | Partial | `app/api/stripe/webhook/route.js:35-36, 64-66`; `lib/payments/fulfill.js:161, 362-380`; `scr/payments/online_payments.jsx:271, 375, 395-406` | Payout id and arrival date are stamped and grouped. `processor_fee` is stored but never posted to the GL, and payouts are not matched in bank reconciliation. |
| **Budgeting, job cost, assets** | | | | |
| 6.64 | Budgets: property (or all) × year, monthly lines per GL account, even annual spread | Working | `mig/20261015212744_ledger_core.sql:150-169`; `scr/accounting/budgets.jsx:25-41, 156-170` | — |
| 6.65 | Budget vs actual by month, YTD or full year, with actual NOI | Working | `scr/accounting/budgets.jsx:290-432` | Screen only; no budget report (7.9). |
| 6.66 | Budget "Approved" status | Tracking-only | `scr/accounting/shared.js:224-228`; `scr/accounting/budgets.jsx:540` | A manual select; no approval workflow. |
| 6.67 | Budget versions, copy prior year, reforecast | Absent | grep: none | — |
| 6.68 | Forecasting / projections | Absent | grep `forecast\|projection`: none | Per-lease escalation projection exists only on the lease (2b.9). |
| 6.69 | Job costing: jobs (unit turn, capital, repair, other) with one budget figure; cost = job-tagged Expense/Asset lines; actuals by GL account; bills taggable; unit-turn link | Working | `mig/20261015212744_ledger_core.sql:171-193`; `scr/accounting/job_costing.jsx:24-46, 60-100, 263`; `scr/accounting/bills.jsx:453` | — |
| 6.70 | Job cost codes, commitments, change orders, retainage | Absent | the job budget is one number (`scr/accounting/job_costing.jsx:76`) | — |
| 6.71 | Fixed assets | Partial | `mig/20261015212744_ledger_core.sql:470`; `scr/properties/record_kinds.js:111-131` | Account 1500 "Capital Improvements" is subtype `fixed_asset`, and costs can be capitalized to Asset accounts. The asset register is not linked to the GL. |
| 6.72 | Depreciation | Absent | grep `depreciat\|amortiz\|useful life`: none; no source type | — |
| 6.73 | Accrual-style AR/AP (charges and bills recognized when posted) | Working | `lib/ledger/postings.js:203-281` | — |
| 6.74 | Accrual journal entries with auto-reversal | Absent | grep: none | — |
| **Allocations** | | | | |
| 6.75 | CAM reconciliation: pool of expense GL accounts, actual CAM from the ledger, square-foot pro-rata share with % override, estimates vs actual, true-ups posted as charges/credits (`cam:`), voidable, "commercial leases only" filter | Partial | `scr/accounting/cam_reconciliation.jsx:45-123, 142-186, 215-270, 335-341` | One pool per property-year. No caps, base year, expense stop, gross-up, admin fee or per-tenant exclusions. Lease CAM terms are unread (2b.16). |
| 6.76 | Allocating one expense or overhead across properties | Absent | bill lines carry `unitId` only, no per-line property (`lib/ledger/postings.js:275`); grep: none | RUBS (3.67) is the only allocation engine besides CAM. |
| **Owner accounting** | | | | |
| 6.77 | Staff Owner Statements report: opening and ending trust balance, income, expenses, fees, NOI, contributions, distributions; receipts and disbursements; by property with own % and an "owner share" column; detail plus rent roll and work orders | Working | `lib/reports/defs_operations.js:326-415`; `lib/reports/ledger_math.js:436-500` | Totals are 100% property figures. |
| 6.78 | Owner-portal monthly statements: share by ownership %, distributions list, print | Partial (defect) | `lib/portal/owner.js:101-200`; `lib/portal/ledger.js:45-50`; `components/portal/owner/owner_statements.jsx:35-67` | Because postings tag only the primary owner (6.25), a co-owner's statement misses the property's lines. Likely also counts the manager's 4500 fee-income lines as owner income: the staff `ownerLines` excludes them (`lib/reports/ledger_math.js:436-444`), the portal does not. |
| 6.79 | Owner statement preferences (delivery, frequency, included reports, CC, statement note) | Saved-but-unused | `scr/owners/shared.js:131-141` | — |
| 6.80 | Scheduled owner-statement email (a Scheduled Report with an owner filter) | Partial [job] | `lib/jobs/scheduled_reports.js:17-19, 55-97`; `scr/reports/schedule_dialog.jsx:96-106` | The email holds summary stats, up to 15 preview rows and a link. No PDF or statement packet is attached. |
| 6.81 | Owner distributions (Dr Owner Distributions / Cr trust cash; bank picker) | Working | `lib/ledger/postings.js:300-315`; `scr/accounting/ledger_section.jsx:65-71`; `scr/accounting/ledger_dialogs.jsx:62` | Bookkeeping only. |
| 6.82 | Owner payout money movement (ACH or check to the owner) | Absent | grep `transfers.create\|stripe.accounts\|on_behalf_of`: none | — |
| 6.83 | Automated or batch distribution run (net of reserve, minimum payout, distribution day) | Absent | `postDistribution` has no batch caller | — |
| 6.84 | Distribution settings: policies `ownerReserve`, `ownerDistributionDay`; owner `payoutSchedule`, `minimumPayout`, `separatePayments`, `reserveAmount` | Saved-but-unused | `lib/policies.js:146-147`; `scr/owners/shared.js:80-95` | No reader apart from display labels. |
| 6.85 | Owner "hold payouts" | Tracking-only | `scr/owners/config.jsx:120-157` | Not enforced on distributions. |
| 6.86 | Owner contributions (manual) | Working | `lib/ledger/postings.js:317-332` | — |
| 6.87 | Owner pays a contribution online through the portal | Absent | no owner pay route under `app/api/portal/owner/` | — |
| 6.88 | Owner "funds in trust" balance | Working | `scr/accounting/ledger_section.jsx:107-109` | — |
| 6.89 | "Available to distribute" calculation (trust − reserve − payables) | Absent | nothing computes it | — |
| **Management fees and trust** | | | | |
| 6.90 | Management-fee job: last month's collected cash per property × policy %, with a minimum fee; one entry moves trust to operating (`mgmt:<property>:<YYYY-MM>`) | Working [job] | `lib/jobs/financial.js:335-415`; `lib/ledger/postings.js:334-354`; `lib/policies.js:142-143` | — |
| 6.91 | Manual management-fee posting dialog | Stub/placeholder | `scr/accounting/ledger_dialogs.jsx:65` | Not in any ledger-section action list (`scr/accounting/ledger_section.jsx:65-74`), so it cannot be opened. |
| 6.92 | Owner-level management fee % | Partial | `scr/owners/shared.js:105`; `lib/reports/defs_financial.js:340`; `lib/portal/owner.js:198` | The hint says it "overrides the company defaults", but the job uses only the company → property policy (`lib/jobs/financial.js:385-387`). Read only as the report's "expected" figure and in the portal. |
| 6.93 | Owner fee terms (minimum, leasing fee, renewal fee, maintenance markup, setup fee) | Saved-but-unused | `scr/owners/shared.js:106-116` | — |
| 6.94 | Leasing-fee % and renewal-fee policies | Saved-but-unused | `lib/policies.js:144-145` | No leasing or renewal fee is ever charged to owners. |
| 6.95 | Management Fees report: income base, agreed %, expected vs booked, effective rate, variance, by month | Working | `lib/reports/defs_financial.js:318-402` | — |
| 6.96 | Trust cash separation: 1010 trust cash, 1020 deposit trust; payments default to trust; fees move trust to operating | Working | `mig/20261015212744_ledger_core.sql:466-468`; `lib/ledger/postings.js:221-243, 334-354` | — |
| 6.97 | Trust positions per account × owner × property, with shortfall detection | Working | `lib/reports/defs_financial.js:521-526, 566-579`; `lib/reports/ledger_math.js:364`; `lib/ledger/postings.js:664-676` | — |
| 6.98 | Three-way trust reconciliation | Absent | grep `three.way\|3-way`: none | — |
| 6.99 | Accounting software sync or export (QuickBooks, Xero, IIF) | Absent | a disabled "Accounting export" card (`scr/settings/integrations.jsx:34`); grep `quickbooks\|xero\|iif`: none | GL data leaves only as report CSV (7.17). |

Cross-references (not counted here): deposit GL postings and deposit-interest accrual (3.56, 3.57, 3.62); RUBS (3.67); vendor payment hold (5.103); accounting permissions (9.4-9.5).

**Notable absent features (module 6):**
- **GL controls:** recurring JEs (6.9); JE approval (6.10); financial attachments (6.11); period close and lock dates (6.12); cash basis (6.14).
- **Entities and currency:** multi-entity books (6.24); intercompany (6.26); consolidation (6.27); multi-currency (6.29).
- **AP:** split-line bills UI (6.33); payment execution (6.40); check printing (6.41); payment batches (6.42); vendor credits (6.43); recurring bills (6.44); duplicate detection (6.45); multi-tier approvals (6.34).
- **1099:** owner 1099 (6.51); form generation and e-file (6.52).
- **Banking:** statement import and matching (6.58); bank feeds (6.61); positive pay (6.62).
- **Planning:** budget versions and forecasting (6.67-6.68); job cost codes and commitments (6.70).
- **Assets and accruals:** depreciation (6.72); auto-reversing accruals (6.74); cross-property allocations (6.76).
- **Owner money:** owner payouts and batch distributions (6.82-6.83); owner online contributions (6.87).
- **Trust and export:** three-way reconciliation (6.98); QuickBooks/Xero sync (6.99).

## 7. Reporting & analytics

| # | Feature | Maturity | Evidence (path:line) | Notes / what is missing |
|---|---|---|---|---|
| 7.1 | Fixed code catalogue of 15 reports (7 operational, 8 financial), each a sidebar screen (see the catalogue below) | Working | `lib/reports/catalog.js:5-13`; `lib/reports/defs_operations.js:665-673`; `lib/reports/defs_financial.js:680-688` | — |
| 7.2 | Report designer, builder or ad-hoc query | Absent | grep `report builder\|custom report\|report designer`: none | The README claims "a custom report builder" (`README.md:34`). |
| 7.3 | Date presets (this/last month, this/last quarter, YTD, last year, last 12 months, custom) and as-of presets | Working | `lib/reports/periods.js:32-48` | — |
| 7.4 | Property filter (one property or all) | Working | `lib/reports/catalog.js:18-27` | — |
| 7.5 | Report-specific filters: owner, bank account, GL account, unit status, party, compliance status, 1099 threshold, statement view | Working | `lib/reports/defs_operations.js:105, 333, 604-605`; `lib/reports/defs_financial.js:88-99, 150-153, 270, 609-620` | — |
| 7.6 | Portfolio or owner-entity roll-ups and consolidated statements | Absent | grep `portfolio` in lib/reports: none | — |
| 7.7 | Cash vs accrual basis option on reports | Absent | see 6.14 | — |
| 7.8 | Comparative columns (prior period, prior year, budget) and a 12-month column P&L | Absent | grep `prior period\|prior year\|comparative`: none | The P&L shows range totals only (`lib/reports/defs_financial.js:240-258`). |
| 7.9 | Budget vs actual report in the catalogue | Absent | grep `budget` in lib/reports: none | Budgets screen only (6.65). |
| 7.10 | Custom fields in reports | Absent | grep `custom` in lib/reports: none | — |
| 7.11 | Saved report views or saved filters | Absent | grep `savedView\|saveView`: none | Only schedules persist filters. |
| 7.12 | In-report search; 100-row pages with "show more" | Working | `scr/reports/report_view.jsx:46, 121-180` | — |
| 7.13 | Bar charts inside reports (monthly cash flow, lease expirations) | Working | `scr/reports/report_view.jsx:183-230`; `lib/reports/defs_financial.js:207-210` | — |
| 7.14 | Drill-down from report rows to source records | Absent | `scr/reports/report_view.jsx` has no row-click or navigation handler | — |
| 7.15 | GL entry drill-in (entry dialog with lines and dimensions) | Working | `scr/accounting/general_ledger.jsx:74-110` | — |
| 7.16 | Per-record ledger tabs with running balance (lease, tenant, owner, vendor, property, account, job, bank account) | Working | `scr/accounting/ledger_section.jsx:18-52, 332-336`; `lib/ledger/postings.js:575-647` | — |
| 7.17 | CSV export of every table section (UTF-8 BOM, formula-injection guard), gated by `reports.export` | Working | `lib/reports/csv.js:1-33`; `scr/reports/report_view.jsx:262-264, 287, 294` | — |
| 7.18 | PDF through browser print (print-optimized layout) | Working | `scr/reports/report_print.jsx:1-13`; `scr/reports/report_view.jsx:322` | Browser "Save as PDF" only. |
| 7.19 | Native PDF generation | Absent | no PDF library in `package.json` | — |
| 7.20 | Excel / XLSX export | Absent | grep `xlsx\|exceljs\|sheetjs`: only a chat file-icon map (`lib/supabase/chat_files.js:17`) | — |
| 7.21 | Export from list screens | Absent | grep `csv\|export` in `scr/entity/entity_list_screen.jsx`: none | — |
| 7.22 | Scheduled reports: any catalogue report with saved filters; daily, weekly or monthly (day ≤ 28); recipient emails; pause and resume; one send per period; email via geiger-dash with summary stats, a 15×6 preview and a deep link | Working [job] | `lib/reports/schedule.js:1-52`; `lib/jobs/scheduled_reports.js:10-19, 55-150`; `mig/20261015215603_report_schedules_and_runs.sql:18-62` | — |
| 7.23 | File attachments on scheduled report emails | Absent | no attachment in the email payload (`lib/jobs/scheduled_reports.js:69-97`) | CSV and HTML are only archived in `report_runs`. |
| 7.24 | Report run history with CSV download and HTML view | Working | `scr/reports/scheduled_reports.jsx:33-44, 185-197` | — |
| 7.25 | Quarterly or annual schedule frequency | Absent | frequency check constraint (`mig/20261015215603_report_schedules_and_runs.sql:36`) | — |
| 7.26 | Overview dashboard: 4 KPI tiles, Rent Over Time, Unit Status Mix, Leasing Funnel, Occupancy and Collection gauges, Top Properties, Needs Attention, property scope | Partial (defect) | `scr/overview/property_overview.jsx:105-113, 261-370, 376-470, 483-545, 550-610, 613-760, 783-791, 940-970` | The rent KPIs (Rent Collected, Delinquent Balance, Collection rate, rent trend) read legacy `rent_accounts.metadata.charges/payments` (`scr/reports/shared.js:155-175`; `scr/accounting/shared.js:61-74`), not the GL. The overview loads `rentAccountsLayer.list()`, not the ledger-joined `listRentAccountsWithBalances` (`lib/supabase/rent_collection.js:29-44`). No current code writes those arrays; the demo seed pre-fills them, which hides the gap. |
| 7.27 | Customizable dashboards or a widget builder | Absent | grep: none | — |
| 7.28 | KPI tiles on list screens (AP buckets, GL counts, budget variance, job budget use, funnel KPIs) | Working | `scr/accounting/bills.jsx:563-580`; `scr/accounting/general_ledger.jsx:250-258`; `scr/accounting/budgets.jsx:384-386` | — |
| 7.29 | BI, data warehouse or OData access | Absent | grep `power ?bi\|tableau\|snowflake\|bigquery\|odata`: none | Demo-open PostgREST is a security gap, not a supported BI path. |
| 7.30 | Benchmarking or peer analytics | Absent | grep: none | — |
| 7.31 | Reporting at large-portfolio scale | Partial | `lib/reports/sources_client.js:6-10`; `lib/supabase/ledger.js:104-113` | Staff reports page the whole ledger into the browser and compute there; the scheduled job computes server-side. |

**Report catalogue** (rows are not counted separately)

| Report | Filters | Contents |
|---|---|---|
| Rent Roll | range, property, unit status | Unit, tenant, lease dates, market vs lease rent, charged, collected, balance from GL AR (`lib/reports/defs_operations.js:76-125`). Lease rent is `leases.rent` (see 2b.9). |
| Delinquency | as-of, property | AR aging 0-30/31-60/61-90/90+, unapplied credit, oldest item, last payment, 30-day collections (`defs_operations.js:134-196`). |
| Occupancy & Vacancy | range, property | Occupancy by property, vacant units with days vacant, move activity, vacancy loss (`defs_operations.js:198-320`). Counts non-revenue units (1.22). |
| Owner Statements | range, owner (one), property | See 6.77 (`defs_operations.js:326-415`). |
| Maintenance Report | range, property | Volume, turnaround and spend by status, priority, category and vendor; top vendors (`defs_operations.js:445-486`). |
| Leasing Report | range, property | Prospect → lease funnel, renewal outcomes, 12-month expirations chart, expiring leases (`defs_operations.js:488-594`). |
| Insurance Compliance | as-of, property, party, status | Tenant renters insurance; vendor COIs and licences (`defs_operations.js:596-663`). |
| Financial Statements | range, property, view (P&L / Balance Sheet / Cash Flow) | Balance sheet with all-time current earnings and a balance check. Direct cash flow by Operating / Financing / Security deposits (no Investing), plus a monthly chart (`lib/reports/defs_financial.js:149-260`). |
| Trial Balance | range, property | Opening, debits, credits, closing, balanced flag (`defs_financial.js:40-80`). |
| General Ledger Detail | range, property, GL account | Summary by account plus detail with running balance (`defs_financial.js:82-147`). |
| Check & Payment Register | range, property, bank account | Deposits and payments through cash accounts, with running balance (`defs_financial.js:262-316`). |
| A/P Aging | as-of, property | By vendor and by open bill (`defs_financial.js:404-468`). |
| Deposit Detail | range, property | Recorded deposits vs ledger with a match status, trust positions, deposit activity (`defs_financial.js:470-595`). |
| Management Fees | range, property | See 6.95. |
| 1099 Summary | range, threshold | Vendors only (`defs_financial.js:597-678`). |

**Notable absent features (module 7):**
- **Report building:** report designer or builder (7.2); saved views (7.11); custom fields in reports (7.10).
- **Report content:** portfolio roll-ups (7.6); basis toggle (7.7); comparative and 12-month statements (7.8); budget report (7.9); drill-down (7.14).
- **Export and delivery:** native PDF (7.19); Excel (7.20); list-screen export (7.21); email attachments (7.23); quarterly/annual schedules (7.25).
- **Analytics:** custom dashboards (7.27); BI access (7.29); benchmarking (7.30).

## 8. Compliance & specialty residential

| # | Feature | Maturity | Evidence (path:line) | Notes / what is missing |
|---|---|---|---|---|
| **Affordable housing** | | | | |
| 8.1 | Property "Affordable program" select (None, LIHTC, Section 8 project-based, HOME, Inclusionary zoning, Other); "Income limit (% AMI)"; "Accepts housing vouchers" | Saved-but-unused | `scr/properties/sections/property_tabs.jsx:223-232` | Stored in `metadata.rentSettings`. Grep `affordableProgram\|incomeLimitAmi\|acceptsVouchers` outside property_tabs.jsx (and the sandbox seed): no hits. |
| 8.2 | Lease "Housing assistance": subsidized switch, program / housing authority, assistance (HAP) amount per month, read-only "Tenant portion" | Saved-but-unused (display only) | `scr/leasing/config.jsx:140-150` | The only reader of `hapAmount` is the tenant-portion formatter on the same form (`:149`). Billing posts the full `rent_accounts.rent` to the tenant (`lib/jobs/financial.js:188-225`). |
| 8.3 | Tenant subsidy program and monthly subsidy amount | Saved-but-unused | `scr/tenants/config.jsx:149-150` | Grep `subsidyProgram\|subsidyAmount`: definitions only. |
| 8.4 | Application "Housing voucher / subsidy" switch and monthly voucher amount | Saved-but-unused | `scr/marketing/sections/application_sections.jsx:125-126` | Grep `voucherAmount`: definition only, so it does not feed the income-to-rent check. |
| 8.5 | Rent split between tenant and housing authority (HAP receivable) | Absent | `lib/jobs/financial.js:188-225` | One rent charge per lease, to the tenant. No PHA/HAP party, account or receivable. |
| 8.6 | HUD / LIHTC compliance: TRACS, HUD-50059, TIC and income (re)certification, utility allowances, set-aside tracking, student rule, compliance monitoring, PHA tooling | Absent | grep `-i "tracs\|50059\|recertif\|income cert\|utility allowance\|set.aside\|tax credit"` over lib, components, migrations: no code hits | Only the labels in 8.1-8.4, and HUD links in Legal Resources. |
| **Rent regulation and legal reference** | | | | |
| 8.7 | Rent control: "Rent controlled / stabilized" switch, "Annual increase cap" %, "Rent registration #" | Saved-but-unused | `scr/properties/sections/property_tabs.jsx:226-228` | Grep `rentIncreaseCapPct\|rentRegistrationId\|rentControlled` outside the field list: no hits. |
| 8.8 | Enforcement of a rent-increase cap on renewals or escalations | Absent | same grep as 8.7 | Renewal offers (2b.56) and escalation steps (2b.9) are not checked against any cap. |
| 8.9 | Jurisdiction-aware rule engine (state late-fee caps, deposit limits and return deadlines, notice periods) | Absent | `lib/policies.js:44, 110` | Policies carry only hints ("Check your local limits", "Required in some jurisdictions"); values are typed by hand. |
| 8.10 | Legal Resources reference library: one row per state, DC and federal (primary statute citation, statewide rent cap, rent-control preemption, local rent-control list, last reviewed), plus pinned official links by category, topic, audience and format | Working (read-only reference) | `mig/20261019184635_legal_resources.sql:1-10, 23-60`; `scr/legal/legal_resources.jsx:22-30`; `supabase/seeds/legal_resources/` | Per the 2026-11-03 profile: 1,222 links across 51 jurisdictions plus federal, about 260 flagged "unverifiable". Links only; not legal advice. |
| 8.11 | Legal Resources views: Directory, Library (topic tiers), tile-grid Map. Opens on the state holding most of the company's properties and counts properties per state | Working | `scr/legal/legal_resources.jsx:28-30, 81-89, 120`; `scr/legal/constants.js:147` | Not wired into any rule, policy or notice (see 8.9). |
| 8.12 | Company-specific legal resources (project-scoped additions) | Stub/placeholder | `mig/20261019184635_legal_resources.sql:6-9`; `lib/supabase/legal_resources.js:63, 82, 111` | The schema allows `project_id` rows, but the data layer has list functions only; no create or edit UI. |
| **Insurance certificate tracking** | | | | |
| 8.13 | Renters-insurance tracking (staff side): tenant `insurance_policy` records with expiry badges; compliance state (compliant / expiring / expired / missing); waiver flag; "Insurance gaps" filter and KPI | Working | `lib/compliance.js:1-60`; `scr/tenants/sections/insurance.jsx:19-53`; `scr/tenants/config.jsx:110-122, 178, 239-247` | Policies arrive by upload (4.33). No insurer feed, master policy or force-placed coverage (4.35-4.36). |
| 8.14 | Renters-insurance reminders at 30, 7 and 0 days, a monthly "no policy on file" reminder to active tenants, and a team digest | Working [job] | `lib/messaging/reminder_jobs.js:325-330, 440-447` | Email only. |
| 8.15 | Vendor certificate-of-insurance (COI) tracking: policy records, compliance roll-up, non-compliant and expiring views; reminders at 30, 14 and 0 days; staff digest on expiry; COI waiver; fallback to the legacy `vendors.insurance_expiry` column | Working [job] | `lib/compliance.js:41-60`; `scr/vendors/shared.js:136-149`; `lib/messaging/reminder_jobs.js:405-421` | Expiry-date based only. Coverage minimums are not checked (5.105). Unreviewed portal uploads count as compliant (5.61). Non-compliant vendors are not blocked (5.106). |
| 8.16 | Vendor licence tracking (when `licenseRequired`), with reminders at 30 and 0 days | Working [job] | `scr/vendors/shared.js:151-160`; `lib/messaging/reminder_jobs.js:422-425` | — |
| 8.17 | Insurance Compliance report (tenants' renters insurance; vendors' COIs and licences, as of a date) | Working | `lib/reports/defs_operations.js:596-663` | Reads tenant-level policies only, not lease-level ones (2b.25). |
| 8.18 | Regulatory filings (HUD, state rent registries, LIHTC annual owner certification) | Absent | see 8.6 | 1099 filing: 6.51-6.52. |
| **Specialty residential** | | | | |
| 8.19 | HOA / association details on a property: contact, dues amount, frequency and payer, special assessments, CC&Rs / bylaws links, board approves leases, minimum lease term, rental cap | Saved-but-unused | `scr/properties/sections/property_tabs.jsx:33, 335-379`; `scr/properties/constants.js:37-40` | Records the landlord's obligations to an external HOA. Grep `duesAmount\|specialAssessment\|leaseApprovalRequired\|minLeaseTermMonths\|rentalCap` outside property_tabs.jsx: no hits. Nothing bills dues or enforces the minimum term or rental cap. |
| 8.20 | Association (HOA/condo) management: homeowner ledgers, dues billing, assessments, board portal, architectural requests, owner violations | Absent | same grep as 8.19 | "HOA" exists only as a property type and a details tab. |
| 8.21 | Student housing (by-the-bed leasing, roommate matching, academic terms, parent-guarantor workflow), senior living (care levels), manufactured housing (lot rent, home ownership), military housing | Absent (type labels only) | `scr/properties/constants.js:19-31`; grep `-i "by.the.bed\|per.bed\|roommate match\|care level\|lot rent\|military housing"`: no hits | — |
| 8.22 | Fair-housing tooling (advertising checks, reasonable-accommodation tracking, VAWA/SCRA checks) | Absent | grep `-i "fair housing\|reasonable accommodation\|VAWA\|SCRA\|servicemember"` over lib and components (outside legal constants and seeds): no hits | A fair-housing check field on listings is unread (2a.12). Adverse-action reasons are recorded at decision time (2a.47). |

Cross-references (not counted here):
- Pet-vaccination and parking-permit reminders (4.52).
- W-9 reminders and 1099 (6.48-6.52).
- Eviction tracking and the payment block (2b.102, 3.33).
- Commercial lease terms and CAM (2b.16, 6.75).

**Notable absent features (module 8):** affordable-housing compliance of any kind (8.5-8.6); rent-control enforcement (8.8); a jurisdiction rules engine (8.9); regulatory filings (8.18); HOA/condo association management (8.20); student, senior, manufactured and military housing specifics (8.21); fair-housing tooling (8.22).

## 9. Platform & admin

| # | Feature | Maturity | Evidence (path:line) | Notes / what is missing |
|---|---|---|---|---|
| **Roles and permissions** | | | | |
| 9.1 | Permission catalogue: one `view.*` key per nav section and page, plus 10 action keys (team.invite, team.assign_roles, roles.manage, billing.manage, settings.manage, records.delete, accounting.post, accounting.void, reports.export, reports.schedule) | Working (UI gating) | `lib/rbac.js:4-15, 77-80`; `scr/settings/permissions.js:22-44` | Page keys derive from sidebar titles. |
| 9.2 | Five seeded roles (Owner, Manager, Leasing agent, Maintenance tech, Accountant); custom roles; a role × permission matrix with section/page inheritance | Working (UI gating) | `scr/settings/permissions.js:56-126`; `scr/settings/roles_permissions.jsx:17-18` | — |
| 9.3 | Role resolution: project creator gets full access; otherwise the team member is matched by email or user id; disabled members are denied; default is Manager; with no roles saved, everything is allowed | Working | `context/rbac-context.js:40-50, 81-90` | — |
| 9.4 | Enforcement of permissions on data | Partial | `scr/settings/permissions.js:4-6` ("Advisory UI gating only — it doesn't secure data"); `lib/messaging/auth.js:22-57` | Permissions hide nav and disable controls. Server routes check only that the caller can see the project; no route checks a role. RLS is demo-open (9.45), and the ledger RPCs are granted to `anon` (6.7). |
| 9.5 | Gated actions in the UI: post and void ledger entries, approve bills, record payments, delete records, export and schedule reports, invite members, assign roles | Working (UI gating) | `scr/accounting/ledger_dialogs.jsx:49-50`; `scr/accounting/bills.jsx:651, 714, 729`; `scr/entity/entity_list_screen.jsx:230-234`; `scr/reports/report_view.jsx:287-288` | — |
| 9.6 | Property-scoped or record-level access (limit a user to some properties or portfolios); field-level permissions | Absent | `resolveRole` has no property scope (`context/rbac-context.js:40-50`); grep `assignedProperties\|propertyIds\|property_ids` over context, lib/rbac.js and settings: no hits | — |
| 9.7 | `billing.manage` permission | Stub/placeholder | `lib/rbac.js:8` | No subscription or billing feature exists for it to gate. |
| 9.8 | Team & Members: member records (name, email, role, status Invited / Active / Disabled / Draft) | Partial | `scr/settings/team_members.jsx:25-27, 127-136`; `scr/settings/shared.js:133-149` | "Invite" only creates a row: no invitation email, no account provisioning. Workspace access itself comes from suite project membership. |
| **Audit trail** | | | | |
| 9.9 | Per-record activity timeline (`property.activity`): created, updated (before/after values per field), deleted, duplicated and action-run events, with actor id and name, plus user notes | Partial | `mig/20260708132814_property_shared.sql:112-127`; `lib/supabase/activity_log.js:73, 116-128`; `scr/entity/entity_detail_screen.jsx:151, 180, 210`; `scr/entity/entity_list_screen.jsx:323, 362, 378`; `lib/messaging/threads.js:178` | Written from the browser, fire-and-forget, and only by entity-engine screens and some server flows. The table is demo-open, so entries are editable; `softDeleteActivity` exists (`activity_log.js:95`). No DB triggers. Ledger history is immutable by convention instead (6.6-6.7). |
| 9.10 | Server-side logs: `job_runs`; `notification_sends` (dedupe ledger); `automation_runs` (step log); `stripe_events` (verified webhook events, dedupe and audit) | Working | `mig/20261015212609_messaging_scheduler_automations.sql:1-10`; `mig/20261015215336_online_payments_stripe.sql:138` | — |
| 9.11 | Workspace-wide audit-log viewer or export; sign-in / access history | Absent | `listActivity` queries by owner record only (`lib/supabase/activity_log.js:50-60`); grep `login history\|last_sign_in\|ip_address`: no hits | — |
| **Workflow and approvals** | | | | |
| 9.12 | Domain approvals, each a single step: bills above one project-wide limit; work orders above the owner-approval policy (owner-portal approve/reject); amenity reservations when `approvalRequired`; application decisions | Working (single-step) | `scr/accounting/bills.jsx:73-88, 621-720`; `lib/policies.js:125`; `scr/amenities/shared.js:212-227`; `scr/marketing/applications.jsx:390-485` | Detail: 6.34, 5.27-5.31, 4.56, 2a.47. |
| 9.13 | Generic approval engine: multi-step chains; routing by amount, role, property or GL; delegation; approval inbox | Absent | grep `approval_rules\|approval_steps\|approver_role`: no hits | — |
| **Low-code workflow builder** | | | | |
| 9.14 | Workflow builder on a React Flow canvas: auto-saves trigger, conditions, steps and node positions; enable or pause | Working | `scr/automations/canvas/workflow_canvas.jsx:1-29`; `lib/automations/catalog.js:1-5` | Steps run in a linear sequence. |
| 9.15 | 12 triggers: lease created, activated, ending (N days); application submitted, approved; work order created, completed; payment received; rent overdue (N days, minimum balance); move-in scheduled; move-out scheduled; on a schedule (daily / weekly / monthly; once, per active lease, or per tenant with a balance) | Working [job] | `lib/automations/catalog.js:29-104` | No triggers for renewals, notices, inspections, bills, prospects, showings, listings, waitlist or insurance expiry. "Conditionally approved" applications do not fire. Rent-overdue reads the unsynced `tenants.balance` (3.49). |
| 9.16 | Record-event queue: DB triggers on leases, applications, work_orders, transactions and moves, plus `emit_record_event` from online payments | Working | `mig/20261015212609_messaging_scheduler_automations.sql:292-300`; `lib/payments/posting.js:249-262` | — |
| 9.17 | Conditions: an AND-only list of field / operator / value rules over 6 record field sets; 9 operators | Partial | `lib/automations/catalog.js:134-221` | No OR groups, branching or custom-field conditions. |
| 9.18 | Step "Send a message" (email to tenant, applicant, vendor, owner, team or a custom address; template or custom text with merge fields) | Working (email) / Stub (SMS) | `lib/automations/catalog.js:225-249`; `lib/automations/runner.js:268-299`; `lib/messaging/deliver.js:1-24` | The SMS channel is selectable, but no SMS provider exists (4.47). |
| 9.19 | Steps "Notify the team" (activity entry plus optional email), "Create a work order", "Update status", "Wait N days" (persisted resume) | Working [job] | `lib/automations/runner.js:301-383, 418-428` | — |
| 9.20 | Steps to post a charge or fee, call a webhook, assign a person or create a task | Absent | the step list is fixed at 5 (`lib/automations/catalog.js:225-231`) | The landing page's "post fees" claim (`components/landing/product_explorer.jsx:24`) is not met. |
| 9.21 | 11 built-in workflow templates (Move-in welcome, Move-out checklist, Collections follow-up, Application received, Approved applicant next steps, New lease kickoff, Maintenance request received, Repair follow-up, Payment thank-you, Monthly rent reminder, Renewal outreach); "Use template" creates a Draft | Working | `lib/automations/catalog.js:289-514`; `scr/automations/workflow_templates.jsx:34-35` | "Maintenance request received" never fires for portal requests (5.51). |
| 9.22 | Idempotent runner (one run per automation and dedupe key; step progress persisted; runs claimed before executing; failures logged) and Run History screen | Working [job] | `lib/automations/runner.js:18-22, 388-441`; `scr/automations/run_history.jsx` | Failed runs are not retried (grep `retry` in the runner and run history: no hits). |
| 9.23 | Custom fields: 11 types × 10 entities (properties, buildings, units, tenants, leases, owners, vendors, work orders, applications, prospects), shown as an editor section | Partial | `scr/settings/shared.js:104-131`; `scr/entity/sections/factories.jsx:518-569` | Not used in list columns, filters, reports, merge fields or automation conditions (grep `custom_fields` in lib/reports, lib/leasing and lib/automations: no hits). |
| 9.24 | Custom objects, custom screens, custom navigation | Absent | `scr/registry.jsx:85-176` | A static title → component map. |
| **API, webhooks and integrations** | | | | |
| 9.25 | Public API (REST or GraphQL), API keys, OAuth apps, SDK, MCP | Absent | `app/api/` holds 43 first-party routes only (cron 3, messages 4, payments 9, portal 26, Stripe webhook 1); grep `x-api-key\|oauth\|openapi\|graphql`: none | — |
| 9.26 | Outbound webhooks: endpoints with 6 event names (tenant.created, lease.signed, payment.received, work_order.created, work_order.completed, application.submitted) and an enable toggle | Saved-but-unused | `scr/settings/integrations.jsx:142-181` ("nothing is sent"); `scr/settings/shared.js:91-100` | Grep `webhooks` in lib and app: only the Stripe client and comments; nothing reads the setting. |
| 9.27 | Inbound Stripe webhook (signature verified; events deduplicated in `stripe_events`) | Working | `app/api/stripe/webhook/route.js:17, 85` | — |
| 9.28 | Integrations screen: six provider cards (Payments/Stripe, E-signature, Screening, Listing syndication, Accounting export, Email & SMS), all "Not connected", Connect disabled | Stub/placeholder | `scr/settings/integrations.jsx:26-36, 103-135` | Stale: Stripe is live through env keys. |
| 9.29 | Live third-party integrations: Stripe (card and ACH, autopay, refunds, payouts, disputes); outbound email via geiger-dash and Resend | Working | `lib/stripe/server.js`; `lib/email/client.js:1-16` | The only two. |
| 9.30 | Other integrations: accounting sync (QuickBooks, Xero), bank data (Plaid), screening, e-sign, ILS, SMS (Twilio), Zapier/Make, BI connectors | Absent (tracking-only where noted in 2a, 2b, 6) | grep `quickbooks\|xero\|plaid\|docusign\|twilio\|zapier\|snowflake\|bigquery\|tableau` over app, lib, components: option labels only | — |
| **Data import and export** | | | | |
| 9.31 | CSV or Excel import (properties, units, tenants, leases, opening balances, vendors) and a migration wizard | Absent | grep `papaparse\|csv-parse\|parseCsv\|xlsx\|exceljs\|sheetjs\|FileReader` over lib, app, components: only a chat file-icon map (`lib/supabase/chat_files.js:17`) | Opening balances would have to be manual journal entries. The only bulk-create is "Add units" (1.8). |
| 9.32 | Bulk edit or bulk actions on list screens; trash / restore of soft-deleted rows | Absent | grep `bulk` in `scr/entity/entity_list_screen.jsx`: none; soft delete only (`lib/supabase/entity_factory.js:151-157`), grep `restore`: none | Single-row duplicate exists (`scr/entity/entity_list_screen.jsx:338-363`). |
| 9.33 | Data export | Partial | `lib/reports/csv.js:1-3` | Report CSV and browser print-to-PDF only. No list-screen export, full-account export or Excel (7.19-7.21). |
| **Document management** | | | | |
| 9.34 | Documents attached to properties, units, buildings, portfolios, floor plans, unit types and amenities, plus library uploads; tenant documents | Working | `lib/supabase/documents.js:5-7`; `scr/entity/shared_sections/documents_section.jsx:104` | Leases, notices and inspections save generated .txt files here (2b.46, 2b.89, 2b.96). |
| 9.35 | Document Library: one searchable list over every file, filterable by source (Library, Property records, Tenant, Maintenance) and kind (lease, inspection, insurance, invoice, notice, other), with upload | Working | `scr/documents/document_library.jsx:67-127`; `scr/documents/shared.js:26-45` | Financial records have no attachments (6.11). |
| 9.36 | Folders, tags beyond kind, versioning, check-in/out, retention rules, full-text or OCR search | Absent | grep `version\|folder` in `scr/documents/document_library.jsx` and `documents_section.jsx`: no hits | — |
| 9.37 | Document access control | Partial (insecure) | `lib/supabase/property_storage.js:7-13` | Files sit in the public "products" bucket and open by public URL. |
| **Authentication, SSO and mobile** | | | | |
| 9.38 | Staff sign-in delegated to the suite dashboard (shared Supabase auth cookie); Property has no login page of its own | Working (inherited) | `utils/supabase/middleware.js:4-7` | Portal sign-in: 4.1. |
| 9.39 | Enterprise SSO (SAML/OIDC), SCIM provisioning, MFA | Absent in this repo | grep `-i "signInWithSSO\|saml\|\bsso\b\|\bmfa\b\|totp"` over lib, app, components, utils, context: no hits | Whether the suite dashboard offers them was not inspected. |
| 9.40 | Responsive web for the staff app and portals | Partial | `lib/hooks/use-mobile.js`; `components/portal/portal_topbar.jsx` | Responsive only; no offline mode. |
| 9.41 | Native iOS/Android apps, PWA (manifest, service worker), offline mode, push notifications | Absent | grep `manifest\|serviceWorker\|expo\|react-native\|capacitor\|web-push` over app, public, package.json: no hits; `public/` holds only favicons and SVGs | Technician-specific: 5.112. |
| **Scheduled jobs** | | | | |
| 9.42 | Job framework: 12 registered jobs, each with a cron expression and interval, idempotent and logged to `job_runs`: recurring-charges, late-fees, management-fees, deposit-interest, autopay, preventive-work-orders, scheduled-announcements, lease-reminders, rent-reminders, expiring-documents, automations, scheduled_reports | Working (code) | `lib/jobs/registry.js:7`; `lib/jobs/financial.js:493-520`; `lib/jobs/autopay.js:45-52`; `lib/jobs/operations.js:14-30`; `lib/messaging/reminder_jobs.js:131, 228, 326, 521`; `lib/jobs/preventive_work_orders.js:144`; `lib/jobs/scheduled_reports.js:155`; `lib/jobs/execute.js:4-6` | The earlier profile counted 8. |
| 9.43 | Triggering: `GET /api/cron/<job>` and `/api/cron/run-due` with a `CRON_SECRET` bearer token; staff "Run now" / "Run all due" in the Scheduled Jobs dialog | Working | `app/api/cron/run-due/route.js:6-30`; `scr/automations/scheduled_jobs.jsx:23, 66-76` | — |
| 9.44 | Jobs actually scheduled | Partial | `vercel.json` holds only `$schema` | Nothing runs without an external scheduler or a staff click. The dialog still says "Vercel Cron runs them daily" (`scr/automations/scheduled_jobs.jsx:121`), which is stale. |
| **Security posture** | | | | |
| 9.45 | Row-level security: enabled on every `property.*` table, but the policies are `for all to anon, authenticated using (true) with check (true)`, including payments, autopay, Stripe events and portal members | Partial (demo-open) | `mig/20261015212744_ledger_core.sql:257-259`; `mig/20261015215336_online_payments_stripe.sql:83-86, 133-136, 163-166`; `mig/20261015215447_portal_members_access.sql:79-83`; `conventions/MIGRATION_CONVENTIONS.md:306-317` | 22 of 31 migrations contain `using (true)`. It is the current suite convention. |
| 9.46 | Staff API routes verify the session and check project visibility through RLS on `public.projects`, then use the service role | Working | `lib/messaging/auth.js:6-9, 22-57` | No role check (9.4). |
| 9.47 | Browser-side project scoping (`scopeQuery`) | Partial | `lib/supabase/project_scope.js:15-19` | Rows with a null `project_id` appear in every project. Not enforced by the database. |
| 9.48 | Storage buckets: documents, media and portal uploads in the suite-shared public "products" bucket; chat files in a public `property-chat` bucket (uploader-only update/delete) | Partial (public) | `lib/supabase/property_storage.js:7-13`; `lib/portal/constants.js:40`; `mig/20261019205301_chat_workspace.sql:327-349` | Public read for everything, including leases, insurance declarations, invoices and compliance documents. |
| 9.49 | Portal isolation: `requirePortal()`, then service-role reads and writes scoped to the member; uploads limited to images and PDF, 10 MB, under the member's own prefix | Working | `lib/portal/session.js:6-9`; `lib/portal/files.js:1-23` | — |
| 9.50 | Cron endpoints protected by a bearer secret; Stripe webhook signature check | Working | `app/api/cron/run-due/route.js:12-13`; `app/api/stripe/webhook/route.js:85` | — |
| 9.51 | Rate limiting, IP allow-listing, security headers / CSP configuration | Absent | grep `rate.?limit\|throttle` in lib and app: only the chat typing indicator | — |
| 9.52 | Sensitive-number minimization: only the last 4 digits of SSN/ITIN, TIN and ID numbers are stored | Working | `scr/people/shared.js:45-52`; `scr/tenants/shared.js:157`; `scr/marketing/applications.jsx:121` | Limits PII exposure. No application-level encryption. |
| **Workspace and other** | | | | |
| 9.53 | Multi-project workspaces: one deployment serves many suite projects, each with its own books and settings | Working | `app/project/page.js:15-30`; `mig/20261015212744_ledger_core.sql:25, 51, 89` | Projects are created in the suite. No cross-project roll-up. |
| 9.54 | Settings screens: Company Profile, Team & Members, Roles & Permissions, Custom Fields, Fees & Policies (cascade), Payment Processing, Branding & Portals, Integrations, Notifications | Working | `scr/registry.jsx:167-175` | Unused parts are rated separately: company currency (6.30); policy keys (module 3 table); branding (4.8-4.11); notifications (4.53). |
| 9.55 | Global search box in the topbar | Stub/placeholder (unverified) | `components/internal/topbar/projects/topbar.jsx:20` passes only `searchPlaceholder` | No search handler or index in this repo. The `@geiger/ui` source was not available to confirm its behaviour. |
| 9.56 | In-app notification bell | Partial | `components/internal/topbar/dialogue/notifications_dropdown.jsx:31-36` | Reads the suite's `public.flow_notifications`, but nothing in Property writes there (grep `flow_notifications` in lib and app: no writers). |
| 9.57 | Localization / i18n, multi-language staff app and portals | Absent | grep `i18n\|useTranslation\|next-intl` over lib, components, app: no hits | A portal language preference is saved (4.49) but unused. Formats are fixed to en-US and USD. |
| 9.58 | Try-before-signup playground: the full workspace runs on an in-memory fake Supabase client with a sample portfolio | Working (demo) | `lib/sandbox/sandbox_client.js:1-6` | — |

**Notable absent features (module 9):**
- **Access control:** property-scoped or field-level permissions (9.6); server-side role enforcement (9.4).
- **Approvals and audit:** generic approval engine (9.13); workspace audit log and sign-in history (9.11).
- **Integration surface:** public API (9.25); delivered webhooks (9.26).
- **Data handling:** data import (9.31); bulk edit and trash/restore (9.32).
- **Documents:** document versioning and folders (9.36).
- **Identity and mobile:** SSO, SCIM and MFA (9.39); native or PWA apps (9.41).
- **Operations and security:** configured crons (9.44); rate limiting (9.51).
- **Localization:** i18n (9.57).

## 10. AI & automation

Rules-based automation is inventoried where it lives and is not counted again here: the workflow builder (9.14-9.22), the 12 scheduled jobs (9.42), reminders (4.51-4.52, 8.14-8.16), autopay (3.39, 4.16), late fees (3.21), PM generation (5.66) and management fees (6.90).

| # | Feature | Maturity | Evidence (path:line) | Notes / what is missing |
|---|---|---|---|---|
| 10.1 | "AI Assistant" nav item | Stub/placeholder | `components/internal/sidebar/sidebar_nav.jsx:208`; `scr/registry.jsx:85-87`; `scr/coming_soon.jsx:14-22` | Falls back to a "part of the roadmap" screen. |
| 10.2 | Any AI / LLM / ML / OCR code or dependency | Absent | grep `-i "openai\|anthropic\|@ai-sdk\|\bllm\b\|gpt-\|gemini\|embedding\|pgvector\|\bocr\b\|tesseract\|textract\|pdf-parse\|pdfjs\|langchain\|copilot\|chatbot\|machine.learning\|predictive"` over app, lib, components, migrations, utils, context, package.json: **no hits**; no AI package in `package.json` | Recorded decision: "AI: skip all AI features — a future shared suite package… will provide AI inference" (memory full_build_decisions.md). |
| 10.3 | AI leasing agent or prospect chatbot (answers questions, books tours) | Absent | same grep | Planned as P3 (`docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md:142-150`). |
| 10.4 | AI lead scoring or prioritization | Absent | same grep | No rules-based scoring either (2a.26). |
| 10.5 | Document intelligence: lease abstraction, invoice/receipt OCR into bills, ID document parsing | Absent | same grep; uploads are stored, never parsed (`lib/portal/files.js:17`) | — |
| 10.6 | AI maintenance triage (categorize, prioritize, route; resident troubleshooting) | Absent | same grep | Category and priority are set by hand or by a fixed workflow step. |
| 10.7 | AI transaction categorization, anomaly detection, bill coding | Absent | same grep | Listed as unbuilt (`docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md:105`). |
| 10.8 | Revenue management / algorithmic rent pricing | Absent | same grep | Rent comps are manual (2a.59). |
| 10.9 | Predictive analytics (delinquency risk, renewal likelihood, equipment failure) | Absent | same grep | — |
| 10.10 | AI screening or fraud detection (synthetic identity, paystub tampering) | Absent | same grep | Screening itself is tracking-only (2a.42). |
| 10.11 | Natural-language reporting, copilot or search | Absent | same grep | — |
| 10.12 | AI voice or contact-centre agent; AI message drafting or chat summaries | Absent | same grep | — |

**Notable absent features (module 10):** every AI capability. The only artifact is the placeholder nav item (10.1).

## Changes compared with the 2026-11-03 capability profile

The code is unchanged: HEAD is still `4fdcbd7`. Every difference below comes from reading at a finer grain. Most of them **lower** maturity.

**Corrections to statements in the profile**
1. **Security deposits never reach the ledger.** The profile said "deposits posting to the ledger" (citing `lease_money.jsx:409-451`).
   - Those lines post only prorated rent and move-in fees.
   - `postDepositHeld` and `postDepositReturn` have no caller, and the `deposit_held` dialog cannot be opened (3.56-3.57).
   - Knock-on effects: the deposit-interest job has no GL balances to accrue on (3.62), and Deposit Detail will flag records as unposted (3.63).
2. **There are 12 scheduled jobs, not 8.** The four the profile missed are scheduled-announcements, lease-reminders, rent-reminders and expiring-documents (9.42).
3. **The rent-to-billing disconnect is wider than the escalation defect.**
   - Lease activation creates no rent account (3.1).
   - Month-to-month premiums and accepted renewals also change only `leases.rent` (2b.10, 2b.61).
   - After a renewal, the rent account stays on the old lease.
   - The Rent Roll shows lease rent, which can differ from what is billed.
4. **The recurring-charge frequency defect lives in the lease Charges tab only** (3.7). The Accounting Recurring Charges screen offers only supported frequencies. The same tab also:
   - stores its GL account as a text label, so the pick is ignored (3.8)
   - never reads end date, prorate or show-in-portal (3.9-3.11).

   Separately, no charge stops at lease end (3.12).
5. **Floor plans are uploaded files.** `@xyflow/react` powers only the automation canvas, not a floor-plan canvas (1.14, 1.47).
6. **Lease documents are plain `.txt` files**, not PDFs. Addenda are not merged, and template custom fields print as `[key]` (2b.46, 2b.39).
7. **"Costs billable to owners" was overstated.** Bill-to-owner markup is unused (5.39), tenant chargebacks never post (5.38), and work-order vendor bills skip the approval limit and AP posting (5.40).
8. **Owner management fee % was overstated.** The fee job ignores the owner-level % (6.92). Owner fee terms, payout settings, statement preferences and the reserve/distribution-day policies are all saved but unused (6.79, 6.84, 6.93-6.94).
9. **Portfolios were understated.** The portfolio overview does compute a live KPI roll-up with target alerts (1.2). There is still no ledger or report roll-up (1.4, 7.6).

**New defects found** (not in any earlier note)
- **Late fees:** daily late fees never accrue, because the monthly idempotency key blocks every later day (3.22).
- **Stale `tenants.balance`:** the `rent.overdue` trigger, the Collections follow-up template and the rent-reminder balance field all read this column, which nothing syncs from the ledger (3.49, 4.51).
- **Dashboard rent figures:** the Overview's rent KPIs (Rent Collected, Delinquent Balance, Collection rate, trend) read legacy rent-account metadata, not the GL. The Tenants list and the "needs attention" panel do the same (7.26, 3.47).
- **Owner portal statements:**
  - co-owners miss the property's lines, because postings tag only the primary owner (6.25, 6.78)
  - they likely count the manager's fee income as owner income (6.78).
- **Occupancy:** the Occupancy report counts non-revenue units that the Units screen excludes (1.22).
- **Automations:** resident-portal requests (kind `request`) never fire the work-order-created automation (5.51).
- **Ledger posting gaps:** the GL screen is capped at 500 entries (6.15); manual journal entries carry no dimensions (6.8); Stripe processor fees are never posted (6.63).

**Saved-but-unused is far broader than the profile's short list.** The profile named company currency, the owner approval threshold, commercial terms, rent control and affordable fields. Also unused:
- most property-editor tabs: Banking & Accounting (including a per-property accounting basis and a bill-approval threshold), Rent & Market, Utility billing, Marketing defaults (including "Accept online applications"), Team, Association/HOA (1.35-1.40, 8.19)
- unit and unit-type pricing and default charges (1.12-1.13, 1.24)
- listing fee and lead-tracking fields (2a.9-2a.10)
- lease pets, vehicles, insurance policies, premises extras, auto-MTM, notice days (2b.11-2b.25)
- e-sign signing order and expiry (2b.53)
- work-order SLA hours and visibility and sharing toggles (5.9, 5.52, 5.54)
- vendor rates, service areas, coverage minimums, default GL (5.99-5.105)
- the portal accent colour (4.9), resident contact preferences (4.50) and amenity fees (4.58)
- the SQL balance views and the subledger RPC (6.17)

**Portals and communications are narrower than "Wired" suggested**
- **Communications removed on 2026-10-20.** That change removed more than the inbox. There is now no staff inbox or reply (4.39), no announcement composer (4.43) and no message-template editor (4.45). Prospect and one-to-one email APIs exist, but no screen calls them (2a.23, 4.40).
- **Portal content staff never see:** resident comments on requests (4.30), and vendor notes, decline reasons and completion notes (5.56-5.60).
- **Self-service limits:**
  - Amenity booking and events are staff-only (4.56-4.60).
  - Portal autopay always pays the balance on the due day (4.17).
  - Saved payment methods cannot be managed (4.15).
- **Owner approval is advisory only:** it is not enforced, and owners are not notified (5.30-5.31).

**Other new findings**
- Concessions are never billed (2b.31). No unit-transfer flow exists (2b.83). The application fee ledger is record-keeping only, with no GL posting or Stripe charge (2a.46).
- 1099 is vendor-only; owner 1099 is absent (6.51).
- Ledger immutability is not enforced in the database (6.7).
- `leaflet` is a declared but unused dependency, and there is no map view (1.48).
- **Stale UI labels:**
  - The Scheduled Jobs dialog says "Vercel Cron runs them daily" (9.44).
  - Notification settings say receipts and portal invites are "not sent yet", but both are sent (4.20, 4.53).
  - Integrations shows Stripe as "Not connected" (9.28).
- **Landing-page overclaims beyond those already recorded:**
  - "Prospects book a showing from open slots and get a confirmation straight away" (`components/landing/product_explorer.jsx:35`), but there is no self-scheduling (2a.33).
  - Announcements show "who opened" (`product_explorer.jsx:55`), but there is no open tracking (4.44).

**Confirmed unchanged from the profile:**
- **Accounting core:** double-entry trust GL with 8 dimensions, idempotent posting and void-by-reversal; 29-account chart; manual bank reconciliation; monthly budgets; job costing; RUBS; basic CAM with its limits; single-threshold bill approval.
- **Payments:** Stripe card and ACH with autopay, refunds, and ACH-return NSF handling (now specified in 3.41).
- **Tracking-only providers:** screening, e-sign and ILS syndication; SMS and inbound email are stubs.
- **Not built:** no AI, no public API, webhooks stored but not sent, no multi-entity, intercompany or multi-currency; affordable and rent-control fields are capture-only.
- **Security:** demo-open RLS and public buckets.

## Limitations of this inventory
- The app was not run. Every rating comes from reading code and grepping for readers and writers, so runtime bugs beyond those visible in code are not captured.
- The live database was not compared with the migrations (the `geiger-orm` CLI is not installed, and memory notes about 80 orphan tables in the live DB).
- `@geiger/ui` was not available locally, so shared-component behaviour (for example the topbar search, 9.55) is unverified.
- Module rows were drafted by parallel read-throughs and then merged and de-duplicated. The corrections listed above were re-verified by hand; other rows rely on the cited lines and greps.
- The 2026-11-03 profile's legal-resources counts (1,222 links, about 260 "unverifiable") were not recounted.
