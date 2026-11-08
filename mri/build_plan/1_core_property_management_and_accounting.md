# 1. Core property management and accounting


---

## Part A — Broken basics, billing and receivables

### Scope
- MRI products covered: PMX Residential Management (billing options, lease amendments, event-based billing, move-out/SODA, late fees, write-offs, payment plans, resident statements, RM Lockbox, role dashboards, scheduled events) and PMX Financials (AR, deposits, AP invoices from RM, month-end processing).
- Geiger areas touched: `lib/ledger/*`, `lib/jobs/*`, `app/api/cron/*`, new `lib/billing/*` + `app/api/billing/*`, `lib/payments/*`, `lib/portal/{owner,ledger,resident}.js`, `lib/reports/*`, `lib/automations/runner.js`, `lib/messaging/{context,reminder_jobs}.js`, screens `leasing/*`, `accounting/*`, `overview/*`, `tenants/*`, `maintenance/sections/wo_actions.jsx`, `amenities/*`, resident portal.

### Summary
| ID | Feature | MRI product | Geiger today | Priority | Effort |
|---|---|---|---|---|---|
| CORE-01 | Billed rent follows the lease (one source of truth) | PMX RM (lease amendments, event billing) | **Done** (2026-11-08) | P1 | L |
| CORE-02 | Billing stops at move-out, final-month proration, holdover | PMX RM (move-out processing) | **Done** (2026-11-08) | P1 | M |
| CORE-03 | Recurring charges: frequency, GL account, end date, proration | PMX RM (billing options, charge codes) | **Done** (2026-11-08) | P1 | M |
| CORE-04 | Security deposits on the ledger, interest, refunds through AP | PMX RM + Financials (SODA, AP refunds) | **Done** (2026-11-08) | P1 | L |
| CORE-05 | Concessions reduce billed rent; listing specials reach the lease | PMX RM (concession codes, period concessions) | **Done** (2026-11-08) | P1 | M |
| CORE-06 | Daily late fees on a shared receivables helper | PMX RM (late fee formulas) | **Done** (2026-11-08) | P1 | S |
| CORE-07 | Dashboards, balances and rent-overdue automation read the ledger | PMX RM (PM dashboard, role pages) | Done | P1 | M |
| CORE-08 | Owner statements correct for co-owners | Not evidenced in PMX (Geiger edge) | **Done** (2026-11-08) | P1 | M |
| CORE-09 | Work-order vendor bills through approval and AP | PMX Financials (AP invoices from RM, approvals) | **Done** (2026-11-08) | P1 | S |
| CORE-10 | Scheduled jobs run in production (cron plan, locks, alerts, runbook) | PMX month-end processing, scheduled events | Done | P1 | M |
| CORE-11 | Receipts for office (manual) payments | Engage Pay receipts (online only) | Done | P1 | M |
| CORE-12 | Resident statements: report, bulk email, portal | PMX RM Resident Statement; Engage Connect | Done | P1 | M |
| CORE-13 | Move-out final accounting (SODA) and final statement | PMX RM Statement of Deposit | Done | P1 | M |
| CORE-14 | Payment plans (deferred payment agreements) | PMX RM deferred payment agreements | Partial (e-sign, renewal carry, state rules later) | P1 | L |
| CORE-15 | Write-offs and bad-debt recovery | PMX RM write-offs | Done | P2 | S |
| CORE-16 | Deposit batching and undeposited funds | Engage Pay batch reconciliation | Partial (Stripe payouts pending keys/decision) | P2 | M |
| CORE-17 | NSF fee and flags on returned manual payments | PMX RM NSF reversal | Done | P2 | S |
| CORE-18 | Amenity reservation fees and deposits on the ledger | PMX RM amenity fees (X.5.9) | Done | P2 | S |
| CORE-19 | Second late fee and late-fee count | PMX RM late fee 1/2 + count | Done | P3 | S |
| CORE-20 | Calculated deposits to meet legal caps | PMX RM calculated deposits | Missing | P3 | S |
| CORE-21 | Lockbox payment import | PMX RM Lockbox | Missing | P3 | M |

### Build order
1. **CORE-01 → CORE-02 → CORE-03 → CORE-04 first.** Every other item reads what billing posts (late fees, statements, dashboards, autopay amounts, owner statements, SODA). CORE-01 also lands the shared groundwork: `lib/billing/*`, the `billing_ledger_chart` migration (new system accounts and source types for the whole part), business-date handling and the server-side posting pattern.
2. **CORE-05, CORE-06** extend the `billing` job; **CORE-07** reuses CORE-06's `loadLeaseReceivables`.
3. **CORE-08, CORE-09** are independent; build in parallel with step 2.
4. **CORE-10** once the job set from steps 1–2 is final; it is the launch gate for every scheduled posting.
5. **CORE-11 → CORE-16 → CORE-17** (money in, batching, returns: each needs the previous one's cash routing).
6. **CORE-12 → CORE-13** (the final statement reuses the statement builder), then **CORE-14**.
7. P2/P3: **CORE-15, CORE-18**, then **CORE-19, CORE-20, CORE-21**.

Cross-file dependencies: **PLAT-01** (session auth, role checks and RLS lockdown; all new posting paths here are server routes so they survive revoking anon access to `ledger_post`); **LEAS** lease amendments (gap 2.13) create rent steps via CORE-01; LEAS unit transfers (2.11) reuse CORE-01's `buildArTransfer`; LEAS application/holding fees (2.10) reuse CORE-04's deposit charge; LEAS lease PDF (2.6) supplies the PDF renderer for CORE-12/13/14; LEAS e-sign adapter signs CORE-14 agreements. **CORE-40+**: period close (6.1) must stop CORE-01/02 true-ups in closed periods; approvals (6.2) extend CORE-09; owner payouts (11.3) use CORE-08 shares and `bills.payee_type` from CORE-04; bank feeds (11.2) match CORE-16 deposits. **HOUS** voucher split billing splits `rentForPeriod` by payer; rent-increase caps validate `addRentStep`. **COMM** chargebacks (5.4) post through CORE-03's charge route. **INTL** QuickBooks/Xero sync must map the new accounts and source types.

Conventions every item below follows:
- **Server-side posting.** New posting paths are routes under `app/api/billing/*` or `app/api/accounting/*`: `requireStaff(request, projectId)` (`lib/messaging/auth.js`), service-role client, `postBuilt` (`lib/ledger/store.js:56-60`), permission check against `lib/rbac.js` (advisory until PLAT-01).
- **Owner dimension.** Per CORE-08, no new posting sets `owner_id` except owner-specific entries (distributions, contributions).
- **Dimensions.** Resident-side lines carry `lease_id`, `tenant_id`, `unit_id`, `property_id`.
- **Ledger acceptance (applies to every ledger item, on top of its own checks).** The Trial Balance report (`lib/reports/defs_financial.js:41`) shows total debits = total credits. `select * from property.ledger_unbalanced_entries` returns no rows. Re-running the action or job for the same business date creates no new `ledger_entries` rows.
- **Idempotency key registry** (all keys are unique per project via `ledger_entries_idem_uidx`, `supabase/migrations/20261015212744_ledger_core.sql:78-80`):

| Key | Item | Entry |
|---|---|---|
| `rent:<leaseId>:<YYYY-MM>` | CORE-01 | Dr 1200 AR / Cr 4000 Rental Income |
| `rent-adj:<leaseId>:<YYYY-MM>:<n>` | CORE-01/02 | true-up, either direction |
| `xfer:<newLeaseId>:<itemEntryId>[:<n>]` / `xfer:<newLeaseId>:credit:<sourceEntryId>[:<n>]` (per source since 2026-11-08) | CORE-01 | AR (old lease) → AR (new lease) |
| `rc:<chargeId>:<YYYY-MM-DD>` (existing) / `rc-adj:<chargeId>:<date>:<n>` | CORE-03/02 | Dr 1200 / Cr charge GL |
| `deposit:<depositId>:charge`, `:received`, `:sweep:<paymentEntryId>`, `:ded:<deductionId>`, `:apply`, `:release` (+ `:v<n>` on SODA revisions) | CORE-04/13 | deposit lifecycle |
| `depint:<depositId>:<YYYY-MM>`, `depint-pay:<depositId>:<YYYY>` | CORE-04 | interest accrual / payout |
| `bill:<billId>` (existing), `billpay:<paymentId>` (existing) | CORE-04/09 | AP |
| `conc:<concessionId>:<YYYY-MM>`, `conc:<concessionId>:once`, `conc-adj:<concessionId>:<YYYY-MM>:<n>` | CORE-05 | Dr 4050 / Cr 1200 |
| `late:<leaseId>:<YYYY-MM>` (existing), `late:<leaseId>:<YYYY-MM>:<YYYY-MM-DD>` | CORE-06 | Dr 1200 / Cr 4010 |
| `pay:<requestId>` | CORE-11 | manual payment |
| `soda:<depositId>:accel:<YYYY-MM>:v<n>` (v1 included), `apply:<creditEntryId>:<itemEntryId>` (`:<n>` from the second application of the same pair, after a void), `early-term:<leaseId>` (existing, Terminate wizard; reused by the final account) | CORE-13 | accelerated rent, credit application, early-termination fee |
| `plan:<planId>:defer`, `plan:<planId>:inst:<seq>`, `plan:<planId>:accelerate` | CORE-14 | deferred receivable |
| `wo:<writeOffId>` (a UUID per write-off action; the final account's "Write it off" derives it from `final-account:<leaseId>:v<n>`), `wo-recover:<paymentEntryId>` (`:<n>` only once a voided recovery holds the plain key); the recovered payment is applied with CORE-13's `apply:<paymentEntryId>:<itemEntryId>[:n]` | CORE-15 | write-off Dr 5800 Bad Debt / Cr 1200 applied to each item; recovery Dr 1200 applied to each written-off item it reinstates / Cr 5800, both source `write_off` (5800 lines tagged `metadata.writeOff` / `metadata.recovery`) (updated 2026-11-08) |
| `bankdep:<bankDepositId>` | CORE-16 | undeposited funds → bank |
| `nsf:<paymentEntryId>`, `nsf-bank:<paymentEntryId>` | CORE-17 | returned manual payment |
| `amenity:<reservationId>:fee`, `:deposit`, `:release`, `:forfeit` | CORE-18 | amenity charges |
| `late2:<leaseId>:<YYYY-MM>` | CORE-19 | second late fee |
| `hap:<leaseId>:<YYYY-MM>`, `hap-adj:<leaseId>:<YYYY-MM>:<n>` | HOUS-01 | Dr 1220 Housing Assistance Receivable / Cr 4000 (HAP share of rent; added 2026-11-08) |
| `lockbox:<fileHash>:<row>` | CORE-21 | lockbox payment |
| `conv:<batchId>:<lineId>` | INTL-04 | one opening balance per conversion line, against 3950 Opening Balance Equity: tenant balance Dr 1200 / Cr 3950, tenant credit Dr trust cash / Cr 2200, deposit Dr deposit cash / Cr 2100 [+2110], owner balance Dr trust cash / Cr 3950, bill Dr 3950 / Cr 2000, GL balance account ↔ 3950, outstanding item Dr/Cr the bank's cash (nets to 0) (added 2026-11-08) |
| `jeimp:<importId>:<entry_ref>` | CORE-46 | one imported journal entry per entry_ref group, its lines as in the file (entry `metadata.importId`, `sourceFile`, `entryRef`, `importFingerprint`; a re-import skips entries whose fingerprint is already posted). Opening-balance files post through INTL-04's `conv:` keys, not this one (added 2026-11-08) |
| `jerev:<entryId>:<date>[:<n>]` | CORE-46 | dated reversal of a manual or imported journal entry: every line mirrored, `metadata.reverses`; the date moves to the first open day past a closed period; `:<n>` only once a voided reversal holds the plain key (added 2026-11-08) |

### Items

#### CORE-01 · Billed rent follows the lease (one source of truth)
- **MRI equivalent:** PMX Residential Management — lease amendments update rent and concessions; "live billing" adds charges to the resident ledger as events happen (X.5.8); rent posted by RM processing.
- **Status · priority · effort:** Broken · P1 · L
- **Refs:** Gap 0.1 · Inventory 3.1, 3.2, 3.3, 3.4, 3.17, 2b.9, 2b.10, 2b.61 · PMX-2.73, PMX-3.07

**Geiger today**
- Billing reads `rent_accounts.rent`: the job (`lib/jobs/financial.js:189-225`, opt-in `metadata.autoPostRent` at `:192`, key `rent:<rentAccountId>:<YYYY-MM>` at `:200`) and the manual "Post this month's rent" (`components/internal/screens/accounting/rent_collection.jsx:88-100, 417-435`).
- Rent accounts exist only when created by hand (`rent_collection.jsx:293-412`). Nothing creates one:
  - lease activation (`components/internal/screens/leasing/lease_actions.jsx:157-189`)
  - application conversion (`components/internal/screens/marketing/flows.js:183-260`)
  - renewal (`lib/leasing/workflows.js:183-240`)
- Rent changes write only `leases.rent`:
  - "Apply N due" (`components/internal/screens/leasing/sections/lease_money.jsx:111-121`)
  - month-to-month premium (`lease_actions.jsx:612-619`)
  - renewal: a new lease with the new rent. The rent account, the AR and the autopay plan stay on the old lease.
- Two due-day sources: rent posting uses `rent_accounts.due_day` (`financial.js:194`); late fees and reminders use the policy `rentDueDay` (`financial.js:290`, `lib/messaging/reminder_jobs.js:249`).
- `rent_accounts.frequency` (Weekly/Biweekly/Quarterly) is never read (`rent_collection.jsx:59-64, 484-487`).
- Move-in posts the first month under `movein:<leaseId>:rent` (`lease_money.jsx:438`), while auto-rent uses a different key, so the move-in month can bill twice.
- All postings run in the browser through `post()` in `lib/supabase/ledger.js:321-343` (anon client).

**What's missing**
- One source of truth for what is billed each month, including dated rent changes and mid-period changes.
- Automatic rent billing for every live lease; no hand-made rent account.
- A renewal that carries the open balance, rent account and autopay plan to the new lease.
- Protection against back-billing at go-live, and dedupe against legacy keys.

**Decision: the lease's rent schedule is the only source of billed rent.**
- New table `property.lease_rent_steps` holds dated monthly amounts.
- `leases.rent` becomes a read-only cache of the step in force on the business date. Only `property.lease_sync_current_rent` writes it.
- `rent_accounts` stops carrying rent, due day and frequency. It becomes the 1:1 collection record per lease (autopay flag, method, collections status, notes) and is auto-created.
- Due day comes only from the policy `rentDueDay` (lease override allowed). Rent is monthly only.

**How to build**
- *Data model:*
  - Migration `billing_rent_schedule` (`npm run db:new -- billing_rent_schedule --template table`) creates `property.lease_rent_steps`:
    - standard columns
    - `project_id uuid references public.projects(id) on delete cascade`
    - `lease_id uuid not null`, `effective_date date not null`, `amount numeric(14,2) not null`
    - `change_mode text check (change_mode in ('amount','percent'))`, `change_value numeric`
    - `source text not null check (source in ('initial','schedule','mtm_premium','renewal','amendment','manual'))`
    - `note text`, `status text not null default 'active' check (status in ('active','cancelled'))`
    - unique index `(lease_id, effective_date) where deleted_at is null and status = 'active'`
    - demo-open RLS per convention; PLAT-01 tightens it.
  - Function `property.lease_sync_current_rent(p_lease_id uuid, p_as_of date) returns numeric` sets `leases.rent` to the latest active step on or before `p_as_of`, else the earliest step (`security invoker`).
  - `rent_accounts`: unique partial index `(lease_id) where deleted_at is null and lease_id is not null`. Columns `rent`, `due_day` and `frequency` are deprecated; drop them in a later migration, per `conventions/MIGRATION_CONVENTIONS.md` "Never put in a migration".
  - Idempotent backfill:
    - an `initial` step per lease at `coalesce(term_start, created_at::date)` with `leases.rent`
    - `schedule` steps from `metadata.rentSchedule`
    - an `mtm_premium` step from `metadata.mtmSince` / `mtmPremium`.
  - Migration `billing_ledger_chart`, shared by the whole part. It redefines `property.ledger_ensure_default_chart` (header comment: ownership moves from `20261015212744_ledger_core`, following the `ledger_post_line_dimensions` precedent).
    - New system accounts:

      | system_key | Number | Type | subtype | is_trust |
      |---|---|---|---|---|
      | `undeposited_funds` | 1050 | Asset | `cash` | true |
      | `deferred_receivable` | 1210 | Asset | `deferred_receivable` | — |
      | `other_deposits` | 2120 | Liability | `deposits` | true |

    - Recreates `ledger_entries_source_chk` adding `'concession','write_off','bank_deposit','payment_plan'`.
    - Mirror the change in `SOURCE_TYPES`/`SOURCE_LABELS` (`lib/ledger/postings.js:6-36`), `REQUIRED_KEYS` (`lib/ledger/store.js:9-22`) and the seed validator `CHECKS` (`supabase/seeds/demo_project/generate/schema.mjs`).
    - Coordinate with CORE-40+ so this function is redefined once per release.
  - Settings key `billing_settings`: `{ autoBillRent: true, billingStartsOn, rentPostLeadDays: 0, jobsPaused: false }`. `billingStartsOn` stops back-billing at go-live and on imported leases.
- *Server logic:* new `lib/billing/`. Pure modules can be imported by the client; the rest are server-only.
  - `periods.js` (pure): `businessDate(now, timeZone)`, `periodOf(date)`, `periodBounds('YYYY-MM')`, `dueDateFor(period, dueDay)`, `prorate(amount, from, to, period, method)`. Proration follows `prorationMethod` (`lib/policies.js:47-59`).
  - `rent.js` (pure): `billingWindow(lease, policies)` returns `{ start, end }` (CORE-02 fills `end`); `rentForPeriod(steps, period, window, policies)` returns `{ segments:[{from,to,amount}], total }` and splits mid-period steps by days.
  - `post.js` (server):
    - `postOnce(admin, projectId, key, build)`, moved from `lib/jobs/financial.js:108-124`.
    - `billedForPeriod(admin, lease, period)`: sums non-void `rent:` and `rent-adj:` entries, plus legacy `rent:<rentAccountId>:<period>` and `movein:<leaseId>:rent`.
    - `billLeaseRent(admin, ctx, lease, period)`: when nothing is billed, posts the computed total. When billed ≠ computed in an open period, posts a true-up whose `<n>` = existing adj count + 1; a concurrent duplicate hits the unique key and is skipped.
  - `service.js` (server):
    - `ensureRentAccount(admin, lease)`
    - `onLeaseActivated(admin, lease, opts)`: ensures steps exist, upserts the rent account, bills the first (prorated) period, and bills the deposit (CORE-04).
    - `addRentStep(admin, lease, step)`: inserts, re-projects later percent steps, syncs current rent, then trues up open billed periods.
    - `onRenewalAccepted(admin, renewal)`: server version of `acceptRenewal`. It transfers open AR items, moves `rent_accounts.lease_id` and `autopay_plans.lease_id`, and writes the new lease's `renewal` initial step from `proposedRent`.
  - `lib/ledger/postings.js`:
    - add `buildArTransfer({ fromLeaseId, toLeaseId, items, credit })`
    - add `buildRentAdjustment` (negative case: Dr income / Cr AR applied to the period's rent entry; built on `buildCredit` with `glAccountId` = rent income, `:244-259`).
- *Journal lines* (dims `lease/tenant/unit/property`, `owner_id` null):

  | Event | Debit | Credit | Key | source_type |
  |---|---|---|---|---|
  | Monthly rent (prorated in first/last period) | 1200 AR | 4000 Rental Income | `rent:<leaseId>:<YYYY-MM>` | charge |
  | True-up, computed > billed | 1200 AR | 4000 | `rent-adj:<leaseId>:<YYYY-MM>:<n>` | charge |
  | True-up, computed < billed | 4000 | 1200 AR (`applies_to` the period's rent entry) | `rent-adj:<leaseId>:<YYYY-MM>:<n>` | credit |
  | Renewal, each open item | 1200 AR (new lease; line metadata `transferredFrom`, `originalDate`) | 1200 AR (old lease; `applies_to` the item) | `xfer:<newLeaseId>:<itemEntryId>` | adjustment |
  | Renewal, unapplied credit | 1200 AR (old lease) | 1200 AR (new lease) | `xfer:<newLeaseId>:credit` | adjustment |

  Aging uses `metadata.originalDate` when present (`lib/reports/ledger_math.js:280` `receivableAging`, `openItems` in `postings.js:526-558`).
- *API routes / jobs:*
  - New job `billing` in `lib/jobs/billing.js`, registered in `lib/jobs/registry.js`. For each project:
    1. Compute the business date in `company_profile.timezone`.
    2. Skip if `jobsPaused` or `!autoBillRent`.
    3. For each lease billable in its window: sync current rent, then bill every period from `max(billingStartsOn, window.start, today − 3 months)` to the current period whose due date (minus `rentPostLeadDays`) ≤ today.
    4. Then run recurring charges (CORE-03), concessions (CORE-05) and plan installments (CORE-14).

    Delete the rent half of `recurring-charges` (`financial.js:189-225`); CORE-03 retires the rest.
  - Routes:
    - `POST /api/billing/leases/[leaseId]/activate`
    - `POST /api/billing/leases/[leaseId]/rent-steps` (create or cancel)
    - `POST /api/billing/leases/[leaseId]/bill` ("Bill now", current period)
    - `POST /api/billing/renewals/[renewalId]/accept`

    Bodies carry `{ projectId, … }`; responses `{ ok, entries:[…] }`.
- *UI:*
  - Lease › Rent & Escalations (`lease_money.jsx:106-164`):
    - "Monthly rent" becomes read-only "Current rent".
    - Steps are a `ChildRecords` list over a new `lib/supabase/lease_rent_steps.js` (`makeEntityData`) whose create/cancel call the API.
    - Remove "Apply N due".
    - On Draft/Pending leases, editing rent edits the `initial` step.
  - Activation wizard: finish calls the activate API; the Follow-ups step previews "First charge $X (prorated from …)".
  - Month-to-month wizard creates an `mtm_premium` step.
  - Renewals screen and lease "Accept" call the accept API.
  - `convertApplicationToLease` (`flows.js:206-224`) creates the `initial` step.
  - Rent Collection:
    - the rent column shows the lease's current rent (join)
    - the schedule tab is read-only with a link to the lease
    - remove the rent/frequency/due-day edits, the `autoPostRent` switch and rent from the create dialog
    - "Post this month's rent" becomes "Bill now".
  - Move-in tab (`lease_money.jsx:430-463`): the first-month line comes from `rentForPeriod`; `postMoveIn` no longer posts rent and keeps `movein:<leaseId>:<itemId>` fees.
- *Permissions:* add `billing.manage` ("Change rent schedules and billing settings", inherits `view.accounting`) to `lib/rbac.js`; "Bill now" uses `accounting.post`.
- *Integrations:* none.

**Steps**
1. Write `billing_ledger_chart` and `billing_rent_schedule` (with backfill); `db:status` → `db:push` → `db:status`.
2. Add `lib/billing/periods.js` and `rent.js`, with unit tests for proration, mid-month steps and percent chains.
3. Add `post.js`, `service.js` and the postings builders.
4. Add the `billing` job; remove the rent half of `recurring-charges`.
5. Add the API routes.
6. Rewire the activation, month-to-month, renewal, conversion and Rent Collection UI.
7. Regenerate the demo seed (`supabase/seeds/demo_project/generate/areas/accounting.mjs`): steps per lease, keys `rent:<leaseId>:…`, `billing_settings.jobsPaused: true`.
8. Run the acceptance checks against a scratch project.

**Research before building**
- Confirm `select to_regclass('property.lease_rent_steps')` is null in the live DB (orphan tables).
- How do AppFolio and Buildium handle ledger continuity on renewal (same ledger vs new)? Check their help centres ("lease renewal", "rent increase"). This confirms the item-by-item transfer is acceptable.
- Rent posting timing used by peers (post on the 1st vs N days early) to set the default for `rentPostLeadDays`.

**Acceptance criteria**
- Lease starting 2026-11-15 at 2,000, actual-days proration, due day 1. Activation posts `rent:<id>:2026-11` = 1,066.67 (16/30): Dr 1200 / Cr 4000. A second job run posts nothing.
- A +3% step effective 2027-01-01: December bills 2,000, January bills 2,060. `leases.rent` reads 2,060 from the 2027-01-01 business date.
- A step back-dated into an already-billed open period posts exactly one `rent-adj` for the difference; re-running posts nothing.
- Month-to-month with a 100 premium from Dec 1: December bills rent + 100.
- Renewal with 500 open in two items on the old lease:
  - old lease AR = 0; new lease AR = 500 in two items aged by their original dates
  - `autopay_plans.lease_id` and `rent_accounts.lease_id` point to the new lease
  - December rent posts on the new lease only.
- Leases already carrying `rent:<rentAccountId>:<period>` or `movein:<leaseId>:rent` are not billed again for that period.
- Nothing is billed before `billingStartsOn`.
- Rent roll `leaseRent` (`lib/reports/defs_operations.js:64`) equals the current period's billed rent for full-month leases.
- Trial balance balances; `ledger_unbalanced_entries` is empty.

**Depends on / unblocks**
- Depends on: PLAT-01 (route auth pattern).
- Unblocks: CORE-02–07, CORE-12–14; LEAS lease amendments (2.13), bulk renewals (2.12) and unit transfers (2.11); HOUS voucher split billing and rent-increase caps.

**Open decisions**
- Post rent on the due date (default) or N days earlier, e.g. the 25th? (`rentPostLeadDays`)

#### CORE-02 · Billing stops at move-out (final-month proration, holdover)
- **MRI equivalent:** PMX Residential Management — move-out processing ("schedule and complete move-outs"), feeding deposit disposition.
- **Status · priority · effort:** Missing · P1 · M
- **Refs:** Gap 0.2 · Inventory 3.12, 3.18, 3.3 · PMX-2.90

**Geiger today** — Six paths end a lease, and each writes only the lease status and dates:
- End lease (`lease_actions.jsx:644-655`)
- Terminate (`:413`)
- Close eviction → Ended (`:533`)
- Move complete (`components/internal/screens/leasing/moves.jsx:402-409`)
- Tenant "Move to past" (`components/internal/screens/tenants/actions.js:201-250`)
- Renewal → Renewed (`lib/leasing/workflows.js:236`)

Neither job checks the lease: recurring charges select by `status`/`next_date` only (`financial.js:133-135`), and rent bills every opted-in account (`:190`). There is no last-month proration (inventory 3.18).

**What's missing**
- Billing derived from the lease's dates, so every ending path stops it.
- Final-month proration with a credit when the month was already billed.
- Holdover handling when a fixed term passes without renewal.

**How to build**
- *Data model:* no new tables. Policy `prorateLastMonth` (switch, default true, scopes ALL) in `lib/policies.js` (rent group). Lease `metadata.endedOn`, written by the end paths for leases ended without a move-out date.
- *Server logic:*
  - `billingWindow` in `lib/billing/rent.js`:
    - Draft/Pending: not billable.
    - `end` is the first of: `move_out_date`; for status Renewed, `term_end`; for Ended/Terminated without a move-out date, `metadata.endedOn` (else the status-change date).
    - Eviction keeps billing.
  - Rent for the final period is prorated through `end` (inclusive) when `prorateLastMonth` is on. Recurring charges stop at `min(ends_on, window.end)` and prorate when `prorate` is on (CORE-03).
  - Because billing recomputes each open period, moving the date out bills more; moving it in credits.
  - Holdover: a fixed lease past `term_end`, still live, with no accepted renewal:
    - with `autoMonthToMonth` on, the job sets `term_type = 'mtm'`, status `Month-to-month`, and adds an `mtm_premium` step at `term_end + 1` when `mtmPremium > 0`, then logs activity;
    - otherwise it keeps billing current rent and flags "Holdover" for CORE-07's needs-attention panel.
  - `closeOutLease(admin, lease, throughDate)` in `service.js` runs the true-ups for that lease immediately.
- *Journal lines:*

  | Event | Debit | Credit | Key | source_type |
  |---|---|---|---|---|
  | Final-month credit (already billed in full) | 4000 Rental Income | 1200 AR (`applies_to` the period's rent) | `rent-adj:<leaseId>:<YYYY-MM>:<n>` | credit |
  | Final-month charge (move-out moved later) | 1200 AR | 4000 | `rent-adj:<leaseId>:<YYYY-MM>:<n>` | charge |
  | Recurring-charge final credit | charge GL | 1200 AR (`applies_to` the occurrence) | `rc-adj:<chargeId>:<occurrenceDate>:<n>` | credit |

- *API routes / jobs:*
  - `GET /api/billing/leases/[leaseId]/preview?through=YYYY-MM-DD` returns the final rent, charges and credits without posting.
  - `POST /api/billing/leases/[leaseId]/close-out`.
  - The `billing` job applies windows on every run.
- *UI:*
  - The End lease, Terminate, Move-out, Move complete and "Move to past" wizards show the preview ("Final rent $X through <date>; credit $Y will post") and call close-out on finish. Without close-out, the next job run posts the same thing.
  - `recurring_charges.status` becomes `Ended` when their end passes.
- *Permissions:* `accounting.post` for close-out.

**Steps**
1. Add `billingWindow` and the final-period proration, with tests for every status.
2. Add the `prorateLastMonth` policy.
3. Add the preview and close-out routes.
4. Wire the six wizards.
5. Add the holdover step to the `billing` job.

**Research before building**
- Do any target states require daily proration of the last month, or forbid charging rent after surrender? Check the state statutes linked from Legal Resources (`property.legal_resources`).
- Peer default for proration of the move-out month (Buildium, AppFolio help).

**Acceptance criteria**
- Rent 1,500 billed in full on Dec 1; move-out Dec 10 (31-day month, actual days): exactly one credit of 1,016.13 (= 1,500 − 1,500×10/31), Dr 4000 / Cr 1200, applied to December's rent. No January rent.
- A 100/month parking charge with `prorate` on: credit 67.74 in the same run.
- Move-out on the last day of the month posts no credit.
- Changing the move-out from Dec 10 to Dec 20 posts a charge of 483.87 (rent-adj n = 2).
- Renewal: the old lease bills through `term_end`; the new lease from `term_start`; no period billed twice.
- A Draft or Pending lease never bills.
- Holdover with `autoMonthToMonth` on converts once and logs activity; a re-run changes nothing.
- Trial balance balances.

**Depends on / unblocks**
- Depends on: CORE-01, CORE-03.
- Unblocks: CORE-13; LEAS unit transfers (2.11).

#### CORE-03 · Recurring charges: frequency, GL account, end date, proration
- **MRI equivalent:** PMX Residential Management — billing options and charge codes ("set up property billing options", automatic billing fees).
- **Status · priority · effort:** Broken · P1 · M
- **Refs:** Gap 0.3 · Inventory 3.5–3.11, 3.15 · PMX-3.04

**Geiger today**
- Frequency:
  - The lease tab offers Monthly, Quarterly, Semi-annually, Annually and Weekly (`components/internal/screens/leasing/shared.js:385`).
  - The job maps only Monthly/Quarterly/Annually/One-time and bills anything else monthly (`financial.js:24, 144`: `FREQUENCY_MONTHS[r.frequency] ?? 1`).
  - The accounting screen uses its own list (`components/internal/screens/accounting/recurring_charges.jsx`).
- GL account:
  - The lease tab's GL picker stores a text label in `account` (`lease_money.jsx:175`; `glAccountOptions` uses the label as the value, `lib/supabase/options.js:86-93`), so `gl_account_id` stays null.
  - `buildCharge` then falls back to **4000 Rental Income** (`lib/ledger/postings.js:208`), so parking and pet fees are booked as rent.
- `endsOn`, `prorate`, `showInPortal`, `memo` and `chargeType` go into metadata (`components/internal/screens/leasing/adapters.js:7-16`) and nothing reads them.
- Charges with `metadata.autoPost === false` are skipped (`financial.js:139`); the demo seed sets that on every charge.
- **Contradiction found:** `recurring_charges.property_id` (and `description`, `category`) exist in the live DB. The seed writes them (`supabase/seeds/demo_project/04_accounting.sql:80`) and the job reads `r.property_id` (`financial.js:161`), but no file in `supabase/migrations/` creates them (only `20261010165221_full_build_tables.sql:562-590` and `20261015210600_engine_foundations.sql:172-173`). A database built from migrations would reject creates from `lib/supabase/recurring_charges.js:16`.

**What's missing** — One frequency list honoured by the job; real GL ids; end dates; proration; alignment with the rent due date; a schema that matches the live DB.

**How to build**
- *Data model:* migration `recurring_charges_billing_columns`.
  - `add column if not exists`:
    - `property_id uuid`
    - `ends_on date`
    - `prorate boolean not null default false`
    - `bill_with_rent boolean not null default true`
    - `show_in_portal boolean not null default true`
    - `charge_type text`
  - Indexes `(lease_id, status)` and `(next_date) where status = 'Active' and deleted_at is null`.
  - Backfill:
    - `ends_on`, `prorate`, `show_in_portal` and `charge_type` from metadata
    - `gl_account_id` by matching `account` to `number || ' · ' || name` in the same project
    - `property_id` from the lease
    - `status = 'Paused'` where `metadata.autoPost = false`.
- *Server logic:*
  - `lib/billing/frequency.js` (pure, used by both screens and the job): `FREQUENCIES` = Weekly (7 days), Biweekly (14), Monthly (1 month), Quarterly (3), Semi-annually (6), Annually (12), One-time. Plus `nextOccurrence(date, frequency, { dueDay, billWithRent })`.
  - `lib/billing/charges.js`:
    - `billRecurringCharge(admin, ctx, charge, lease, today)` posts every occurrence from `next_date` through today, inside `[window.start, min(ends_on, window.end)]`, capped at 24.
    - Monthly charges with `bill_with_rent` snap to the rent due date.
    - With `prorate`, the first and last partial periods are prorated.
    - Advances `next_date`; sets `Ended` past the end.
    - Rewrites `financial.js:128-187` and retires the `recurring-charges` job key into `billing` (CORE-01). Keep `job_runs` history readable by mapping the old key's label.
  - `buildCharge`: when no GL is given for `sourceType: 'charge'` with `incomeKey` unset and a `recurringChargeId` in metadata, fall back to `other_income` (4100), not `rent_income`.
- *Journal lines:*

  | Event | Debit | Credit | Key | source_type |
  |---|---|---|---|---|
  | Occurrence (prorated if partial) | 1200 AR | `gl_account_id` (fallback 4100 Other Income) | `rc:<chargeId>:<YYYY-MM-DD>` (unchanged) | charge |
  | End-date or move-out credit | charge GL | 1200 AR (`applies_to` the occurrence) | `rc-adj:<chargeId>:<date>:<n>` | credit |

- *API routes / jobs:* `POST /api/billing/charges/[id]/post-next` replaces the browser `postRecurringOccurrence` (`recurring_charges.jsx:46-61`). Billing runs inside the `billing` job.
- *UI:*
  - Lease › Charges (`lease_money.jsx:168-221`):
    - a GL field keyed `glAccountId`, loaded by a new `glAccountIdOptions()` (value = id, `patch: { account: label }`) and required
    - frequency from `FREQUENCIES`
    - `endsOn` defaulting blank ("bill until the lease ends")
    - `billWithRent` switch for Monthly.
  - Same fields on the accounting Recurring Charges screen.
  - The resident portal lease view lists charges with `show_in_portal` (`lib/portal/resident.js`, lease view).
- *Permissions:* `accounting.post` to post next.

**Steps**
1. Write the migration and backfill.
2. Add `frequency.js` and `charges.js`, with tests for weekly, semi-annual and proration.
3. Move charge billing into the `billing` job.
4. Update the data layer `lib/supabase/recurring_charges.js` fields.
5. Fix both screens.
6. Regenerate the demo seed (status `Paused`, not `autoPost:false`).

**Research before building**
- Confirm the live column types of `recurring_charges.property_id`, `description` and `category`:
  ```sql
  select column_name, udt_name
  from information_schema.columns
  where table_schema = 'property' and table_name = 'recurring_charges';
  ```
  Make the migration match exactly.

**Acceptance criteria**
- A weekly 20 charge from Nov 2 posts Nov 2, 9, 16 and 23 (three missed runs catch up in one run).
- A semi-annual charge posts every 6 months.
- A charge with GL 4100 lands on 4100, never 4000.
- `ends_on` Dec 31: no January occurrence; status `Ended`.
- Monthly 100 starting Nov 15 with `prorate`, billed with rent due on the 1st: Nov 15 = 53.33, then Dec 1 = 100.
- Building a fresh DB from migrations, then creating a charge with `propertyId`, succeeds.
- Trial balance balances; re-run posts nothing.

**Depends on / unblocks**
- Depends on: CORE-01.
- Unblocks: CORE-02, CORE-05; COMM chargebacks (5.4); HOUS split billing.

#### CORE-04 · Security deposits on the ledger, interest, refunds through AP
- **MRI equivalent:** PMX Residential Management + PMX Financials — Statement of Deposit (SODA); "security deposit refunds … generate invoices automatically in Accounts Payable".
- **Status · priority · effort:** Broken · P1 · L
- **Refs:** Gap 0.4 · Inventory 3.55–3.66 · PMX-3.25, PMX-3.30, PMX-6.33

**Geiger today**
- The builders exist but nothing calls them:
  - `buildDepositHeld` (Dr 1020 / Cr 2100, `lib/ledger/postings.js:356-371`)
  - `buildDepositReturn` (`:373-390`)
  - exported as `postDepositHeld` / `postDepositReturn` (`lib/supabase/ledger.js:378-379`)
  - the `deposit_held` dialog kind (`components/internal/screens/accounting/ledger_dialogs.jsx:64`) is in no `ACTIONS` list (`ledger_section.jsx:65-74`).
- Activation creates a `security_deposits` record only (`lease_actions.jsx:163-182`). Move-in posting excludes the deposit (`lease_money.jsx:437-449`).
- The Return wizard updates the record and saves a letter (`components/internal/screens/leasing/security_deposits.jsx:447-492`).
- Interest is computed on the record only (`:69-75, 132-175`).
- The accrual job (`financial.js:422-490`) runs on GL 2100 balances that never exist. It ignores `interestBearing` and `interestRateOverride`.
- `depositHeldIn` is unread (`lib/policies.js:111-122`).
- The Deposit Detail report flags these records as unposted (`lib/reports/defs_financial.js:470-560`).

**What's missing** — Deposit liability posted per lease; cash in the right bank; interest on real balances; disposition posted; refunds paid through AP.

**How to build**
- *Data model:*
  - Migration `security_deposits_ledger_links`:
    - `security_deposits` gains `charge_entry_id uuid`, `apply_entry_id uuid`, `refund_bill_id uuid`, `interest_bearing boolean not null default false` (backfill from metadata) and `kind text not null default 'Security deposit'`.
    - `bills` gains `payee_type text not null default 'vendor' check (payee_type in ('vendor','tenant','owner'))`, `tenant_id uuid`, `owner_id uuid`, and an index on `(payee_type, tenant_id)`. The `owner` payee is reused by CORE-40+ owner payouts (11.3).
  - The pet deposit (`lease.metadata.petDeposit`) becomes its own record with `kind = 'Pet deposit'`.
- *Server logic:* `lib/billing/deposits.js` (server):
  - `chargeDeposit`
  - `recordDepositReceived` (opening balances and takeovers)
  - `pendingSweeps(admin, projectId)` and `sweepDeposit`
  - `accrueInterest` (rewrite of `financial.js:422-490`, per deposit record, honouring `interest_bearing` and the override; also checks the legacy key `depint:<leaseId>:<YYYY-MM>`)
  - `payInterest`
  - `disposeDeposit(admin, deposit, { deductions, version })`, used by CORE-13.

  Builders in `postings.js`:
  - `buildDepositCharge`
  - `buildDepositApply` (Dr 2100 [+2110] / Cr AR allocations)
  - refund through `buildBill` with a 2100/2110 line
  - keep `buildDepositHeld`; retire the cash-refund path of `buildDepositReturn` (no UI).

  Deposit postings carry line metadata `{ depositId }` so balances can be computed per record.
- *Journal lines:*
  - Accounts: 1020 `deposit_cash`, 2100 `security_deposits`, 2110 `deposit_interest_payable`, 1200 AR, 2000 AP, 1010 `trust_cash`.
  - The sweep and release rows apply only when policy `depositHeldIn = 'trust'` and an active bank account of type "Security deposit" exists. Otherwise the deposit cash GL is the bank the money landed in, and no transfer is posted.

  | # | Event | Debit | Credit | Key | source_type |
  |---|---|---|---|---|---|
  | 1 | Deposit billed (activation/move-in) | 1200 AR | 2100 | `deposit:<depositId>:charge` | deposit_held |
  | 2 | Resident pays | (normal payment, CORE-11) | | | payment |
  | 3 | Move cash to deposit bank | 1020 (`bank_account_id` = deposit bank) | receiving cash GL (`bank_account_id` of the payment) | `deposit:<depositId>:sweep:<paymentEntryId>` | adjustment |
  | 4 | Received outside AR (opening/takeover) | 1020 | 2100 | `deposit:<depositId>:received` | deposit_held |
  | 5 | Monthly interest | 5600 Deposit Interest Expense | 2110 | `depint:<depositId>:<YYYY-MM>` | deposit_interest |
  | 6 | Interest paid as credit (policy) | 2110 | 1200 AR | `depint-pay:<depositId>:<YYYY>` | deposit_return |
  | 7a | Deduction | 1200 AR | deduction GL (category map; default 4100) | `deposit:<depositId>:ded:<deductionId>` | charge |
  | 7b | Apply deposit (+interest) to open charges | 2100 [+2110] | 1200 AR (`applies_to` each item, oldest first) | `deposit:<depositId>:apply` | deposit_return |
  | 7c | Refund payable (bill, payee tenant) | 2100 [+2110] | 2000 AP (`tenant_id`, `vendor_id` null) | `bill:<billId>` | bill |
  | 7d | Pay refund | 2000 AP | 1020 (deposit bank) | `billpay:<paymentId>` | bill_payment |
  | 7e | Release applied amount to operating trust | 1010 | 1020 | `deposit:<depositId>:release` | adjustment |

  Unpaid rent needs no 7a row: it is already an open charge.
- *API routes / jobs:*
  - `POST /api/billing/deposits/[id]/charge`, `/received`, `/sweep`, `/dispose` (the last one is CORE-13's engine).
  - The `deposit-interest` job keeps its key and calls `accrueInterest`.
  - Policy `depositInterestPayout` (`at_move_out` default | `annual_credit`).
- *UI:*
  - Activation wizard: "Record the $X deposit as held" becomes "Bill the $X deposit" (`lease_actions.jsx:153`).
  - Security Deposit record:
    - a Ledger section (`LedgerView`, lease scope filtered to `metadata.depositId`)
    - actions "Bill deposit", "Record received outside the ledger", "Move to deposit account"
    - the Return wizard (`security_deposits.jsx:447-492`) becomes the dispose flow (CORE-13).
  - Bank Accounts screen: a "Deposits to transfer" card listing `pendingSweeps`.
  - Bills: a payee picker covering vendor, tenant and owner; AP aging (`defs_financial.js` `apAgingReport`) groups by payee.
  - Lease ledger `ACTIONS` gains `deposit` (`ledger_section.jsx:65-67`).
  - Deposit Detail report reads `charge_entry_id`.
- *Permissions:* `accounting.post`.

**Steps**
1. Write the migration.
2. Add the builders and `deposits.js`.
3. Add the routes.
4. Wire activation and the deposit record actions.
5. Rewrite the interest job.
6. Add the sweep queue UI.
7. Add the payee to bills and AP aging.
8. Regenerate the demo seed: deposits charged and paid.

**Research before building**
- State rules on separate or interest-bearing deposit accounts and interest payout timing, for the policy defaults and copy. Use the `us-landlord-tenant-resources` skill and `property.legal_resources` (e.g. NJ, NY, MA, IL/Chicago rules).
- Must refunds be payable jointly to all co-tenants on the lease, or to the primary tenant? This drives the refund bill payee and its payment memo.

**Acceptance criteria**
- Activate with a 1,500 deposit: Dr 1200 1,500 / Cr 2100 1,500 (`deposit:<id>:charge`); `charge_entry_id` set.
- The resident pays 1,500 into the trust bank; "Deposits to transfer" lists 1,500; confirming posts Dr 1020 / Cr 1010 once.
- 2100 for the lease = 1,500 = the record amount; Deposit Detail shows no unposted records.
- At 1% with `interest_bearing` on: 1.25/month Dr 5600 / Cr 2110. With the flag off: nothing.
- Dispose with 300 of deductions and 200 unpaid rent:
  - 7a = 300
  - 7b = 500 applied
  - refund bill 1,000 (+ accrued interest)
  - pay it from the deposit bank
  - 7e = 500.
- After dispose, the lease shows 2100 = 0, 2110 = 0, AR = 0 and AP = 0, and 1020 is back to its opening balance.
- Deductions above the deposit leave AR positive and create no refund bill.
- Every route re-run posts nothing. Trial balance balances.

**Depends on / unblocks**
- Depends on: CORE-01 (`onLeaseActivated`). Step 2 works with today's payment posting; CORE-11 later moves it server-side.
- Unblocks: CORE-13, CORE-18 (pattern), CORE-20; LEAS application/holding fees (2.10); CORE-40+ owner payouts (`bills.payee_type`).

**Open decisions**
- Bill deposits through AR (recommended: they appear on move-in statements and can be paid online), or only record them as received?
- When policy `depositHeldIn = trust`, require a dedicated "Security deposit" bank account before activation (block), or warn only?

#### CORE-05 · Concessions reduce billed rent; listing specials reach the lease
- **MRI equivalent:** PMX Residential Management — concession codes mapped to charge codes; concessions applied to specific periods (X.5.7).
- **Status · priority · effort:** Tracking-only · P1 · M
- **Refs:** Gap 0.6 · Inventory 2b.31, 2a.8, 3.15 · PMX-2.74, PMX-2.75

**Geiger today**
- Concessions are `record_items` of kind `concession` (`lease_money.jsx:532-575`; types `components/internal/screens/leasing/shared.js:399-405`).
- Only one-time credits reduce the move-in "Total due" display (`lease_money.jsx:412-415`). Nothing posts.
- Listing specials are `record_items` of kind `special` on the listing (`components/internal/screens/marketing/sections/listing_sections.jsx:72-100`), used only for the effective-rent figure.
- `convertApplicationToLease` copies none (`components/internal/screens/marketing/flows.js:183-260`) even though applications carry `listingId` (`lib/supabase/applications.js:17`).
- The renewal "concession" is free text (`lib/leasing/workflows.js:162`; `lease_actions.jsx:231`).

**What's missing** — Per-period concession credits on the ledger; specials copied to the lease; structured renewal concessions.

**How to build**
- *Data model:* no new table. Concession `record_items` gain metadata:
  - `periods` (optional list of `YYYY-MM`)
  - `spread` (bool: total value ÷ term months, effective-rent style)
  - `waivesItemId` (for `waived_fee`)
  - `sourceSpecialId`
- *Server logic:*
  - `lib/billing/concessions.js`: pure `concessionCredits(concession, period, rentBilledForPeriod, lease)`, plus posting run inside the `billing` job right after rent.
  - Rules per type:

    | Type | Credit |
    |---|---|
    | `free_month` | Full billed rent for `months` periods from `startsOn` (or each listed period) |
    | `amount_off` | `amount` per period in range |
    | `percent_off` | `round(rentBilled × pct / 100)` per period |
    | `one_time` | Once, on `startsOn` or move-in |
    | `waived_fee` | No posting; marks the linked move-in charge Waived (`lease_money.jsx:368-376`) |
    | `spread` | Total ÷ term months, each period |

  - Credits are capped at the period's billed rent.
  - Rent true-ups (CORE-01) re-run concession math and post `conc-adj` deltas.
  - Status becomes `Used` after the last period posts.
  - In `flows.js` `convertApplicationToLease`, copy active listing specials:

    | Listing special | Lease concession |
    |---|---|
    | Months free | `free_month` (months = value) |
    | Weeks free | `one_time` for rent×12×weeks/52, or `spread` if the special says so |
    | Dollars off | `one_time` |
    | Percent off | `percent_off` for the term |

    Record `metadata.sourceSpecialId`.
  - Renewal wizard (`lease_actions.jsx:226-236`): structured concession fields (type, amount, months), copied to the new lease on accept.
- *Journal lines:*

  | Event | Debit | Credit | Key | source_type |
  |---|---|---|---|---|
  | Period concession | 4050 Concessions & Credits (contra-income) | 1200 AR (`applies_to` `rent:<leaseId>:<period>` entry) | `conc:<concessionId>:<YYYY-MM>` | concession |
  | One-time credit | 4050 | 1200 AR (oldest open item) | `conc:<concessionId>:once` | concession |
  | Delta after a rent true-up | 4050 or 1200 | 1200 or 4050 | `conc-adj:<concessionId>:<YYYY-MM>:<n>` | concession |

- *API routes / jobs:* the `billing` job; `GET /api/billing/leases/[leaseId]/concessions/preview` returns the per-period schedule.
- *UI:*
  - Concessions tab: a "Spread over term" switch, a period list, a per-period schedule preview, and "Posted" badges.
  - The move-in "Total due" uses the same pure function.
  - Rent roll (`lib/reports/defs_operations.js:50-75`) adds "Concessions this period" and "Effective rent" from 4050 lines.
- *Permissions:* `billing.manage` to add or edit concessions on live leases.

**Steps**
1. Write `concessions.js` with tests.
2. Add the job step.
3. Update the conversion and renewal copy.
4. Update the UI.
5. Add the rent roll columns.

**Research before building**
- How peers present concessions: gross rent plus a contra line (as here) vs netted rent, and how listing-site syndication expects "specials". Coordinate with the LEAS syndication item (MITS concession fields).

**Acceptance criteria**
- Lease at 2,000 with `free_month` for 2027-01: Jan rent 2,000 (Dr 1200 / Cr 4000) and Dr 4050 2,000 / Cr 1200 applied to it. January open = 0; the late-fee job charges nothing.
- 10% off for 3 months: three credits of 200.
- A one-time 250 credit posts once.
- The income statement shows 4000 gross and 4050 contra.
- A listing special "Months free: 1" appears on the converted lease's Concessions tab.
- Re-running posts nothing. Trial balance balances.

**Depends on / unblocks**
- Depends on: CORE-01.
- Unblocks: LEAS listings and syndication (specials data), LEAS bulk renewals.

#### CORE-06 · Daily late fees on a shared receivables helper
- **MRI equivalent:** PMX Residential Management — late fee formulas, "calculate late fees" (daily options not public).
- **Status · priority · effort:** Broken · P1 · S
- **Refs:** Gap 0.5 · Inventory 3.20–3.26 · PMX-3.32

**Geiger today**
- `computeLateFee` returns the cumulative daily fee (`lib/policies.js:194-203`), but the job posts once per month under `late:<leaseId>:<YYYY-MM>` (`financial.js:300`), so the daily part never accrues.
- Percent fees use `lease.rent` (`:295`).
- Leases in Eviction are still charged (`ACTIVE_LEASE` includes it, `:23`).
- There is no minimum balance.
- Tenant `lateFeeExempt` is never read (`components/internal/screens/tenants/shared.js:102`).
- The manual "Post late fee" shares the key (`rent_collection.jsx:136-157`).
- Open-item loading is duplicated: `financial.js:276-284` and `lib/payments/context.js:48-67`.

**What's missing** — Incremental daily accrual, correct base, stop conditions and one shared receivables loader.

**How to build**
- *Data model:* policies in `lib/policies.js` (rent group):
  - `lateFeeMinBalance` (currency, default 0)
  - `lateFeesDuringEviction` (switch, default false).
- *Server logic:*
  - `lib/billing/receivables.js`: `loadLeaseReceivables(admin, projectId, leaseIds, acct)` returns `Map leaseId → { balance, items, oldestOpenDate, lastPaymentDate, lateFeesPosted:{[period]:amount} }`. It is a batched generalisation of `leaseReceivable`, reused by CORE-07/12/13/14/19.
  - `lib/billing/late_fees.js` `assessLateFees(admin, ctx, lease, today)`:
    - base = the period's billed rent (CORE-01 `billedForPeriod`)
    - target = `computeLateFee(policies, base, daysLate)`, capped by `maxLateFee`
    - posted = Σ non-void entries keyed `late:<leaseId>:<YYYY-MM>*`
    - post `target − posted` when > 0.
  - Stop when any of these is true:
    - the period's rent open amount ≤ `lateFeeMinBalance`
    - the tenant is `lateFeeExempt`
    - status is Eviction and the policy is off
    - an active payment plan is in good standing (CORE-14).
  - The late notice email is sent only with the first posting (`financial.js:326`). A missed run catches up because the target is cumulative.
- *Journal lines:*

  | Event | Debit | Credit | Key | source_type |
  |---|---|---|---|---|
  | First assessment | 1200 AR | 4010 Late Fee Income | `late:<leaseId>:<YYYY-MM>` (unchanged; dedupes with the manual post) | late_fee |
  | Daily increment / catch-up | 1200 AR | 4010 | `late:<leaseId>:<YYYY-MM>:<YYYY-MM-DD>` (business date) | late_fee |

- *API routes / jobs:*
  - The `late-fees` job calls `assessLateFees`.
  - `POST /api/billing/leases/[leaseId]/late-fee` runs the same function for one lease and replaces the browser post in `rent_collection.jsx:136-157`.
- *UI:* the Rent Collection Late Fees tab shows posted-to-date vs target and the stop reason.
- *Permissions:* `accounting.post`.

**Steps**
1. Add `receivables.js`.
2. Add `late_fees.js` with tests.
3. Swap the job body.
4. Add the manual route.
5. Add the two policies.

**Research before building** — The state late-fee caps and "no daily fees" rules that should cap `maxLateFee` defaults per state. Use the Legal Resources data; this feeds CORE-20's jurisdiction values.

**Acceptance criteria**
- Policy daily: 50 initial + 10/day, grace 5, cap 150, due Nov 1, rent unpaid:
  - Nov 6 → 0 (inside grace)
  - Nov 7 → 50 (`late:…:2026-11`)
  - Nov 8 → +10
  - and so on until the total reaches 150 on Nov 17; later runs post nothing.
- Runs skipped on Nov 9–10: the Nov 11 run posts +30.
- Rent paid on Nov 12: nothing after.
- An exempt tenant or an Eviction lease (default policy) gets nothing.
- A percent fee uses the billed rent of the period, including a mid-month step.
- Trial balance balances.

**Depends on / unblocks**
- Depends on: CORE-01.
- Unblocks: CORE-07, CORE-14, CORE-19.

#### CORE-07 · Dashboards, balances and the rent-overdue automation read the ledger
- **MRI equivalent:** PMX Residential Management — Property Manager Dashboard and role pages.
- **Status · priority · effort:** Broken · P1 · M
- **Refs:** Gap 0.7 · Inventory 7.26, 3.46, 3.47, 3.48, 3.49, 4.13, 4.51 · PMX-7.03, PMX-7.04

**Geiger today**
- Overview:
  - loads `rentAccountsLayer.list()` (`components/internal/screens/overview/property_overview.jsx:110`)
  - builds Rent Collected, Delinquent Balance, Collection rate and the trend from legacy `metadata.charges/payments` via `ledgerOf` / `agingOf` (`components/internal/screens/reports/shared.js:156, 185`; `property_overview.jsx:780-814, 937`).
- `balanceOf` falls back to the legacy fields (`components/internal/screens/accounting/shared.js:61-74`).
- Tenants list balance comes from rent accounts (`components/internal/screens/tenants/config.jsx:106-124`).
- `tenants.balance` is written only by explicit patches (`lib/supabase/tenants.js:67`), but several places read it:
  - the `rent.overdue` trigger (`lib/automations/runner.js:187-199`)
  - merge fields `{{balance}}` / `{{balance_due}}` (`lib/messaging/context.js:114, 140`)
  - the rent reminder (`lib/messaging/reminder_jobs.js:272`)
  - the resident portal fallback (`lib/portal/resident.js:81-83`).
- Rent account Overdue / In collections statuses are set by hand (`accounting/shared.js:36-43`).
- The demo seed pre-fills the legacy arrays, which hides the defect.

**What's missing** — Every balance, KPI and trigger reads GL AR; legacy fields are retired.

**How to build**
- *Data model:*
  - Migration `ledger_ar_views`: view `property.ledger_ar_monthly` (`security_invoker = true`) over AR-subtype lines joined to entries. Columns:
    - `project_id`, `property_id`, `lease_id`, `tenant_id`, `month`
    - `charged` (AR debits, source charge/late_fee/deposit_held)
    - `collected` (AR credits, source payment)
    - `credited` (AR credits, source concession/credit/write_off/deposit_return)
    - `transferred` (adjustment).
  - Grant select like `ledger_core.sql:620-622`.
  - Balances keep using `property.ledger_party_balances` (`ledger_core.sql:575-599`).
- *Server/browser logic:*
  - `lib/supabase/receivables.js` (new, client layer):
    - `arByLease()` and `arByTenant()` (from `ledger_party_balances`)
    - `arMonthly({ from, to, propertyId })`
    - `delinquentLeases(asOf)`: AR lines for leases with positive balance, then `receivableAging` (`lib/reports/ledger_math.js:280`).
  - Server: `lib/automations/runner.js` `rent.overdue` uses `loadLeaseReceivables` (CORE-06) for live leases. It fires for the lease's primary tenant when `balance ≥ minBalance` and `oldestOpenDate + daysOverdue ≤ today`; dedupe key unchanged.
  - Messaging context, rent reminders and the portal take balances from `ledger_party_balances` (dimension lease); drop the `party.balance` fallback.
  - The `billing` job sets `rent_accounts.status`: Current (≤ 0), Due (open, within grace), Overdue (past grace). `In collections` stays sticky.
- *UI:*
  - Overview replaces the `accounts` loader:
    - Rent Collected = Σ `collected`
    - Delinquent = Σ positive lease balances
    - Collection rate = collected ÷ charged for the month
    - the trend comes from the view
    - Needs Attention lists leases whose oldest open item is > 30 days, plus holdovers (CORE-02).
  - Tenants list uses `arByTenant`.
  - Tenant "Current balance" (`tenants/shared.js:96`) shows the ledger figure.
  - Remove the Legacy charges/payments sections (`rent_collection.jsx:450-451, 499-512`) and `billedOf` / `collectedOf` / `ledgerOf` / `agingOf` once unused.
  - Stop all writes to `tenants.balance`; drop the column in a later migration.
- *Permissions:* none new.

**Steps**
1. Write the view migration.
2. Add `receivables.js`.
3. Rewire the Overview and Tenants list.
4. Rewire the runner, messaging context, reminders and portal.
5. Add rent-account status sync to the `billing` job.
6. Delete the legacy helpers.
7. Regenerate the demo seed without legacy arrays.
8. Check with `grep -rn "\.balance\b"` over `lib` and `components` that no `tenants.balance` read remains.

**Research before building** — Measure an Overview load on the demo project (~8k rows) with the view vs client-side `listLedger`. If the view is slow, add an index on `ledger_lines (gl_account_id, lease_id, entry_date)`.

**Acceptance criteria**
- On the same date, the Overview Delinquent balance equals the Delinquency report total (`lib/reports/defs_operations.js:134-196`).
- Collected this month = Σ payment AR credits in the GL detail.
- Tenants list balances equal the ledger.
- The automation fires for a lease with 6-day-old open rent (`daysOverdue` 5) and not for one with only a future-dated charge.
- `{{balance_due}}` in a template send equals the ledger balance.
- No code reads `tenants.balance` or `metadata.charges/payments` (grep).

**Depends on / unblocks**
- Depends on: CORE-01, CORE-06.
- Unblocks: CORE-40+ role-based dashboards (7.4).

#### CORE-08 · Owner statements correct for co-owners
- **MRI equivalent:** none evidenced for third-party residential. This is Geiger's lead area against PMX ("Where Geiger matches or leads PMX").
- **Status · priority · effort:** Broken · P1 · M
- **Refs:** Gap 0.8 · Inventory 6.25, 6.78, 6.80, 6.88

**Geiger today**
- Postings auto-tag the property's **primary** owner:
  - browser `ownerOfProperty` (`lib/supabase/ledger.js:300-307, 328`)
  - jobs `ownerOf` (`financial.js:89-96`, used at `:146, 201, 301, 393`)
  - online payments, NSF and refunds (`lib/payments/posting.js:50, 140, 173` via `lib/payments/context.js:36-46`).
- Portal: lines are owner-tagged plus untagged property lines (`lib/portal/ledger.js:45-50`). `shareOf` gives owner-tagged lines 100% (`lib/portal/owner.js:101-102`):
  - a co-owner sees none of the primary-tagged lines (as the gap report says);
  - **and the primary owner sees 100% of income whatever their percentage (not in the gap report).**
- The manager's fee lines (Dr 1000 / Cr 4500, `postings.js:337-354`) are untagged but carry `property_id`, so the portal counts 4500 as owner income (`owner.js:131-134`).
- Staff `ownerLines` drops every untagged line of `management_fee` entries (`lib/reports/ledger_math.js:434-444`).
- The report applies the percentage only to each property's net (`lib/reports/defs_operations.js:341-352`).

**Decision** — Don't split lines per owner at posting time.
- Property-level lines stay untagged.
- Owner share is applied at report time from effective-dated `property_owners` (`ownership_pct`, `starts_on`, `ends_on`; `lib/supabase/property_owners.js:4-18`).
- `owner_id` is set only on owner-specific entries: distributions, contributions, and manual owner-specific journals with `metadata.ownerExplicit`.

**How to build**
- *Data model:*
  - Migration `ledger_owner_dimension_backfill`:
    - set `owner_id = null` on `ledger_lines` and `ledger_entries` whose entry `source_type not in ('distribution','contribution')` and whose metadata lacks `ownerExplicit`
    - set line `metadata.side = 'manager'` on management-fee lines for `operating_cash` / `management_fee_income`
    - dimensions only, no amounts.
  - Migration `ledger_trust_positions_by_property`: drop and recreate the view `property.ledger_trust_positions` grouped by `(project_id, gl_account_id, property_id)` (header names ownership moving from `ledger_core`).
- *Server logic:*
  - Remove auto-tagging at every call site listed above.
  - `buildManagementFee` marks manager lines `metadata: { side: 'manager' }` (`postings.js:350-351`).
  - New pure `lib/ledger/ownership.js`:
    - `ownershipIndex(rows)`
    - `ownerShare(line, ownerId, idx)`: owner-tagged → 1 if it is this owner, else 0; untagged → the percentage in effect on `line.date` ÷ 100; manager-side lines → 0
    - `ownerScopedLines(lines, ownerId, idx)`: lines × share.
  - Replace with `ownership.js`:
    - portal `ownerLines` + `shareOf`
    - staff `ownerLines` / `ownerStatement` (line-level share)
    - the owner-statement report
    - `SCOPE_FOCUS.owner` usage in `ledger_section.jsx` (funds in trust = share × property trust + owner-tagged trust).
  - `diagnose()` keys negative trust by account × property (`postings.js:664-675`). Owner-level shortfall uses `ownerScopedLines` in `trustPositions` (`ledger_math.js:364`).
- *UI:*
  - Property › Owners warns when live ownership on any date ≠ 100%.
  - Owner statement shows "Your share: 60%" per property.
- *Permissions:* none new.

**Steps**
1. Write `ownership.js` with tests.
2. Remove tagging at the call sites.
3. Update the fee builder.
4. Swap the portal, staff report, ledger section and diagnostics.
5. Write both migrations.
6. Regenerate the demo seed accounting area.
7. Add the ownership-100% warning.

**Research before building** — How peers (AppFolio, Buildium, Rentvine) split co-owned property income on statements and 1099s: by percentage at report time, or with separate ledgers. Confirms the decision and informs CORE-40+ owner 1099 (6.5).

**Acceptance criteria**
- Property owned 60% by A and 40% by B; rent collected 1,000, repairs bill 200, management fee 80:

  | Owner | Income | Expenses | Fees | Net |
  |---|---|---|---|---|
  | A | 600 | 120 | 48 | 432 |
  | B | 400 | 80 | 32 | 288 |

  A + B = the property totals. 4500 appears in neither.
- A 300 distribution tagged to A reduces only A's funds in trust.
- Ownership change on the 15th (A → 40%, B → 60%): lines before and after split by their dates.
- Portal and staff statement figures are identical.
- The backfill leaves every account's debit and credit totals unchanged (compare `ledger_account_balances` before and after). Trial balance balances.

**Depends on / unblocks**
- Depends on: none.
- Unblocks: CORE-40+ owner payouts (11.3), owner 1099 (6.5), comparative statements (11.9), entities (1.1).

#### CORE-09 · Work-order vendor bills through approval and AP
- **MRI equivalent:** PMX Financials — AP approvals; invoices generated automatically from RM.
- **Status · priority · effort:** Broken · P1 · S
- **Refs:** Gap 0.9 · Inventory 5.40, 6.34, 6.36 · PMX-6.33

**Geiger today**
- "Create vendor bill" on a work order (`components/internal/screens/maintenance/sections/wo_actions.jsx:463-528`) calls `billsLayer.create` directly. That skips:
  - the approval limit in Bills `newRow` (`components/internal/screens/accounting/bills.jsx:622-636`)
  - create-time AP posting (`billsData.create`, `:120-133`).
- It sets no GL account.
- `approval_status` defaults to "Not required" (`supabase/migrations/20261015212744_ledger_core.sql:241`), so the bill looks approved, but `ledger_entry_id` stays null. AP and owner statements miss it until someone pays it; payment posts it lazily (`bills.jsx:170-177`).
- Vendor-portal invoices already arrive as Pending (`lib/portal/vendor.js:213-269`).

**What's missing** — One bill-creation path that applies the limit, defaults the GL and posts to AP.

**How to build**
- *Server logic:*
  - `lib/accounting/bills.js` (pure) `prepareBill(input, { approvalLimit })`:
    - approval = Pending when `amount > limit`
    - default GL from the work-order category: repairs `repairs_maintenance` 5000, turns `turnover` 5700, capital `capital_improvements` 1500
    - copies `job_id`, `unit_id`, `property_id` and `work_order_id`.
  - `lib/accounting/bills_server.js`:
    - `createBill(admin, input, actor)`: insert, then post to AP when approved (key `bill:<billId>`), then set `ledger_entry_id`
    - `approveBill(admin, billId, actor)`.
  - Bills screen create and approve (`bills.jsx:101-133, 669-689`), the WO wizard and the vendor-portal approval all use these.
- *Journal lines:*

  | Event | Debit | Credit | Key | source_type |
  |---|---|---|---|---|
  | Bill posted (on create if not required, else on approve) | expense GL (5000 default; `job_id`, `unit_id`, `property_id`, `vendor_id`) | 2000 AP (`vendor_id`) | `bill:<billId>` | bill |

- *API routes:* `POST /api/accounting/bills`, `POST /api/accounting/bills/[id]/approve`.
- *UI:* the WO wizard adds a GL field (prefilled) and a note ("Over $X — needs approval before it posts"); success toast states "Posted to AP" or "Waiting for approval".
- *Permissions:* `accounting.post` to create; approval stays `accounting.post` until CORE-40+ (6.2) adds approver levels.

**Steps**
1. Add `prepareBill`.
2. Add the server service and routes.
3. Switch the Bills screen and WO wizard to them.
4. Backfill: post existing approved, open bills where `ledger_entry_id` is null (one-off seed script under `supabase/seeds/`, keyed `bill:<id>`).

**Research before building** — none beyond CORE-40+ (6.2) scope.

**Acceptance criteria**
- Limit 500: a 300 WO bill posts to AP immediately; an 800 bill is Pending with no AP entry. Approving posts once; approving again posts nothing.
- AP aging and the owner statement include the posted bill.
- Trial balance balances.

**Depends on / unblocks**
- Depends on: none.
- Unblocks: CORE-40+ approvals (6.2), AP capture (6.12); COMM purchase orders (5.1).

#### CORE-10 · Scheduled jobs run in production (cron plan, locks, alerts, runbook)
- **MRI equivalent:** PMX — RM month-end processing; scheduled events and alerts.
- **Status · priority · effort:** Partial (not scheduled) · P1 · M
- **Refs:** Gap 0.10 · Inventory 9.42–9.44 · PMX-6.52, PMX-9.10

**Geiger today**
- 12 jobs in `lib/jobs/registry.js:7`:
  - financial ×4 (`lib/jobs/financial.js:492-524`)
  - autopay (`lib/jobs/autopay.js:45-52`)
  - operations ×6 (`lib/jobs/operations.js:14-30`, `lib/messaging/reminder_jobs.js:131, 228, 326, 521`, `lib/jobs/preventive_work_orders.js:144`)
  - scheduled reports (`lib/jobs/scheduled_reports.js:155`).
- Routes:
  - `app/api/cron/[job]/route.js`: GET with `Bearer CRON_SECRET`, `maxDuration = 300`
  - `app/api/cron/run-due/route.js`: every due job, serially, in one request
  - staff "Run now".
- `vercel.json` holds only `$schema` (by design during dev).
- Runs are logged in `job_runs` (`lib/jobs/execute.js:10-60`). There is no lock against overlapping runs and no alerting.
- Jobs use UTC dates (`financial.js:26, 131`), although `company_profile.timezone` exists (`components/internal/screens/settings/company_profile.jsx:91-94`) and nothing reads it.
- The Scheduled Jobs dialog says "Vercel Cron runs them daily" (`components/internal/screens/automations/scheduled_jobs.jsx:121`).
- `scheduled-announcements` runs only daily (`reminder_jobs.js:524`).

**What's missing** — A launch cron plan, business dates per project, overlap locks, failure and missed-run alerts, as-of reruns, a demo pause switch, and a runbook.

**How to build**
- *Cron plan* (`vercel.json` `crons`), one entry per job path `/api/cron/<key>` so each gets its own function budget. Times are UTC. Financial jobs run after local midnight in every US zone (10:00 UTC = 00:00 Hawaii).

  | Job | Cron (UTC) | Interval | Notes |
  |---|---|---|---|
  | `billing` (CORE-01) | `5 10 * * *` | 1440 | rent, charges, concessions, plan installments |
  | `late-fees` | `35 10 * * *` | 1440 | after billing |
  | `management-fees` | `0 11 * * *` | 1440 | posts previous month once |
  | `deposit-interest` | `15 11 * * *` | 1440 | previous month |
  | `preventive-work-orders` | `30 11 * * *` | 1440 | |
  | `autopay` | `0 13 * * *` | 1440 | 05:00 PT / 08:00 ET, after billing |
  | `scheduled_reports` | `0 12 * * *` | 1440 | |
  | `resident-statements` (CORE-12) | `30 12 * * *` | 1440 | sends on the configured day |
  | `lease-reminders` | `0 15 * * *` | 1440 | |
  | `rent-reminders` | `30 15 * * *` | 1440 | |
  | `expiring-documents` | `0 16 * * *` | 1440 | |
  | `scheduled-announcements` | `*/15 * * * *` | 15 | was daily; needs Pro |
  | `automations` | `0 * * * *` | 60 | needs Pro |
  | `run-due` (watchdog) | `0 20 * * *` | — | safety net + missed-run alerts |

  Vercel Hobby allows only once-a-day crons with ±59 min precision (https://vercel.com/docs/cron-jobs/usage-and-pricing), so the two sub-daily jobs need Pro. Vercel runs crons in UTC and does not retry failures; the watchdog covers that.
- *Business date:*
  - `executeJob` passes `now`.
  - `makeContext` (`financial.js:79-106`) and the billing context gain `ctx.today(projectId)` = `businessDate(now, company_profile.timezone || 'America/New_York')`.
  - Reminder jobs use the same helper.
- *Overlap lock:*
  - Migration `job_runs_running_lock`: unique index on `job_runs (job_key, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status = 'running'`.
  - `executeJob` first marks `running` rows older than 15 minutes as `abandoned`, then inserts its row. A unique violation returns `{ status: 'skipped_locked' }`.
- *Idempotency* (existing; keep and test):
  - ledger keys (registry above)
  - `notification_sends.dedupe_key` (`reminder_jobs.js:50-84`)
  - `autopay_plans.last_run_period` + Stripe idempotency (`lib/jobs/autopay.js:5-9`)
  - `report_runs (schedule_id, period_key)`
  - `automation_runs (automation_id, dedupe_key)`
  - `announcement_deliveries` unique
  - `work_orders (pm_schedule_id, pm_due_date, unit)` unique (`preventive_work_orders.js:12-15`).
- *Alerts:* `lib/jobs/alerts.js` `alertJobOutcome(admin, run)`. When a run is failed, partial, or `skipped_locked` twice in a row:
  1. In-app notice via geiger-notify (`@geiger/notify/server` `createServerNotifier`, app `property`, category `jobs`) to the project's admins. Reuse it rather than building a bell; it is not yet a dependency in `package.json`.
  2. Email `staff_alerts` (`lib/email/catalog.js:119-127`) to the configured alert recipients.
  3. `console.error('[jobs.alert]', …)` for log drains.

  Dedupe per job per day through `notification_sends`. The `run-due` watchdog alerts "did not run" when a job's last success is older than 1.5 × its interval.
- *As-of reruns:* `POST /api/cron/[job]` accepts `{ projectId, asOf }`, gated by `settings.manage`. `now` = noon on `asOf` in the project timezone. Billing and late fees catch up 3 months at most.
- *Pause:* every job skips projects with `billing_settings.jobsPaused` (logged as skipped), so the demo project `ebcc7910-…` stays paused when crons go live.
- *UI:* the Scheduled Jobs dialog shows:
  - corrected copy
  - per job: last run status, next scheduled time, alert badge
  - "Run as of…" for admins.
- *Permissions:* `settings.manage` for as-of runs and the pause switch.

**Runbook** (published in the dialog and kept in this spec)

| Job | Writes | Safe to re-run | Catch-up | Typical failure → fix |
|---|---|---|---|---|
| billing | `rent:`, `rent-adj:`, `rc:`, `conc:`, `plan:inst:` entries; `rent_accounts.status` | Yes | 3 months back, never before `billingStartsOn` | "No Accounts Receivable account" → Chart of Accounts "Restore defaults" (`ensureDefaultChart`); lease with no steps → rerun the CORE-01 backfill |
| late-fees | `late:` entries; one late-notice email | Yes | Cumulative target | Notice email fails → check `GEIGER_EMAIL_API_KEY`; fee posted anyway |
| management-fees | `mgmt:<propertyId>:<YYYY-MM>` (previous month) | Yes | Previous month only → use "Run as of" for older months | No collected cash → skipped, not an error |
| deposit-interest | `depint:` entries | Yes | Previous month only → "Run as of" | Rate 0 → skipped |
| autopay | Stripe charge + `online_payments` row | Yes (Stripe idempotency) | Current month only | Stripe not configured → all skipped with error; card declined → plan failure count, pause after N |
| preventive-work-orders | `work_orders` | Yes (unique index) | Advances `next_due` | — |
| scheduled_reports | `report_runs`, email | Yes | One per period | Email key missing |
| resident-statements | emails (`notification_sends` `stmt:`) | Yes | Sends on the configured day only | — |
| lease/rent reminders, expiring-documents | emails (`notification_sends`) | Yes | Same-day only | Opt-outs and missing emails are counted as skipped |
| scheduled-announcements | `announcement_deliveries` | Yes | Sends overdue scheduled items | — |
| automations | `automation_runs` | Yes | Resumes waiting steps | Step error → run marked failed, alert |

**Steps**
1. Add business-date helpers and `ctx.today`.
2. Write the lock migration and update `executeJob`.
3. Add `alerts.js` and the watchdog in `run-due`.
4. Add as-of support and the pause switch.
5. Fix the dialog.
6. Add the `vercel.json` crons, after CORE-01–06 merge.
7. Set `CRON_SECRET` in Vercel (`vercel env`).
8. Run every job twice for one business date and confirm no new rows.

**Research before building**
- Which Vercel plan the Geiger suite deploys on (Pro needed for hourly and 15-minute crons).
- Whether `@geiger/notify` server sending works from this app's service role (geiger-notify README §1 "Security model").
- Whether suite ops want Sentry Cron Monitors or Vercel log drains for platform-level alerting.

**Acceptance criteria**
- With `vercel.json` deployed, `job_runs` shows one cron-triggered row per job per scheduled time.
- Two concurrent calls to `/api/cron/billing`: one runs, one returns `skipped_locked`.
- A forced failure (bad `GEIGER_EMAIL_API_KEY` in a test env) produces one in-app notice and one email per day.
- With `billing` disabled for 2 days, the watchdog alerts.
- The demo project with `jobsPaused` gets no postings.
- Running every job twice for the same business date adds no `ledger_entries`, `notification_sends`, `work_orders` or `online_payments` rows.
- Trial balance balances after the full cycle.

**Depends on / unblocks**
- Depends on: CORE-01–06 (final job set); PLAT-01 (secrets and service-role hygiene).
- Unblocks: every scheduled posting and reminder at launch; CORE-40+ month-end close (6.1).

**Open decisions**
- Vercel Pro (hourly automations, 15-minute announcements) or Hobby (daily only: automations and announcements once a day)?
- Platform-level alert channel for Geiger ops: Sentry Cron Monitors, a Vercel log drain, or email only?

#### CORE-11 · Receipts for office (manual) payments
- **MRI equivalent:** Engage Pay sends receipts for its own payments; public material doesn't confirm PMX receipts for office payments.
- **Status · priority · effort:** Missing · P1 · M
- **Refs:** Gap 11.1 · Inventory 3.27, 3.30, 3.32, 3.40, 4.20, 4.21

**Geiger today**
- Staff record payments in the browser: `PostEntryDialog` (`components/internal/screens/accounting/ledger_dialogs.jsx:203-275`) → `postPayment` (`lib/supabase/ledger.js:360-363`).
- No receipt is sent (grep `receipt` over `scr/accounting` returns nothing; inventory 3.30).
- No `payment.received` event fires for manual payments (inventory 3.40). Online payments emit it via `emitPaymentEvent` (`lib/payments/posting.js:249-266`).
- Staff entry ignores tenant payment restrictions such as certified funds only or no checks (inventory 3.32).
- Online receipts exist: `sendPaymentReceipt` (`posting.js:288-320`, template `property.rent_receipt`). The catalog still says `live: false` (`lib/email/catalog.js:30-37`), which is stale.
- Residents can't print or download receipts in the portal (inventory 4.21).

**What's missing** — Server-side manual payments with restriction checks, a receipt email, a printable receipt, and the automation event.

**How to build**
- *Server logic:*
  - `lib/billing/payments.js` `recordManualPayment(admin, input, actor)`:
    - Validates restrictions from tenant metadata (`restrictCertifiedOnly`, no checks, eviction block per `blockAfterEviction`). Staff can override with a logged reason.
    - Allocates oldest-first with `loadLeaseReceivables` (CORE-06) unless allocations are passed.
    - Picks the cash account: the chosen bank's GL. Once CORE-16 ships with `useUndepositedFunds` on, Check, Cash and Money order go to 1050 `undeposited_funds` instead.
    - Posts `buildPayment`, emits `payment.received` through the same RPC the online path uses, and sends the receipt when asked.
  - `lib/billing/receipts.js`:
    - `receiptData(admin, paymentEntryId)` returns payer, lease/unit/property, amount, method, reference, allocations (charges paid), remaining balance and receipt number `RCT-<first 8 of entry id>`.
    - `sendReceipt(admin, entryId, { to })` calls `sendNotificationEmail` with notification `rent_receipt` (dedupe `receipt:<entryId>:<email>`; a resend uses an explicit `resend:<timestamp>` suffix).
    - Refactor `sendPaymentReceipt` to use `receiptData`.
  - `lib/billing/receipt_html.js` renders a print-friendly receipt (styles from `lib/reports/html.js`).
- *Journal lines:*

  | Event | Debit | Credit | Key | source_type |
  |---|---|---|---|---|
  | Manual payment | bank cash GL (`bank_account_id`) or 1050 Undeposited Funds | 1200 AR per allocation (`applies_to`); remainder unapplied | `pay:<requestId>` (uuid created by the dialog per submit, so a retry can't double-post) | payment |

  Entry metadata: `{ method, reference, receiptNo, enteredBy, restrictionOverride? }`.
- *API routes:*
  - `POST /api/billing/payments` with `{ projectId, requestId, leaseId|tenantId, amount, date, method, reference, bankAccountId|undeposited, allocations?, memo, sendReceipt }`
  - `GET /api/billing/receipts/[entryId]?projectId=` returns HTML
  - `POST /api/billing/receipts/[entryId]/send`
  - portal `GET /api/portal/resident/receipts/[entryId]`, scoped to the member's leases (`lib/portal/session.js`).
- *UI:*
  - `PostEntryDialog` payment kind calls the route. It adds an "Email receipt to …" switch (default from `paymentSettings.sendReceipts`) and shows a "Print receipt" button after success.
  - `LedgerView` rows for payment entries get a "Receipt" menu (print / resend).
  - The resident portal payments list gets a "Receipt" link (`components/portal/resident/resident_payments.jsx`).
  - Set `rent_receipt` to `live: true`.
- *Permissions:* `accounting.post`; overriding a restriction needs the new `accounting.override_restrictions`.

**Steps**
1. Add `receipts.js` and `receipt_html.js`, and refactor the online receipt to use them.
2. Add `payments.js` and the routes.
3. Switch the dialog.
4. Add the portal receipt link.
5. Fix the catalog flag.

**Research before building**
- State laws requiring written receipts for cash rent: California Civil Code §1499 and New York RPL §235-e, among others. Use Legal Resources, and make cash receipts mandatory where required.

**Acceptance criteria**
- Recording a 1,200 check posts one entry and sends one receipt email; a double click produces one entry.
- A resend sends another email but changes nothing in the ledger.
- For a certified-funds tenant, a personal check is blocked unless overridden with a reason; the reason is logged in activity.
- The receipt's allocations and remaining balance match the lease ledger.
- `payment.received` fires once.
- Trial balance balances.

**Depends on / unblocks**
- Depends on: CORE-06 (receivables helper); PLAT-01 (portal route security).
- Unblocks: CORE-16, CORE-17, CORE-04 step 2; LEAS check scanning and cash payments (resident payments block).

#### CORE-12 · Resident statements: report, bulk email, portal
- **MRI equivalent:** PMX Residential Management — Resident Statement Report, with one-time or recurring bulk email (X.5.6); Engage Connect online statements.
- **Status · priority · effort:** Missing · P1 · M
- **Refs:** Gap 3.2 · Inventory 3.53, 3.54, 4.13 · PMX-3.43, PMX-4.02

**Geiger today**
- There is no resident statement: the email catalog has only `owner_statement` (`lib/email/catalog.js:102-107`).
- The resident portal shows "Contact the office for a statement" when the ledger is hidden (`components/portal/resident/resident_payments.jsx:227`).
- These preferences are saved but never read:
  - tenant `statementDelivery` (`components/internal/screens/tenants/shared.js:88`)
  - household member `receivesStatements` (`:217`).
- The portal ledger exists (`lib/portal/resident.js:76-110`).
- geiger-dash's email library supports attachments (`C:\Pro\geiger-dash\lib\email\send.js:33, 114`), but its `/api/email/send` route drops them (`C:\Pro\geiger-dash\app\api\email\send\route.js:41`).

**What's missing** — Statement content, bulk and recurring sending, and portal access.

**How to build**
- *Server logic:*
  - Report definition `residentStatementReport` (key `resident_statement`) in `lib/reports/defs_operations.js`, added to `OPERATIONS_REPORTS`:
    - sources: ledger, leases, tenants, units, properties
    - filters: lease (or tenant) and range (default: last month)
    - content: header, opening balance, activity with running balance (`runningLedger('lease')`, `lib/ledger/postings.js:606`), closing balance, aging (`receivableAging`), amount due and due date, plan installments (CORE-14), deposits held, and how to pay (portal URL).
  - `lib/billing/statements.js` (server):
    - `buildStatement(admin, leaseId, { from, to })`, with the same math server-side using `loadLeaseReceivables`
    - `statementRecipients(lease)`: lease parties with `receivesStatements` (default: the primary tenant), excluding tenants whose `statementDelivery` is None. Mail-only tenants go to a print batch.
  - The HTML comes from `reportHtml` (`lib/reports/html.js:50`). PDF uses the renderer chosen by the LEAS lease-PDF item (gap 2.6); until then, HTML print.
- *Data model:* settings key `billing_settings.statements = { enabled, day: 5, onlyWithBalance: true, includeZero: false }`. No table: sends are logged in `notification_sends` (dedupe `stmt:<leaseId>:<YYYY-MM>:<email>`).
- *API routes / jobs:*
  - `POST /api/billing/statements/send` with `{ projectId, leaseIds | view, period }`
  - `GET /api/billing/statements/[leaseId]?period=` returns HTML
  - job `resident-statements` sends on the configured day (CORE-10)
  - portal `GET /api/portal/resident/statements` and `/[period]`.
- *Email:* new geiger-dash template `property.resident_statement` in `C:\Pro\geiger-dash\mails`: opening, charges, payments, closing, amount due, and a portal link. Add the catalog entry `resident_statement` (group `rent`, `live: true`).
- *UI:*
  - Rent Collection list: bulk action "Send statements" (selected rows or the current view, e.g. Owing).
  - Lease › Ledger and the rent account record: "Statement" (preview, print, email).
  - Resident portal: a "Statements" card listing months, shown even when the detailed ledger is hidden (new portal setting `portalShowStatements`, default true). It replaces the "Contact the office" notice.
- *Permissions:* `reports.export` (print), `billing.manage` (send and settings).
- No journal lines (read-only).

**Steps**
1. Add the report definition.
2. Add `statements.js`.
3. Add the routes and the job.
4. Add the template in geiger-dash.
5. Add the bulk action and portal card.
6. Add the settings UI under Settings › Fees & Policies (billing group).

**Research before building**
- What do peers include on resident statements (AppFolio, Buildium samples)? Must they be sent to every adult on the lease?
- Can the geiger-dash route take a small change to forward `attachments` (Resend format)? See open decision.

**Acceptance criteria**
- Closing balance = the lease AR balance at period end (`ledger_party_balances`).
- Opening + charges − payments/credits = closing.
- Aging buckets sum to the closing balance when it is positive; a credit shows "Credit on account".
- Bulk send to 50 leases sends once per recipient; re-running the same day sends nothing.
- Mail-preference tenants are excluded from email and listed in the print batch.
- Portal statement numbers equal the staff statement.

**Depends on / unblocks**
- Depends on: CORE-01, CORE-06, CORE-07.
- Unblocks: CORE-13 (final statement), CORE-21 (remittance coupon); LEAS SMS reminders.

**Open decisions**
- v1 email: a portal link only, or a PDF attachment (needs the small geiger-dash route change to forward `attachments`)?

#### CORE-13 · Move-out final accounting (SODA) and final statement
- **MRI equivalent:** PMX Residential Management — Statement of Deposit Accounting: damages, lease violations and accelerated rent; apply open credits; commit and revise; deposit statements for applicants too.
- **Status · priority · effort:** Partial · P1 · M
- **Refs:** Gap 3.3 · Inventory 3.58–3.60, 2b.80, 3.18 · PMX-3.25, PMX-3.26

**Geiger today**
- Itemized deductions work, including auto-add from the inspection comparison (`components/internal/screens/leasing/security_deposits.jsx:279-298`; `components/internal/screens/leasing/sections/inspection_sections.jsx:486-512`; `lib/leasing/workflows.js:390-398`).
- The disposition letter is a `.txt` file in the public bucket (`security_deposits.jsx:215-269`; `storeTextDocument`, `workflows.js:99-114`).
- The return deadline is tracked (`security_deposits.jsx:57-68`).
- Missing pieces:
  - no ledger postings (CORE-04)
  - no final statement, only wizard wording (`components/internal/screens/tenants/actions.js:209, 241`)
  - no final-month proration (CORE-02)
  - no way to apply unapplied credits to open items (inventory 3.29).

**What's missing** — One guided flow that closes the resident's account on the ledger and produces the statement and letter.

**How to build**
- *Server logic:* `lib/billing/move_out.js` `finalAccount(admin, leaseId, input, { commit })` orchestrates, with a preview when `commit` is false:
  1. Close out at the move-out date (CORE-02 `closeOutLease`).
  2. Post move-out charges:
     - deductions → `deposit:<depositId>:ded:<deductionId>:v<n>`
     - extra charges: damages, lease violation, cleaning and keys post as charges with the same key pattern
     - accelerated rent (optional, months × rent) → `soda:<depositId>:accel:<YYYY-MM>:v<n>`
     - the early-termination fee keeps `early-term:<leaseId>` (`lease_actions.jsx:425-439`).
  3. Apply unapplied credits (prepaid or overpayments) to open items with the new builder `buildCreditApplication`.
  4. Apply the deposit and interest (CORE-04 7b).
  5. Settle the result:
     - refund due → refund bill (CORE-04 7c)
     - balance owed → leave open, start a payment plan (CORE-14) or write off (CORE-15).
  6. Release the applied amount from the deposit bank (CORE-04 7e).
  7. Documents: a final statement (CORE-12 `buildStatement` from move-in to move-out, with a deposit section) plus the disposition letter. Email them to the forwarding email and flag "mail required" when there is none. Save to Documents (private storage per PLAT-01).
- *Commit/revise:*
  - `security_deposits.metadata.soda = { status: 'Draft'|'Committed', version, committedAt, committedBy }`.
  - Revise voids the version's entries with `ledger_void` and the refund bill, if it's unpaid, then reposts with `v<n+1>` keys.
  - Revising after the refund is paid is blocked; post adjustments instead.
- *Journal lines* (in addition to CORE-04's 7a–7e):

  | Event | Debit | Credit | Key | source_type |
  |---|---|---|---|---|
  | Accelerated rent | 1200 AR | 4000 Rental Income | `soda:<depositId>:accel:<YYYY-MM>:v<n>` | charge |
  | Apply an unapplied credit to an item | 1200 AR (`applies_to` the credit's entry; reverses its unapplied part) | 1200 AR (`applies_to` the open item) | `apply:<creditEntryId>:<itemEntryId>` | adjustment |

- *Applicant deposits (PMX-3.26):* once the LEAS item for application and holding fees (gap 2.10) posts holding deposits to 2120/2100, the same `finalAccount` flow handles an applicant who doesn't lease. Cross-reference only.
- *API routes:* `POST /api/billing/leases/[leaseId]/final-account` with `{ projectId, commit, version, charges, accelerate, refundMethod }`; `POST /api/billing/deposits/[id]/revise`.
- *UI:* a "Final account" wizard (`components/internal/shared/wizard_dialog.jsx` steps) on the lease (status Notice given, Terminated or Ended) and on the deposit record. It replaces the Return wizard (`security_deposits.jsx:447-492`). Steps:
  1. Move-out and proration preview
  2. Charges (deductions list plus add)
  3. Credits and deposit
  4. Result (refund / balance owed choice)
  5. Documents and send

  The wizard warns when past `returnDue`.
- *Permissions:* `accounting.post`; revising needs `accounting.void`.

**Steps**
1. Add `buildCreditApplication`.
2. Add `move_out.js` with preview and commit.
3. Add the routes.
4. Build the wizard.
5. Rebuild the letter on statement data.
6. Add the revise flow.

**Research before building**
- State deposit-itemization rules: deadlines, required wording, whether a mailed copy is required, and treatment of accelerated rent (some states restrict it). Use the `us-landlord-tenant-resources` skill and Legal Resources.
- How long must statements be retained?

**Acceptance criteria**
- Lease with rent 1,500, deposit 1,500 (held), an unapplied 100 credit, December billed in full on Dec 1 and unpaid, move-out Dec 10:
  - close-out credit 1,016.13 (December open 483.87)
  - deductions 400 (open 883.87)
  - the 100 credit applied (open 783.87)
  - deposit applies 783.87
  - refund bill 716.13.
- After paying the refund: lease AR 0, 2100 0, AP 0.
- The final statement closing balance is 0, and the letter lists the same figures as the ledger.
- Revise with an extra 50 deduction: v1 entries void, v2 posts, the deposit applies 833.87, and the refund bill becomes 666.13.
- Each step re-run posts nothing. Trial balance balances.

**Depends on / unblocks**
- Depends on: CORE-02, CORE-04, CORE-12; CORE-14 and CORE-15 for the optional settlement choices.
- Unblocks: LEAS unit transfers (2.11, transfer statement), LEAS application/holding fees (2.10).

#### CORE-14 · Payment plans (deferred payment agreements)
- **MRI equivalent:** PMX Residential Management — deferred payment agreements with deferred-rent and repayment charge codes, GL mapping and repayment projections.
- **Status · priority · effort:** Missing · P1 · L
- **Refs:** Gap 3.1 · Inventory 3.51 · PMX-3.36

**Geiger today** — Nothing exists (grep for payment plan, promise-to-pay, installment or repayment finds only the deposit-alternative label; inventory 3.51). Two consequences:
- Autopay charges the whole open balance (`lib/payments/autopay.js:316-416`).
- Late fees fire on any open charge (`lib/jobs/financial.js:292-294`).

A plan therefore needs AR to show only what is currently due.

**What's missing** — The agreement, installment schedule, ledger treatment, interaction with autopay and late fees, tracking, and default handling.

**Design** — PMX-style deferred receivable:
- On activation, the deferred amount moves from AR (1200) to 1210 Deferred Receivable.
- Each installment is re-billed to AR as it falls due.
- Autopay, late fees, delinquency, statements and the portal then see only what is due now.

**How to build**
- *Data model:* migration `payment_plans`:
  - `property.payment_plans`: standard columns plus `project_id`, `lease_id`, `tenant_id`, `property_id`, `unit_id`, `name`, `total_amount numeric(14,2)`, `down_payment numeric(14,2) default 0`, `installment_count int`, `frequency text check in ('Weekly','Biweekly','Monthly')`, `first_due date`, `status text check in ('Draft','Active','Completed','Defaulted','Cancelled')`, `grace_days int default 5`, `suspend_late_fees boolean default true`, `defer_entry_id uuid`, `agreement_document_id uuid`, `signed_on date`.
  - `property.payment_plan_installments`: standard columns plus `project_id`, `plan_id`, `seq int`, `due_date`, `amount numeric(14,2)`, `status text check in ('Scheduled','Billed','Paid','Missed')`, `charge_entry_id`; unique `(plan_id, seq)`.
  - The same migration redefines the view `property.ledger_party_balances` to add a trailing `deferred_receivable` column (subtype `deferred_receivable`), noting that ownership moves from `ledger_core`.
  - Uses account 1210 from CORE-01's chart migration.
- *Server logic:* `lib/billing/payment_plans.js`:
  - `createPlan` (draft with schedule)
  - `activatePlan`: defers the open items oldest-first up to total − down payment, after the down payment is recorded (CORE-11)
  - `billDueInstallments(admin, ctx, today)` (a `billing` job step)
  - `refreshPlanStatus`: Paid when an installment's charge has no open balance; Missed after due + grace
  - `defaultPlan` (accelerate)
  - `cancelPlan`.

  Supporting changes:
  - `summarize()` (`lib/ledger/postings.js:473-522`) gains a `deferred` bucket.
  - CORE-06 skips non-installment items while a plan is Active, in good standing and `suspend_late_fees` is on.
  - Policies: `lateFeeOnInstallments` (default false), `planDefaultAfterMissed` (default 1).
- *Journal lines:*

  | Event | Debit | Credit | Key | source_type |
  |---|---|---|---|---|
  | Activate (defer) | 1210 Deferred Receivable | 1200 AR (`applies_to` each deferred item) | `plan:<planId>:defer` | payment_plan |
  | Installment due | 1200 AR | 1210 | `plan:<planId>:inst:<seq>` (memo "Payment plan 3 of 6"; metadata `paymentPlanId`) | charge |
  | Default or cancel (remaining) | 1200 AR | 1210 | `plan:<planId>:accelerate` | payment_plan |

  Total assets don't change on deferral.
- *API routes:* `POST /api/billing/payment-plans` (create, or activate with `{ activate: true }`), `/[id]/cancel`, `/[id]/default`, `GET /[id]/agreement` (merged text).
- *UI:*
  - Lease › Ledger: "Set up payment plan" wizard.
    - Amount defaults to the past-due balance; then down payment, count, frequency and first due date.
    - A schedule preview table.
    - The agreement is merged from a `lib/leasing/merge.js` template and saved to Documents. E-sign goes through the LEAS e-signature adapter (geiger-docs).
  - A "Payment plan" section on the lease with installments and status.
  - Rent Collection view "On a plan".
  - The Delinquency report (`lib/reports/defs_operations.js:134-196`) adds a "Deferred (plan)" column.
  - Resident portal: plan schedule and next installment (`lib/portal/resident.js`).
- *Permissions:* new `accounting.payment_plans`.

**Steps**
1. Write the migration.
2. Add the plan service and the `billing` job step.
3. Add the summarize and view changes.
4. Add the late-fee skip.
5. Add the routes.
6. Build the wizard and section.
7. Add the portal view.
8. Add the report column.

**Research before building**
- Which states require offering a repayment plan before eviction for nonpayment, and on what terms (e.g. Washington RCW 59.18.630)? Use Legal Resources.
- Peer UX for promise-to-pay vs formal plans (AppFolio, Rent Manager).

**Acceptance criteria**
- Past due 1,800 (Sep 900, Oct 900). The plan takes a 300 down payment, then 5 × 300 monthly from Dec 1. After the down payment and activation:
  - AR 0, 1210 1,500
  - Delinquency shows 0 past due and 1,500 deferred.
- Dec 1 billing → AR 300 (+ December rent), 1210 1,200.
- Autopay charges 300 + rent, not 1,800.
- No late fee is charged on the Sep/Oct items.
- A January installment unpaid after grace → Missed → (policy 1) Defaulted → accelerate posts 1,200 to AR.
- Re-runs post nothing. Trial balance balances.

**Depends on / unblocks**
- Depends on: CORE-01, CORE-06, CORE-11; LEAS e-signature adapter (optional for v1: printed agreement).
- Unblocks: CORE-13 (settlement option); HOUS programs.

#### CORE-15 · Write-offs and bad-debt recovery
- **MRI equivalent:** PMX Residential Management — "write off open charges" (daily AR and month-end).
- **Status · priority · effort:** Partial · P2 · S
- **Refs:** Gap 3.4 · Inventory 3.52, 3.50 · PMX-3.35

**Geiger today**
- There is no write-off action. Staff post a generic credit against 5800 Bad Debt: the credit kind accepts Income or Expense accounts (`ledger_dialogs.jsx:59`; `buildCredit`, `lib/ledger/postings.js:244-259`).
- 5800 is in the default chart (`supabase/migrations/20261015212744_ledger_core.sql:494`).
- There is no recovery tracking and no collections export (inventory 3.50).

**How to build**
- *Server logic:*
  - Builders `buildWriteOff({ items:[{ entryId, amount }], reason })` and `buildRecovery`.
  - `lib/billing/write_offs.js`:
    - `writeOff(admin, leaseId, items, reason, actor)`
    - `recordRecovery(admin, paymentEntryId, amount)`: reinstate, then apply the payment's unapplied credit with CORE-13's `buildCreditApplication`.
  - Direct write-off method. An allowance method waits for CORE-40+ accruals (6.11).
- *Journal lines:*

  | Event | Debit | Credit | Key | source_type |
  |---|---|---|---|---|
  | Write-off | 5800 Bad Debt (property dims) | 1200 AR (`applies_to` each item) | `wo:<writeOffId>` (uuid per action) | write_off |
  | Recovery (reinstate) | 1200 AR | 5800 | `wo-recover:<paymentEntryId>` | write_off |
  | Apply the payment credit to the reinstated item | 1200 AR (`applies_to` the payment) | 1200 AR (`applies_to` the reinstated item) | `apply:<paymentEntryId>:<itemEntryId>` | adjustment |

- *API routes:* `POST /api/billing/leases/[leaseId]/write-off`, `POST /api/billing/payments/[entryId]/recovery`.
- *UI:*
  - Lease › Ledger open charges: multi-select, then a "Write off" wizard (reason: Uncollectible, Skip, Settlement, Bankruptcy, Deceased, Other; note; amount per item).
  - The Delinquency report gets a "Written off" view showing recoveries.
- *Permissions:* new `accounting.write_off` (inherits `view.accounting`).

**Steps**
1. Add the builders.
2. Add the service and routes.
3. Build the wizard.
4. Add the report view.

**Research before building**
- Rules for reporting written-off rent to collections or credit bureaus (FDCPA applies to agencies, not the landlord). Coordinate with the LEAS rent-reporting item.

**Acceptance criteria**
- Writing off two items totalling 700 posts Dr 5800 700 / Cr 1200 700; lease AR 0; Delinquency excludes the lease.
- The owner statement shows 700 bad debt for the property.
- A later 300 payment followed by a recovery posts Dr 1200 300 / Cr 5800 300 plus the application. Net 5800 = 400, AR = 0.
- A double submit posts nothing extra. Trial balance balances.

**Depends on / unblocks**
- Depends on: CORE-13 (`buildCreditApplication`), CORE-06.
- Unblocks: CORE-40+ accruals (6.11), reporting (7.1).

#### CORE-16 · Deposit batching and undeposited funds
- **MRI equivalent:** Engage Pay batch reconciliation reports; bank deposits in PMX Financials.
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gap 11.4 · Inventory 3.31, 6.58 · PMX-7.20

**Geiger today**
- No deposit batching exists (grep for deposit slip, undeposited or bank deposit finds nothing; inventory 3.31).
- Manual payments post straight to the chosen bank GL (`cashAccountFor`, `lib/supabase/ledger.js:309-318`).
- Online payments post gross to the settings bank (`lib/payments/posting.js:26-39`), while Stripe pays out net in batches. The `payout.paid` handler only stamps `online_payments.payout_id` (`lib/payments/fulfill.js:362-380`).
- Bank reconciliation clears individual lines (`setLinesCleared`, `ledger.js:400-420`). A 5,000 bank deposit made of 7 checks has no single matching ledger line.

**How to build**
- *Data model:* migration `bank_deposits`:
  - `property.bank_deposits`: standard columns plus `project_id`, `bank_account_id`, `deposit_date`, `total numeric(14,2)`, `item_count int`, `status check in ('Draft','Posted','Void')`, `ledger_entry_id`, `slip_number text`, `source check in ('manual','stripe_payout','lockbox')`, `external_id text`.
  - Unique index `(project_id, source, external_id) where external_id is not null`.
  - Add `ledger_lines.bank_deposit_id uuid` with an index. It is stamped on the 1050 debit line of each included payment, like `reconciliation_id`.
  - Account 1050 `undeposited_funds` comes from CORE-01's chart migration.
  - Setting `billing_settings.useUndepositedFunds` (default true) controls whether Check, Cash and Money order payments land in 1050 (CORE-11).
- *Server logic:* `lib/billing/bank_deposits.js`:
  - `undepositedItems(admin, projectId, { bankAccountId, propertyId })`
  - `createDeposit(admin, { itemLineIds, bankAccountId, date, slip })` checks that no line already has a `bank_deposit_id`
  - `voidDeposit`: `ledger_void` plus clearing the stamps.
- *Journal lines:*

  | Event | Debit | Credit | Key | source_type |
  |---|---|---|---|---|
  | Bank deposit | bank cash GL (`bank_account_id`), one line per property | 1050 Undeposited Funds, one line per payment (that payment's lease/tenant/property dims) | `bankdep:<bankDepositId>` | bank_deposit |
  | Void deposit | reversal via `ledger_void` | | | |

- *Stripe payouts (phase 2, behind setting `payments.settleViaPayouts`):*
  - Online payments post to 1050 instead of the bank.
  - Extend `handlePayout` (`lib/payments/fulfill.js:362-380`, which already walks the payout's balance transactions) to create a `stripe_payout` deposit from the stamped payments.
  - Stripe processing fees (Dr fee expense / Cr bank) need an owner-vs-manager decision.
- *API routes:* `GET /api/billing/bank-deposits/undeposited`, `POST /api/billing/bank-deposits`, `POST /api/billing/bank-deposits/[id]/void`, `GET /api/billing/bank-deposits/[id]/slip` (HTML).
- *UI:*
  - New screen Accounting › "Bank Deposits" (`components/internal/screens/accounting/bank_deposits.jsx`, registered in `components/internal/screens/registry.jsx` and the sidebar): undeposited list with filters, then "Create deposit" (date, bank, slip #), deposit detail and a printable slip.
  - Bank Reconciliation (`components/internal/screens/accounting/bank_reconciliation.jsx`) groups lines by deposit and clears a deposit as one line.
  - The Check register report (`lib/reports/defs_financial.js` `checkRegisterReport`) shows deposits grouped.
- *Permissions:* `accounting.post`; void needs `accounting.void`.

**Steps**
1. Write the migration.
2. Route Check, Cash and Money order payments to 1050 in CORE-11.
3. Add the service and routes.
4. Build the screen.
5. Add reconciliation grouping.
6. Stripe payouts (phase 2).

**Research before building**
- How Stripe payouts map to balance transactions (`GET /v1/balance_transactions?payout=`, https://docs.stripe.com/payouts/reconciliation).
- Whether connected-account fees should be booked per property or per manager.

**Acceptance criteria**
- Checks of 1,000, 1,200 and 800 recorded: 1050 = 3,000, bank unchanged.
- Creating a deposit posts Dr bank 3,000 / Cr 1050 3,000 (lines per payment); 1050 = 0.
- Bank reconciliation matches one 3,000 statement line.
- Trust positions per property are unchanged in total.
- A payment can't join two deposits (server rejects).
- Voiding the deposit restores 1050 to 3,000.
- Trial balance balances.

**Depends on / unblocks**
- Depends on: CORE-01 (account 1050), CORE-11.
- Unblocks: CORE-17, CORE-21; CORE-40+ bank feeds (11.2) and checks (6.4); LEAS check scanning and cash payments.

**Open decisions**
- Turn on Stripe-payout deposits (phase 2), and if so, who bears Stripe processing fees in the books: the owner's property or the manager?

#### CORE-17 · NSF fee and flags on returned manual payments
- **MRI equivalent:** PMX Residential Management — "process NSF reversals of payments" (an automatic NSF fee isn't documented).
- **Status · priority · effort:** Partial · P2 · S
- **Refs:** Gap 11.8 · Inventory 3.41, 3.43, 3.44 · PMX-3.14

**Geiger today**
- A returned manual payment can only be voided (`VoidEntryDialog`, `ledger_dialogs.jsx:366-430`).
- Online returns do much more: void, NSF fee, tenant flag, certified-funds switch and autopay pause (`lib/payments/fulfill.js:93-144`; `lib/payments/posting.js:120-160, 268-283`).
- The tenant `nsfCount` field is never read (`components/internal/screens/tenants/shared.js:103`); the webhook writes `metadata.returnedPayments` instead.

**How to build**
- *Server logic:*
  - Move `postNsfFee` and `flagTenantReturn` (`posting.js:134-160, 269-283`) into `lib/billing/returns.js`, taking `{ projectId, leaseId, tenantId, unitId, propertyId, ref }` so online and manual returns share them.
  - New `processReturnedPayment(admin, paymentEntryId, { returnedOn, reason, chargeFee })`:
    1. Void the payment (`ledger_void`), which re-opens its charges.
    2. If the payment was already in the bank (a direct-to-bank payment, or a 1050 line with `bank_deposit_id`), post the bank correction below. The void moved the money back to 1050; this moves the shortfall to the bank.
    3. Charge the NSF fee (policy `nsfFee`, `lib/policies.js:45`).
    4. Flag the tenant (`returnedPayments` + 1; certified funds at the `certifiedAfterReturns` threshold).
    5. Emit `payment.returned`.
- *Journal lines:*

  | Event | Debit | Credit | Key | source_type |
  |---|---|---|---|---|
  | Reverse payment | `ledger_void` mirror (re-opens charges) | | | payment |
  | Bank correction (deposited payment) | 1050 Undeposited Funds | bank cash GL (`bank_account_id`) | `nsf-bank:<paymentEntryId>` | adjustment |
  | NSF fee | 1200 AR | 4100 Other Income | `nsf:<paymentEntryId>` | charge |

- *API routes:* `POST /api/billing/payments/[entryId]/return`.
- *UI:*
  - `LedgerView` payment rows (manual only; online returns come from the webhook) get "Returned (NSF)…": a wizard with returned date, reason (NSF, account closed, stop payment) and a "Charge NSF fee" switch defaulting from policy.
  - Tenant "Returned payments" shows `returnedPayments`, read-only, replacing `nsfCount`.
- *Permissions:* `accounting.void`.

**Steps**
1. Refactor the shared helpers.
2. Add `processReturnedPayment` and the route.
3. Build the wizard.
4. Fix the tenant field.

**Research before building**
- State caps on NSF fees (many states set a maximum returned-check fee). Feeds the `nsfFee` hint and CORE-20 jurisdiction values.

**Acceptance criteria**
- A deposited 1,000 check is returned:
  - AR re-opens 1,000 plus a 35 fee
  - bank −1,000, 1050 net 0
  - `returnedPayments` = 1.
- At threshold 2, the next manual personal check is blocked (CORE-11).
- A re-run posts nothing. Trial balance balances.

**Depends on / unblocks**
- Depends on: CORE-11, CORE-16.
- Unblocks: LEAS payments safeguards.

#### CORE-18 · Amenity reservation fees and deposits on the ledger
- **MRI equivalent:** PMX Residential Management — amenity fees "assessed either at the time of reservation or at the time that the reservation is approved"; deposits; fees "added to the resident ledger" (X.5.9).
- **Status · priority · effort:** Saved-unused · P2 · S
- **Refs:** Gap 3.5 · Inventory 4.58 · PMX-3.07, PMX-3.08

**Geiger today** — The fee and deposit are copied from the amenity onto the reservation (`components/internal/screens/amenities/shared.js:206-208, 225-226`) and never posted. Reservations are staff-created, with status `requested` or `approved` (`:227`); there is no portal booking.

**How to build**
- *Data model:* amenity `metadata`: `feeGlAccountId` (default 4100), `chargeOn` (`approval` | `reservation`), `cancelFreeHours`. Reservation `metadata.ledger = { feeEntryId, depositEntryId, settledEntryId }`.
- *Server logic:* `lib/billing/amenities.js`:
  - `chargeReservation`, `releaseDeposit`, `forfeitDeposit`, `cancelReservation` (voids the fee and deposit inside the free-cancel window).
  - Lease lookup: the tenant's live lease for the reservation's unit; otherwise tenant-only dimensions.
  - Account 2120 `other_deposits` keeps amenity deposits out of security-deposit interest.
- *Journal lines:*

  | Event | Debit | Credit | Key | source_type |
  |---|---|---|---|---|
  | Fee | 1200 AR | fee GL (4100) | `amenity:<reservationId>:fee` | charge |
  | Deposit | 1200 AR | 2120 Other Deposits Held | `amenity:<reservationId>:deposit` | deposit_held |
  | Release (no damage) | 2120 | 1200 AR (credit) | `amenity:<reservationId>:release` | deposit_return |
  | Forfeit (damage) | 2120 | 4100 | `amenity:<reservationId>:forfeit` | deposit_return |
  | Cancel | `ledger_void` of fee/deposit | | | |

- *API routes:* `POST /api/billing/amenity-reservations/[id]/(charge|release|forfeit|cancel)`.
- *UI:*
  - Reservation approve and create call `charge` per `chargeOn`.
  - The reservation drawer shows the ledger status with Release / Forfeit actions.
  - Amenity settings expose the fee GL and `chargeOn`.
- *Permissions:* `accounting.post`.

**Steps**
1. Add the service and routes.
2. Hook approve and create.
3. Add the drawer actions.
4. Add the amenity settings fields.

**Research before building** — When resident portal booking arrives (LEAS resident experience), should the fee be collected online at booking (Stripe checkout)?

**Acceptance criteria**
- Approving a reservation with a 50 fee and 200 deposit posts two entries.
- Release → 2120 = 0 and AR shows a 200 credit. Forfeit instead → 4100 +200.
- Cancelling inside the window reverses both.
- The deposit-interest job ignores 2120.
- Re-runs post nothing. Trial balance balances.

**Depends on / unblocks**
- Depends on: CORE-01 (account 2120), CORE-04 (pattern).
- Unblocks: LEAS resident portal booking.

#### CORE-19 · Second late fee and late-fee count
- **MRI equivalent:** PMX Residential Management — late fee 1 and late fee 2 count toward "the resident's total late fee count"; late fee 2 can carry legal or admin fees (X.5.3).
- **Status · priority · effort:** Partial · P3 · S
- **Refs:** Gap 3.9 · Inventory 3.20, 3.21 · PMX-3.32

**Geiger today** — One late-fee rule per policy level (`lib/policies.js:26-44`), and no count.

**How to build**
- *Data model:* new policies in the rent group:
  - `lateFee2Enabled`
  - `lateFee2DaysLate` (default 15)
  - `lateFee2Type` (flat | percent)
  - `lateFee2Amount`
  - `lateFee2GlAccountId` (default `late_fee_income`, or Other Income for admin/legal fees)
  - `lateFee2CountsTowardTotal`
  - `maxLateFeeTotal` (a combined cap for state limits).
- *Server logic:*
  - `assessLateFees` (CORE-06) posts the second fee when `daysLate ≥ lateFee2DaysLate` and the period's rent is still open.
  - `lateFeeCount(leaseId, months = 12)` in `lib/billing/receivables.js` counts distinct periods with a non-void `late:` entry (plus `late2:` when it counts).
- *Journal lines:*

  | Event | Debit | Credit | Key | source_type |
  |---|---|---|---|---|
  | Second late fee | 1200 AR | `lateFee2GlAccountId` | `late2:<leaseId>:<YYYY-MM>` | late_fee |

- *UI:* the count appears in the lease and tenant headers and on the Rent Collection row. Expose it as automation condition field `late_fee_count` (`lib/automations/catalog.js`) and in LEAS bulk-renewal screening columns.
- *Permissions:* none new.

**Steps**
1. Add the policies.
2. Add the job step.
3. Add the count helper.
4. Show the count in the UI and the automation field.

**Research before building** — State rules on stacking late fees (a single fee per period in some states); set `maxLateFeeTotal` hints.

**Acceptance criteria**
- Rent unpaid on day 16 → one `late2` entry of the configured amount; re-run none.
- With rent paid before day 15, no `late2`.
- The count = 3 after late fees in three of the last 12 months.
- The combined cap holds. Trial balance balances.

**Depends on / unblocks**
- Depends on: CORE-06.
- Unblocks: LEAS bulk renewals (screening signal); RISK.

#### CORE-20 · Calculated deposits to meet legal caps
- **MRI equivalent:** PMX Residential Management — calculated deposits ("calculate security deposit amounts based on weekly or monthly rent", restricting variable amounts for legal requirements, X.5.6).
- **Status · priority · effort:** Missing · P3 · S
- **Refs:** Gap 3.10 · Inventory 8.9 · PMX-3.28, PMX-8.16

**Geiger today**
- Policy `depositRule` is `one_month` or `fixed`, used only as a default (`lib/policies.js:87-99`).
- Nothing checks a deposit against a cap.
- Legal jurisdictions store citations and summaries but no numeric rules (`supabase/migrations/20261019184635_legal_resources.sql:22-43`).

**How to build**
- *Data model:*
  - `depositRule` gains `multiple`, with `depositMultiple` (e.g. 1.5) and `depositRounding`.
  - New property-scope policies: `depositCapMonths`, `depositCapIncludesPet`, `enforceDepositCap` (warn | block).
  - Jurisdiction values go in `legal_jurisdictions.metadata.depositRules = { capMonths, returnDays, interestRequired, sourceUrl, reviewedAt }`, filled by the `us-landlord-tenant-resources` research skill. The cap prefills from the property's state.
- *Server logic:* `calcDeposit(policies, rent)` and `checkDepositCap(lease, policies)` in `lib/billing/deposits.js`. They run on:
  - application conversion (`components/internal/screens/marketing/flows.js:215`)
  - lease create and save
  - activation (CORE-01).
- *UI:* the deposit field shows "Cap: 1 × rent ($2,500)" with a warning or block; Fees & Policies shows the jurisdiction source link.
- *Permissions:* `settings.manage` to change caps.
- No journal lines.

**Steps**
1. Add the policies.
2. Add `calcDeposit` and `checkDepositCap`.
3. Add the jurisdiction metadata and research data.
4. Add UI validation.

**Research before building**
- Per-state deposit caps, including small-landlord exceptions (e.g. California's 2024 cap change), plus return deadlines and interest requirements. Use the `us-landlord-tenant-resources` skill and verify against statutes.
- Coordinate field names with the HOUS rent-increase-cap item so both read one jurisdiction rule store.

**Acceptance criteria**
- A property in a state capped at 1 × rent, with rent 2,500 and deposit 3,000: warn or block per setting.
- The `multiple` rule at 1.5 proposes 3,750 when uncapped.
- Pet deposit counts toward the cap only when `depositCapIncludesPet` is on.

**Depends on / unblocks**
- Depends on: CORE-04.
- Unblocks: HOUS rent-increase caps (shared jurisdiction rule store).

#### CORE-21 · Lockbox payment import
- **MRI equivalent:** PMX Residential Management — RM Lockbox payment processing across properties (functional specifications).
- **Status · priority · effort:** Missing · P3 · M
- **Refs:** Gap 3.11 · Inventory 3.31

**Geiger today** — No lockbox import and no remittance code per lease (inventory 3.31).

**How to build**
- *Data model:*
  - Lease `metadata.remitCode`: a short code unique per project, printed on statements (CORE-12) as a remittance coupon.
  - Migration `lockbox_imports`: table `property.lockbox_imports` with standard columns plus `project_id`, `bank_account_id`, `file_name`, `file_hash text`, `deposit_date`, `status check in ('Review','Posted','Void')`, `row_count`, `matched_count`, `bank_deposit_id`. Unique `(project_id, file_hash)`. Parsed rows live in `metadata.rows[]` (lockbox volume at 10–500 units is small).
- *Server logic:* `lib/billing/lockbox.js`:
  - `parseLockboxFile` (CSV first, with a column-mapping preset per bank; BAI2 later)
  - `matchRows`: by remit code, then by tenant name and amount
  - `postImport`: one payment per matched row, posted directly to the bank because the bank already deposited it, plus one `bank_deposits` row (`source = 'lockbox'`, CORE-16) for reconciliation.
  - Unmatched rows stay unposted until staff assign them.
- *Journal lines:*

  | Event | Debit | Credit | Key | source_type |
  |---|---|---|---|---|
  | Matched lockbox payment | bank cash GL (`bank_account_id`) | 1200 AR (oldest-first `applies_to`) | `lockbox:<fileHash>:<row>` | payment |

- *API routes:* `POST /api/billing/lockbox` (upload and parse), `POST /api/billing/lockbox/[id]/post`, `POST /api/billing/lockbox/[id]/void`.
- *UI:* the Bank Deposits screen (CORE-16) gets an "Import lockbox file" review table (matched / unmatched, assign lease, post).
- *Permissions:* `accounting.post`.

**Steps**
1. Generate remit codes.
2. Add the coupon on statements.
3. Write the migration.
4. Add the parser and matcher.
5. Add the posting and `bank_deposits` link.
6. Build the review UI.

**Research before building**
- Lockbox file formats from banks small PMs use: CSV exports, BAI2 (https://www.bai.org/), X9.37 image files.
- Do target customers (10–500 units) use lockbox at all, or rely on online payments and check scanning (LEAS)? Validate before building.

**Acceptance criteria**
- Importing 10 rows (9 matched) posts 9 payments and 1 bank deposit grouping.
- Re-importing the same file is rejected by `file_hash` and posts nothing.
- After assigning the unmatched row, posting it adds one entry.
- Bank reconciliation matches the lockbox deposit total. Trial balance balances.

**Depends on / unblocks**
- Depends on: CORE-11, CORE-12, CORE-16.
- Unblocks: —


---

## Part B — Accounting, reporting and commercial depth

### Scope
- **MRI products covered:** PMX Financials / General Ledger (period close, JE tools, recurring entries, accruals), AP Automation (Nexus; AvidInvoice in the US), MRI Vendor Pay (AvidXchange: ACH, check, virtual card, positive pay), check processing, 1099 processing, Budgeting & Forecasting, Job Cost, Report Builder / Report Design / Rapid Reports / Report Gateway, Enterprise Ledger (entities, inter-entity), PMX Commercial Management (recoveries), Advanced Retail (percentage rent). Also the probable PMX features 11.2, 11.3, 11.5 and 11.9.
- **Geiger areas touched:** `lib/ledger/*`, `lib/supabase/ledger.js` and new data layers, `lib/reports/*`, `lib/jobs/*`, `components/internal/screens/{accounting,reports,overview,properties,leasing,owners,vendors,portfolios}/`, `lib/portal/{owner,vendor}.js`, `lib/email/client.js`, and new `lib/payments/outbound/*`, `lib/banking/*`, `lib/pdf/*`, `lib/export/*`, `lib/approvals/*`, `lib/commercial/*`. One small change goes outside this repo: geiger-dash `/api/email/send` must forward attachments (CORE-57).

**Rules for every item (not repeated per item)**
- **New tables:**
  - Scaffold with `npm run db:new -- <name> --template table`.
  - Include the standard columns plus `project_id uuid references public.projects(id) on delete cascade`.
  - Use demo-open RLS (the current convention) until PLAT-01 tightens it.
  - Write an `@down` for every migration.
  - Before scaffolding, check the name is free in the live DB with `select to_regclass('property.<name>')`. About 80 orphan tables remain from a deleted branch. The names proposed below were picked to be specific, but none has been checked against the live DB.
- **System GL accounts:** later items need new system accounts. CORE-40 adds one generic RPC, `property.ledger_ensure_accounts`, plus a JS list in `lib/ledger/chart.js`. Items then declare accounts in JS instead of each one redefining `ledger_ensure_default_chart` (owned by `20261015212744_ledger_core.sql:453-528`). Planned accounts:

  | Account | Name | Type | Subtype | Added by |
  |---|---|---|---|---|
  | 3900 | Retained Earnings | Equity | equity | CORE-40 |
  | 3950 | Opening Balance Equity | Equity | equity | INTL-04 (added 2026-11-08; CORE-46 reuses) |
  | 5910 | Bank & Payment Fees | Expense | expense | CORE-50, CORE-51 |
  | 4110 | Parking Income | Income | income | CORE-60 |
  | 4120 | Storage Income | Income | income | CORE-60 |
  | 1300 | Due From Entities | Asset | other_asset | CORE-65 |
  | 2400 | Due To Entities | Liability | other_liability | CORE-65 |
  | 2050 | Accrued Liabilities | Liability | other_liability | CORE-66 |
  | 2300 | Retainage Payable | Liability | payable | CORE-67 |
  | 4060 | Percentage Rent | Income | income | CORE-68 |
  | 1050 | Undeposited Funds | Asset | cash | CORE-01 (added 2026-11-08) |
  | 1210 | Deferred Receivable | Asset | receivable | CORE-01 (added 2026-11-08) |
  | 2120 | Other Deposits Held | Liability | other_liability | CORE-01 (added 2026-11-08) |
  | 1220 | Housing Assistance Receivable | Asset | subsidy_receivable | HOUS-01 (added 2026-11-08) |
  | 4055 | HAP Abatements | Income | contra_income | HOUS-01 (added 2026-11-08) |
- **Ledger source types:** no item adds a `source_type`. The check constraint at `ledger_core.sql:73-76` stays as it is. New postings reuse `adjustment`, `bill_payment`, `distribution` or `charge`, with `metadata.kind` for the detail.
- **Ledger correctness:** every posting goes through `ledger_post` with an idempotency key. "Trial balance balances" means the Trial Balance report shows **Balanced** and the `property.ledger_unbalanced_entries` view (`ledger_core.sql:611-618`) returns no rows.
- **Money movement:** anything that moves money (CORE-51 to CORE-55) must run server-side with the service-role client (`lib/supabase/admin.js`). It is **blocked on PLAT-01**, because today ledger RPCs are granted to `anon` (`ledger_core.sql:623-626`) and RLS is open.

### Summary

| ID | Feature | MRI product | Geiger today | Priority | Effort |
|---|---|---|---|---|---|
| CORE-40 | Period close, lock dates, fiscal-year roll | PMX Financials (month-end) | Done | P2 | M |
| CORE-41 | Server-side ledger aggregates and Report Library hub | Report Gateway (favorites, library) | Done | P2 | M |
| CORE-42 | Export any list or report to Excel | PMX core (export from any list) | **Done** — not yet opened in real Excel (2026-11-08) | P2 | S |
| CORE-43 | Portfolio as a report dimension; consolidated statements | PMX Financials (GL consolidation) | Done | P2 | S |
| CORE-44 | Comparative, 12-month and budget-vs-actual statements | PMX Financials report library | Done | P2 | M |
| CORE-45 | Standard report library expansion (about 17 reports) | PMX 500+ standard reports | Partial | P2 | L |
| CORE-46 | Journal entries: import, export, copy, reverse, line dimensions | PMX Financials (JE import/copy) | Done | P2 | M |
| CORE-47 | Approval engine (bills, payment runs, budgets, JEs, POs) | AP approvals / Workflow Design / B&F approvals | Partial | P2 | L |
| CORE-48 | Recurring journal entries and recurring bills | PMX Financials (Job Cost recurring templates) | Missing | P2 | M |
| CORE-49 | AP entry: split lines, attachments, duplicate check, bills inbox | AP Automation / AvidInvoice | Missing | P2 (inbox P3) | L |
| CORE-50 | Bank statement import, bank feeds, auto-matching | REdirect partner automation | Missing | P2 | L |
| CORE-51 | Outbound-payments adapter and payee accounts | MRI Vendor Pay (AvidXchange) | Missing | P2 | L |
| CORE-52 | Vendor payment runs (ACH, check, virtual card) and positive pay | MRI Vendor Pay | Missing | P2 | L |
| CORE-53 | Check printing (MICR, signature images) | PMX check processing | Missing | P2 | M |
| CORE-54 | Owner payouts and batch distribution runs | None found in PMX residential | Missing | P2 | M |
| CORE-55 | 1099-NEC/MISC with owner 1099s, forms, IRIS e-file | PMX 1099 processing | Partial | P2 | L |
| CORE-56 | Budget versions, reforecasts, scenarios, approvals, workbook | Budgeting & Forecasting | Partial | P2 | L |
| CORE-57 | Report packets: native PDF, attachments, owner packets | Report Gateway packets and batches | Partial | P2 | M |
| CORE-58 | Custom report builder | Report Builder / Rapid Reports | Missing | P2 | L |
| CORE-59 | Role-based dashboards | RM role pages, Home Hubs | Partial | P2 | M |
| CORE-60 | Rentable items (parking, storage, garages) | PMX RM rentable items | Missing | P2 | M |
| CORE-61 | Commercial recoveries: CAM estimates, caps, base years, gross-up | PMX Commercial Management | Partial | P2 | L |
| CORE-62 | Commercial rent escalations (CPI and fixed) | Commercial Management / CPI Manager | Partial | P2 | S |
| CORE-63 | Ownership entities above the property | Enterprise Ledger | Missing | P2 | L |
| CORE-64 | Markets, sub-markets, regional managers | PMX RM markets | Missing | P3 | S |
| CORE-65 | Inter-entity due-to/due-from and eliminations | Enterprise Ledger | Missing | P3 | M |
| CORE-66 | Accruals with auto-reversal; accrue unapproved bills | PMX Financials (X5 accruals) | Missing | P3 | S |
| CORE-67 | Job cost depth: cost codes, commitments, change orders, retainage, draws | Job Cost | Partial | P3 | L |
| CORE-68 | Percentage rent and tenant sales reporting | Advanced Retail | Missing | P3 | M |

### Build order

**Notation:** `PLAT-03–04 (gap 9.1)` names the item(s) that own a gap; the gap → item table in `README.md` resolves any bare gap number.

1. **CORE-40 Period close.** Lock dates guard every later posting feature. It also adds `ledger_ensure_accounts`, which later items use.
2. **CORE-41 Aggregates and Report Library.** Stops paging the whole ledger into the browser (inventory 7.31). It is the base for 43, 44, 45, 56, 58 and 59.
3. **CORE-42 Excel export.** A shared xlsx writer, reused by 44–46, 56 and 58.
4. **CORE-43 Portfolio dimension, then CORE-44 Comparative statements, then CORE-45 Report library.** Pure reporting on top of 41.
5. **CORE-46 JE import/export/copy.** Self-contained. It also covers opening balances for conversions, alongside PLAT-03–04 (gap 9.1).
6. **CORE-47 Approval engine.** Must exist before 48 (recurring bills route through it), 52/54 (payment runs) and 56 (budget approvals). COMM-14–15 (gap 5.1) purchase orders use it too.
7. **CORE-48 Recurring entries.** Needs CORE-10 (crons actually scheduled) and 47.
8. **CORE-49 AP entry.** Fixes bill posting (due date, per-line property) before payment runs read it. Needs CORE-09 (work-order bills to AP) so all bills share one posting path.
9. **CORE-50 Bank import and feeds.** Matching reads deposit batches from CORE-16. Positive pay and payment status reconcile against it later.
10. **CORE-51 Outbound adapter, then CORE-52 Vendor runs, then CORE-53 Checks, then CORE-54 Owner payouts.**
    - One adapter serves all three.
    - All are blocked on PLAT-01.
    - 54 also needs CORE-08, because co-owner trust positions must be right before money moves.
11. **CORE-55 1099.** Reads payment rails written by 52–54. Owner 1099s need CORE-08.
12. **CORE-56 Budgets, then CORE-57 Packets, then CORE-58 Builder, then CORE-59 Dashboards.**
    - 57 reuses the PDF renderer that 53 introduces (or introduces it, if 57 comes first).
    - 59 needs CORE-07 (dashboards read the ledger).
13. **CORE-60 Rentable items.** Needs CORE-03 (recurring charges bill correctly) and CORE-02 (billing stops at move-out). Amendment documents come from LEAS.
14. **CORE-61 Recoveries, then CORE-62 Escalations.** 62 extends CORE-01's rent-schedule application.
15. **CORE-63 Entities.** Needs CORE-08's decision on how co-owned postings are tagged.
16. **P3:** CORE-64, then CORE-65 (needs 63), then CORE-66 (needs 40), then CORE-67 (needs 47 and COMM-14–15 (gap 5.1)), then CORE-68 (needs the COMM commercial tenant portal for self-reported sales).

### Items

#### CORE-40 · Period close, lock dates and fiscal-year roll
- **MRI equivalent:** PMX Financials month-end processing. It closes periods so nothing posts into them, and rolls the year into retained earnings. The Agora reconciliation agent (PMX-10.04) is AI and deferred.
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gap 6.1 · Inventory 6.12, 6.13, 6.16, 6.17 · PMX-6.52, PMX-10.04

**Geiger today**
- Any date can be posted:
  - `ledger_post` (current body in `supabase/migrations/20261015212915_ledger_post_line_dimensions.sql`) has no date guard.
  - `ledger_void` dates the reversal `greatest(p_date or today, original)` (`20261015212744_ledger_core.sql:415`).
- The trial-balance opening balance runs from inception (`lib/reports/ledger_math.js:36-77`).
- The balance sheet shows all-time income − expense as "Current earnings" (`ledger_math.js:155-196`, label at :176). There is no retained-earnings account in the default chart (`ledger_core.sql:465-495`).
- Fiscal-year start is saved but never read:
  - property `banking.fiscalYearStart` (`components/internal/screens/properties/sections/property_tabs.jsx:181`)
  - portfolio `targets.fiscalYearStart` (`components/internal/screens/portfolios/sections.jsx:321`)
- Health checks exist, but only on the client (`lib/ledger/postings.js:650-677`). The SQL views have no reader (`ledger_core.sql:561-618`).

**What's missing**
- Lock date per project (close through a month-end), with reopen and an audit of who did it.
- A month-end checklist.
- Fiscal-year-aware retained earnings on the balance sheet.
- A year-end close that rolls prior years into retained earnings.

**How to build**
- *Data model* (migration `accounting_periods`):
  - **Table `property.accounting_periods`:**
    - `period_start date`, `period_end date`
    - `kind text check (kind in ('month','year'))`
    - `status text check (status in ('closed','reopened'))`
    - `closed_at`, `closed_by uuid`, `closed_by_name`, `reopened_at`, `reopened_by`, `reopen_reason`
    - `checklist jsonb` (snapshot of check results)
    - Unique `(project_id, period_start, kind)` where `deleted_at is null`.
  - **Function** `property.ledger_locked_through(p_project uuid) returns date`: the latest `period_end` where `status='closed'` (closes are contiguous by rule).
  - **Trigger `ledger_entries_period_lock`** (BEFORE INSERT OR UPDATE on `ledger_entries`):
    - On insert: raise `'ledger: period closed through %'` when `new.entry_date <= locked_through(new.project_id)`.
    - On update: raise only when `entry_date`, `total` or a dimension column changes on a locked row. Status, `voided_at` and metadata may change, because `ledger_void` marks the original void (`ledger_core.sql:441-444`).
  - **Trigger `ledger_lines_period_lock`** (BEFORE INSERT/UPDATE/DELETE on `ledger_lines`):
    - Same date rule.
    - On update, block changes to `gl_account_id`, `debit`, `credit`, `entry_date`, the dimensions or `deleted_at`.
    - Allow `cleared`, `cleared_on`, `reconciliation_id` and `metadata`, because bank reconciliation must still clear old lines (`lib/supabase/ledger.js:400-420`).
  - **Function** `property.ledger_ensure_accounts(p_project_id uuid, p_accounts jsonb) returns integer`. It has the same adopt-or-insert semantics as `ledger_ensure_default_chart` (`ledger_core.sql:496-516`) for `[{system_key, number, name, account_type, subtype, is_trust, parent_key}]`. Grant it like the other ledger RPCs.
  - No closing entries. Year-end is a "virtual" close: lock the year and compute retained earnings in reports. 3900 Retained Earnings holds only imported or adjusted opening equity.
- *Server logic:*
  - `lib/ledger/chart.js` (new):
    - `EXTRA_SYSTEM_ACCOUNTS` (the table in Rules above, starting with `retained_earnings` 3900)
    - `ensureExtraAccounts(sb, projectId, keys)`
  - `lib/ledger/store.js` `loadAccountIndex` (:44-53): after the default chart, call `ledger_ensure_accounts` when a requested extra key is missing.
  - `lib/ledger/periods.js` (new, pure):
    - `fiscalYearOf(date, startMonth)`
    - `fiscalYearRange(date, startMonth)`
    - `firstOpenDate(lockedThrough)`
  - `lib/reports/ledger_math.js` `balanceSheet(lines, accounts, asOf, { fyStart })` splits earnings into "Retained earnings (prior years)", which is the 3900 balance plus I−E before the fiscal-year start, and "Current year earnings".
  - `lib/supabase/accounting_periods.js` (new data layer):
    - `listPeriods`
    - `getLockedThrough` (cached like the account cache at `ledger.js:43-66`)
    - `closePeriod({ periodEnd, checklist })`
    - `reopenPeriod(id, reason)`
  - `lib/supabase/ledger.js` `post()` (:321-343): if `enriched.date <= lockedThrough`, fail with a readable message before calling the RPC.
  - `lib/accounting/close_checks.js` (new). Each check runs per period and returns `{ key, label, ok, count, link }`:
    - unbalanced entries (`ledger_unbalanced_entries`)
    - lines missing a GL account
    - negative trust positions (`diagnose`)
    - bank accounts without a finalized reconciliation for the period end (`bank_reconciliations`)
    - bills pending approval dated in the period
    - management fees posted (`mgmt:<property>:<YYYY-MM>` keys, `lib/jobs/financial.js:392`)
    - recurring entries processed (CORE-48)
    - undeposited funds (CORE-16)
  - Fiscal-year start: a company setting `accounting_settings.fiscalYearStartMonth` (the same settings key `bills.jsx:80` uses).
- *API routes / jobs:* none. Jobs (`lib/jobs/financial.js` `postOnce` :117-126) must catch the lock error, record it in `result.errors` and skip without retrying.
- *UI:*
  - New "Close Periods" view inside the General Ledger screen (`components/internal/screens/accounting/general_ledger.jsx`): a header action "Close period".
  - The close wizard (`components/internal/shared/wizard_dialog.jsx`) has three steps:
    1. pick the month (the next unclosed one only)
    2. the checklist, where each failing check links to its screen and can be overridden with a note
    3. confirm
  - A history table with Reopen (asks for a reason).
  - The JE, Post and void dialogs (`ledger_dialogs.jsx`) default the date to `firstOpenDate` and show "Books closed through …".
  - Settings → Fees & Policies (or a new "Accounting" card in Company Profile): a fiscal-year start month.
- *Permissions:* add `accounting.close` ("Close and reopen periods", group Accounting controls, inherits `view.accounting`) to `lib/rbac.js:4-15`.
- *Integrations:* none.

**Steps**
1. Migration: `accounting_periods`, `ledger_locked_through`, both triggers and `ledger_ensure_accounts` (all `create or replace`, plus an `@down`).
2. `lib/ledger/chart.js` and the `loadAccountIndex` hook; seed `retained_earnings`.
3. `lib/ledger/periods.js`; then the `balanceSheet` split and `trialBalance` option `{ fyStart }`, so income and expense opening balances reset at the fiscal-year start.
4. `lib/supabase/accounting_periods.js`, plus the pre-check in `post()`.
5. `close_checks.js`, the close wizard and the history UI.
6. Make jobs tolerate lock errors.
7. Wire the fiscal-year setting; hide the property and portfolio `fiscalYearStart` fields (see Open decisions).

**Research before building**
- Confirm Postgres trigger order: the deferred balance trigger (`ledger_core.sql:288-291`) and the new BEFORE triggers must not conflict when `ledger_void` inserts and updates in one transaction.
- See how AppFolio, Buildium and Rent Manager present "close period" and retained earnings. This confirms that a virtual close is enough for 10–500 unit managers and their owners' CPAs.

**Acceptance criteria**
- Close March: posting a JE dated 2027-03-15 fails in the dialog and also through a direct `ledger_post` RPC call.
- Voiding a February entry posts its reversal in an open period; February's statements are unchanged.
- Reconciling a bank account can still clear February lines after the close.
- The trial balance for any range is identical before and after a close, and is Balanced.
- With FY start = January, the balance sheet at 2027-06-30 shows:
  - Retained earnings = 3900 balance + Σ(I−E) before 2027-01-01
  - Current year earnings = Σ(I−E) for 2027-01-01..06-30
  - assets = liabilities + equity
- Reopen requires a reason and `accounting.close`, and appears in the history.
- The late-fee job run for a date in a closed month records an error and posts nothing.

**Depends on / unblocks**
- Depends on: none hard. CORE-10 is only needed for jobs to run at all.
- Unblocks: 46, 48, 66, and the "books closed" widget in 59.

**Open decisions**
- One company-wide fiscal year and lock date, or per-property lock dates for fee managers who close owners at different times? The recommendation is company-wide, with a per-property lock as a later extension.
- Should an explicit closing entry (I/E → 3900) be posted at year-end for CPAs who expect one? The recommendation is no (virtual close).

#### CORE-41 · Server-side ledger aggregates and the Report Library hub
- **MRI equivalent:** PMX standard report library browsing, and Report Gateway "favorites and recents".
- **Status · priority · effort:** Partial · P2 · M
- **Refs:** Gap 7.1 (foundation) · Inventory 7.1, 7.31, 6.17 · PMX-7.01, PMX-7.09

**Geiger today**
- 15 code-defined reports (`lib/reports/catalog.js:10`). Each one is its own sidebar entry (`components/internal/sidebar/sidebar_nav.jsx:177-195`) and its own registry import (`components/internal/screens/registry.jsx:54-70`).
- The browser loads the whole ledger for every ledger report:
  - `loadLedger` calls `listLedger({})` (`lib/reports/sources_client.js:24-27`)
  - sources load once, unfiltered (`components/internal/screens/reports/report_view.jsx:275-277`)
- The server job pages the whole ledger (`lib/reports/sources_server.js:37-50`).
- The SQL views `ledger_account_balances` and friends have no reader (`ledger_core.sql:561-618`).

**What's missing**
- Period-bounded, aggregated ledger reads.
- A source contract that takes filter parameters.
- One place to browse all reports, so new reports don't each need a sidebar entry.

**How to build**
- *Data model* (migration `ledger_aggregates`):
  - `property.ledger_period_totals(p_project_id uuid, p_from date, p_to date, p_grain text default 'month', p_property_ids uuid[] default null, p_owner_id uuid default null) returns table(period date, gl_account_id uuid, property_id uuid, owner_id uuid, debit numeric, credit numeric)`
    - `language sql stable security invoker`
    - `p_grain` is one of `day | month | year | range`
    - project scope `(project_id = p_project_id or project_id is null)`, mirroring `sources_server.js:22`
  - `property.ledger_balances_as_of(p_project_id uuid, p_as_of date, p_property_ids uuid[] default null, p_owner_id uuid default null) returns table(gl_account_id uuid, property_id uuid, owner_id uuid, debit numeric, credit numeric)`
  - Composite index `ledger_lines_project_date_acct_idx on property.ledger_lines (project_id, entry_date, gl_account_id) where deleted_at is null`
- *Server logic:*
  - `lib/reports/aggregates.js` (new, isomorphic): `totalsToLines(rows)` turns aggregate rows into synthetic lines `{ glAccountId, propertyId, ownerId, date: period, debit, credit }`. The existing `trialBalance`, `incomeStatement`, `balanceSheet` and `cashFlow` category math then run unchanged.
  - New source `ledgerTotals` in `CLIENT_SOURCES` (`sources_client.js:37-54`) and `SERVER_SOURCES` (`sources_server.js:68-85`). It takes params `{ from, to, grain, propertyIds, ownerId }` and returns `{ opening, period, accounts }`.
  - Report definitions gain:
    - `sourceParams(filters)` → a params object per source
    - `category`
    - `keywords`
  - `loadReportSources(keys, params)` re-fetches only the sources whose params key changed.
  - Switch `trial_balance` and `financial_statements` (`lib/reports/defs_financial.js:39-80, 155-260`) to `ledgerTotals`.
  - Line-level reports (GL detail, check register, A/P aging) load `listLedger({ from, to })` plus an aggregate opening, instead of the whole ledger.
- *API routes / jobs:* `lib/jobs/scheduled_reports.js` `runSchedule` (:54-98) passes `def.sourceParams?.(filters)` to `loadServerSources`.
- *UI:*
  - New sidebar entry "Report Library", first under Reports (`sidebar_nav.jsx:177`), registered in `registry.jsx`.
  - Screen `components/internal/screens/reports/report_library.jsx`:
    - `ScreenHeader` and `SearchInput`
    - category sections (Financial, Receivables, Payables, Owners & trust, Banking, Leasing & occupancy, Maintenance, Compliance, Tax, Custom)
    - cards with favorites
  - `?report=<key>` (via `useWorkspaceUrl()`) renders `<CatalogReport reportKey=… />` (`report_view.jsx:266`) with a back affordance.
  - Favorites: per-user setting `report_favorites:<userId>` through `lib/supabase/settings.js`.
  - Existing sidebar report entries stay. New reports appear only in the Library.
- *Permissions:* existing `view.reports`, `reports.export`, `reports.schedule`.
- *Integrations:* none.

**Steps**
1. Migration for the two RPCs and the index.
2. `aggregates.js`, and the `ledgerTotals` source (client and server).
3. Add params support to `loadReportSources` and `report_view.jsx`; keep a loading state per refetch (`LogoLoading` 40–56px on the section).
4. Move the trial balance and financial statements to aggregates; diff their output against the line-based versions on the demo project (`supabase/seeds/demo_project/04_accounting.sql`).
5. Add `category` to all 15 existing definitions.
6. Library screen, registry and nav entry.

**Research before building**
- Measure the ledger line count of the Harbor & Pine demo after regenerating it. Project 500 units × 5 years (roughly 60 lines/unit/month → 1.8M lines) to size indexes and decide whether a materialized monthly rollup is needed later.

**Acceptance criteria**
- For the demo project, Trial Balance and P&L figures from aggregates equal those from the old line-based math for 3 ranges: this month, YTD, and a custom non-month-aligned range.
- The network tab shows no full-ledger fetch when opening Financial Statements.
- Scheduled runs of `financial_statements` produce the same CSV as the screen.
- The Library search finds a report by keyword; the favorite persists across reloads.

**Depends on / unblocks**
- Depends on: none.
- Unblocks: 43, 44, 45, 56, 58, 59.

#### CORE-42 · Export any list and any report to Excel
- **MRI equivalent:** PMX core: "export to Microsoft Excel from every list screen".
- **Status · priority · effort:** Missing · P2 · S
- **Refs:** Gap 7.3 · Inventory 7.17, 7.20, 7.21 · PMX-7.11

**Geiger today**
- Reports export CSV only (`lib/reports/csv.js:1-33`; button at `report_view.jsx:263, 326`).
- List screens have no export: the `filtered` rows at `components/internal/screens/entity/entity_list_screen.jsx:267-287`, and the header actions at :431-447.
- No xlsx library is installed (`package.json`).

**What's missing**
- An XLSX writer.
- An Export control on `EntityListScreen` and on the bespoke list screens.
- Excel output for reports (one sheet per section).

**How to build**
- *Data model:* none.
- *Server logic:*
  - `lib/export/xlsx.js`: `buildWorkbook([{ name, columns, rows }]) → Blob`. Dynamic-import the library so it stays out of the main bundle. Write typed cells (number, date, string) and never formulas; reuse the formula-injection guard idea from `csv.js:4-11`.
  - `lib/export/list_export.js`:
    - `exportColumns(config)`: uses `config.exportColumns` when present, else maps `config.columns` through `col.exportValue(row)`, else `row[col.key]`. List columns render JSX (`entity_list_screen.jsx:383-384`), so each config may need `exportValue`.
- *UI:*
  - Shared `components/internal/shared/export_button.jsx` (`DropdownMenu`: CSV / Excel), used:
    - in `EntityListScreen`'s header actions, exporting the current `filtered` rows (views, filters and search applied)
    - in bespoke screens: `accounting/general_ledger.jsx`, `accounting/rent_collection.jsx`, `accounting/bank_reconciliation.jsx` (history), `payments/online_payments.jsx`
  - `report_view.jsx`: add "Export Excel" beside CSV.
- *Permissions:* new `records.export` ("Export lists", group Records, inherits `view.*` of the page). Reports keep `reports.export`.
- *Integrations:* none.

**Steps**
1. Pick the library (see Research).
2. Write `xlsx.js`.
3. Add `ExportButton`; wire it into `EntityListScreen`.
4. Add `exportValue` to the columns of the 10 most-used configs: leases, tenants, units, properties, bills, owners, vendors, work orders, transactions, security deposits.
5. Add Excel to reports.
6. Wire the bespoke screens.

**Research before building**
- Writer library:
  - `write-excel-file` (small, write-only)
  - `exceljs` (heavier; reads too)
  - SheetJS CE (the npm 0.18.5 is stale and has published advisories; current builds come from cdn.sheetjs.com)
- PLAT-03–04 (gap 9.1) (import) may need a reader; pick a pair that works for both.

**Acceptance criteria**
- Exporting Bills with "Needs approval" and a search term gives exactly the visible rows, with amounts as numbers and dates as dates in Excel.
- A cell starting with `=` exports as text.
- A Financial Statements Excel file has one sheet per section.
- A user without `records.export` sees the button disabled with a reason (`RoleGate`).

**Depends on / unblocks**
- Depends on: none.
- Unblocks: 46 (JE export), 56 (budget import/export), 58.

#### CORE-43 · Portfolio as a report dimension and consolidated statements
- **MRI equivalent:** PMX Financials GL and AP consolidation by project and portfolio.
- **Status · priority · effort:** Partial · P2 · S
- **Refs:** Gap 1.2 · Inventory 1.2, 1.3, 1.4, 6.28, 7.6

**Geiger today**
- The portfolio overview rolls up client-side (`components/internal/screens/portfolios/sections.jsx:77-140`).
- Portfolio targets are saved but unread: `targetNoi` (:318), `consolidatedStatements` (:331).
- Reports filter one property or all (`components/internal/screens/reports/report_kit.jsx:47-59`; `lib/reports/catalog.js:18-27`).
- Membership is `properties.portfolio_id` (`supabase/migrations/20260708132813_properties.sql:37`).

**What's missing**
- A portfolio filter on every report.
- Consolidated portfolio statements.
- NOI and delinquency target checks on the portfolio overview.

**How to build**
- *Data model:* none. Do **not** stamp `portfolio_id` on ledger lines: membership changes would rewrite history. Reports resolve current membership to property ids. (Point-in-time membership history is P3.)
- *Server logic:*
  - `lib/reports/ledger_math.js` `scopeLines` (:19-27) accepts `propertyIds` (array).
  - `catalog.js` `defaultFilters`: the property filter value is `all`, a property id, or `portfolio:<id>`.
  - `lib/reports/scope.js` (new): `resolvePropertyScope(filters, properties) → propertyIds | null`. Every def calls this instead of comparing `f.propertyId`.
  - `ledgerTotals` (CORE-41) receives `propertyIds`.
- *UI:*
  - `PropertyFilter` (`report_kit.jsx:47-59`) groups its options: "All properties", "Portfolios…", "Properties…".
  - Portfolio editor gets a "Financials" tab (P&L YTD and NOI vs `targetNoi`, delinquency vs `maxDelinquencyPct`) using CORE-41 aggregates.
  - The `consolidatedStatements` switch is consumed by CORE-57 owner packets.
- *Permissions:* none.

**Steps**
1. `scope.js`; refactor the 15 definitions to call it.
2. Grouped `PropertyFilter`.
3. Portfolio Financials tab; compare NOI and delinquency targets in the overview's target alerts (`sections.jsx:95-99`).
4. Saved schedules keep `portfolio:<id>` in `filters`.

**Acceptance criteria**
- The P&L for `portfolio:X` equals the sum of the P&Ls of its properties.
- Moving a property to another portfolio changes the portfolio report without touching ledger rows.
- A scheduled report filtered by portfolio emails the consolidated figures.
- The Trial Balance scoped to a portfolio is Balanced. Entries carry the property dimension on every line, except the manager-side fee lines, which have no owner but do carry the property (`postings.js:350-351`).

**Depends on / unblocks**
- Depends on: CORE-41.
- Unblocks: 44 (property-comparison view), 57 (consolidated owner packets), 64.

#### CORE-44 · Comparative, 12-month and budget-vs-actual financial statements
- **MRI equivalent:** PMX Financials statements with period columns, comparisons and budget variance (likely inside the 500+ library).
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gaps 11.9, 7.1 · Inventory 7.8, 7.9, 6.21, 6.65 · PMX-7.01, PMX-7.06

**Geiger today**
- The P&L shows range totals only (`lib/reports/defs_financial.js:239-258`); there are three views (`:149-153`).
- Budget vs actual exists only on the Budgets screen (`components/internal/screens/accounting/budgets.jsx:301-432`).
- Account hierarchy is indentation only (inventory 6.21).

**What's missing**
- New views:
  - 12-month P&L (one column per month plus total)
  - P&L comparison: current vs prior period vs same period last year, with $ and % variance
  - P&L vs budget
  - balance sheet comparison (as-of vs prior month-end vs prior fiscal year-end)
  - 12-month cash flow
  - property comparison (one column per property in scope)
- Parent-account subtotals.

**How to build**
- *Data model:* none. Budgets are read from `property.budget_lines` (`ledger_core.sql:151-169`); version choice comes later in CORE-56.
- *Server logic:* `lib/reports/statements.js` (new, pure):
  - `periodColumns({ from, to, mode })` → `[{ key, label, from, to }]`
  - `pnlMatrix(totals, accounts, columns)` → rows per account with one amount per column, plus totals
  - `withVariance(rows, a, b)`
  - `budgetColumn(budgetLines, accounts, range)`
  - `rollupParents(rows, accounts)`, using `gl_accounts.parent_id`
  - `financialStatementsReport` (`defs_financial.js:155`) gets the new `views`, each returning `kind: "statement"` sections with dynamic `columns` (report_view already renders columns as data).
  - The budget source `budgets` gets a loader in both sources files, reading `budgets` and `budget_lines` for the year range.
  - Add a dedicated `budget_vs_actual` definition (category Financial) with filters year/range, property/portfolio and budget (version).
- *UI:*
  - No new screen: new view options in Financial Statements and the Library.
  - Print: `report_print.jsx` switches to landscape when there are more than 6 columns.
- *Permissions:* existing.

**Steps**
1. `statements.js` with unit-style fixtures (a small in-memory ledger).
2. Add the views to `financialStatementsReport`.
3. Add the budgets source and the `budget_vs_actual` definition.
4. Landscape print.
5. CSV and Excel (CORE-42) verified for 14-column output.

**Research before building**
- Check NARPM/IREM owner-reporting norms for 12-month statements: column order, YTD column, and whether owners expect "Prior year YTD".

**Acceptance criteria**
- In the 12-month P&L, the sum of the month columns equals the range P&L for the same 12 months, for every account.
- A comparison of a period with itself shows zero variance.
- Every balance-sheet comparison column is balanced.
- The budget column equals Σ `budget_lines.amount` for the months in range.
- Parent subtotals equal the sum of their children.
- Property comparison columns sum to the portfolio total (CORE-43).

**Depends on / unblocks**
- Depends on: CORE-41, CORE-43 (property comparison).
- Unblocks: 56 (budget vs actual by version), 57 (owner packets), 59.

**Open decisions**
- Add a cash-basis toggle to statements while building this (inventory 6.14; not in the gap list)? Many owners read cash-basis statements; the ledger is accrual-style today (`postings.js:203-281`).

#### CORE-45 · Standard report library expansion
- **MRI equivalent:** PMX's "500+ standard reports", including the rental update report and deposit statements.
- **Status · priority · effort:** Partial · P2 · L
- **Refs:** Gap 7.1 · Inventory 7.1, report catalogue, 1.22, 6.60, 6.89, 6.98 · PMX-7.01

**Geiger today**
- 15 reports: Rent Roll, Delinquency, Occupancy & Vacancy, Owner Statements, Maintenance, Leasing, Insurance Compliance, Financial Statements, Trial Balance, GL Detail, Check & Payment Register, A/P Aging, Deposit Detail, Management Fees, 1099 Summary (`lib/reports/defs_operations.js:665-673`; `lib/reports/defs_financial.js:680-688`).
- Defect: Occupancy counts non-revenue units, because it excludes only Draft (`defs_operations.js:207`; inventory 1.22).

**What's missing** — the reports a 10–500 unit manager expects. Each one is a catalog definition with `category`, sources, filters and `compute`; none needs a new screen (all open through the CORE-41 Library).

| Key | Title | Category | Contents | Depends on |
|---|---|---|---|---|
| `budget_vs_actual` | Budget vs Actual | Financial | Built in CORE-44 | CORE-44 |
| `income_statement_12m` | 12-Month Income Statement | Financial | Built in CORE-44 | CORE-44 |
| `journal_register` | Journal Register | Financial | Entries in range with lines, source, created by, void/reversal flags; "manual only" filter (for the close review) | — |
| `cash_receipts` | Cash Receipts Register | Receivables | Payments by date, payer, method (online/manual), property, deposit batch, NSF/void status | CORE-11, CORE-16 |
| `delinquency` (new view) | Aged Receivables by Charge Type | Receivables | Open AR bucketed by the income GL of each open charge (rent, late fee, utility, CAM, other) | — |
| `tenant_credits` | Tenant Credits & Prepaid Rent | Receivables | Leases with unapplied credit or a 2200 balance | — |
| `fees_concessions` | Late Fees & Concessions | Receivables | Late fees charged, waived and voided; concessions granted, by property and month | CORE-06, CORE-05 |
| `rent_change` | Rent Change (Rental Update) | Leasing | Per lease: rent and recurring charges billed last month vs this month, with the reason (new lease, renewal, step, move-out) | CORE-01, CORE-03 |
| `rent_potential` | Gross Potential Rent & Loss-to-Lease | Leasing | GPR at market (`units` market rent) → loss/gain to lease (lease rent vs `metadata.marketRent`, `leasing/sections/lease_money.jsx:72`) → vacancy loss → concessions (4050) → bad debt (5800) → collected | CORE-05, CORE-15 |
| `lease_expirations` | Lease Expirations | Leasing | Leases ending in the next 3/6/12/24 months with rent, market rent, renewal status and notice given | — |
| `vacant_units` | Vacant & Available Units | Leasing | Days vacant, ready status, available date, market rent, listing status; excludes non-revenue units | — |
| `move_activity` | Move-ins & Move-outs | Leasing | Moves by date with deposit held and balance at move-out | CORE-13 |
| `owner_balances` | Owner Balances & Available to Distribute | Owners & trust | Per owner × property: trust cash, reserve, open payables, pending payouts, available (formula in CORE-54) | CORE-08 |
| `trust_reconciliation` | Trust Account Reconciliation (three-way) | Owners & trust | Per trust bank account as of a date: (1) adjusted bank balance = statement balance from the latest finalized reconciliation − outstanding checks + deposits in transit; (2) book trust cash (GL); (3) Σ sub-ledgers = owner trust positions + deposits held (2100/2110) + prepaid (2200). All three must match; lists exceptions | CORE-50 (statement balance), CORE-04 |
| `bank_rec_report` | Bank Reconciliation Report | Banking | Printable finalized reconciliation: statement balance, cleared deposits and withdrawals, outstanding items at the statement date, adjusted balances (inventory 6.60) | — |
| `vendor_activity` | Vendor Activity | Payables | Per vendor: bills, payments (method/rail), open balance, 1099 flag | — |
| `payments_issued` | Payments Issued | Payables | Outbound payments by status, rail, bank account, check number, voids | CORE-51, 52 |
| `rent_roll` (new views) | Rent Roll · As-of / with charges | Leasing | As-of-date roll; one column per recurring charge type | CORE-03 |
| `deposit_detail` (new view) | Deposit Register | Owners & trust | Per lease: held, interest accrued, refunds and deductions (statement of deposit) | CORE-04, CORE-13 |

Maintenance and work-order reports (aging, cost per unit, vendor performance) belong to COMM. Rentable-item occupancy comes in CORE-60, and the owner 1099 view in CORE-55.

**How to build**
- *Data model:* none.
- *Server logic:*
  - New pure helpers in `lib/reports/ledger_math.js`:
    - `receiptsRegister`
    - `openByIncomeAccount`
    - `trustThreeWay(lines, accounts, recons, asOf)`
    - `ownerAvailable(lines, accounts, policies, openBills, pendingPayouts)` (shared with CORE-54)
  - New definitions in `defs_financial.js` and `defs_operations.js`, or new files `defs_receivables.js` and `defs_trust.js` included in `catalog.js:10`.
  - Fix in passing: exclude non-revenue units from occupancy (`defs_operations.js:207`).
- *UI:* none beyond the Library. Add `cells` overrides only where rows need links.
- *Permissions:* existing.

**Steps**
1. Ledger-only reports: journal register, aged by charge type, tenant credits, vendor activity, bank rec report.
2. Leasing reports: rent change, GPR, expirations, vacant units, move activity.
3. Owners & trust: owner balances and the three-way trust reconciliation.
4. Reports that wait on Part A or other CORE items: add each when its dependency lands.
5. Fix the occupancy defect.
6. Add each new key to `schedule_dialog.jsx`'s report list (it reads `REPORTS`).

**Research before building**
- State trust-account rules: which states require a monthly three-way reconciliation, and in what format? Check California DRE (Commissioner's Regulation 2831.2), Texas TREC, Florida FREC (Rule 61J2-14.012) and Arizona ADRE. The three-way report must match what their auditors ask for.
- Check the standard report lists of AppFolio, Buildium and Rent Manager to confirm nothing a switching customer expects is missing.

**Acceptance criteria**
- Every new report runs on the demo project, exports CSV/Excel and can be scheduled.
- Three-way reconciliation on the demo trust account: the three columns agree after a finalized reconciliation, and a deliberately unrecorded check shows as an outstanding-item difference.
- GPR ties out: GPR − loss to lease − vacancy loss − concessions − bad debt = net rental income on the P&L for the same scope and period, within the "other adjustments" line.
- Occupancy no longer counts non-revenue units.

**Depends on / unblocks**
- Depends on: CORE-41; Part A items per row.
- Unblocks: 54 (owner balances), 57 (packets).

#### CORE-46 · Journal entries: import, export, copy, reverse and line dimensions
- **MRI equivalent:** PMX Financials "Copy JEs; JE import/export" (PMX-6.04).
- **Status · priority · effort:** Partial · P2 · M
- **Refs:** Gap 6.7 · Inventory 6.8, 6.15, 9.31 · PMX-6.04

**Geiger today**
- The manual JE dialog has free lines but no dimension pickers, so manual JEs drop out of property-filtered statements (`components/internal/screens/accounting/ledger_dialogs.jsx:435-514`; lines rendered at :492-509).
- The GL list is capped at 500 entries (`accounting/general_ledger.jsx:224, 255`; `lib/supabase/ledger.js:171`).
- There is no import, export, copy or reverse.

**What's missing**
- Per-line property, unit, owner, vendor and lease pickers.
- Copy an entry; reverse an entry on a date.
- CSV/XLSX import with a preview; export in the same format.
- An opening-balances template for conversions.
- GL pagination beyond 500.

**How to build**
- *Data model:* migration `journal_imports`:
  - Table `property.journal_imports`: `file_name`, `format`, `status` (preview/posted/failed), `entry_count`, `posted_count`, `errors jsonb`, `as_of date`, `kind` (journal/opening_balances).
  - System account `opening_balance_equity` 3950 via `ledger_ensure_accounts`. INTL-04 already creates it on demand (`ensureClearingAccount` in `lib/ledger/conversion_server.js`, same system key); reuse it.
- *Server logic:*
  - `lib/ledger/journal_io.js` (pure):
    - `parseJournalRows(rows, accounts, lookups)`: groups by `entry_ref` and validates (balanced, account by number, dimensions by name or code, date not locked per CORE-40) → `{ entries, errors }`
    - `journalToRows(entries)` for export
  - Template columns: `entry_ref, date, memo, account_number, debit, credit, line_memo, property, unit, owner, vendor, lease`.
  - Posting: `postJournal` (`lib/supabase/ledger.js:385`) per entry, with `idempotencyKey: jeimp:<importId>:<entry_ref>` and `metadata: { importId, sourceFile }`.
  - Reverse: `buildJournal` mirror (swap debit/credit) as a new `adjustment` entry, key `jerev:<entryId>:<date>`, `metadata.reverses`. This is distinct from void, which marks the original void.
  - Copy: prefill the dialog from `getLedgerEntry`.
  - Opening balances: a template where each row is an account balance as of a date, offset to 3950. Tenant AR openings post per lease (Dr AR lease dim / Cr 3950) and owner trust openings per owner × property.
- *UI:*
  - JE dialog gets per-line pickers (property, unit, owner, vendor, lease; collapsible "Dimensions") and an entry-level property default.
  - GL entry detail (`general_ledger.jsx:74-110`) gets "Copy", "Reverse…" (date picker) and "Make recurring" (CORE-48).
  - The GL header gets "Import" (wizard: upload → map columns → preview with errors per row → post) and "Export" (CORE-42).
  - The GL list uses `components/internal/shared/pagination.jsx` with server paging instead of the 500 cap.
- *Permissions:* `accounting.post` for import, copy and reverse.
- *Integrations:* reuse PLAT-03–04 (gap 9.1)'s file-parse and column-mapping component if it exists first; otherwise put the parser in `lib/import/` so PLAT can adopt it.

**Steps**
1. Dimension pickers in the JE dialog (the quickest win).
2. Copy and reverse actions.
3. Server pagination for the GL list.
4. `journal_io.js`; migration; import wizard.
5. Export.
6. Opening-balances template, coordinated with PLAT-03–04 (gap 9.1)'s conversion flow.

**Research before building**
- Check the JE import formats of AppFolio, Buildium, QuickBooks and Yardi Breeze so a switching customer's export maps with little effort.
- Coordinate with INTL-09 (QuickBooks Online sync) and INTL-13 (Xero) on account-number mapping.

**Acceptance criteria**
- Importing a 50-entry file posts 50 balanced entries; re-importing it posts 0 (idempotency).
- An unbalanced group or an unknown account number blocks that group and shows the row number.
- A row dated in a closed period is rejected (CORE-40).
- Import → export → re-import round-trips identical lines.
- A reversal nets the account to zero, and the trial balance stays Balanced.
- A manual JE with a property on each line appears in that property's P&L.
- After an opening-balance import, the balance sheet equals the source system's, and AR per lease matches the tenant balances imported.

**Depends on / unblocks**
- Depends on: CORE-40, CORE-42.
- Unblocks: 48 (make recurring), PLAT-03–04 (gap 9.1) conversions.

#### CORE-47 · Approval engine: multi-step approvals
- **MRI equivalent:** PMX AP approvals, Workflow Design (licensed) and Budgeting & Forecasting approvals.
- **Status · priority · effort:** Partial · P2 · L
- **Refs:** Gap 6.2 · Inventory 6.34, 6.35, 6.66, 9.13, 1.35 · PMX-9.09, PMX-6.46

**Geiger today**
- One project-wide `billApprovalLimit`, cached in module state (`components/internal/screens/accounting/bills.jsx:83-88`). Over the limit, a bill starts `Pending` (:621-639).
- Any `accounting.post` user approves; the approver name is free text (:646-690). Reject and "Require approval" are single switches (:692-710).
- Saved but unread:
  - property `requireBillApproval` and `billApprovalAbove` (`properties/sections/property_tabs.jsx:185-186`)
  - owner `approveBills` and `approvalThreshold` (`owners/shared.js:147-148`)
- Budget "Approved" is a manual select (`accounting/shared.js:224-228`).
- Owners already approve work orders in the portal (`lib/portal/owner.js:260`).

**What's missing**
- Rules by amount, property, GL account, vendor and subject type.
- Ordered steps with role, member or owner approvers, in any/all mode.
- No self-approval option.
- Approval history; an approvals inbox; notifications; owner approval of bills.
- One engine for bills, payment runs (52/54), budgets (56), JEs (optional) and COMM-14–15 (gap 5.1) POs.

**How to build**
- *Data model* (migration `approvals`):
  - **`property.approval_policies`:**
    - `subject_type text` check in ('bill', 'payment_run', 'owner_payout_run', 'budget', 'journal_entry', 'purchase_order')
    - `name`, `priority int`, `active bool`
    - `conditions jsonb` `{minAmount, maxAmount, propertyIds[], glAccountIds[], vendorIds[]}`
    - `steps jsonb` `[{name, approverType:'role'|'member'|'owner', approverIds[], mode:'any'|'all'}]`
    - `no_self_approval bool`
  - **`property.approval_requests`:**
    - `subject_type`, `subject_id`, `policy_id`
    - `status` (pending/approved/rejected/cancelled), `current_step int`, `amount`
    - `requested_by`, `requested_at`, `decided_at`
    - `snapshot jsonb` (subject summary at request time)
    - Unique pending per `(subject_type, subject_id)`.
  - **`property.approval_actions`:**
    - `request_id`, `step int`
    - `actor_type` (staff/owner), `actor_id`, `actor_name`
    - `decision` (approve/reject/comment)
    - `note`, `created_at`
- *Server logic:*
  - `lib/approvals/engine.js` (pure):
    - `matchPolicy(policies, subject)`: highest priority whose conditions match
    - `advance(request, policy, action, actor)`: the next state; enforces any/all, step order and no-self-approval
  - `lib/supabase/approvals.js` (data layer):
    - `requestApproval(subjectType, subject)` → request or `null` (none needed)
    - `decide(requestId, decision, note)`
    - `listMyPending()`
    - `historyFor(subjectType, subjectId)`
  - Bills:
    - Replace `newRow`'s limit check (`bills.jsx:621-639`) and the approve wizard (:646-690) with `requestApproval('bill', bill)`.
    - `isBillApproved` stays the gate before posting to AP (`bills.jsx:118`).
    - When the last step approves, post to AP (`postBillToLedger`, :101-115).
  - Migrate the old setting: on first load, if `billApprovalLimit > 0` and no bill policy exists, create a policy "Bills over $X" with one step (role: any `accounting.post`).
  - Property `requireBillApproval` and `billApprovalAbove` become conditions on property-scoped policies (create them from the property tab).
  - Owner step: request rows with `approverType: 'owner'` resolve owners from `property_owners`, respecting the owner's `approveBills` and `approvalThreshold`.
- *API routes / jobs:*
  - `app/api/portal/owner/approvals/route.js` (GET pending; POST decide), modelled on `decideApproval` (`lib/portal/owner.js:260-…`).
  - Staff decisions go through a server route `app/api/accounting/approvals/[id]/route.js` once PLAT-01 lands. Until then the browser data layer, as for all other writes.
- *UI:*
  - New "Approvals" screen under Accounting (sidebar `sidebar_nav.jsx:141-156`, registry): my pending items, all pending, history, and a policy editor (header action "Approval Rules" replaces `ApprovalRulesButton`, `bills.jsx:386-430`).
  - The bill Approval tab (`bills.jsx:337-383`) shows a step timeline.
  - The Overview "Needs attention" card links to pending approvals.
  - Owner portal: a "Bills awaiting your approval" list.
- *Permissions:* new `approvals.manage` (edit policies). Approvers are whoever the policy names. Admin override requires `approvals.manage` and leaves a note.
- *Integrations:*
  - In-app: **reuse geiger-notify** (`@geiger/notify/server` `createServerNotifier`, with action buttons per `C:\Pro\geiger-notify\README.md`). Add `@geiger/notify` as a GitHub dependency like `@geiger/ui`.
  - Email: geiger-dash templates `property.approval_requested` and `property.approval_decided`.

**Steps**
1. Migration for the three tables.
2. `engine.js` with pure tests for any/all, ordering and self-approval.
3. Data layer.
4. Bills cut-over, including the settings migration.
5. Approvals screen and policy editor.
6. Owner portal route and UI.
7. Notifications.
8. Expose `requestApproval` for 52, 54, 56 and COMM-14–15 (gap 5.1).

**Research before building**
- Check the geiger-notify send API shape and whether `notify` is in the exposed schemas for this project.
- Check how roles are resolved from `@geiger/rbac` (`package.json`), so that "role" approvers map to real members.

**Acceptance criteria**
- A $6,000 bill on property P with policy "> $5,000 at P: step 1 any property manager, step 2 owner" stays Pending (not in AP) until both steps approve. It then posts Dr expense / Cr AP once (key `bill:<id>`), and the trial balance is Balanced.
- A rejection at step 2 leaves no ledger entry.
- With no-self-approval on, the creator cannot approve.
- An existing `billApprovalLimit` keeps working after the cut-over.
- The owner sees and decides the bill in the portal; the history shows each action with actor and time.

**Depends on / unblocks**
- Depends on: none. PLAT-01 is needed for server-enforced decisions.
- Unblocks: 48, 52, 54, 56, 66, 67, COMM-14–15 (gap 5.1).

**Open decisions**
- Should approvals be enforced in the database (bills cannot post to AP without an approved request) once PLAT-01 lands, or stay application-level? The recommendation is database-level for bills and payment runs.

#### CORE-48 · Recurring journal entries and recurring bills
- **MRI equivalent:** PMX Financials recurring entries; recurring invoice templates (Job Cost, PMX-6.49).
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gap 11.5 · Inventory 6.9, 6.44 · PMX-6.49

**Geiger today**
- No templates (grep in the inventory, rows 6.9 and 6.44).
- Lease recurring charges have their own table and job (`property.recurring_charges`, `supabase/migrations/20261010165221_full_build_tables.sql:562-592`; `lib/jobs/financial.js:128`). Part A fixes their frequency (CORE-03).

**What's missing**
- Templates for JEs and bills: schedule, end, post or draft mode.
- A daily job that generates them once per occurrence.

**How to build**
- *Data model* (migration `ledger_recurring_templates`):
  - **Table `property.ledger_recurring_templates`:**
    - `kind` (journal/bill), `name`
    - `frequency` (weekly/monthly/quarterly/semiannual/annual), `interval int`, `day_of_month`
    - `starts_on`, `next_run_on`, `ends_on`, `occurrences_left`
    - `mode` (post/draft), `status` (Active/Paused/Ended)
    - `template jsonb`: JE lines with dimensions, or bill fields and split lines
    - `property_id`, `vendor_id`, `last_run_on`, `last_error`
  - **Index:** unique expression index `bills_recur_key_uidx on property.bills ((metadata->>'recurKey')) where metadata ? 'recurKey' and deleted_at is null`.
- *Server logic:*
  - `lib/schedule/recurrence.js` (new, shared with CORE-03): `nextOccurrence(rule, fromDate)`, `occurrencesBetween(rule, from, to)`.
  - `lib/jobs/recurring_entries.js` (new):
    - For each Active template, each occurrence ≤ today, capped at 12 catch-ups.
    - JE: `postBuilt(buildJournal(...))` with key `recur:<templateId>:<YYYY-MM-DD>`.
    - Bill: insert into `bills` with `metadata.recurKey = recur:<templateId>:<date>`, then `requestApproval` (CORE-47). If no approval is needed, post to AP with key `bill:<billId>`.
    - Advance `next_run_on`; end when `ends_on` or `occurrences_left` is reached.
    - Lock errors (CORE-40) set `last_error` and skip.
  - Register the job in `lib/jobs/registry.js:7` (daily, e.g. `"45 5 * * *"`).
- *UI:*
  - Bills: action "Make recurring" (wizard: frequency, start, end, mode), and a header action "Recurring bills" listing templates with pause, edit and run now.
  - GL entry detail: "Make recurring"; GL header "Recurring entries".
  - Shown in the Scheduled Jobs dialog automatically.
- *Permissions:* `accounting.post`.

**Steps**
1. `recurrence.js`, agreed with Part A.
2. Migration.
3. Data layer `lib/supabase/recurring_templates.js`.
4. Job and registry entry.
5. UI actions and lists.
6. Close checklist item "recurring entries processed through period end" (CORE-40).

**Acceptance criteria**
- Running the job twice on the same day creates nothing new.
- A monthly JE template that missed 3 days posts each missed occurrence once, dated correctly. Each entry is balanced, and the trial balance is Balanced.
- Paused and ended templates don't run.
- A bill template over the approval threshold creates a Pending bill that is not in AP.
- Two generated bills for the same date are impossible: the unique index rejects the second.

**Depends on / unblocks**
- Depends on: CORE-10 (scheduling), CORE-46 (JE detail actions), CORE-47.
- Unblocks: 66.

#### CORE-49 · AP entry: split lines, attachments, duplicate check, bills inbox
- **MRI equivalent:** AP Automation (Nexus internationally; AvidInvoice in the US through Vendor Pay). OCR and AI capture are deferred under the no-AI decision.
- **Status · priority · effort:** Missing · P2 (inbox P3) · L
- **Refs:** Gap 6.12 · Inventory 6.11, 6.31, 6.33, 6.37, 6.38, 6.45, 6.76, 10.5 · PMX-6.33

**Geiger today**
- The posting builder supports split lines (`lib/ledger/postings.js:262-281`), but the only caller passes one account (`accounting/bills.jsx:101-115`).
- Lines carry `unitId` but no `propertyId`, so a bill cannot be split across properties (`postings.js:275`).
- Bills have no attachments (inventory 6.11). The vendor-portal invoice attachment is written (`lib/portal/vendor.js:253`) but not shown to staff.
- No duplicate check.
- Due date is never put on the AP entry. The A/P aging report therefore ages by bill date: it reads `entry.metadata.dueDate` (`lib/reports/ledger_math.js:313`), and `postBillToLedger` never sets it (`bills.jsx:101-115`).

**What's missing**
- Split-line entry with property, unit and job per line.
- Attachments on bills.
- Duplicate warnings.
- Vendor default payment terms.
- A bills inbox (email or upload) with a side-by-side entry screen.
- A hook for future OCR.

**How to build**
- *Data model* (migration `bill_inbox_items`):
  - **Table `property.bill_inbox_items`:**
    - `source` (email/upload/vendor_portal)
    - `from_email`, `subject`, `received_at`
    - `files jsonb` `[{path, name, size, contentType}]`
    - `status` (new/processed/ignored), `bill_id`, `vendor_id` guess
  - Bill lines stay in `bills.metadata.lines` (`[{glAccountId, amount, propertyId, unitId, jobId, memo}]`). The header `amount` = Σ lines.
  - Index `bills_vendor_invoice_idx on property.bills (vendor_id, (metadata->>'invoiceNumber'))`.
- *Server logic:*
  - `buildBill`:
    - Per-line `propertyId`.
    - **One AP credit line per property**, each carrying that property's owner, so every owner's books balance per entry (see CORE-65).
    - `metadata: { dueDate, invoiceNumber }` on the entry.
  - `lib/supabase/ledger.js` `post()` (:321-343): resolve the owner per line property (today only the entry property is resolved, :328). Coordinate with CORE-08, which changes owner tagging.
  - `lib/accounting/duplicates.js`: `findLikelyDuplicates(bill, bills)` (same vendor and invoice #; or same vendor, amount and date ±7 days).
  - Attachments: reuse the documents data layer (`lib/supabase/documents.js`) with source `bill`, in a **private** bucket (PLAT-01).
  - `lib/ap/extract.js`: `extractInvoiceFields(file) → null`. This is the deferred-AI hook point.
- *API routes / jobs:* `app/api/accounting/bills/inbound/route.js`:
  - Bearer `INBOUND_EMAIL_SECRET`, the same pattern as the provider-agnostic stub `app/api/messages/inbound/route.js:5-12`.
  - Normalized body `{ projectId, from, subject, attachments:[{filename, contentBase64, contentType}] }` → files stored → inbox row.
  - Per-project address `bills+<projectSlug>@<inbound domain>`.
- *UI:*
  - Bills Details gets a "Lines" section (an editable table with an add-line button, a running total and a property picker per line).
  - New "Attachments" tab; the vendor-portal attachment is listed there.
  - The create dialog shows a duplicate warning (non-blocking, "Create anyway").
  - Vendor field `paymentTermsDays` (Vendors → Payment), used as the default due date. It is already read by the portal (`lib/portal/vendor.js:227`).
  - Bills view "Inbox": a list, and on open a split layout (PDF/image preview left, bill form right) → "Create bill".
- *Permissions:* `accounting.post`.
- *Integrations:* inbound email. Check whether geiger-dash (Resend) can receive inbound mail; otherwise use a provider webhook (Postmark, SendGrid Inbound Parse or Mailgun routes) through a small adapter. OCR/AI: deferred to the suite AI package.

**Steps**
1. Due date and invoice # on AP entries (fixes A/P aging), plus a backfill script as a seed-style one-off: `ledger_entries.metadata` merge for open bills.
2. Per-line property and split AP in `buildBill` and `post()`.
3. Lines UI.
4. Attachments tab.
5. Duplicate check.
6. Vendor terms.
7. Inbox table, route and UI (P3 part).

**Research before building**
- Does Resend inbound (geiger-dash) exist and support attachments? Compare Postmark Inbound, SendGrid Inbound Parse and Mailgun Routes on size limits and pricing.
- Supabase Storage private-bucket and signed-URL limits (PLAT-01).

**Acceptance criteria**
- A bill with 3 lines across 2 properties posts:
  - Dr expense (P1, owner A) $300
  - Dr expense (P1, owner A) $200
  - Dr expense (P2, owner B) $500
  - Cr AP (P1, owner A) $500
  - Cr AP (P2, owner B) $500

  It is balanced overall and per owner. Each property's P&L shows its lines.
- A/P aging buckets by due date.
- Entering vendor V with invoice "INV-9" a second time warns.
- Emailing a PDF to the bills address creates an inbox item; "Create bill" attaches the file to the new bill.

**Depends on / unblocks**
- Depends on: CORE-09 (one bill-posting path), CORE-08, CORE-47, PLAT-01 (private files).
- Unblocks: 52, 65, 66, 67.

#### CORE-50 · Bank statement import, bank feeds and auto-matching
- **MRI equivalent:** partner automation (REdirect, "up to 96% automated matching", PMX-6.44).
- **Status · priority · effort:** Missing · P2 · L
- **Refs:** Gap 11.2 · Inventory 6.54, 6.57–6.61, 6.63 · PMX-6.44

**Geiger today**
- Manual reconciliation works: draft, clear lines, finalize at zero difference, undo (`accounting/bank_reconciliation.jsx`; `lib/supabase/ledger.js:400-420`).
- The bank balance is typed in by hand ("bank feeds aren't connected", `accounting/bank_accounts.jsx:34`).
- Stripe payout ids are stamped on online payments (`lib/payments/fulfill.js:363-380`), but `processor_fee` is never posted (`fulfill.js:161`). Stripe payouts therefore never equal the ledger deposits.

**What's missing**
- Statement import (CSV, OFX/QFX, BAI2; CAMT.053 later).
- Bank feeds through a provider.
- A matching engine that pre-clears lines in a reconciliation.
- Creating ledger transactions from unmatched statement lines.
- Posting processor fees.

**How to build**
- *Data model* (migration `bank_statements`):
  - **`property.bank_statement_imports`:** `bank_account_id`, `file_name`, `format`, `period_start`, `period_end`, `closing_balance`, counts.
  - **`property.bank_statement_lines`:**
    - `bank_account_id`, `import_id`, `posted_on`
    - `amount numeric` (+ in / − out), `description`, `payee`, `check_number`, `reference`
    - `external_id` (FITID or provider id), `source` (csv/ofx/bai2/camt053/feed)
    - `status` (unmatched/matched/created/ignored), `matched_line_ids uuid[]`, `match_rule`
    - Unique `(bank_account_id, external_id)`; fallback hash `md5(date|amount|description|seq)`.
  - **`property.bank_feed_connections`:** `bank_account_id`, `provider`, `provider_account_id`, `status`, `last_synced_at`, `cursor`. Tokens are server-only and encrypted (PLAT-01).
  - **`property.bank_match_rules`:** `contains text`, `direction`, `gl_account_id`, `property_id`, `vendor_id`.
- *Server logic:*
  - Parsers `lib/banking/parsers/{csv,ofx,bai2}.js` (pure). CSV takes a column map saved per bank account (`bank_accounts.metadata.csvMap`).
  - `lib/banking/match.js`: `suggestMatches(statementLines, ledgerCashLines, context)`. Candidate ledger lines are the uncleared cash lines for the bank account (`bank_account_id`, or cash GL via `cashAccountFor`, `lib/supabase/ledger.js:312-318`). Rules in order:
    1. check number + amount
    2. Stripe payout id → Σ online payments in the payout, net of posted fees
    3. deposit batch total (CORE-16)
    4. same amount ±3 days, one candidate only
    5. many-to-one subset sum ≤ 6 lines within ±5 days
  - Unmatched lines → `bank_match_rules` suggestions → "Create" posts a cash transaction:
    - deposit: Dr cash (bank GL, `bank_account_id`) / Cr chosen account
    - withdrawal: Dr chosen account / Cr cash
    - key `bankline:<statementLineId>`
  - Processor fees: at `payout.paid`, post per the fee policy (see Open decisions), key `stripefee:<payoutId>`.
  - Feeds adapter `lib/banking/feeds/adapter.js`: `{ linkToken(), exchange(publicToken), listAccounts(), syncTransactions(cursor) → { added, modified, removed, nextCursor } }`. Provider files under `feeds/`.
- *API routes / jobs:*
  - `app/api/banking/import/route.js` (POST file → parsed lines; server-side for size)
  - `app/api/banking/feeds/link/route.js`, `.../exchange/route.js`, `.../webhook/route.js`
  - Job `bank-feeds-sync` (daily) in `lib/jobs/registry.js`: pulls, upserts statement lines, runs `suggestMatches`.
- *UI:*
  - Bank Accounts detail: a "Statement lines" tab and "Connect bank" (provider link UI).
  - Bank Reconciliation draft: "Import statement", which pre-clears the matched ledger lines and fills the statement date and closing balance. Accept or reject per match, then "Create transaction" for unmatched lines.
  - Finalize stays the same.
- *Permissions:* `accounting.post` (import, create); new `banking.connect` (link feeds).
- *Integrations:* feed provider shortlist, as an open decision:
  - Stripe Financial Connections (transactions permission; Stripe is the standing payments provider)
  - Plaid Transactions
  - MX
  - Mastercard Open Finance (Finicity)
  - Teller

**Steps**
1. Migration.
2. CSV and OFX parsers, then BAI2.
3. Import route and the reconciliation "Import statement".
4. `match.js` with fixtures.
5. Create-from-line, and rules.
6. Processor-fee posting.
7. Feeds adapter, the chosen provider, the job and the connect UI.

**Research before building**
- OFX 2.x and QFX differences; BAI2 record types 16 and 88; whether US banks used by small PMs (Chase, BofA, Wells Fargo, US Bank, PNC, regional and credit unions) export OFX or CSV for business accounts.
- CAMT.053 adoption by US banks (ISO 20022 migration).
- Pricing for Stripe Financial Connections vs Plaid Transactions at 1–50 accounts per customer.
- Plaid/Stripe requirements for trust (IOLTA-like) accounts.

**Acceptance criteria**
- Importing the same OFX twice creates no duplicate statement lines (FITID).
- On the demo bank account, ≥ 90% of statement lines auto-match against seeded postings. Matched lines clear on finalize, and the reconciliation finalizes at zero difference.
- A Stripe payout of $9,708.50 matches the 4 online payments ($10,000) once the $291.50 fees are posted.
- Creating a transaction from a $25 bank-fee line posts Dr 5910 / Cr operating cash once (key `bankline:<id>`). The trial balance is Balanced.

**Depends on / unblocks**
- Depends on: CORE-16 (deposit batches), PLAT-01 (feed tokens).
- Unblocks: 45 (three-way trust reconciliation), 52 (cleared status for positive-pay exceptions).

**Open decisions**
- Bank-feed provider (shortlist above).
- Who bears Stripe processing fees: the manager's operating account (Dr 5910 / Cr operating cash, plus a trust top-up), the owner (Dr 5910 owner dims / Cr trust cash), or the resident through a convenience fee? This decides how payouts match trust deposits.

#### CORE-51 · Outbound-payments adapter and payee accounts (shared by vendor payments and owner payouts)
- **MRI equivalent:** MRI Vendor Pay powered by AvidXchange (check, ACH or virtual card "through a single transaction"; payment status in MRI). No residential owner-payout equivalent was found in PMX.
- **Status · priority · effort:** Missing · P2 · L
- **Refs:** Gaps 6.3, 11.3 · Inventory 6.40, 6.42, 6.62, 6.82 · PMX-6.36, PMX-6.37

**Geiger today**
- Bill payment "method" is only a label (`accounting/bills.jsx:79`); the method is written into the memo, not the entry metadata (`lib/ledger/postings.js:292`).
- Distributions are bookkeeping only (`postings.js:301-315`).
- Owner payout fields are saved but unused, and store only last-4 digits (`owners/shared.js:80-95`).
- Stripe is a single-account integration with no Connect or payouts (`lib/stripe/server.js`).

**What's missing**
- **One** money-movement interface for vendor and owner payments:
  - payee onboarding (bank details held by the provider, not by Geiger)
  - payment lifecycle and webhooks
  - status → ledger mapping
  - returns
  - fees
  - a manual provider for in-house checks and "paid outside Geiger"

**How to build**
- *Data model* (migration `outbound_payments`):
  - **`property.payee_accounts`:**
    - `party_type` (vendor/owner), `party_id`
    - `provider`, `provider_recipient_id`, `rail_default` (ach/check/wire/virtual_card)
    - `bank_name`, `account_last4`, `routing_last4`
    - `mail_to jsonb`, `status` (pending/verified/disabled), `verified_at`
  - **`property.payment_runs`:**
    - `kind` (vendor/owner), `name`, `run_date`, `funding_bank_account_id`
    - `status` (draft/pending_approval/approved/submitting/submitted/completed/partially_failed/cancelled)
    - `total`, `payment_count`, `approval_request_id`
  - **`property.outbound_payments`:**
    - `run_id`, `party_type`, `party_id`, `payee_account_id`, `rail`, `amount`
    - `status` (draft/approved/submitted/processing/paid/failed/returned/cancelled/voided)
    - `provider`, `provider_payment_id`, `check_number`, `funding_bank_account_id`
    - `scheduled_on`, `submitted_at`, `paid_at`, `failure_code`, `failure_reason`
    - `ledger_entry_id`, `reversal_entry_id`
    - `idempotency_key` unique
    - `allocations jsonb`: bills `[{billId, billEntryId, amount, propertyId, ownerId}]` or properties `[{propertyId, amount}]`
  - **`property.outbound_payment_events`:** `payment_id`, `provider_event_id` unique, `type`, `status`, `payload`, `received_at`.
  - **Bank funding:** `bank_accounts.metadata.outbound = { provider, fundingSourceId }`.
- *Server logic:* `lib/payments/outbound/adapter.js` defines the interface (JSDoc):
  ```js
  // Each provider implements:
  capabilities() // { rails: ['ach','check',...], printAndMail, positivePay, recipientOnboarding: 'hosted'|'api' }
  createRecipient({ partyType, partyId, name, email, address }) // { providerRecipientId, status, onboardingUrl? }
  getRecipient(providerRecipientId)
  createPayment({ idempotencyKey, rail, amount, recipientId, fundingSourceId, memo, remittance, mailTo })
  //   → { providerPaymentId, status, expectedOn, checkNumber? }
  cancelPayment(providerPaymentId)
  getPayment(providerPaymentId)
  parseWebhook(request) // [{ eventId, providerPaymentId, status, failureCode }]
  ```
  - Providers in `lib/payments/outbound/providers/`:
    - `manual.js`: record-only; staff mark sent and paid; used for CORE-53 in-house checks and payments made outside Geiger
    - `<chosen>.js`
    - optional `nacha_file.js`: exports a NACHA file for upload to the customer's bank (see Open decisions)
  - `lib/payments/outbound/service.js` (server):
    - `submitPayment(paymentId)`:
      1. idempotent, keyed on `idempotency_key`
      2. checks funds (CORE-54 `ownerAvailable` for trust; operating balance otherwise)
      3. calls the provider
      4. posts the ledger entry (built by CORE-52 or 54) with key `vpay:<id>` or `odist:<id>`
      5. sets `submitted`
    - `applyEvent(event)`:
      - `paid` → stamp `paid_at`
      - `failed` / `returned` after submission → `ledger_void(entry)`, store `reversal_entry_id`, reopen allocations, notify
  - Fees: when a provider charges per payment, post Dr 5910 Bank & Payment Fees (no owner dimension, manager side) / Cr operating cash, key `payfee:<paymentId>`. Policy is open (see CORE-50).
- *API routes / jobs:*
  - `app/api/accounting/payees/[partyType]/[id]/onboard/route.js` (creates a recipient and returns or emails the hosted onboarding link)
  - `app/api/accounting/payment-runs/[id]/submit/route.js`
  - `app/api/accounting/payments/[id]/cancel/route.js`
  - `app/api/payments/outbound/webhook/[provider]/route.js` (signature check; idempotent on `provider_event_id`)
  - Job `outbound-payments-sync` (polls stuck `processing` payments daily)
- *UI:*
  - Vendor and owner editors get a "Payment details" card: status, rail, last 4, "Send setup link".
  - The vendor and owner portals get a "Payment details" page that embeds or links the provider's hosted onboarding.
  - Runs UI lives in CORE-52 and CORE-54.
- *Permissions:* new `payments.submit` (submit runs and payments) and `payees.manage` (send onboarding, disable payee). Submitting requires both `payments.submit` and an approved run (CORE-47).
- *Integrations:* provider shortlist to research. **One** is chosen as an open decision:

  | Provider | Fit |
  |---|---|
  | Stripe Global Payouts (v2 OutboundPayments, US ACH/wire; https://docs.stripe.com/global-payouts) | Same vendor as rent payments. Money must sit in a Stripe financial account/balance, not the customer's trust bank account, which complicates trust accounting. Recurring use is described as one-time transfers |
  | Dwolla (ACH platform) | Funds from the customer's own verified bank account (trust account stays at their bank); same-day ACH; widely used by proptech |
  | Checkbook.io | Digital checks, ACH and print-and-mail checks from the customer's own bank account. The payee picks how to receive; good for small managers paying many small vendors |
  | Increase | Bank-as-API: ACH and printed-and-mailed checks; positive pay is inherent. The trust account would move to Increase's partner bank |
  | Modern Treasury | Payment operations on top of the customer's bank (ACH, wire, check) with reconciliation. Enterprise-priced; needs a supported bank |
  | Melio partner platform / AvidXchange (AvidPay Network) | AP payment networks with virtual-card rebates; the MRI-style partner route. Less control over the user experience |
  | Lob (checks) | Print-and-mail only; pairs with any ACH provider for checks |
  | NACHA file export (no provider) | Zero vendor cost; the customer uploads to their bank. Needs full payee and own account numbers stored encrypted (PLAT-01). No status webhooks |

**Steps**
1. Migration.
2. Adapter interface and `manual.js`.
3. `service.js` with the ledger hooks (builders come from 52/54).
4. Webhook route and events table.
5. Payee onboarding (manual first: last-4 and status).
6. The chosen provider: sandbox end to end.
7. Sync job.
8. Fees.

**Research before building**
- For each shortlisted provider:
  - Can it debit the customer's existing trust bank account (vs holding funds)?
  - Same-day ACH cost and cut-offs
  - Check print-and-mail cost and positive-pay support
  - Hosted payee onboarding and TIN/W-9 collection (overlaps CORE-55)
  - Return handling (R01/R03 codes) and webhooks
  - KYB requirements per property-management customer
  - Pricing at 50–2,000 payments/month
- Nacha 2026 fraud-monitoring rule changes for credit-push originators (Phase 1 March 2026, Phase 2 June 2026; verify at nacha.org): what must Geiger or the customer do if Geiger generates NACHA files?
- State trust-account rules on electronic disbursements from trust (e.g. California DRE Regulation 2834 signatory rules).

**Acceptance criteria**
- Submitting the same payment twice calls the provider once and posts one ledger entry (same `vpay:`/`odist:` key).
- A webhook replayed 3 times is applied once.
- A return after `paid` posts exactly one reversal. The bill or distribution reopens, the trust position is restored, and the trial balance is Balanced.
- No full bank account number is stored in any `property.*` table, unless the NACHA-file provider is chosen with PLAT-01 encryption.

**Depends on / unblocks**
- Depends on: **PLAT-01** (hard), CORE-47.
- Unblocks: 52, 53 (print-and-mail), 54.

**Open decisions**
- Which outbound provider (table above)? The choice also decides whether trust funds stay at the customer's bank.
- Allow NACHA-file export (requires storing full account numbers encrypted)?
- Who pays per-payment fees: the manager, or passed to the owner?

#### CORE-52 · Vendor payment runs (ACH, check, virtual card) and positive pay
- **MRI equivalent:** MRI Vendor Pay (AvidXchange): batch-paying vendors, positive pay, and "eliminates 100% of the paper checks".
- **Status · priority · effort:** Missing · P2 · L
- **Refs:** Gap 6.3 · Inventory 6.39–6.42, 6.62 · PMX-6.36, PMX-6.37

**Geiger today**
- One payment at a time per bill (`accounting/bills.jsx:159-219`): Dr AP / Cr cash (key `billpay:<paymentId>`).
- Payments are kept in `bills.metadata.payments` and mirrored to Transactions (:198-219).
- No batch, no check numbers, no positive pay (inventory 6.41, 6.42, 6.62).

**What's missing**
- A payment-run wizard over open, approved bills, grouped per vendor and funding account.
- Approval, then submission through CORE-51, with remittance advice.
- A positive-pay issue file.
- Rail recorded on entries for 1099 exclusions.

**How to build**
- *Data model:* uses CORE-51 tables. `outbound_payments.allocations` holds the bills paid.
- *Server logic:*
  - Refactor `PaymentsSection.add` (`bills.jsx:159-219`) into `lib/accounting/bill_payments.js` → `recordBillPayment({ bill(s), amount, rail, bankAccountId, date, outboundPaymentId? })`, used by the manual payment UI and by runs. It keeps the `metadata.payments` and Transactions mirror behaviour.
  - Builder `buildVendorPayment` (in `postings.js`). One entry per outbound payment:
    - for each allocated bill b: **Dr AP 2000** amount_b (`vendorId`, `appliesToEntryId` = b's entry, `propertyId` and `ownerId` = b's)
    - for each property p: **Cr cash** Σ (funding bank GL, `bankAccountId`, `propertyId` p, `ownerId` of p)
    - `source_type: bill_payment`
    - `metadata: { rail, outboundPaymentId, checkNumber? }`
    - key `vpay:<outboundPaymentId>`
  - Fix the manual flow too: write `metadata.method`/`rail` on `payBill` (`postings.js:284-298` puts it in the memo only).
  - Funds check: for trust funding, Σ per owner × property must be ≤ `ownerAvailable` (CORE-54); for operating, ≤ book balance.
  - Positive pay: `lib/banking/positive_pay.js` → `issueFile(bankAccount, payments, template)` builds rows for issued and voided checks (account number, check #, amount, issue date, payee, void flag). Templates are data (`bank_accounts.metadata.positivePayTemplate`: column order, date format, header, delimiter or fixed width).
  - Remittance email: dash template `property.vendor_remittance`, listing the invoices paid. The vendor portal shows payments (`lib/portal/vendor.js` invoices view, :59-75).
- *API routes / jobs:* the CORE-51 submit route; `app/api/accounting/positive-pay/route.js` (GET file for a bank account and date range).
- *UI:*
  - Bills screen header action "Pay bills" opens the payment-run wizard (`wizard_dialog.jsx`):
    1. filters: due by, property, vendor, funding bank account
    2. select bills (open, approved; partial amounts allowed)
    3. review grouped per vendor: rail, payee status, available funds per owner × property
    4. send for approval or submit
  - New "Payment Runs" list under Accounting: status, totals, per-payment status, cancel and void.
  - Bank Accounts detail: "Positive pay" card (template editor and "Download issue file").
  - Virtual card is shown only if the provider supports it.
- *Permissions:* `payments.submit`; approval per CORE-47 policy `payment_run`.
- *Integrations:* CORE-51 provider; positive-pay files go to the customer's bank (upload by the customer).

**Steps**
1. Extract `bill_payments.js`; write the rail to metadata.
2. `buildVendorPayment`.
3. Run wizard and list.
4. Approval hook.
5. Submit through CORE-51.
6. Remittance email and vendor portal.
7. Positive-pay templates and export.
8. Void and reissue flows.

**Research before building**
- Positive-pay issue-file formats for Chase, Bank of America (CashPro), Wells Fargo (ARP), US Bank, PNC, Truist, plus one credit union, to design the template fields.
- Payee positive pay (payee name) vs standard.
- ACH debit block/filter: bank-side only? Confirm nothing is file-based.

**Acceptance criteria**
- A run paying 3 bills to vendor V (properties P1/P1/P2, owners A/A/B) from trust posts one entry:
  - Dr AP $ per bill, each applied to its bill entry
  - Cr trust cash per property (P1 owner A, P2 owner B)
  - balanced; owner A and owner B trust positions drop by exactly their bills
  - all 3 bills show Paid, and A/P aging no longer lists them
  - the trial balance is Balanced
- A run that would push owner B's trust negative is blocked at review.
- Voiding a printed check posts the reversal, reopens its bills and appears as a void in the next positive-pay file.
- The vendor gets one remittance email listing the 3 invoices.

**Depends on / unblocks**
- Depends on: CORE-51, CORE-47, CORE-49 (due dates and split AP), CORE-08, PLAT-01.
- Unblocks: 53, 55 (rail-aware 1099).

#### CORE-53 · Check printing with MICR and signature images
- **MRI equivalent:** PMX check processing with electronic signature images (PMX-6.29).
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gap 6.4 · Inventory 6.41, 7.19 · PMX-6.29

**Geiger today**
- No check numbers on bill payments (inventory 6.41).
- The generic Post dialog stores a free-text `metadata.reference` (`accounting/ledger_dialogs.jsx:262, 331`). The check register reads `metadata.checkNumber || reference || method` (`lib/reports/ledger_math.js:347`); nothing writes `checkNumber`.
- No PDF library (inventory 7.19).

**What's missing**
- A check-number sequence per bank account.
- Check layouts (voucher with stubs) on pre-printed or blank stock.
- MICR line, signature images, dual signature over a threshold.
- Print, confirm, reprint and void flow.
- Print-and-mail through a provider.

**How to build**
- *Data model* (migration `check_printing`):
  - `bank_accounts` add `next_check_number int`.
  - `metadata.check` = `{ stock: 'preprinted'|'blank', layout: 'voucher_top', offsetX, offsetY, dualSignatureAbove }`.
  - RPC `property.reserve_check_numbers(p_bank_account_id uuid, p_count int) returns int`: atomic `update … set next_check_number = next_check_number + p_count returning next_check_number - p_count`.
  - Blank-stock MICR data (full routing and account numbers) and signature images are **secrets**: store them encrypted (Supabase Vault or a pgsodium column) in a private bucket under PLAT-01. Never put them in `metadata`.
- *Server logic:*
  - `lib/pdf/` (shared with CORE-57): pdf-lib (already used in geiger-forms at 1.17.1).
  - `lib/checks/render.js`: `renderChecks({ payments, bank, layout, signatures }) → PDF bytes`. Contents:
    - payee, amount in words and figures, date, memo
    - MICR line (E-13B font) on blank stock
    - signature images
    - two stubs listing the bills paid (from `allocations`)
  - Ledger: checks are outbound payments with `rail: 'check'`, provider `manual` (in-house print) or print-and-mail.
    - On "confirm printed": `submitted`, posting via CORE-52 `buildVendorPayment` / CORE-54 `buildOwnerPayout` with `metadata.checkNumber`.
    - Void: `ledger_void` + status `voided`; the number is logged for positive pay.
- *API routes / jobs:* `app/api/accounting/checks/print/route.js` (POST `{ paymentIds }` → reserves numbers → PDF), `.../checks/[id]/void/route.js`.
- *UI:*
  - From a payment run (CORE-52/54): "Print checks" → preview PDF → "All printed correctly" or "Reprint from #…" (voids the bad numbers).
  - Bank Accounts detail: "Check settings" (stock, alignment test page, next number, signatures upload — permission-gated).
  - "Write check" for one-off disbursements (posts like a cash expense with `checkNumber`).
- *Permissions:* new `checks.print`; `checks.configure` (signatures and MICR data).

**Steps**
1. `lib/pdf` foundation (if CORE-57 didn't do it first).
2. Migration and RPC.
3. Renderer with an alignment test page.
4. Print route and confirm flow.
5. Void and reprint.
6. Signature storage (after PLAT-01).
7. Print-and-mail via the CORE-51 provider.

**Research before building**
- MICR E-13B placement per ANSI X9.100-160-1 (clear band, positions) and the US check standard ANSI X9.100-140.
- MICR font licensing for embedding in generated PDFs: GnuMICR (GPL) vs commercial fonts (IDAutomation, Troy).
- MICR toner requirements, and whether customers mostly use pre-printed stock (only payee and amount printed) to avoid MICR entirely.
- Voucher check layouts common with Intuit-compatible stock.

**Acceptance criteria**
- Printing 10 checks reserves 10 consecutive numbers, even with two users printing at once (no duplicates).
- The PDF aligns on an alignment test print.
- Confirming posts 10 entries with `metadata.checkNumber`, and the Check Register shows the numbers.
- Reprint from #1005 voids #1005–1010 (reversals posted, numbers logged) and reissues new numbers.
- Two signatures appear above the threshold.
- The trial balance is Balanced after print, void and reprint.

**Depends on / unblocks**
- Depends on: CORE-51, CORE-52, PLAT-01 (secrets).
- Unblocks: 54 (owner checks), 57 (PDF foundation, if built first).

**Open decisions**
- Support blank-stock MICR printing (requires storing full account numbers encrypted and MICR toner), or pre-printed stock only at launch? The recommendation is pre-printed only first.

#### CORE-54 · Owner payouts and batch distribution runs
- **MRI equivalent:** none found in PMX residential (Geiger's positioning edge). The closest is investor distributions in Investment Accounting, which is out of scope.
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gap 11.3 · Inventory 6.81–6.89

**Geiger today**
- Manual distribution posts Dr 3200 / Cr trust cash (`lib/ledger/postings.js:301-315`), but only for one property (entry dimensions) per post.
- Saved but unused:
  - policies `ownerReserve` and `ownerDistributionDay` (`lib/policies.js:146-147`)
  - owner `payoutSchedule`, `distributionDay`, `minimumPayout`, `holdPayouts`, `reserveAmount`, `separatePayments` (`owners/shared.js:80-95`)
- Nothing computes "available to distribute" (inventory 6.89).

**What's missing**
- The available-funds calculation per owner × property.
- A batch run with rules for holds, minimums and separate payments.
- Approval, money movement (ACH/check via CORE-51/53), owner notification and portal display.
- An optional scheduled draft run.

**How to build**
- *Data model:* CORE-51 tables (`payment_runs.kind = 'owner'`; `outbound_payments.allocations = [{propertyId, amount}]`). No new table.
- *Server logic:*
  - `lib/accounting/owner_available.js` (shared with CORE-45 `owner_balances`). Per owner o × property p as of date d:

    `available = trustCash(o,p,d) − reserve(o,p) − openPayables(p) − pendingOutbound(o,p) − prepaidLiability(p)·share(o,p)` (the prepaid term depends on the policy decision below)
    - `trustCash` = Σ trust cash lines with owner o and property p.
    - Deposit trust (1020/2100) is excluded: it is never distributable.
    - `reserve` = owner `reserveAmount` override, else property/company policy `ownerReserve`.
    - `share(o,p)` comes from `property_owners.ownership_pct` with dates. CORE-08 decides whether lines are already split per owner; if not, apply the share here.
  - Rules:
    - skip `holdPayouts` (and show the reason)
    - below `minimumPayout` → roll to next cycle
    - `separatePayments` → one payment per property, else one per owner
    - rail from `payee_accounts.rail_default` or `owners.payout_method`
  - Builder `buildOwnerPayout` (`postings.js`; generalizes `buildDistribution`). One entry per outbound payment:
    - for each property p: **Dr 3200 Owner Distributions** amount_p (`ownerId` o, `propertyId` p) and **Cr trust cash** amount_p (funding bank GL, `bankAccountId`, `ownerId` o, `propertyId` p)
    - `source_type: distribution`
    - `metadata: { rail, outboundPaymentId, checkNumber? }`
    - key `odist:<outboundPaymentId>`
  - The funds check runs again at submit (CORE-51 `submitPayment`).
- *API routes / jobs:*
  - CORE-51 routes.
  - Job `owner-distributions` (daily): on each owner's distribution day (`distributionDay` or the policy), create a **draft** run. It never auto-submits.
  - Owner portal: `app/api/portal/owner/payouts/route.js` (list with status).
- *UI:*
  - Owners screen header action "Distribute funds" opens the run wizard: as-of date, owners/properties, computed table (trust cash, reserve, payables, available, proposed, editable), exceptions (holds, below minimum, missing payee setup) → approval/submit.
  - Payment Runs list (shared with CORE-52).
  - The owner editor's Payouts card shows history.
  - The owner portal shows a payouts list, and statements show distributions (`lib/portal/owner.js:104`).
  - Email `property.owner_payout_sent` on submit.
- *Permissions:* `payments.submit`; approval policy `owner_payout_run` (CORE-47).

**Steps**
1. `owner_available.js`, with fixtures for co-ownership, holds and reserves.
2. `buildOwnerPayout`.
3. Wizard and run list.
4. Approval.
5. Submit via CORE-51 (ACH) and CORE-53 (checks).
6. Portal route and UI.
7. Draft-run job.
8. Email.

**Research before building**
- How AppFolio, Buildium and Rent Manager compute "available to distribute" (prepaid rent, pending bills, reserve), to match owner expectations and state trust rules: a broker must not disburse prepaid rent or deposits.

**Acceptance criteria**
- Owner A (100% of P1, 50% of P2) with trust cash P1 $5,000, P2 $3,000, reserve $250 per property and an open P1 bill of $400:

  available = (5,000 − 250 − 400) + 50% × (3,000 − 250) = $5,725

  The run proposes $5,725.
  - After submit, the entry is Dr 3200 / Cr trust cash per property, with A's trust positions reduced by those exact amounts.
  - Trust positions are never negative.
  - The trial balance is Balanced.
- A held owner is excluded, with the reason shown.
- Below-minimum balances roll over.
- A returned ACH reverses once and restores trust.
- The owner sees "Paid $5,725 on …" in the portal.

**Depends on / unblocks**
- Depends on: CORE-51, CORE-47, CORE-08 (co-owner tagging), PLAT-01; CORE-53 for check payouts.
- Unblocks: 45 (`owner_balances`), 55 (owner payments context).

**Open decisions**
- Hold back prepaid rent from distributions (conservative trust practice), or treat it as distributable?

#### CORE-55 · 1099-NEC and 1099-MISC, including owner 1099s, forms and IRIS e-file
- **MRI equivalent:** PMX 1099 processing: NEC and MISC (attorney and "property payee" boxes), payers by company, bank or entity group, combined federal/state, print and e-file. Per PMX-6.35, MRI e-files "via IRS FIRE only".
- **Status · priority · effort:** Partial · P2 · L
- **Refs:** Gap 6.5 · Inventory 6.48–6.52 · PMX-6.35

**Geiger today**
- The 1099 Summary covers vendors only: ledger cash paid net of voids (`lib/reports/defs_financial.js:600-678`; math in `lib/reports/ledger_math.js:391-405`). The threshold is $600 through 2025 and $2,000 from 2026 (`defs_financial.js:598`).
- **Defect:** payments by card are counted, because entries don't record the method. The method only reaches the memo (`lib/ledger/postings.js:292`). Card and third-party-network payments are reported on 1099-K and must be excluded from 1099-NEC.
- W-9s keep **only TIN last 4**:
  - vendors `tinLast4` (`components/internal/screens/vendors/config.jsx:188-226`)
  - owners `taxIdLast4` (`owners/shared.js:118-128`)

  E-filing needs the full TIN.
- Owner 1099 settings are saved but unused: owner `requires1099` and `delivery1099` (`owners/shared.js:122-123`); property `report1099` (`properties/sections/property_tabs.jsx:184`).

**What's missing**
- Owner 1099-MISC box 1 rents.
- Payer setup (management company or owner).
- Exclusions (card payments, corporations except attorneys).
- Per-year thresholds.
- Full-TIN storage or partner collection; TIN matching.
- Recipient copies (PDF) and e-delivery with consent.
- E-file and corrections.

**IRS channel (researched).**
- FIRE's last filing day is **19 Nov 2026**. From **1 Jan 2027**, IRIS is the only IRS e-file system for 1099s: current year, prior year and corrections. A FIRE TCC cannot be used in IRIS.
- Tax-year-2026 forms, due early 2027, must therefore go through IRIS: the Taxpayer Portal (manual or CSV upload) or A2A (XML + API client ID), or through a partner that transmits to IRIS.
- Sources:
  - [APA / payroll.org, 8 Oct 2026](https://payroll.org/news-resources/news/news-detail/2026/10/08/fire-users-must-move-to-iris-to-e-file-information-returns-in-2027)
  - [IRS IRIS working-group deck, Aug 2026](https://www.irs.gov/pub/irs-efile/iris-working-group-meeting-08122026.pdf)
  - [JD Supra](https://www.jdsupra.com/legalnews/retirement-of-irs-fire-system-and-3860433/)
- The $2,000 NEC/MISC threshold (OBBBA §70433, amending IRC §6041) applies to payments after 31 Dec 2025, including rents, and is indexed from 2027 ([Sovos](https://sovos.com/regulatory-updates/trr/one-big-beautiful-bill-raises-1099-reporting-thresholds/)). Verify against the current 1099-MISC instructions.

**How to build**
- *Data model* (migration `tax_forms`):
  - **`property.tax_payers`:** `payer_type` (company/owner), `owner_id`, `name`, `tin_last4`, `tin_secret_id` (Vault ref), `address`, `iris_tcc` (company only).
  - **`property.tax_forms`:**
    - `tax_year`, `form_type` ('1099-NEC' / '1099-MISC'), `payer_id`
    - `recipient_type` (vendor/owner), `recipient_id`
    - `boxes jsonb` (e.g. `{nec1, misc1, misc10}`), `total`, `state_boxes jsonb`
    - `status` (draft/ready/filed/accepted/rejected/void), `corrected_of uuid`
    - `tin_match` (unknown/match/mismatch), `delivery` (email/mail/portal), `delivered_at`
    - `filing_id`, `overrides jsonb` with reason
  - **`property.tax_filings`:** `tax_year`, `channel` (iris_portal_csv/iris_a2a/partner), `submitted_at`, `receipt_id`, `status`, `ack jsonb`.
  - Thresholds by year: `lib/tax/thresholds.js` (table, not a formula).
- *Server logic:*
  - `lib/tax/form1099.js` (pure):
    - **Vendor NEC** = `vendorPayments` filtered to rails not in (card, virtual_card, third_party_network), using `metadata.rail` from CORE-52 (older manual entries default to "check/ACH"), per payer.
    - Exclude W-9 tax classification C-corp/S-corp, except attorneys: MISC box 10 gross proceeds, or NEC for fees.
    - **Owner MISC box 1 rents** = gross rents received for the owner in the year: payment entries crediting AR on income charges for the owner's properties × ownership share, excluding deposits.
    - Threshold per year from the table.
  - Payer resolution:
    - Vendor payments from trust funds: payer = owner when property setting `banking.report1099` is on (`property_tabs.jsx:184`), else the company.
    - Owner rents: payer = company (as agent).
  - PDF recipient copies (Copy B substitute layout per Pub 1179) via `lib/pdf` (CORE-57).
  - IRIS Portal CSV export (fallback with no integration).
  - Partner adapter `lib/tax/efile/adapter.js`: `submit(forms)`, `status(id)`, `correct(form)`, `tinMatch(recipients)`, `collectW9(recipient) → url`.
  - Full TIN: either Vault-encrypted (PLAT-01), or held only at the partner (W-9 collected on the partner's hosted form).
- *API routes / jobs:*
  - `app/api/tax/forms/generate/route.js` (year → drafts; idempotent per year × payer × recipient × form)
  - `app/api/tax/forms/file/route.js`, `.../deliver/route.js`, `.../[id]/correct/route.js`
  - `app/api/tax/w9/[partyType]/[id]/route.js` (partner collection link)
  - Job `tax-form-status` (polls the partner in January–March)
- *UI:*
  - New "1099 Center" under Reports (Library and sidebar):
    - year and payer picker
    - recipients table (amounts by box, W-9 status, TIN match, exclusions, overrides with reason)
    - Generate, Review, File, Deliver, Corrections
  - The 1099 Summary gets an "Owners" view.
  - Owner and vendor portals get a "Tax forms" download.
  - Delivery consent capture in the portals.
- *Permissions:* new `tax.file` (generate, file, correct). Viewing uses `view.reports`.
- *Integrations:* e-file route (open decision):
  - **partner API** (TaxBandits, Tax1099/Zenwork, Track1099/Avalara 1099 & W-9, Sovos): fastest; adds W-9 collection, TIN match, state filing and e-delivery
  - **IRIS A2A direct**: no per-form fee; needs the TCC application (up to 45 business days), ATS testing, the XML schemas and an API Client ID
  - **IRIS Portal CSV**: manual upload by the customer

**Steps**
1. Record `metadata.rail` on all payment postings (CORE-52), and default legacy entries.
2. `thresholds.js` and `form1099.js` with fixtures.
3. Migration; payer setup UI.
4. Generate drafts; the 1099 Center.
5. Owner view in the summary report.
6. PDF copies and e-delivery consent.
7. IRIS CSV export.
8. Partner adapter (if chosen), TIN match, filing and status job.
9. Corrections.

**Research before building**
- IRS 1099-MISC instructions for property managers:
  - gross rents vs net of fees and expenses paid on the owner's behalf
  - whether the manager or the owner is the payer for vendor payments made from owner trust funds
- The 2027 indexed threshold when published.
- IRIS Taxpayer Portal CSV templates and per-upload limits; IRIS A2A schema version for TY2026; whether IRIS supports Combined Federal/State filing for the states customers need; correction rules ("same system as the original").
- Electronic-furnishing consent rules for 1099 recipient statements.
- Partner pricing per form at 50–2,000 forms per year, and API sandbox access.

**Acceptance criteria**
- A vendor paid $2,500 by ACH and $800 by card in 2026 gets an NEC of $2,500.
- A C-corp vendor (non-attorney) is excluded.
- Owner A with 50% of P2 receiving $40,000 gross rents gets MISC box 1 = $20,000.
- Totals tie to the ledger (sum of form amounts = filtered `vendorPayments`/rent receipts for the year).
- Re-generating drafts doesn't duplicate forms.
- Filed forms are immutable; a correction creates a new form with `corrected_of`.
- The IRIS CSV validates against the IRS template.
- No full TIN in any plain column.

**Depends on / unblocks**
- Depends on: CORE-52 (rails), CORE-57 (PDF), CORE-08 (owner shares), PLAT-01 (TIN secrets).
- Unblocks: none.

**Open decisions**
- E-file route: partner API vs IRIS A2A direct vs IRIS Portal CSV only.
- Full-TIN storage: Geiger stores it encrypted (Vault) vs the partner holds it (W-9 collected on the partner's form).
- Vendor 1099 payer default: the management company, or each owner (per-property switch)?

#### CORE-56 · Budget versions, reforecasts, scenarios, approvals and a residential workbook
- **MRI equivalent:** Budgeting & Forecasting: scenarios, reforecasts, approvals, import/export/copy, and RM workbooks (renewals, vacancy loss, loss to lease, bad debt, management fees) (PMX-6.46, 6.47).
- **Status · priority · effort:** Partial · P2 · L
- **Refs:** Gap 6.6 · Inventory 6.64–6.68 · PMX-6.46, PMX-6.47

**Geiger today**
- Budgets per property × year (`property.budgets`, `supabase/migrations/20261010165221_full_build_tables.sql:214-230`; layer `lib/supabase/budgets.js`).
- Monthly lines (`budget_lines`, `ledger_core.sql:151-169`); an even annual spread (`components/internal/screens/accounting/budgets.jsx:37-41`); budget vs actual on screen (:301-432).
- Status is a manual select (Draft/Approved/Archived; `accounting/shared.js:224-228`).
- No versions, copy, reforecast or drivers (inventory 6.67, 6.68).

**What's missing**
- Versions (original, reforecast n, scenario).
- Copy from prior year or actuals ±%.
- A reforecast that locks actuals through month N.
- A primary version for reports.
- Approval through CORE-47.
- Excel import/export.
- A driver workbook that generates income and expense lines from the rent roll.

**How to build**
- *Data model* (migration `budget_versions`; `alter table property.budgets add column if not exists …`):
  - `version_type` ('original' / 'reforecast' / 'scenario')
  - `version_no int`, `parent_budget_id uuid`, `scenario_name`
  - `reforecast_through_month int`, `is_primary boolean`
  - `approval_request_id`, `locked_at`
  - Partial unique index on `(project_id, property_id, year) where is_primary and deleted_at is null`.
  - `budget_lines.metadata.generated` (boolean) marks driver-generated lines.
- *Server logic:*
  - `lib/budgets/versions.js`:
    - `copyBudget(src, { pctChange, fromActuals })`
    - `createReforecast(src, throughMonth, actualsByAccountMonth)` (actual months read-only)
    - `setPrimary`
  - `lib/budgets/drivers.js` (pure): inputs in `budgets.metadata.drivers`:
    - unit market rents and the rent roll
    - vacancy % by month
    - loss-to-lease %
    - concessions
    - bad debt %
    - expirations by month (from `leases` term end) × renewal rate × renewal increase
    - turn cost per move-out
    - management fee % (policy)

    Outputs: lines for 4000 rent, 4050 concessions, 5800 bad debt, 5700 turnover and 5400 management fees.
  - Regenerating replaces only generated lines.
  - Approval: `requestApproval('budget', budget)`. On approve, set `locked_at` and status Approved.
  - Reports use the primary version by default; the `budget_vs_actual` filter can choose a version (CORE-44).
  - Not posted to the GL: PMX's "post budgets to GL" is not needed.
- *UI:*
  - Budgets editor (`budgets.jsx`):
    - version switcher in the header
    - actions: Copy, Create reforecast, Create scenario, Set as primary, Submit for approval
    - a "Drivers" tab (form plus a preview of generated lines)
    - "Compare versions" view (side by side, variance)
    - Import/Export (Excel via CORE-42 plus the PLAT-03–04 (gap 9.1) reader)
  - Locked budgets are read-only.
- *Permissions:* `accounting.post` to edit; approval per policy.

**Steps**
1. Migration.
2. `versions.js`; copy and reforecast actions.
3. Primary flag and report wiring.
4. Approval.
5. `drivers.js` and the Drivers tab.
6. Compare view.
7. Excel import/export.

**Research before building**
- The structure of NAA/IREM multifamily budget templates (income waterfall lines) and how AppFolio and Buildium budgets treat reforecasts, so the driver set matches what 10–500 unit owners review.

**Acceptance criteria**
- A reforecast through June keeps January–June equal to actuals (read-only) and July–December editable.
- Copying from prior-year actuals +3% equals actuals × 1.03 per account × month.
- Only one primary per property-year.
- An approved budget cannot be edited without a new version.
- Driver output: 10 units at $1,500 market with 5% vacancy gives Jan GPR $15,000 and vacancy loss $750.
- Budget vs Actual in reports uses the primary version.
- Export → import round-trips the lines.

**Depends on / unblocks**
- Depends on: CORE-44, CORE-47, CORE-42.
- Unblocks: 59 (variance widget), 61 (CAM estimates from budget).

#### CORE-57 · Report packets: native PDF, file attachments and owner statement packets
- **MRI equivalent:** Report Gateway packets and batches, "schedule a report, packet or batch", plus emailed reports (PMX-7.02, PMX-7.09).
- **Status · priority · effort:** Partial · P2 · M
- **Refs:** Gap 7.5 · Inventory 6.79, 6.80, 6.28, 7.18, 7.19, 7.23, 7.25 · PMX-7.02, PMX-7.09

**Geiger today**
- Scheduled reports email a summary with up to 15 preview rows and a link, and archive the CSV and HTML (`lib/jobs/scheduled_reports.js:54-98, 120-137`). **No attachments.**
- `sendSuiteEmail` has no attachments parameter (`lib/email/client.js:18-52`). geiger-dash's `sendTemplateEmail` *does* accept `attachments` and passes them to Resend (`C:\Pro\geiger-dash\lib\email\send.js:33, 56, 114`), but `/api/email/send` doesn't read or forward them (`C:\Pro\geiger-dash\app\api\email\send\route.js:41`).
- Frequency is limited to daily, weekly or monthly (`supabase/migrations/20261015215603_report_schedules_and_runs.sql:36`).
- PDF is browser print only (`components/internal/screens/reports/report_print.jsx`).
- Saved but unused: owner statement preferences (`owners/shared.js:131-141`) and portfolio `consolidatedStatements` (`portfolios/sections.jsx:331`).

**What's missing**
- Server-side PDF of any report.
- Packets: several reports plus documents, as one PDF and/or separate files.
- Attachments on scheduled emails.
- Per-owner fan-out driven by owner statement preferences.
- Quarterly and annual frequencies.
- Private storage of generated files.

**How to build**
- *Data model* (migration `report_packets`):
  - **`property.report_packets`:**
    - `name`
    - `items jsonb` `[{type:'report', reportKey, filters, view, format:'pdf'|'csv'|'xlsx'} | {type:'document', documentId} | {type:'bill_attachments', range}]`
    - `cover jsonb`, `combine_pdf bool`
    - `fan_out` (none/owner), `owner_filter jsonb`
  - **`report_schedules`:** add `packet_id uuid`. Drop and re-add the frequency check with 'quarterly' and 'annually'.
  - **`report_runs`:** add `files jsonb` `[{name, path, size}]`.
- *Server logic:*
  - `lib/pdf/render_report.js`: `reportPdf({ title, stats, sections })`. Option A: headless Chromium rendering of the existing `lib/reports/html.js` output. Option B: a pdf-lib table renderer (see Research).
  - `lib/pdf/merge.js` (pdf-lib).
  - `lib/reports/packets.js`: `runPacket(admin, packet, ctx) → files[]`.
  - Owner fan-out: for each owner with `statementDelivery` = email and the frequency due:
    - filters `{ ownerId, propertyIds }`
    - included reports from `statementReports` (`owners/shared.js:133-140`), mapped to report keys
    - CC `statementCc`; note `ownerNotesOnStatement` on the cover
    - portfolio `consolidatedStatements` → one packet for the portfolio's properties
  - Storage: private bucket `report-files/<project>/<runId>/` (PLAT-01). Emails attach files when the total is ≤ 30 MB; otherwise they carry signed links (7-day expiry).
  - `lib/email/client.js` `sendSuiteEmail({ …, attachments })` sends `[{ filename, content: base64, contentType }]`.
  - **geiger-dash change** (one route, in that repo): destructure `attachments` in `route.js` and pass it to `sendTemplateEmail`. Validate count and size. This is a reuse of dash, not a parallel build.
  - `scheduled_reports.js` `runSchedule` branches on `packet_id`.
- *UI:*
  - Scheduled Reports screen: a "Packets" tab (builder: add reports with filters, add documents, order, cover, fan-out).
  - Schedule dialog (`components/internal/screens/reports/schedule_dialog.jsx`): pick a report or packet; frequencies now include quarterly and annually.
  - Run history: file downloads.
  - Report screen: "Download PDF" beside Print.
  - Owner portal statements: "Download packet".
- *Permissions:* `reports.schedule`; packet documents respect PLAT-01 visibility.

**Steps**
1. Choose the PDF approach (Research) and build `lib/pdf`.
2. "Download PDF" on reports.
3. geiger-dash route forward; `sendSuiteEmail` attachments.
4. Migration.
5. Packet builder and run.
6. Owner fan-out.
7. Quarterly and annual schedules.
8. Private storage and signed links.

**Research before building**
- Headless Chromium on Vercel (`@sparticuz/chromium` + `puppeteer-core`): bundle size vs function limits, cold-start time, Fluid compute. Compare with pdf-lib rendering of statement tables (geiger-forms already uses pdf-lib 1.17.1).
- Resend attachment limits (documented 40 MB per email after encoding) and the deliverability impact of large PDFs.
- Owner statement packet contents used by AppFolio and Buildium owners (statement, bills paid with invoice images, rent roll).

**Acceptance criteria**
- A monthly owner packet for 3 owners sends 3 emails, each with one combined PDF (statement + rent roll + paid-bill invoices) filtered to that owner.
- The PDF figures equal the on-screen report.
- Re-running the job the same day sends nothing new (`report_runs` uniqueness).
- A 60 MB packet sends a link instead of an attachment.
- Quarterly schedules run once per quarter.
- The geiger-dash route rejects attachments over its size limit with a clear error.

**Depends on / unblocks**
- Depends on: CORE-41, CORE-45 (owner balances), CORE-43, PLAT-01 (private files), CORE-08 (correct owner statements), CORE-10 (job runs).
- Unblocks: 53 and 55 (PDF), 61 (CAM statements).

**Open decisions**
- PDF engine: headless Chromium (high fidelity, reuses the HTML; heavier) or pdf-lib (lighter; separate layout code)?

#### CORE-58 · Custom report builder
- **MRI equivalent:** Report Builder (X.7), Report Design, Rapid Reports ("drag-and-drop ad hoc reports from pre-defined data points", exports to csv/xls/pdf). Report Gateway SQL authoring is not copied.
- **Status · priority · effort:** Missing · P2 · L
- **Refs:** Gap 7.2 · Inventory 7.2, 7.10, 7.11 · PMX-7.07, PMX-7.08, PMX-7.10

**Geiger today**
- Reports are code-only (`lib/reports/catalog.js`).
- `README.md:34` claims "a custom report builder". No such code exists (inventory 7.2).

**What's missing**
- Saved user-defined reports over whitelisted datasets: columns, filters, group-by, aggregates, sort, an optional chart.
- They must run, export, schedule and join packets like catalog reports.

**How to build**
- *Data model* (migration `custom_reports`):
  - **`property.custom_reports`:** `name`, `description`, `dataset`, `definition jsonb` `{columns:[{field,label,aggregate}], filters:[{field,op,value}], groupBy:[], sort:[], chart}`, `shared bool`, `folder`.
- *Server logic:*
  - `lib/reports/datasets.js`: a registry of datasets built on the existing sources (`sources_client.js` / `sources_server.js`). Each dataset declares `fields: [{ key, label, type: money|number|date|text|status, get(row, ctx) }]` with pre-joined names:
    - ledger lines (with account, property, unit, owner, vendor, entry source)
    - leases (with unit, property, tenant, rent, market rent)
    - units, tenants, bills, owners, vendors, work orders, online payments, prospects
  - `lib/reports/custom.js`: `customReportDef(row)` → a catalog-shaped definition (`key: custom:<id>`, `category: 'Custom'`, compute = filter → group → aggregate → sort).
  - `getReport` (`catalog.js:12`) resolves `custom:` keys from a registry the app or job pre-loads. The server job loads the `custom_reports` row by id.
  - Custom fields (PLAT-14 (gap 9.8)) plug in later as dataset fields.
  - No raw SQL; BI and SQL access is PLAT-16 (gap 7.7).
- *UI:*
  - "Custom Reports" in the Report Library (Custom category) plus "New report".
  - Builder screen `components/internal/screens/reports/custom_report_builder.jsx`:
    - dataset picker
    - field list (checkbox, label, up/down order)
    - filters
    - group-by and aggregates
    - live preview through `CatalogReport`'s renderer
    - save, share
  - Export, schedule and packets work automatically.
- *Permissions:* new `reports.build` (create and edit custom reports; inherits `view.reports`).

**Steps**
1. `datasets.js` (start with ledger lines, leases, units, bills, tenants).
2. `custom.js` compute, with fixtures.
3. Migration and data layer.
4. Builder UI.
5. Catalog and schedule resolution for `custom:` keys.
6. Add the remaining datasets.
7. Update `README.md:34` only once shipped.

**Research before building**
- The Rapid Reports and AppFolio Report Builder field sets, to choose the first datasets.
- Grid performance on 50k-row datasets in the browser vs server compute through the CORE-41 aggregates.

**Acceptance criteria**
- A user builds "Open bills by vendor and property, sum of balance, sorted descending", saves and shares it, exports it to Excel and schedules it monthly; the emailed CSV equals the screen.
- Totals equal the matching catalog report (A/P Aging total).
- A shared report is visible to other members; an unshared one is not.

**Depends on / unblocks**
- Depends on: CORE-41, CORE-42, CORE-57 (packets).
- Unblocks: 59 (custom-report widgets).

#### CORE-59 · Role-based dashboards
- **MRI equivalent:** RM role pages (property manager, regional, leasing, portfolio, service), the Property Manager Dashboard with ten panels, and Home Hubs/Gadgets (PMX-7.03–7.05).
- **Status · priority · effort:** Partial · P2 · M
- **Refs:** Gap 7.4 · Inventory 7.26, 7.27, 7.28 · PMX-7.03, PMX-7.04, PMX-7.05

**Geiger today**
- One fixed Overview: 4 KPI tiles plus widgets `RentTrendWidget`, `UnitMixWidget`, `LeasingFunnelWidget`, `GaugeWidget`, `TopPropertiesTable` and `NeedsAttentionCard` (`components/internal/screens/overview/property_overview.jsx:261-760`; screen at :763).
- Its rent figures read legacy fields: the CORE-07 defect, fixed in Part A.

**What's missing**
- A widget registry, role presets, and per-user layouts (add, remove, reorder).
- Accounting widgets: AR aging, AP due, cash by bank, trust shortfalls, approvals waiting, close status, budget variance.

**How to build**
- *Data model* (migration `dashboard_layouts`):
  - **`property.dashboard_layouts`:** `user_id` (null = role default), `role_key`, `name`, `widgets jsonb` `[{id, type, config, w, h}]`, `is_default`.
- *Server logic:*
  - `components/internal/screens/overview/widgets/` gets one file per widget, extracted from `property_overview.jsx`, plus `registry.js` `{ type, title, roles, load(ctx), Component }`.
  - Data comes from the CORE-41 aggregates and existing layers. Report-backed widgets reuse a report definition's `stats` or `sections` (`report_stat`, `report_table`) so the math isn't duplicated.
  - New widgets:
    - AR aging
    - bills due in the next 7 days
    - cash by bank account
    - trust shortfalls (`diagnose`, `postings.js:650-677`)
    - approvals waiting (CORE-47)
    - books closed through (CORE-40)
    - budget variance YTD (CORE-56)
    - lease expirations
    - make-ready board and work orders by status (data from COMM-owned layers)
    - custom report (CORE-58)
  - Presets:
    - Property manager
    - Accounting
    - Leasing
    - Maintenance
    - Executive/owner relations
  - Each preset maps to a default layout; the role comes from the member's role (`@geiger/rbac`).
- *UI:*
  - Overview header: preset switcher plus "Customize" (edit mode: add from a gallery, remove, reorder with up/down or drag, resize S/M/L).
  - "Reset to role default".
  - Loading per widget uses `LogoLoading` (32–40 px).
- *Permissions:* new `dashboards.manage` (edit role defaults). Anyone can edit their own layout.

**Steps**
1. Extract the existing widgets into the registry (no behaviour change).
2. Migration and data layer.
3. Presets and switcher.
4. Customize mode.
5. Accounting widgets.
6. Report-backed widgets.

**Acceptance criteria**
- The Accounting preset shows AR aging, AP due, cash by bank, trust shortfalls, approvals and close status, with totals equal to the matching reports.
- A user's layout persists across devices.
- Reset restores the role default.
- Rent KPIs equal the Rent Roll and Delinquency report figures (after CORE-07).

**Depends on / unblocks**
- Depends on: CORE-07, CORE-41; widgets light up as 40, 47, 56 and 58 land.
- Unblocks: none.

#### CORE-60 · Rentable items: parking, storage and garages
- **MRI equivalent:** PMX RM rentable items (non-unit garages, parking and storage), with an availability lookup and amendment-based lease attachment (PMX-1.09).
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Gap 1.3 · Inventory 1.18, 1.49, 2b.15, 2b.23 · PMX-1.09

**Geiger today** — text fields only:
- lease `parkingSpaces` and `storageUnit` (`components/internal/screens/leasing/config.jsx:161-162`)
- unit `storageUnit` (`units/config.jsx:204`)
- property `parkingSpaces` count (`properties/sections/property_tabs.jsx:111`)

None of these is read by billing (inventory 1.49). Parking can only be billed as a free-form recurring charge.

**What's missing**
- An inventory of leasable items with status and availability by date.
- Attaching an item to a lease from an effective date (recurring charge, optional deposit, amendment record).
- Releasing items at move-out.
- Reporting.

**How to build**
- *Data model* (migration `rentable_items`):
  - **`property.rentable_items`:**
    - `property_id`, `building_id`, `unit_id` (optional)
    - `kind` ('parking', 'garage', 'storage', 'bike', 'locker', 'other')
    - `code`, `location`, `size_label`, `sqft`, `market_rent`, `deposit`
    - `status` ('available', 'occupied', 'reserved', 'offline')
    - `current_lease_id`, `available_on`, `gl_account_id`
  - **`property.rentable_item_assignments`:**
    - `item_id`, `lease_id`, `starts_on`, `ends_on`, `rent`
    - `recurring_charge_id`, `addendum_id`
    - `create extension if not exists btree_gist;` with constraint `exclude using gist (item_id with =, daterange(starts_on, coalesce(ends_on,'infinity'), '[]') with &&) where (deleted_at is null)`
  - System accounts `parking_income` 4110 and `storage_income` 4120 via `ledger_ensure_accounts`.
- *Server logic:*
  - `lib/supabase/rentable_items.js` (entity factory) and `lib/leasing/rentable.js`:
    - `availableItems({ propertyId, kind, on })`
    - `attachItem({ leaseId, itemId, startsOn, rent, deposit })` → assignment, a recurring charge (lease, GL by kind, prorated first period per CORE-03), an optional deposit charge (CORE-04), a `lease_addenda` record (`lib/supabase/lease_addenda.js`), and the item set occupied
    - `releaseItem({ assignmentId, endsOn })` → end the charge and free the item
  - The move-out flow (CORE-02) calls `releaseItem` for all active assignments.
  - Migration helper: a "Convert text fields" action creates items from lease and unit text, for review.
- *UI:*
  - Property editor: a "Rentable Items" tab (child records, `entity/sections/child_records.jsx`) with a bulk-add wizard modelled on Add units (`properties/actions.jsx:118-228`).
  - Lease editor: a "Rentable items" section with an "Attach item" wizard (availability lookup by kind and date) and Release.
  - Report `rentable_items` (occupancy and revenue by kind) in the Library.
- *Permissions:* existing lease and property edit; `accounting.post` for charges.
- *Integrations:* amendment document and e-sign come from LEAS (geiger-docs adapter).

**Steps**
1. Migration and accounts.
2. Data layer.
3. Property tab and bulk add.
4. Attach and release on the lease, with charges.
5. Move-out hook.
6. Report.
7. Text-field conversion.
8. Hide the old text fields once converted.

**Acceptance criteria**
- Attaching garage G-3 to lease L from the 15th bills a prorated charge (Dr AR / Cr 4110) and then the monthly charge. G-3 shows occupied and cannot be attached to another lease for overlapping dates (the database rejects it).
- Releasing it at move-out ends billing.
- The availability lookup for a future date shows items that free up before then.
- The trial balance is Balanced.

**Depends on / unblocks**
- Depends on: CORE-03, CORE-02, CORE-04 (item deposits), LEAS (amendment documents).
- Unblocks: none.

**Open decisions**
- Should residents see available items and request them in the resident portal (PMX lets residents view availability)? If yes, it is a LEAS/portal follow-up.

#### CORE-61 · Commercial recoveries: CAM estimates from lease terms, caps, base years, gross-up
- **MRI equivalent:** PMX Commercial Management: expense pools, tenant recovery profiles, estimates from budget, year-end reconciliation, non-retail recovery caps.
- **Status · priority · effort:** Partial · P2 · L
- **Refs:** MRI Software product portfolio report, "small commercial landlords" · Inventory 6.75, 2b.16, 1.20

**Geiger today**
- CAM reconciliation (`components/internal/screens/accounting/cam_reconciliation.jsx`):
  - one pool of expense accounts per property-year (:45-68, :71-123)
  - share = unit sqft / Σ sqft of **included active leases** (:178-180; sqft from the unit, `accounting/utility_billing.jsx:72`), so the vacant share is passed to tenants
  - estimates = CAM income already credited (:143-149)
  - true-ups posted as charge or credit, key `cam:<recon>:<lease>` (:215-250)
- Commercial lease terms are saved but unread: `expenseStructure`, `sqftLeased`, `camCharges`, `tiAllowance` (`leasing/config.jsx:133-139`); grep finds no reader.
- Property `rentableSqft` is saved but unread (`properties/sections/property_tabs.jsx:55`).

**What's missing**
- Monthly CAM estimate billing from `camCharges`.
- Share by leased sqft over building rentable area.
- Multiple pools (CAM, taxes, insurance).
- Per-lease recovery terms: base year or expense stop, caps (cumulative, non-cumulative, compounding; controllable only), gross-up to an occupancy %, admin fee, excluded accounts, pro-rata for a partial year.
- A tenant CAM statement.

**How to build**
- *Data model:*
  - Recovery terms as `record_items` (owner_type `lease`, kind `recovery_term`). No new table; `metadata`:
    - `{ poolKey, method:'prorata'|'fixed_pct'|'fixed_amount', sharePct, denominator:'property_rsf'|'occupied'|'fixed', denominatorSqft }`
    - `{ baseYear, baseAmount, expenseStopPsf }`
    - `{ capType:'none'|'cumulative'|'non_cumulative'|'compounding', capPct, capControllableOnly }`
    - `{ grossUpPct, adminFeePct, excludedAccountIds[] }`
    - plus `starts_on`/`ends_on`
  - `cam_reconciliations.metadata.pools` = `[{ key, name, accountIds[], controllable:{accountId:bool}, variable:{accountId:bool} }]`, keeping `poolAccountIds` for old records.
  - Prior-year recoveries per lease are read from the prior reconciliation's `metadata.shares`.
- *Server logic:* `lib/commercial/recoveries.js` (pure). Per lease × pool:
  1. pool = Σ accounts (excluding the lease's excluded accounts)
  2. gross-up: variable part × (grossUpPct / max(occupancy%, …)) when occupancy < grossUpPct
  3. share = pool × pct, where pct = `sqftLeased` / property `rentableSqft` (or the override)
  4. less base-year amount or expense stop × sqft
  5. cap on the controllable part vs the prior year × (1 + cap%), by cap type
  6. add admin fee
  7. prorate by days occupied in the year
  8. less estimates billed → true-up

  The screen's existing `computed` (`cam_reconciliation.jsx:176-186`) calls this instead.
  - Estimates: `camCharges` → a monthly recurring charge (GL 4040) created when a commercial lease activates (CORE-01/CORE-03 pipeline), and re-estimated yearly from the CORE-56 budget pools (action "Update estimates").
- *Ledger:*
  - Under-billed: Dr AR (lease, tenant, unit, property) / Cr 4040 CAM Recoveries.
  - Over-billed: Dr 4040 / Cr AR (existing pattern, `cam_reconciliation.jsx:233-243`).
  - New key per pool: `cam:<reconId>:<leaseId>:<poolKey>`. Old single-pool records keep their keys.
- *UI:*
  - Lease editor (commercial): a "Recoveries" section (terms per pool).
  - CAM screen: a pools editor; a true-up table with per-lease breakdown columns (gross-up, base, cap, admin, prorate).
  - "Tenant statements" generates a PDF per lease via CORE-57 (email template `property.cam_statement`).
  - The expense-structure select drives defaults: NNN → all pools; Modified gross → taxes and insurance only; Gross → none.
- *Permissions:* `accounting.post`.

**Steps**
1. `recoveries.js` with worked examples (fixtures for each cap type and gross-up).
2. Read `sqftLeased` and property `rentableSqft`; switch the denominator.
3. Pools editor.
4. Lease recovery terms.
5. Estimate billing from `camCharges`.
6. Per-pool posting keys.
7. Tenant statements.

**Research before building**
- Common US lease clauses for small mixed-use and strip retail:
  - cumulative vs non-cumulative caps
  - gross-up at 95% (BOMA guidance)
  - base year vs expense stop
  - management/admin fee on CAM (typically 10–15%)
  - occupied vs rentable denominator
- BOMA Standard Methods of Measurement (rentable area definition).
- How a small-landlord tool (Rent Manager, AppFolio commercial) presents CAM statements.

**Acceptance criteria**
Worked example: a 10,000 RSF building at 80% occupancy; pool $50,000, of which $20,000 is variable. Tenant T: 2,000 sqft, base year $40,000, 5% non-cumulative cap on controllable, 10% admin, $3,000 estimates billed.
- Gross-up: variable 20,000 × 95/80 = 23,750 → pool 53,750.
- Share 20% = 10,750.
- Base year 20% × 40,000 = 8,000 → 2,750.
- Cap: prior-year recovery 2,500 × 1.05 = 2,625 → capped at 2,625.
- Admin fee 10% → 2,887.50.
- Less estimates 3,000 → credit $112.50: Dr 4040 / Cr AR (lease).

Also:
- Re-posting is a no-op.
- The trial balance is Balanced.
- The vacant share is no longer billed to tenants.
- A commercial lease with `camCharges` = $250 bills 4040 monthly.

**Depends on / unblocks**
- Depends on: CORE-01, CORE-03, CORE-56 (estimates from budget), CORE-57 (statements).
- Unblocks: 68.

#### CORE-62 · Commercial rent escalations: CPI and fixed annual
- **MRI equivalent:** Commercial Management rent steps; "CPI Manager: US CPI changes"; Lease Flow modelled rent steps.
- **Status · priority · effort:** Partial · P2 · S
- **Refs:** MRI Software product portfolio report, commercial depth · Inventory 2b.9

**Geiger today**
- The lease rent schedule supports dated steps by new amount or % (`components/internal/screens/leasing/sections/lease_money.jsx:78-121`, stored in `metadata.rentSchedule`).
- Steps are applied by hand ("Apply N due"). CORE-01 fixes application and billing.
- No CPI indexation (inventory 2b.9).

**What's missing**
- A step generator for fixed annual increases.
- CPI-indexed steps: index series, base month, lookback, floor and cap.
- CPI data refresh.
- An escalation notice.

**How to build**
- *Data model* (migration `index_values`):
  - **`property.index_values`:** `series_id`, `period` (YYYY-MM), `value numeric`, `fetched_at`. Global: `project_id` null allowed. Unique `(series_id, period)`.
- *Server logic:*
  - New schedule modes in `lease_money.jsx` / `lib/leasing/rent_schedule.js` (shared with CORE-01):
    - `fixed_annual` `{ pct or amount, every: 12 months, from }` → generates dated steps
    - `cpi` `{ seriesId (default CUUR0000SA0, CPI-U US city average NSA), baseMonth, lookbackMonths: 2, floorPct, capPct }` → at the effective date, rent = prior rent × clamp(CPI[t − lookback] / CPI[base] − 1, floor, cap)
  - Job `cpi-refresh` (monthly) fetches series from the BLS Public Data API v2 (registration key in env).
  - A step whose CPI value isn't yet published waits and is flagged.
- *UI:*
  - Rent schedule step dialog: mode options "Fixed annual" and "CPI"; a preview of the computed rent.
  - "Escalation notice" merge template (LEAS documents).
- *Permissions:* existing lease edit.

**Steps**
1. Migration.
2. `cpi-refresh` job (BLS).
3. Schedule modes and preview.
4. Hook into CORE-01's step application.
5. Notice template.

**Research before building**
- BLS API v2 limits and key terms (https://www.bls.gov/developers/).
- Common CPI clauses: lookback, CPI-U vs CPI-W, regional series, floors and caps, compounding.
- State rules on CPI escalators in residential leases, if any customer would use this residentially.

**Acceptance criteria**
- A 3% fixed annual schedule from 2027-01-01 on $4,000 generates $4,120 (2028) and $4,243.60 (2029).
- A CPI step with base 300.000, current 309.000, floor 2% and cap 5% gives +3%.
- With CPI at +6% the cap applies at 5%.
- An unpublished index flags the step and does not apply it.
- Billing follows the applied rent (CORE-01).

**Depends on / unblocks**
- Depends on: CORE-01.
- Unblocks: none.

#### CORE-63 · Ownership entities above the property
- **MRI equivalent:** Enterprise Ledger: legal entities (fund, LLC, parent) with their own books, and consolidation.
- **Status · priority · effort:** Missing · P2 · L
- **Refs:** Gap 1.1 · Inventory 1.46, 6.23, 6.24, 6.27 · [FS]

**Geiger today**
- One set of books per project (`ledger_core.sql:25, 51`).
- Owners are a ledger dimension (`ledger_lines.owner_id`, `ledger_core.sql:101`), but postings tag only the primary owner (`lib/supabase/ledger.js:300-307`; fixed by CORE-08).
- Portfolio "Ownership entity" is free text and unused (`portfolios/sections.jsx:300`).
- Owners have a `company` column (`full_build_tables.sql:438-452`).

**What's missing**
- An entity record: type, EIN, fiscal year, parent.
- Entity-scoped balance sheet and P&L, including non-trust accounts (an owner-operator's LLC operating cash, loans, fixed assets).
- Bank accounts owned by an entity.
- Parent roll-up (consolidation).
- Entity as the 1099 payer (CORE-55).

**How to build** (recommended: extend `owners` into the entity layer, so there is no parallel concept)
- *Data model* (migration `owner_entities`):
  - `owners` add `entity_type` ('individual', 'llc', 'lp', 'corporation', 'trust', 'fund'), `parent_owner_id uuid`, `fiscal_year_start int`, `is_operator boolean` (self-managed books).
  - `bank_accounts` add `owner_id` (entity that owns the account; null = management company or trust).
  - The ledger `owner_id` dimension = the entity whose books a line belongs to; null = the management company.
- *Server logic:*
  - `lib/reports/scope.js` (CORE-43) adds `entity:<ownerId>`: the entity plus descendants via `parent_owner_id`.
  - `post()` resolves `ownerId` for bank-account cash lines from `bank_accounts.owner_id` when the property has no owner.
  - Entity statements = CORE-44 views filtered by owner set (`ledger_period_totals` `p_owner_id` → extend to `p_owner_ids uuid[]`).
  - Owner-operators: their operating bank accounts carry their entity, so books are complete without trust.
- *UI:*
  - The Owners editor shows "Entity" fields and a "Child entities" tab.
  - Report filter options include "Entity: …".
  - The portfolio `ownershipEntity` text is replaced by a relation to an owner.
- *Permissions:* existing.

**Steps**
1. Decide the model (Open decisions).
2. Migration.
3. Scope resolution and the `p_owner_ids` RPC change.
4. Bank-account owner.
5. Entity statements.
6. Portfolio field relation.
7. Hand off to CORE-55 (payer) and CORE-65 (inter-entity).

**Research before building**
- How owner-operators with 3–10 LLCs use Buildium, Stessa and Baselane today: separate books per LLC, or one file with classes?
- What their CPAs need per LLC (balance sheet, P&L, 1099s, K-1 inputs).

**Acceptance criteria**
- An entity balance sheet for LLC X (with its properties and its own operating account) balances.
- A parent fund's consolidated statements equal the sum of its children (before CORE-65 eliminations).
- Manager-side fee lines (no owner) appear only in the management company's books.
- The trial balance per entity is Balanced. This needs CORE-49's per-property AP split and CORE-08's owner tagging.

**Depends on / unblocks**
- Depends on: CORE-08, CORE-43, CORE-44.
- Unblocks: 55 (entity payers), 65.

**Open decisions**
- Extend `owners` into entities (recommended; one concept for fee managers and owner-operators), or add a separate `legal_entities` table that owners link to (closer to MRI Enterprise Ledger; adds a second concept)?

#### CORE-64 · Markets, sub-markets and regional managers
- **MRI equivalent:** PMX RM markets, sub-markets and regional-manager records (PMX-1.07).
- **Status · priority · effort:** Missing · P3 · S
- **Refs:** Gap 1.4 · Inventory 1.46 · PMX-1.07

**Geiger today**
- Portfolios have a free-text `region` column and a `manager`/`managerMemberId` (`portfolios/sections.jsx:296-297`; `supabase/migrations/20260708132812_portfolios.sql:23-36`).
- This is a partial, tracking-only grouping, not the "Missing" the gap report states.
- No geographic market entity.

**How to build**
- *Data model:* migration `market_areas`, table `property.market_areas` (`name`, `parent_id` = sub-market, `regional_manager_member_id`). `properties` add `market_area_id`.
- *Server logic:* the `scope.js` filter `market:<id>` includes sub-markets.
- *UI:*
  - Settings → "Markets" list (`EntityListScreen`).
  - Property field "Market".
  - A report filter group.
  - The CORE-59 "Regional" preset scopes to the manager's markets.
- *Permissions:* `settings.manage`.

**Steps**
1. Migration.
2. Data layer and settings screen.
3. Property field.
4. Report scope and filter.
5. Dashboard preset.

**Acceptance criteria**
- A market filter includes sub-markets' properties.
- Reports scoped to a market equal the sum of its properties.

**Depends on / unblocks**
- Depends on: CORE-43, CORE-59.
- Unblocks: PLAT-08 (gap 9.3) (property-scoped security can scope by market).

#### CORE-65 · Inter-entity due-to/due-from and eliminations
- **MRI equivalent:** Enterprise Ledger automatic inter-entity offsets and elimination entries.
- **Status · priority · effort:** Missing · P3 · M
- **Refs:** Gap 6.8 · Inventory 6.26, 6.27

**Geiger today**
- No due-to/due-from (inventory 6.26).
- Most postings already balance per owner by construction. Example: management fees split owner and manager lines (`lib/ledger/postings.js:337-354`).
- Cross-entity cases leave entities unbalanced:
  - the manager pays an owner's expense from operating
  - an operating-to-trust transfer
  - bills split across owners (until CORE-49 splits AP)

**How to build**
- *Data model:* system accounts `due_from_entities` 1300 and `due_to_entities` 2400. The counterparty goes in line `metadata.counterpartyOwnerId`.
- *Server logic:*
  - `lib/ledger/entity_balance.js`: `balanceByEntity(lines)` groups lines by `ownerId` (null = manager). For each pair imbalance it appends Dr 1300 (creditor entity, counterparty = debtor) and Cr 2400 (debtor entity, counterparty = creditor).
  - It runs inside `post()` (`lib/supabase/ledger.js:321-343`) and `postOnce` (`lib/jobs/financial.js:117-126`) before `toRpcArgs`. The entry stays one balanced entry with the same key.
  - Consolidation reports (CORE-63) drop 1300/2400 lines whose counterparty is inside the consolidated set.
- *UI:*
  - A "Due to/from" section in entity statements.
  - A settle action: a transfer between entities posts Dr 2400 / Cr cash (debtor) and Dr cash / Cr 1300 (creditor), key `settle:<id>`.

**Steps**
1. Accounts.
2. `balanceByEntity` with fixtures.
3. Wire into both posting paths.
4. Elimination in consolidation.
5. Settle action.

**Acceptance criteria**
- The manager pays a $500 owner-A plumbing bill from operating:
  - Dr 5000 (A) 500 / Cr operating cash (manager) 500
  - plus Cr 2400 (A, cp manager) 500 / Dr 1300 (manager, cp A) 500
- Each entity's trial balance is Balanced.
- A consolidated manager + A view eliminates 1300/2400 to zero.

**Depends on / unblocks**
- Depends on: CORE-63, CORE-49.
- Unblocks: none.

#### CORE-66 · Accruals with auto-reversal; accrue unapproved bills
- **MRI equivalent:** PMX Financials accruals, including unapproved invoices (X5).
- **Status · priority · effort:** Missing · P3 · S
- **Refs:** Gap 6.11 · Inventory 6.74

**Geiger today** — no accrual or auto-reversing entries (inventory 6.74).

**How to build**
- *Data model:* system account `accrued_liabilities` 2050. JE `metadata.autoReverseOn` (date).
- *Server logic:*
  - JE dialog option "Auto-reverse on" (default: first day of next month).
  - Job `reversing-entries` (daily) posts the mirror of each due entry as a new `adjustment`, key `accrev:<entryId>`, `metadata.reverses`. It does not void.
  - Close checklist step (CORE-40) "Accrue pending bills": for bills Pending approval (CORE-47), or approved but unposted, with `bill_date ≤ period end`, post Dr expense (bill GL and dimensions) / Cr 2050, key `accr:<billId>:<YYYY-MM>`, auto-reverse the next day.
- *UI:* the JE dialog checkbox; a close-wizard step listing the bills to accrue.

**Steps**
1. Account.
2. JE option.
3. Job.
4. Close-wizard step.

**Acceptance criteria**
- A $1,200 accrual dated 31 March reverses on 1 April exactly once.
- March's P&L includes the expense; April nets to zero until the bill posts.
- The trial balance is Balanced.
- Accruing pending bills is idempotent per bill × month.

**Depends on / unblocks**
- Depends on: CORE-40, CORE-47, CORE-48 (job pattern).
- Unblocks: none.

#### CORE-67 · Job cost depth: cost codes, commitments, change orders, retainage, draws
- **MRI equivalent:** Job Cost: jobs, phases, cost codes, budget types, commitments, contracts and subcontracts, change orders, retainage, draws, recurring invoice templates (PMX-6.49).
- **Status · priority · effort:** Partial · P3 · L
- **Refs:** Gap 6.13 · Inventory 6.69, 6.70 · PMX-6.49

**Geiger today**
- Jobs (`property.cost_jobs`, `ledger_core.sql:173-193`) have one budget figure (`components/internal/screens/accounting/job_costing.jsx:76`).
- Cost = job-tagged expense and asset lines; bills can be tagged to a job (`accounting/bills.jsx:452`).

**How to build**
- *Data model* (migration `job_cost_detail`):
  - `property.job_cost_codes` (`code`, `name`, `category`)
  - `property.job_budget_lines` (`job_id`, `cost_code_id`, `original`, `notes`)
  - `property.job_commitments` (`job_id`, `vendor_id`, `cost_code_id`, `kind` contract/subcontract/po, `amount`, `retainage_pct`, `status`, `po_id` → COMM-14–15 (gap 5.1))
  - `property.job_change_orders` (`job_id`, `commitment_id`, `cost_code_id`, `amount`, `status`, `approval_request_id`)
  - `property.job_draws` (`job_id`, `draw_no`, `period_end`, `amount`, `funded_by` owner/lender, `status`)
  - Cost code on ledger lines: `ledger_lines.metadata.costCodeId` first; promote to a column if reports need an index.
  - System account `retainage_payable` 2300.
- *Ledger:*
  - Bill with retainage r%: Dr expense (job, cost code) full / Cr AP net / Cr 2300 retainage (vendor), key `bill:<id>`.
  - Release: Dr 2300 / Cr AP, key `retrel:<billId>`, then paid normally (CORE-52).
  - Owner-funded draw: contribution entry (`postings.js:318-332`) tagged `job_id`, key `draw:<drawId>`.
- *Server logic:* `lib/jobcost/summary.js`: per cost code, original + approved changes = revised; committed; actual; % complete; cost to complete.
- *UI:*
  - `job_costing.jsx` gains tabs: Budget by cost code, Commitments, Change orders (approval via CORE-47), Draws, and Summary (the job cost report).
  - Bills get a per-line cost code (CORE-49 lines).

**Steps**
1. Migration and account.
2. Cost codes and budget lines.
3. Commitments (link COMM POs).
4. Change orders with approval.
5. Retainage on bills.
6. Draws.
7. Summary report.

**Research before building**
- A CSI MasterFormat-lite code set suitable for unit turns and capex at small owners.
- AIA G702/G703 pay-application fields if draws to lenders are needed.

**Acceptance criteria**
- A $10,000 bill with 10% retainage posts Dr expense 10,000 / Cr AP 9,000 / Cr 2300 1,000; release moves 1,000 to AP; the trial balance is Balanced.
- Revised budget = original + approved change orders.
- Committed and actual per cost code tie to commitments and ledger lines.

**Depends on / unblocks**
- Depends on: CORE-47, CORE-49, COMM-14–15 (gap 5.1).
- Unblocks: none.

#### CORE-68 · Percentage rent and tenant sales reporting
- **MRI equivalent:** Advanced Retail: percentage rent calculations, breakpoints, sales tracking; tenants enter sales in Tenant Connect.
- **Status · priority · effort:** Missing · P3 · M
- **Refs:** MRI Software product portfolio report, commercial depth · `mri/notes/MRI Software product portfolio/mri_commercial_occupier_investment.md:54`

**Geiger today** — no percentage-rent terms (inventory 2b.16 notes "No percentage rent").

**How to build**
- *Data model:*
  - Terms as `record_items` (owner_type `lease`, kind `percentage_rent_term`), `metadata`:
    - `{ breakpointType:'natural'|'artificial', breakpoint, tiers:[{from, ratePct}] }`
    - `{ exclusions:[…], reportingFrequency, reconMonth }`
  - Migration `tenant_sales_reports`: table `property.tenant_sales_reports` (`lease_id`, `period` YYYY-MM, `gross_sales`, `exclusions`, `net_sales`, `source` staff/portal, `status` submitted/verified, `attachment`).
  - System account `percentage_rent_income` 4060.
- *Server logic:*
  - `lib/commercial/percentage_rent.js`: natural breakpoint = annual base rent / rate. Overage = Σ tiers over the breakpoint on net sales (YTD for annual reconciliation).
  - Posting: Dr AR (lease) / Cr 4060, key `pctrent:<leaseId>:<period>`; annual true-up key `pctrent:<leaseId>:<year>:recon`.
- *UI:*
  - Lease "Percentage rent" section.
  - A sales-entry list per property.
  - Reports: sales per sq ft and occupancy cost ratio.
  - Tenant self-reporting goes through the COMM commercial tenant portal.

**Steps**
1. Migration and account.
2. Terms section.
3. Sales entry.
4. Calculation and posting.
5. Annual reconciliation.
6. Reports.
7. Portal hook (COMM).

**Acceptance criteria**
- Base rent $60,000/yr at a 6% rate gives a natural breakpoint of $1,000,000.
- Annual net sales of $1,200,000 → $12,000 overage, posted once.
- Monthly estimates true up at year-end.
- The trial balance is Balanced.

**Depends on / unblocks**
- Depends on: CORE-61 (commercial lease plumbing), COMM tenant portal.
- Unblocks: none.

### Not building here

| MRI product | Why not | Revisit trigger |
|---|---|---|
| Enterprise Ledger: multi-currency and regional tax engines (gaps 6.14, 6.15) | US/USD target market; already rated Skip | A non-US customer segment |
| Investment Accounting, waterfalls, Investor Connect | Out of scope per the gap report (investor and fund accounting) | Syndicators or funds become a target segment |
| Report Gateway (SSRS / SQL report authoring) | CORE-58 covers small-manager ad-hoc needs; direct SQL/BI belongs to PLAT-16 (gap 7.7) | Customers ask for BI-tool connections |
| AP Automation (Nexus, international) | US-only scope; the US capture route is CORE-49 | International expansion |
| AP invoice OCR / AI extraction (AvidInvoice-style) | No-AI decision; `lib/ap/extract.js` is the hook | Suite AI package ships |
| Agora month-end reconciliation agent (PMX-10.04) | No-AI decision; CORE-40 checks are the non-AI groundwork | Suite AI package ships |
| Advanced Retail sales ingestion (OnLocation footfall, POS feeds) | Target is small mixed-use landlords; manual or portal sales entry (CORE-68) is enough | Retail-centre customers |
| Budgeting & Forecasting multi-user editing and security teams | Enterprise budgeting process; single-editor versions (CORE-56) fit 10–500 units | Customers with budget committees |
