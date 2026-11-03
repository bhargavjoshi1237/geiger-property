# Geiger Property: capability and positioning profile (code audit, 2026-11-03)

Scope: a read-only audit of `C:/Pro/geiger-property` at HEAD `4fdcbd7`, to place Geiger Property against MRI Software's product lines. Every source is a local file, cited as path:line. No web sources were used. Method: I started from the 2026-11-02 fact-check (`reports/Geiger vs MRI PMX fact check.md` and its two Geiger research notes), then re-verified the claims that matter here directly in code. I also added positioning, module-inventory, affordable-housing and suite findings the fact-check did not cover. Line references carried forward from the 2026-11-02 notes remain valid: no application code has changed since then (see Q5).

Maturity scale used throughout:
- **Wired**: schema, data layer, UI and server or job logic all connect end to end.
- **Partial**: wired, but with material functional gaps or defects.
- **Tracking-only**: records are kept by hand, and no provider or automation is behind them.
- **Capture-only**: fields are saved, but no code reads them.
- **Placeholder**: a nav item exists, with no screen behind it.
- **Absent**: nothing in the schema, code or UI.

Global caveat: no module is production-ready in the security sense. Row-level security on every `property.*` table is demo-open, and documents sit in a public bucket (Q4, Q5). The product also has no customers yet: a project memory note records "app is in dev, no clients" ([memory/communications_chat.md](C:/Users/space/.claude/projects/C--Pro-geiger-property/memory/communications_chat.md)). "Wired" therefore means functionally complete, not hardened or proven in the field.

## Q1. Positioning: who is Geiger Property built for, and how does it market itself?

### Takeaway
Geiger Property is a **US, residential-first, SMB-to-mid-market property-management app for third-party managers and independent landlords**. Its pitch is "enterprise depth without the enterprise price". It markets single-family, multifamily and a light "commercial and mixed-use" format, and nothing for affordable housing, investment management or occupiers. There is **no published price**: the landing page says "a simple per-unit monthly price". The internal plan targets Free / $1.00 / $0.75 per unit per month, but that plan assumes banking and AI features that do not exist. There are **no SEO pages** beyond the single landing route. The product is **pre-launch**, with no customers.

### Cited Findings
**Target customer**
- Landing FAQ, "Who is Geiger Property for?": "Independent landlords, growing property managers and small-to-mid portfolios who want the depth of an enterprise suite without the enterprise price tag." — [components/landing/landing_page.jsx:18-19](C:/Pro/geiger-property/components/landing/landing_page.jsx)
- README: it "covers the full residential management lifecycle… built for property managers and small-to-mid portfolios who need the depth of an enterprise PM system without its cost or setup burden." — [README.md:17-19](C:/Pro/geiger-property/README.md)
- README tagline: "Property management, end to end. Properties, tenants, leasing, maintenance, and accounting — one system from listing to renewal." — [README.md:5-7](C:/Pro/geiger-property/README.md)

**Hero and SEO copy**
- Hero H1: "Collect the rent & run the buildings from one workspace." Subhead: "covers listings, leasing, the tenant portal, maintenance and accounting. Units, residents and ledgers stay in one project your team shares." — [landing_page.jsx:114-115](C:/Pro/geiger-property/components/landing/landing_page.jsx)
- Page metadata: title "Geiger Property: leasing, rent collection and maintenance"; description "List vacancies, sign leases, collect rent and run maintenance for your whole portfolio…"; canonical `https://geiger.studio/property` — [app/page.js:3-8](C:/Pro/geiger-property/app/page.js)
- The root layout title is still the generic "Property - Geiger Studio" — [app/layout.js:55-56](C:/Pro/geiger-property/app/layout.js)
- **No SEO pages exist.** The only public marketing route is `app/page.js`. There is no `sitemap.js`, `robots.js`, per-segment landing page, comparison page or blog under `app/`, and `public/` holds only favicons and SVGs — route list from `find app -name page.js`; [public/](C:/Pro/geiger-property/public)

**Segments marketed** (three "formats")
- "Single-family and small landlords" — [landing_page.jsx:83-84](C:/Pro/geiger-property/components/landing/landing_page.jsx)
- "Multifamily buildings… hundreds of units, floor plans, waitlists and unit turns" — [landing_page.jsx:89-90](C:/Pro/geiger-property/components/landing/landing_page.jsx)
- "Commercial and mixed-use: Bill CAM charges, track tenant insurance and reconcile shared costs at year end", illustrated with Retail/Office suites marked "NNN" — [landing_page.jsx:95-98](C:/Pro/geiger-property/components/landing/landing_page.jsx)
- Section copy: "A few houses need a rent roll and a repair log. Turn on floor plans, waitlists and CAM billing when your buildings call for them." — [landing_page.jsx:149-150](C:/Pro/geiger-property/components/landing/landing_page.jsx)
- Affordable housing, investment/fund management, occupier lease administration and facilities management are not mentioned anywhere on the landing page — [landing_page.jsx](C:/Pro/geiger-property/components/landing/landing_page.jsx) (full file read)

**Pricing**
- Public: "A simple per-unit monthly price, with online payments, screening, portals and maintenance included rather than locked behind higher tiers." No figure is published — [landing_page.jsx:22-23](C:/Pro/geiger-property/components/landing/landing_page.jsx)
- Internal plan, dated 2026-07-06 — [docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md:5, 405-411](C:/Pro/geiger-property/docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md):

  | Tier | Price | Who it's for |
  |---|---|---|
  | Starter | Free, ≤10 units, "AI copilot included" | DIY landlords |
  | Growth | $1.00/unit/mo, $25 minimum; adds embedded banking, AI leasing agent, workflow builder | Independent PMs, 10-500 units |
  | Scale | $0.75/unit/mo, $150 minimum; adds white-label, webhooks/API, multi-entity | PM companies, 500+ units |

- Planned positioning: "Tier 2.5", between Buildium ($55+) and Rentvine ($4-5/unit) — [COMPETITIVE_FEATURE_ANALYSIS_2026.md:392-403](C:/Pro/geiger-property/docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md)
- Planned wedge: "Modern all-inclusive PM (Rentvine-style) + native landlord banking (Baselane-style) + AI-as-core (not upsold), at a price that undercuts the $1.50–$5/unit incumbents" — [COMPETITIVE_FEATURE_ANALYSIS_2026.md:294](C:/Pro/geiger-property/docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md)
- One-line pitch: "Everything AppFolio charges extra for — banking, AI, automation — included. Everything Yardi does for enterprise — skipped." — [COMPETITIVE_FEATURE_ANALYSIS_2026.md:419-421](C:/Pro/geiger-property/docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md)
- Explicitly out of scope (P4): ESG, "End-to-end real-estate ERP (investment mgmt + fund accounting)", managed contact centre, rent-recommendation engine, "Multi-currency / global entity consolidation", and "CAM / commercial recoverables (we'll add if commercial demand appears)". A basic CAM true-up was later built anyway — [COMPETITIVE_FEATURE_ANALYSIS_2026.md:374-385](C:/Pro/geiger-property/docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md)

**The banking and AI pillars of the wedge do not exist**
- The P2 banking items (embedded banking, virtual accounts, debit card, instant payouts) and every P3 AI item are unchecked — [COMPETITIVE_FEATURE_ANALYSIS_2026.md:352-372](C:/Pro/geiger-property/docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md)
- A grep for banking code (virtual account, debit card, treasury, Stripe Connect, `transfers.create`) in `lib/` and `app/` finds nothing — grep over [lib/](C:/Pro/geiger-property/lib), [app/](C:/Pro/geiger-property/app)
- No AI dependency appears in [package.json:16-41](C:/Pro/geiger-property/package.json), and "AI Assistant" falls through to a Coming Soon screen — [components/internal/screens/registry.jsx:85-87](C:/Pro/geiger-property/components/internal/screens/registry.jsx)

**Marketing copy that overstates the code**
- "Prospects apply and pay the application fee on the same page. Screening starts on submit." — [components/landing/product_explorer.jsx:17](C:/Pro/geiger-property/components/landing/product_explorer.jsx). In code, the app has no public listing or application route; the only routes are `org`, `pallet`, `playground`, `portal` and `project`. Applications are handled by staff, with "internal screening (provider not connected)" — [components/internal/screens/marketing/applications.jsx:78-81](C:/Pro/geiger-property/components/internal/screens/marketing/applications.jsx)
- "Credit, background and income checks run on each applicant" — [product_explorer.jsx:36](C:/Pro/geiger-property/components/landing/product_explorer.jsx). The pricing FAQ also says screening is included — [landing_page.jsx:23](C:/Pro/geiger-property/components/landing/landing_page.jsx). In code, screening is tracking-only, per the same applications.jsx header and the recorded decision "Screening / listing syndication: internal tracking only" — [memory/full_build_decisions.md](C:/Users/space/.claude/projects/C--Pro-geiger-property/memory/full_build_decisions.md)
- "E-signature: Send the lease for signature and see who has viewed and signed it" — [product_explorer.jsx:40](C:/Pro/geiger-property/components/landing/product_explorer.jsx). In code: "Tracking only: no e-signature provider is connected, so statuses, signers, and the audit trail are updated by hand" — [components/internal/screens/leasing/esignature.jsx:35-37](C:/Pro/geiger-property/components/internal/screens/leasing/esignature.jsx)
- Workflows "post fees or message residents… Fees, emails and texts"; announcements "by email and text" — [product_explorer.jsx:24, 55](C:/Pro/geiger-property/components/landing/product_explorer.jsx). In code:
  - the workflow builder has no fee step; its five step types are send message, notify, create work order, update status and wait — [lib/automations/catalog.js:225-231](C:/Pro/geiger-property/lib/automations/catalog.js)
  - late fees come from a separate scheduled job — [lib/jobs/financial.js:15-20](C:/Pro/geiger-property/lib/jobs/financial.js)
  - SMS is a stub: "No SMS provider is chosen yet" — [lib/messaging/deliver.js:1-24](C:/Pro/geiger-property/lib/messaging/deliver.js)
- The README also advertises "syndication and ILS distribution", "credit and background checks" and "a custom report builder" — [README.md:28-29, 34](C:/Pro/geiger-property/README.md). In code, listings carry "internal per-channel syndication tracking" — [components/internal/screens/marketing/listings.jsx:76-78](C:/Pro/geiger-property/components/internal/screens/marketing/listings.jsx) — and reports are a fixed code catalog — [lib/reports/catalog.js:5-10](C:/Pro/geiger-property/lib/reports/catalog.js)

**Market status**
- Pre-launch: "Vercel crons were removed from vercel.json (app is in dev, no clients)" — [memory/communications_chat.md](C:/Users/space/.claude/projects/C--Pro-geiger-property/memory/communications_chat.md)
- The 2026-11-02 report found no public web presence for "Geiger Property" or "Geiger Studio" beyond this repo's own canonical URL — [reports/Geiger vs MRI PMX fact check.md:79](C:/Pro/geiger-property/reports/Geiger%20vs%20MRI%20PMX%20fact%20check.md)
- Try-before-signup: a full-workspace "playground" runs on an in-memory fake Supabase client seeded with a sample portfolio, and its "writes live in the tab only" — [lib/sandbox/sandbox_client.js:1-6](C:/Pro/geiger-property/lib/sandbox/sandbox_client.js); [landing_page.jsx:13-15, 171-178](C:/Pro/geiger-property/components/landing/landing_page.jsx)

### Inferences
- **Segment:** Geiger's intended buyer matches the Buildium / AppFolio / DoorLoop / Rentvine segment: US third-party residential managers with roughly 10-2,000 units, plus self-managing landlords. It is not an institutional, enterprise or global buyer. Against MRI, that puts it closest to MRI's residential property-management offerings for mid-market and third-party managers, and to MRI's SMB landlord tools. It is far from MRI's commercial, investment, occupier and affordable lines (Q7).
- **"Mixed" claim:** "Commercial and mixed-use" is a marketed format, but its support is thin (Q3). It is best read as "can also run a few small commercial suites alongside residential", not as commercial positioning.
- **Price claim:** the planned price undercut depends on banking interchange and AI that are unbuilt. The positioning cannot claim "AI included" or "banking included" today.

### Gaps
- No actual price list, billing code or plan enforcement exists in the repo; `billing.manage` is only a permission label — [lib/rbac.js:8](C:/Pro/geiger-property/lib/rbac.js). Whether pricing is decided cannot be determined.
- Whether `geiger.studio/property` is live and indexed was not checked, since this audit used no web sources.

## Q2. Module inventory: what exists, and how complete is each module?

### Takeaway
The staff workspace has **14 nav groups and about 75 registered screens** over **90 tables** (88 in the `property` schema). Operations and trust accounting are broad and mostly wired:
- properties and units
- leasing
- maintenance
- the double-entry GL, rent collection, Stripe payments, bills, budgets, bank reconciliation and RUBS
- resident, owner and vendor portals
- a workflow builder

The weak spots are third-party integrations (only Stripe and suite email are live), communications channels (SMS and inbound email are stubs), reporting flexibility (a fixed catalog) and several capture-only settings. AI, a public API, banking and investment features are absent.

### Cited Findings
**Navigation and scale**
- Nav groups: Overview; Property (8 screens); Marketing & Leads (6); Leasing (6); People (3); Maintenance (4); Accounting (13); Communications; Documents (3); Legal Resources; Reports (16); Automations (3); AI Assistant; Settings (9) — [components/internal/sidebar/sidebar_nav.jsx:75-225](C:/Pro/geiger-property/components/internal/sidebar/sidebar_nav.jsx)
- Every title except "AI Assistant" maps to a real screen component — [registry.jsx:88-176](C:/Pro/geiger-property/components/internal/screens/registry.jsx)
- Schema: 31 migrations create 90 tables (88 `property.*` plus `public.flow_notifications` and `public.flow_teams`) — `create table if not exists` across [supabase/migrations/](C:/Pro/geiger-property/supabase/migrations)
- Largest screen areas by lines of code: leasing ~8.0k, accounting ~6.5k, marketing ~5.7k, maintenance ~5.4k, communications ~5.1k, shared entity engine ~4.3k — `wc -l` over [components/internal/screens/](C:/Pro/geiger-property/components/internal/screens)

**Maturity matrix**

| Module | Maturity | What exists / what is missing | Evidence |
|---|---|---|---|
| Properties, units, buildings, floor plans, unit types, amenities, media | Wired | CRUD entity screens. Property types: Single-family, Multi-family, Apartment, Condo, Townhome, HOA, Commercial, Mixed-use, Student, Senior, Manufactured. HOA is only an "Association" details tab, not association accounting. | [registry.jsx:91-98](C:/Pro/geiger-property/components/internal/screens/registry.jsx); [properties/constants.js:19-43](C:/Pro/geiger-property/components/internal/screens/properties/constants.js); [properties/config.jsx:262](C:/Pro/geiger-property/components/internal/screens/properties/config.jsx) |
| Portfolios | Partial | A display grouping only: no ledger dimension and no report rollup. "Consolidated statement" and `targetNoi` are capture-only. | [portfolios/sections.jsx:295-331](C:/Pro/geiger-property/components/internal/screens/portfolios/sections.jsx); [ledger_core.sql:97-104](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql) |
| Amenity reservations, resident events | Wired (schema + screens) | Dedicated migration | [20261015212301_amenity_reservations_and_resident_events.sql](C:/Pro/geiger-property/supabase/migrations/20261015212301_amenity_reservations_and_resident_events.sql) |
| Listings | Partial / tracking-only | Internal listing records. Syndication is tracked, not sent ("nothing is sent to Zillow, Apartments.com…"). No public listing page. | [listings.jsx:76-78](C:/Pro/geiger-property/components/internal/screens/marketing/listings.jsx); [listing_sections.jsx:177](C:/Pro/geiger-property/components/internal/screens/marketing/sections/listing_sections.jsx) |
| Prospects, showings, waitlist | Wired (staff side) | CRM-style pipeline screens | [registry.jsx:100-104](C:/Pro/geiger-property/components/internal/screens/registry.jsx) |
| Applications and screening | Partial | Household, income-to-rent against policy, fee ledger, decision wizard with adverse action, and conversion to tenant + lease + parties. Screening is internal tracking (no provider). No online applicant-facing form. | [applications.jsx:78-81](C:/Pro/geiger-property/components/internal/screens/marketing/applications.jsx) |
| Rent comparables | Wired (manual data) | Staff enter market comps, net of concessions, and compare like for like. No market-data feed. | [rent_comps.jsx:48-50](C:/Pro/geiger-property/components/internal/screens/marketing/rent_comps.jsx) |
| Leases, templates, renewals, move-ins/outs, inspections, deposits, notices and violations | Wired | Lease builder with merge-field templates and a clause library, lifecycle columns, prorated move-in posting to the ledger, and deposits posting to the ledger | [lease_templates.jsx:50-51](C:/Pro/geiger-property/components/internal/screens/leasing/lease_templates.jsx); [20261015212441_leasing_lifecycle_columns.sql:13-18](C:/Pro/geiger-property/supabase/migrations/20261015212441_leasing_lifecycle_columns.sql); [lease_money.jsx:409-451](C:/Pro/geiger-property/components/internal/screens/leasing/sections/lease_money.jsx) |
| Rent escalations | Partial (defect) | Dated fixed or percent steps with a manual "Apply due" that updates `leases.rent`. They never reach billing (Q5). | [lease_money.jsx:95-120](C:/Pro/geiger-property/components/internal/screens/leasing/sections/lease_money.jsx) |
| E-signature | Tracking-only | Statuses and signers entered by hand | [esignature.jsx:35-37](C:/Pro/geiger-property/components/internal/screens/leasing/esignature.jsx) |
| Tenants (households, occupants, documents, renters insurance), owners (ownership %, mgmt fee %), vendors (1099, COI and licence compliance) | Wired | Expiry and compliance helpers are shared by tenant insurance and vendor COIs | [lib/compliance.js:1-5](C:/Pro/geiger-property/lib/compliance.js); [engine_foundations.sql:91-108](C:/Pro/geiger-property/supabase/migrations/20261015210600_engine_foundations.sql) |
| Work orders (requests, work orders and field visits merged) | Wired | Vendor assignment, priority/vendor/property views, status history, owner-approval threshold from the policy cascade, costs billable to owners | [maintenance/work_orders.jsx](C:/Pro/geiger-property/components/internal/screens/maintenance/work_orders.jsx) (header); [maintenance/config.jsx](C:/Pro/geiger-property/components/internal/screens/maintenance/config.jsx) (header); [lib/policies.js:125](C:/Pro/geiger-property/lib/policies.js) |
| Preventive maintenance | Wired | `pm_schedules` plus an idempotent job that generates due work orders | [maintenance/preventive.jsx](C:/Pro/geiger-property/components/internal/screens/maintenance/preventive.jsx) (header); [lib/jobs/preventive_work_orders.js](C:/Pro/geiger-property/lib/jobs/preventive_work_orders.js) (header) |
| Unit turns, inventory and parts | Wired | Make-ready kanban with linked work-order cost roll-up; stock with reorder levels and movements | [maintenance/unit_turns.jsx](C:/Pro/geiger-property/components/internal/screens/maintenance/unit_turns.jsx) (header); [maintenance/inventory.jsx](C:/Pro/geiger-property/components/internal/screens/maintenance/inventory.jsx) (header) |
| General ledger and chart of accounts (29-account system chart, 8 line dimensions, balanced idempotent posting, reversal voids) | Wired | Trust-accounting model with one set of books per project. Accrual-only, no period close or lock date, USD-only. | [ledger_core.sql:87-126, 264-393, 453-528](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql); [lib/ledger/postings.js](C:/Pro/geiger-property/lib/ledger/postings.js) |
| Rent collection, transactions | Wired | Each rent account is the lease's A/R; idempotent monthly rent posting | [rent_collection.jsx:54-57, 88-100](C:/Pro/geiger-property/components/internal/screens/accounting/rent_collection.jsx) |
| Online payments | Wired | Stripe card and ACH (`us_bank_account`), autopay, refunds, payment links, and a webhook for disputes and payouts. The tenant pays a convenience fee by method. | [lib/payments/checkout.js:21-40, 179-190](C:/Pro/geiger-property/lib/payments/checkout.js); [app/api/stripe/webhook/route.js](C:/Pro/geiger-property/app/api/stripe/webhook/route.js) |
| Recurring charges | Partial (defect) | Semi-annual and weekly charges bill as monthly (Q5) | [lib/jobs/financial.js:24, 144](C:/Pro/geiger-property/lib/jobs/financial.js) |
| Bills and payables | Wired, single-tier | One project-wide approval limit and one approver; vendor-portal invoices arrive as approval-pending bills | [accounting/bills.jsx:73-88, 621-720](C:/Pro/geiger-property/components/internal/screens/accounting/bills.jsx); [lib/portal/vendor.js:7, 214](C:/Pro/geiger-property/lib/portal/vendor.js) |
| Budgets, job costing | Wired | Monthly budget lines per GL account with budget vs actual; capital-project jobs costed from tagged ledger lines | [ledger_core.sql:150-190](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql); [budgets.jsx](C:/Pro/geiger-property/components/internal/screens/accounting/budgets.jsx); [job_costing.jsx](C:/Pro/geiger-property/components/internal/screens/accounting/job_costing.jsx) |
| Bank accounts, bank reconciliation | Wired | Manual matching; no bank feed (no Plaid) | [bank_reconciliation.jsx](C:/Pro/geiger-property/components/internal/screens/accounting/bank_reconciliation.jsx); prior grep in [geiger_investment_platform_ai.md:99](C:/Pro/geiger-property/research_notes/Geiger%20vs%20MRI%20PMX%20fact%20check/geiger_investment_platform_ai.md) |
| Utility billing (RUBS) | Wired | Split by square feet, occupants or equal shares | [utility_billing.jsx:43, 54-83](C:/Pro/geiger-property/components/internal/screens/accounting/utility_billing.jsx) |
| CAM reconciliation | Partial | Pro-rata true-up posted to lease ledgers. No caps, base year, gross-up or exclusions (Q3). | [cam_reconciliation.jsx:174-270](C:/Pro/geiger-property/components/internal/screens/accounting/cam_reconciliation.jsx) |
| Communications: team chat | Wired, staff-only | Port of Flow's Grounding chat, with channels, DMs, WebRTC calls, mentions and realtime | [20261019205301_chat_workspace.sql:1-9](C:/Pro/geiger-property/supabase/migrations/20261019205301_chat_workspace.sql); [memory/communications_chat.md](C:/Users/space/.claude/projects/C--Pro-geiger-property/memory/communications_chat.md) |
| Communications: resident messaging, announcements, notifications | Partial | Email goes out through geiger-dash and Resend. SMS is "not sent", inbound email is a stub, and the staff inbox UI was removed (portal threads remain). | [lib/messaging/deliver.js:1-24](C:/Pro/geiger-property/lib/messaging/deliver.js); [lib/email/client.js:1-16](C:/Pro/geiger-property/lib/email/client.js); [app/api/messages/inbound/route.js:7-14](C:/Pro/geiger-property/app/api/messages/inbound/route.js) |
| Documents (library, templates) | Wired, insecure | A polymorphic documents table; files are stored in a public bucket | [lib/supabase/documents.js:5-7](C:/Pro/geiger-property/lib/supabase/documents.js); [lib/supabase/property_storage.js:7-13](C:/Pro/geiger-property/lib/supabase/property_storage.js) |
| Legal Resources | Wired (reference content) | 1,222 official landlord-tenant links across 51 jurisdictions plus federal, with statute citation and rent-regulation status per state. About 260 links are "unverifiable". Not legal advice. | [20261019184635_legal_resources.sql:1-10](C:/Pro/geiger-property/supabase/migrations/20261019184635_legal_resources.sql); [supabase/seeds/legal_resources/](C:/Pro/geiger-property/supabase/seeds/legal_resources); [memory/legal_resources_feature.md](C:/Users/space/.claude/projects/C--Pro-geiger-property/memory/legal_resources_feature.md) |
| Reports (rent roll, delinquency, occupancy, owner statements, financial statements, trial balance, GL detail, check register, A/P aging, deposit detail, mgmt fees, insurance compliance, 1099, maintenance, leasing) | Wired, fixed catalog | CSV export, browser print-to-PDF, scheduled email delivery. No report builder and no portfolio rollup. | [sidebar_nav.jsx:176-197](C:/Pro/geiger-property/components/internal/sidebar/sidebar_nav.jsx); [lib/reports/catalog.js:5-10](C:/Pro/geiger-property/lib/reports/catalog.js); [lib/jobs/scheduled_reports.js:155](C:/Pro/geiger-property/lib/jobs/scheduled_reports.js) |
| Automations | Wired, but not scheduled | Workflow canvas (7 record types, 12 triggers, 5 step types), DB-trigger event queue, idempotent runner, and 8 scheduled jobs. `vercel.json` has no crons, so runs happen via "Run now" or an external `CRON_SECRET` caller. | [lib/automations/catalog.js:225-231](C:/Pro/geiger-property/lib/automations/catalog.js); [lib/automations/runner.js:18-22](C:/Pro/geiger-property/lib/automations/runner.js); [vercel.json](C:/Pro/geiger-property/vercel.json); [app/api/cron/[job]/route.js](C:/Pro/geiger-property/app/api/cron/[job]/route.js) |
| Resident, owner and vendor portals | Wired | See Q4 | [app/api/portal/](C:/Pro/geiger-property/app/api/portal); [lib/portal/](C:/Pro/geiger-property/lib/portal) |
| Settings: team, roles and permissions, custom fields, fees and policies cascade, payment processing, branding and portals, notifications | Mostly wired | RBAC is client-side gating only, with no RLS behind it. Custom fields render only in editors (11 types, 10 entities). | [lib/rbac.js:1-16](C:/Pro/geiger-property/lib/rbac.js); [settings/shared.js:104-131](C:/Pro/geiger-property/components/internal/screens/settings/shared.js); [lib/policies.js:1-4](C:/Pro/geiger-property/lib/policies.js) |
| Company currency, owner approval threshold, commercial lease terms, rent-control fields, affordable-program fields | Capture-only | Saved; no code reads them | [settings/shared.js:53-60](C:/Pro/geiger-property/components/internal/screens/settings/shared.js); [owners/shared.js:147](C:/Pro/geiger-property/components/internal/screens/owners/shared.js); [leasing/config.jsx:133-139](C:/Pro/geiger-property/components/internal/screens/leasing/config.jsx); [property_tabs.jsx:226-231](C:/Pro/geiger-property/components/internal/screens/properties/sections/property_tabs.jsx) |
| Integrations screen | Stale | Six cards all "Not connected" with disabled buttons, including Stripe, which is actually live. Webhooks are stored, but "nothing is sent". | [settings/integrations.jsx:26-36, 105-146](C:/Pro/geiger-property/components/internal/screens/settings/integrations.jsx) |
| AI Assistant | Placeholder | Coming Soon fallback | [registry.jsx:85-87](C:/Pro/geiger-property/components/internal/screens/registry.jsx); [sidebar_nav.jsx:208](C:/Pro/geiger-property/components/internal/sidebar/sidebar_nav.jsx) |
| Public API, outbound webhooks, CSV import, accounting sync (QuickBooks/Xero), bank feeds, screening, ILS syndication, SMS | Absent or stub | — | [app/api/](C:/Pro/geiger-property/app/api) (all 43 routes are first-party); [integrations.jsx:143](C:/Pro/geiger-property/components/internal/screens/settings/integrations.jsx) |
| Embedded banking, owner payouts (money movement) | Absent | Distributions are bookkeeping only | grep over [lib/](C:/Pro/geiger-property/lib) and [app/](C:/Pro/geiger-property/app); [geiger_investment_platform_ai.md:51](C:/Pro/geiger-property/research_notes/Geiger%20vs%20MRI%20PMX%20fact%20check/geiger_investment_platform_ai.md) |
| Investment, valuation, debt, fund accounting | Absent | Valuation fields are inert | [property_tabs.jsx:52-72](C:/Pro/geiger-property/components/internal/screens/properties/sections/property_tabs.jsx) |
| Playground | Demo-only | In-memory sandbox on the landing page | [lib/sandbox/sandbox_client.js:1-6](C:/Pro/geiger-property/lib/sandbox/sandbox_client.js) |

**Demo data**
- A seeded demo project ("Harbor & Pine Residential", about 8,150 rows across 76 tables) exists with all automations paused. It lives inside the suite project named "Geiger Notes" — [memory/demo_project_seed.md](C:/Users/space/.claude/projects/C--Pro-geiger-property/memory/demo_project_seed.md); [supabase/seeds/demo_project/](C:/Pro/geiger-property/supabase/seeds/demo_project)

### Inferences
- **Breadth:** for a residential manager, the feature surface is broad, comparable in breadth to Buildium or DoorLoop. It is deeper than typical SMB tools on accounting (dimensioned trust GL, bank reconciliation, budgets, job costing, CAM, RUBS).
- **Where it falls short of incumbents:** the gaps are the integrations a real customer needs on day one: screening vendor, e-sign, ILS syndication, SMS, bank feeds and accounting export. Security hardening and scheduled automation being switched off are also gaps.
- **Labelling:** the honest summary is "functionally broad, pre-production". Several marketing claims (screening, e-sign, SMS, online applications, syndication, report builder) describe tracking-only or absent features.

### Gaps
- The app was not run, so the rendering and correctness of screens was not observed.
- Whether the live database matches the migrations was not checked: the `geiger-orm` CLI is not installed, and memory records about 80 orphan tables in the live DB.
- Exact report count: the nav lists 15 report screens plus Scheduled Reports. Report definitions in `defs_financial.js` and `defs_operations.js` were not individually enumerated.

## Q3. Does Geiger support commercial, affordable-housing or investment-specific features?

### Takeaway
- **Commercial: thin.** It has a `commercial` lease type and Commercial and Mixed-use property types. Real `units.sqft` drives a basic pro-rata CAM true-up that posts to the ledger, and fixed or percent rent steps can be applied by hand. There is no percentage rent, no CPI, no recovery caps, base years or gross-up, and no retail sales reporting. Commercial lease terms (NNN structure, square feet leased, CAM per month, TI) are capture-only.
- **Affordable housing: effectively none.** There are a handful of metadata flags: affordable program (LIHTC / Section 8 PBV / HOME), % AMI limit, voucher and subsidy toggles, and a HAP amount that only drives a display-only "tenant portion". There is no HUD/TRACS, no LIHTC compliance, no income certification, no HAP billing split and no PHA tooling.
- **Investment: none.** There are no fund, investor, loan, valuation, depreciation, waterfall or forecasting features. Owner contributions and distributions are owner-trust bookkeeping.
- **Occupier lease accounting (ASC 842 / IFRS 16): none.**

### Cited Findings
**Commercial**
- Lease types are only `residential` and `commercial`; term types `fixed` and `mtm` — [components/internal/screens/leasing/shared.js:117-125](C:/Pro/geiger-property/components/internal/screens/leasing/shared.js)
- The "Commercial terms" block (permittedUse, expenseStructure Gross…NNN, sqftLeased, camCharges, tiAllowance, personalGuarantee) is all `meta: true` with no reader. TI allowance is defined at line 138 — [leasing/config.jsx:133-139](C:/Pro/geiger-property/components/internal/screens/leasing/config.jsx)
- `units.sqft int` is a real column — [20260715161206_units.sql:35](C:/Pro/geiger-property/supabase/migrations/20260715161206_units.sql)
- CAM reconciliation, in five steps:
  1. tick the pool of GL expense accounts
  2. actual CAM is summed from the ledger
  3. each lease's share defaults to unit square feet, with a manual % override
  4. true-ups post as charges or credits under the idempotency key `cam:<rec>:<lease>`
  5. true-ups are voidable

  Limits: one pool per property-year, and no caps, base year, expense stop, gross-up, admin fee or per-tenant exclusions. Income account 4040 "CAM Recoveries" — [cam_reconciliation.jsx:45-123, 174-270, 482](C:/Pro/geiger-property/components/internal/screens/accounting/cam_reconciliation.jsx); [ledger_core.sql:482](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- A fresh grep for `percent(age) rent|breakpoint|cpi|gross up|base year|expense stop|recovery|estoppel|SNDA|co-tenancy|sales report` over lib, components and migrations returns only the CAM Recoveries account label, the TI allowance field and CSS breakpoints. Percentage rent, CPI, recovery profiles, estoppels and sales reporting are absent — grep over [lib/](C:/Pro/geiger-property/lib), [components/](C:/Pro/geiger-property/components), [supabase/migrations/](C:/Pro/geiger-property/supabase/migrations)
- Recurring charge types are residential-flavoured: Pet rent, Parking, Storage, Utilities, Trash, Internet, Amenity fee, Furniture, Resident benefits package — [leasing/shared.js:372-383](C:/Pro/geiger-property/components/internal/screens/leasing/shared.js)
- There is no retail, office or industrial unit taxonomy beyond "Commercial" — [properties/constants.js:19-43](C:/Pro/geiger-property/components/internal/screens/properties/constants.js)

**Affordable and public housing**
- Property "Affordable program" select (None, LIHTC, Section 8 project-based, HOME, Inclusionary zoning, Other), "Income limit (% AMI)" and "Accepts housing vouchers" — [properties/sections/property_tabs.jsx:229-231](C:/Pro/geiger-property/components/internal/screens/properties/sections/property_tabs.jsx)
- Lease "Housing assistance": a "Subsidized (e.g. Section 8)" switch, program or housing authority, "Assistance portion / month" (`hapAmount`), and a readonly "Tenant portion" computed as rent − HAP — [leasing/config.jsx:140-150](C:/Pro/geiger-property/components/internal/screens/leasing/config.jsx)
- Tenant subsidy fields (program, monthly subsidy) — [tenants/config.jsx:148-150](C:/Pro/geiger-property/components/internal/screens/tenants/config.jsx)
- Application voucher fields — [marketing/sections/application_sections.jsx:125-126](C:/Pro/geiger-property/components/internal/screens/marketing/sections/application_sections.jsx)
- **No reader beyond that display.** A grep for `hapAmount|affordableProgram|incomeLimitAmi|subsidyAmount|acceptsVouchers|voucherAmount|subsidized` outside field definitions finds only the tenant-portion formatter. Billing still posts full `rent_accounts.rent` to the tenant; there is no HAP/PHA receivable split — grep over [lib/](C:/Pro/geiger-property/lib), [components/](C:/Pro/geiger-property/components); [lib/jobs/financial.js:188-225](C:/Pro/geiger-property/lib/jobs/financial.js)
- A grep for `lihtc|hud|section 8|voucher|hap|tracs|ami|income cert|recertif|pha|public housing|tax credit|subsid|50059|utility allowance` over code finds only the fields above and HUD links in Legal Resources. There is no TRACS/50059, no TIC or income (re)certification, no utility allowance, no compliance monitoring and no PHA modules — same grep
- Rent-control fields ("Rent controlled / stabilized", "Annual increase cap", "Rent registration #") are capture-only, with no reader — [property_tabs.jsx:226-228](C:/Pro/geiger-property/components/internal/screens/properties/sections/property_tabs.jsx)
- Legal Resources records per-state rent-regulation status (`statewide_rent_cap`, `rent_control_preempted`) as reference content only — [20261019184635_legal_resources.sql:23-33](C:/Pro/geiger-property/supabase/migrations/20261019184635_legal_resources.sql)

**Investment management**
- No table among the 90 is a fund, investor, loan, valuation or capital-plan table — the table list from [supabase/migrations/](C:/Pro/geiger-property/supabase/migrations)
- The ledger source types have no depreciation, loan or interest kind — [ledger_core.sql:73-76](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- The default chart has no Notes Payable, Interest or Depreciation accounts — [ledger_core.sql:466-494](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- Purchase price, current value and assessed value are inert inputs — [property_tabs.jsx:52-72](C:/Pro/geiger-property/components/internal/screens/properties/sections/property_tabs.jsx)
- Owner contributions and distributions post to the ledger and are split by ownership % in the owner portal. This is trust accounting, not fund equity — [lib/ledger/postings.js:300-330](C:/Pro/geiger-property/lib/ledger/postings.js); [lib/portal/owner.js:101-145](C:/Pro/geiger-property/lib/portal/owner.js)
- The closest forward-looking pieces are monthly budgets with budget vs actual, capital-project job costing, and per-lease escalation projections. There is no forecasting, IRR, DCF or scenario model — [geiger_investment_platform_ai.md:22-41](C:/Pro/geiger-property/research_notes/Geiger%20vs%20MRI%20PMX%20fact%20check/geiger_investment_platform_ai.md)
- Explicitly out of scope: "End-to-end real-estate ERP (investment mgmt + fund accounting)" — [COMPETITIVE_FEATURE_ANALYSIS_2026.md:377](C:/Pro/geiger-property/docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md)

**Occupier, global and enterprise**
- A grep for `asc 842|ifrs 16|right-of-use|lease liability|space plan|occupier` returns nothing — grep over [lib/](C:/Pro/geiger-property/lib), [components/](C:/Pro/geiger-property/components), [supabase/migrations/](C:/Pro/geiger-property/supabase/migrations)
- USD only, with US 1099/W-9 tax only. No legal-entity table and no intercompany accounting — [geiger_financials_leasing.md Q2-Q3](C:/Pro/geiger-property/research_notes/Geiger%20vs%20MRI%20PMX%20fact%20check/geiger_financials_leasing.md)

### Inferences
- **Commercial:** support is enough for a residential manager with a few NNN storefronts in a mixed-use building. It is not enough for a commercial PM firm or for retail. Every core commercial mechanic MRI's commercial line is known for (recoveries depth, percentage rent, CPI) is missing or shallow.
- **Affordable:** the fields look like a placeholder for a future module. They would let a manager label a Section 8 tenancy, but nothing in compliance, certification, subsidy billing or HUD reporting exists. Any claim to serve affordable or public housing would be false today.
- **Investment:** Geiger is a property-operations system with trust books, not an investment platform.

### Gaps
- No product decision on affordable housing was found in the docs. The P0-P4 plan does not mention HUD, LIHTC or affordable at all, so whether this segment is deferred or simply unconsidered is unknown — [COMPETITIVE_FEATURE_ANALYSIS_2026.md:298-385](C:/Pro/geiger-property/docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md)

## Q4. Platform: tech stack, schema, multi-tenancy, portals, jobs and API

### Takeaway
- **Stack and schema:** a Next.js 16 / React 19 app on a **suite-shared Supabase project**, with its own `property` Postgres schema of 88 tables. Every table carries `project_id` → `public.projects`. Migrations run on the suite's `@geiger/orm`.
- **Tenancy:** isolation is enforced only for **project visibility** (by the suite's RLS on `public.projects`) and inside **server routes**. Every `property.*` table has demo-open RLS, and the browser filters by project on the client.
- **Portals:** three portals (resident, owner and vendor) run through server routes with OTP sign-in and service-role queries scoped to the member.
- **Jobs and API:** there are 8 idempotent scheduled jobs, but none is scheduled. There is **no public API**.

### Cited Findings
**Stack**
- `next ^16.3.1`, `react 19.2.4`, `@supabase/ssr`, `@supabase/supabase-js`, `stripe ^22.3.0`, `@xyflow/react` (workflow and floor-plan canvases), `leaflet`, `recharts`, `date-fns`, `pg`
- Suite packages `@geiger/ui`, `@geiger/orm` and `@geiger/rbac`; `@geiger/rbac` is declared but unused
- No AI, OCR or PDF library

  — [package.json:16-41](C:/Pro/geiger-property/package.json)
- README stack: Next.js 16 App Router SSR/SSG, Tailwind v4, shadcn/ui and `@geiger/ui`, Lucide, Supabase (Postgres, Auth, Storage), Stripe — [README.md:39-44](C:/Pro/geiger-property/README.md)
- The workspace shell is `force-static`: "the project, the session and every screen's data resolve client-side" — [app/project/[projectId]/layout.js:1-9](C:/Pro/geiger-property/app/project/[projectId]/layout.js)

**Schema and conventions**
- One Postgres schema per suite product in a shared Supabase project: `property`, `flow`, `notes`, `docs`, `chat`, `comms` and so on. Only cross-product tables such as users and projects stay in `public` — [conventions/SUPABASE_CONVENTIONS.md:28-50](C:/Pro/geiger-property/conventions/SUPABASE_CONVENTIONS.md)
- Standard columns on every table: `id`, `metadata jsonb`, `created_by`, `created_at`, `updated_at`, `deleted_at` (soft delete) — [conventions/SUPABASE_CONVENTIONS.md:325-329](C:/Pro/geiger-property/conventions/SUPABASE_CONVENTIONS.md)
- Migrations are timestamped SQL with `@up` and `@down` markers, applied by `@geiger/orm` and recorded in `property.geiger_migrations` — [conventions/MIGRATION_CONVENTIONS.md](C:/Pro/geiger-property/conventions/MIGRATION_CONVENTIONS.md); [README.md:76-78](C:/Pro/geiger-property/README.md)
- Engine primitives:
  - `merge_meta` RPC
  - generic `record_items` child rows
  - a company → property → lease policy cascade
  - the double-entry `ledger_post` / `ledger_void` RPCs with 8 line dimensions

  — [engine_foundations.sql:18-66](C:/Pro/geiger-property/supabase/migrations/20261015210600_engine_foundations.sql); [lib/policies.js:1-4](C:/Pro/geiger-property/lib/policies.js); [ledger_core.sql](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)

**Multi-tenancy**
- The tenant unit is a suite **project**: the workspace route is `app/project/[projectId]`, and every ledger table references `public.projects(id)` — [ledger_core.sql:25, 51, 89](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- **Project visibility is enforced by RLS on `public.projects`.** The staff API guard "checks the caller can see the project through RLS on public.projects" — [lib/messaging/auth.js:6-9](C:/Pro/geiger-property/lib/messaging/auth.js)
- **Product tables are demo-open, by convention.** The convention reads: "RLS is enabled on every table. The current suite-wide policy is demo-open… `for all to anon, authenticated using (true) with check (true)`. Tightening it… is a new migration" — [conventions/MIGRATION_CONVENTIONS.md:306-317](C:/Pro/geiger-property/conventions/MIGRATION_CONVENTIONS.md); [conventions/SUPABASE_CONVENTIONS.md:328-329](C:/Pro/geiger-property/conventions/SUPABASE_CONVENTIONS.md)
- `using (true)` policies appear in 22 of the 31 migration files (23 in `full_build_tables.sql` alone) — grep -c over [supabase/migrations/](C:/Pro/geiger-property/supabase/migrations)
- Browser-side scoping uses `scopeQuery`, which also returns rows with a null `project_id` in every project — [lib/supabase/project_scope.js:16-19](C:/Pro/geiger-property/lib/supabase/project_scope.js)
- Within a project there is one set of books. There is no legal-entity layer, and portfolios are display-only — [geiger_financials_leasing.md Q2](C:/Pro/geiger-property/research_notes/Geiger%20vs%20MRI%20PMX%20fact%20check/geiger_financials_leasing.md)

**Portals**
- `/portal` is a "Self-service portal for residents, owners and vendors (magic-link sign-in)", with OTP and verify routes — [app/portal/page.js:12](C:/Pro/geiger-property/app/portal/page.js); [app/api/portal/auth/](C:/Pro/geiger-property/app/api/portal/auth)
- Access control: "Every /api/portal route resolves through requirePortal() and then reads or writes only that member's records with the service-role client." Portal roles are toggled per project in Branding & Portals — [lib/portal/session.js:6-9, 24-38](C:/Pro/geiger-property/lib/portal/session.js); [20261015215447_portal_members_access.sql](C:/Pro/geiger-property/supabase/migrations/20261015215447_portal_members_access.sql)
- **Resident portal:** overview, ledger, pay (Stripe), autopay, maintenance requests with photos, documents, renters insurance, messages and announcements — [lib/portal/resident.js](C:/Pro/geiger-property/lib/portal/resident.js); [components/portal/resident/](C:/Pro/geiger-property/components/portal/resident)
- **Owner portal:** overview, statements split by ownership %, documents, and work-order approve or reject — [lib/portal/owner.js:19, 101-145, 261-294](C:/Pro/geiger-property/lib/portal/owner.js)
- **Vendor portal:** assigned work orders (accept, decline, status, notes, photos, complete), invoices raised as approval-pending bills, and compliance documents (COI, licences) — [lib/portal/vendor.js:7, 110-141, 214, 295-310](C:/Pro/geiger-property/lib/portal/vendor.js)
- There is no applicant or prospect portal and no public listing site — route list under [app/](C:/Pro/geiger-property/app)

**Jobs**
- 8 registered jobs: recurring-charges, late-fees, management-fees, deposit-interest, autopay, automations, preventive-work-orders and scheduled_reports. All are idempotent and log to `property.job_runs` — [lib/jobs/registry.js:7](C:/Pro/geiger-property/lib/jobs/registry.js); [lib/jobs/execute.js:4](C:/Pro/geiger-property/lib/jobs/execute.js)
- Triggered by `GET /api/cron/<job>` or `/api/cron/run-due` with `Bearer CRON_SECRET`, or by staff "Run now" — [app/api/cron/[job]/route.js:7-36](C:/Pro/geiger-property/app/api/cron/[job]/route.js); [app/api/cron/run-due/route.js:6-8](C:/Pro/geiger-property/app/api/cron/run-due/route.js)
- `vercel.json` holds only `$schema`, so no crons are configured — [vercel.json](C:/Pro/geiger-property/vercel.json)

**API and integrations**
- The 43 `app/api` routes are all first-party: cron (3), messages (4), payments (9), portal (26) and the Stripe webhook (1). There are no API keys, no OAuth, no versioned `/v1`, no OpenAPI, no GraphQL and no MCP — route list under [app/api/](C:/Pro/geiger-property/app/api)
- Live integrations:
  - Stripe — [lib/stripe/server.js](C:/Pro/geiger-property/lib/stripe/server.js); [app/api/stripe/webhook/route.js](C:/Pro/geiger-property/app/api/stripe/webhook/route.js)
  - suite email through geiger-dash and Resend — [lib/email/client.js:1-16](C:/Pro/geiger-property/lib/email/client.js)

**Storage**
- Property media and documents go to the suite-shared **public** "products" bucket; "reads are public" — [lib/supabase/property_storage.js:7-13](C:/Pro/geiger-property/lib/supabase/property_storage.js)
- Portal uploads go to "the shared public bucket" — [lib/portal/files.js:1-5](C:/Pro/geiger-property/lib/portal/files.js)
- Chat creates a public `property-chat` bucket — [20261019205301_chat_workspace.sql:7-8](C:/Pro/geiger-property/supabase/migrations/20261019205301_chat_workspace.sql)

### Inferences
- **Architecture:** the design is sound for an SMB SaaS. It uses one Postgres, a dimensioned ledger, idempotent jobs and server-scoped portals. But the **security model is not production-grade**: anyone holding the public anon key could read or write any project's property data through PostgREST.
- **Prerequisite:** this is the single biggest blocker to selling to a mid-size PM firm, and to adding an API, BI access or AI document ingestion.
- **Integration posture:** Geiger is essentially closed. That suits an SMB all-in-one, but not the enterprise integration expectations that MRI's ecosystem sets.

### Gaps
- The definition and RLS of the suite-owned `public.projects` table are not in this repo, so how strictly project membership is enforced was not verified.
- Whether any deployed environment sets `CRON_SECRET` and an external scheduler, or Stripe keys, cannot be determined from the repo.

## Q5. What has changed since the 2026-11-02 fact-check, and are its listed defects still open?

### Takeaway
**Nothing in the application has changed.** The fact-check was taken at HEAD `4fdcbd7`, and that is still HEAD, so no commit postdates it. The two commits from 1-2 November are both small and both predate or equal the fact-check baseline:
- `4fdcbd7` (2026-11-02) added one line to `app/page.js`, the SEO canonical.
- `cd04170` (2026-11-01) added live suite product badges to the header.
- The working tree differs only in documentation: convention docs moved into `conventions/`, plus the new report and notes.

**All four named defects remain open, as does the missing-cron issue.**

### Cited Findings
**Git**
- `git log --since=2026-11-01 --oneline` returns only `4fdcbd7 fix(seo): add a canonical to the Property landing page`. Its diff stat is `app/page.js | 1 +` — git log / git show
- `cd04170` (2026-11-01 09:21) "show live product badges from Version control" touched `components/header.jsx`, `lib/product-badges.js`, `package.json` and `package-lock.json` — git show --stat
- `git status` shows only deletions of root-level convention markdown files and untracked `conventions/`, `reports/…fact check.md` and `research_notes/…fact check/`. `git diff HEAD --stat` over app, lib, components, supabase, utils, context, package.json and vercel.json is empty — git status / git diff
- The last feature commit is `9be8f05` (2026-10-20), "removed vercel cordn and added seeder" — git log

**Defect 1: escalations update `leases.rent`, but billing reads `rent_accounts.rent`. STILL OPEN.**
- "Apply due" calls `onCommit({ rent: last.rent })` on the lease and stamps `appliedOn` in `metadata.rentSchedule` — [components/internal/screens/leasing/sections/lease_money.jsx:108-120](C:/Pro/geiger-property/components/internal/screens/leasing/sections/lease_money.jsx)
- The rent job reads `rent_accounts` — [lib/jobs/financial.js:190](C:/Pro/geiger-property/lib/jobs/financial.js)
- The only code that writes to `rent_accounts` sets the autopay flags and payment method, never rent — [lib/payments/autopay.js:263](C:/Pro/geiger-property/lib/payments/autopay.js); [lib/payments/fulfill.js:250-254](C:/Pro/geiger-property/lib/payments/fulfill.js)

**Defect 2: the recurring-charge job bills Semi-annual and Weekly charges as monthly. STILL OPEN.**
- `const FREQUENCY_MONTHS = { Monthly: 1, Quarterly: 3, Annually: 12, "One-time": 0 };` — [lib/jobs/financial.js:24](C:/Pro/geiger-property/lib/jobs/financial.js)
- `const months = FREQUENCY_MONTHS[r.frequency] ?? 1;` — [lib/jobs/financial.js:144](C:/Pro/geiger-property/lib/jobs/financial.js)
- The UI still offers `["Monthly", "Quarterly", "Semi-annually", "Annually", "Weekly"]` — [components/internal/screens/leasing/shared.js:385](C:/Pro/geiger-property/components/internal/screens/leasing/shared.js)
- Related, also open: auto-posted rent is keyed per month (`rent:${a.id}:${YYYY-MM}`) and ignores frequency — [lib/jobs/financial.js:200](C:/Pro/geiger-property/lib/jobs/financial.js)

**Defect 3: RLS is demo-open. STILL OPEN, and is current convention.**
- `using (true)` policies remain in 22 migration files, including the chat migration's "suite-wide demo-open policy, one per table" and `portal_members_demo_all` — [20261019205301_chat_workspace.sql:294-305](C:/Pro/geiger-property/supabase/migrations/20261019205301_chat_workspace.sql); [20261015215447_portal_members_access.sql:79-83](C:/Pro/geiger-property/supabase/migrations/20261015215447_portal_members_access.sql)
- The only `auth.uid()` policies are on the chat storage bucket's update and delete — [20261019205301_chat_workspace.sql:333-349](C:/Pro/geiger-property/supabase/migrations/20261019205301_chat_workspace.sql)
- The newly relocated conventions still prescribe demo-open RLS for new tables — [conventions/MIGRATION_CONVENTIONS.md:306-317](C:/Pro/geiger-property/conventions/MIGRATION_CONVENTIONS.md)

**Defect 4: documents are stored in a public bucket. STILL OPEN.**
- `PROPERTY_MEDIA_BUCKET = "products"`, "the public 'products' bucket (shared across the suite)… reads are public" — [lib/supabase/property_storage.js:7-13](C:/Pro/geiger-property/lib/supabase/property_storage.js)
- Portal uploads, including insurance, invoices and compliance documents, also go to "the shared public bucket" — [lib/portal/files.js:1-5, 9](C:/Pro/geiger-property/lib/portal/files.js)

**Other fact-check findings re-checked**
- No crons are configured: `vercel.json` contains only `$schema`. **Open** — [vercel.json](C:/Pro/geiger-property/vercel.json)
- The Integrations screen and README overclaims are unchanged. **Open** — [settings/integrations.jsx](C:/Pro/geiger-property/components/internal/screens/settings/integrations.jsx); [README.md:28-34](C:/Pro/geiger-property/README.md)

### Inferences
- **The fact-check's Geiger findings are current.** Its maturity verdicts can be reused as-is for the MRI portfolio comparison.
- **New in this profile:** the marketing overclaims beyond the README (online applications, SMS, fee-posting workflows) and the affordable-housing field inventory.

### Gaps
- None for the git delta. Defect status was verified by reading the code, not by running the app.

## Q6. How does Geiger Property relate to its sibling suite products, and does that support an "all-in-one" story?

### Takeaway
Geiger Property is one app in the **Geiger Studio** suite (`geiger.studio`). It shares a Supabase project (one schema per product), suite auth and projects, the `@geiger/ui` design system, the `@geiger/orm` migration tool, the SuiteHeader product switcher, notifications and geiger-dash email and changelog services. The integration is **shell-level, not data-level**:
- Communications is a *copy* of Flow's Grounding chat, held in Property's own tables.
- Property exchanges no data with Flow issues, Notes or Docs.
- e-sign is planned from a future geiger-docs, and AI from a future shared package.

The "all-in-one" claim therefore rests on Property's own breadth. The suite adds only a shared login, a shared look and cross-app navigation.

### Cited Findings
**Brand and FAQ**
- "Does it work with the rest of Geiger Studio? Yes. Geiger Property shares the same design system, workspace and account model as the rest of the suite, so it sits naturally alongside Flow, Notes and Events." — [components/landing/landing_page.jsx:30-31](C:/Pro/geiger-property/components/landing/landing_page.jsx)
- README: "the property-management application of the Geiger suite" — [README.md:9, 17](C:/Pro/geiger-property/README.md)

**Shared infrastructure**
- The suite schema table lists Notes, Flow, Assets, Grey, Office, Forms, Property, Content, Campaign, Pods, Comms, Chat, Canvas and Docs, each in its own schema in one shared Supabase project — [conventions/SUPABASE_CONVENTIONS.md:28-50](C:/Pro/geiger-property/conventions/SUPABASE_CONVENTIONS.md)
- The header is `SuiteHeader` from `@geiger/ui`, with product-menu badges read live from `public.suite_product_badges`, which geiger-dash edits — [components/header.jsx](C:/Pro/geiger-property/components/header.jsx); [lib/product-badges.js](C:/Pro/geiger-property/lib/product-badges.js); commit `cd04170`
- The notifications dropdown reads the suite-shared `public.flow_notifications` — [components/internal/topbar/dialogue/notifications_dropdown.jsx:31-36](C:/Pro/geiger-property/components/internal/topbar/dialogue/notifications_dropdown.jsx)
- The init migration creates `public.flow_teams` — [20260708132809_init.sql:31](C:/Pro/geiger-property/supabase/migrations/20260708132809_init.sql)
- Email: "the single outbound integration point" is geiger-dash (default `https://geiger.studio`), which delivers through Resend — [lib/email/client.js:1-16](C:/Pro/geiger-property/lib/email/client.js)
- The changelog is published through Geiger Dash's changelog service (commit `82d5376`) — git log

**Chat (Grounding port)**
- Communications is "the team chat ported from geiger-flow's Grounding workspace, scoped to a project", in `property.chat_*` tables and its own `property-chat` bucket — [20261019205301_chat_workspace.sql:1-9](C:/Pro/geiger-property/supabase/migrations/20261019205301_chat_workspace.sql); [memory/communications_chat.md](C:/Users/space/.claude/projects/C--Pro-geiger-property/memory/communications_chat.md)

**UI alignment**
- UI was aligned to geiger-events, the polish reference, and uses `@geiger/ui` only — [memory/ui_suite_alignment.md](C:/Users/space/.claude/projects/C--Pro-geiger-property/memory/ui_suite_alignment.md)

**No data-level integration**
- A grep for `.schema("flow"|"notes")` finds nothing — [geiger_investment_platform_ai.md:141](C:/Pro/geiger-property/research_notes/Geiger%20vs%20MRI%20PMX%20fact%20check/geiger_investment_platform_ai.md)
- The demo project lives in a suite project named "Geiger Notes", showing that projects are shared across products — [memory/demo_project_seed.md](C:/Users/space/.claude/projects/C--Pro-geiger-property/memory/demo_project_seed.md)

**Planned suite dependencies**
- "E-sign: skipped — will come from geiger-docs… AI: skip all AI features — a future shared suite package… will provide AI inference" — [memory/full_build_decisions.md](C:/Users/space/.claude/projects/C--Pro-geiger-property/memory/full_build_decisions.md)
- `@geiger/rbac` is declared but unused; RBAC is the local `lib/rbac.js` — [package.json:18](C:/Pro/geiger-property/package.json)

### Inferences
- **Against MRI:** "suite" is not a competitive lever comparable to MRI's breadth, because the siblings (task management, notes, events, docs) are horizontal productivity tools, not real-estate modules. The suite story is closer to "a modern workspace family" than to MRI's multi-product real-estate platform.
- **Future value:** it could become one if geiger-docs (e-sign) and the AI package ship and plug into Property.

### Gaps
- The sibling repositories (Geiger Flow, Notes, Dash) were not inspected, so whether any of them plans property-specific integration is unknown.

## Q7. Where does Geiger Property sit against MRI's product lines?

### Takeaway
On the code as it stands, Geiger Property competes almost entirely in **residential property management for small-to-mid third-party managers and independent landlords**. It is **strongest** against MRI's residential PM offering and MRI's SMB landlord tools. It is **marginal** in commercial, **adjacent but much narrower** in facilities and maintenance, and **absent** from affordable/public housing, occupier lease administration and investment management.

The MRI product most relevant to Geiger, and most competitive with it, should therefore be drawn from MRI's residential/SMB PM line. Comparing Geiger with MRI's enterprise PMX commercial, Investment Management, affordable or occupier products would compare it with modules its target buyer does not buy. The 2026-11-02 report reached the same conclusion for PMX — [reports/Geiger vs MRI PMX fact check.md:127-129, 163](C:/Pro/geiger-property/reports/Geiger%20vs%20MRI%20PMX%20fact%20check.md)

### Cited Findings

| MRI product line | Geiger overlap | Geiger evidence |
|---|---|---|
| Residential PM (third-party / multifamily / single-family) | **High.** This is Geiger's core: leasing funnel, leases, renewals, inspections, deposits, a trust GL with owner statements and mgmt fees, Stripe rent and autopay, maintenance, and resident/owner/vendor portals. | Q2 matrix; [landing_page.jsx:81-93, 114-115](C:/Pro/geiger-property/components/landing/landing_page.jsx); [README.md:17](C:/Pro/geiger-property/README.md) |
| SMB landlord tools | **High by intent, medium in practice.** It targets "independent landlords". A free ≤10-unit tier is planned but not built, and the product is heavier than DIY tools (a full GL). The DIY-tier essentials of tenant screening and e-sign are tracking-only. | [landing_page.jsx:18-19](C:/Pro/geiger-property/components/landing/landing_page.jsx); [COMPETITIVE_FEATURE_ANALYSIS_2026.md:409](C:/Pro/geiger-property/docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md); [applications.jsx:78-81](C:/Pro/geiger-property/components/internal/screens/marketing/applications.jsx); [esignature.jsx:35-37](C:/Pro/geiger-property/components/internal/screens/leasing/esignature.jsx) |
| Commercial PM (office, retail, industrial) | **Low.** Basic CAM true-up and manual rent steps; NNN terms capture-only; no percentage rent, CPI, recovery depth, sales reporting or multi-entity. | Q3; [cam_reconciliation.jsx:174-270](C:/Pro/geiger-property/components/internal/screens/accounting/cam_reconciliation.jsx); [leasing/config.jsx:133-139](C:/Pro/geiger-property/components/internal/screens/leasing/config.jsx) |
| Affordable / public housing (HUD, LIHTC, PHA) | **None functional.** Only metadata labels (program, % AMI, voucher, HAP display). | [property_tabs.jsx:229-231](C:/Pro/geiger-property/components/internal/screens/properties/sections/property_tabs.jsx); [leasing/config.jsx:140-150](C:/Pro/geiger-property/components/internal/screens/leasing/config.jsx) |
| Occupier / corporate lease administration (ASC 842 / IFRS 16) | **None.** Geiger is landlord-side only. | grep in Q3 |
| Investment management (funds, valuation, debt, waterfalls, forecasting) | **None**, and out of scope per the plan | [COMPETITIVE_FEATURE_ANALYSIS_2026.md:377](C:/Pro/geiger-property/docs/COMPETITIVE_FEATURE_ANALYSIS_2026.md); Q3 |
| Facilities / maintenance management | **Moderate for residential maintenance; none for FM.** Work orders, preventive schedules, unit turns, inventory, vendor portal, COI compliance. No space management, CAFM, IoT, asset lifecycle or capital planning (`expectedLifeYears` unused). | Q2 matrix; [properties/record_kinds.js:111-131](C:/Pro/geiger-property/components/internal/screens/properties/record_kinds.js) |

**Cross-cutting enterprise gaps**
- These lower competitiveness against any MRI line: no public API or connectors, no AI, USD and US only, no multi-entity, demo-open RLS, no live screening, e-sign or SMS — Q4; [reports/Geiger vs MRI PMX fact check.md:3](C:/Pro/geiger-property/reports/Geiger%20vs%20MRI%20PMX%20fact%20check.md)

**Differentiators Geiger can credibly claim today**
- A modern unified UI with a no-sign-up live playground — [lib/sandbox/sandbox_client.js:1-6](C:/Pro/geiger-property/lib/sandbox/sandbox_client.js)
- A no-code workflow canvas that executes server-side — [lib/automations/runner.js:18-22](C:/Pro/geiger-property/lib/automations/runner.js)
- A dimensioned double-entry trust ledger with budgets, job costing, RUBS and basic CAM — [ledger_core.sql](C:/Pro/geiger-property/supabase/migrations/20261015212744_ledger_core.sql)
- Three portals, all included — [landing_page.jsx:22-27](C:/Pro/geiger-property/components/landing/landing_page.jsx)
- A built-in 50-state legal-resources reference — [20261019184635_legal_resources.sql:1-10](C:/Pro/geiger-property/supabase/migrations/20261019184635_legal_resources.sql)
- Team chat in-app — [20261019205301_chat_workspace.sql:1-9](C:/Pro/geiger-property/supabase/migrations/20261019205301_chat_workspace.sql)

### Inferences
- **Best comparison target:** the MRI comparison should centre on whichever MRI product serves US residential third-party managers and smaller landlords (the report writer should map this to MRI's actual residential/SMB product names from the MRI-side research). The secondary check is MRI's commercial line, to confirm the "commercial and mixed-use" marketing claim is defensible only at small scale.
- **Honest framing:** Geiger is "a pre-launch, modern, all-in-one residential PM platform for SMB/mid-market managers, with real trust accounting and starter commercial tools, competing on bundling and UX rather than depth". Calling it an MRI-class real-estate ERP, or a product for commercial, affordable or investment buyers, would overstate it.
- **Most credible levers to close the gap with MRI's residential and SMB line:**
  1. fixing RLS and storage
  2. wiring a screening, e-sign and SMS provider
  3. switching on scheduled jobs
  4. fixing the escalation and frequency defects

  The first is a prerequisite for the rest. This is an inference from Q2-Q5, not a team roadmap.

### Gaps
- MRI-side product names, packaging and feature sets are outside this profile's scope. The MRI rows above describe *Geiger's* overlap with each line as the assignment named them, not verified MRI capability.
- No customer, pipeline or usage data exists (the product is pre-launch), so segment fit is judged from code and marketing intent, not from market traction.
