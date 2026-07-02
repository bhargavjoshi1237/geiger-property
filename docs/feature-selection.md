# Feature Selection — Geiger Property

Companion to [`competitive-feature-matrix.md`](./competitive-feature-matrix.md).
That doc surveys the 2026 market and ranks every feature by rarity. This doc does
the **nit-picking**: for each candidate feature it sets a **relevancy score** for
Geiger Property, weighing (a) how common it is (table-stakes vs. differentiator),
(b) how much perceived value it carries, and (c) how cheap it is to deliver at our
price point. The result is the scope realized in
`components/internal/sidebar/sidebar_nav.jsx`.

## Positioning

> *"Enterprise-suite depth for independent landlords and growing property
> managers — every table-stakes feature included, the cheap differentiators free,
> and AI + fintech that the big platforms lock behind $1,500/mo minimums."*

Target: 1–500 units. Pricing intent: a single, mostly all-inclusive plan
(Rentvine-style anti-gating), transaction fees low or waived, with an optional
pro tier only for true trust accounting + open API + agentic AI at scale.

## Relevancy scoring

**Relevancy** = build priority for Geiger Property, on a 5-point scale:

- **P0 — Must-have.** Table stakes; disqualifying if missing. Ship first.
- **P1 — Expected.** Serious operators assume it; strong MVP-plus.
- **P2 — Differentiator (include).** Cheap-to-deliver or high-value edge we
  deliberately include (often free) to counter-position against gated incumbents.
- **P3 — Premium / build-toward.** High-value, higher-effort; our paid-tier or
  fast-follow roadmap.
- **P4 — Later / niche.** Vertical or enterprise; only if a customer pulls it in.

Every P0–P3 feature appears in the sidebar today (real screen or ComingSoon
placeholder) so the full scope is visible; P4 items are listed here and included
selectively in the sidebar where they group naturally (e.g. Associations & HOA).

## Selection by area

### Overview — P0
Portfolio dashboard: occupancy, rent collected, delinquency, open work orders,
expiring leases, today's actions. The one screen built out first.

### Properties & Units — P0
`All Properties · Units · Portfolios · Buildings & Blocks · Amenities · Photos &
Media · Floor Plans · Unit Types · Ownership & Splits · Unit Turns & Make-ready ·
Keys & Access · Property Groups`. The spine everything else hangs off.

### Listings & Marketing — P0/P1 core, P2 edges
P0: `Vacancy Listings · Listing Syndication · ILS Distribution`. P1: `Marketing
Website · Showings & Tours · Waitlist`. **P2 differentiators (include free):**
`AI Listing Writer` (common but a cheap win), `Rent Comparables` (rare — only Avail
+ Rentvine), `Self-guided Showings`, `Virtual Tours`, `QR & Yard Signs`,
`Promotions & Specials`.

### Leads & CRM — P2 (include free)
`Prospects · Pipeline · Guest Cards · Follow-ups · Lead Sources · Lead-to-lease ·
Auto-responders`. Built-in CRM is only 8/16 and usually gated (AppFolio Max, Yardi
Premier) — DoorLoop/Rentvine make it a selling point. **We include it free.**

### Applications & Screening — P0
`Online Applications · Application Forms · Tenant Screening · Credit / Background /
Eviction Checks · Income Verification · Application Fees · Decisioning · Applicant
Communication`. Universal table stakes; income verification (6/16) is the P2 edge.

### Leasing — P0 core, P2 edges
P0: `Leases · Lease Builder · Lease Templates · E-signature · Renewals · Move-in /
Move-out · Notices & Violations · Security Deposits · Lease Expirations`. **P2
differentiators:** `State-specific Leases` + **unlimited `E-signature`** (metered by
incumbents — cheap for us to give free), `Rent Increases`, `Move-in Inspection`.
P3: `Deposit Alternatives` (Obligo-style, rare).

### Tenants — P0/P1 + P2 fintech-adjacent
P0: `Tenant Directory · Resident Portal · Communication Log · Documents · Notices`.
P1: `Announcements · Renters Insurance · Move-out Pipeline · Household & Occupants`.
**P2 (include free):** `Rent Reporting` to bureaus (9/16, usually a paid add-on),
`Renter Rewards`, `Reviews & Feedback`.

### Owners — P1 (pro-tier core)
`Owner Directory · Owner Portal · Owner Statements · Owner Distributions ·
Contributions · Ownership Splits · Management Fees · 1099 & Tax · Communication ·
Documents`. Owner portal/statements are 10/16 — expected once you serve PMs, not
just landlords.

### Maintenance — P0 core, P3 white-space
P0: `Work Orders · Maintenance Requests · Vendors · Vendor Assignments ·
Inspections · Photos & Attachments`. P1: `Preventive Maintenance · Recurring Work
Orders · Vendor Portal · Make-ready Boards · Mobile Maintenance · Estimates & Bids ·
Inventory & Parts · Meter Readings`. **P3 differentiators:** `AI Maintenance Triage`
(TurboTenant/AppFolio only) and `24/7 Coordination` (Hemlane's white-space service
layer — a standout if we build the human/vendor network).

### Accounting — P0/P1 core, P3 moat
P0: `Rent Collection · Online Payments · Autopay · Recurring Charges · Late Fees ·
General Ledger · Deposits`. P1: `Chart of Accounts · Bills & Payables · Invoices &
Receivables · Bank Accounts · Bank Reconciliation · Journal Entries · Payouts &
Distributions · Budgeting · 1099 E-filing · QuickBooks Sync · Utility Billing
(RUBS) · Cash / Retail Payments`. **P3 moat:** `Trust Accounting` (audit-ready
3-way recon — only 6/16, the professional moat for the PM tier) and `AI Bookkeeping`
(rare — AppFolio/Buildium Premium/Rentvine). P2: `Payment Plans` (flexible rent).

### Banking & Fintech — P3 (build-toward battleground)
`Landlord Banking · Property Sub-accounts · High-yield Savings · Debit & Cards ·
Merchant / Payout Accounts · Flexible Rent · Loan Marketplace · Transaction
History`. The **least-saturated premium battleground** — only Stessa + Baselane own
it. High strategic value; a fast-follow after the PM core.

### Communications — P0/P1, P3 VoIP
P0: `Inbox · Email · Text / SMS · Notifications`. P1: `Bulk Messaging ·
Announcements · Message Templates · Call Logging · Contact Center`. **P3:** `VoIP &
Voicemail` (rare — only Rent Manager's rmVoIP).

### Documents & eSign — P1
`Document Library · Templates · E-signature · Shared Files · Compliance Documents ·
Document Requests`. Unlimited eSign is the anti-gating hook (see Leasing).

### Tasks & Operations — P1/P2
`Tasks · Calendar · Reminders · Automations · Recurring Tasks · Team Assignments`.
**P2:** `AI Assistant` (agentic ops — the AppFolio Realm-X analog at our price).

### Associations & HOA — P4 (niche, grouped)
`Associations · Board Members · Dues & Assessments · Violations · Architectural
Requests · Committees · Voting & Elections · Meetings & Minutes · Common Areas ·
Amenity Booking`. A distinct vertical (Buildium/Yardi serve it). Scaffolded but
gated behind demand — do not build until an HOA customer pulls it in.

### Reports — P0/P1
`Financial Reports · Rent Roll · Delinquency · Occupancy · Income Statement ·
Balance Sheet · Cash Flow · General Ledger · Owner Statements · Schedule E / Tax
Pack · Maintenance / Leasing Reports · Custom Report Builder · Scheduled Reports ·
Export Center`. Rent roll + delinquency + owner statements are P0; custom report
writer is a P2 edge (7/16).

### Insights — P2/P3
`Portfolio KPIs · Occupancy Trends · Revenue & NOI · Delinquency Trends · Lease
Expiration Forecast · Benchmarks` (P2 analytics — 6/16, usually mid-tier gated) and
`Rent Optimization · AI Insights` (P3 — rare ML, Rentvine/AppFolio Max).

### Portals — P1/P2
`Resident · Owner · Vendor · Board · Applicant` portals + `Portal Branding · Mobile
App`. Rentvine's "four portals free" is the benchmark; **we match it free** as a
counter-position.

### Integrations — P1 core, P3 API
`Accounting Sync · Payment Gateways · Screening Providers · Listing Partners ·
Insurance Partners · Data Import · Connected Apps` (P1). **P3:** `Open API ·
Webhooks · Zapier` — the single most consistent premium gate across the market;
our pro-tier / platform hook.

### Settings — P1
`Company Profile · Team & Members · Roles & Permissions · Billing & Plans ·
Branding · White-label · Custom Fields · Notifications · Security · SSO · 2FA ·
Audit Logs · Tax & Legal · Localization · Data & Backup · API & Webhooks · Support
& SLA`. Standard workspace administration.

## The pricing thesis (how relevancy maps to price)

| Bucket | Features | Our stance |
| --- | --- | --- |
| **P0/P1 — included in base** | All table stakes + the expected operational depth | Everything a reviewer checks for, in the single plan. No "call for the basics." |
| **P2 — included free (anti-gating)** | Unlimited eSign, low/free ACH, built-in CRM, rent reporting, AI listing writer, four portals, custom report builder, income verification | The cheap-to-deliver, high-perceived-value edges incumbents gate. Given away to win the comparison. |
| **P3 — pro tier / fast-follow** | Trust accounting, AI bookkeeping + maintenance triage + assistant, open API + Zapier, analytics/benchmarking, landlord banking + rewards, VoIP | The genuinely expensive, genuinely premium features — priced, but far cheaper than AppFolio's $1,500/mo AI gate. |
| **P4 — later / niche** | HOA/associations, affordable-housing/commercial CAM compliance, corporate/job-costing accounting | Scaffolded in the nav, built only on customer demand. |

**Net:** match Rentvine's "one plan, no paywalls" for everything up to P2, undercut
AppFolio/Buildium on the P3 premium features by delivering AI + fintech at a
DIY-friendly price, and keep transaction fees low or waived (Rentec/Yardi model) as
the loudest anti-gating message.
