# Competitive Feature Matrix — Property Management

Research date: 2026-07-03
Scope: US residential rental property management software. Prices USD, directional where quote-based.

Purpose: build a source-backed feature/function inventory for the leading modern
property-management platforms, rank features from common to rare, then choose the
feature set that makes **Geiger Property** relevant at an attractive price. The
selection that falls out of this doc is captured in
[`feature-selection.md`](./feature-selection.md) and realized as the workspace
sidebar (`components/internal/sidebar/sidebar_nav.jsx`).

## Decision Frame

Geiger Property should not try to beat AppFolio and Yardi at enterprise depth on
day one. The strongest initial lane is:

- **Independent landlords and growing property managers** (roughly 1–500 units)
  who are priced out of, or overwhelmed by, the enterprise suites.
- **All the table-stakes features included, not up-tiered** — rent collection,
  screening, applications, maintenance, portals, syndication, lease + eSign.
- **Anti-gating goodwill**: the cheap-to-deliver differentiators (unlimited eSign,
  low/free ACH, built-in CRM, rent reporting, AI listing writer) included rather
  than paywalled — the move disruptors (Rentvine, Innago, Rentec) win deals with.
- **Build toward the un-saturated premium battlegrounds**: native/agentic AI at a
  DIY price point, and embedded fintech (landlord banking + rent-funded rewards) —
  today split across separate tools (only Stessa + Baselane own fintech; only
  AppFolio + Rentvine own agentic AI).

## Competitor Categories

| Category | Platforms | Main Buyer |
| --- | --- | --- |
| Enterprise / large PM | AppFolio | Professional PMCs, 50+ unit minimum |
| Mid-market PM | Rent Manager, Rentvine, Yardi Breeze Premier | PMCs wanting depth / customization |
| Small–mid PM | Buildium, DoorLoop, Yardi Breeze, Rentec Direct | Small PMCs + serious landlords |
| DIY landlord | TurboTenant, RentRedi, Innago, TenantCloud, Avail, Hemlane | Independent landlords, 1–100 units |
| Finance-first / fintech | Stessa, Baselane | Investors, financially-minded landlords |

**Notable 2026 movements:** Rentvine is the fastest-growing SFR platform (#1 in
PropertyManagement.com's 2026 Vendor Index); TurboTenant (~900k landlords, acquired
Azibo + REI Hub) is arguably the #1 DIY tool; DoorLoop raised a $100M Series B at
~100% YoY growth. **Propertyware is declining** (RealPage steering customers to
Buildium) and is profiled for completeness only. Azibo is gone (acquired). Enterprise
multifamily suites (Entrata, RealPage OneSite, MRI, Yardi Voyager) and niche
affordable-housing tools (ResMan) are out of the residential-SMB lane.

## Market Trends Shaping 2026

1. **AI became table stakes** — adoption jumped ~20% → 58% in a year. Agentic AI
   (AppFolio Realm-X Performers, Rentvine voice AI) now automates leasing and
   maintenance triage, and is explicitly used as up-tier bait.
2. **Heavy consolidation** — AppFolio↔LiveEasy/Dynasty, TurboTenant↔Azibo/REI Hub,
   DoorLoop's raise.
3. **RealPage antitrust overhang** — the DOJ judgment against RealPage's
   rent-pricing algorithms is a reputational drag on the RealPage family
   (Buildium, Propertyware).
4. **Pricing is bifurcating** — per-unit + monthly minimums (pro) vs. free +
   monetize-transactions (DIY). Embedded fintech (banking APY, rent reporting) is
   the new small-landlord battleground.

## App-by-App Profiles (pricing + features)

### Professional / PM-company tier

**AppFolio** — Category leader (~12.6% share), professional PMCs only, **50-unit
minimum**. Per-unit + minimum, quote-based: Core ~$1.40–1.49/unit (~$280/mo min),
Plus ~$3.00–3.20/unit (~$900–1,500/mo min), Max ~$5/unit (~$7,500/mo min). Full GL
+ trust accounting, AP automation with AI smart-bill entry, CAM, best-rated mobile
apps, FolioSpace resident platform, **Smart Maintenance** 24/7 AI+human contact
center. **AI is best-in-class: Realm-X** Assistant/Messages/Flows + agentic
**Performers** (Leasing, Maintenance, Resident Messenger). AI + API gated to Plus/Max.

**Buildium (RealPage)** — Small-to-mid PMCs + serious landlords, ~20–5,000 units,
no unit minimum, self-serve. Flat tiers: Essential $62/mo, Growth $192/mo, Premium
$400/mo. Full GL, AP/AR, trust accounting + auto reconciliation, 1099 e-file,
budgeting; e-lease; Zillow/Apartments.com syndication; resident + owner portals;
**Lumina AI** (AI Bill Scan is Premium-only). Open API gated to Premium.

**Yardi Breeze / Premier** — 1–5,000 units, **broadest property-type support**
(residential, commercial/CAM, affordable, HOA, self-storage, manufactured). Per-unit
+ min: Breeze Residential $1/unit ($100 min); Premier Residential $2/unit ($400 min).
**Free tenant ACH** (Yardi eliminated ACH fees). Free RentCafe marketing site +
syndication + resident portal + app. Closed ecosystem (no open API). AI modest.

**Rent Manager (LCS)** — Professional PMCs, ~10 to 100,000+ units, deep
customization + mixed portfolios. Per-unit bundles, quote-based: Basic $1, Plus
$1.50, Premium $2.25/unit. **Deepest accounting engine** (simultaneous cash+accrual
GL, job costing, 450+ reports); **built-in VoIP phone system (rmVoIP)**; unlimited
custom fields; **open API** + 100s of integrations; **Orion AI**. Flexible Rent
installments.

**Rentvine** — Professional PMCs (SFR), floor ~80–100 units; the top destination for
firms leaving Propertyware. **Single all-inclusive plan — $2.50/unit/mo, $199/mo
min, no feature paywalls.** Flagship **GAAP-compliant audit-ready trust accounting**;
**four portals free** (owner, tenant, vendor, applicant); **truly open REST API +
native Zapier**; **heaviest AI** (voice AI, AI rent optimization, AI screening, AI
accounting); industry-first MCP integration.

**Propertyware (RealPage) — declining** — SFR PMCs, 250–5,000+ doors. Per-unit +
min + implementation: Basic $1/unit ($250 min) through Premium $2/unit. Open API is
a +$1/unit/mo add-on. **AI: essentially none — the laggard.**

### DIY-landlord & mid-market tier

**DoorLoop** — ~20–500 units, landlords + PMCs, 100+ countries. Base covers first 20
units + overage: Starter $69/mo, Pro $149/mo, Premium $209/mo. Full double-entry GL
all tiers; RapidRent; **built-in CRM all tiers** (differentiator); QBO sync; open API
+ Zapier + free ACH on Premium; AI Assistant + unlimited AI inspections add-on.

**TenantCloud** — DIY + small portfolios (budget), lease-count caps (~10/30/60):
Starter $15/mo, Growth $29/mo, Pro $50/mo. Income/expense, QBO sync, screening,
work orders, applications + eSign, listing site + syndication + **AI listing
generation**. **No true trust accounting** (the pro gap).

**Rentec Direct** — Rentec Pro (DIY) / Rentec PM (trust accounting). ~25–2,500 units,
value-focused. Slider by units: Pro from $55/mo, PM from $65/mo. **Free incoming
ACH**; **screening $10–18 — cheapest in class**; huge free syndication network; **free
AI listing generator**; **free unlimited US-based phone support** (top reason to
choose). UI dated, light on AI.

**Hemlane** — Remote/long-distance DIY landlords, 1–50 units; **hybrid software +
service**. $28/mo base + per-unit: Free / Basic $2/unit / Essential $20/unit /
Complete $58/unit. **Free ACH.** Unique = **human service layer** (24/7 emergency
maintenance coordination, local licensed leasing-agent network) no competitor offers.
No full GL / trust accounting; **tenant app only** (top complaint).

### DIY-landlord / fintech tier

**RentRedi** — DIY small-to-mid; **all plans = unlimited units/tenants/teammates**
(flat fee): Start $5/mo, Grow $12/mo, Pro custom. Best-in-class mobile app; ACH/card/
cash; TransUnion screening; syndication; accounting via REI Hub; **rent reporting to
all 3 bureaus $5.99/mo**. Screening/leasing gated out of $5 Start.

**Avail (Realtor.com) — legacy DIY** — 1–10 units: Unlimited Free / Plus $9/unit/mo.
Syndication to 12–19+ sites + **Rent Analysis comps report**; state-specific
lawyer-reviewed leases + free eSign; FastPay next-day (Plus); CreditBoost rent
reporting. No AI.

**Innago** — Small-to-mid DIY + small PMs, 1–100+ units. **100% free** (revenue from
tenant fees + referrals). ACH/card (card 2.99% — among lowest); TransUnion screening;
syndication; **unlimited free eSign**; work orders; tenant + landlord apps. Highest-
rated free platform (G2 4.9). **Everything's in the free plan.**

**Stessa (Roofstock)** — **Rental investors first**. Essentials Free / Manage $12/mo /
Pro $28/mo. **Flagship accounting** (auto bank feeds, 120+ Schedule-E categories, P&L,
tax package); **Stessa Cash Management banking — up to 1.88% APY free / 3.24% Pro**;
listings + Zillow syndication; 60+ legal docs + DocuSign. No PM-style work-order system.

**TurboTenant** — DIY landlords 1–100 units, ~900k landlords. **Free forever** /
Premium ~$149/yr. Broadest syndication + lead CRM + **AI-generated listings**; 50+
lawyer-reviewed state leases; **AI Maintenance assistant** (triages with tenants) +
Lula vendor coordination; REI Hub accounting; rent reporting; eviction assistance.

**Baselane** — Financially-minded DIY, 1–25+ units; "financial OS." Core Free / Smart
$20/mo. **Flagship landlord banking** (FDIC checking+savings, unlimited property
sub-accounts, **tiered ~1.95–4.19% APY + 0.35% bonus**, cash-back debit, deposit
sub-accounts); strong free bookkeeping; TransUnion screening; Rocket Lawyer leases;
Obie insurance + **rental loan marketplace**. **No listing syndication** (notable gap);
**AI auto-tag bookkeeping** on Smart.

## Feature Rarity Ranking

Counts = number of the 16 profiled platforms offering the feature (in any tier).
Rarity: **Universal ≥13 (80%+)** · **Common 8–12 (50–80%)** · **Uncommon 4–7
(20–50%)** · **Rare/Differentiator ≤3 (<20%)**.

### Universal / Very Common (≥80% — table stakes)
Online rent collection (ACH) 16/16 · card rent payments 16/16 · tenant screening
16/16 · online applications 16/16 · maintenance requests 16/16 · tenant portal
16/16 · listing + ILS syndication 15/16 (only Baselane lacks) · lease + eSign 15/16 ·
income/expense tracking 16/16 · mobile app 15/16 (Hemlane tenant-only) · automated
late fees/autopay 16/16 · in-app messaging 16/16 · document storage 15/16.
> **Table stakes. Missing any is disqualifying — reviewers penalize absence.**

### Common (50–80%)
Full double-entry GL 10/16 · owner portal/statements 10/16 · QuickBooks sync 8/16 ·
SMS/two-way texting 11/16 · 1099 e-filing 10/16 · vendor management 10/16 · property
inspections 9/16 · rent reporting to bureaus 9/16 · renters insurance 12/16 · cash
payment network 8/16 · bank reconciliation 9/16 · lead tracking/CRM 8/16 ·
AI-generated listings 8/16.
> **Expected by serious operators. Strong MVP-plus territory.**

### Uncommon (20–50%)
True trust accounting (3-way recon) 6/16 — **the pro moat** · free tenant ACH 6/16 ·
open API 6/16 · analytics/BI + benchmarking 6/16 · native/agentic AI 6/16 · Zapier
4/16 · commercial/CAM 6/16 · corporate accounting/job costing/budgeting 6/16 · custom
report writer/custom fields 7/16 · marketing website builder 8/16 · affordable-housing
compliance 5/16 · landlord banking / high-APY 2–4/16 · income/employment verification
6/16.
> **The differentiators. Selectively adopting these defines the product.**

### Rare / Differentiator (<20%)
Built-in VoIP phone system (Rent Manager) · 24/7 human emergency maintenance
coordination (Hemlane; AppFolio add-on) · local licensed leasing-agent network
(Hemlane) · landlord banking with tiered APY + rent bonus (Baselane, Stessa) ·
**agentic AI Performers** (AppFolio; Rentvine close) · AI accounting reconciliation /
bill scan (AppFolio, Buildium Premium, Rentvine) · rent-price optimization ML
(Rentvine, AppFolio Max) · AI screening risk scoring (Rentvine) · flexible/installment
rent (Rent Manager) · deposit alternatives / Obligo (AppFolio) · cost-segregation /
balance sheets (Baselane, Stessa) · rental-loan marketplace (Baselane) · rent
comparables report (Avail, Rentvine) · video inspections (Rent Manager) · free
unlimited US phone support (Rentec) · eviction protection product (TurboTenant,
RentRedi, Hemlane, Avail) · MCP / open-agent integration (Rentvine, industry-first).

## Pricing vs. Features — the upsell ladder

Across every tiered platform, features climb this ladder as price rises:
**transactions → analytics → automation/AI → API/CSM.**

1. **Cheapest lever — per-transaction fees (the free-tier "tax").** Free/low tiers
   monetize via ACH fees, card %, screening, per-lease and per-eSign charges. The
   clearest gate is **waived ACH** (DoorLoop Premium, Avail/TurboTenant/Baselane
   paid). Innago and TurboTenant's free tiers are ~100% transaction-funded.
2. **Mid-tier gates — operational depth & insight.** Unlimited eSign + state-specific
   leases, analytics/BI dashboards, inspections, bank reconciliation, 1099, QBO sync,
   syndication + marketing websites.
3. **Top-tier gates — scale & extensibility.** Open/database API (the single most
   consistent premium gate), native/agentic AI (AppFolio Realm-X = Plus/Max only;
   Buildium AI Bill Scan = Premium), corporate accounting/job costing/CAM/affordable
   compliance, leasing CRM + pricing optimization, dedicated CSM.

**Features that command a premium (ranked):** open/database API · agentic/native AI ·
audit-ready trust accounting · analytics/BI + benchmarking · corporate accounting/job
costing · specialty compliance (affordable/commercial) · dedicated CSM · waived ACH /
faster payouts · unlimited eSign + state leases.

**Counter-positioning that wins deals:** all-inclusive single-plan pricing (Rentvine),
free-funded-by-transactions (Innago), free ACH (Rentec, Yardi), flat unlimited-unit
pricing (RentRedi).

## Implications for Geiger Property

- **Must-have (disqualifying if absent):** ACH + card rent, screening, applications,
  maintenance requests, tenant portal, syndication, lease + eSign, basic accounting,
  mobile app.
- **Cheap differentiators to include free (anti-gating goodwill):** unlimited eSign,
  free/low ACH, built-in CRM, rent reporting, AI listing generation.
- **Premium features to build toward:** native/agentic AI (leasing + maintenance
  triage + AI bookkeeping), audit-ready trust accounting (for the PM tier), open API +
  Zapier, analytics/benchmarking, embedded fintech (banking APY + rent-funded rewards).
- **White-space worth considering:** human maintenance-coordination service layer
  (Hemlane's model), agentic AI at DIY price points (nobody combines AppFolio-grade AI
  with sub-$30/mo pricing), and financial-OS + full-PM convergence (banking + trust
  accounting + AI in one tool) — currently split across separate products.

---

*Data quality: AppFolio and Rent Manager pricing is quote-based (published figures
directional); Buildium raised list prices in 2025–26; APY figures float with Fed
rates; TurboTenant paid-tier naming varies across 2026 listings (~$149/yr Premium is
the anchor); Avail Plus is $9/unit on the current official page (older sources say $7).
Propertyware is included for completeness but is a declining/at-risk platform in 2026.*
