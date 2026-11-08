# 7. Outside the US: what Property Tree teaches

Geiger is not entering Australia, New Zealand, the UK, South Africa or Asia. This section uses MRI's international lines for one purpose. **Property Tree (Australia) and Palace (New Zealand) are Geiger's closest product twins.** They sell to the same small-agency buyer, price per property, and include unlimited users, owner and tenant portals, trust accounting, maintenance, inspections and AI in every tier. They also offer 50+ integrations including Xero, and promise setup "within 48 hours". The items below close the parity gaps that matter to a US manager with 10–500 units and that no other file owns.

> **Cross-references.** References like `CORE-40 (gap 6.1)` name the owning item and its gap; the gap → item table in `README.md` resolves any bare gap number. Code was checked at HEAD `fecb165`.

### Scope
- **MRI products covered:**
  - Property Tree and its add-ons: Property Tree Connect, Key Automate, Invoice Automate, Inspection Manager, Maintenance Plus, Business Insights (now Agora Insights), the "Alex" AI Assistant and the Property Tree Assistant
  - Palace, Rest Professional, Strata Master, and the VaultRE / EagleCRM / Box+Dice CRMs ("MRI CRM")
  - UK: Qube PM / Horizon, MRI Agency Solutions, and the social housing and council suites (Orchard, Castleton, Housing Partners, Capita One)
  - South Africa: Property Central (formerly MDA), PropSys, Rentbook and TPN
  - MRI Simplicity (Asia), MRI Intermodal, MRI Managed Services
- **Geiger areas touched:**
  - geiger-dash pricing and billing (`lib/pricing`, `lib/billing`, `app/pricing`, Stripe webhook)
  - Property plan state, Overview, and Settings (Integrations, Company Profile, and new Setup & Go-live and Plan & Usage screens)
  - Accounting: ledger, bank reconciliation, trust reports and conversion
  - Report catalog and jobs
  - Keys (`record_items` kind `key`) and owner resolution (`property_owners`)
  - A new Tasks screen

### What Property Tree and Palace sell today (checked 5 Nov 2026)
- **Pricing** ([pricing page](https://www.mrisoftware.com/au/products/property-tree/pricing-1/)):
  - **Tiers:** Base A$130 ("Stay Compliant"), Premium A$160 ("Advanced Automation") and Pro A$205 ("Full Ecosystem"), each per 100 properties per month, excluding GST.
  - **Inconsistencies:** The hero says "From $126", and the "per 100 properties\*" footnote is never explained. The [product page](https://www.mrisoftware.com/au/products/property-tree/) lists Premium and Pro as "contact sales", so MRI's own pages disagree.
  - **Terms:** There is no property limit. Customers are "up and running within 48 hours" with a "dedicated onboarding team".
  - **US-dollar equivalent:** About A$1.30–2.05 per property, which is roughly US$0.85–1.35 at about 0.65 USD to the AUD (check the rate). Geiger's internal $1.00 per unit sits in the same band.
- **Every tier includes:**
  - trust-accounting compliance and unlimited trust accounts
  - SMS and email, automated communication and performance dashboards
  - a mobile app, and document management with unlimited storage
  - owner and tenant portals
  - task management and custom workflows
  - the Property Tree Assistant (AI email drafting)
  - 50+ partner integrations, including Xero and MRI CRM
  - unlimited users
  - comprehensive reporting, maintenance management, inspection scheduling and commercial properties
  - the add-ons' base features:
    - **Key Automate:** a virtual key cabinet, key assignment and an audit trail.
    - **Invoice Automate:** AI invoice processing, tenancy invoices and duplicate flagging.
    - **Business Insights:** contacts, creditors and **ownership liability** boards.
- **Premium adds:**
  - **Invoice Automate:** recurring invoices, instalments, reminders, an owner notice when an invoice arrives, and water-bill automation.
  - **Inspection Manager:** paperless condition reports with e-signature, a mobile app and tenant-assisted inspections.
  - **Maintenance Plus:** AI workflows, requests from any channel, automated invoice entry, tradie (contractor) compliance and maintenance insights.
- **Pro adds:**
  - AI inspection comments, image recognition, 360° inspections and asset detection.
  - An AI Assistant website chatbot whose leads flow into the CRM.
  - Business Insights statistics, leasing benchmarks, market insights and custom dashboards.
- **Proptech Labs** (acquired 7 Oct 2025) brought maintenance, invoicing, key, inspection and AI automation tools into Property Tree and Palace ([MRI](https://www.mrisoftware.com/au/news/mri-software-acquires-proptech-labs-to-deliver-all-in-one-property-management-solutions-across-australia-new-zealand)). Key Automate was to be included in subscriptions by 31 Dec 2025.
  - Key Automate's cabinet colour-codes each key as Check-in, Check-out, Ready to collect, Overdue or Missing.
  - Staff book a key out to a tenant, trade or owner with dates; a calendar, overdue alerts and a history log support follow-up ([help article](https://help.proptechlabs.com/en/articles/10004225-overview-of-key-automate)).
- **Palace** ([MRI NZ](https://www.mrisoftware.com/nz/products/palace/)):
  - **Scale:** 1.2K+ agencies, 7.6K+ users, 230K properties and 52 partners.
  - **Trust accounting:** "accurate reconciliations to audit-ready reports".
  - **Other features:** Healthy Homes compliance, plus Maintenance Plus, Inspection Manager, Invoice Automate, Secure Sign, Vault CRM, Agency Studio websites and a Social Housing variant.
  - **Price:** none published.
- **The trust workflow MRI teaches** ([MRI training catalogue](https://mrisoftware-apac.skilljar.com/)) covers bank reconciliation, owner payments and end of month, change of ownership, and end of financial year.

### Parity checklist

| Property Tree / Palace capability (tier) | Geiger today (verified at `fecb165`) | Owner |
|---|---|---|
| Published per-property price, no property cap (all) | **Missing.** No price anywhere. The landing FAQ promises "a simple per-unit monthly price" (`components/landing/landing_page.jsx:22-23`). geiger-dash prices Property as a $10 "core" app with no unit metric (`geiger-dash/lib/pricing/plans.js:91, 104, 112-121`). | INTL-01, INTL-02 |
| Unlimited users (all) | **Conflict.** geiger-dash charges $1 for each collaborator over the plan allowance (`geiger-dash/lib/pricing/plans.js:125, 259`). | INTL-01 (open decision) |
| Setup within 48 hours, dedicated onboarding team, migration (all) | **Missing.** There is no setup flow. `NoProjectState` is a dead end (`components/internal/shared/project_states.jsx:18-21`), and there is no import. | INTL-03, INTL-04, INTL-06; import = PLAT-03–04 (gap 9.1) |
| Trust accounting compliance (all) | **Partial.** Trust cash is kept separate. Trust positions with shortfall checks exist (`lib/reports/ledger_math.js:364-375`; `lib/ledger/postings.js:650-677`). Manual bank reconciliation works (`components/internal/screens/accounting/bank_reconciliation.jsx:276-300`). There is no three-way reconciliation, no printable reconciliation and no month sign-off. | INTL-05, INTL-08; month close = CORE-40 (gap 6.1) |
| Unlimited trust accounts (all) | **Parity.** Any number of Trust or Security deposit bank accounts can be added (`components/internal/screens/accounting/bank_accounts.jsx:56, 131`). | — |
| Ownership liability board (Business Insights, all) | **Partial.** Only the "Trust positions" section of Deposit Detail (`lib/reports/defs_financial.js:521-526, 568-579`). | INTL-05 |
| Change of ownership (trust training module) | **Saved-unused.** `property_owners.starts_on/ends_on` exist, but every owner resolver ignores them (`lib/supabase/ledger.js:297-306`; `lib/payments/context.js:36-45`; `lib/jobs/financial.js:92-94`). | INTL-11 |
| Xero integration (all); 50+ integrations | **Missing.** The "Accounting export" card is disabled (`components/internal/screens/settings/integrations.jsx:34, 127-134`). Only Stripe and email are live. | INTL-07, INTL-09, INTL-13; directory = PLAT-12 (gap 9.6) |
| Key Automate: virtual cabinet, assignment, overdue alerts, audit trail (all) | **Tracking-only.** Three unconnected key lists with different statuses (`components/internal/screens/properties/record_kinds.js:150-175`; `components/internal/screens/units/config.jsx:263, 519-543`; `components/internal/screens/leasing/moves.jsx:235-240, 510-522`). No history and no reminders. | INTL-10 |
| Task management (all); Palace "task overview" | **Partial.** To-dos exist only inside modules: prospect follow-ups, lease onboarding and the turn checklist (inventory 2a.19, 2b.8, 5.75). | INTL-12 |
| Owner and tenant portals; Property Tree Connect tenant app | **Working** web portals (`lib/portal/*`). There is no app, and the data is not secure. | PLAT-01; app = LEAS-48 (gap 4.4) |
| SMS and email; automated communication | Email works. SMS is a stub (`lib/messaging/deliver.js:17-24`). Jobs are not scheduled (`vercel.json`). | LEAS-40, LEAS-41, LEAS-43, LEAS-44, LEAS-57 (gap 4.1), 3.8; CORE-10 (gap 0.10) |
| Custom workflows | **Partial.** The builder has 5 step types (inventory 9.14–9.22). | PLAT-13 (gap 9.7) |
| Performance dashboards, comprehensive reporting | **Partial.** 15 fixed reports (`lib/reports/catalog.js:10`). The Overview rent KPIs read stale fields (inventory 7.26). | CORE-07 (gap 0.7), 7.1–7.4 |
| Leasing benchmark, market insights (Pro) | **Missing.** Needs data across customers. | Not building |
| Mobile app (staff) | Responsive web only (inventory 9.40). | COMM-05–07 (gap 5.2) |
| Document management, unlimited storage | The Document Library works. Files sit in a public bucket (`lib/supabase/property_storage.js:7-10`). geiger-dash Basic includes 5 GB (`geiger-dash/lib/pricing/plans.js:39`). | PLAT-01; allowance = INTL-01 |
| Maintenance; Maintenance Plus requests from any channel, tradie compliance, insights | **Working** work orders and portal requests. Vendor COI and licence tracking works (inventory 8.15–8.16). No email or SMS intake. | COMM (maintenance) |
| Inspections; paperless condition reports with e-sign; tenant-assisted inspections | **Partial.** No templates, scheduling or resident self-inspection (inventory 2b.90–2b.93). | COMM-02, COMM-03, COMM-04, COMM-07 (gap 5.3); e-sign = LEAS-09–10 (gap 2.5) |
| Invoice Automate (non-AI): duplicate flagging, recurring bills, instalments, owner notice, tenancy invoices | **Missing.** The invoice number is stored but never checked for duplicates (`components/internal/screens/accounting/bills.jsx:445`; `lib/portal/vendor.js:218-251`). Recurring bills are absent (inventory 6.44). Chargebacks are manual (inventory 5.38). | CORE-49 (gap 6.12), 11.5; COMM-01 (gap 5.4) |
| AI invoice processing, AI maintenance workflows, AI inspections, AI Assistant chatbot, Property Tree Assistant | **Missing.** "AI Assistant" opens Coming Soon (`components/internal/screens/registry.jsx:85-87`; `components/internal/sidebar/sidebar_nav.jsx:208`). | INTL-14 (deferred) → PLAT AI groundwork |
| Secure Sign (Palace) | **Tracking-only.** | LEAS-09–10 (gap 2.5) |
| Healthy Homes compliance (Palace); the US equivalent is permits, rental registration and fire inspections | **Working.** Compliance items with a staff digest (inventory 1.32). | — |
| Agency Studio websites; chatbot lead capture | **Missing.** No public listing pages. | LEAS-01 (gap 2.2), 2.7 |
| Commercial properties included | **Partial.** Basic CAM true-up only (inventory 6.75). | Out of scope here |
| Enterprise-level data security | **Not production-safe.** RLS is demo-open. | PLAT-01 |
| Support, training, webinars | The geiger-dash Help Center exists (`/help/[...slug]`, dash README). Property links to none of it. | INTL-03 (help links); services: see Not building |
| MRI CRM sync (Vault, Eagle, Box+Dice) | Not applicable. | Not building |
| End of financial year; the US equivalent is year-end and 1099s | Vendor 1099 report only. | CORE-40 (gap 6.1), 6.5 |

### Summary

| ID | Feature | MRI product | Geiger today | Priority | Effort |
|---|---|---|---|---|---|
| INTL-01 | Published per-unit pricing, plans and limits (geiger-dash) | Property Tree pricing | Missing | P1 | L |
| INTL-02 | Billable-unit metering and plan enforcement in Property | Property Tree "per 100 properties" | Missing | P1 | M |
| INTL-03 | Guided setup checklist | Property Tree 48-hour setup, onboarding team | **Done** — geiger-dash help pages still to write (2026-11-08) | P1 | M |
| INTL-04 | Opening balances and conversion wizard | Property Tree onboarding and migration | Done | P1 | L |
| INTL-05 | Three-way trust reconciliation and printable bank reconciliation | Property Tree / Palace trust compliance; ownership liability board | Done | P1 | M |
| INTL-06 | Go-live readiness check and pre-launch reset | Property Tree "up and running within 48 hours" | Missing | P1 | M |
| INTL-07 | Accountant export files (QuickBooks, Xero, IIF) | Property Tree Xero integration | **Done** — import into a QuickBooks/Xero sandbox not yet verified (2026-11-08) | P1 | M |
| INTL-08 | Monthly trust audit pack (state profiles, sign-off, exceptions) | Palace "audit-ready reports" | Missing | P2 | M |
| INTL-09 | Accounting sync engine and QuickBooks Online connector | Property Tree Xero integration | Missing | P2 | L |
| INTL-10 | Key register and checkout | Key Automate | Tracking-only | P2 | M |
| INTL-11 | Change of ownership | Property Tree change-of-ownership process | Saved-unused | P2 | M |
| INTL-12 | Staff tasks and follow-ups | Property Tree task management; Palace task overview | Partial | P2 | M |
| INTL-13 | Xero connector | Property Tree Xero integration | Missing | P3 | M |
| INTL-14 | Property Tree AI parity (deferred; hook points only) | Invoice Automate AI, AI Assistant "Alex", Property Tree Assistant | Missing | Skip (deferred) | S |

### Build order
1. **INTL-01:** The pricing decisions come first, because the published price, the landing copy and INTL-02 all hang off them. The geiger-dash work can run in parallel with the Property items.
2. **INTL-02:** Needs INTL-01. The trigger only becomes binding after `PLAT-01`.
3. **INTL-03:** The setup shell that INTL-04, INTL-06 and INTL-07 link into. It has no hard dependencies.
4. **INTL-04:** Needs CORE-04 (gap 0.4) (deposits on the ledger) and CORE-08 (gap 0.8) (co-owner postings). PLAT-03–04 (gap 9.1)'s file parser is optional.
5. **INTL-05:** Needs INTL-04 (bank starting points) and CORE-04 (gap 0.4) and 0.8.
6. **INTL-06:** Checks everything above. Its blockers need `PLAT-01`, CORE-10 (gap 0.10) (scheduler), CORE-01 (gap 0.1) (rent accounts) and the LEAS item that routes payment payouts.
7. **INTL-07:** Needs a correct ledger (CORE-01 (gap 0.1)–0.4). It is a cheap launch-day answer to "does it work with QuickBooks?".
8. **INTL-08:** Builds on INTL-05. Month locking needs CORE-40 (gap 6.1), and emailed packs need CORE-57 (gap 7.5).
9. **INTL-09:** Reuses INTL-07's journal builder and mapping. It needs `PLAT-01` for server-side secrets and RLS.
10. **INTL-10:** Independent. It touches COMM (work orders) and LEAS (moves) screens.
11. **INTL-11:** Ship together with CORE-08 (gap 0.8), because both rewrite the same owner resolvers.
12. **INTL-12:** Its digests need CORE-10 (gap 0.10).
13. **INTL-13:** After INTL-09, and only on demand.
14. **INTL-14:** A copy and claims check before launch; the hook points belong to other files.

### Items

#### INTL-01 · Published per-unit pricing, plans and limits (geiger-dash)
- **MRI equivalent:** MRI Property Tree pricing: Base, Premium and Pro at A$130, A$160 and A$205 per 100 properties per month, excluding GST. Every tier includes unlimited users, unlimited trust accounts and unlimited document storage, with no property cap and a dedicated onboarding team.
- **Status · priority · effort:** Missing · P1 · L
- **Refs:** Inventory 9.7 · `components/landing/landing_page.jsx:22-23` · `docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md:405-411`

**Geiger today**
- **Property has no price.**
  - The landing FAQ promises "A simple per-unit monthly price, with online payments, screening, portals and maintenance included" (`components/landing/landing_page.jsx:22-23`).
  - The `billing.manage` permission gates nothing (`lib/rbac.js:8`).
- **Billing lives in geiger-dash and covers the whole suite.**
  - **Plans:** Basic $29, Plus $79 and Pro $119, with project, seat, storage, AI and email allowances (`C:\Pro\geiger-dash\lib\pricing\plans.js:28-72`).
  - **Property's price:** a "core" app at the $10 category rate (`plans.js:91, 104`), with no unit metric (`plans.js:112-121`).
  - **Seats:** extra collaborators cost $1 each (`plans.js:125, 259`).
- **Checkout is a one-off payment, not a subscription.**
  - Checkout is a one-off Stripe Checkout payment labelled an "estimate" (`app/pricing/actions.js:116, 125`).
  - The webhook calls itself a "one-time-payment demo" (`app/api/stripe/webhook/route.js:9-12`).
  - A plan runs 30 or 365 days, then lapses into a 30-day grace period (`lib/billing/store.js:19-21`; `lib/billing/plan_state.js:8, 20-64`).
  - There are no recurring subscriptions anywhere in geiger-dash: a grep for `mode: "subscription"|subscriptions.create|invoice.paid|billing_portal` finds nothing.
- **The internal plan:**
  - **Tiers:** Starter is free up to 10 units. Growth is $1.00 per unit with a $25 minimum. Scale is $0.75 per unit with a $150 minimum.
  - **Overclaims:** The copy promises "embedded banking", an "AI leasing agent" and an "AI copilot", none of which exist (`docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md:405-411`).

**What's missing**
- A published Property price, showing the per-unit maths, the minimum and the volume break.
- Recurring billing that follows the unit count.
- Plan copy that lists only features that have shipped.
- Decisions on seats, storage and email allowances for Property buyers.

**How to build** (mostly in `C:\Pro\geiger-dash`)
- *Data model:* No new table.
  - Extend the versioned pricing config (`public.pricing_versions`, read in `lib/pricing/queries.js` and normalised in `lib/pricing/config.js`) with a `propertyPricing` block: `{ freeUnits, minimumMonthly, tiers: [{ upTo: 500, perUnit: 1.00 }, { upTo: null, perUnit: 0.75 }], includedEmailsPerUnit, includedStorageMbPerUnit }`.
  - Add `propertyUnits` to `metricConfig` (shown only when Property is picked) and to `planSnapshot`.
  - On `organizations.metadata.subscription`, record `stripeSubscriptionId`, `stripeCustomerId` and `metrics.propertyUnits`.
- *Server logic:*
  - `createPricing().computeEstimate` gains `propertyCost(units)`, using graduated tiers plus the minimum. Property stops counting toward the `core` app allowance.
  - Add a new `lib/billing/subscriptions.js` with `ensurePropertySubscription(org, units)` and `cancelPropertySubscription(org)`.
  - **Stripe Price:** monthly, `billing_scheme=tiered`, `tiers_mode=graduated`, with tiers `[{up_to:25, flat_amount:2500, unit_amount:0}, {up_to:500, unit_amount:100}, {up_to:'inf', unit_amount:75}]`. The flat first tier implements the $25 minimum.
- *API routes / jobs:*
  - The geiger-dash webhook (`app/api/stripe/webhook/route.js`) handles `customer.subscription.created|updated|deleted`, `invoice.paid` and `invoice.payment_failed`, writing status and `currentPeriodEnd` to the org.
  - Add a new `app/api/billing/portal/route.js` that opens a Stripe Customer Portal session (card and invoices).
  - Syncing the unit quantity is INTL-02.
- *UI:*
  - The geiger-dash `/pricing` configurator (`components/pricing/plan_configurator`) shows a units slider and per-unit maths when Property is picked.
  - The Property product page in geiger-dash shows the price table.
  - The Property landing FAQ (`components/landing/landing_page.jsx:22-23`) states the real price and drops "screening included" (coordinate with the PLAT marketing-claims audit).
- *Permissions:* Org owners and admins in geiger-dash buy. Property's `billing.manage` only links out (INTL-02).
- *Integrations:* Stripe Billing (subscriptions, tiered prices, Customer Portal). Suite reuse: geiger-dash is the billing owner, so no parallel billing is built in Property.

**Steps**
1. Get the open decisions below answered and write them into a new pricing version through `/admin/pricing`.
2. Add `propertyPricing`, `propertyUnits`, `propertyCost` and the snapshot fields to `lib/pricing/{plans,config}.js`. Unit-test 0, 10, 25, 26, 500, 501 and 2,000 units.
3. Create the Stripe Product and tiered Price in test mode, using a script in `scripts/` or the admin pricing screen.
4. In `app/pricing/actions.js`, create or update the Property subscription. Keep the one-off flow for the other apps until the suite decides.
5. Add the webhook handlers and the Customer Portal route.
6. Update the pricing page, the Property product page and the Property landing FAQ copy.
7. Run a test-mode purchase end to end.

**Research before building**
- Stripe tiered pricing (graduated vs volume) and how to implement minimums: https://docs.stripe.com/products-prices/pricing-models#tiered-pricing
- Quantity changes and proration: https://docs.stripe.com/billing/subscriptions/upgrade-downgrade
- Billing Meters as an alternative to quantity: https://docs.stripe.com/billing/subscriptions/usage-based
- US competitor floors (`docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md:17-19`):
  - AppFolio: about $1.40 per unit, plus an onboarding fee
  - Yardi Breeze: $1.00 per unit, $100 minimum
  - Also check Buildium, Rentvine and DoorLoop
- Does geiger-dash collect SaaS sales tax (Stripe Tax)? Several states tax SaaS.

**Acceptance criteria**
- Estimates on graduated pricing:
  - 0–25 units → $25
  - 100 → $100
  - 500 → $500
  - 600 → $575 (graduated), or $450 if volume pricing is chosen
- A test-mode org that buys Property gets a live Stripe subscription. `metadata.subscription.status` follows `invoice.paid`, `invoice.payment_failed` and cancellation.
- The pricing page, the Property product page and the Property landing FAQ show the same numbers. None of them mentions AI, banking or bundled screening.
- Existing purchases of other apps are unchanged (snapshot limits still apply).

**Depends on / unblocks** — Unblocks INTL-02 and INTL-06. Coordinate with the PLAT marketing-claims audit.

**Open decisions**
- Move the whole suite to Stripe subscriptions, or add a Property-only subscription alongside the one-off suite checkout?
- A free tier up to 10 units (as the internal plan says), or a $25 minimum from the first unit?
- Graduated pricing ($0.75 only on units above 500) or volume pricing ($0.75 on every unit once over 500)? Keep the Scale tier's $150 minimum?
- "Unlimited users": do Property buyers get unlimited seats, or do Property staff count as geiger-dash collaborators at $1 each?
- Do Property's resident emails (reminders, receipts) draw on the org's email purse, or does the unit price include an allowance? The same question applies to document storage, since Basic includes 5 GB.
- Is a billable unit any non-draft unit, or only units that are occupied or available? Are Down and Non-revenue units billed?

#### INTL-02 · Billable-unit metering and plan enforcement in Property
- **MRI equivalent:** Property Tree is priced per 100 properties with no property cap. MRI owns the metering.
- **Status · priority · effort:** Missing · P1 · M
- **Refs:** Inventory 9.7

**Geiger today**
- **Property never reads the org's plan.**
  - Projects load from `public.projects` with `organization_id` (`context/project-context.js:63-67`), but nothing reads `organizations.metadata.subscription`.
  - A grep for `entitlement|subscription` in `lib/` finds only unrelated hits.
- **The geiger-dash usage page** counts only projects: "Only projects has a real 'used' count today" (`app/org/[ORGID]/usage/page.js:46-48`).
- **Units:**
  - **Statuses:** Occupied, Vacant, Notice, Make-ready, Down or Draft (`supabase/migrations/20260715161206_units.sql:38-39`).
  - **Create paths:** the Add units wizard (`components/internal/screens/properties/actions.jsx:81-126`, up to 200 at a time), the Units list (`components/internal/screens/units/config.jsx:371`) and the future import (PLAT-03–04 (gap 9.1)).

**What's missing**
- A unit count per org.
- Pushing that count to Stripe.
- Showing usage in the app.
- Defined behaviour when the plan lapses.

**How to build**
- *Data model:* Migration `billable_units` (`npm run db:new -- billable_units`).
  - **`property.billable_unit_count(p_organization_id uuid) returns integer`**, `security definer`:
    - Counts `property.units` where `deleted_at is null` and `status <> 'Draft'` (per the INTL-01 decision), with `project_id in (select id from public.projects where organization_id = p and deleted_at is null)`.
    - Revoke execute from `anon` and `authenticated`; grant it to `service_role`.
  - **`property.project_unit_count(p_project_id uuid)`**, `security invoker`, for in-app display.
  - **`property.project_limits`** (`project_id` primary key, `unit_cap`, `read_only`, `updated_at`): written by the service role only. A `before insert` trigger on `property.units` rejects inserts over `unit_cap` and only becomes binding after `PLAT-01`.
- *Server logic:*
  - **geiger-dash `lib/billing/usage.js`, `syncPropertyUnits(orgId)`:**
    - calls the RPC through the service-role client (`.schema('property')`)
    - updates the Stripe subscription item quantity with `proration_behavior: 'none'`
    - writes `metrics.propertyUnits` and `usage.propertyUnits`
    - upserts `project_limits` for each project in the org
  - **Property `lib/billing/plan.js`, `getProjectPlan(projectId)`**, returning `{ phase, units, freeUnits, readOnly, overFreeTier, estimate }`:
    - It reads the project's org from a new geiger-dash endpoint, `GET /api/orgs/[id]/entitlements`, which returns `getOrgEntitlements` plus `derivePlanState`.
    - This keeps one source of truth instead of copying geiger-dash logic.
- *API routes / jobs:*
  - geiger-dash cron `/api/cron/property-usage`, daily (geiger-dash already runs crons; Property's `vercel.json` stays cron-free).
  - Property `app/api/plan/route.js`: GET, guarded by `requireStaff` (`lib/messaging/auth.js:23`).
  - Property's import (PLAT-03–04 (gap 9.1)) calls the usage sync when it finishes.
- *UI:*
  - **Plan state and banners:** `context/plan-context.js` (a PlanProvider inside the project shell) feeds banners through `context/banner-context.js`: "Trial ends in N days", "Payment failed", "Grace period: N days left", "Free plan limit reached".
  - **New "Plan & Usage" screen** (`components/internal/screens/settings/plan_usage.jsx`), registered in `registry.jsx` and the `sidebar_nav.jsx` Settings group:
    - shows billable units by property and the estimated monthly price
    - has a "Manage billing" link to geiger-dash `/billing`
  - **Lapse (phase `grace` or `expired`):** the staff workspace becomes read-only, following the pattern of `components/internal/shared/no_access.jsx`. Settings → Plan & Usage and report exports stay open.
  - **Rule:** Resident, owner and vendor portals, Stripe webhooks, payment posting and trust reports **never** stop on lapse. Tenants must still be able to pay, and trust money must stay auditable.
- *Permissions:* `billing.manage` (`lib/rbac.js:8`) gates Plan & Usage. This is its first real use.
- *Integrations:* Stripe quantity, through geiger-dash only.

**Steps**
1. Check that the names `project_limits` and the RPCs are unused in the live database, then write the migration.
2. Add the geiger-dash entitlements endpoint (auth by session cookie; caller must be an org member).
3. Add the geiger-dash usage sync and cron, and push the Stripe quantity.
4. Add the Property plan route, context and banners.
5. Build the Plan & Usage screen.
6. Add the free-tier check to the Add units wizard and unit create (UX), backed by the trigger.
7. Add the lapse gate and test that portals and payments are unaffected.

**Research before building**
- Can Property's server call geiger-dash `/api/*` with the shared session? Check geiger-dash `proxy.js` and `lib/product-routes.mjs` (same origin, per the geiger-dash README).
- Bill on the unit count at the end of the period, or on the peak during it? Billing Meters support `max` aggregation; quantity updates do not.

**Acceptance criteria**
- An org with two projects holding 120 and 30 non-draft units, plus 5 draft units, counts as 150. After the job runs, the Stripe quantity is 150.
- Soft-deleting a unit lowers the count at the next sync.
- On the free tier at 10 units, adding one more is blocked with an upgrade prompt. After `PLAT-01`, a direct API insert is rejected too.
- In the grace phase, staff screens are read-only, while a resident portal payment still succeeds and posts to the ledger, and Deposit Detail still runs.
- With `billing.manage` off, Plan & Usage is hidden.

**Depends on / unblocks** — Depends on INTL-01 and `PLAT-01` (trigger, RPC grants). Unblocks INTL-06.

**Open decisions**
- The billable-unit definition and peak vs end-of-period billing (shared with INTL-01).

#### INTL-03 · Guided setup checklist ("Get started")
- **MRI equivalent:** Property Tree promises "up and running within 48 hours" with a "dedicated onboarding team" and tailored onboarding that includes migration.
- **Status · priority · effort:** Missing · P1 · M
- **Refs:** Inventory 9.58 · gap report, "Price and setup" note

**Geiger today**
- **No first-run flow.** A new project opens straight onto an empty Overview.
  - `NoProjectState` is "a dead-end state, not an onboarding step" (`components/internal/shared/project_states.jsx:18-21`).
  - Overview has only per-widget empty states (`components/internal/screens/overview/property_overview.jsx:430, 640, 998-1079`).
- **Data a checklist could read already exists:**
  - the company profile, including state and licence number (`components/internal/screens/settings/shared.js:25-37`)
  - the chart auto-seed (`lib/ledger/store.js:9-22, 45-53`)
  - bank account types
  - the property "no operating account linked" alert (inventory 1.35)
  - Stripe status (`lib/stripe/server.js:37-44`)
  - every setting through `lib/supabase/settings.js`
- **No help links.** The geiger-dash Help Center exists (`/help/[...slug]`), but Property links to none of it.

**What's missing**
- An ordered checklist with computed completion, deep links, skip and progress.
- A defined 48-hour path, and a link to help or an onboarding call.

**How to build**
- *Data model:* None. Store a `property.settings` key `onboarding`: `{ startedAt, dismissedAt, cutoverDate, goLiveAt, newPortfolio, skipped: { stepId: reason }, manualDone: { stepId: at } }`.
- *Server logic:*
  - `lib/onboarding/steps.js`: a pure step catalogue of `{ id, title, why, screen (sidebar title), helpSlug, required, check(data) → { done, detail, count } }`.
  - `lib/onboarding/load.js`: one scoped read per source with the browser client (`scopeQuery`).
  - Steps, in order:
    1. Company profile: legal name, state and licence number.
    2. Bank accounts: at least one Operating and one Trust, plus a deposit trust account if deposits are held separately, each linked to a GL account.
    3. Fees & Policies saved: rent due day, late fee and management fee.
    4. Properties and units, or import (PLAT-03–04 (gap 9.1)).
    5. Owners: every property has owners totalling 100% and a management agreement start date.
    6. Tenants and leases: every active lease has a rent account (CORE-01 (gap 0.1)).
    7. Opening balances posted, with conversion clearing at $0 (INTL-04). Can be skipped by declaring a new portfolio.
    8. Online payments ready: Stripe configured, and payouts routed to the customer (LEAS payments).
    9. Portals: branding saved, and residents and owners invited.
    10. Team invited and roles set.
    11. Notifications on.
    12. Accounting export or QuickBooks connected (INTL-07 / INTL-09). Optional.
    13. Go-live check (INTL-06).
- *UI:*
  - **Overview card:** `components/internal/screens/overview/get_started_card.jsx` sits at the top of Overview, above `StatsBar` (`property_overview.jsx:1035`), until it is dismissed or the project goes live. It shows a progress count, the next three steps and "Open checklist".
  - **New Settings screen "Setup & Go-live"** (`components/internal/screens/settings/setup_go_live.jsx`), registered in `registry.jsx` and the `sidebar_nav.jsx` Settings group.
    - It uses `SectionCard` and `AttentionList` (`components/internal/shared/overview_kit.jsx`).
    - Each row shows status, detail (for example "2 properties under 100% ownership"), an "Open" deep link, "Skip", and a help link to geiger-dash `/help/property/<slug>`.
    - A "Book onboarding help" link (URL or email held in settings) sits on the screen.
  - Loaders use `LogoLoading` at 40–56px in the card body.
- *Permissions:* Any staff member can view. Skipping steps and dismissing the card need `settings.manage`.

**Steps**
1. Write the step catalogue and loader, with unit tests on fixture data.
2. Build the Setup & Go-live screen and register it.
3. Add the Overview card, with dismiss handling.
4. Wire each step's deep link (the screen title must exist in `SCREEN_REGISTRY`).
5. Write the help page stubs in geiger-dash Studio (`/studio/help`).

**Research before building**
- The order in which Property Tree and Palace agencies set up (MRI training catalogue, https://mrisoftware-apac.skilljar.com/). Also the onboarding checklists of Buildium, AppFolio and DoorLoop.
- Who writes and owns the Property help pages in the geiger-dash Help Center.

**Acceptance criteria**
- An empty project shows 0 of 13 done, with step 1 first. Filling in the company profile marks step 1 done without a manual tick.
- A property owned 60% shows step 5 as "1 property under 100%".
- Dismissing hides the Overview card for the whole project; Setup & Go-live still shows status.
- Every "Open" link lands on the right screen.

**Depends on / unblocks** — Unblocks INTL-04 and INTL-06. Cross-references PLAT-03–04 (gap 9.1), the LEAS payments item and CORE-01 (gap 0.1).

**Open decisions**
- Who staffs the "48 hours" promise: support, or a paid onboarding service? See MRI Managed Services in "Not building here".

#### INTL-04 · Opening balances and conversion wizard
- **MRI equivalent:** Property Tree onboarding "including migration from another system", with trust balances correct from day one.
- **Status · priority · effort:** Missing · P1 · L
- **Refs:** Inventory 6.19, 6.57 · gap report, "Price and setup" note (data import 9.1)

**Geiger today**
- **No balance import.** Balances can only be brought in as one-off journal entries.
  - The demo seed shows the intended pattern: a dated "Opening balances — books converted to Geiger" journal flagged `metadata.conversion` (`supabase/seeds/demo_project/generate/areas/accounting.mjs:1128-1148`).
  - No UI produces that journal.
- **The first bank reconciliation opens at $0:** `opening = Number(lastFinal?.statementBalance) || 0` (`components/internal/screens/accounting/bank_reconciliation.jsx:278`). A converted trust account cannot start from the old system's last reconciled statement.
- **Open receivables:** Open items come from any receivable line carrying a lease (`lib/payments/context.js:47-65`; `lib/ledger/postings.js:526`), so converted tenant balances posted with lease dimensions become payable online.
- **Ledger constraints:**
  - `ledger_entries.source_type` is constrained to a fixed list (`supabase/migrations/20261015212744_ledger_core.sql:73-76`).
  - System accounts are seeded by `property.ledger_ensure_default_chart` (`lib/ledger/store.js:37-41`) and are unique per project and `system_key` (`ledger_core.sql:42-44`).

**What's missing**
- A cutover date.
- Opening balances for each subledger.
- A clearing-account check that proves the balances agree.
- A starting point for bank reconciliation.
- A lock once the project goes live.

**How to build**
- *Data model:* Migration `conversion_batches` (`--template table`).
  - **`property.conversion_batches`:** `project_id`, `cutover_date date not null`, `status` (Draft, Posted or Voided), `totals jsonb`, `posted_at`, `posted_by`.
  - **`property.conversion_lines`:**
    - `batch_id`, `kind` (`tenant_balance`, `tenant_credit`, `deposit`, `owner_balance`, `bill`, `gl_balance` or `bank_outstanding`)
    - `property_id`, `unit_id`, `lease_id`, `tenant_id`, `owner_id`, `vendor_id`, `bank_account_id`, `gl_account_id`
    - `item_date`, `amount numeric(14,2)`, `memo`, `ref`, `posted_entry_id`, plus the standard columns
    - index on `(batch_id, kind)`
  - Neither name is used in the repo; confirm in the live database.
  - RLS is demo-open for now; `PLAT-01` tightens it.
  - **Clearing account:** Create `conversion_clearing` (3900 "Conversion Clearing", Equity) on demand. The insert is guarded by the existing unique index, so the seed function is not redefined (one owner per function).
- *Server logic:*
  - **New builders in `lib/ledger/postings.js`.** Each posts against clearing unless noted, carries `metadata.conversion = true`, and uses idempotency key `conv:<batchId>:<lineId>`:

    | Kind | Source type | Debit | Credit |
    |---|---|---|---|
    | `tenant_balance` | `charge` | AR, with lease, tenant, property and unit dimensions; the original charge type goes in `metadata.chargeGl` | Clearing |
    | `tenant_credit` | `adjustment` | Trust cash (owner, property, bank) | Prepaid 2200 (lease) |
    | `deposit` | `deposit_held` | Deposit trust cash (lease, bank) | Security deposits held 2100 (lease), plus interest to 2110 |
    | `owner_balance` | `adjustment` | Trust cash (owner, property, bank) | Clearing. The template says the owner balance **excludes** tenant prepayments. |
    | `bill` | `bill` | Clearing | AP (vendor, property). Also creates a `bills` row (Approved, unpaid, `metadata.conversion`). |
    | `gl_balance` | `adjustment` | Account or clearing, by sign | Clearing or account, by sign. Covers balance-sheet accounts no subledger handles: operating cash, fixed assets, owner equity for self-managed books, and year-to-date P&L when cutting over mid-year. |

  - **`bank_outstanding`:**
    - Each outstanding check of $X becomes two trust-cash lines on its owner: +X **cleared** and −X **uncleared**.
    - Each outstanding deposit becomes the mirror image.
    - The net effect on the owner is zero, but the cleared total equals the old bank statement balance.
  - **`lib/ledger/conversion.js`:**
    - **`validateBatch(lines, accounts)`** → `{ clearingNet, perBank: { book, statement, outstandingIn, outstandingOut, diff }, errors }`.
    - **`postBatch(sb, batch)`:**
      - posts in a fixed order
      - creates one **Finalized** `bank_reconciliations` row per bank, with the old statement date and balance, `metadata.conversion` and `clearedLineIds`
      - stamps the cleared conversion lines through `setLinesCleared` (`lib/supabase/ledger.js`)
    - **`voidBatch`:** allowed before go-live only; it calls `ledger_void` on every posted entry.
- *API routes / jobs:* None for v1. Posting goes through `ledger_post` like the other client postings; it moves server-side when `PLAT-01` lands.
- *UI:*
  - A full-screen wizard, `components/internal/screens/accounting/conversion/conversion_wizard.jsx`, opened from Setup & Go-live (INTL-03 step 7) and from the Chart of Accounts header.
  - **Steps:**
    1. Cutover date
    2. Bank starting points (statement date, balance and outstanding items)
    3. Tenant balances
    4. Deposits
    5. Owner balances
    6. Unpaid bills
    7. Other GL balances
    8. Review: clearing must be $0.00, and book vs statement is shown per bank
    9. Post
  - **Data entry:** each step is an editable grid with "Paste from spreadsheet" (tab-separated) and a downloadable template. CSV upload is added when PLAT-03–04 (gap 9.1)'s parser exists.
- *Permissions:* A new key, `accounting.convert` ("Post opening balances"), inheriting `accounting.post`.

**Steps**
1. Confirm the table names in the live database, then write the migration.
2. Write the builders, with unit tests: every entry balances, the clearing maths holds, and the outstanding-item pairs net to zero per owner.
3. Write `validateBatch`, `postBatch` and `voidBatch`.
4. Add the data layer `lib/supabase/conversion.js` (`makeEntityData` for batches, and a line list).
5. Build the wizard UI and its templates.
6. Wire it into INTL-03 and INTL-06. After go-live, only an admin can post a new batch.
7. Verify by converting the demo project's numbers into a scratch project.

**Research before building**
- What AppFolio, Buildium, Rent Manager and Yardi Breeze export for a conversion (tenant aging, owner balances, deposit register, open AP, trial balance, last bank reconciliation). Match the template columns to those reports.
- How to treat tenant prepayments and owner reserves in owner balances (shared with INTL-08's state research).
- Cutting over mid-month: proration and the first rent posting. The move-in month risks being billed twice (inventory 3.17; CORE-01 (gap 0.1)).

**Acceptance criteria**
- Sample batch: tenant AR $4,200, deposits $9,000, owner balances $31,500, prepaid $600, AP $1,150, plus GL balances. Clearing nets to $0.00, or Post is disabled and shows the difference.
- After posting:
  - The Trial Balance as of cutover matches the old system's.
  - Deposit Detail shows "match" for every lease.
  - Trust positions per owner equal the entered balances.
  - The resident portal shows the open balance and can pay it, oldest first.
- Each bank's first real reconciliation opens at the old statement balance and lists exactly the outstanding items entered.
- Posting the same batch again creates nothing. Voiding the batch returns every account to zero.
- After go-live, a non-admin cannot post a batch.

**Depends on / unblocks** — Depends on CORE-04 (gap 0.4) (deposit postings wired), CORE-08 (gap 0.8) (co-owner dimensions), PLAT-03–04 (gap 9.1) (optional parser) and `PLAT-01`. Unblocks INTL-05 and INTL-06.

**Open decisions**
- Support a mid-year cutover by importing year-to-date income and expenses (needed for owner statements and 1099s), or require a month-start or 1 January cutover?

#### INTL-05 · Three-way trust reconciliation and printable bank reconciliation
- **MRI equivalent:**
  - Property Tree: "Trust accounting compliance" and the Business Insights "ownership liability board".
  - Palace: "accurate reconciliations to audit-ready reports".
  - Property Tree training on bank reconciliation and end of month.
- **Status · priority · effort:** Partial · P1 · M
- **Refs:** Inventory 6.16, 6.57, 6.60, 6.97, 6.98

**Geiger today**
- **Manual bank reconciliation works.** Users can save a draft, clear lines, finalize at zero and undo the latest (`components/internal/screens/accounting/bank_reconciliation.jsx:276-300, 350-378`).
  - Finalized rows keep `metadata.clearedLineIds` (`:426`).
  - The history table has no print or export (`:422-441`).
- **Trust data that already exists:**
  - Trust positions by account, owner and property, with shortfalls (`lib/reports/ledger_math.js:364-375`; Deposit Detail `lib/reports/defs_financial.js:521-526, 568-579`).
  - Deposits held by lease vs recorded deposits (`defs_financial.js:470-520`).
  - Ledger health, including negative trust (`lib/ledger/postings.js:650-677`).
- **What no report does:**
  - No report sets the bank, book and beneficiary balances side by side.
  - There is no owner liability listing and no printable reconciliation (inventory 6.98 and 6.60 Absent).
- **Book and beneficiaries agree by construction.** Owner positions are built from owner-tagged trust-cash lines, so the book and beneficiary totals can only differ through untagged lines. The checks that matter are:
  - (a) adjusted bank vs book
  - (b) untagged trust lines
  - (c) deposit trust cash vs the deposit liability by lease
  - (d) negative positions

**What's missing**
- A three-way trust reconciliation report.
- An owner liability listing.
- A printable bank reconciliation.
- A snapshot taken at finalize, so later back-dated postings cannot change a signed reconciliation.

**How to build**
- *Data model:* None. In `finalize()` (`bank_reconciliation.jsx:350-378`), add `metadata.snapshot`: `{ bookBalance, outstandingDepositIds, outstandingCheckIds, adjustedBank, finalizedBy }`.
- *Server logic:*
  - **`lib/reports/ledger_math.js`:** add `threeWayTrust({ lines, accounts, reconciliations, bankAccounts, asOf, bankAccountId })`, returning:
    - `bank`: statement date and balance, outstanding in, outstanding out, adjusted balance
    - `book`
    - `beneficiaries`: `{ owners, tenantCredits, deposits, total }`
    - `untagged`, `differences` and `status`
  - **Beneficiaries:**
    - Owner positions are shown with tenant prepaid credits (2200, by lease) broken out.
    - Deposits come from `depositsHeldByLease` plus 2110 interest, and are compared with deposit trust cash.
  - **New report definitions** in `lib/reports/defs_financial.js`, added to `FINANCIAL_REPORTS`:
    - **`trust_reconciliation`:** filters are a trust or deposit bank account and an as-of month end. Sections: Summary, Outstanding deposits, Outstanding checks, Owner liability listing, Tenant credits, Deposits by lease, Untagged trust lines, Exceptions.
    - **`bank_reconciliation_report`:** filter is the reconciliation ID. Shows the statement, cleared lists, outstanding lists, adjusted balance, book balance, and who finalized it and when (read from the snapshot).
- *UI:*
  - **New Reports entry "Trust Reconciliation":** `components/internal/screens/reports/trust_reconciliation.jsx` renders `<CatalogReport reportKey="trust_reconciliation" />`, like `deposit_detail.jsx`, and is registered in `registry.jsx` and the `sidebar_nav.jsx` Reports group.
  - **Bank Reconciliation history:** add a "Print" action on each finalized row, which opens `bank_reconciliation_report` in the print layout (`components/internal/screens/reports/report_print.jsx:90`).
  - **Health card:** the health card on Bank Reconciliation links to Trust Reconciliation.
- *Permissions:* `view.reports` to view; `reports.export` to print or export.

**Steps**
1. Add the snapshot in `finalize()`.
2. Write `threeWayTrust`, with fixture tests for balanced data, untagged lines, an unposted deposit and an outstanding check.
3. Add the two report definitions to the catalog.
4. Add the sidebar entry, the registry entry and the Print action.
5. Run it against the demo project (`ebcc7910`).

**Research before building**
- California 10 CCR §2831.2: what a reconciliation must contain (bank name, account number and date; the beneficiary records reconciled to the columnar record). Sources: the DRE audit guide (https://www.dre.ca.gov/files/pdf/commonviolationsfoundinaudits.pdf) and its sample audit report (https://www.dre.ca.gov/files/pdf/tarsample2.pdf).
- The Florida Realtors MSR-5 monthly reconciliation form: its required fields.
- How AppFolio and Buildium lay out three-way reconciliation reports.

**Acceptance criteria**
- In the demo project, every trust bank with a finalized reconciliation shows adjusted bank = book, status Balanced, and an owner listing total equal to the trust-positions total.
- Posting a trust receipt with no owner puts it under "Untagged" and sets the status to "Out of balance (untagged $X)".
- A deposit recorded on a lease but not posted shows an "unposted" variance, the same as Deposit Detail.
- An outstanding check dated before the statement appears under Outstanding checks and adjusts the bank side.
- The printed reconciliation matches the screen at finalize, even after later back-dated postings, because it uses the snapshot.

**Depends on / unblocks** — Depends on CORE-04 (gap 0.4) and 0.8 and on INTL-04 (bank starting point). Unblocks INTL-06 and INTL-08.

#### INTL-06 · Go-live readiness check and pre-launch reset
- **MRI equivalent:** Property Tree's "up and running within 48 hours", which implies a go-live hand-off by the onboarding team.
- **Status · priority · effort:** Missing · P1 · M
- **Refs:** Gaps 0.10, 0.11 · Inventory 6.16, 9.42–9.45

**Geiger today**
- **No go-live state.** Problems that make a live workspace unsafe are invisible to the customer:
  - Jobs are not scheduled: `vercel.json` has no crons (CORE-10 (gap 0.10)).
  - RLS is demo-open (`PLAT-01`).
  - **Online payments settle into one platform Stripe account.**
    - The secret key is a single environment variable (`lib/stripe/server.js:9-15`, `GEIGER_STRIPE_SECRET_KEY`), the same name geiger-dash billing uses.
    - No code routes funds to a customer's own account: a grep for `transfer_data|on_behalf_of|stripeAccount` in `lib/` finds nothing.
    - A manager's rent has to reach their own trust bank.
- **The demo project has everything paused** (automations, schedules and notifications off), so a real project copied from it would send nothing.
- **No reset.** There is no way to wipe a project's records after a test import.

**What's missing**
- A blocking checklist evaluated on the server.
- A Go-live action.
- A guarded reset for use before go-live.

**How to build**
- *Data model:* Migration `project_reset`, adding `property.reset_project_data(p_project_id uuid, p_scope text default 'records')`, `security definer`.
  - **Effect:** sets `deleted_at = now()` on every `property.*` row with that `project_id`, using an explicit table list inside the function.
  - **Scope:** `records` keeps `settings`, `team_members` and `gl_accounts`; `all` removes those too.
  - **Audit:** writes one `property.activity` row.
  - **Refusals:** refuses if `settings.onboarding.goLiveAt` is set, or if the project has a succeeded live-mode `online_payments` row.
  - **Grants:** execute is granted to `service_role` only.
- *Server logic:* `lib/onboarding/readiness.js`, `evaluateReadiness(admin, projectId)` → `[{ id, level: 'block'|'warn', ok, detail, fixScreen }]`.
  - **Blockers:**
    - The `PLAT-01` migration version is applied (check `property.geiger_migrations`).
    - A scheduler run was recorded in `job_runs` in the last 26 hours (CORE-10 (gap 0.10)).
    - Online payments either pay out to the customer's own account (LEAS payments item) or are turned off in Payment Processing.
    - Opening balances are posted with clearing at $0, or "new portfolio" is declared (INTL-04).
    - Every trust bank has a starting reconciliation (INTL-04 / INTL-05).
    - Ledger health is clean (`diagnose`, `lib/ledger/postings.js:650-677`).
    - Every active lease has a rent account at the lease rent (CORE-01 (gap 0.1)).
    - Every property has owners totalling 100% and a bank account.
    - The company state and licence number are filled in.
    - The plan is active (INTL-02).
  - **Warnings** (data health; Property Tree's "contacts & profiles board"):
    - tenants without email or phone
    - owners without a payout method or W-9
    - vendors without a COI or W-9 (`lib/compliance.js`)
    - portal invites not sent
    - notifications off
    - all automations paused
- *API routes / jobs:*
  - **`app/api/onboarding/readiness/route.js`:** GET, guarded by `requireStaff`, using the admin client.
  - **`app/api/onboarding/go-live/route.js`:** POST. Re-evaluates, refuses if any blocker remains, sets `onboarding.goLiveAt`, and turns on the automations and notifications chosen in the dialog.
  - **`app/api/onboarding/reset/route.js`:** POST. Allowed for the project creator, or for `settings.manage` with a typed confirmation of the project name. Calls the RPC.
- *UI:*
  - On Setup & Go-live (INTL-03), a "Go-live check" section lists blockers, then warnings, each with a Fix link.
  - **"Go live"** runs through `wizard_dialog`: confirm the cutover date, choose switches, confirm.
  - **"Danger zone":** a card with a two-step Reset.
  - **After go-live:** the section reads "Live since …".
- *Permissions:*
  - Go-live needs `settings.manage`.
  - Reset needs `settings.manage` and must be the project creator (the creator rule is in `context/rbac-context.js:40-50`).

**Steps**
1. Write `evaluateReadiness`, with fixture tests for each check.
2. Add the readiness route and the UI section.
3. Add the go-live route and dialog.
4. Write the reset migration (with an explicit table list kept in sync with the migrations), the route and the Danger zone.
5. Add the "Live" state to the Overview card.

**Research before building**
- Stripe Connect for rent: Standard, Express or Custom accounts, payouts per property to a trust bank, and platform liability. **LEAS owns the build**; this item only checks it.
- State rules on whether tenant funds may sit in a processor balance before reaching trust, for example the California three-business-day deposit rule (10 CCR §2832).
- The `job_runs` columns to read for "last run" (`supabase/migrations/20261015212609_messaging_scheduler_automations.sql`).

**Acceptance criteria**
- In a fresh project, Go live is disabled with at least 5 blockers listed, and every Fix link opens the right screen.
- With every blocker fixed, Go live sets `goLiveAt` and the Overview card switches to "Live".
- A reset before go-live removes the project's records from every list, leaves other projects untouched and writes an activity row. A reset after go-live returns 409.
- The payment-routing blocker clears only when LEAS payout routing is configured or online payments are off.

**Depends on / unblocks** — Depends on `PLAT-01`, CORE-10 (gap 0.10) and 0.1, the LEAS payout-routing item, INTL-02, INTL-03, INTL-04 and INTL-05.

**Open decisions**
- Offer "Load a sample portfolio" into a trial project (remap the `lib/sandbox/seed` IDs, tag rows `metadata.sample`, and let Reset remove them)? The playground (`lib/sandbox/sandbox_client.js`) already covers try-before-signup. Recommendation: no.

#### INTL-07 · Accountant export files (QuickBooks, Xero, IIF)
- **MRI equivalent:** Property Tree "MRI CRM & Xero integration" in every tier. The US expectation is "QuickBooks sync", which about 30% of US competitors offer (`conventions/PROPERTY_PM_COMPETITIVE_RESEARCH.md:272`).
- **Status · priority · effort:** Missing · P1 · M
- **Refs:** Inventory 6.99, 7.17, 9.28, 9.30

**Geiger today**
- **No accounting export.** The "Accounting export" card is disabled (`components/internal/screens/settings/integrations.jsx:34, 127-134`). General-ledger data leaves only as report CSV (`lib/reports/csv.js`; inventory 7.17).
- **The ledger has what an export needs:**
  - Entries carry `entry_date`, `created_at`, `source_type`, `status` and `reversal_of` (`ledger_core.sql:49-82`).
  - Lines carry a GL account plus property, owner, lease and vendor dimensions (`:87-114`).
  - Voids are new reversal entries (`ledger_void`, `:398-447`), so an export only ever adds rows.
- **One ledger holds two sets of books:**
  - **The owners' property books:** rent income 4000, expenses 5xxx, owner equity 3xxx and trust cash.
  - **The manager's own income:** management fee income 4500 posted to operating cash 1000 with no owner (`lib/ledger/postings.js:337-354`; chart at `ledger_core.sql:453+`).

**What's missing**
- An export by date range in the import formats accounting tools accept.
- Account mapping.
- A choice of which set of books to export.

**How to build**
- *Data model:* None. Use a `property.settings` key `accounting_export`: `{ profile: 'ledger'|'company', format: 'qbo_csv'|'xero_csv'|'iif'|'csv', accountMap: { glAccountId: remoteNameOrCode }, classBy: 'property'|'none', granularity: 'entry'|'day', history: [{ from, to, at, by, entries }] }`.
- *Server logic:* `lib/accounting/journal.js`, pure and shared with INTL-09.
  - **`selectLines(lines, accounts, { profile })`:**
    - `ledger` exports everything: the self-managing landlord's whole set of books.
    - `company` exports only lines on non-trust accounts with no owner: management and leasing fees, company expenses and operating cash. Never 1010, 1020 or 2100.
  - **`buildJournals(lines, entries, accounts, opts)`** → `[{ date, ref, memo, lines: [{ account, debit, credit, className }] }]`, one per entry, or one per day per property.
  - **Formatters:** `lib/accounting/formats/{qbo_csv,xero_csv,iif,generic_csv}.js`, reusing `lib/reports/csv.js` (BOM, formula-injection guard).
- *UI:*
  - The "Accounting export" card on Integrations becomes active and opens `components/internal/screens/settings/accounting_export.jsx`.
  - **Choices:** profile, format and date range. A warning shows when the range overlaps an earlier export recorded in `history`.
  - **Mapping table:** Geiger account → name or code in the target tool, defaulting to Geiger's name and number.
  - "Download".
  - An "Export to accounting" action is also added to the General Ledger screen header.
- *Permissions:* `reports.export`.

**Steps**
1. Write `selectLines` and `buildJournals`, with unit tests.
2. Write the three formatters, with golden-file tests.
3. Build the export screen, mapping and history.
4. Make the Integrations card active and add the General Ledger action.
5. Test importing the files into a QuickBooks Online sandbox company and a Xero demo company.

**Research before building**
- **QuickBooks Online journal-entry import:** which editions have it, its column names, and the Class and Location columns. Check QuickBooks help: "Import journal entries".
- **Xero manual-journal CSV template:** Narration, Date, Description, AccountCode, TaxRate, Amount, TrackingName1/Option1. Check Xero Central: "Import manual journals".
- **QuickBooks Desktop IIF:** the GENERAL JOURNAL format (`!TRNS`, `!SPL`, `ENDTRNS`).

**Acceptance criteria**
- In a month's export, every journal balances and so does the whole file. Totals by account equal Trial Balance activity for the range (`ledger` profile).
- A `company` export contains only lines with no owner on non-trust accounts, for example 4500 and 1000, and nothing on 1010, 1020 or 2100.
- A voided entry and its reversal both appear and net to zero.
- Exporting an overlapping range shows a warning.
- The files import without edits into a QuickBooks Online sandbox and a Xero demo company (manual test, documented).

**Depends on / unblocks** — Depends on CORE-01 (gap 0.1)–0.4 (correct postings). Unblocks INTL-09.

#### INTL-08 · Monthly trust audit pack
- **MRI equivalent:**
  - Palace: "accurate reconciliations to audit-ready reports".
  - Property Tree: trust accounting compliance, and trust accountant certification courses.
- **Status · priority · effort:** Missing · P2 · M
- **Refs:** Inventory 6.97, 6.98, 8.10, 9.11 · gaps 6.1, 7.5

**Geiger today**
- **No sign-off or pack.** Nothing ties a month's reconciliation to a sign-off or an assembled pack.
- **No broker on the profile.** The company profile holds the state and licence number (`components/internal/screens/settings/shared.js:25-37`) but no designated broker.
- **No trust rules in Legal Resources.** It has per-state statute links (inventory 8.10) but no trust-account rules.
- **Missing elsewhere:**
  - Period close and lock dates (CORE-40 (gap 6.1)).
  - Attachments on scheduled report emails (CORE-57 (gap 7.5)).
  - Deposit batching (CORE-16 (gap 11.4)).

**What's missing**
- A state rule profile.
- A monthly sign-off record.
- An assembled pack.
- Exception rules, reminders and a month lock.

**How to build**
- *Data model:* Migration `trust_signoffs`, adding `property.trust_signoffs`:
  - **Columns:**
    - `project_id`, `bank_account_id`, `period_month date`
    - `status` (Prepared, Signed or Reopened)
    - `snapshot jsonb` (the INTL-05 result) and `exceptions jsonb`
    - `prepared_by` / `prepared_at`, `signed_by`, `signed_name`, `signed_at`
    - `notes`, `document_id`
  - **Uniqueness:** `(bank_account_id, period_month)` where `deleted_at is null`.
  - **After `PLAT-01`:** signed rows cannot be updated, except to change the status to Reopened with a reason.
- *Server logic:*
  - **`lib/trust/state_rules.js`:**
    - Each state profile is `{ code, reconcile, threeWay, signer, retentionYears, depositDeadline, brokerFundsCap, sources, lastReviewed }`.
    - Seed CA, FL and TX first (see research).
    - Any other state gets a conservative default (monthly three-way, 5-year retention), labelled "Not legal advice" and linked to that state's Legal Resources row.
  - **`lib/trust/exceptions.js`:** checks for:
    - negative owner positions
    - untagged trust lines
    - deposit variance
    - company funds in trust over the state cap (trust-cash lines with no owner or lease)
    - a month's reconciliation missing or late
    - receipts not deposited within the deadline. This needs CORE-16 (gap 11.4); until then show "not tracked".
- *Pack:* A print view, `components/internal/screens/reports/trust_pack.jsx`, assembles:
  - a cover with company, designated broker, licence, state, bank, period and a signature block
  - the Trust Reconciliation (INTL-05)
  - the bank reconciliation report
  - the owner liability listing
  - deposits by lease
  - a receipts and disbursements journal (reuse the `check_register` definition, filtered to the trust bank)
  - exceptions

  It uses `report_print.jsx`. Once a server PDF renderer exists (CORE-57 (gap 7.5) / LEAS-08, LEAS-19 (gap 2.6)), the pack is saved as a PDF to the Document Library.
- *Settings:* Add `designatedBroker` and `brokerLicense` to the `company_profile` setting (stored as JSON; no migration).
- *Jobs:* `trust-reconciliation-due` in `lib/jobs/operations.js`, running monthly on day 10. It emails staff when last month is not Signed for any trust bank, deduplicated through `notification_sends`.
- *UI:*
  - The Trust Reconciliation report gets "Prepare month" and "Sign" actions.
  - Bank Reconciliation shows a status chip for each month.
  - Company Profile gets the broker fields.
  - Setup & Go-live warns when the company's state has no profile.
- *Permissions:* A new key, `trust.signoff` ("Sign trust reconciliations"). It is not inherited; assign it to the designated broker's role.

**Steps**
1. Do the state research, then write `state_rules.js` with sources.
2. Write the migration.
3. Write `exceptions.js`, with tests.
4. Build the pack print view.
5. Add the sign, prepare and reopen actions.
6. Add the reminder job.
7. Add the broker fields to the company profile.

**Research before building** (a state matrix; deep research)
- **California:**
  - **Statutes and rules:** Business and Professions Code §10145 and §10148 (3-year retention), and 10 CCR §2831 (columnar record), §2831.1 (separate beneficiary records), §2831.2 (monthly reconciliation), §2832 (deposit within three business days) and §2835 (commingling, broker funds up to $200).
  - **Source:** the DRE audit guide linked in INTL-05.
- **Florida:**
  - **Statutes and rules:** §475.25 and §475.5015 (records retention; verify the 5 years), and Rule 61J2-14.012. That rule requires a monthly written statement comparing total trust liability with the reconciled bank balances, signed by the broker and not filed with FREC (https://www.law.cornell.edu/regulations/florida/Fla-Admin-Code-Ann-R-61J2-14-012).
  - **Form:** MSR-5.
- **Texas:** 22 TAC §535.146 requires 4-year retention (https://www.trec.texas.gov/node/413). The reconciliation frequency was **not found**; confirm with TREC.
- **Also:**
  - AZ: https://azre.gov/sites/default/files/2025-12/Trust%20Funds%20Quick%20Guide.pdf
  - CO: three-way reconciliation guide
  - NC, WA, GA, NV and OR
- **For each state, find:**
  - who must reconcile
  - how often
  - three-way or two-way
  - who signs
  - retention period
  - deposit deadline
  - broker funds cap
  - whether owners managing their own property without a licence are exempt

**Acceptance criteria**
- "Sign" is disabled while the month's INTL-05 status is not Balanced, unless an exception note is entered.
- A signed snapshot does not change after later back-dated postings, and the pack prints the snapshot.
- The job sends one reminder per bank per month, and none after signing.
- The California profile shows 3-year retention and the three-business-day deposit rule, with source links.

**Depends on / unblocks** — Depends on INTL-05, CORE-40 (gap 6.1) (lock dates: after sign-off, block postings to trust accounts dated on or before the period end), CORE-57 (gap 7.5), CORE-16 (gap 11.4) and `PLAT-01` (immutability).

**Open decisions**
- Ship rules for named states (a liability risk if they are wrong), or only a configurable checklist with links? This needs a legal review either way.

#### INTL-09 · Accounting sync engine and QuickBooks Online connector
- **MRI equivalent:** Property Tree's Xero integration (every tier). Palace lists 52 integrated partners.
- **Status · priority · effort:** Missing · P2 · L
- **Refs:** Inventory 6.99, 9.29, 9.30 · gap 9.6

**Geiger today**
- **No accounting connection exists.** There is no OAuth and no provider: a grep for `quickbooks|xero|iif` finds option labels only (inventory 6.99, 9.30).
- **Live integrations:** only Stripe and email (inventory 9.29). Webhook settings are saved but never sent (`components/internal/screens/settings/integrations.jsx:141-192`).
- **Pieces that exist:**
  - a staff API guard (`lib/messaging/auth.js:23-60`)
  - the job contract and registry (`lib/jobs/contract.js:3-7`; `lib/jobs/registry.js:7`)

**Design (decided here)**
- **One-way, Geiger → QuickBooks Online.**
  - Geiger stays the system of record for receivables, payables, deposits and trust. QuickBooks receives general-ledger journal entries only.
  - From QuickBooks, Geiger reads only the chart of accounts, classes, company info and closing date, for mapping and validation.
  - v1 creates no QuickBooks customers, invoices, bills or payments. This avoids double-counting receivables and payables and keeps tenant personal data out of QuickBooks.
- **Profiles (one per connection):**
  - `ledger`: a self-managing landlord's whole project goes to one QuickBooks company, with Class = property.
  - `company`: a fee manager's own books (fees, company expenses, operating cash).
  - `owner` (P3): an individual owner's books, with trust cash mapped to "Cash held by manager".
- **Granularity:**
  - The default is a daily summary per entry date, property class and account (`DocNumber GP-<yyyymmdd>-<n>`, memo "Geiger Property sync").
  - A detail mode posts one journal entry per ledger entry.
- **Watermark on `ledger_entries.created_at`, not `entry_date`.** Back-dated postings still sync; each journal entry keeps its entry date. Voids sync as their reversal entries.
- **Closed periods:** If the entry date is on or before the QuickBooks closing date, the item fails with "Period closed in QuickBooks" (see the open decision).
- **Idempotency:** A unique `(connection_id, source_key)` plus a payload hash; reruns skip keys already synced.

**How to build**
- *Data model:* Migration `accounting_sync`, all names unused in the repo (confirm in the live database).
  - **`property.accounting_connections`:**
    - `project_id`, `provider` (`qbo` or `xero`), `profile`, `owner_id`
    - `remote_company_id` (realmId or tenantId), `remote_company_name`
    - `status` (connected, needs_reauth, paused or disconnected)
    - `start_date`, `granularity`, `class_by`
    - `last_synced_at`, `last_error`, plus the standard columns
  - **`property.accounting_tokens`:**
    - **Columns:** `connection_id` primary key, `access_token_enc`, `refresh_token_enc`, `expires_at`, `refresh_expires_at`, `scope`, `updated_at`.
    - **Security:** RLS enabled with **no `anon` or `authenticated` policy** (service role only) from day one, whatever `PLAT-01`'s timing.
    - **Encryption:** AES-256-GCM using `ACCOUNTING_TOKEN_KEY` (`lib/accounting/crypto.js`), or Supabase Vault.
  - **`property.accounting_mappings`:** `connection_id`, `kind` (`account` or `class`), `local_id`, `remote_id`, `remote_name`; unique `(connection_id, kind, local_id)`.
  - **`property.accounting_sync_runs`:** `connection_id`, `trigger`, `started_at`, `finished_at`, `status`, `window_from`, `window_to`, `posted`, `failed`, `skipped`, `error`.
  - **`property.accounting_sync_items`:** `run_id`, `connection_id`, `source_key`, `entry_ids uuid[]`, `remote_type`, `remote_id`, `amount`, `status` (synced, failed or skipped), `error`, `payload_hash`; unique `(connection_id, source_key)`.
- *Server logic:*
  - **`lib/accounting/engine.js`, `syncConnection(admin, connection, { now, trigger })`:**
    1. Load the window since the watermark.
    2. Build journals with `lib/accounting/journal.js` (shared with INTL-07).
    3. Map accounts. An unmapped account fails the item with "Map account X".
    4. Post through the provider.
    5. Record the items and the run.
  - **Adapter interface (`lib/accounting/providers/index.js`):** `{ key, authorizeUrl(state), exchangeCode(code, query), refresh(tokens), companyInfo(conn), listAccounts(conn), listClasses(conn), closingDate(conn), postJournal(conn, journal) → { remoteId }, revoke(conn) }`.
  - **`lib/accounting/providers/qbo.js`:** REST v3 with `minorversion`. Each JournalEntry line uses `JournalEntryLineDetail` with `PostingType`, `AccountRef` and `ClassRef`.
  - **Token refresh:** a wrapper with a row-level guard (`update … where expires_at < now()`) to avoid refresh races.
- *API routes / jobs:*
  - **`app/api/accounting/[provider]/connect/route.js`:** GET, guarded by `requireStaff`. Sets a signed state cookie `{ projectId, profile, nonce }` and redirects.
  - **`app/api/accounting/[provider]/callback/route.js`:** verifies the state, exchanges the code, stores the tokens and creates the connection.
  - **`app/api/accounting/connections/[id]/route.js`:** GET status, PATCH settings, DELETE to disconnect and revoke.
  - **`…/[id]/remote/route.js`:** GET the remote accounts and classes for mapping.
  - **`…/[id]/mappings/route.js`:** PUT.
  - **`…/[id]/sync/route.js`:** POST to run now.
  - **Job:** `accounting-sync` (`lib/jobs/accounting_sync.js`, schedule `0 7 * * *`), added to `lib/jobs/registry.js`. It runs through "Run now" and `/api/cron/run-due` once a scheduler exists; `vercel.json` stays cron-free.
- *UI:*
  - The Integrations "Accounting" card opens `components/internal/screens/settings/accounting_connection.jsx`.
  - **Buttons:** "Connect QuickBooks" and "Connect Xero" (INTL-13).
  - **Header:** company name, status and last sync time.
  - **Tabs:**
    - **Mapping:** Geiger account → QuickBooks account, auto-matched by name or number, with a class per property.
    - **Settings:** profile, start date and granularity.
    - **Sync log:** runs with expandable items and a retry for failed items.
  - **Overview:** Needs Attention gets an item when a connection needs re-authorisation or has failures.
- *Permissions:* A new key, `accounting.integrations` ("Connect accounting software"), inheriting `settings.manage`.
- *Integrations:* Intuit QuickBooks Online Accounting API with OAuth 2.0 (scope `com.intuit.quickbooks.accounting`). Suite reuse: check whether geiger-pods (the API gateway) brokers third-party OAuth tokens; no suite product does accounting connectors.

**Steps**
1. Confirm the table names in the live database, then write the migration and the crypto helper.
2. Write the journal builder; it is shared with INTL-07 and may already exist.
3. Write the QuickBooks adapter against the Intuit sandbox.
4. Add the connect and callback routes, and token storage and refresh.
5. Add the remote-list and mapping routes, and the Mapping tab with auto-match.
6. Write the engine, with unit tests for the window, grouping, idempotency and closed periods.
7. Add the sync route, the job and the Sync log tab.
8. Add the Overview attention item.
9. Disconnect and revoke.
10. Reconcile the QuickBooks trial balance against Geiger's for a test month.

**Research before building**
- **Intuit OAuth 2.0:** token lifetimes and refresh-token rotation (https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0).
- **JournalEntry entity:** https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/journalentry
- **QuickBooks setup questions:**
  - Class tracking needs QuickBooks Online Plus or Advanced.
  - The closing date is read through Preferences.
  - Production keys require Intuit's app assessment.
- **Intuit App Partner Program tiers:** third-party reports say reads are metered as CorePlus credits and writes are free. Confirm with Intuit.
- **Unified API alternatives:** Codat, Apideck, Rutter and Merge. Compare the cost per connection with building two adapters.
- **Competitor scope:** how Buildium's and AppFolio's QuickBooks integrations are scoped, per their help centres.
- **geiger-pods:** read `C:\Pro\geiger-pods\README.md` for OAuth or token brokering.

**Acceptance criteria**
- **Connection and token security:**
  - A QuickBooks sandbox company connects, and the tokens are stored encrypted.
  - A PostgREST select on `accounting_tokens` as `anon` or `authenticated` returns nothing.
- **Mapping:**
  - Auto-match maps at least 80% of the default chart by name.
  - A sync with unmapped accounts in its window refuses to run and names them.
- **Correctness:** With daily summaries, the QuickBooks trial balance for the synced range equals Geiger's Trial Balance per account and per class (`ledger` profile).
- **Edge cases:**
  - A rerun creates no duplicates.
  - A voided entry and its reversal both sync.
  - A back-dated entry posted today syncs on the next run with its original date.
- **Recovery:**
  - An expired refresh token sets the status to `needs_reauth` and raises an Overview item.
  - After re-authorisation, the sync resumes from the watermark with no gaps.
  - Disconnecting revokes the token and stops the job for that connection.

**Depends on / unblocks** — Depends on INTL-07, `PLAT-01` (posting server-side; the tokens table is locked down regardless), CORE-01 (gap 0.1)–0.4 and 0.8, and PLAT-12 (gap 9.6) (the directory card). Unblocks INTL-13.

**Open decisions**
- QuickBooks Online first and Xero later (INTL-13)?
- Build adapters, or buy a unified API?
- Ship the `ledger` and `company` profiles in v1 and the `owner` profile later?
- For entries in a closed QuickBooks period: fail and surface them (recommended), or repost them on the first open date with a note?

#### INTL-10 · Key register and checkout
- **MRI equivalent:** Key Automate (from Proptech Labs), included in Property Tree and Palace subscriptions by 31 Dec 2025.
  - A virtual key cabinet colour-codes each key as Check-in, Check-out, Ready to collect, Overdue or Missing.
  - Bookings carry dates and a borrower: a tenant, trade or owner.
  - A calendar, overdue alerts and a history log support follow-up.
- **Status · priority · effort:** Tracking-only · P2 · M
- **Refs:** Inventory 1.28, 2b.72, 2b.73, 5.15, 5.16

**Geiger today**
- **Three unconnected key lists,** all stored as `property.record_items` kind `key`:

  | Where | Statuses | Other fields | Source |
  |---|---|---|---|
  | Property / building | Available, Checked out, Lost, Retired | Free-text "Checked out to", due back, access code | `components/internal/screens/properties/record_kinds.js:150-175, 288-297` |
  | Unit | In office, Checked out, Lost, Retired | Free-text "Held by" | `components/internal/screens/units/config.jsx:263, 519-543` |
  | Move handover | Handed over, Returned, Missing | Quantity, tag | `components/internal/screens/leasing/moves.jsx:235-240, 510-522` |

- **Lease "Keys issued"** is just a number (`components/internal/screens/leasing/sections/lease_lifecycle.jsx:133`).
- **Work orders:** they hold free-text key location and lockbox, alarm and gate codes (`components/internal/screens/maintenance/sections/wo_general.jsx:206-211`). The vendor portal shows the key location and gate code (`lib/portal/vendor.js:38-46`).
- **Missing:** no history, no link to the borrower's record, no overdue reminder and no portfolio-wide view.

**What's missing**
- One key register with checkout and check-in.
- A history of who held each key.
- Overdue alerts.
- Links to work orders and moves.

**How to build**
- *Data model:* Migration `key_register` (`--template table`).
  - **`property.key_sets`:**
    - Location: `project_id`, `property_id`, `building_id`, `unit_id`.
    - Identity: `tag text` (unique per project where not deleted), `name`, `key_type`, `opens`, `copies int default 1`, `storage_location`, `access_code`.
    - State: `status` (`available`, `checked_out`, `missing` or `retired`).
    - Holder: `holder_type` (tenant, vendor, owner, staff or other), `holder_id`, `holder_name`, `checked_out_at`, `due_back_on`.
    - Plus the standard columns.
    - Indexes on `(project_id, status)`, `(unit_id)` and `(holder_type, holder_id)`.
  - **`property.key_movements`:**
    - `project_id`, `key_set_id`
    - `action` (check_out, check_in, mark_missing, found, retire or copies_changed)
    - `party_type`, `party_id`, `party_name`, `quantity`, `due_back_on`
    - `work_order_id`, `move_id`, `lease_id`, `notes`
    - `actor_id`, `actor_name`, `occurred_at`
    - Index on `(key_set_id, occurred_at desc)`.
  - **RPCs** that insert the movement and update the key set in one transaction (invoker rights, so RLS applies):
    - `property.key_check_out(p_key uuid, p_party jsonb, p_due date, p_links jsonb, p_notes text)`
    - `property.key_check_in(p_key uuid, p_notes text)`
  - **Data copy in the same migration:**
    - `record_items` of kind `key` owned by a property, building or unit become `key_sets`, keyed by `metadata.sourceRecordItemId` with `on conflict do nothing`.
    - Move rows become movements.
    - The old rows stay in place until the new UI ships.
- *Server logic:*
  - `lib/supabase/keys.js`: `makeEntityData` for `key_sets`, plus `listMovements(keyId)` and the `checkOut` and `checkIn` RPC wrappers.
  - `lib/keys/status.js`: `displayStatus(set, today)` → Available, Checked out, Due today, Overdue, Missing or Retired.
- *Jobs:* A `keys-overdue` job in `lib/jobs/operations.js`, daily:
  - a staff digest of overdue keys
  - an optional email to the borrower using a new geiger-dash template, `property.key_overdue`
  - deduplicated with `key-overdue:<keyId>:<date>` in `notification_sends`
- *UI:*
  - A "Keys" item in the sidebar's Property group (`sidebar_nav.jsx:79-90`) and the registry.
  - **The Keys screen** (`components/internal/screens/keys/keys.jsx`) uses an `EntityListScreen` config. Views:
    - **Cabinet:** tag tiles coloured by display status, grouped by property.
    - **List**
    - **Due back:** sorted by due date.
  - **Actions** (through `wizard_dialog`):
    - **Check out:** pick a tenant, vendor, owner or staff member (or type a name), set a due-back date, link a work order or move, confirm.
    - **Check in, Mark missing, Found.**
  - **Detail sections:** Details, History and Activity.
  - **Replacing the old sections:**
    - The property, building and unit key sections become related lists of `key_sets`.
    - The move Keys section writes movements: a handover is a check-out to the lease's tenant, and "Returned" is a check-in.
    - The work-order Entry section gets "Check out key to vendor".
    - The vendor portal's access block lists keys held by that vendor, with due-back dates.
- *Permissions:*
  - `keys.manage` to check out and check in.
  - `keys.view_codes` to see `access_code`. Codes are masked otherwise; real protection comes with `PLAT-01`.

**Steps**
1. Confirm the table names in the live database, then write the migration with the data copy.
2. Write the data layer and status helper.
3. Build the Keys screen and the checkout and check-in wizards.
4. Swap the property, building and unit sections for related lists.
5. Rewire the move Keys section.
6. Add the work-order action and the vendor portal list.
7. Add the overdue job and the email template.

**Research before building**
- Key Automate's flows (https://help.proptechlabs.com/en/articles/10004225-overview-of-key-automate).
- US smart-locker and key-tracking vendors (Keycafe, KeyNest, KeyTrak) for a later adapter.
- Whether printed QR or barcode tags are needed in v1 (a QR library dependency).

**Acceptance criteria**
- The migration copies every existing key row; counts match for each owning record.
- Checking out K-104 to vendor X, due Friday, from a work order sets the key to `checked_out` with holder vendor X and records a movement with the `work_order_id`. The vendor portal shows the key.
- On Saturday, the Cabinet shows Overdue and the job sends one digest. Running it again the same day sends nothing.
- Check-in clears the holder and due date, and History shows both movements with who did them.
- A move-out with keys marked Returned creates check-in movements; "Missing" creates `mark_missing`.
- A second, concurrent checkout of the same key fails with "already checked out".

**Depends on / unblocks** — Depends on `PLAT-01` (for real code masking). Cross-references COMM (work orders) and LEAS (moves).

**Open decisions**
- QR or printed tags in v1?
- Integrate smart lockers later, and with which vendor?

#### INTL-11 · Change of ownership
- **MRI equivalent:** Property Tree's "change of ownership" process, taught as a module of its trust accounting course.
- **Status · priority · effort:** Saved-unused · P2 · M
- **Refs:** Inventory 6.25, 6.78 · gap 0.8

**Geiger today**
- **Ownership dates are stored but unused.** `property_owners` has `starts_on` and `ends_on` (`supabase/migrations/20261015210600_engine_foundations.sql:91-107`), but every owner resolver ignores them and takes the primary or first owner:
  - **Client:** `ownerOfProperty`, cached per session (`lib/supabase/ledger.js:297-306`).
  - **Server:** `primaryOwnerOf` (`lib/payments/context.js:36-45`), used for every online payment (`lib/payments/posting.js:50, 140, 173`).
  - **Management-fee job:** `lib/jobs/financial.js:92-94`.
- **The effect:** after a sale, rent keeps posting to the old owner.
- **No wizard** settles the old owner and starts the new one.

**What's missing**
- Owner resolution by date.
- Settling the old owner's trust balance.
- A final statement for the old owner and a clean start for the new one.

**How to build**
- *Data model:* None; the dates already exist. Optionally record `metadata.ownershipChanges` on the property.
- *Server logic:*
  - **`lib/ledger/owners.js`:**
    - `ownersOn(rows, date)` returns the rows active on that date (`starts_on` on or before it, and `ends_on` null or on or after it).
    - `primaryOwnerOn(rows, date)`.
  - **Replace the three resolvers** with date-aware versions keyed by the entry or payment date. Ship this together with CORE-08 (gap 0.8), which rewrites the same functions to split co-owners.
  - **`buildOwnerTransfer({ propertyId, fromOwnerId, toOwnerId, amount, date, bankAccountId })`:** an `adjustment` that debits trust cash for the new owner and credits trust cash for the old owner, on the same property and bank, with key `owner-change:<property>:<date>`.
- *UI:* A "Change of ownership" action on the Property → Owners section (`config.actions` wizard, `wizard_dialog.jsx`). Steps:
  1. Effective date, plus the new owner or owners and their percentages (must total 100).
  2. Settle the old owner. Show their trust position, reserve, open payables and unpaid bills, then either distribute the balance (a distribution; payout is CORE-51, CORE-54 (gap 11.3)) or transfer it to the new owner.
  3. Deposits stay with the leases. Show a note on state rules for transferring deposits on a sale.
  4. The new owner's management agreement dates and fee terms.
  5. Confirm. This ends the old rows (`ends_on` = date − 1), inserts the new rows, posts the transfer or distribution, links a "Final statement" (the Owner Statements report filtered to the old owner up to the date) and invites the new owner to the portal.
- *Permissions:* `accounting.post` plus permission to edit records.

**Steps**
1. Write the date-aware resolvers, with unit tests.
2. Replace the three call sites, in the same change as CORE-08 (gap 0.8).
3. Add the transfer builder.
4. Build the wizard.
5. Link the final statement and the invite.

**Research before building**
- State rules on transferring security deposits when a property is sold, for example California Civil Code §1950.5(g) and Texas Property Code §92.105, including the notice owed to tenants.
- How Property Tree and AppFolio handle fees and statements when the owner changes mid-month.

**Acceptance criteria**
- Owner A hands over to owner B effective the 15th:
  - Rent paid on the 10th posts to A.
  - Rent paid on the 16th, online or recorded manually, posts to B.
  - The management-fee job splits by collection date.
- With the transfer option, A's position is 0 and B's equals the amount transferred. Total trust is unchanged and the INTL-05 reconciliation still balances.
- A back-dated payment dated the 12th, entered after the change, posts to A.
- A's owner statement ends on the 14th, and B's starts on the 15th.

**Depends on / unblocks** — Depends on CORE-08 (gap 0.8) (same resolvers) and CORE-51, CORE-54 (gap 11.3) (payout).

#### INTL-12 · Staff tasks and follow-ups
- **MRI equivalent:**
  - Property Tree: "Task management" and "Custom workflows" in every tier.
  - Palace: a central task overview so "nothing gets missed".
- **Status · priority · effort:** Partial · P2 · M
- **Refs:** Inventory 2a.19, 2b.8, 5.75, 9.21

**Geiger today**
- **To-dos exist only inside modules:**
  - **Prospect follow-ups:** `record_items` of kind `follow_up` (`components/internal/screens/marketing/prospects.jsx:84-94`).
  - **The lease onboarding list:** `components/internal/screens/leasing/sections/lease_overview.jsx:81-90`.
  - **The turn checklist:** `components/internal/screens/maintenance/shared.js:361-372`.
- **What is absent:** a general task with an assignee and due date, a "my tasks" view and reminders.
- **Needs Attention is not assignable.** The Overview's Needs Attention card is computed from data, so nothing in it can be assigned (`components/internal/screens/overview/property_overview.jsx:716-760`).

**What's missing**
- Tasks with an assignee and due date, linked to any record.
- Views for "my tasks", due today and overdue.
- A daily digest.
- An automation step that creates a task.

**How to build**
- *Data model:* Migration `staff_tasks`. Avoid the generic name `tasks`, which risks colliding with an orphan table.
  - **`property.staff_tasks`:**
    - `project_id`, `title`, `description`
    - `status` (open, done or cancelled), `priority`, `due_on`, `remind_at`
    - `assignee_id`, `assignee_name`
    - `related_type`, `related_id`, `related_label`
    - `source` (manual, automation or checklist), `completed_at`, `completed_by`, plus the standard columns
  - **Indexes:** `(project_id, status, due_on)`, `(assignee_id, status)` and `(related_type, related_id)`.
- *Server logic:*
  - `lib/supabase/staff_tasks.js`: `makeEntityData`.
  - **The `tasks-due` job** (`lib/jobs/operations.js`) sends a daily digest per assignee:
    - by email through geiger-dash
    - in the app through **geiger-notify** (`@geiger/notify/server` `createServerNotifier`; the `notify` schema is owned by geiger-dash). This is Property's first use of geiger-notify.
  - **A "Create task" automation step:** in `lib/automations/catalog.js` and `runner.js`, next to `create_work_order` (`lib/automations/runner.js:335-361`). Coordinate with PLAT-13 (gap 9.7).
- *UI:*
  - **"Tasks" in the sidebar,** placed after Communications: `components/internal/screens/tasks/tasks.jsx`, an `EntityListScreen`.
    - Views: My tasks, Due today, Overdue and All.
    - A quick-add row and a "done" checkbox.
  - **A shared "Tasks" related section** (`makeRelatedSection`) on the Property, Unit, Lease, Tenant, Owner, Vendor and Work Order editors, with "Add task".
  - **A "My tasks" card** on the Overview.
- *Permissions:* `view.tasks`, derived from the sidebar title. Any staff member who can view can create and complete tasks.
- *Suite reuse:* Geiger Flow has tasks, but they live in Flow's own schema and project model with no link to property records. Reuse Flow's UI patterns, not its data.

**Steps**
1. Write the migration and the data layer.
2. Build the Tasks screen.
3. Add the related section to the seven editors.
4. Add the Overview card.
5. Add the digest job using geiger-notify.
6. Add the automation step.

**Research before building**
- Read the geiger-notify README (`C:\Pro\geiger-notify\README.md`) on registering notification types, and check that `notify` is an exposed schema in the shared Supabase project.

**Acceptance criteria**
- A task created on a lease, due tomorrow and assigned to Dana, appears in Dana's "My tasks", in the lease's Tasks section and in tomorrow's digest, once.
- The "Move-out checklist" workflow template, given a Create task step, creates tasks linked to the lease.
- Completing a task sets `completed_at` and `completed_by`, and the Overdue view excludes done tasks.

**Depends on / unblocks** — Depends on CORE-10 (gap 0.10) (scheduler) for the digests and on PLAT-13 (gap 9.7) for the automation step.

#### INTL-13 · Xero connector
- **MRI equivalent:** Property Tree "MRI CRM & Xero integration" (Base tier).
- **Status · priority · effort:** Missing · P3 · M
- **Refs:** Inventory 6.99

**Geiger today** — As in INTL-09: no accounting provider exists.

**What's missing** — A Xero adapter on the INTL-09 engine.

**How to build**
- *Data model:* None beyond INTL-09 (`provider = 'xero'`).
- *Server logic:* `lib/accounting/providers/xero.js`, implementing the INTL-09 adapter:
  - **Auth:** OAuth 2.0 authorisation code, with scopes `offline_access` and the accounting transactions and settings scopes (confirm Xero's current granular scopes), and the `xero-tenant-id` header.
  - **Posting:** POST `ManualJournals`. `JournalLines` take `LineAmount` (positive = debit, negative = credit), `AccountCode` and `Tracking`. Xero allows up to two tracking categories; use one for the property.
  - **Mapping:** read `Accounts` and `TrackingCategories`.
  - **Closed periods:** use the organisation lock dates (`PeriodLockDate`, `EndOfYearLockDate`) as the closing date.
- *API routes / jobs, UI, permissions:* The same as INTL-09; `[provider]` routes already cover Xero.

**Steps**
1. Write the adapter against a Xero demo company.
2. Add tracking-category mapping.
3. Handle lock dates.
4. Turn on the "Connect Xero" button.

**Research before building**
- ManualJournals API: https://developer.xero.com/documentation/api/accounting/manualjournals
- Token lifetimes (about 30 minutes for access, 60 days for refresh).
- Developer pricing tiers in force since 2 Mar 2026: https://developer.xero.com/pricing and https://devblog.xero.com/updates-to-xero-developer-pricing-and-terms-conditions-3bad2f05215c. Third-party summaries say the App Partner Program is required beyond 25 connections.
- Xero's US availability and market share.

**Acceptance criteria**
- The same checks as INTL-09, run against a Xero demo company.
- The tracking category is set per property.
- Postings into a locked period fail with a clear message.

**Depends on / unblocks** — Depends on INTL-09.

**Open decisions**
- Build this before a US customer asks? Suggested trigger: three paying customers who use Xero.

#### INTL-14 · Property Tree AI parity (deferred)
- **MRI equivalent:**
  - **Every tier:** AI invoice processing (Invoice Automate) and Property Tree Assistant email drafting.
  - **Premium:** AI maintenance workflows (Maintenance Plus).
  - **Pro:** AI inspection comments, image recognition and asset detection (Inspection Manager), and the AI Assistant "Alex" website chatbot, whose leads go into the CRM.
  - **Also:** reHeroes "Alex for Tenants".
- **Status · priority · effort:** Missing · Skip (deferred under the no-AI decision) · S
- **Refs:** Gaps 10.1–10.7 · Inventory 10.1

**Geiger today**
- **No AI.** The "AI Assistant" menu item opens Coming Soon (`components/internal/screens/registry.jsx:85-87`; `components/internal/sidebar/sidebar_nav.jsx:208`).
- **The internal plan contradicts this:** it promises an AI copilot even in the free tier (`docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md:405-411`).

**Positioning risk**
- **AI is table stakes in this segment.** MRI's cheapest small-agency tier bundles AI invoice processing at about US$1 per property, so "AI included" is the minimum, not a moat.
- **Until the suite AI package ships, Geiger must not claim AI anywhere.** That covers the INTL-01 plan copy and the PLAT marketing-claims audit.
- **The pitch should lean on what Property Tree lacks in the US:**
  - US trust rules (INTL-05, INTL-08)
  - QuickBooks (INTL-07, INTL-09)
  - Stripe ACH and card payments with autopay
  - owner and vendor portals
  - built-in utility bill splitting (RUBS)

**What's missing** — The non-AI groundwork that lets a future suite AI package plug in. Each piece belongs to another file:

| Property Tree AI feature | Non-AI groundwork that makes it pluggable | Owner |
|---|---|---|
| AI invoice processing | Bill intake with an attached PDF, invoice number, a duplicate check on vendor + invoice number + amount (none today: `components/internal/screens/accounting/bills.jsx:445`; `lib/portal/vendor.js:218-251`), and an email-in address | CORE-49 (gap 6.12) |
| Property Tree Assistant email drafting | A message composer with merge fields (`lib/messaging/merge_fields.js`) that has a "draft" slot | LEAS-40, LEAS-41, LEAS-43, LEAS-44, LEAS-57 (gap 4.1) |
| AI maintenance workflows and triage | Structured request category, priority and photos at intake; an automation trigger on new requests | COMM (maintenance); PLAT-13 (gap 9.7) |
| AI inspection comments and image recognition | Photos and condition fields on each item of an inspection template | COMM-02, COMM-03, COMM-04, COMM-07 (gap 5.3) |
| AI Assistant website chatbot → CRM | Public listing pages and a lead-intake endpoint with source tracking | LEAS-01 (gap 2.2), 2.7 |
| Ask-your-data | The report catalog as typed data (`lib/reports/catalog.js`) | PLAT AI groundwork |

**How to build** — No Property code is needed here. The suite package interface belongs to the PLAT AI groundwork. This item's deliverable is a pre-launch claims check: grep Property and geiger-dash copy for "AI" and remove every claim that the code doesn't back.

**Steps**
1. Confirm that each hook point above is in its owner's spec.
2. Run the claims grep before launch.

**Acceptance criteria**
- No Property page, plan or FAQ lists an AI feature.
- Each hook point above appears in its owning file.

**Depends on / unblocks** — Depends on the PLAT AI groundwork and the future suite AI package.

### Not building here

| MRI product | Why not | Revisit trigger |
|---|---|---|
| Property Tree (AU) and Palace (NZ) as markets | Selling there needs AUD and NZD, GST, state agency trust acts and NZ Healthy Homes. Geiger is US dollars and US tax only (gaps 6.14 and 6.15 are Skip). They are design benchmarks only; the items above take what transfers. | Leadership decides to sell outside the US, or ANZ agencies make sustained inbound requests |
| Property Tree Connect (tenant app) | Already covered as resident mobile app work. | Owned by LEAS-48 (gap 4.4) |
| Business Insights Pro: leasing benchmark, market insights | Needs anonymised data pooled across many customers, which Geiger does not have yet. Portfolio KPIs belong to CORE-41, CORE-44, CORE-45 (gap 7.1)–7.4. | About 200 or more live customers who consent to anonymised benchmarking |
| Rest Professional | A legacy desktop trust-accounting product that MRI supports only while customers remain. Nothing to learn beyond migration habits. | None |
| Strata Master (AU strata / body corporate) | Association accounting. The US equivalent is condo and HOA management (gap 8.3, P3), which is not Geiger's buyer. | Geiger deliberately targets HOAs (see the HOUS file) |
| VaultRE / VaultEA / EagleCRM / Box+Dice ("MRI CRM") | Sales-agent CRMs that run listings through to settlement. Geiger's buyer manages rentals, not sales. | Geiger adds brokerage sales, which is not planned |
| Qube PM / MRI Horizon (UK) | Qube is UK block management with leasehold service charges. Horizon is occupier lease administration, now ProLease Enterprise (ASC 842 and IFRS 16). Neither serves US residential. | None |
| MRI Agency Solutions / Sales and Lettings (CML, Thesaurus; UK, IE, ZA) | UK lettings and sales agency software, built around UK law and portals. | None |
| UK social housing and council suites (Orchard, Castleton, Housing Partners, Capita One) | UK public-sector procurement (G-Cloud) and housing regulation; entrenched incumbents. | None |
| South Africa: Property Central (ex-MDA), PropSys, Rentbook, TPN | Property Central and PropSys are commercial and REIT systems. TPN is a South African credit bureau. **Rentbook** is a small-landlord twin that bundles TPN screening; the lesson (screening built into a cheap tier) belongs to RISK. | None for the products. Watch Rentbook as a pricing and bundling reference. |
| MRI Simplicity (Asia, ex-Anacle) | Commercial property and facilities management for Asian portfolios. | None |
| MRI Intermodal (container leasing and depots, iInterchange) | An unrelated industry. | None |
| Agora Insights and the Agora AI layer | The suite AI package covers this. | PLAT AI groundwork |
| Palace Social Housing variant | Subsidised housing. The US equivalent (gap 8.1) is Skip. | See the HOUS file |
| **MRI Managed Services** (outsourced property accounting) | **A services business, not software.** MRI sells bank reconciliations, financial statements, AR/AP support and journal entries, either full-service or à la carte ([MRI](https://www.mrisoftware.com/services/property-accounting/)). Geiger could offer two services: (1) "done-for-you" conversion at a flat fee, delivering the 48-hour promise, and (2) monthly bookkeeping and trust reconciliation through certified partner bookkeepers. These are business options, not code. The software they would need is INTL-04, INTL-05 and INTL-08, plus an "external accountant" role limited to certain properties (PLAT-08 (gap 9.3)). | Repeated requests for "do it for us" conversion, or a bookkeeping partner signed |
