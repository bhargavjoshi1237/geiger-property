# Geiger Property build plan (from the MRI comparison)

**Date:** 2026-11-05 (file 8 added 2026-11-08) · **Code verified at:** HEAD `fecb165` · **Items:** 200 across 8 files

This folder turns every gap and partial match found in the MRI Software comparison into an implementation-ready spec. Each item names the real files, functions and tables to change, the build steps, what to research first, and how to verify the result. A future session should be able to pick one item, do its research list, and build it end to end without re-auditing the code.

Sources: [MRI Software product portfolio](<../reports/MRI Software product portfolio.md>) and [PMX Residential vs Geiger gaps](<../reports/PMX Residential vs Geiger gaps.md>), with the row-level evidence in `../notes/`.

## Files

| File | MRI products covered | Items | P1 | P2 | P3 / later |
|---|---|---|---|---|---|
| [1. Core property management and accounting](1_core_property_management_and_accounting.md) | PMX Residential & Commercial Management, PMX Financials, AP Automation, Vendor Pay, Budgeting, Job Cost, Report Builder, Advanced Retail | 50 (CORE-01–21, CORE-40–68) | 14 | 28 | 8 |
| [2. Leasing and residents](2_leasing_and_residents.md) | Engage CRM, Apply, Broadcast, Secure Sign, Connect, Pay, Interact, Insure, ApartmentData | 41 (LEAS-01–21, LEAS-40–59) | 17 | 15 | 9 |
| [3. Screening and fraud](3_screening_and_fraud.md) | Engage Protect (ResidentCheck, CheckpointID, income verification), Insurent | 21 (RISK-01–21) | 13 | 5 | 3 |
| [4. Affordable, regulated, condo and HOA housing](4_affordable_regulated_condo_hoa.md) | Affordable Housing, PHA Pro, DHCR, Jenark, CondoPlus | 19 (HOUS-01–19) | 1 | 12 | 6 |
| [5. Commercial, facilities, occupier and investment](5_commercial_facilities_investment.md) | Engage @Work, Angus, Evolution, Contract Intelligence, ProLease, ManhattanONE, investment suite | 20 (COMM-01–20) | 0 | 15 | 5 |
| [6. Platform, data, security and AI](6_platform_security_and_ai.md) | Agora, MIX APIs, MAX, Application Studio, Security Console, Audit Trail | 18 (PLAT-01–18) | 5 | 10 | 3 |
| [7. Outside the US: what Property Tree teaches](7_outside_us_property_tree_lessons.md) | Property Tree, Palace and all international and unrelated lines | 14 (INTL-01–14) | 7 | 5 | 2 |
| [8. MRI Agora Orchestrator](8_agora_orchestrator.md) | Agora Orchestrator, Agora Intelligence, Ask Agora, Agora Voice | 17 (ORCH-01–10, ORCH-20–26) | 1 | 8 | 1 + 7 gated (AI) |

In total: 58 P1, 98 P2, 35 P3, 2 deferred or skipped (AI), and 7 gated on the AI decision (ORCH-20–26). Split-priority items are counted under their first priority; "P3 / later" includes the deferred AI items. Each file has a summary table, a build order, the items, and a "Not building here" table where relevant.

## How to pick up an item

1. Read this README's **Standing decisions** and **Cross-cutting blockers** first. Several items can't ship until a blocker is cleared.
2. Read the item in full, including **Depends on**. Build the dependencies first, or confirm with the user that a stub is acceptable.
3. Work through **Research before building**. Provider docs, laws and standards change; re-check anything dated.
4. Ask the user every **Open decision** before writing code (this is step 0 of `conventions/MODULE_CONVENTIONS.md`).
5. Re-verify the cited `path:line` references, since the code may have moved since `fecb165`.
6. Build to the conventions: `AGENTS.md`, `CLAUDE.md`, `conventions/*.md`, `@geiger/ui` only, migrations via `npm run db:new`. Check new table names against the live DB's orphan tables.
7. Prove every **Acceptance criterion**. For ledger items, that includes a balanced trial balance and re-runs that post nothing new.
8. Update the item's status in its file's summary table when done.

Item IDs are stable. The gap numbers in brackets (e.g. `gap 0.1`) refer to the gap report; the table at the end maps each gap to its item(s).

## Standing decisions in force

- **AI:** no AI features now. AI will come from a future shared suite package, and PLAT-18 defines the hook points. MRI bundles AI even in its small-agency Property Tree product, so revisit after launch.
- **E-signature:** a provider adapter (LEAS-09). geiger-docs is the long-term provider. The interim pick is an open decision; the LEAS writer recommends Documenso, with BoldSign as fallback.
- **Screening and listing syndication:** tracking-only until the user picks a vendor (RISK-08/12, LEAS-11).
- **Payments:** Stripe. **Email:** geiger-dash's email service.
- **Suite reuse:** each item says whether to reuse geiger-notify, geiger-campaign, geiger-comms, geiger-forms, geiger-pods or geiger-dash.

## Cross-cutting blockers found during the audit

These cut across files. Resolve them before or alongside the first items that touch them.

1. **Data security (PLAT-01, XL) is worse than the gap report said.**
   - Anonymous callers can run the security-definer `emit_record_event` and the ledger RPCs.
   - `@geiger/rbac` is installed but unused.
   - Some server code reads rows that have no project.
   - Applicant ID documents and pay stubs upload to the public bucket.

   Every public surface waits on this: portals, listing pages, applications, the API and payments.
2. **Money lands in Geiger's own Stripe account.** `lib/stripe/server.js` uses one platform key, the same `GEIGER_STRIPE_SECRET_KEY` that geiger-dash billing uses. There is no Stripe Connect. Rent, application fees and deposits therefore don't reach the manager's trust bank. Decide on Stripe Connect, or another model, before taking live money. This affects LEAS-07, LEAS-13, LEAS-47, LEAS-51/52, CORE-04, CORE-51/54 and INTL-05.
3. **The migrations have drifted from the live database.** The code uses these columns, but no migration creates them:
   - several `applications` columns
   - `recurring_charges.property_id`
   - `esign_requests.provider` and `provider_envelope_id`
   - `listings.virtual_tour_url`

   A database built from the migrations won't match production. Ship a reconciliation migration before building on those tables (see RISK-02, CORE-03, LEAS-01, LEAS-09).
4. **Scheduled jobs.** `vercel.json` has no crons, by design during development. CORE-10 is the launch plan for them. Hourly and 15-minute crons need a Vercel Pro plan.
5. **The geiger-dash email route.** `/api/email/send` drops attachments, although the underlying sender supports them, and it has no reply-to. Statements, receipts and report packets need a dash change, and so do threaded email replies (CORE-12, CORE-57, LEAS-41).
6. **geiger-dash billing** has no per-unit metric, and its checkout is a one-off payment rather than a subscription. INTL-01/02 fix this before pricing goes live.
7. **1099 e-filing.** The IRS's FIRE system stops taking filings on 19 Nov 2026; from 1 Jan 2027 IRIS is the only route. Only the last four TIN digits are stored today (CORE-55).
8. **Legal review is needed for:**
   - the screening criteria engine and cross-company fraud matching, which may make Geiger a consumer reporting agency (RISK-06, RISK-19)
   - report retention periods (RISK-11)
   - the application form, which asks about convictions before any offer and conflicts with fair-chance laws (RISK-13)
   - shipping rent-cap rule rows (HOUS-07+)
   - state trust-account rules (INTL-08)

   HUD's 2016 criminal-records guidance and the CFPB name-matching opinion have been withdrawn, so don't cite them as current.

## Corrections to the gap report

| Gap report said | The code shows |
|---|---|
| 8.1 affordable housing is Skip | Voucher tenants are billed full rent. The split billing is a P1 correctness bug (HOUS-01). Renewals drop the voucher fields. Percentage late fees and the resident portal both use full rent. |
| 5.3 move-in/out inspections aren't scheduled | They are created automatically (`lib/leasing/workflows.js:251-317`), and `work_orders.inspection_id` exists. |
| 9.2 search is a stub | The shared Topbar supports ⌘K search; Property just doesn't wire it (PLAT-05). |
| 7.6 the funnel is per listing only | The Leasing Report already has a company-wide funnel (`lib/reports/defs_operations.js:488-512`). |
| 9.9 SSO/MFA missing | geiger-dash has passkeys and per-org SSO, but no MFA or SAML (PLAT-06). |
| (not listed) | `property_owners` start and end dates are ignored, so rent posts to the old owner after a sale (INTL-11). |
| (not listed) | The 1099 report counts card payments. A/P aging runs from the bill date, because posting never writes the due date. CAM shares exclude vacant space. |
| (not listed) | Rent posting and late fees read different due days. A primary owner's portal statement counts 100% of income, whatever their share. Charges with no GL account post to 4000. |

## Recommended launch path (P1 items)

There are 58 P1 items. At the writers' estimates they add up to roughly 165–360 working days for one sequential build stream; parallel streams shorten that. The order below runs from "can't launch without it" to "launch would be weaker without it". The user may choose to cut the later phases and change the marketing copy instead.

| Phase | Items | Why first |
|---|---|---|
| 0. Truth and safety | PLAT-02 and RISK-01 (S: fix overclaiming copy now), PLAT-01 (security), drift-reconciliation migration, CORE-10 (cron plan) | Nothing public or financial is safe or honest without these. |
| 1. Money is right | CORE-01 → 04, then CORE-05, CORE-06, CORE-07, CORE-08, CORE-09, HOUS-01, then CORE-11 → 14 | Every report, statement and payout reads billing. |
| 2. Customers can move in | PLAT-03, PLAT-04, INTL-03, INTL-04, INTL-05, INTL-06, INTL-07, PLAT-05 | No one switches without data import, opening balances and a reconciled trust account. |
| 3. Leasing front office | LEAS-01 → 11, RISK-02 → 13 | These are the first features a 10–500-unit manager notices. They depend on PLAT-01 and the Stripe decision. |
| 4. Resident communication | LEAS-40 → 45, ORCH-01 | Texting, a staff inbox and online renewals. Portal maintenance requests must fire their automations. |
| 5. Charge for it | INTL-01, INTL-02 | Published per-unit pricing and plan limits. |

After launch, work through the P2 items file by file, using each file's build order.

## Big open decisions for the user

| Decision | Items | Options noted by the writers |
|---|---|---|
| Stripe Connect vs the current platform account | LEAS-07, CORE-04/51, INTL-05 | Connect accounts per manager (recommended for trust money) or another processor |
| Outbound payments provider (vendor payments, owner payouts) | CORE-51/52/54 | Stripe Global Payouts, Dwolla, Checkbook.io, Increase, Modern Treasury, AvidXchange/Melio, or NACHA files |
| SMS provider and model | LEAS-44 | A Twilio subaccount per project with a toll-free verified number; port geiger-campaign's Twilio code rather than calling Campaign's API |
| Screening vendor and who pays | RISK-08/10/12 | TransUnion ShareAble, RentPrep, Checkr, Certn, Experian, SafeRent; applicant pays the vendor, or Geiger collects the fee |
| Interim e-signature provider | LEAS-09 | Documenso (recommended; geiger-docs appears to be built on it) or BoldSign |
| 1099 e-file route | CORE-55 | A partner API, IRIS direct, or an IRIS CSV only |
| Owner entities model | CORE-63, CORE-08 | Extend `owners`, or add a `legal_entities` table |
| Pricing details | INTL-01 | Free tier, unlimited seats, email allowance |
| Enter the HOA market? | HOUS-15–19 | See market scope below |
| AI positioning after launch | PLAT-18, INTL-14, ORCH-20–26 | Keep deferred, or bring forward the suite AI package. geiger-comms already has a multi-provider AI engine to extract (ORCH-20) |

## Market scope: lines marked "not building"

Each file ends with a **Not building here** table (why not, and what would trigger a rethink). The current recommendation, pending the user's decision:

- **Build now, inside the core product:** voucher split billing and rent-increase caps (HOUS-01–12), light mixed-use commercial support (CORE-61/62/68, COMM-11–13), and owner reporting (COMM-08–10). These serve Geiger's existing buyer, so they don't count as new markets.
- **First expansion candidate, after launch:** condo/HOA association management (HOUS-15–19). It sells to the same management companies and reuses the ledger, portals and maintenance.
- **Don't enter:**
  - affordable-housing compliance and public housing authorities
  - occupier lease accounting
  - workplace, facilities and energy management (IWMS)
  - investment and fund accounting
  - enterprise commercial and retail
  - international markets
  - container logistics

## Gap → item lookup

| Gap | Item(s) |
|---|---|
| 0.1 | CORE-01 |
| 0.2 | CORE-02 |
| 0.3 | CORE-03 |
| 0.4 | CORE-04; RISK-21 |
| 0.5 | CORE-06 |
| 0.6 | CORE-05 |
| 0.7 | CORE-07 |
| 0.8 | CORE-08; INTL-11 |
| 0.9 | CORE-09 |
| 0.10 | CORE-10; INTL-06 |
| 0.11 | PLAT-01; RISK-02–03; INTL-06 |
| 1.1 | CORE-63 |
| 1.2 | CORE-43 |
| 1.3 | CORE-60 |
| 1.4 | CORE-64 |
| 1.5 | Skip (Canada pack) |
| 2.1 | LEAS-04–07; RISK-09; PLAT-02 |
| 2.2 | LEAS-01; PLAT-02 |
| 2.3 | LEAS-11 |
| 2.4 | RISK-01–13, RISK-19; PLAT-02 |
| 2.5 | LEAS-09–10; PLAT-02 |
| 2.6 | LEAS-08, LEAS-19 |
| 2.7 | LEAS-02, LEAS-03, LEAS-12 |
| 2.8 | RISK-02, RISK-14–16 |
| 2.9 | RISK-17–18 |
| 2.10 | LEAS-07, LEAS-13; RISK-10 |
| 2.11 | LEAS-17 |
| 2.12 | LEAS-18 |
| 2.13 | LEAS-16 |
| 2.14 | LEAS-20 |
| 2.15 | LEAS-21 |
| 2.16 | RISK-20–21 |
| 3.1 | CORE-14 |
| 3.2 | CORE-12 |
| 3.3 | CORE-13 |
| 3.4 | CORE-15 |
| 3.5 | CORE-18 |
| 3.6 | LEAS-51 |
| 3.7 | LEAS-52 |
| 3.8 | LEAS-44, LEAS-46 |
| 3.9 | CORE-19 |
| 3.10 | CORE-20; HOUS-12 |
| 3.11 | CORE-21 |
| 3.12 | LEAS-57 |
| 3.13 | LEAS-58 |
| 3.14 | LEAS-59 |
| 4.1 | LEAS-40, LEAS-41, LEAS-43, LEAS-44, LEAS-57 |
| 4.2 | LEAS-45 |
| 4.3 | LEAS-42 |
| 4.4 | LEAS-48 |
| 4.5 | LEAS-50 |
| 4.6 | LEAS-49 |
| 4.7 | LEAS-47 |
| 4.8 | LEAS-53 |
| 4.9 | LEAS-54 |
| 4.10 | LEAS-55 |
| 4.11 | LEAS-56 |
| 5.1 | COMM-14–15 |
| 5.2 | COMM-05–07 |
| 5.3 | COMM-02–04, COMM-07 |
| 5.4 | COMM-01 |
| 5.5 | COMM-17–18 |
| 6.1 | CORE-40 |
| 6.2 | CORE-47 |
| 6.3 | CORE-51–52 |
| 6.4 | CORE-53 |
| 6.5 | CORE-55 |
| 6.6 | CORE-56 |
| 6.7 | CORE-46 |
| 6.8 | CORE-65 |
| 6.9 | COMM-19 |
| 6.10 | COMM-20 |
| 6.11 | CORE-66 |
| 6.12 | CORE-49 |
| 6.13 | CORE-67 |
| 6.14, 6.15 | Skip (multi-currency, regional tax) |
| 7.1 | CORE-41, CORE-44, CORE-45 |
| 7.2 | CORE-58; PLAT-02 |
| 7.3 | CORE-42 |
| 7.4 | CORE-59 |
| 7.5 | CORE-57 |
| 7.6 | LEAS-15 |
| 7.7 | PLAT-16 |
| 8.1 | HOUS-01–06 |
| 8.2 | HOUS-07–11, HOUS-14 |
| 8.3 | HOUS-13, HOUS-15–19 |
| 8.4 | PLAT-15; RISK-09, RISK-11 |
| 9.1 | PLAT-03–04 |
| 9.2 | PLAT-05 |
| 9.3 | PLAT-08; RISK-03 |
| 9.4 | PLAT-09 |
| 9.5 | PLAT-10–11 |
| 9.6 | PLAT-12 |
| 9.7 | PLAT-13 |
| 9.8 | PLAT-14 |
| 9.9 | PLAT-06 |
| 9.10 | PLAT-17 |
| 10.1–10.7 | PLAT-18 (AI groundwork, deferred); INTL-14; RISK-14 (10.6); ORCH-20–26 (gated) |
| 11.1 | CORE-11 |
| 11.2 | CORE-50 |
| 11.3 | CORE-51, CORE-54 |
| 11.4 | CORE-16 |
| 11.5 | CORE-48 |
| 11.6 | PLAT-07 |
| 11.7 | LEAS-14; PLAT-02 |
| 11.8 | CORE-17 |
| 11.9 | CORE-44 |

Items with no gap number come from the portfolio report or the Property Tree comparison: CORE-61, 62 and 68 (commercial depth), COMM-08–13 and 16 (owner reporting, commercial tenants), and INTL-01–13 (Property Tree parity). ORCH-01–26 come from the Agora Orchestrator research (`../../mri-agora-orchestrator-research.md`) and use its benchmark IDs (A1–H2).
