# Geiger Property codebase audit: investment/asset management, platform extensibility, and AI/document intelligence (fact check of the "Geiger Studio" claims)

Scope: a read-only audit of C:/Pro/geiger-property as of 2026-11-02 (HEAD 4fdcbd7; the working tree differs only by convention docs moved into `conventions/`). Every source below is a local file path with line numbers. No web sources were used. The last feature commit was 2026-10-20 (`9be8f05`). Later commits touch only the header badges, SEO and CI (`git log`). The earlier baseline, `research_notes/Property management software features/geiger_current_state.md` (2026-10-16), is now **stale**. It reported "no double-entry ledger", "nothing executes" for automations, "no `app/api`" and no portals. Every one of those has since been built (details below).

Status legend used throughout: **schema** = a migration creates the table or column; **data layer** = there is a `lib/supabase/*.js` module; **UI** = a registered screen or editor section exists; **wired** = it runs end to end (server route or job, DB writes, visible result).

## Claim 1: "Focuses on current operational data; lacks valuation/CapEx modelling and debt/equity management"

### Takeaway
**Verdicts by sub-claim:**

| Sub-claim | Verdict | Why |
|---|---|---|
| "Only current operational data" | **PARTLY TRUE** | The product is operations-first, but it also has a real double-entry GL with P&L, balance sheet and cash flow, monthly budgets with budget-vs-actual, job costing against budgets, and forward rent-escalation schedules per lease. |
| "Lacks valuation and CapEx modelling" | **TRUE** | Valuation fields are inert inputs. Capital projects are tracked only as historical costs. There is no depreciation, no multi-year capital plan, and no IRR, cap-rate or yield maths. |
| "Lacks mortgages / debt" | **TRUE** | No loan table, no loan GL accounts in the default chart, and no amortisation. |
| "Lacks investor equity contributions" | **PARTLY TRUE** | Owner contributions and distributions are real ledger postings, shared by ownership %, and shown in an owner portal. This is property-owner trust accounting, not investor or fund equity. |
| "Lacks distribution waterfalls" | **TRUE** | No waterfall logic anywhere. |

### Cited Findings

**What exists (operational and accounting depth beyond "who owes rent today")**
- **Real double-entry general ledger** (schema + data layer + UI + wired). Migration `ledger_core` owns `property.ledger_entries` and `ledger_lines`, `ledger_post`/`ledger_void`, the default chart, and balance views. Lines carry property, unit, lease, tenant, owner, vendor, bank and job dimensions. — [20261015212744_ledger_core.sql:1-10, 108-133](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- **Allowed ledger source types** are a fixed CHECK list: charge, payment, credit, bill, bill_payment, distribution, contribution, management_fee, deposit_held, deposit_return, late_fee, adjustment, deposit_interest. There is no depreciation, loan or interest type. — [ledger_core.sql:73-76](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- **Default chart of accounts.** It includes Capital Improvements (1500, fixed_asset), Owner Equity (3000), Owner Contributions (3100) and Owner Distributions (3200). Its only liabilities are AP, deposits and prepaid rent. It has **no** Mortgage/Notes Payable, Interest Expense, Depreciation Expense or Accumulated Depreciation accounts. — [ledger_core.sql:466-494](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- **Financial statements are computed from the ledger:**
  - balance sheet with an equity check — [ledger_math.js:181-195](C:/Pro/geiger-property/lib/reports/ledger_math.js); [defs_financial.js:169-191](C:/Pro/geiger-property/lib/reports/defs_financial.js)
  - cash flow whose "financing" section is only owner contributions and distributions — [defs_financial.js:222](C:/Pro/geiger-property/lib/reports/defs_financial.js); [ledger_math.js:201](C:/Pro/geiger-property/lib/reports/ledger_math.js)
- **NOI exists only as a historical figure:**
  - the owner statement computes `noi = income − expenses − fees` — [ledger_math.js:499](C:/Pro/geiger-property/lib/reports/ledger_math.js); [defs_operations.js:329, 376-378](C:/Pro/geiger-property/lib/reports/defs_operations.js)
  - the budget screen shows "Actual NOI" — [budgets.jsx:386](C:/Pro/geiger-property/components/internal/screens/accounting/budgets.jsx)
- **Budgets** (schema + data layer + UI + wired). `property.budget_lines` holds monthly amounts per budget × property × GL account × year. Actuals come from the ledger, with variance by month, YTD or full year. Planning is annual; an annual amount can be spread evenly across 12 months. — [ledger_core.sql:153-169](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql); [budgets.jsx:25-40, 300-364](C:/Pro/geiger-property/components/internal/screens/accounting/budgets.jsx)
- **Job costing** (schema + data layer + UI + wired). `property.cost_jobs` defaults to kind "Capital project", with a budget and start/end dates. Its cost is the ledger lines tagged `job_id` on Expense or Asset accounts, shown as budget vs actual per GL account. Bills can be tagged to a job. — [ledger_core.sql:171-190](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql); [job_costing.jsx:24-46](C:/Pro/geiger-property/components/internal/screens/accounting/job_costing.jsx); [bills.jsx:453](C:/Pro/geiger-property/components/internal/screens/accounting/bills.jsx); [cost_jobs.js:4-10](C:/Pro/geiger-property/lib/supabase/cost_jobs.js)
- **Forward rent projection per lease.** "Rent & escalations" is a dated schedule (new amount or % increase). `projectSchedule` applies the steps in date order. — [lease_money.jsx:69-100](C:/Pro/geiger-property/components/internal/screens/leasing/sections/lease_money.jsx)

**Valuation and CapEx: what exists and what is missing**
- **Property valuation fields are static metadata inputs** (UI + metadata only). Acquisition: purchase date, purchase price, current estimated value, "Valued on". Parcel: assessed value, annual property tax. — [property_tabs.jsx:52-72](C:/Pro/geiger-property/components/internal/screens/properties/sections/property_tabs.jsx)
- **Nothing reads those fields.** A repo-wide grep for `currentValue|purchasePrice|taxAssessedValue` outside that field list returns no hits. There is no cap rate, equity, LTV or unrealized-gain computation. — grep over [components/](C:/Pro/geiger-property/components) and [lib/](C:/Pro/geiger-property/lib)
- **Portfolio "Targets"** include occupancy, rent roll, "Target annual NOI", budget year and fiscal-year start, plus a strategy select (Core … Opportunistic). Only the occupancy and rent-roll targets are compared on the overview; `targetNoi` is stored but never used. — [portfolios/sections.jsx:295-324, 95-99](C:/Pro/geiger-property/components/internal/screens/portfolios/sections.jsx)
- **Asset register** (record_items, kind "asset"). Fields: install date, warranty end, service interval, "Replacement cost" and "Expected life (years)". `expectedLifeYears` is never read anywhere, so there is no reserve, replacement-year or depreciation projection; only service-due and warranty badges are derived. Unit assets carry purchase cost and service dates. — [record_kinds.js:111-131, 133-140, 277-286](C:/Pro/geiger-property/components/internal/screens/properties/record_kinds.js); [units/config.jsx:572-590](C:/Pro/geiger-property/components/internal/screens/units/config.jsx)
- **No depreciation, multi-year capital plan, IRR, cap-rate or forecast code.** A grep for `depreciat|amortiz|irr|cap rate|forecast|valuation` in code (excluding seeds and docs) finds only the "Valued on" label and the strings above. — grep over [lib/](C:/Pro/geiger-property/lib), [components/](C:/Pro/geiger-property/components), [supabase/migrations/](C:/Pro/geiger-property/supabase/migrations)

**Debt and equity**
- **No mortgage, loan or debt entity.** None of the ~85 tables created by migrations is a loan, mortgage, investor, fund, valuation or capital plan table. The schema list includes `owners`, `property_owners`, `ledger_*`, `budgets`, `budget_lines`, `cost_jobs` and `cam_reconciliations`. — [supabase/migrations/](C:/Pro/geiger-property/supabase/migrations) (`create table if not exists` across all 31 files)
- **Owner equity is real but owner-level:**
  - `property.property_owners` links owner ↔ property with `ownership_pct` and effective dates — [20261015210600_engine_foundations.sql:90-107](C:/Pro/geiger-property/supabase/migrations/20261015210600_engine_foundations.sql)
  - an owner distribution posts Dr Owner Distributions / Cr trust cash — [postings.js:300-309](C:/Pro/geiger-property/lib/ledger/postings.js)
  - the ledger dialogs post contributions and distributions — [ledger_dialogs.jsx:62](C:/Pro/geiger-property/components/internal/screens/accounting/ledger_dialogs.jsx); [ledger_section.jsx:69-70, 83](C:/Pro/geiger-property/components/internal/screens/accounting/ledger_section.jsx)
  - the owner portal splits property lines by ownership % — [lib/portal/owner.js:101-102, 116-145](C:/Pro/geiger-property/lib/portal/owner.js); [owner_statements.jsx:13, 137-145](C:/Pro/geiger-property/components/portal/owner/owner_statements.jsx); [app/api/portal/owner/statements/route.js:5](C:/Pro/geiger-property/app/api/portal/owner/statements/route.js)
  - policies hold an owner reserve and distribution day — [policies.js:146-147](C:/Pro/geiger-property/lib/policies.js)
- **Distributions are bookkeeping only.** No Stripe Connect transfers or ACH owner payouts exist; a grep for `transfers.create|stripe.accounts|on_behalf_of` finds nothing. — grep over [lib/](C:/Pro/geiger-property/lib), [app/](C:/Pro/geiger-property/app)
- **Recorded product decision:** the planning doc lists "End-to-end real-estate ERP (investment mgmt + fund accounting)" under "P4 — Explicitly deferred / out of scope". It also lists "Investor CRM + capital-call / partner accounting" as an enterprise feature. — [docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md:118-122, 374-381](C:/Pro/geiger-property/docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md)

### Inferences
- **Calling it "current operational data" understates it.** The claim describes the product's centre of gravity, the Overview KPIs and rent roll (see Claim 5), but ignores a real GL, budgets, job costing and statements. It is accurate for **investment-grade** analytics: nothing models the future value of an asset, its debt service or investor returns.
- **"Equity contributions" is the weakest part of the claim.** Contributions exist as owner-trust ledger postings with per-owner shares. What is missing is fund-level equity: commitments, capital calls, classes or tiers, preferred return, waterfall, and investor IRR.

### Gaps
- Live DB contents were not inspected; tables come from migration files only. The memory notes ~80 orphan tables from a deleted branch in the live DB, which this audit ignores.
- Not tested in a browser. Correct computation (for example, the balance sheet "balanced" check) is taken from the code, not observed.

## Claim 2: "Geiger is closed (preset interface); no low-code toolkit for custom tables, screens or workflows; no deep enterprise integrations (Salesforce, Yardi, BI warehouses)"

### Takeaway
**Verdicts by sub-claim:**

| Sub-claim | Verdict | Why |
|---|---|---|
| "Closed / preset interface" | **PARTLY TRUE** | No public API, API keys, OAuth, SDK or MCP server. Webhook endpoints can be saved but "nothing is sent". Inside the app, though, there is real configuration (below). |
| No custom tables | **TRUE** | Custom fields exist, but no user-defined objects. |
| No custom screens | **TRUE** | The screen registry is hard-coded. |
| No custom workflows | **FALSE** | There is a no-code, event-driven workflow builder with a drag-and-drop canvas, conditions and 5 step types. It is executed by a server runner fed by DB triggers. |
| "No deep enterprise integrations" | **TRUE** | Only Stripe (payments) and suite email through geiger-dash (Resend) are live. There is no Salesforce, Yardi, QuickBooks/Xero, BI connector or CSV import. |

### Cited Findings

**No external API surface**
- **All 43 `app/api` routes are first-party.** Groups: cron jobs, staff messaging, Stripe payments and webhook, and resident/owner/vendor portal endpoints. There is no versioned or public API, no API-key or OAuth handling, and nothing matches `x-api-key|oauth|mcp|openapi|graphql`. The only `apikey` hit is the product-badge fetch. — [app/api/](C:/Pro/geiger-property/app/api) (file list); [lib/product-badges.js:5-14](C:/Pro/geiger-property/lib/product-badges.js)
- **The cron route** accepts `Bearer ${CRON_SECRET}` (GET) or a signed-in staff "Run now" (POST). — [app/api/cron/[job]/route.js:7-36](C:/Pro/geiger-property/app/api/cron/[job]/route.js)
- **Webhooks are stored, never delivered.** The settings card says "event delivery isn't connected yet — nothing is sent". There are 6 event names. — [integrations.jsx:26-27, 140-146](C:/Pro/geiger-property/components/internal/screens/settings/integrations.jsx); [settings/shared.js:91-100](C:/Pro/geiger-property/components/internal/screens/settings/shared.js)
- **The Integrations screen is static.** It shows 6 provider cards (Payments/Stripe, E-signature, Screening, Listing syndication, Accounting export, Email & SMS), each with "Not connected" and a **disabled** Connect button. It says "None of these are connected yet". — [integrations.jsx:29-36, 105-133](C:/Pro/geiger-property/components/internal/screens/settings/integrations.jsx)
  - The Stripe card is stale: Stripe is actually wired through env keys (next item).

**What is integrated (live)**
- **Stripe is live** (wired, env-configured):
  - client module — [lib/stripe/server.js:1-19](C:/Pro/geiger-property/lib/stripe/server.js)
  - webhook handling checkout, charge failed/refunded, disputes, payouts and autopay setup — [app/api/stripe/webhook/route.js:1-14](C:/Pro/geiger-property/app/api/stripe/webhook/route.js)
  - payment routes (checkout, autopay, refund, link, sync…) — [app/api/payments/](C:/Pro/geiger-property/app/api/payments)
  - dependency — [package.json:39](C:/Pro/geiger-property/package.json)
  - settings screen — [payment_settings.jsx:1-3](C:/Pro/geiger-property/components/internal/screens/payments/payment_settings.jsx)
- **Email goes out through the suite service.** It is POSTed to geiger-dash (default base URL `https://geiger.studio`), which renders the templates and delivers through Resend. This is "the single outbound integration point". — [lib/email/client.js:1-16](C:/Pro/geiger-property/lib/email/client.js)
- **SMS and inbound email are stubs:**
  - SMS: "No SMS provider is chosen yet", so sends return not-sent — [lib/messaging/deliver.js:4, 17-24](C:/Pro/geiger-property/lib/messaging/deliver.js)
  - inbound: a "stub, provider-agnostic. Not wired to a mail provider yet" — [app/api/messages/inbound/route.js:7-14](C:/Pro/geiger-property/app/api/messages/inbound/route.js)
- **E-sign, screening and syndication are tracking-only:**
  - e-sign: "Tracking only — no provider is connected" — [lib/supabase/esign.js:3-5](C:/Pro/geiger-property/lib/supabase/esign.js); [esignature.jsx:36, 47-50, 85](C:/Pro/geiger-property/components/internal/screens/leasing/esignature.jsx)
  - listings: "nothing is sent to Zillow, Apartments.com…" — [listing_sections.jsx:177](C:/Pro/geiger-property/components/internal/screens/marketing/sections/listing_sections.jsx)
  - recorded user decisions: e-sign will come from geiger-docs later; screening and syndication are "internal tracking only" — [memory full_build_decisions.md:13-17](C:/Users/space/.claude/projects/C--Pro-geiger-property/memory/full_build_decisions.md)
- **No enterprise or third-party data connectors.** A grep for `quickbooks|xero|plaid|docusign|salesforce|yardi|appfolio|snowflake|bigquery|power bi|tableau|transunion|experian|checkr|zapier|twilio|sendgrid` in app/lib/components/migrations finds only option labels (for example bureau names, and Zillow as a listing-source string). There is no integration code. — grep over [app/](C:/Pro/geiger-property/app), [lib/](C:/Pro/geiger-property/lib), [components/](C:/Pro/geiger-property/components)
- **Data in and out is limited:**
  - no CSV import or bulk import (grep finds no parser or import screen)
  - reports export CSV — [lib/reports/csv.js:1-3](C:/Pro/geiger-property/lib/reports/csv.js)
  - reports print to PDF through the browser's "Save as PDF" — [report_print.jsx:1-4](C:/Pro/geiger-property/components/internal/screens/reports/report_print.jsx)
  - reports can be scheduled as emails — [lib/jobs/scheduled_reports.js:155](C:/Pro/geiger-property/lib/jobs/scheduled_reports.js)
  - reports come from a fixed code catalog of definitions, not a report builder — [lib/reports/catalog.js:5-10](C:/Pro/geiger-property/lib/reports/catalog.js)
- **README overclaims.** It advertises "a custom report builder", but no builder exists (grep for `report builder|custom report` finds nothing). The planning doc still lists it, open-API/webhooks and QuickBooks/Xero sync as unchecked items. — [README.md:34](C:/Pro/geiger-property/README.md); [COMPETITIVE_FEATURE_ANALYSIS_2026.md:107, 343, 360](C:/Pro/geiger-property/docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md)

**What is configurable in-app (low-code within bounds)**
- **Workflow builder** (schema + data layer + UI + server runner):
  - catalog of 7 record types, 12 triggers (record events, timed lease-ending and rent-overdue, and schedules), typed condition fields and operators, and 5 step types (send message, notify team, create work order, update status, wait), plus built-in templates — [lib/automations/catalog.js:1-15, 29-105, 134-172, 225-231, 289](C:/Pro/geiger-property/lib/automations/catalog.js)
  - canvas editor on React Flow that auto-saves conditions, steps and positions — [workflow_canvas.jsx:1-29](C:/Pro/geiger-property/components/internal/screens/automations/canvas/workflow_canvas.jsx); [package.json:22](C:/Pro/geiger-property/package.json)
  - DB triggers on leases, applications, work orders, transactions and moves enqueue `property.automation_events` — [20261015212609_messaging_scheduler_automations.sql:150, 214-229, 295-300](C:/Pro/geiger-property/supabase/migrations/20261015212609_messaging_scheduler_automations.sql)
  - an idempotent runner drains the queue and executes the steps — [lib/automations/runner.js:18-22](C:/Pro/geiger-property/lib/automations/runner.js); [automations.jsx:50-52](C:/Pro/geiger-property/components/internal/screens/automations/automations.jsx)
  - "Use template" creates a Draft workflow — [workflow_templates.jsx:34-35](C:/Pro/geiger-property/components/internal/screens/automations/workflow_templates.jsx)
- **Scheduled jobs (8)** — [lib/jobs/registry.js:7](C:/Pro/geiger-property/lib/jobs/registry.js); [financial.js:492-525](C:/Pro/geiger-property/lib/jobs/financial.js); [preventive_work_orders.js:144](C:/Pro/geiger-property/lib/jobs/preventive_work_orders.js); [autopay.js:45](C:/Pro/geiger-property/lib/jobs/autopay.js); [operations.js:15](C:/Pro/geiger-property/lib/jobs/operations.js):
  - recurring-charges
  - late-fees
  - management-fees
  - deposit-interest
  - autopay
  - automations
  - preventive-work-orders
  - scheduled_reports
- **Jobs are not scheduled in the current deployment.** `vercel.json` contains only a `$schema` key, because the crons were removed on 2026-10-20 while the app is in development. Jobs run through "Run now" or an external caller with `CRON_SECRET`. — [vercel.json](C:/Pro/geiger-property/vercel.json); [scheduled_jobs.jsx:21-23](C:/Pro/geiger-property/components/internal/screens/automations/scheduled_jobs.jsx); [memory communications_chat.md](C:/Users/space/.claude/projects/C--Pro-geiger-property/memory/communications_chat.md)
- **Custom fields** (wired). There are 11 types (text, long text, number, currency, date, single/multi choice, yes/no, email, phone, link) for 10 entities: properties, buildings, units, tenants, leases, owners, vendors, work orders, applications, prospects. Definitions sit in settings `custom_fields`; values sit in each record's `metadata`. They render only as an editor section; nothing in `lib/reports` or the list screens references them. — [settings/shared.js:104-131](C:/Pro/geiger-property/components/internal/screens/settings/shared.js); [custom_fields.jsx:19-21](C:/Pro/geiger-property/components/internal/screens/settings/custom_fields.jsx); [factories.jsx:518-569](C:/Pro/geiger-property/components/internal/screens/entity/sections/factories.jsx)
- **Policy cascade.** Fee and payment policies are set at company level, then overridden per property, then per lease, each override stored in `metadata.policyOverrides`. — [lib/policies.js:1-4](C:/Pro/geiger-property/lib/policies.js)
- **Other configuration:**
  - lease templates with merge fields and a clause library — [lease_templates.jsx:50-51](C:/Pro/geiger-property/components/internal/screens/leasing/lease_templates.jsx)
  - Roles & Permissions matrix (advisory UI gating) — [lib/rbac.js:1-16](C:/Pro/geiger-property/lib/rbac.js)
  - Branding & Portals, Notifications settings — [registry.jsx:167-175](C:/Pro/geiger-property/components/internal/screens/registry.jsx)
- **No custom objects or screens.** `SCREEN_REGISTRY` is a static title → component map. Nav titles are hard-coded and drive URL slugs and `view.*` permission keys. — [registry.jsx:85-180](C:/Pro/geiger-property/components/internal/screens/registry.jsx); [sidebar_nav.jsx:70-75](C:/Pro/geiger-property/components/internal/sidebar/sidebar_nav.jsx)

**Geiger suite integration**
- **Shared shell, not shared data:**
  - every product table foreign-keys `public.projects` — for example [chat_workspace.sql:46](C:/Pro/geiger-property/supabase/migrations/20261019205301_chat_workspace.sql); [ledger_core.sql:24-25](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql); [project_scope.js:1-3](C:/Pro/geiger-property/lib/supabase/project_scope.js)
  - the notifications dropdown reads suite-shared `public.flow_notifications` — [notifications_dropdown.jsx:31-36](C:/Pro/geiger-property/components/internal/topbar/dialogue/notifications_dropdown.jsx)
  - all UI comes from `@geiger/ui` (~400 import lines) — [package.json:19](C:/Pro/geiger-property/package.json)
  - email and changelog go through geiger-dash — [lib/email/client.js:1-16](C:/Pro/geiger-property/lib/email/client.js)
  - migrations run on `@geiger/orm` — [package.json:17](C:/Pro/geiger-property/package.json)
- **Unused declared dependency.** `@geiger/rbac` is in `package.json` but nothing in the repo imports it; RBAC is the local `lib/rbac.js`. — [package.json:18](C:/Pro/geiger-property/package.json)
- **No data exchange with Flow issues, Notes docs or Docs.** Communications is a port of Flow's Grounding chat, but it lives in separate `property.chat_*` tables and the `property-chat` bucket. — [memory communications_chat.md](C:/Users/space/.claude/projects/C--Pro-geiger-property/memory/communications_chat.md); grep for `.schema("flow"|"notes")` finds no hits.
- **Row-level security is demo-open.** RLS is enabled with `for all to anon, authenticated using (true)` policies across the migrations (for example the ledger tables). The anon-key PostgREST endpoint can therefore technically read and write the `property` schema. That is a security gap, not a supported integration API. — [ledger_core.sql:259](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql); [20261010165221_full_build_tables.sql](C:/Pro/geiger-property/supabase/migrations/20261010165221_full_build_tables.sql) (23 such policies)

### Inferences
- **The headline is roughly right; one sub-point is wrong.** For outside developers and enterprise IT the product really is closed: no API, no delivered webhooks, no connectors, no import. "No low-code workflows", however, is false. The workflow builder is bounded (fixed trigger and step vocabulary, 7 record types), but it is real and executes server-side.
- **Two stale surfaces would mislead a reviewer.** The Integrations screen shows Stripe as "Not connected", and the README promises a report builder and screening. A third party reading the UI or README could under-rate payments and over-rate reporting and screening.

### Gaps
- Whether a deployed environment has Stripe keys, `CRON_SECRET` or an external scheduler configured cannot be told from the repo.
- `@geiger/ui` source was not inspected (no `node_modules` in this checkout), so any shared extensibility features in that package are unknown.

## Claim 3: "Geiger lacks AI document intelligence, specifically automated lease abstraction"

### Takeaway
**TRUE.** There is no AI or LLM code, no AI dependency, no OCR and no PDF text extraction. The "AI Assistant" nav item falls through to a "Coming soon" screen. Skipping AI was a recorded product decision for the October 2026 build, deferred to a future shared suite package. A lease PDF **can be uploaded and stored**, but nothing parses it. The only lease-document automation runs the other way: lease **generation** from templates and merge fields.

### Cited Findings
- **No AI code or dependencies.** A grep for `openai|anthropic|ai-sdk|@ai-sdk|llm|gpt|gemini|embedding|pgvector|ocr|tesseract|textract|pdf-parse|pdfjs|langchain|claude` across app, lib, components, migrations, utils, context and package.json returns **no matches**. The dependency list has no AI, OCR or PDF library. — [package.json:13-40](C:/Pro/geiger-property/package.json)
- **"AI Assistant" is a placeholder:**
  - the nav item exists — [sidebar_nav.jsx:208](C:/Pro/geiger-property/components/internal/sidebar/sidebar_nav.jsx)
  - it is deliberately not registered ("unlisted titles (AI Assistant) fall back to ComingSoonScreen") — [registry.jsx:85-87](C:/Pro/geiger-property/components/internal/screens/registry.jsx)
  - the fallback renders "The {title} screen is part of the Geiger Property roadmap…" — [coming_soon.jsx:14-22](C:/Pro/geiger-property/components/internal/screens/coming_soon.jsx); [app/project/[projectId]/[[...rest]]/page.js:50](C:/Pro/geiger-property/app/project/[projectId]/[[...rest]]/page.js)
- **Recorded no-AI decision:** "AI: skip all AI features — a future shared suite package (like @geiger/notify) will provide AI inference." — [memory full_build_decisions.md:13](C:/Users/space/.claude/projects/C--Pro-geiger-property/memory/full_build_decisions.md)
- **AI is planned, not built.** The planning doc lists "AI document parsing — receipts, invoices, leases → structured data" and an AI copilot as unchecked **P3** items ("The AI moat"). — [COMPETITIVE_FEATURE_ANALYSIS_2026.md:364-372](C:/Pro/geiger-property/docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md)
- **Document storage exists:**
  - polymorphic `property.documents` table — [lib/supabase/documents.js:5-7](C:/Pro/geiger-property/lib/supabase/documents.js)
  - the staff Documents section file input has no `accept` filter, so any file type including PDF is allowed — [documents_section.jsx:104](C:/Pro/geiger-property/components/internal/screens/entity/shared_sections/documents_section.jsx)
  - files go to the suite-shared **public** "products" bucket under `property/…` — [property_storage.js:8-13](C:/Pro/geiger-property/lib/supabase/property_storage.js)
  - portal uploads accept images or PDF only — [lib/portal/files.js:1-5, 17-18](C:/Pro/geiger-property/lib/portal/files.js)
- **Nothing reads document contents.** No code path extracts text or fields from an uploaded file (grep finds no PDF parsing; the only `application/pdf` hits are upload type checks). — [lib/portal/files.js:17](C:/Pro/geiger-property/lib/portal/files.js); [plan_file_section.jsx:49](C:/Pro/geiger-property/components/internal/screens/entity/shared_sections/plan_file_section.jsx)
- **Tenant and lease records are built by hand or from applications:**
  - applications have a "Convert to tenant + draft lease" action — [geiger_current_state.md (baseline)](C:/Pro/geiger-property/research_notes/Property%20management%20software%20features/geiger_current_state.md)
  - lease templates merge record data into text, the reverse of abstraction — [lease_templates.jsx:50-51, 123-131](C:/Pro/geiger-property/components/internal/screens/leasing/lease_templates.jsx)
- **E-sign does not send.** "Tracking only — no provider is connected"; signers and the audit trail are entered by hand. — [lib/supabase/esign.js:3-5](C:/Pro/geiger-property/lib/supabase/esign.js)

### Inferences
- The claim is accurate as stated. "Lacks AI" also covers every other AI capability, not just abstraction: no copilot, leasing agent, invoice scan or categorisation.
- The product is not hostile to AI. The lease data model is rich enough to be an abstraction target:
  - term dates, rent and escalation schedule
  - commercial terms (expense structure, square feet, CAM, TI allowance)
  - parties
  - clauses as a metadata list
  - renewal options

  — [leasing/config.jsx:133-141](C:/Pro/geiger-property/components/internal/screens/leasing/config.jsx); [lease_money.jsx:69-100](C:/Pro/geiger-property/components/internal/screens/leasing/sections/lease_money.jsx)

### Gaps
- The future "shared suite package" for AI inference is referenced only in memory; no package, repo or interface exists in this codebase to evaluate.

## Claim 4: Summary-table rating "system flexibility = out-of-the-box, fixed configuration"

### Takeaway
**PARTLY TRUE, and misleading as worded.** The **data model and screen set are fixed**: no custom objects, screens, API or SDK. Within that frame, though, it is **substantially configurable**:
- custom fields (11 types × 10 entities)
- a three-level policy cascade
- a no-code workflow builder with a canvas
- lease templates and merge fields
- a role/permission matrix
- portal branding
- notification settings
- scheduled reports

A fairer label would be "configurable SaaS with a fixed schema and no external extensibility".

### Cited Findings
- **Fixed parts:**
  - static screen registry and nav — [registry.jsx:88-180](C:/Pro/geiger-property/components/internal/screens/registry.jsx); [sidebar_nav.jsx:75-225](C:/Pro/geiger-property/components/internal/sidebar/sidebar_nav.jsx)
  - fixed report catalog — [lib/reports/catalog.js:5-10](C:/Pro/geiger-property/lib/reports/catalog.js)
  - fixed automation vocabulary — [lib/automations/catalog.js:29-105, 225-231](C:/Pro/geiger-property/lib/automations/catalog.js)
  - fixed ledger source types — [ledger_core.sql:73-76](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- **Configurable parts:**
  - custom fields — [settings/shared.js:104-131](C:/Pro/geiger-property/components/internal/screens/settings/shared.js)
  - policy cascade — [lib/policies.js:1-4](C:/Pro/geiger-property/lib/policies.js)
  - workflow canvas — [workflow_canvas.jsx:27-29](C:/Pro/geiger-property/components/internal/screens/automations/canvas/workflow_canvas.jsx)
  - RBAC matrix, advisory only — [lib/rbac.js:1-16](C:/Pro/geiger-property/lib/rbac.js)
  - user-defined GL accounts on top of the system chart — [chart_of_accounts.jsx:37-38, 114](C:/Pro/geiger-property/components/internal/screens/accounting/chart_of_accounts.jsx)

### Inferences
- **User-defined GL accounts allow a workaround.** A user could add "Mortgage Payable" or "Accumulated Depreciation" accounts and post manual adjustments. That is bookkeeping-level flexibility, not modelling.

### Gaps
- None beyond those already listed above.

## Claim 5: Branding ("Geiger Studio") and actual product name/positioning

### Takeaway
**"Geiger Studio" is the umbrella suite brand and domain, not this product's name.** This product is **Geiger Property**: page titles read "Property - Geiger Studio" and the site lives at `geiger.studio/property`. Calling it "Geiger Studio" is therefore loose but traceable. Whether the claim's author meant the suite or Property specifically is **UNVERIFIABLE**.

Positioning is **residential-first, for independent landlords and small-to-mid portfolios**. It explicitly markets single-family, multifamily, and "commercial and mixed-use" (CAM, tenant insurance, NNN), and has real but modest commercial features.

### Cited Findings
- **Suite brand:**
  - `title: "Property - Geiger Studio"`, `description: "Geiger Studio - Property"` — [app/layout.js:55-56](C:/Pro/geiger-property/app/layout.js)
  - canonical `https://geiger.studio/property` — [app/page.js:7](C:/Pro/geiger-property/app/page.js)
  - landing FAQ: "Does it work with the rest of Geiger Studio? … sits naturally alongside Flow, Notes and Events" — [landing_page.jsx:30-31](C:/Pro/geiger-property/components/landing/landing_page.jsx)
  - playground title "Property Playground - Geiger Studio" — [app/playground/page.js:5](C:/Pro/geiger-property/app/playground/page.js)
  - help email `help@geiger.studio` — [landing_page.jsx:183](C:/Pro/geiger-property/components/landing/landing_page.jsx)
  - a legacy local footer says "Geiger Studios" / "GEIGER STUDIO"; it is unused, since the landing page imports `@geiger/ui/footer` — [components/ui/footer.jsx:13, 53, 61](C:/Pro/geiger-property/components/ui/footer.jsx); [landing_page.jsx:3, 197](C:/Pro/geiger-property/components/landing/landing_page.jsx)
- **Product name:** "Geiger Property … the property-management application of the Geiger suite". — [README.md:3, 17](C:/Pro/geiger-property/README.md)
- **Residential-first:** "covers the full residential management lifecycle"; "for property managers and small-to-mid portfolios". — [README.md:17-19](C:/Pro/geiger-property/README.md)
- **Target buyer:** "Independent landlords, growing property managers and small-to-mid portfolios who want the depth of an enterprise suite without the enterprise price tag". — [landing_page.jsx:18-19](C:/Pro/geiger-property/components/landing/landing_page.jsx)
- **Operations-first hero:** "Collect the rent & run the buildings from one workspace." — [landing_page.jsx:114](C:/Pro/geiger-property/components/landing/landing_page.jsx)
- **Commercial features (real):**
  - landing "Commercial and mixed-use: Bill CAM charges, track tenant insurance and reconcile shared costs" — [landing_page.jsx:94-98](C:/Pro/geiger-property/components/landing/landing_page.jsx)
  - lease type "commercial" adds permitted use, expense structure (Gross … net variants), square feet leased, CAM per month, TI allowance and personal guarantee as metadata fields — [leasing/config.jsx:133-141](C:/Pro/geiger-property/components/internal/screens/leasing/config.jsx)
  - CAM Reconciliation screen: ledger pool costs, pro-rata share and true-up — [cam_reconciliation.jsx:29, 125, 383](C:/Pro/geiger-property/components/internal/screens/accounting/cam_reconciliation.jsx); `cam_reconciliations` table in [ledger_core.sql](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
  - the planning doc had listed CAM as P4 "add if commercial demand appears", but it was built anyway — [COMPETITIVE_FEATURE_ANALYSIS_2026.md:381](C:/Pro/geiger-property/docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md)
- **Marketing copy overstates two things:**
  - the landing pricing FAQ says screening is included — [landing_page.jsx:22-23](C:/Pro/geiger-property/components/landing/landing_page.jsx)
  - the README lists credit and background checks — [README.md:28](C:/Pro/geiger-property/README.md)
  - in the code, screening is tracking-only — [integrations.jsx:32](C:/Pro/geiger-property/components/internal/screens/settings/integrations.jsx); [memory full_build_decisions.md:17](C:/Users/space/.claude/projects/C--Pro-geiger-property/memory/full_build_decisions.md)

### Inferences
- **The MRI-style framing fits the target market.** Comparing an SMB/mid-market residential-first PM app against an institutional investment platform is consistent with the planning doc's explicit choice to skip "enterprise RARE" features. The gaps in Claims 1-3 are largely **deliberate scope**, not oversights. The exception is AI, which is planned (P3) but deferred.

### Gaps
- The third-party text that introduced "Geiger Studio" was not available to check whether it meant the suite.

## Is closing each gap additive on the current architecture, or does it need structural redesign?

### Takeaway
Most gaps are **additive**. They can be built from existing primitives:
- standard tables with the `metadata` jsonb bag
- `record_items` repeaters
- the `merge_meta` RPC
- the double-entry `ledger_post` with dimensions
- the job registry and cron route
- the `automation_events` queue
- the entity factory/engine and wizard actions

Three gaps need structural work:
- **(a) Investor/fund waterfalls.** A new entity layer between owners and properties, plus a calculation engine.
- **(b) Public API or BI access.** Real project-scoped RLS and API-key auth must come first, because RLS is currently demo-open.
- **(c) Custom objects/screens.** The static registry/nav/permission-key design must become metadata-driven.

### Cited Findings
- **Available primitives:**
  - `merge_meta` shallow-merge RPC over any `property.*` table — [engine_foundations.sql:18-44](C:/Pro/geiger-property/supabase/migrations/20261015210600_engine_foundations.sql)
  - generic `record_items` (owner_type/owner_id/kind, dates, amount, metadata) — [engine_foundations.sql:46-66](C:/Pro/geiger-property/supabase/migrations/20261015210600_engine_foundations.sql)
  - ledger with job/owner/property dimensions and an idempotency key — [ledger_core.sql:60-133](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
  - job registry keyed for `/api/cron/<key>` — [lib/jobs/registry.js:1-9](C:/Pro/geiger-property/lib/jobs/registry.js)
  - record-event queue plus `emit_record_event` RPC — [messaging_scheduler_automations.sql:214-229](C:/Pro/geiger-property/supabase/migrations/20261015212609_messaging_scheduler_automations.sql)
  - policy cascade — [lib/policies.js:1-4](C:/Pro/geiger-property/lib/policies.js)
  - architecture memo: "extend these primitives rather than adding parallel save models" — [memory engine_p0_architecture.md](C:/Users/space/.claude/projects/C--Pro-geiger-property/memory/engine_p0_architecture.md)
- **The ledger source-type CHECK constraint would need a new migration** to add new posting kinds (for example depreciation, loan_payment). That is a constraint change, not a redesign. — [ledger_core.sql:73-76](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- **The asset register already stores the lifecycle inputs** (installed date, replacement cost, expected life). — [record_kinds.js:125-130](C:/Pro/geiger-property/components/internal/screens/properties/record_kinds.js)
- **`budget_lines` is keyed by year and month.** — [ledger_core.sql:153-169](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- **Ownership is a flat owner ↔ property % link** with no fund or entity layer, and ledger lines have no fund/entity dimension. — [engine_foundations.sql:90-107](C:/Pro/geiger-property/supabase/migrations/20261015210600_engine_foundations.sql); [ledger_core.sql:108-133](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- **Webhook endpoints are already stored** in settings, and event sources already exist (DB triggers on 5 tables). — [settings/shared.js:91-100](C:/Pro/geiger-property/components/internal/screens/settings/shared.js); [messaging_scheduler_automations.sql:295-300](C:/Pro/geiger-property/supabase/migrations/20261015212609_messaging_scheduler_automations.sql)
- **The upload path and lease fields exist for abstraction:**
  - documents table and storage — [lib/supabase/documents.js](C:/Pro/geiger-property/lib/supabase/documents.js); [property_storage.js:8-13](C:/Pro/geiger-property/lib/supabase/property_storage.js)
  - wizard-step actions framework — [memory engine_p0_architecture.md](C:/Users/space/.claude/projects/C--Pro-geiger-property/memory/engine_p0_architecture.md) (components/internal/shared/wizard_dialog.jsx)

### Inferences

| Gap | Rating | What closing it involves |
|---|---|---|
| Valuation history | Additive, small | `record_items` kind "valuation" (or a `property.valuations` table), plus cap-rate/LTV derived from ledger NOI. The inputs already exist in metadata. |
| Depreciation | Additive, small-to-moderate | New system GL accounts (Accumulated Depreciation, Depreciation Expense), a new ledger source type (constraint migration), and a monthly `depreciation` job in the registry. The useful life comes from the asset register or capitalized `cost_jobs`. |
| 10-20-year CapEx plan | Additive, moderate | Reuse `budget_lines` (year/month per GL) or a new capital-plan table. Project replacements from asset install date + expected life + replacement cost. New screen on the entity engine. |
| IRR / fund return modelling | Additive but new domain logic | Needs a projection model (rent escalations exist per lease, budgets exist) and a cash-flow series. Ledger history covers actuals. |
| Debt (mortgages) | Additive, moderate | A `property.loans` table (standard columns), an amortisation schedule (`record_items` or child table), Notes Payable and Interest Expense system accounts, a `loan_payment` posting type, and a scheduled job. Cash-flow "financing" would then include debt. |
| Investor equity and waterfalls | Structural-ish | Needs a fund/entity layer (fund → investors with commitments/classes → properties), a fund/entity dimension on `ledger_lines` (an additive column, but every posting builder must set it), capital calls, and a waterfall engine (pref/catch-up/promote tiers). Owner contributions and distributions are a starting point, but this is a new module, not a field addition. |
| Outbound webhooks | Additive, small | A delivery job (in the registry) that fans `automation_events` out to the stored endpoints, with signing and retries, plus a delivery log table. |
| Public REST API / OAuth / API keys | Structural prerequisite | First replace the demo-open RLS with project-scoped policies (new migrations) and add API-key/OAuth auth. Then versioned `app/api/v1/*` routes over the existing data layers. Exposing anything before the RLS fix is a security risk. |
| BI warehouse / enterprise connectors (QuickBooks, Salesforce, Yardi) | Additive per connector, after the RLS fix | Data is already clean, typed Postgres scoped by `project_id`. BI could read reporting views directly. Each connector is a server route plus a sync job. CSV import would be a new wizard on the entity engine. |
| Custom objects / custom screens | Structural | The entity engine is already config-driven (a good base), but the registry, nav and `view.*` permission keys are static code keyed by sidebar titles. User-defined objects need a dynamic schema store (settings or a definitions table), a generic records table (like `record_items`), and a dynamic nav/registry. Custom fields would also need to reach lists, filters and reports. |
| AI lease abstraction | Additive | Upload path, documents table, lease/lease_parties/rent-schedule targets and a wizard/review UI pattern already exist. Missing: a text-extraction/OCR step, an LLM provider (planned as a shared suite package), and a "review extracted fields → create tenant + lease" wizard. Prerequisite worth flagging: documents currently sit in a public bucket, so lease PDFs containing PII would need a private bucket and signed URLs. |

### Gaps
- Effort sizes above are architectural judgments from reading the code, not estimates validated against a backlog or with the developers.
