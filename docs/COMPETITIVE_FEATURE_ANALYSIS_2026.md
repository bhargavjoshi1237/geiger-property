# Geiger Property — Competitive Feature Analysis (2026)

> **Purpose:** Identify the leading property management apps, catalog what each offers, rank every feature by market rarity (Universal → Extremely Rare), then nit-pick the feature set for Geiger Property so we can position it deliberately against a price point.
>
> **Date:** 2026-07-06 · **Method:** Independent rebuild from 2026 vendor + review sources. This supersedes prior in-repo research docs.

---

## 1. Today's leading property management apps

The market segments cleanly into **four tiers** by buyer profile. Below is each leader, who it serves, and the pricing model that funds it.

### Tier 1 — Enterprise / large-portfolio ("the establishment")

| App | Target customer | Pricing model | Headline price |
|---|---|---|---|
| **AppFolio Property Manager** | Mid–large PM companies, mixed residential + commercial, 100–10k+ units | Per-unit/month + onboarding fee | ~**$1.40/unit/mo** (residential), **$0.85** (commercial); onboarding ~$400–$1,200 |
| **Yardi Voyager** | Institutional multifamily, commercial, mixed; 1,000+ units | Modular quote-based ERP | Quote only (high TCO + implementation) |
| **Yardi Breeze** | SMB–mid, 100–500 units, resi/commercial/mixed | Per-unit/month, flat min | **$1.00/unit/mo**, **$100 min** (Standard); **$2.00/unit, $400 min** (Premier). **No onboarding fee.** |
| **Rent Manager** | Independent PM firms, 200–50k units, mixed incl. vacation/MH/HOA | Per-unit bundles (Essential→Enterprise), unlimited users | Quote only; ~**$1/unit/mo** baseline |
| **Propertyware** (RealPage) | Large single-family (SFR) operators, hundreds–thousands of doors | 3 tiers, per-unit, +API add-on | ~**$1.00/unit/mo** + **$1.00/unit** for open API; **2× monthly** implementation fee |

**What this tier offers:** Full general-ledger accounting, open APIs, deep customization, every portal (tenant/owner/vendor/applicant), enterprise reporting, AI add-ons. The "do-everything" platforms.

### Tier 2 — Modern challengers ("next-gen, all-inclusive")

| App | Target customer | Pricing model | Headline price |
|---|---|---|---|
| **Rentvine** | Growth-minded PM companies, 100–2,000 units; modern UX + embedded banking | Single all-inclusive plan, per-unit | ~**$4–5/unit/mo**, includes Wallet banking — **no module upsells** |
| **DoorLoop** | SMB–mid, residential + some commercial, 1–500+ units; modern UX, transparent pricing | Tiered flat monthly, billed annually | **Starter $49**, **Pro $109**, **Premium $218/mo** (annual) with unit caps |
| **Buildium** | Independent PMs, mixed residential, 1–5,000 units; the "safe mid-market default" | Tiered flat monthly | **Essential $55**, **Growth $170**, **Premier $375/mo** (annual) |

**What this tier offers:** Everything Tier 1 does functionally, minus enterprise depth (no full CAM/recoverables, lighter custom reporting), but with **better UX, faster onboarding, and bundled features** instead of module upsells. Rentvine's differentiator: embedded **banking + per-property accounts** baked in.

### Tier 3 — Indie / mid-market value

| App | Target customer | Pricing model | Headline price |
|---|---|---|---|
| **Rentec Direct** | Independent landlords + small PMs, 1–500 units | Per-unit, declines with volume | From **$0.50–1.00/unit/mo** depending on tier |
| **TenantCloud** | Indie landlords + small PMs, 1–500 units | Freemium + paid tiers | **Free** ≤75 units; **$20–60/mo** paid |
| **Innago** | Indie landlords, any size; completely free to landlord | Free to landlord — **tenant-paid fees** fund it | **$0/mo** (tenant screening + ACH fees fund the platform) |

**What this tier offers:** Core PM (properties, tenants, rent, basic accounting, maintenance, tenant portal) at low or zero cost. Light on owner/investor features and advanced accounting.

### Tier 4 — Small-portfolio / DIY + landlord-finance

| App | Target customer | Pricing model | Headline price |
|---|---|---|---|
| **Hemlane** | DIY landlords, 1–30 units | Flat monthly | From **$30/mo** (management) + transaction fees |
| **RentRedi** | DIY landlords, mobile-first | Flat, low cost | ~**$12–20/mo**; **crypto payments** supported |
| **Avail** (Realtor.com) | DIY landlords, 1–10 units | Freemium + per-transaction | **Free** core; rent reporting to credit bureaus is a hook |
| **TurboTenant** | DIY landlords, screening-focused | Freemium | **Free** core; paid rent collection (~$) + premium tier |
| **Stessa** (Rocket) | Investor landlords, **financial tracking** focus | Freemium | **Free** core; rent collection + analytics paid |
| **Baselane** | Investor landlords, **banking + bookkeeping** focus | Free + interchange-funded | **Free** banking with **per-property virtual accounts** + debit cards |

**What this tier offers:** Either (a) lightweight full-PM for tiny portfolios, or (b) **landlord fintech** — embedded banking, bookkeeping auto-categorization, Schedule E / tax prep. Not full PM (no real maintenance, weak leasing).

---

## 2. The master feature universe

Distilled from all the above, every feature the market offers, grouped. This is the universe we'll rank and select from in §3–§5.

### A. Core entity & operations
- Property database (photos, custom fields, unit mix)
- Multi-property / multi-location / portfolio management
- Unit-type / unit-mix management (multifamily)
- Tenant records & lease tracking
- Owner / investor records
- Vendor / contractor records
- Move-in / move-out workflows

### B. Leasing funnel
- Rental listings + **ILS syndication** (Zillow, Apartments.com, Realtor.com, etc.)
- Public-facing property website / branding
- Online rental applications
- Tenant screening (credit, criminal, eviction) — paid by landlord OR tenant
- E-signature leases + state-specific lease templates
- Application → lease conversion (no double data entry)
- Lease renewals + automated renewal workflows
- Showings / scheduling / self-showings / lockbox integrations

### C. Rent & money-movement
- Online rent collection (ACH, debit, card, cash options)
- Autopay / recurring charges
- Late-fee automation + delinquency tracking
- Payment plans / split payments
- Tenant fee billing (pets, parking, amenities)
- **Embedded banking** — landlord checking/virtual accounts per property
- **Per-property virtual accounts** + routing numbers
- Instant / same-day payouts to owners
- High-yield balance accounts
- **Landlord debit card** tied to property accounts

### D. Accounting & finance
- Full general ledger / double-entry
- Accounts payable + accounts receivable
- Bank reconciliation + live bank feeds
- Financial statements (P&L, balance sheet, cash flow)
- Rent roll + CAM / commercial recoverables
- Budgeting & forecasting
- **1099 generation & e-filing** (owner + contractor)
- Schedule E export / tax-prep integration
- Mileage + receipt capture / scanning
- Auto-categorization of transactions (AI)
- Multi-entity / multi-currency
- QuickBooks / Xero sync

### E. Maintenance & operations
- Tenant-initiated maintenance requests via portal
- Work-order system (create, assign, track, resolve)
- Vendor portal + assignment
- **Preventive / recurring maintenance** scheduling
- Move-in/move-out + periodic **inspections** (mobile, photo checklist)
- Bidding / procurement marketplace (e.g., Bolo, Breezeway)
- Turnover project management

### F. Owner & investor management
- Owner portal (real-time visibility)
- Owner statements + automated distribution
- Owner ACH / direct deposit
- Investor CRM + capital-call / partner accounting
- Custom owner reporting / branding

### G. Communications
- In-app tenant messaging
- **Two-way SMS / texting** (mass + individual)
- Email + automated comms
- Communication log / audit trail
- Mass broadcast (announcements, delinquency notices)

### H. Documents & compliance
- Document storage with permissions
- E-signature (leases, addenda, notices)
- Template library (state-specific)
- Compliance notices (eviction, late, lease violations)

### I. Tasks, workflow & automation
- Task management + reminders
- Shared calendar / critical dates
- Workflow automation builder (if-this-then-that)
- **AI workflow assistant** (natural-language task creation)
- AI **leasing agent** (answers prospect questions, books showings)

### J. Reporting & insights
- Standard reports (occupancy, rent roll, delinquency, etc.)
- **Custom report builder**
- Dashboards (operational + financial)
- Portfolio-level rollups
- **AI insights** (anomalies, rent recommendations, forecasting)
- Open data export / BI connectors

### K. Portals (separate or unified)
- Tenant portal
- Owner portal
- Vendor portal
- Applicant portal
- (Future: HOA resident portal)

### L. Platform & integrations
- Open REST API
- Webhooks
- Integration marketplace / partner ecosystem
- White-label / branding
- Multi-user + role-based access control (RBAC)
- Audit log

### M. HOA / association
- HOA module (dues, violations, architectural reviews, voting)

### N. Mobile
- Native iOS/Android manager app
- Mobile inspections (offline, photo checklist)
- Tenant mobile app

### O. AI / automation (the 2026 battleground)
- AI **copilot** (ask-your-data)
- AI **leasing agent** (24/7 prospect chat)
- **Auto-categorization** of financial transactions
- AI document parsing (receipts, invoices, leases)
- Predictive insights (delinquency risk, optimal rent)
- AI-generated owner statements / narratives

---

## 3. Feature rarity ranking

Method: a feature's rarity tier = how many of the ~16 platforms offer it. **Universal** = nearly everyone; **Extremely Rare** = 1–2 platforms, often the differentiator.

### 🟦 UNIVERSAL — "table stakes" (offered by ~all 16)
Everyone has these. **No differentiation.** Pure cost-of-entry.

- Property database (photos, fields, units)
- Tenant records + lease tracking
- Online rent collection (ACH)
- Autopay / recurring charges
- Late fees + delinquency tracking
- Move-in/move-out
- Online rental applications
- Tenant screening (credit/criminal/eviction)
- E-signature leases
- Tenant portal
- Work-order system
- Vendor management
- Owner statements (basic)
- Document storage
- Task management + reminders
- Standard reports + rent roll
- Email + in-app messaging
- Native mobile app
- ILS listing syndication (Zillow/Apartments.com)
- Card / debit rent payments

### 🟩 COMMON — "expected by serious buyers" (~10–15 of 16)
Having these matches the norm; lacking them is a red flag for mid-market buyers.

- **Full general ledger / double-entry accounting**
- **AP + AR + bank reconciliation**
- Financial statements (P&L, balance sheet)
- **1099 generation**
- Owner portal (real-time)
- Two-way SMS texting
- Mass broadcast messaging
- Preventive / recurring maintenance
- Mobile inspections
- Lease renewal automation
- Custom fields on entities
- Open API
- Dashboards
- Owner ACH distributions
- Application → lease conversion (no double entry)
- Public-facing property website
- Schedule E / tax-prep export
- Receipt / expense capture
- HOA module (among full-PM tools)
- Role-based access control
- Custom report builder

### 🟨 UNCOMMON — "premium / differentiated" (~4–9 of 16)
Here differentiation begins. Offering these lifts perceived value; bundling them free is a competitive lever.

- **Embedded banking** (landlord checking) — *Rentvine, Baselane, Stessa, Innago partner*
- **Per-property virtual accounts** — *Baselane (signature), Rentvine*
- **Landlord debit card** — *Baselane*
- Instant / same-day owner payouts — *Rentvine, AppFolio, Baselane*
- **AI copilot / ask-your-data** — *AppFolio (Realm-X), Yardi Voyager 8, Rent Manager*
- **AI leasing agent** (24/7 prospect chat) — *AppFolio, EliseAI partners*
- Auto-categorization of transactions — *Baselane, Stessa*
- **1099 e-filing** (not just generation) — *AppFolio, Buildium, Rent Manager*
- CAM / commercial recoverables — *Yardi, Rent Manager, AppFolio*
- Inspection mobile checklists with photo proof — *Propertyware, AppFolio, Rent Manager*
- Workflow automation builder (no-code) — *Rentvine, DoorLoop, AppFolio*
- Vendor bidding/procurement marketplace — *AppFolio (Bolo), Propertyware partners*
- Investor CRM + partner accounting — *Yardi Voyager, AppFolio, Rent Manager*
- Cash payment options for tenants — *Propertyware, Innago partners*
- Self-showings + lockbox integrations — *Rently partners (DoorLoop, RentRedi)*
- Crypto rent payments — *RentRedi (signature)*
- Rent reporting to credit bureaus — *Avail, TurboTenant, RentRedi*
- White-label / branding — *DoorLoop, Rentvine, Rentec*
- Webhooks — *Rent Manager, Propertyware, DoorLoop*

### 🟥 RARE — "distinctive moat" (~2–3 of 16)
Few players have these. Owning one is a positioning weapon.

- **ESG / energy management + sustainability reporting** — *Yardi Energy Solutions (alone)*
- **Managed Contact Center** (live human agents for maintenance/leasing calls) — *Propertyware, Rent Manager*
- **Master insurance** (bundled AssetProtect-style) — *Propertyware*
- Built-in call-center-as-a-service — *Rent Manager*
- **AI-generated owner narratives / statements** — *AppFolio (emerging)*
- Predictive delinquency / rent-recommendation AI — *AppFolio, Yardi Voyager 8*
- Open two-way data exchange API (true bi-directional) — *Propertyware*
- Two-tier product (SMB Breeze ↔ enterprise Voyager) sharing one ecosystem — *Yardi (alone)*

### 🟥🟥 EXTREMELY RARE — "single-platform moat" (1 platform)
True one-of-a-kind capabilities.

- **End-to-end real-estate ERP** (PM + investment mgmt + ESG + energy in one) — *Yardi Voyager only*
- **Algorithmic rent-recommendation engine** at scale — *RealPage Revenue Mgmt (post-DOJ settlement, restricted); Yardi Revenue Mgmt*
- **Crypto rent payments** as a first-class method — *RentRedi*
- **Per-property FDIC virtual bank accounts + debit card + high-yield, free** — *Baselane (signature)*

---

## 4. The competitive gap Geiger Property should exploit

Three structural gaps are visible in the market right now (2026):

1. **The "upsell ladder" tax.** AppFolio, Yardi, Buildium, Rent Manager all gate features behind tiers, modules, or per-unit add-ons (e.g., Propertyware charges +$1/unit just for the API). A buyer at 200 units pays meaningfully more for the same feature set than at 50 units. **Rentvine proved** that bundling everything into one plan + banking resonates.

2. **The fintech/PM split.** Baselane/Stessa own landlord banking but lack real PM (maintenance, leasing, owner mgmt). AppFolio/Buildium own PM but bolt on banking via partners. **Nobody unifies deep PM + native banking + AI at a clean price.**

3. **AI is the new table-stakes battleground** (AppFolio Realm-X, Yardi Voyager 8, Rent Manager Copilot all launched ~2024–2026), but it's still gated behind premium tiers. A new entrant can **ship AI as core, not upsell.**

**Geiger Property's wedge:** *Modern all-inclusive PM (Rentvine-style) + native landlord banking (Baselane-style) + AI-as-core (not upsold), at a price that undercuts the $1.50–$5/unit incumbents.*

---

## 5. Feature selection for Geiger Property (P0–P4)

Strategy: **own the entire UNIVERSAL + COMMON set** (cost of entry — no excuses), **bundle the UNCOMMON fintech + AI features for free** (where incumbents charge), and **skip the RARE enterprise moats** that don't fit a modern SMB/mid-market buyer.

| Priority | Meaning | Build posture |
|---|---|---|
| **P0** | Cost of entry. Ship at MVP or don't launch. | All UNIVERSAL features |
| **P1** | Expected by serious buyers within 90 days of launch. | Most COMMON features |
| **P2** | Differentiators we bundle free where incumbents upsell. | UNCOMMON fintech + workflow |
| **P3** | The AI moat — our distinctive value. | UNCOMMON/RARE AI features |
| **P4** | Explicitly deferred / not built. | Enterprise RARE features |

### 🟦 P0 — Ship at MVP (Universal tier)
Must all be present at public launch.

- [ ] Property database (photos, custom fields, unit mix, multi-property)
- [ ] Tenant records + lease tracking (terms, charges, status)
- [ ] Online rent collection (ACH + card) with autopay
- [ ] Late fees + delinquency tracking
- [ ] Move-in / move-out workflows
- [ ] Online rental applications
- [ ] Tenant screening integration (credit/criminal/eviction)
- [ ] E-signature leases (integrated e-sign vendor)
- [ ] Tenant portal (pay rent, see ledger, submit maintenance)
- [ ] Work-order system (create/assign/track/resolve)
- [ ] Vendor records + assignment
- [ ] Owner statements (basic)
- [ ] Document storage with permissions
- [ ] Task management + reminders
- [ ] Standard reports + rent roll
- [ ] Email + in-app messaging
- [ ] Native mobile app (manager-side)
- [ ] ILS listing syndication (Zillow + Apartments.com minimum)
- [ ] Role-based access control + audit log

### 🟩 P1 — Within 90 days (Common tier)
- [ ] Full general ledger / double-entry
- [ ] AP + AR + bank reconciliation
- [ ] Financial statements (P&L, balance sheet, cash flow)
- [ ] 1099 generation
- [ ] Owner portal (real-time, downloadable statements)
- [ ] Two-way SMS texting + mass broadcast
- [ ] Preventive / recurring maintenance scheduling
- [ ] Mobile inspections (photo checklist)
- [ ] Lease renewal automation
- [ ] Custom report builder
- [ ] Owner ACH distributions
- [ ] Public-facing property website
- [ ] Schedule E / tax-prep export
- [ ] HOA module (light)
- [ ] Application → lease conversion (no double entry)

### 🟨 P2 — Differentiators we bundle FREE (Uncommon fintech + workflow)
This is where we undercut the upsell ladder. Incumbents charge for these; we include them.

- [ ] **Embedded banking** (landlord checking account)
- [ ] **Per-property virtual accounts** + routing numbers
- [ ] **Landlord debit card** tied to property accounts
- [ ] Instant / same-day owner payouts
- [ ] **1099 e-filing** (not just generation)
- [ ] **No-code workflow automation builder**
- [ ] White-label / branding for PM companies
- [ ] Webhooks + open API (free, not a paid add-on)
- [ ] Auto-categorization of transactions
- [ ] Cash payment options for tenants (PayNearMe-style partner)

### 🟥 P3 — The AI moat (our distinctive value)
Ship AI as **core**, not a premium tier. This is the 2026 differentiator.

- [ ] **AI copilot** — ask-your-data in natural language ("show me all delinquent tenants > 5 days")
- [ ] **AI leasing agent** — 24/7 prospect chat, answers unit questions, books showings
- [ ] **AI transaction auto-categorization** (rules + ML)
- [ ] **AI document parsing** — receipts, invoices, leases → structured data
- [ ] **Predictive insights** — delinquency risk scoring, optimal rent suggestions
- [ ] **AI-generated owner statements** with narrative summaries

### ⛔ P4 — Explicitly deferred / out of scope (Enterprise RARE)
We do **not** build these. They're enterprise moats that don't serve our buyer.

- ESG / energy management + sustainability reporting (Yardi-only)
- End-to-end real-estate ERP (investment mgmt + fund accounting) (Yardi-only)
- Managed Contact Center / call-center-as-a-service (Propertyware/Rent Manager)
- Master insurance / AssetProtect-style bundled product (Propertyware)
- Algorithmic rent-recommendation engine at portfolio scale (RealPage/Yardi — also DOJ-restricted)
- Multi-currency / global entity consolidation
- CAM / commercial recoverables (we'll add if commercial demand appears)

---

## 6. Pricing & positioning strategy

### The thesis
Match **Rentvine's all-inclusive bundling philosophy**, undercut **AppFolio/Buildium's effective per-unit cost**, and use **Baselane's interchange-funded banking** to subsidize the price so AI + fintech ship free.

### Where Geiger Property sits

```
   Cheap ◀──────────────────────────────────────▶ Expensive
   ───────────────────────────────────────────────────────────
   Innago  RentRedi  DoorLoop  Buildium  ┌GEIGER┐  Rentvine  AppFolio  Yardi
   (free)  ($12)     ($49+)   ($55+)    │ here │  ($4-5/u)  ($1.40/u) (custom)
                                        └──────┘
   ───────────────────────────────────────────────────────────
   Tier 4     Tier 3      Tier 2          Tier 2.5        Tier 1
   (DIY)   (indie val)  (challengers)   (us)          (enterprise)
```

### Recommended pricing structure

| Tier | Price | Units | What's included | Who it's for |
|---|---|---|---|---|
| **Starter** | **Free** | ≤10 units | All P0 + P1 features; AI copilot included; tenant-paid screening/ACH fees | DIY landlords (competes with Innago/Avail/TurboTenant free tiers) |
| **Growth** | **$1.00/unit/mo**, $25 min | unlimited | Everything in Starter + **embedded banking, virtual accounts, AI leasing agent, workflow builder** (all P2 + P3) | Independent PMs, 10–500 units (undercuts AppFolio $1.40 + Rentvine $4–5) |
| **Scale** | **$0.75/unit/mo**, $150 min | unlimited | Everything in Growth + white-label, webhooks/API, multi-entity, priority support | PM companies, 500+ units (undercuts Buildium Premier $375 + AppFolio effective cost) |

**Funding levers (why we can price below incumbents):**
1. **Banking interchange** — every debit-card swipe and ACH on a Geiger account generates interchange. This is Baselane's entire free-model; we replicate it.
2. **Tenant-paid transaction fees** on screening + card payments (industry-standard, zero friction).
3. **AI as margin-center, not cost-center** — AI leasing agent + copilot reduce support/ops headcount; the savings fund the AI being free.
4. **No module upsells** — one codebase, one feature set, lower sales complexity.

### The one-line pitch
> *"Everything AppFolio charges extra for — banking, AI, automation — included. Everything Yardi does for enterprise — skipped. Priced like DoorLoop, powerful like Rentvine, free to start like Innago."*

---

## 7. Feature matrix (apps × features)

Legend: **●** = native · **◐** = partial / via partner / add-on · **○** = absent · **★** = signature/standout

See `docs/FEATURE_MATRIX_2026.md` for the full matrix table (separate file for scan-ability).

---

## 8. Sources

**Vendor sites:** appfolio.com · buildium.com · yardibreeze.com · yardi.com · rentmanager.com · propertyware.com · rentvine.com · doorloop.com · rentecdirect.com · tenantcloud.com · innago.com · hemlane.com · rentredi.com · avail.co · stessa.com · baselane.com · turbotenant.com

**Review/comparison (2026):**
- [Investopedia – Best Rental PM Software 2026](https://www.investopedia.com/the-best-rental-property-management-software-11688695)
- [Hemlane – 12 Best PM Software 2026](https://www.hemlane.com/resources/best-landlord-software/)
- [DoorLoop – Best PM Apps 2026](https://www.doorloop.com/blog/best-property-management-apps)
- [Rentec Direct – Best PM Software 2026](https://www.rentecdirect.com/blog/best-property-management-software-2026/)
- [Rent Manager – Key Features 2026](https://www.rentmanager.com/key-features-top-property-management-software-2026/)
- [AppFolio – Top 6 PM Software 2026](https://www.appfolio.com/blog/best-property-management-softwares-compared-2026)
- [Capterra – Rent Manager (190 features)](https://www.capterra.com/p/2732/Rent-Manager/)
- [Re-Leased – AppFolio Alternatives 2026](https://www.re-leased.com/software/appfolio-alternatives-7-top-property-management-solutions-for-2026)

**Regulatory:** [DOJ RealPage settlement (Nov 24, 2025)](https://www.justice.gov/opa/pr/justice-department-requires-realpage-end-sharing-competitively-sensitive-information-and) · [Final Judgment (May 2026)](https://www.federalregister.gov/documents/2026/05/08/2026-09147/united-states-et-al-v-realpage-inc-et-al-response-to-public-comments)
