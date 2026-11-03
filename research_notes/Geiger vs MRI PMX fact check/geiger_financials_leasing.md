# Geiger Property: accounting, multi-entity and lease-complexity capabilities (codebase audit, 2026-11-02)

Scope: fact-check of third-party claims about "Geiger Studio" (taken to mean Geiger Property, `C:/Pro/geiger-property`). Every source below is a file in that repo, cited as path:line. Maturity labels used throughout:
- **Schema**: the table or column exists in a migration.
- **Data layer**: `lib/supabase/*.js` reads and writes it.
- **UI**: a screen exposes it.
- **Wired**: it drives behaviour end to end (posts to the ledger, gets read by another feature, or feeds a report).
- **Capture-only**: the value is saved (often in `metadata`) but no code reads it.

Path shorthand: `mig/` = `C:/Pro/geiger-property/supabase/migrations/`, `acct/` = `C:/Pro/geiger-property/components/internal/screens/accounting/`.

## Q1. Is there a chart of accounts, a double-entry journal or a ledger? Do payments post? Cash or accrual? Whose books are they?

### Takeaway
Yes. Geiger Property has a real double-entry general ledger:
- **Core:** a chart of accounts, journal entry headers plus lines, and a balanced-posting RPC enforced by a deferred constraint trigger. Voids are reversals.
- **Scope:** one set of books per **project** (workspace). Property, unit, lease, tenant, owner, vendor, bank account and job are **dimensions on each line**, not separate books.
- **Posting:** rent, payments, bills, owner distributions, management fees and deposits all post to it. Reports are accrual-only, with no cash/accrual basis toggle.

### Cited Findings
**The ledger schema**
- The migration header says it "Owns the double-entry general ledger: property.ledger_entries + ledger_lines, property.bank_reconciliations, the chart-of-accounts extensions on property.gl_accounts… ledger_post (balanced posting), ledger_void (reversal), ledger_ensure_default_chart, ledger_subledger plus the balance/health views" — [mig/20261015212744_ledger_core.sql:1-10](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- An earlier `20261015212541_ledger_engine.sql` is an empty placeholder with a blank `@up` and `@down`, superseded by ledger_core — [mig/20261015212541_ledger_engine.sql:6-9](C:/Pro/geiger-property/supabase/migrations/20261015212541_ledger_engine.sql)
- **Chart of accounts:** `property.gl_accounts` has project_id, name, number and account_type. Later columns add subtype, `is_trust`, `is_system`, `parent_id` (hierarchy) and `system_key`, with a per-project unique system key — [ledger_core.sql:23-45](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- **Entry headers:** `property.ledger_entries` has these columns:
  - entry_date, memo and status (`posted`/`void`)
  - source_type and source_id
  - reversal_of and idempotency_key
  - total, `numeric(14,2)`
  - dimension columns property_id, unit_id, lease_id, tenant_id, owner_id and vendor_id

  source_type is constrained to 13 values: charge, payment, credit, bill, bill_payment, distribution, contribution, management_fee, deposit_held, deposit_return, late_fee, adjustment, deposit_interest — [ledger_core.sql:49-83](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- **Journal lines:** `property.ledger_lines` carries:
  - a GL account foreign key and a debit or a credit, both `numeric(14,2)`
  - dimensions property, unit, lease, tenant, owner, vendor, bank_account and job
  - applies_to_entry_id (open-item matching)
  - cleared, cleared_on and reconciliation_id

  A check constraint enforces "either debit or credit, never both" — [ledger_core.sql:87-126](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- **Balance enforcement:** a `deferrable initially deferred` constraint trigger checks that every touched entry's debits equal its credits at commit — [ledger_core.sql:264-291](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)

**The posting RPCs**
- `property.ledger_post(p_entry, p_lines)` rejects:
  - entries with fewer than two lines
  - unbalanced entries
  - negative amounts
  - lines without a GL account

  It also de-duplicates on idempotency_key — [ledger_core.sql:299-393](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- A later migration redefines it so each line can carry its own dimension (even null), letting one entry "mix owner-trust lines with the manager's own lines (management fees)" — [mig/20261015212915_ledger_post_line_dimensions.sql:1-6, 78-83](C:/Pro/geiger-property/supabase/migrations/20261015212915_ledger_post_line_dimensions.sql)
- **Voids:** `ledger_void` posts a mirror-image reversal entry with `reversal_of` set and marks the original `void`. Nothing is deleted — [ledger_core.sql:398-448](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- **Default chart:** `ledger_ensure_default_chart(p_project_id)` seeds 29 system accounts, including:
  - 1000 Operating Cash, 1010 Trust Cash and 1020 Security Deposit Trust Cash
  - 1200 Accounts Receivable and 2000 Accounts Payable
  - 2100 Security Deposits Held and 2200 Prepaid Rent
  - 3000 Owner Equity, 3100 Contributions and 3200 Distributions
  - 4040 CAM Recoveries and 4500 Management Fee Income
  - 5300 Property Taxes and 5800 Bad Debt

  — [ledger_core.sql:453-528](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)

**Sub-ledgers and views**
- `ledger_subledger(dimension, id, as_of)` allows exactly these dimensions: property, unit, lease, tenant, owner, vendor, bank_account, job — [ledger_core.sql:533-558](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- Four views:
  - `ledger_account_balances` (trial balance)
  - `ledger_party_balances` (receivable, payable, deposits, prepaid, trust and operating cash, income and expense per lease, tenant, owner, vendor and property)
  - `ledger_trust_positions` (trust cash per account × owner × property; negative means a shortfall)
  - `ledger_unbalanced_entries`

  — [ledger_core.sql:561-618](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)

**Posting rules (accrual-style AR/AP)**
- Charge: Dr AR / Cr income — [lib/ledger/postings.js:203-219](C:/Pro/geiger-property/lib/ledger/postings.js)
- Payment: Dr cash (trust cash by default) / Cr AR, allocated per open charge, with any remainder left as an unapplied credit — [postings.js:221-243](C:/Pro/geiger-property/lib/ledger/postings.js)
- Bill: Dr expense (split lines supported) / Cr AP — [postings.js:261-281](C:/Pro/geiger-property/lib/ledger/postings.js)
- Bill payment: Dr AP / Cr cash — [postings.js:283-298](C:/Pro/geiger-property/lib/ledger/postings.js)
- Owner distribution and contribution — [postings.js:300-330](C:/Pro/geiger-property/lib/ledger/postings.js)
- A separate "Cash-basis transaction" builder posts money in, money out and transfers — [postings.js:422-449](C:/Pro/geiger-property/lib/ledger/postings.js)

**Data layer and screens**
- The browser data layer exposes postCharge, postPayment, postCredit, postBill, payBill, postDistribution, postContribution, postManagementFee, postDepositHeld/Return/Interest, postCashTransaction, postJournal, voidEntry and setLinesCleared — [lib/supabase/ledger.js:353-400](C:/Pro/geiger-property/lib/supabase/ledger.js)
- **Rent Collection:** each rent account's balance "is that lease's Accounts Receivable in the general ledger". Rent posts as an idempotent charge per account per month — [acct/rent_collection.jsx:54-57, 88-100](C:/Pro/geiger-property/components/internal/screens/accounting/rent_collection.jsx)
- **Transactions:** described as "cash-basis income, expenses and transfers… Each one posts a balanced entry to the general ledger… voiding or deleting a transaction posts the reversal" — [acct/transactions.jsx:40-43](C:/Pro/geiger-property/components/internal/screens/accounting/transactions.jsx)
- **General Ledger:** the screen has a "New Journal Entry" action for manual entries — [acct/general_ledger.jsx:335](C:/Pro/geiger-property/components/internal/screens/accounting/general_ledger.jsx); [acct/ledger_dialogs.jsx:465](C:/Pro/geiger-property/components/internal/screens/accounting/ledger_dialogs.jsx)
- **Permissions:** posting and voiding are gated by `accounting.post` and `accounting.void` — [lib/rbac.js:11-12](C:/Pro/geiger-property/lib/rbac.js)

**Scheduled jobs**
- Server jobs post due recurring charges and opted-in rent, assess late fees, book monthly management fees and accrue deposit interest. All are idempotent via keys (rc:/rent:/late:/mgmt:/depint:) — [lib/jobs/financial.js:15-20, 492-524](C:/Pro/geiger-property/lib/jobs/financial.js)
- Auto-posted rent is monthly only: the key is `rent:<account>:<YYYY-MM>`, and the job never reads `rent_accounts.frequency` — [financial.js:188-225](C:/Pro/geiger-property/lib/jobs/financial.js)
- `vercel.json` has no cron entries; commit 9be8f05 is titled "removed vercel cordn". Jobs run when an external scheduler calls `GET /api/cron/run-due` with `CRON_SECRET`, or when staff use "Run all due" — [vercel.json](C:/Pro/geiger-property/vercel.json); [app/api/cron/run-due/route.js:6-8](C:/Pro/geiger-property/app/api/cron/run-due/route.js)

**Ledger reports**
- Trial Balance, General Ledger Detail, Financial Statements, Check & Payment Register, Management Fees, A/P Aging, Deposit Detail and 1099 Summary — [lib/reports/defs_financial.js:42-605](C:/Pro/geiger-property/lib/reports/defs_financial.js)
- Trial Balance and Financial Statements filter by date range and property only — [defs_financial.js:46, 161](C:/Pro/geiger-property/lib/reports/defs_financial.js)
- Owner Statements filter by owner and property — [lib/reports/defs_operations.js:326-334](C:/Pro/geiger-property/lib/reports/defs_operations.js)
- The only "basis" wording in report code is `// Income (accrual) per property`. There is no cash-basis toggle — [lib/reports/ledger_math.js:420-421](C:/Pro/geiger-property/lib/reports/ledger_math.js)

**Live-data evidence**
- The demo seed inserts into `property.ledger_entries`, `ledger_lines`, `gl_accounts`, `bills` and `cam_reconciliations` — [supabase/seeds/demo_project/04_accounting.sql](C:/Pro/geiger-property/supabase/seeds/demo_project/04_accounting.sql)
- Memory notes the seed was "validated against the live schema" (~8,150 rows across 76 tables, 2026-10-20) — `C:/Users/space/.claude/projects/C--Pro-geiger-property/memory/demo_project_seed.md`

### Inferences
- **Wired end to end:** schema, RPC, data layer, UI, scheduled jobs and reports are all connected. This is the "trust accounting for a property-management company" model (as in AppFolio or Buildium): one company book with owner and property sub-ledgers. It is not one book per property.
- **Accrual-style:** AR and AP are recognized when charges and bills post. Cash-basis reporting (income recognized when cash is received) is not offered as an option. "Standard cash/accrual books per property" therefore misdescribes the design: the books are per project, not per property, and there is no basis switch.
- **Missing enterprise GL controls:** no period close or lock date (grep for period close, lock date, fiscal year and retained earnings found nothing). There are also no recurring journal templates beyond recurring charges, and no allocations engine beyond RUBS and CAM.

### Gaps
- I could not confirm that the migrations are applied to the live database. `npm run db:status` failed with "'geiger-orm' is not recognized", so the CLI is not installed locally. Applied state is inferred from the demo seed, which inserts into these tables.
- The number of live projects actually running the scheduled jobs is unknown: crons are not configured in `vercel.json`, and memory says the demo project has "everything paused".

## Q2. What entity model exists? How does project_id scoping work? Can one install manage multiple legal entities, with intercompany?

### Takeaway
The unit of "books" is a suite **project** (`public.projects`). Each project gets its own chart of accounts and journal, and one install can host many projects.

Within a project there is **no legal-entity, company or LLC table**. "Owners" are parties with an entity-type label, linked to properties by ownership %, and act as ledger dimensions. Portfolios are display groupings with no accounting role.

There is no intercompany accounting: no due-to/due-from, no eliminations, no cross-project consolidation.

### Cited Findings
**Project scoping**
- Every ledger table carries `project_id uuid references public.projects(id)`, and the default chart is seeded per project — [ledger_core.sql:25, 51, 89, 453](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- Earlier tables got a plain `project_id uuid` (no FK) via the project-scope migration — [mig/20261010165220_project_scope_and_links.sql:1-62](C:/Pro/geiger-property/supabase/migrations/20261010165220_project_scope_and_links.sql)
- Scoping is client-side. `scopeQuery` filters `project_id.eq.<active>` **or** `project_id.is.null`, so legacy unscoped rows appear in every project, and `stampProject` stamps inserts — [lib/supabase/project_scope.js:1-25](C:/Pro/geiger-property/lib/supabase/project_scope.js)
- The workspace route is `app/project/[projectId]`, so one deployment serves many projects — [app/project/](C:/Pro/geiger-property/app/project)
- RLS on the ledger tables is the demo-open policy `for all to anon, authenticated using (true) with check (true)` — [ledger_core.sql:251-262](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)

**Owners and ownership**
- `property.owners` columns: name, email, phone, company, management_fee_pct, payout_method, tax_id_last4, status — [mig/20261010165221_full_build_tables.sql:438-453](C:/Pro/geiger-property/supabase/migrations/20261010165221_full_build_tables.sql)
- Entity type is a metadata label with these options: Individual, Joint, LLC, Corporation, Partnership, Trust, Estate, Non-profit — [components/internal/screens/owners/shared.js:23-26, 46](C:/Pro/geiger-property/components/internal/screens/owners/shared.js); [owners/config.jsx:352-364](C:/Pro/geiger-property/components/internal/screens/owners/config.jsx)
- `property.property_owners` links owners to properties with `ownership_pct`, starts_on/ends_on and is_primary — [mig/20261015210600_engine_foundations.sql:91-108](C:/Pro/geiger-property/supabase/migrations/20261015210600_engine_foundations.sql)

**Portfolios**
- `property.portfolios` has only name, description, manager, region, color and status; properties link to it through a soft `portfolio_id` — [mig/20260708132812_portfolios.sql:23-37](C:/Pro/geiger-property/supabase/migrations/20260708132812_portfolios.sql); [mig/20260708132813_properties.sql:36-37](C:/Pro/geiger-property/supabase/migrations/20260708132813_properties.sql)
- No ledger line carries a portfolio dimension, and `grep portfolio` over `lib/reports` and `lib/ledger` returns nothing. Reports cannot roll up by portfolio — [ledger_core.sql:97-104](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- The portfolio editor has a "Send one consolidated statement" switch (`consolidatedStatements`). No other code reads it (capture-only) — [components/internal/screens/portfolios/sections.jsx:331](C:/Pro/geiger-property/components/internal/screens/portfolios/sections.jsx)

**Company profile**
- One `company_profile` setting per project, holding legalName and similar fields, stored in `property.settings` (unique on project_id + key) — [components/internal/screens/settings/company_profile.jsx:15, 31-33](C:/Pro/geiger-property/components/internal/screens/settings/company_profile.jsx); [full_build_tables.sql:885-901](C:/Pro/geiger-property/supabase/migrations/20261010165221_full_build_tables.sql)

**Intercompany**
- Grep for intercompany, due to/due from, elimination, consolidat(e) and subsidiar(y) across `lib`, `components` and migrations finds no accounting hits. The only matches are a seed memo about "consolidating" a bank account and UI "Due today" labels.
- `ledger_post` checks balance per entry only. It has no per-entity balancing and generates no automatic due-to/due-from lines — [mig/20261015212915_ledger_post_line_dimensions.sql:38-53](C:/Pro/geiger-property/supabase/migrations/20261015212915_ledger_post_line_dimensions.sql)

### Inferences
- **Multiple legal entities today:** either one project per entity, which gives fully separate books with no intercompany and no consolidation, or one project with owners as dimensions. The latter is a single book where each owner's position (trust cash, equity, income and expense via `ledger_party_balances` and owner statements) is a sub-ledger, not a separate balanced trial balance per entity.
- **Intercompany:** the claim that Geiger lacks it is TRUE.
- **Data isolation:** with RLS demo-open and client-side project filtering that also returns null-project rows, nothing at the database layer separates entities. That matters to any enterprise multi-entity buyer.

### Gaps
- I did not inspect `public.projects` itself; it is suite-shared and not defined in this repo. How projects map to customer organizations is not determined here.

## Q3. How is currency handled, and are there any tax fields?

### Takeaway
The app is single-currency USD throughout:
- No money table has a currency column, except Stripe online payments (`'usd'`).
- Every formatter hardcodes `"USD"` or `$`.
- The Company Profile "Currency" picker (USD/CAD/GBP/EUR/AUD/INR) is saved but never read.

Tax support is US-only: 1099 summary, W-9 tracking and a Property Taxes expense account. There is no VAT, GST, sales-tax or regional-tax engine.

### Cited Findings
**Currency columns and formatters**
- The only currency column in the schema is `online_payments.currency text not null default 'usd'` — [mig/20261015215336_online_payments_stripe.sql:34](C:/Pro/geiger-property/supabase/migrations/20261015215336_online_payments_stripe.sql)
- Ledger amounts are bare `numeric(14,2)` with no currency code — [ledger_core.sql:60, 94-95](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- `ledger_post` rounds every amount to 2 decimal places — [ledger_post_line_dimensions.sql:39-40](C:/Pro/geiger-property/supabase/migrations/20261015212915_ledger_post_line_dimensions.sql)
- Hardcoded USD formatters:
  - [acct/shared.js:4-15](C:/Pro/geiger-property/components/internal/screens/accounting/shared.js)
  - [lib/reports/format.js:7, 10](C:/Pro/geiger-property/lib/reports/format.js)
  - [lib/leasing/merge.js:13-14](C:/Pro/geiger-property/lib/leasing/merge.js)
  - [lib/leasing/notice_templates.js:19](C:/Pro/geiger-property/lib/leasing/notice_templates.js)
  - [lib/messaging/context.js:9](C:/Pro/geiger-property/lib/messaging/context.js)
  - [lib/messaging/reminder_jobs.js:18](C:/Pro/geiger-property/lib/messaging/reminder_jobs.js)
  - [lib/payments/posting.js:285](C:/Pro/geiger-property/lib/payments/posting.js)
  - [lib/payments/context.js:126](C:/Pro/geiger-property/lib/payments/context.js)
  - [lib/payments/fulfill.js:29](C:/Pro/geiger-property/lib/payments/fulfill.js)
- Stripe checkout and autopay hardcode `currency = "usd"` — [lib/payments/checkout.js:107](C:/Pro/geiger-property/lib/payments/checkout.js); [lib/payments/autopay.js:137, 384](C:/Pro/geiger-property/lib/payments/autopay.js)

**The Company Profile currency setting**
- `CURRENCY_OPTIONS` lists USD, CAD, GBP, EUR, AUD and INR; the default is `currency: "USD"` — [components/internal/screens/settings/shared.js:36, 53-60](C:/Pro/geiger-property/components/internal/screens/settings/shared.js); [company_profile.jsx:96-101](C:/Pro/geiger-property/components/internal/screens/settings/company_profile.jsx)
- Grep for `.currency` reads across `lib` and `components` finds only the picker's own value binding (`company_profile.jsx:99`). The setting is capture-only. The 2026-10-16 baseline already called it "Never read elsewhere" — [research_notes/Property management software features/geiger_current_state.md:426](C:/Pro/geiger-property/research_notes/Property%20management%20software%20features/geiger_current_state.md)

**Tax**
- Grep for `\bvat\b`, `\bgst\b`, sales_tax, tax_rate and withholding finds nothing.
- US-only tax features:
  - 1099 Summary report, with the comment "IRS 1099-NEC/MISC reporting threshold: $600 through 2025, $2,000 from 2026" — [lib/reports/defs_financial.js:599-605](C:/Pro/geiger-property/lib/reports/defs_financial.js)
  - W-9 reminders — [lib/messaging/reminder_jobs.js:323, 477](C:/Pro/geiger-property/lib/messaging/reminder_jobs.js)
  - Owner `tax_id_last4` — [full_build_tables.sql:447](C:/Pro/geiger-property/supabase/migrations/20261010165221_full_build_tables.sql)
  - 1099 flags on vendors and owners — [components/internal/screens/vendors/config.jsx:201-224](C:/Pro/geiger-property/components/internal/screens/vendors/config.jsx)
  - System GL account 5300 "Property Taxes" (an expense account, not a tax engine) — [ledger_core.sql:489](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)

### Inferences
- **Multi-currency, regional tax and functional-currency roll-up:** the claim that Geiger lacks all three is TRUE. Multi-currency is also the most cross-cutting gap (see Q6): every amount column, the posting RPC, at least nine formatters and Stripe flows assume one currency.

### Gaps
- None material. Absence was established by exhaustive grep, not sampling.

## Q4. Bills, payables and vendor invoices: is there an approval workflow, and is it multi-tier?

### Takeaway
There is a real but **single-tier** bill approval:
- One project-wide dollar limit sends bills above it to "Pending".
- Any user with `accounting.post` can approve. The approval records a free-text approver name and a date, then posts the bill to AP.
- Rejection and re-requesting approval are supported.

There are no tiers, no approval chain, no per-user signing authority and no approval-steps table. A separate owner-sign-off threshold exists for **work orders** only.

### Cited Findings
**Schema and data layer**
- `bills` gained `approval_status` (default 'Not required'), `approver_name`, `approved_at`, job_id, unit_id and ledger_entry_id — [ledger_core.sql:240-249](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- The data layer maps those fields plus glAccountId, propertyId and workOrderId. Those three columns were added in engine_foundations — [lib/supabase/bills.js:6-28](C:/Pro/geiger-property/lib/supabase/bills.js); [engine_foundations.sql:168-170](C:/Pro/geiger-property/supabase/migrations/20261015210600_engine_foundations.sql)

**Screen behaviour** (all in [acct/bills.jsx](C:/Pro/geiger-property/components/internal/screens/accounting/bills.jsx))
- Header comment: "Bills above the approval limit (setting `accounting_settings.billApprovalLimit`) wait for approval before posting" — lines 73-76; the limit is loaded at 83-88.
- New bills over the limit get `approvalStatus: "Pending"`; others get "Not required" — lines 621-636.
- "Approve bill" is gated by `permission: "accounting.post"`. It is one step with an optional "Approved by" text (blank uses your name) and a note, then posts to Accounts Payable — lines 646-690.
- Other actions: "Reject bill", "Require approval" and "Post to Accounts Payable" — lines 692-720.
- The "Approval rules" dialog holds one number: "New bills above this amount wait for approval" — lines 386-422.

**Work-order and owner thresholds**
- Work-order owner sign-off uses the `ownerApprovalLimit` policy from the company → property → lease cascade — [lib/policies.js:125](C:/Pro/geiger-property/lib/policies.js); [maintenance/sections/wo_approval.jsx:25, 67](C:/Pro/geiger-property/components/internal/screens/maintenance/sections/wo_approval.jsx); [wo_overview.jsx:53](C:/Pro/geiger-property/components/internal/screens/maintenance/sections/wo_overview.jsx)
- The owner field `approvalThreshold` ("Work orders and bills above this need owner approval") is capture-only; grep finds no reader — [components/internal/screens/owners/shared.js:147](C:/Pro/geiger-property/components/internal/screens/owners/shared.js)

### Inferences
- **Multi-tier AP routing:** the claim that Geiger lacks it is TRUE. What exists is one threshold and one approver, with no routing by amount band, property, GL account or role, and no signing-authority matrix.
- **Extending it is additive.** RBAC permissions, the wizard and action framework, and the `approval_status` column are already there. Missing pieces are an approval-rules table (tiers, approver role or user) and per-bill approval-step rows.

### Gaps
- Bill approvals live only in the staff UI. I did not check whether the vendor portal exposes bill submission or approval.

## Q5. Leases: what fields exist, are commercial or retail properties supported, and what about CAM, percentage rent and CPI?

### Takeaway
Leases do more than "fixed monthly residential templates":
- There is a `commercial` lease type, Commercial and Mixed-use property types, unit square footage, step and percent rent escalation schedules, and recurring charges with quarterly or annual frequency.
- A working CAM reconciliation screen computes pro-rata true-ups from ledger expenses and posts them to each lease ledger.

The commercial depth is thin:
- The commercial lease terms (expense structure, square feet leased, CAM per month, TI allowance) are capture-only metadata.
- Escalations need a manual "Apply due" and do not reach the billed rent account.
- CAM has no caps, base years, gross-up or per-tenant line exclusions.
- There is **no percentage rent** (no sales reporting, no breakpoints) and **no CPI indexation**.

### Cited Findings
**Lease fields**
- The base `property.leases` table holds name, unit, tenant_name, property_id, tenant_id, `rent numeric`, `deposit numeric`, term_start, term_end, status and metadata — [mig/20260708132810_leasing.sql:42-62](C:/Pro/geiger-property/supabase/migrations/20260708132810_leasing.sql)
- Promoted lifecycle columns: lease_type, term_type, signed_date, move_in_date, notice_date, move_out_date — [mig/20261015212441_leasing_lifecycle_columns.sql:13-18](C:/Pro/geiger-property/supabase/migrations/20261015212441_leasing_lifecycle_columns.sql)
- The data layer also maps unit_id, template_id and renewal_of_id — [lib/supabase/leases.js:10-28](C:/Pro/geiger-property/lib/supabase/leases.js)
- Lease type options are only `residential` and `commercial`; term types are `fixed` and `mtm` — [components/internal/screens/leasing/shared.js:117-125](C:/Pro/geiger-property/components/internal/screens/leasing/shared.js)
- Lease parties (tenant, co-signer, guarantor, occupant) carry `responsibility_pct` — [engine_foundations.sql:70-87](C:/Pro/geiger-property/supabase/migrations/20261015210600_engine_foundations.sql)

**Commercial fields: capture-only**
- The "Commercial terms" block appears only when the lease type is commercial. Every field is `meta: true` (stored in metadata) — [components/internal/screens/leasing/config.jsx:133-139](C:/Pro/geiger-property/components/internal/screens/leasing/config.jsx):
  - permittedUse
  - expenseStructure (Gross, Modified gross, Single net (N), Double net (NN), Triple net (NNN))
  - sqftLeased
  - camCharges per month
  - tiAllowance
  - personalGuarantee
- Grep for camCharges, sqftLeased, expenseStructure and tiAllowance outside the field definitions finds no reader. They do not drive billing or the CAM calculation.

**Property and unit types**
- Property types: Single-family, Multi-family, Apartment, Condo, Townhome, HOA, Commercial, Mixed-use, Student housing, Senior living, Manufactured housing. `COMMERCIAL_TYPES` is Commercial and Mixed-use — [components/internal/screens/properties/constants.js:19-43](C:/Pro/geiger-property/components/internal/screens/properties/constants.js)
- The property list has a "Commercial & mixed" filter tab — [properties/config.jsx:118-119](C:/Pro/geiger-property/components/internal/screens/properties/config.jsx)
- `units.sqft int` is a real column — [mig/20260715161206_units.sql:35](C:/Pro/geiger-property/supabase/migrations/20260715161206_units.sql)
- Property totalSqft and rentableSqft are metadata fields — [properties/sections/property_tabs.jsx:54-55](C:/Pro/geiger-property/components/internal/screens/properties/sections/property_tabs.jsx)
- No retail, office or industrial lease or unit taxonomy beyond "Commercial".

**Rent schedule and escalations** (in [lease_money.jsx](C:/Pro/geiger-property/components/internal/screens/leasing/sections/lease_money.jsx))
- Steps are stored in `metadata.rentSchedule`. Each has an effectiveDate and a mode of either "New monthly amount" or "Percent increase". The UI compounds them in date order with `projectSchedule` — lines 69-104.
- An "Apply N Due" button sets `leases.rent` to the latest due step and stamps `appliedOn` — lines 106-120, 131-139.
- File header: "Nothing here posts to the ledger — charges are schedules the accounting area bills" — lines 47-49.
- No scheduled job reads `rentSchedule`. Grep finds it only in `lib/leasing/merge.js:64, 142`, as a document merge field ("Rent schedule / escalations (list)") — [lib/leasing/merge.js:64, 142](C:/Pro/geiger-property/lib/leasing/merge.js)

**Rent billing source**
- Billed rent comes from `rent_accounts.rent`, a separate column — [mig/20260715161203_rent_collection.sql:27-41](C:/Pro/geiger-property/supabase/migrations/20260715161203_rent_collection.sql); [acct/rent_collection.jsx:88-100](C:/Pro/geiger-property/components/internal/screens/accounting/rent_collection.jsx); [lib/jobs/financial.js:188-225](C:/Pro/geiger-property/lib/jobs/financial.js)
- No leasing code writes to rent accounts. Grep finds only read uses in tenants/config.jsx:109 and property_overview.jsx:110.

**Recurring charges**
- Charge types are residential-flavoured: Pet rent, Parking, Storage, Utilities, Trash, Internet, Amenity fee, Furniture, Resident benefits package, Other — [leasing/shared.js:372-383](C:/Pro/geiger-property/components/internal/screens/leasing/shared.js)
- The UI offers frequencies Monthly, Quarterly, Semi-annually, Annually and Weekly — [leasing/shared.js:385](C:/Pro/geiger-property/components/internal/screens/leasing/shared.js)
- The posting job's frequency map only covers `{ Monthly: 1, Quarterly: 3, Annually: 12, "One-time": 0 }` and falls back to monthly (`?? 1`) for anything else — [lib/jobs/financial.js:24, 147](C:/Pro/geiger-property/lib/jobs/financial.js)

**CAM reconciliation (wired)**
- Table `property.cam_reconciliations` holds property_id, year, budget_amount, actual_amount, gl_account_id, status and metadata — [ledger_core.sql:219-238](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- Data layer: [lib/supabase/cam_reconciliations.js:6-19](C:/Pro/geiger-property/lib/supabase/cam_reconciliations.js)
- Nav entry under Accounting — [components/internal/sidebar/sidebar_nav.jsx:155](C:/Pro/geiger-property/components/internal/sidebar/sidebar_nav.jsx)
- How the screen works (all in [acct/cam_reconciliation.jsx](C:/Pro/geiger-property/components/internal/screens/accounting/cam_reconciliation.jsx)):
  1. **Pool:** tick which expense GL accounts form the pool. Actual CAM is their summed ledger expense for the property and year — lines 45-123.
  2. **Share:** each lease's share defaults to its **unit** square feet over the included leases' total, with a manual % override — lines 174-186.
  3. **Estimates:** default to CAM income already credited to that lease in the year — lines 143-149.
  4. **Posting:** "Post True-Ups" posts a charge (under-billed) or a credit (over-billed) per lease, using idempotency key `cam:<rec>:<lease>`. "Void True-Ups" reverses them — lines 215-270.
  5. **Filter:** a "Commercial leases only" toggle — lines 335-341.
- The system income account is 4040 CAM Recoveries — [ledger_core.sql:482](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- Exclusions exist only at the coarse level: untick a pool account (for everyone) or untick a lease. There are no per-tenant expense exclusions, caps, base year or expense stop, occupancy gross-up, admin fee, or multiple pools per lease (the reconciliation has one pool per property-year).

**Utility billing (RUBS)**
- `property.utility_allocations` uses `method` default 'sqft' — [ledger_core.sql:195-217](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- Splits by square footage, occupants or equal shares — [acct/utility_billing.jsx:43, 54-83](C:/Pro/geiger-property/components/internal/screens/accounting/utility_billing.jsx)

**Percentage rent and CPI: absent**
- Grep for percentRent, percentageRent, breakpoint (outside CSS), gross sales, salesVolume, sales report and POS import across lib, components and supabase finds nothing.
- Grep for `\bcpi\b` and indexation finds nothing. "Escalat…" matches only rent schedules, notices and automations.

### Inferences
- **Classification:** the leasing model is residential-first with a commercial veneer. Real commercial mechanics are limited to step and percent escalations (manual apply) and a basic pro-rata CAM true-up that does post to the ledger.
- **Two disconnects matter for any commercial claim:**
  1. Applying an escalation changes `leases.rent` but not `rent_accounts.rent`, which is what gets billed.
  2. The lease's `camCharges` and `sqftLeased` fields are ignored. CAM shares use unit square feet, and monthly CAM estimates are billed only if someone sets up a recurring charge by hand.
- **Likely bug (outside the claims):** the recurring-charge job treats "Semi-annually" and "Weekly" as monthly.

### Gaps
- I did not test the CAM or escalation flows in a running app. Verdicts rest on reading the code.
- The lease template library and its clause content were not audited for commercial templates.

## Q6. Claim-by-claim verdicts, and is "complete re-architecting" needed?

### Takeaway
The third-party text is right about the **gaps**:
- intercompany accounting
- multi-currency and global tax
- multi-tier AP approvals
- percentage rent
- CPI indexation
- CAM sophistication

It is wrong about the **baseline**: Geiger is not "fixed monthly rent" software. It has a double-entry trust GL, project-wide books with property and owner sub-ledgers, escalation schedules and a working (basic) CAM reconciliation.

"Complete re-architecting" is overstated. The dimensioned double-entry core, idempotent posting RPC, metadata bag, record_items, policy cascade and jobs framework make most missing features **additive**. Only multi-currency and true multi-entity or intercompany touch the ledger's core contract, and those are deep extensions, not a redesign.

### Cited Findings
**Verdicts** (each verdict is backed by the evidence in Q1–Q5)

| Claim | Verdict | Evidence |
|---|---|---|
| "Financial engine is built for a single corporate entity or standard cash/accrual books per property" | **PARTLY TRUE** | Single entity per project: TRUE. No legal-entity table; one chart and journal per project (Q2). "Books per property": FALSE, since property is a line dimension, not separate books. "Standard cash/accrual": it is a full double-entry, accrual-style AR/AP trust ledger with no basis toggle (Q1). |
| Lacks intercompany accounting (auto-balancing between parent, subsidiaries and LLCs) | **TRUE** | No entity dimension, no due-to/due-from, no per-entity balancing in `ledger_post`, no consolidation (Q2) |
| Lacks multi-currency and global tax (VAT/GST/regional); can't roll up to one functional currency | **TRUE** | USD hardcoded in at least nine formatters and Stripe; no currency columns on money tables; the currency setting is capture-only; no VAT/GST/sales tax; US 1099 only (Q3) |
| Lacks multi-tier AP approval routing by dollar thresholds and signing authority | **TRUE** (a single-threshold approval exists) | One `billApprovalLimit`, one approver, `accounting.post` gate (Q4) |
| "Residential software tracks fixed monthly rent" | **PARTLY TRUE** | Rent is a single monthly amount per rent account, and auto-rent posts monthly only. Step and percent escalation schedules exist, but apply manually and don't flow to billing (Q5) |
| Lacks CAM/recovery reconciliations (pro-rata sqft, exclusions) | **PARTLY TRUE** | A CAM reconciliation exists and is wired: pool accounts, sqft pro-rata share, estimates vs actual, true-ups posted to lease ledgers. It lacks per-tenant exclusions, caps, base year and gross-up (Q5) |
| Lacks percentage rent (POS sales import, breakpoints) | **TRUE** | Nothing in schema, data layer or UI (Q5) |
| Lacks CPI indexation / escalations | **PARTLY TRUE** | CPI indexation is absent (TRUE). Escalations exist as fixed-amount or fixed-% steps (so FALSE for "escalations") (Q5) |
| Summary table: Data scope = "single property/portfolio operations" | **PARTLY TRUE / misleading** | Scope is one project: a multi-property, multi-owner management-company book with owner trust sub-ledgers. Portfolios are display-only, with no portfolio rollup in reports. Not multi-entity (Q1, Q2) |
| Summary table: Lease complexity = "fixed monthly residential templates" | **PARTLY TRUE / overstated** | A commercial lease type, NNN/expense-structure field, escalation schedules, quarterly and annual charges and CAM true-ups exist. But commercial terms are capture-only, with no CPI and no percentage rent (Q5) |
| "Bridging the gap would require a complete re-architecting of its core data structure" | **FALSE / overstated** | See the additive-vs-structural breakdown below |

**Additive vs structural.** Today's model has one GL per project, every line tagged with eight dimensions (property, unit, lease, tenant, owner, vendor, bank_account, job), a balanced idempotent RPC, a metadata expansion bag, generic `record_items` child rows, a policy cascade and a jobs framework — [ledger_core.sql:87-126, 299-393](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql); [engine_foundations.sql:19-66](C:/Pro/geiger-property/supabase/migrations/20261015210600_engine_foundations.sql); [lib/jobs/financial.js:15-20](C:/Pro/geiger-property/lib/jobs/financial.js)

- **CPI indexation (additive):** needs a CPI index table (series, period, value), a `cpi` step mode on `rentSchedule` steps (with floor, cap and base index), and a job that applies due steps and syncs `rent_accounts.rent`. The step model already exists — [lease_money.jsx:77-104](C:/Pro/geiger-property/components/internal/screens/leasing/sections/lease_money.jsx)
- **Percentage rent (additive):** needs a `sales_reports` table (lease_id, period, gross sales, source or import batch), breakpoint terms per lease (metadata or `record_items` kind `pct_rent_tier`), and a posting via the existing `buildCharge` with a new income account. `ledger_post` needs no change.
- **CAM depth (additive):** needs `expense_pools` and a pool-to-GL mapping, plus per-lease recovery terms (pool, denominator, caps, base year, exclusions, gross-up, admin fee) in a `lease_recoveries` table or `record_items`. Monthly estimate billing should be driven from those terms through the existing recurring-charge job. The true-up posting already exists — [acct/cam_reconciliation.jsx:215-250](C:/Pro/geiger-property/components/internal/screens/accounting/cam_reconciliation.jsx)
- **Multi-tier AP approvals (additive):** needs an `approval_rules` table (amount bands, scope, approver role or user, sequence) and `approval_steps` rows per bill. `bills.approval_status` and the RBAC permissions already exist — [ledger_core.sql:241-243](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql); [lib/rbac.js:11-12](C:/Pro/geiger-property/lib/rbac.js)
- **Sales tax, VAT and GST (mostly additive):** needs `tax_codes` and `tax_rates` (by jurisdiction), a tax-payable system account, and charge, bill and payment builders that emit extra tax lines. Entries already support any number of lines — [lib/ledger/postings.js:261-281](C:/Pro/geiger-property/lib/ledger/postings.js)
- **Multi-entity and intercompany (deep extension of the core):**
  - **New structures:** a `legal_entities` table, with `entity_id` on gl_accounts (or entity-specific charts), ledger_entries, ledger_lines, properties, bank_accounts and budgets.
  - **Ledger changes:** `ledger_post` must balance per entity and auto-generate due-to/due-from lines; `ledger_subledger`'s dimension whitelist and the four balance views need an entity dimension; consolidation and elimination reporting is new.
  - **Security:** RLS would have to become real per-entity or per-project isolation (it is demo-open today).
  - **Why it is still an extension:** the columns are add-if-not-exists DDL, and existing rows can default to one entity per project — [ledger_core.sql:533-618](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- **Multi-currency (deepest change; cross-cutting, not a redesign):**
  - **New structures:** currency codes on entities, bank accounts and entries; transaction-currency and functional-currency amounts on every ledger line; an `exchange_rates` table; FX gain/loss system accounts; revaluation jobs.
  - **Rework:** `ledger_post` and the balance trigger (balance in functional currency), every posting builder, report and formatter, and the Stripe flows that hardcode "usd" — [ledger_core.sql:264-291](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql); [lib/payments/checkout.js:107](C:/Pro/geiger-property/lib/payments/checkout.js)

### Inferences
- **Effort ranking** (from the code, not measured): approvals, CPI, percentage rent and CAM depth are weeks-scale additive features on existing primitives. Intercompany or multi-entity, and multi-currency, are the only items that change the ledger contract. Even these keep the same tables and RPC pattern, so "complete re-architecting" is not accurate. "A significant ledger-engine extension" is.
- **Competitive framing:** Geiger is a small-to-mid residential property-management platform with genuine trust accounting and a starter commercial toolkit. It is not an enterprise multi-entity commercial ERP like MRI or Yardi Voyager. The gap is real but narrower than claimed.

### Gaps
- The effort estimates are my inference; no implementation plan or estimate exists in the repo.

## Q7. Which features are real end to end versus UI-only or stubbed, and what changed since the 2026-10-16 baseline audit?

### Takeaway
Most finance features are now real and wired. Gaps cluster in **capture-only settings** (company currency, owner approval threshold, consolidated-statement toggle, commercial lease terms) and in **automation not switched on** (no Vercel crons; the demo has everything paused).

The 2026-10-16 baseline is materially out of date on accounting. It said "There is no double-entry ledger"; that is now false.

### Cited Findings
**Maturity matrix**

| Feature | Schema | Data layer | UI | Wired |
|---|---|---|---|---|
| Double-entry GL, chart, journal, voids, trial balance | yes | yes | yes | yes |
| Rent, payment, bill and deposit posting | yes | yes | yes | yes |
| Scheduled financial jobs | yes | yes | yes | code wired; no crons configured |
| Bank reconciliation | yes | yes | yes | yes |
| Monthly budgets per GL account | yes | yes | yes | yes |
| Job costing | yes | yes | yes | yes |
| RUBS utility billing | yes | yes | yes | yes |
| CAM reconciliation | yes | yes | yes | yes (basic) |
| Bill approval (single threshold) | yes | yes | yes | yes |
| Rent escalation schedule | metadata | yes | yes | manual apply; not synced to the billed rent account |
| Commercial lease terms (NNN, sqft, CAM/mo, TI) | metadata | yes | yes | **capture-only** |
| Company currency | settings | yes | yes | **capture-only** |
| Owner approvalThreshold | metadata | yes | yes | **capture-only** |
| Portfolio consolidated statement | metadata | yes | yes | **capture-only** |
| Multi-entity, intercompany, multi-currency, VAT/GST, CPI, percentage rent, multi-tier approvals | no | no | no | no |

Sources for the matrix:
- GL, chart, journal, voids, trial balance: [ledger_core.sql](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql); [lib/supabase/ledger.js](C:/Pro/geiger-property/lib/supabase/ledger.js); [acct/general_ledger.jsx](C:/Pro/geiger-property/components/internal/screens/accounting/general_ledger.jsx); [lib/reports/defs_financial.js](C:/Pro/geiger-property/lib/reports/defs_financial.js)
- Posting: [lib/ledger/postings.js](C:/Pro/geiger-property/lib/ledger/postings.js)
- Scheduled jobs: [lib/jobs/financial.js](C:/Pro/geiger-property/lib/jobs/financial.js); [vercel.json](C:/Pro/geiger-property/vercel.json)
- Bank reconciliation, budgets, job costing: [acct/bank_reconciliation.jsx](C:/Pro/geiger-property/components/internal/screens/accounting/bank_reconciliation.jsx); [acct/budgets.jsx:26-28](C:/Pro/geiger-property/components/internal/screens/accounting/budgets.jsx); [acct/job_costing.jsx:24-26](C:/Pro/geiger-property/components/internal/screens/accounting/job_costing.jsx); [ledger_core.sql:130-193](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- RUBS, CAM, approvals: [acct/utility_billing.jsx](C:/Pro/geiger-property/components/internal/screens/accounting/utility_billing.jsx); [acct/cam_reconciliation.jsx](C:/Pro/geiger-property/components/internal/screens/accounting/cam_reconciliation.jsx); [acct/bills.jsx:73-88, 621-720](C:/Pro/geiger-property/components/internal/screens/accounting/bills.jsx)
- Escalations and commercial terms: [lease_money.jsx:69-150](C:/Pro/geiger-property/components/internal/screens/leasing/sections/lease_money.jsx); [leasing/config.jsx:133-139](C:/Pro/geiger-property/components/internal/screens/leasing/config.jsx)
- Capture-only settings: [settings/shared.js:36, 53-60](C:/Pro/geiger-property/components/internal/screens/settings/shared.js); [owners/shared.js:147](C:/Pro/geiger-property/components/internal/screens/owners/shared.js); [portfolios/sections.jsx:331](C:/Pro/geiger-property/components/internal/screens/portfolios/sections.jsx)
- The Accounting nav now has these entries: Bills & Payables, Chart of Accounts, Budgets, Bank Accounts, General Ledger, Bank Reconciliation, Utility Billing, CAM Reconciliation, Job Costing (plus Rent Collection, Transactions and Recurring Charges). Reports include Owner Statements, Financial Statements, General Ledger Detail and Deposit Detail — [components/internal/sidebar/sidebar_nav.jsx:141-191](C:/Pro/geiger-property/components/internal/sidebar/sidebar_nav.jsx)

**Changes since the 2026-10-16 baseline** ([geiger_current_state.md](C:/Pro/geiger-property/research_notes/Property%20management%20software%20features/geiger_current_state.md))

| Area | Baseline said | Now | Where |
|---|---|---|---|
| Ledger | "There is no double-entry ledger" (:376) | A double-entry GL exists | ledger_core migration |
| Chart of Accounts | "a one-click 16-account starter chart; a Ledger tab matched by text label; no balances" (:384) | 29-account system chart via RPC, hierarchy, trust flags, balance views | [ledger_core.sql:453-571](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql) |
| Budgets | "annual amounts only" (:385) | Monthly `budget_lines` per GL account | [ledger_core.sql:150-169](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql) |
| Leases | "no rent schedule or escalations" and "no ledger" (:296, :300) | Escalation schedule plus lease sub-ledger via the `lease_id` dimension | — |
| Account links | "Account links in Transactions, Bills and Recurring charges are text labels, not ids" (:110) | GL account ids are used | [engine_foundations.sql:168-170](C:/Pro/geiger-property/supabase/migrations/20261015210600_engine_foundations.sql) |
| Bills | A Payments tab that only creates an Expense transaction (:383) | AP posting, approvals and bill payments on the ledger | — |
| Company currency | "Never read elsewhere" (:426) | **Unchanged** | — |

**Git history of the finance code**
- The ledger and CAM files first appear in commit `6c8b76c` (2026-10-16), "added various property-related tables and triggers for online payments, portal access, report scheduling…".
- They were touched again in `489344b` (2026-10-17) and `9be8f05` (2026-10-20, which removed the Vercel crons).
- Command used: `git log -- supabase/migrations/20261015212744_ledger_core.sql components/internal/screens/accounting/cam_reconciliation.jsx`

### Inferences
- Anyone repeating the third-party claims from the baseline audit's era (before 2026-10-16) would have been right that there was no ledger. That is no longer true. The claims about enterprise-only capabilities (intercompany, FX, global tax, tiered approvals, percentage rent, CPI) still hold.

### Gaps
- I did not verify whether production customers run the financial jobs on an external scheduler.
- I did not verify whether the live database matches the migration files: the migration CLI was unavailable, and memory mentions ~80 orphan tables from a deleted branch in the live database.
