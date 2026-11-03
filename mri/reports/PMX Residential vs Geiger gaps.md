# PMX Residential Management vs Geiger Property: missing features

**Date:** 2026-11-04 · **Geiger code:** HEAD `4fdcbd7` · **Scope:** features that MRI's PMX Residential Management (with PMX Financials and its residential add-ons) offers and Geiger Property lacks, has only partly, or has broken.

**Sources**
- **Geiger:** a code audit of 695 features with path:line evidence, in [geiger_feature_inventory.md](<../notes/PMX Residential vs Geiger gaps/geiger_feature_inventory.md>). References like `3.56` point to rows in that file.
- **PMX:** a 396-row feature inventory from MRI's public material (Training Academy course pages, functional specifications, release notes, product pages, UK G-Cloud filings), in [pmx_residential_features.md](<../notes/PMX Residential vs Geiger gaps/pmx_residential_features.md>). IDs like `PMX-3.36` point to rows there, each with a source URL. A few rows cite the earlier notes instead (see the source key at the end).
- **Caveat on the PMX side:** MRI's detailed documentation sits behind its client login. Public evidence proves a feature exists, but rarely how deep it goes. "Not evidenced" means not found in public material, not proven absent.

**MRI renamed its residential add-ons in October 2025.** Old names still appear in older material:

| Old name | Current name |
|---|---|
| Prospect Connect | Engage Apply |
| Resident Connect / Online Renewals | Engage Connect |
| Market Connect | Engage Broadcast |
| ResidentCheck, CheckpointID, income verification | Engage Protect |
| RentPayment | Engage Pay |
| Callmax | Engage Interact |
| MRI Multifamily Insurance | Engage Insure |
| PMX Studio Suite | Application Studio |

Agora Insights has been superseded by Agora Intelligence (June 2026). Engage is sold separately from PMX and also runs on Yardi Voyager.

## How to read this

**Geiger status**

| Status | Meaning |
|---|---|
| **Missing** | Nothing exists in the code. |
| **Tracking-only** | Staff can record a status by hand; no provider or automation sits behind it. |
| **Saved, unused** | The field is stored, but no code reads it. |
| **Partial** | It works, with a material gap. |
| **Broken** | It exists, but has a code-level defect. |

**Where PMX gets it**
- **Core:** PMX Residential Management (RM) or PMX Financials.
- **Add-on:** a separately licensed MRI product, named in the row.
- **Partner:** a third-party product that MRI integrates or resells.

**Priority for Geiger's target customer** (US residential managers with roughly 10–500 units)

| Priority | Meaning |
|---|---|
| **P1 Launch** | Customers expect it on day one, or Geiger already sells it and it is broken. |
| **P2 Grow** | Keeps customers as they scale, or wins customers switching from mid-market tools. |
| **P3 Enterprise** | A PMX-scale feature; build it only when moving upmarket. |
| **Skip** | Outside the chosen scope: non-US, affordable or public housing, and AI under the current no-AI decision. |

## Summary

**105 gaps** against PMX features with public evidence:

| Priority | Gaps | Notes |
|---|---|---|
| P1 | 26 | 11 of them are broken Geiger features (section 0) |
| P2 | 40 | |
| P3 | 28 | |
| Skip | 11 | |

**9 more** are probable PMX features that public material doesn't confirm (section 11).

**Key findings**
- **Fix what's broken first.** The most urgent gaps are basics Geiger already sells but doesn't run correctly:
  - billing that follows the lease
  - security deposits on the ledger
  - scheduled jobs that actually run
  - data security

  PMX treats all of these as core.
- **The leasing front office is the biggest true feature gap.** A small-to-mid manager will notice these first:
  - an online application
  - a listing page with syndication to listing sites
  - screening and e-signature
  - texting and a staff inbox
  - resident statements
  - payment plans
  - online renewals
  - data import
- **Geiger may have the edge on owner accounting.** MRI's public material shows **no owner statements, owner distributions, owner portal or US trust accounting for third-party residential managers**. Fee managers are exactly Geiger's buyer. Geiger has all four (with the defect in 0.8). PMX also relies on partners for RUBS utility billing, vendor insurance tracking and revenue management. Details are at the end.
- **What Geiger can safely leave alone:**
  - multi-entity accounting
  - investor and fund accounting
  - lockbox and phone payments
  - call centres
  - the Agora AI layer
  - affordable housing
  - regional packs (Canada, New York DHCR)

---

## 0. Broken in Geiger, core in PMX

Geiger already offers each of these, but they don't work correctly. All are P1.

| # | Feature | PMX | Geiger today | Ref |
|---|---|---|---|---|
| 0.1 | Billed rent follows the lease (activation, renewals, rent steps, amendments) | Core: lease amendments update rent and concessions; live event-based billing [PMX-2.73, PMX-3.07] | **Broken.** Activating a lease creates no rent account. Rent steps, month-to-month premiums and renewals change only `leases.rent`, while billing reads `rent_accounts.rent`. After a renewal, billing stays on the old lease. | 3.1, 2b.9, 2b.10, 2b.61 |
| 0.2 | Billing stops at move-out | Core: move-out processing feeds deposit disposition [PMX-2.90] | **Missing.** Ending a lease leaves rent and recurring charges active. | 3.12 |
| 0.3 | Recurring lease charges bill at the right frequency, to the right GL account, until the end date | Core: billing options and charge codes [PMX-3.04] | **Broken.** Weekly and semi-annual charges bill monthly. The GL account pick is ignored. End date and prorate settings are unread. | 3.7–3.10 |
| 0.4 | Security deposits held and returned on the ledger, with refunds paid through AP | Core: Statement of Deposit (SODA); refunds generate AP invoices [PMX-3.25, PMX-3.30] | **Broken.** The deposit postings exist, but nothing calls them, so deposit interest has nothing to accrue on. | 3.56, 3.57, 3.62 |
| 0.5 | Daily late fees | Core: late fee formulas (daily options not public) [PMX-3.32] | **Broken.** The monthly key blocks every day after the first. | 3.22 |
| 0.6 | Concessions reduce what is billed | Core: concession codes mapped to charge codes; concessions applied to specific periods [PMX-2.74, PMX-2.75] | **Tracking-only.** Never posted; listing specials don't reach the lease. | 2b.31, 2a.8 |
| 0.7 | Dashboards and balances read the ledger | Core: PM dashboard and role pages [PMX-7.03, PMX-7.04] | **Broken.** The Overview rent figures, Tenants list balances and the rent-overdue automation read stale legacy fields. | 7.26, 3.47, 3.49 |
| 0.8 | Owner statements correct for co-owners | Not evidenced in PMX for third-party residential (see the "Where Geiger matches or leads PMX" section) | **Broken.** Postings tag only the primary owner. The portal statement likely counts the manager's fee income as owner income. | 6.25, 6.78 |
| 0.9 | Vendor bills from work orders go through approval and AP | Core: AP approvals; invoices generated automatically from RM [PMX-6.33] | **Broken.** Work-order bills skip the approval limit and aren't posted to AP. | 5.40 |
| 0.10 | Scheduled processing runs (rent, late fees, autopay, reminders) | Core: month-end processing; scheduled events [PMX-6.52, PMX-9.10] | **Not scheduled.** 12 jobs exist, but `vercel.json` has no crons. | 9.42–9.44 |
| 0.11 | Data security: role permissions enforced on data, private documents, encryption | Core: Security Console, read/write/delete/deny permissions by process and function, TLS and AES-256 at rest [PMX-9.01, PMX-9.03, PMX-9.26] | **Not production-safe.** Database access rules are open to anyone with the public key. Ledger functions are callable anonymously. Permissions only hide UI. Documents sit in a public bucket. | 9.4, 9.45, 9.48, 6.7 |

## 1. Property and portfolio setup

| # | PMX feature | Where PMX gets it | Geiger today | Ref | Priority |
|---|---|---|---|---|---|
| 1.1 | Ownership entities above the property (fund, LLC, parent company) | Add-on: Enterprise Ledger [FS] | **Missing.** No legal-entity layer; owners are only a ledger dimension. | 1.46, 6.24 | P2 |
| 1.2 | Consolidated reporting by portfolio | Core: GL and AP consolidation by project and portfolio [X5] | **Partial.** The portfolio overview works, but portfolios are not a ledger or report dimension. | 1.2, 1.4, 7.6 | P2 |
| 1.3 | Rentable items (garages, parking, storage): availability lookup, added to leases by amendment | Core [PMX-1.09] | **Missing.** Parking and storage exist only as text fields. | 1.49 | P2 |
| 1.4 | Markets, sub-markets and regional managers | Core [PMX-1.07] | **Missing.** | 1.46 | P3 |
| 1.5 | Canada Regional Pack (French statements, Canadian rent control) | Add-on [FS] | **Missing.** US and USD only. | 6.29, 9.57 | Skip |

## 2. Marketing and leasing

| # | PMX feature | Where PMX gets it | Geiger today | Ref | Priority |
|---|---|---|---|---|---|
| 2.1 | Online application: mobile-first, co-applicants join by link, fees collected in the flow, configurable steps, one account from applicant to resident | Add-on: Engage Apply [PMX-2.36–2.42] | **Missing.** Staff enter applications by hand. The landing page claims online applications. | 2a.35 | P1 |
| 2.2 | Public availability pages and property website, fed from the system | Add-on: Engage Broadcast; legacy Pricing & Availability pages [PMX-2.01, PMX-2.06] | **Missing.** "Publish" changes internal state only. | 2a.7, 2a.3 | P1 |
| 2.3 | Listing-site syndication (MITS 5.0 feed, about 25 sites, prices and fees kept in sync) | Add-on: Engage Broadcast [PMX-2.01–2.04] | **Tracking-only.** Channel status is typed by hand; nothing is sent. | 2a.6 | P1 |
| 2.4 | Resident screening: one combined report, packages per property, location-specific rules, human-verified criminal checks | Add-on: Engage Protect [PMX-2.45–2.52] | **Tracking-only.** Results are typed in. The landing page says screening is included. | 2a.42, 2a.43 | P1 |
| 2.5 | E-signature for leases and renewals | Add-on: Engage Secure Sign (inside Apply and Connect) [PMX-2.37, PMX-2.81] | **Tracking-only.** No provider; no signing in the portal. | 2b.50, 2b.54 | P1 |
| 2.6 | Lease document as a PDF from state lease forms | Partner: Blue Moon integration (50+ data points, PDF leases for move-ins, renewals and transfers) [PMX-2.70] | **Partial.** The template merge works, but outputs `.txt`; addenda are not merged. | 2b.46, 2b.49 | P1 |
| 2.7 | Lead CRM with guest cards shared across properties, two-way texting and text campaigns | Core guest cards + add-ons Engage CRM and Engage Interact [PMX-2.15, PMX-2.25, PMX-4.27] | **Partial.** The pipeline works. No messaging from the UI, no lead intake from web, listing sites or phone, and no dedupe. | 2a.13–2a.26 | P1 (messaging, intake); P2 (dedupe) |
| 2.8 | ID and fraud verification: DMV checks, selfie match, used at tour, application and move-in | Add-on: Engage Protect ID Verification [PMX-2.55–2.58] | **Missing.** | 2a.44 | P2 |
| 2.9 | Income verification: payroll or bank connection, pay-stub fraud checks against 700+ indicators | Add-on: Engage Protect [PMX-2.59–2.61] | **Tracking-only.** | 2a.45 | P2 |
| 2.10 | Collecting application fees; a reservation fee or earnest money that blocks move-in until paid | Add-on Engage Apply + Pay; Core reservation fee [PMX-2.39, PMX-2.65] | **Tracking-only.** Recorded only; no charge, no ledger posting. | 2a.46, 2a.18 | P2 |
| 2.11 | Unit transfers, with transferred balances and transfer concessions | Core [PMX-2.91] | **Missing.** A transfer means ending the lease and creating a new one by hand. | 2b.83 | P2 |
| 2.12 | Bulk renewal offers (Lease Renewal Worksheet) | Core [PMX-2.78] | **Missing.** Offers are made one lease at a time. | 2b.68 | P2 |
| 2.13 | Lease amendments (rent, concessions, rentable items, fees, terms) | Core [PMX-2.73] | **Missing** as a flow; fields are edited directly, which feeds the billing defect in 0.1. | 2b.1, 2b.9 | P2 |
| 2.14 | Call tracking numbers, call recording and transcripts, automated answering | Add-on: Engage Interact [PMX-2.25–2.27] | **Missing.** | 2a.10 | P3 |
| 2.15 | Market rent data feed | Add-on: ApartmentData.com [MRI] | **Partial.** Rent comps are entered by hand. | 2a.58 | P3 |
| 2.16 | Lease guarantee product | Add-on: Insurent [MRI] | **Missing.** | 2b.108 | P3 |

Revenue management is partner-only in PMX too (a legacy Rainmaker LRO listing, PMX-2.67), so it isn't counted as a gap.

## 3. Resident billing and receivables

| # | PMX feature | Where PMX gets it | Geiger today | Ref | Priority |
|---|---|---|---|---|---|
| 3.1 | Payment plans (deferred payment agreements) with repayment charge codes and projections | Core [PMX-3.36] | **Missing.** | 3.51 | P1 |
| 3.2 | Resident statements: report, plus one-off or recurring bulk email | Core [PMX-3.43]; online in Engage Connect [PMX-4.02] | **Missing.** The portal says "Contact the office for a statement". | 3.53, 3.54 | P1 |
| 3.3 | Move-out final accounting (SODA): damages, lease violations, accelerated rent, applying credits, walkthrough; deposit statements for applicants too | Core [PMX-3.25, PMX-3.26] | **Partial.** Itemized deductions and the disposition letter work. No GL posting (0.4), no final account statement, no final-month proration. | 3.58, 3.59, 2b.80, 3.18 | P1 |
| 3.4 | Write off open charges | Core [PMX-3.35] | **Partial.** No write-off action; staff post a generic credit. | 3.52 | P2 |
| 3.5 | Amenity reservation fees and deposits, and other event-based charges, posted to the ledger | Core [PMX-3.07, PMX-3.08] | **Saved, unused.** Amenity fees are stored and never posted. | 4.58 | P2 |
| 3.6 | In-office payments with check scanning (remote deposit) | Add-on: Engage Pay [PMX-3.19] | **Missing.** No deposit batching either. | 3.31 | P2 |
| 3.7 | Cash rent payments at retail stores (MoneyGram, 40,000 locations) | Add-on: Engage Pay (partner: MoneyGram) [PMX-4.13] | **Missing.** | 4.23 | P2 |
| 3.8 | Text reminders and receipts; pay by replying to a text | Add-on: Engage Pay, Engage Interact [PMX-4.15, PMX-4.18, PMX-3.39] | **Partial.** Email reminders and receipts work; SMS is a stub. | 4.51, 4.20, 4.47 | P2 |
| 3.9 | Two late fees with a late-fee count (the second can be legal or admin fees) | Core [PMX-3.32] | **Partial.** One fee rule per policy; no count. | 3.20, 3.21 | P3 |
| 3.10 | Calculated deposits (deposit fixed at a multiple of rent to meet legal caps) | Core [PMX-3.28, PMX-8.16] | **Missing.** | 8.9 | P3 |
| 3.11 | Lockbox payment processing across properties | Core: RM Lockbox [FS] | **Missing.** | 3.31 | P3 |
| 3.12 | Pay by phone (live agents and 24/7 IVR) | Add-on: Engage Pay [PMX-4.16] | **Missing.** | — | P3 |
| 3.13 | Bank balance check before a payment to prevent NSF returns | Add-on: Engage Pay (partner: Plaid) [PMX-3.21] | **Missing.** | — | P3 |
| 3.14 | Split ("flexible") rent | Add-on: Engage Pay (partner: Flex) [PMX-3.46] | **Missing.** | — | P3 |

## 4. Resident experience

| # | PMX feature | Where PMX gets it | Geiger today | Ref | Priority |
|---|---|---|---|---|---|
| 4.1 | Two-way resident communication: text, email and voice bulletins to one person, a segment or everyone; one threaded hub | Add-on: Engage Interact [PMX-4.25–4.27] | **Partial.** Residents can message the office, but there is no staff inbox (removed 2026-10-20), no announcement composer and no SMS, and opt-outs are not respected. | 4.38, 4.39, 4.43, 4.47, 4.50 | P1 |
| 4.2 | Resident views, accepts and signs a renewal online | Add-on: Engage Connect [PMX-2.81] | **Missing.** The renewal-offer email isn't live either. | 4.27, 2b.59 | P1 |
| 4.3 | Residents track work orders and get updates | Add-on: Engage Connect [PMX-4.38] | **Partial.** The portal shows status, but no update emails are sent. | 4.29, 4.32 | P1 |
| 4.4 | Resident mobile app | Add-on: Engage Connect app (v1.0.1, Sep 2026, early rollout) [PMX-4.07] | **Missing.** Responsive web only; no installable app. | 9.41 | P2 |
| 4.5 | Renters insurance sold inside the application, managed compliance tracking, force-placed coverage | Add-on: Engage Insure [PMX-4.32–4.34] | **Missing.** Residents upload their own policy. | 4.35, 4.36 | P2 |
| 4.6 | Emergency calls routed to the on-call technician, with on-call schedules | Add-on: Engage Interact [PMX-5.14] | **Partial.** An emergency flag forces Urgent priority; nothing routes it. | 5.10 | P2 |
| 4.7 | Autopay options: fixed amount, skip dates, scheduled future payments | Add-on: Engage Pay [PMX-4.17] | **Partial.** Residents can only autopay the full balance on the due day. | 4.17 | P2 |
| 4.8 | Package tracking with notifications and pickup records | Add-on: Engage Interact [PMX-4.41] | **Missing.** | 4.61 | P3 |
| 4.9 | Live chat on the property website | Add-on: Engage Interact [PMX-2.28] | **Missing.** | 4.68 | P3 |
| 4.10 | Resident surveys by text or voice | Add-on: Engage Interact [PMX-4.28] | **Missing.** | 4.62 | P3 |
| 4.11 | Rent reporting to credit bureaus and rent rewards | Add-on: Engage Pay (partner: Piñata) [PMX-4.21] | **Tracking-only.** | 4.37 | P3 |

## 5. Maintenance and facilities

| # | PMX feature | Where PMX gets it | Geiger today | Ref | Priority |
|---|---|---|---|---|---|
| 5.1 | Purchase orders with line items, budget lookup, approval limits and overrides | Add-on: Purchase Order [PMX-6.34] | **Missing.** Only a free-text PO number. | 5.94, 5.26 | P2 |
| 5.2 | Staff and technician mobile apps | Core: PMX On the Go (free, MRI Cloud only); MRI Service Hub technician app (possibly legacy) [PMX-9.23, PMX-5.12] | **Missing.** Responsive web only; no offline mode. | 5.112, 9.41 | P2 |
| 5.3 | Inspection app with templates, move-in/out inspections scheduled automatically, offline use | Add-on: MRI Inspections powered by HappyCo (legacy); HappyCo partner [PMX-5.09, PMX-5.10] | **Partial.** Web inspections work, but there are no templates, no scheduling, no mobile app, and findings don't become work orders. | 2b.90–2b.93 | P2 |
| 5.4 | Bill residents for work-order costs | Add-on: Facility Management [PMX-5.07] | **Partial.** The chargeback is calculated, but "posted" is a manual switch. | 5.38 | P2 |
| 5.5 | Work orders linked to equipment records | Add-on: Facility Management [PMX-5.05] | **Missing.** | 5.84 | P3 |

## 6. Accounting and finance

| # | PMX feature | Where PMX gets it | Geiger today | Ref | Priority |
|---|---|---|---|---|---|
| 6.1 | Month-end processing and close (an AI reconciliation agent since 2025) | Core [PMX-6.52, PMX-10.04] | **Missing.** No period close, lock dates or year-end close. | 6.12 | P2 |
| 6.2 | Multi-step approvals for AP, purchase orders and budgets | Core AP approvals; Workflow Design (licensed); budget approvals [FS, PMX-9.09, PMX-6.46] | **Partial.** One project-wide bill threshold. | 6.34, 9.13 | P2 |
| 6.3 | Vendor payments by check, ACH or virtual card, with positive pay | Add-on: MRI Vendor Pay (partner: AvidXchange) [PMX-6.36, PMX-6.37] | **Missing.** Bill payments are bookkeeping only. | 6.40–6.42, 6.62 | P2 |
| 6.4 | Check printing with signature images | Core [PMX-6.29] | **Missing.** | 6.41 | P2 |
| 6.5 | 1099-NEC and 1099-MISC (including property payees), printing, e-file via IRS FIRE | Core [PMX-6.35] | **Partial.** Vendor 1099 report only; no owner 1099, forms or e-file. | 6.50–6.52 | P2 |
| 6.6 | Budgeting and forecasting: reforecasts, scenarios, approvals, residential workbooks (renewals, vacancy loss, loss to lease, bad debt) | Add-on: Budgeting & Forecasting [PMX-6.46, PMX-6.47] | **Partial.** Monthly budgets and budget-vs-actual only. | 6.64–6.68 | P2 |
| 6.7 | Journal entry import, export and copy | Core [PMX-6.04] | **Missing.** | 6.8, 9.31 | P2 |
| 6.8 | Automatic inter-entity offsets and elimination entries | Add-on: Enterprise Ledger [FS] | **Missing.** | 6.26, 6.27 | P3 |
| 6.9 | Loan register and amortization | Add-on: Debt Management [PMX-6.51] | **Missing.** | — | P3 |
| 6.10 | Fixed asset accounting and depreciation | Add-on: Fixed Asset Accounting (Asset4000) [PMX-6.50] | **Partial.** Costs can be capitalized; no depreciation. | 6.71, 6.72 | P3 |
| 6.11 | Accruals, including unapproved invoices | Core [X5] | **Missing.** | 6.74 | P3 |
| 6.12 | AP invoice capture and automation | Partner: AvidInvoice (US), Nexus (international) [AVX] | **Missing.** | 10.5 | P3 |
| 6.13 | Job cost with phases, cost codes, commitments, change orders, retainage, draws | Add-on: Job Cost [PMX-6.49] | **Partial.** One budget figure per job. | 6.69, 6.70 | P3 |
| 6.14 | Multi-currency | Core [FS] | **Missing.** | 6.29 | Skip |
| 6.15 | Regional tax engines (VAT/GST) | Core plus regional packs [FS] | **Missing.** | — | Skip |

Investor ledgers, distribution waterfalls and investor portals (Investment Accounting, Investor Connect; PMX-6.53, PMX-6.54) are out of scope and not counted.

## 7. Reporting and analytics

| # | PMX feature | Where PMX gets it | Geiger today | Ref | Priority |
|---|---|---|---|---|---|
| 7.1 | 500+ standard reports, including the rental update report and deposit-statement reports | Core [PMX-7.01] | **Partial.** 15 fixed reports. | 7.1 | P2 |
| 7.2 | Build your own reports: Report Builder, Report Design, Rapid Reports (ad hoc), Report Gateway (SSRS) | Core and add-ons [PMX-7.07–7.10] | **Missing.** The README claims a custom report builder. | 7.2 | P2 |
| 7.3 | Export any list screen to Excel | Core [PMX-7.11] | **Missing.** CSV from reports only. | 7.20, 7.21 | P2 |
| 7.4 | Role-based dashboards (property manager, regional, leasing, service) and chart panels | Core [PMX-7.03–7.05] | **Partial.** One fixed Overview dashboard, with broken rent figures (0.7). | 7.26, 7.27 | P2 |
| 7.5 | Report packets and batches, scheduled and emailed | Core [PMX-7.02, PMX-7.09] | **Partial.** Scheduled reports work, but emails carry no attachments. | 7.22, 7.23 | P2 |
| 7.6 | Leasing and marketing-source analytics; call reporting | Add-ons: Engage CRM, Engage Interact [PMX-7.21, PMX-7.22] | **Missing.** The funnel is per listing only. | 2a.59 | P2 |
| 7.7 | Direct SQL and BI access | Core (depends on hosting) [PMX-7.13] | **Missing.** | 7.29 | P3 |

## 8. Compliance and specialty housing

| # | PMX feature | Where PMX gets it | Geiger today | Ref | Priority |
|---|---|---|---|---|---|
| 8.1 | Affordable housing compliance: HUD, LIHTC, HOME, USDA; TRACS; certifications; subsidy accounting | Add-on: Affordable Housing [PMX-8.02, PMX-8.04] | **Saved, unused.** Labels only; billing charges the tenant the full rent. Don't market this as compliance. | 8.1–8.6 | Skip |
| 8.2 | NYC rent stabilization (DHCR): legal-rent history, registration file, renewal letters, riders | Add-on: DHCR [PMX-8.10] | **Missing.** Rent-control fields are unused. | 8.7, 8.8 | P3 |
| 8.3 | Condo and HOA association management | Add-ons: CondoPlus, Jenark [FS] | **Missing.** | 8.19, 8.20 | P3 |
| 8.4 | Consent flags and anonymization of personal data on request | Core [PMX-8.13] | **Missing.** | — | P3 |

## 9. Platform and admin

| # | PMX feature | Where PMX gets it | Geiger today | Ref | Priority |
|---|---|---|---|---|---|
| 9.1 | Data import and export tool (CSV, Excel templates, field mapping) and full data extracts | Core [PMX-9.17, PMX-9.18] | **Missing.** The only bulk-create is "Add units". | 9.31 | P1 |
| 9.2 | Global search across residents, guest cards and vendors (MRI•GO) | Core [PMX-9.21] | **Stub.** The search box has no handler in this repo (unverified in the shared UI). | 9.55 | P1 |
| 9.3 | Security scoped to entities; centralized user management | Add-on: Advanced User Security [PMX-9.04] | **Missing.** No property-scoped access. | 9.6 | P2 |
| 9.4 | Audit trail on financial tables; login reports | Add-on: Audit Trail; Core: login metrics [PMX-9.06, PMX-9.07] | **Partial.** A per-record activity log, written from the browser and editable. | 9.9, 9.11 | P2 |
| 9.5 | APIs: MIX, 1,000+ APIs, SOAP and flat-file exchange | Add-on: MIX (access gated by partner program; no sandbox) [PMX-9.15, PMX-9.16] | **Missing.** Webhook settings are saved; nothing is sent. | 9.25, 9.26 | P2 |
| 9.6 | Partner marketplace (about 281 partners, about 75 tagged PMX) | Partner Connect [PMX-9.30] | **Partial.** Only Stripe and email are live. | 9.29, 9.30 | P2 |
| 9.7 | Workflow Design: notifications, document routing, approvals | Licensed add-on [PMX-9.09] | **Partial.** The workflow builder works, but has 5 step types, AND-only conditions and no retries. | 9.14–9.22 | P2 |
| 9.8 | Low-code apps: Application Studio (Page Builder, Logic Builder, Configuration Console); Application ToolKit can add tables | Licensed add-ons [PMX-9.11, PMX-9.13] | **Missing.** Custom fields don't reach lists, reports or automations. | 9.23, 9.24 | P3 |
| 9.9 | SSO and MFA through Okta, with identity federation | Core [PMX-9.05] | **Missing** in this repo (the suite level was not checked). | 9.39 | P3 |
| 9.10 | Shared customization exchange (MAX) | [PMX-9.14] | **Missing.** | — | P3 |

## 10. AI and automation

Every MRI AI feature is missing in Geiger; the "AI Assistant" item opens a "Coming Soon" screen (10.1). All are **Skip** under the current no-AI decision. Revisit after launch: MRI added Agora Voice on 3 Nov 2026, and bundles AI even in its small-agency Property Tree product.

| # | PMX feature | Where PMX gets it | Ref |
|---|---|---|---|
| 10.1 | Ask Agora: questions in plain English over PMX data | Add-on [PMX-10.01] | 10.11 |
| 10.2 | In-page assistant (Page Assistance) | Add-on, limited availability [PMX-10.03] | 10.1 |
| 10.3 | Month-end reconciliation agent | Add-on: Agora Orchestrator [PMX-10.04] | 10.1 |
| 10.4 | Agora Intelligence briefings; AI collections workflow | Add-on [PMX-3.42, AG26] | 10.9 |
| 10.5 | Agora Voice / renter lifecycle voice agent: leasing questions, tour booking, maintenance intake | Add-on, announced 3 Nov 2026 [PMX-10.14, PMX-10.15] | 10.3, 10.12 |
| 10.6 | AI fraud detection (ID face match, fake pay stubs) | Add-on: Engage Protect [PMX-10.18] | 10.10 |
| 10.7 | AI-suggested resident replies, with optional auto-send | Add-on: Engage [EAL] | 10.12 |

## 11. Probable PMX features not confirmed in public material

Geiger lacks all of these. MRI's public material neither confirms nor rules them out for PMX Residential. The priority applies to Geiger regardless.

| # | Feature | Note on PMX | Geiger today | Ref | Priority |
|---|---|---|---|---|---|
| 11.1 | Receipts for office (manual) payments | Engage Pay sends receipts for its own payments | **Missing.** Online receipts work. | 3.30 | P1 |
| 11.2 | Bank feeds; statement import with auto-matching | Only partner automation found (REdirect, up to 96% matching) [PMX-6.44] | **Missing.** Manual reconciliation works. | 6.58, 6.61 | P2 |
| 11.3 | Owner payouts by ACH or check; batch distribution runs | No third-party residential owner accounting found at all | **Missing.** Distributions are bookkeeping only. | 6.82, 6.83 | P2 |
| 11.4 | Deposit batching / undeposited funds | Engage Pay has batch reconciliation reports [PMX-7.20] | **Missing.** | 3.31 | P2 |
| 11.5 | Recurring journal entries and recurring bills | Recurring invoice templates found only in Job Cost [PMX-6.49] | **Missing.** | 6.9, 6.44 | P2 |
| 11.6 | Bulk actions on list screens | Not found | **Missing.** | 9.32 | P2 |
| 11.7 | Prospects self-schedule tours online | Not evidenced; Agora Voice books tours by phone [PMX-10.15] | **Missing.** The landing page claims it exists. | 2a.33 | P2 |
| 11.8 | Automatic NSF fee and flags on returned manual payments | Not evidenced (NSF reversal only) [PMX-3.14] | **Partial.** Void only; online ACH returns are handled fully. | 3.43 | P2 |
| 11.9 | Comparative and 12-month financial statements | Likely within the 500+ report library; not confirmed | **Missing.** | 7.8, 7.9 | P2 |

## Where Geiger matches or leads PMX

These items rest on the PMX inventory's "not evidenced" lists and partner-only findings. "Not evidenced" is not proof of absence, so confirm before using them in marketing.

- **Owner accounting for fee managers.** PMX public material shows management-fee calculation only (PMX-6.52). It shows no residential owner statements, owner distributions or owner portal, and trust accounting only for the UK (PMX-6.55). Geiger has:
  - a trust ledger with management fees and trust shortfall checks
  - owner statements and an owner portal
  - owner approval of work orders

  This is Geiger's strongest positioning point against PMX, once the co-owner defect (0.8) is fixed.
- **Utility billing.** PMX relies on partners (Conservice, Zego and others) through a charge import (PMX-3.44). Geiger has bill splitting (RUBS) built in (3.67).
- **Vendor portal and vendor insurance tracking.** Neither is evidenced natively in PMX Residential; insurance tracking is partner-only. Geiger has a vendor portal with job updates and invoice submission (5.55–5.62, 6.36), plus COI and licence tracking (8.15, 8.16).
- **Maintenance inventory, preventive maintenance and unit turns in the base product.** PMX puts work-order depth and PM in the Facility Management add-on (PMX-5.04–5.06). Its market-rate make-ready board and parts inventory are not evidenced. Geiger has all of them (5.64–5.93).
- **Payment safeguards.** After repeated returns, Geiger switches the resident to certified funds and pauses autopay automatically (3.41). In Engage Pay these restrictions are manual or driven by the property management system (PMX-3.20).
- **Apps.** MRI's new resident app launched in Sep 2026 and is unrated. Its RentPayment iOS app is rated 1.5 stars. Geiger's web portals are not an app, but they are not a weak spot.
- **Open API opportunity.** PMX APIs are SOAP and flat-file, gated by the partner program, with "API sandbox: No" (PMX-9.16). A public REST API with a sandbox would be a clear contrast, once Geiger's data security (0.11) is fixed.
- **Price and setup.** The only published PMX price is the UK G-Cloud entry bundle: **£55,000/yr** for Commercial Management, GL, AP and the toolkit, with 500 leases and 10 users. Services cost £200/hour, and Engage CRM alone takes 60–90 days to implement. Geiger has a sign-up-free sandbox (9.58). That advantage only counts once data import (9.1) exists.

## Source key

| Code | Source |
|---|---|
| PMX-x.yy | Rows in [pmx_residential_features.md](<../notes/PMX Residential vs Geiger gaps/pmx_residential_features.md>), each with its source URL |
| [FS] | MRI Functional Specifications: https://www.mrisoftware.com/mrifunctionalspecs/ (last updated 31 Jan 2025) |
| [X5] | MRI X.5 release notes: https://info.mrisoftware.com/x5-release-us |
| [EAL] | Engage for Living launch, 21 Oct 2025: https://www.mannpublications.com/mannreport/2025/10/21/mri-software-delivers-all-in-one-multifamily-engagement-suite/ |
| [AG26] | Agora Intelligence and Orchestrator, 25 Jun 2026: https://www.prnewswire.com/news-releases/mri-software-launches-agora-intelligence-and-agora-orchestrator-delivering-ai-powered-recommendations-and-workflow-execution-for-real-estate-302810129.html |
| [AVX] | MRI Vendor Pay / AvidInvoice (AvidXchange): https://www.mrisoftware.com/ca/?p=23216 |
| [MRI] | Other MRI pages and releases cited in [mri_residential_products.md](<../notes/MRI Software product portfolio/mri_residential_products.md>) |
