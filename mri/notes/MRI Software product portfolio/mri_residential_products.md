# MRI Software residential, multifamily, affordable, public housing and small-landlord products (as of Nov 2026)

Research date: 2026-11-03. This builds on `Geiger vs MRI PMX fact check/mri_accounting_commercial.md`, which covers PMX accounting and commercial, and on `Property management software features/enterprise_platforms.md`, which covers AppFolio, Yardi, Entrata, RealPage and ResMan. Neither file covered MRI's residential lines.

**How to read the sources**
- Most evidence is MRI first-party material: product pages, press releases and the undated functional specification at https://www.mrisoftware.com/mrifunctionalspecs/. Treat it as vendor claims.
- "(snippet)" marks facts taken from search-result text rather than a fetched page.
- **Naming has changed several times:**
  - **"MRI Living"** was MRI's residential umbrella brand from about 2020 to 2025.
  - **"MRI Engage"** is the 2024–2026 name for the multifamily front office.
  - **"PMX Residential Management"** is the back office.
- MRI's own pages still mix these names.

---

## Q0. Portfolio inventory: every MRI residential product found (status Nov 2026)

### Takeaway
MRI has no single residential product. It runs a family of mostly acquired, region-specific products:
- **US multifamily:** PMX Residential Management (back office) plus the MRI Engage front-office suite.
- **US affordable housing:** MRI Affordable Housing; the legacy Bostonpost is still listed.
- **US public housing:** MRI PHA Pro, with legacy Tenmast, HAB, Lindsey and HAPPY lines.
- **US condo/HOA:** CondoPlus and Jenark.
- **Australia/New Zealand agency property management:** Property Tree, Palace and the legacy Rest Professional; Strata Master for strata; Proptech Labs/Bricks+Agent add-ons.
- **UK/Ireland:** Qube Property Management for block management and BTR, MRI Sales and Lettings / Agency Solutions, and the Engage portal.
- **South Africa:** TPN, a tenant credit bureau.
- **Lease-adjacent services:** RentPayment, CheckpointID, screening, insurance and Insurent.

MRI does **not** own Rentec Direct.

### Cited Findings

**Inventory table.** Each row is sourced in the detailed sections below.

| Product | Segment / region | Origin (year) | Status |
|---|---|---|---|
| PMX Residential Management (also "Residential Management", "Version X") | US/Canada multifamily, SFR; UK/IE BTR; international | In-house MRI core platform | Current |
| MRI Engage (Engage CRM 2024; "Engage for Living" suite Oct 2025) | US multifamily front office, also sold to Yardi Voyager clients | Built in-house on acquired parts | Current; replaces "MRI Living" branding |
| Prospect Connect / Resident Connect / Online Renewals / Market Connect / Callmax | US multifamily portals, websites, call center | Mixed (Callmax acquired 2016; VaultWare 2011) | Still in functional spec; being superseded by Engage (inference) |
| Access 24/7; HappyCo Inspections integration | US multifamily | — | **Legacy, existing clients only** |
| RentPayment | US rent payments, incl. HOA dues | Acquired from Priority Technology (2020) | Current |
| CheckpointID; ResidentCheck screening; Income/ID verification | US screening and fraud | Acquired (2020; 2017) | Current |
| Multifamily Insurance Partners; Insurent | US renters insurance; lease guaranty | Acquired (2019; 2024) | Current |
| ApartmentData.com | US multifamily market data | Acquired (2022) | Current |
| MRI Affordable Housing | US HUD/LIHTC/HOME/USDA compliance | In-house module on Residential Management | Current |
| Bostonpost Property Manager | US affordable, SaaS | Acquired (2011) | Still listed; legacy (inference) |
| MRI PHA Pro | US public housing authorities, HCV | Launched May 2024 on acquired PHA lines | Current flagship |
| Tenmast (WinTen2+ etc.), HAB, Lindsey, HAPPY / Assistance Connect | US PHAs | Acquired 2017–2020 | Legacy lines (status unclear) |
| CondoPlus; Jenark | US/Canada condo, co-op, HOA | CondoPlus origin unknown; Jenark acquired from CoreLogic (2020) | Current |
| DHCR module | New York rent-stabilised units | In-house | Current |
| MRI Property Tree | AU cloud agency property management and trust accounting | Acquired with Rockend (2019) | Current flagship (AU) |
| MRI Rest Professional | AU/NZ desktop trust accounting | Acquired with Rockend (2019) | **Legacy, supported while customers remain** |
| MRI Strata Master | AU/NZ strata / body corporate | Acquired with Rockend (2019) | Current |
| MRI Palace | NZ (and AU) agency property management | Acquired (Mar 2021) | Current flagship (NZ) |
| Proptech Labs: Bricks+Agent, Inspection Manager, Invoice Automate, Key Automate, reHeroes "Alex" | AU/NZ maintenance, inspections, keys, AI tenant chatbot | Acquired (Oct 2025) | Being folded into Property Tree and Palace |
| VaultRE / VaultEA / EagleCRM / RentFind Inspector, etc. | AU/NZ agency CRM and inspections | Acquired with PropTech Group (Feb 2023) | Current |
| Qube Property Management ("MRI Qube PM"), Qube Living | UK/IE block management, BTR | Acquired with Qube Global Software (2017) | Current |
| MRI Sales and Lettings / MRI Agency Solutions (Thesaurus, CML) | UK/IE/ZA estate and lettings agencies | Acquired (2018) | Current |
| Engage resident portal (UK) | UK BTR and block management resident portal | Acquired with Engage Property Technology (2019) | Current |
| Castleton, Orchard, Housing Partners, Capita One | UK social housing and local authorities | Acquired (2020–2024) | Current (out of core scope) |
| TPN Group | South Africa tenant credit bureau | Acquired (Oct 2022) | Current |

**MRI-wide scale (vendor claims)**
- 45,000+ clients, 16.5m units, 5.5m leases, 400+ partners, 170+ countries — [MRI residential hub](https://mrisoftware.com/residential)
- "88%+" of NMHC Top 50 managers use MRI solutions — [MRI multifamily page (mrisoftware.com/living redirects here)](https://mrisoftware.com/living/)
- PMX clients manage more than 1 million residential units worldwide — [Elite Agent, 8 May 2024](https://eliteagent.com/mri-software-announces-next-generation-property-management-tech/)
- The residential hub says MRI tools are "Built to work together, separately, or alongside your existing tech" and work "with subsidy programs from HUD, USDA, Tax Credits, HOME, and Public Housing" — [MRI residential hub](https://mrisoftware.com/residential)
- The residential hub lists sectors: Multifamily, Affordable Housing, Public Housing, Condo/HOA, Single Family Rental. **Student, senior and military are not listed** — [MRI residential hub](https://mrisoftware.com/residential)

**Acquisition count**
- An M&A advisory summary counts 45 MRI software acquisitions from 2015 to 2025, including about 15 residential and agency deals and six US public and affordable housing businesses (2017–2020), with no divestments — [Aventis Advisors](https://aventis-advisors.com/mri-software-acquisitions/) (secondary source)

### Inferences
- MRI's residential strategy is a buy-and-integrate roll-up. Most products keep their acquired code bases under MRI names. The only clearly in-house residential products are PMX Residential Management, MRI Affordable Housing (a module on it) and the Engage front office (assembled 2024–2025).
- The products that matter for an SMB/mid-market PM app are Property Tree and Palace, which publish SMB pricing, plus RentPayment. The US enterprise stack (PMX + Engage) is sold to mid-to-large operators.

### Gaps
- No MRI page gives a definitive A–Z list of current versus sunset residential products. The functional spec is undated, last seen uploaded in 2023.

---

## Q1. US market-rate multifamily: PMX Residential Management + MRI Engage. Which pieces are native, and which come through partners?

### Takeaway
- **Back office.** The US multifamily stack is **PMX Residential Management**, MRI's long-running "Version X" platform. It covers resident records, billing, leases, legal tracking, lockbox, renewals and maintenance, with PMX Financials for accounting.
- **Front office.** It is **MRI Engage**, a 2024–2025 rebuild of the former "MRI Living" front office:
  - Engage CRM, launched 18 Jun 2024
  - Engage for Living suite, launched 21 Oct 2025, adding portals, embedded payments, e-sign, fraud/risk and AI suggested replies
  - An AI voice leasing agent
- **Native or acquired:** Screening, ID verification (CheckpointID), payments (RentPayment), renters insurance and lease guaranty (Insurent), and market data (ApartmentData) are all MRI-owned, mostly through acquisition.
- **Not found native:** No MRI-native **revenue management** or **utility billing** product was found. Both appear to be partner-supplied, unconfirmed.
- **Yardi clients too:** Engage is explicitly sold to **Yardi Voyager** clients as well as PMX clients.

### Cited Findings

**PMX Residential Management (back office)**
- **Functional spec entries:**
  - "Residential Management" covers resident records, billing, leases, legal tracking and reporting.
  - French statements and Canadian rent-control support require the **Canada Regional Pack**.
  - "RM Lockbox" processes lockbox payments across properties and excludes residents with legal actions.
  - "DHCR" supports New York rent-controlled units.
  - Source: [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **Engage page:** PMX is the back office, "Accounting, operations and the ledger the front office writes to" — [MRI multifamily page](https://mrisoftware.com/living/)
- **US webinars** show "MRI Residential Management – Version X" alongside the Multifamily Connect Suite and CondoPlus — [MRI webinar](https://mrisoftware.com/resources/demo-residential-management) (snippet, from the prior PMX notes)
- **X.5.8 release notes:** Residential Management (International clients) gained "greater flexibility when adding or editing step ups to both renewal and prospect leases" — [MRI X.5 release notes](https://info.mrisoftware.com/x5-release-us) (from the prior PMX notes)
- **Maintenance.** Third-party listings say Residential Management handles work orders, inspections, make-ready and metered utilities. TrustRadius lists no mobile app — [TrustRadius](https://www.trustradius.com/products/mri-residential-management); [SoftwareConnect](https://softwareconnect.com/reviews/mri-residential-management) (snippets; third party)
- **SFR.** MRI pitches PMX to single-family rental operators for "both scattered homes and build to rent communities", with reporting "down to the individual home". No portfolio-size threshold and no small-landlord tier are given — [MRI SFR page](https://www.mrisoftware.com/single-family-property-management-software/)

**MRI Engage (front office): modules**
- **Modules by stage:**
  - **Attract & Convert:** ILS Syndication, Multifamily CRM, Call Answering & Resident Communication
  - **Qualify & Approve:** Leasing & Resident Portal, Fraud & Resident Screening, ID Verification, Income Verification
  - **Transact & Retain:** Document eSignatures, Rent Payments, Managed Renters Insurance
  - **Engage Deal Flow:** centralises the pipeline into PMX
  - Source: [MRI Engage](https://www.mrisoftware.com/multifamily/engage/)
- **Single resident record:** "Nothing is exported or re-keyed between products." The page says MRI Living was the earlier name, and that customers can "Buy the full suite or start with one capability" — [MRI Engage](https://www.mrisoftware.com/multifamily/engage/)
- **Vendor-claimed outcomes:** 60% faster application completion, up to 40% fewer missed tasks, 90% less time on paystubs — [MRI Engage](https://www.mrisoftware.com/multifamily/engage/)

**MRI Engage: launches**
- **Engage CRM:** launched 18 Jun 2024 as "an integrated CRM and communications tool". It "works with a variety of property management systems, including MRI and Yardi" — [MRI news, Jun 2024](https://www.mrisoftware.com/news/unified-multifamily-crm-communications-accelerate-leasing-retention) (snippet); [Mann Report, 18 Jun 2024](https://www.mannpublications.com/mannreport/2024/06/18/mri-software-introduces-unified-multifamily-crm-and-communications-tool/) (snippet)
- **Engage for Living (21 Oct 2025):**
  - Adds integrated resident and leasing portals, embedded payments, fraud and risk management, and e-signatures
  - AI "suggests replies based on the intent of each message", which staff can personalise or let the AI send automatically
  - Available for **PMX Residential Management and Yardi Voyager** clients, plus the MRI Partner Connect ecosystem and "leading rent payment providers" (unnamed)
  - Source: [Mann Report, 21 Oct 2025](https://www.mannpublications.com/mannreport/2025/10/21/mri-software-delivers-all-in-one-multifamily-engagement-suite/); [MRI news](https://www.mrisoftware.com/news/mri-software-delivers-all-in-one-multifamily-engagement-suite/)
- **Engage CRM page:**
  - "An AI leasing agent that answers, logs, and escalates calls 24/7"
  - Guest cards are "synced with PMX Residential in real time"
  - Implementation typically takes **60–90 days**
  - No pricing is listed
  - Source: [MRI Multifamily CRM](https://www.mrisoftware.com/multifamily/multifamily-crm/)
- **Resident app:** an app named "MRI Engage Resident Portal" is listed in the app stores — [AppGoblin listing](https://appgoblin.info/apps/6742867393) (snippet)

**Older and legacy front-office modules (functional spec)**
- **Prospect Connect:** applicant portal, rental application and lease generation; requires Residential Management 10.1.2+
- **Resident Connect:** statements, payments and service requests
- **Online Renewals:** resident renewal signing via **DocuSign**, a partner
- **Lead Management:** two-way texting; works with various property management systems
- **Market Connect:** Pricing & Availability 1.0 is US-only; 2.0 covers US, UK and Australia. Also property websites, PinPoint maps and Leasing Tablet.
- **Callmax:** call tracking, answering, package tracking and web chat
- **Legacy, existing clients only:** "Access 24/7" (applications, payments, maintenance requests) and "HappyCo Inspections" (a partner integration)
- Source: [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)

**Acquired components (US multifamily)**
- **ResidentCheck** (Dallas, screening), acquired Feb 2017 and folded into the Multifamily Connect Suite. Its collections business was excluded — [MRI release](https://mrisoftware.com/hk/?p=23327)
- **CheckpointID** (Carrollton, TX), ID verification and fraud prevention, acquired 13 Oct 2020 — [MRI release](https://www.mrisoftware.com/news/mri-software-acquires-checkpointid-adding-id-verification-and-fraud-prevention-to-multifamily-offering/)
- **RentPayment**, acquired from Priority Technology Holdings in Sept 2020 — [Mann Report, 10 Sep 2020](https://www.mannpublications.com/mannreport/2020/09/10/mri-software-acquires-rentpayment-from-priority-technology-holdings-inc/)
  - **Functional spec:** a PMC portal, AutoPay, one-time and recurring payments, cash and in-person payments, check scanning, SMS/email reminders, IVR and phone payments, and renters-insurance sign-up — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **Multifamily Insurance Partners** (Ohio), renters insurance, acquired Nov 2019 — [Insurance Journal, 22 Nov 2019](https://www.insurancejournal.com/news/midwest/2019/11/22/549233.htm) (snippet)
- **Insurent** (NYC lease guaranty), acquired Jun 2024, to be folded into "MRI Living". It has guaranteed more than $1B in rent exposure and is accepted at 9,000+ buildings — [MRI release](https://www.mrisoftware.com/news/mri-software-acquires-insurent-guarantor-insurance-services/) (snippet)
  - One headline calls it a "$1B" acquisition, which conflates rent exposure with price. Terms were undisclosed — [Techleap](https://finder.techleap.nl/news/feed/mri-software-acquires-insurent-for-1b)
- **ApartmentData.com** (Houston, multifamily market data), acquired Aug 2022 to expand "MRI Living" — [PR Newswire](https://prnewswire.com/news-releases/mri-software-acquires-apartmentdatacom-houston-based-provider-of-market-research-and-data-solutions-for-multifamily-properties-301599899.html) (snippet)
- **Callmax**, acquired in 2016 — [Aventis Advisors](https://aventis-advisors.com/mri-software-acquisitions/)
- **VaultWare**, an online leasing tool, acquired Dec 2011 — [MRI blog](https://www.mrisoftware.com/blog/mri-software-announces-acquisition-of-vaultware/) (snippet)
- **Dynamic Lead Solutions** (multifamily CRM): an MRI release title confirms the acquisition. Date not retrieved — [MRI release](https://www.mrisoftware.com/za/?p=24140) (title only)
- **LeaseHawk** (AI leasing / CRM): one aggregator says it was acquired by MRI in Aug 2021. No MRI release was found, so this is **UNVERIFIED** — [highperformr.ai](https://www.highperformr.ai/company/leasehawk)
- **"Rental History Reports and Trusted Employees"** (screening data): a HousingWire headline says MRI acquired both. Date not retrieved — [HousingWire](https://develop.housingwire.com/articles/47911-mri-software-acquires-rental-history-reports-and-trusted-employees) (title only)

### Inferences
**Native or MRI-owned vs partner, by function:**
- **CRM / lead management:** native (Engage CRM; heritage in Dynamic Lead Solutions and possibly LeaseHawk)
- **Call center:** native (Callmax, AI voice agent)
- **Applications / portal / app:** native (Engage portal, Prospect/Resident Connect)
- **Screening, ID and income verification:** owned (ResidentCheck, CheckpointID; income verification vendor unknown)
- **Payments:** owned (RentPayment); Engage also works with third-party payment providers
- **Renters insurance and lease guaranty:** owned
- **ILS syndication and market data:** owned
- **Accounting and ledger:** native (PMX)
- **Renewals:** native, with **DocuSign** as the e-sign partner for Online Renewals; Engage now has its own "Document eSignatures"
- **Inspections:** historically via a **HappyCo** partner integration (legacy)
- **Revenue management and utility billing:** no MRI product found; presumably partners via MRI Partner Connect (unconfirmed)

**Strategic signals**
- Selling Engage to Yardi Voyager clients means MRI now competes for front-office spend independently of the PMS.
- The 60–90-day implementation and NMHC Top-50 positioning indicate mid-to-large operators, not small landlords.

### Gaps
- No MRI-native revenue management (pricing optimisation) or utility billing/RUBS product was found. The relevant partners were not identified.
- No published pricing exists for PMX Residential or any Engage module.
- The income-verification vendor, the e-sign engine behind Engage "Document eSignatures", and the maintenance/work-order module name in PMX Residential were not confirmed.
- The LeaseHawk ownership claim is unverified.

---

## Q2. Affordable housing and compliance (HUD, LIHTC, Section 8, TRACS)

### Takeaway
**MRI Affordable Housing** is a compliance module on top of PMX Residential Management. It covers:
- HUD Multifamily (Section 8 project-based, with TRACS HAP transmission)
- LIHTC, HOME and USDA RD (MINC)
- Subsidy and HAP accounting, waitlists, certifications, applicant/resident portals and screening

It requires the Residential Management, GL, AP, Virtual Site and Affordable Housing modules. **Bostonpost Property Manager**, acquired in 2011 as an affordable SaaS product, is still listed as a separate product. MRI claims 500+ affordable owners and operators.

### Cited Findings
- **Affordable Housing (functional spec):**
  - Occupancy and compliance for HUD Multi-family, LIHTC, HOME and USDA RD
  - Subsidy accounting, including HAP reconciliation and payment posting
  - Transmits HAP files to **TRACS**, LIHTC files to state sites, and USDA files to **MINC**
  - **Requires** Residential Management, General Ledger, Accounts Payable, Virtual Site and Affordable Housing modules
  - Source: [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **Bostonpost Property Manager (functional spec):**
  - Affordable occupancy and compliance, subsidy and tenant accounting
  - "Over 300 standard reports"
  - Move-in, recertification and eviction processing
  - TRACS, LIHTC, USDA and PIC submissions
  - Companion Bostonpost Work Order Management and Document Attachment modules
  - Source: [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **Bostonpost acquisition:** MRI acquired Bostonpost Technology (Bedford, NH), a "SaaS provider of affordable housing property management software", on 1 Oct 2011 — [Mergr](https://mergr.com/transaction/mri-software-acquires-bostonpost-technology) (snippet)
- **Current product page:**
  - Programs: "HUD Multi-Family, Tax Credit, HOME, and USDA Rural Development"
  - Features:
    - Compliance reporting for mixed portfolios
    - Voucher lifecycle with TRACS submissions
    - Waitlist management
    - Accounting
    - Applicant/resident portals for certifications and recerts
    - Text/email/phone recert reminders
    - Screening that is "AI-powered, human-supported"
    - Asset management tied to Investment Central
  - Stats: 500+ affordable owners/operators, 1m+ families housed, 70k average monthly online applications (affordable plus public)
  - No pricing
  - Source: [MRI Affordable Housing](https://www.mrisoftware.com/products/affordable-housing-compliance-software/)
- **Tenmast heritage:** Tenmast's WinTen2+ was "a fully integrated property management system that complies with HUD, USDA, and Tax Credit regulations" — [SoftwareReviews](https://www.softwarereviews.com/products/tenmast-winten2) (snippet). MRI's Oct 2017 Tenmast release cited "Multifamily and Affordable Housing" as well as public housing — [MRI release mirror](https://www.mrisoftware.com/za/?p=23319) (snippet)
- **Services:** MRI also offers fee accounting, asset management, subordinate-loan administration and transaction consulting to affordable owners — [MRI Affordable Housing](https://www.mrisoftware.com/products/affordable-housing-compliance-software/)

### Inferences
- MRI Affordable Housing targets large, mixed-subsidy portfolios that already run PMX. Its module prerequisites make it an enterprise purchase, unlike ResMan or AppFolio affordable tiers (see the enterprise_platforms notes).
- Bostonpost appears to be a legacy SaaS line kept for existing clients. No current marketing was found.

### Gaps
- The product page does not name RAD, MOR/audit tooling, the TIC, iMAX or 50059 by those names.
- There is no pricing.
- No migration plan from Bostonpost to PMX Affordable was found.

---

## Q3. Public housing authorities: Tenmast, PHA Pro, HCV / Section 8 voucher administration

### Takeaway
MRI built the US public housing software leader by acquisition:
- **Tenmast** (Oct 2017; Lexington, KY; PHAs in 44 states)
- **HAB** (Oct 2017; about 200–210 PHAs)
- **HAPPY Software** (HCV / project-based / FSS portals; 2017 or 2018, dates conflict)
- **Lindsey Software** (Jan 2020; 700+ PHAs)

In **May 2024** MRI launched **MRI PHA Pro** as its "flagship public housing and voucher management compliance solution". It was first available to **Housing Pro** clients; other legacy clients were told to contact account managers. MRI claims 1,260+ (page) or 1,600+ (May 2024 release) public housing clients.

### Cited Findings

**Acquisitions**
- **Tenmast:** acquired Oct 2017. A "leading provider of public housing authority (PHA) and private affordable housing management software", Lexington, KY, serving PHAs in 44 states including Guam and Saipan. It was MRI's "entry into public housing" — [Software Equity Group](https://softwareequity.com/transactions/tenmast-acquired-by-mri-software); [MRI release mirror](https://www.mrisoftware.com/za/?p=23319) (snippet). It had served public housing since 1985 (snippet, same search).
- **HAB, Inc.:** acquired Oct 2017; "software and services to over 200 public housing authorities". MRI planned to combine "the best of MRI, HAB and Tenmast" on a web-enabled platform — [MRI release](https://www.mrisoftware.com/uk/news/mri-software-acquires-hab-inc-provider-housing-management-software-public-housing-authorities) (snippet)
- **HAPPY Software:** software for "HCV, Project-based, and Family Self Sufficiency programs"; its portal products were to be extended to MRI's PHA clients.
  - **Date conflict:** SEG dates it 8 Mar 2017; CB Insights says 8 Mar 2018.
  - Sources: [SEG](https://softwareequity.com/?p=16651); [CB Insights](https://www.cbinsights.com/company/happy-software) (snippets)
- **Lindsey Software:** Little Rock, AR, est. 1959, used by 700+ PHAs, acquired 8 Jan 2020 — [MRI release](https://www.mrisoftware.com/news/mri-software-acquires-lindsey-software-public-housing-solutions/); [Mann Report, Jan 2020](https://www.mannpublications.com/mannreport/2020/01/16/mri-software-acquires-lindsey-software/) (snippets)

**PHA Pro launch (29 May 2024)**
- Described as "flagship public housing and voucher management compliance solution", developed with HUD experts for NSPIRE and HIP
- **Features:**
  - Mobile-friendly portals for applicants, tenants and owners
  - Work-order automation and mobile NSPIRE inspections
  - Tenant and program management for HUD programs including HOTMA, MTW and state programs
  - 70+ pre-filled forms, 30+ one-click reports and a report generator
  - Automated archiving
- **Integrations:** "MRI Living" products, namely accounting, affordable, online rent collection (RentPayment), automated answering (Callmax), managed accounting and screening
- **Availability:** "available now for Housing Pro clients"
- **Scale:** MRI said it serves "over 1,600 public housing agencies"
- Source: [MRI release](https://mrisoftware.com/news/mri-software-unveils-pha-pro-integrated-public-housing-voucher-management-compliance)

**PHA Pro modules (functional spec)**
- **Occupancy:** households, verifications, rent calcs, **50058 error checking**
- **Payments:** HAP checks
- **Waiting List:** multiple concurrent lists
- **Inspections / HQS Mobile Inspections:** iPad, sync on Wi-Fi
- **Tenant AR**
- **iFile:** PIC uploads
- **iDIA:** imaging
- **Direct Deposit**
- **Custom Forms and Report Writer**
- Source: [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)

**Tenmast modules (functional spec)**
- **Section 8 Tenant & Landlord:** monthly HAP payments; VMS reporting only in WinTen2/WinTen2+
- **Tenant AR**
- **Applicant Access / Applicant List**
- **FSS:** escrow
- **Rent Reasonableness**
- **Transnet:** HUD/USDA submissions
- **Landlord Access**
- **1099 Processing**
- **Tenmast GL:** inter-fund balancing (cited in the prior PMX notes)
- Source: [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)

**Current public housing page**
- Covers 30+ HUD programs, full voucher lifecycle with HUD-50058, waitlists, portals, communications, and screening via The Work Number and "AI-powered, human-supported" services
- **Stats:** 1,260+ public housing clients, 1m+ public housing units, 3m+ subsidized units
- **Case study:** Tarrant County Housing Assistance Office went paperless with **Assistance Connect**
- Source: [MRI Public Housing](https://www.mrisoftware.com/products/public-housing-software/)

### Inferences
- **Product lineage.** "Housing Pro" is probably the HAB-derived product line, given PHA Pro's naming and module set (iFile, iDIA). **UNCONFIRMED**: no source states this. Assistance Connect is likely the HAPPY-derived portal (also unconfirmed).
- **Consolidation.** Tenmast WinTen2+ and Lindsey lines appear to remain as legacy products with an implied path to PHA Pro. No public sunset dates were found.
- **Client count conflict.** The 1,260+ (page) versus 1,600+ (2024 release) figures may reflect different counting (clients vs agencies) or attrition. Report both.

### Gaps
- No public sunset or migration schedule exists for Tenmast, Lindsey or HAB products.
- Deployment model (cloud vs on-prem) and pricing for PHA Pro are not stated.
- The exact mapping of Housing Pro and Assistance Connect to the acquired companies is unconfirmed.

---

## Q4. Specialty residential: student, senior, military, condo/HOA/association, UK block management

### Takeaway
- **Condo/HOA:**
  - **US/Canada:** CondoPlus (condo/co-op) and **Jenark**, acquired from CoreLogic in Oct 2020; about 500k US units at hundreds of management companies and large self-managed communities.
  - **Australia/NZ:** **Strata Master**, from Rockend (2019).
  - **UK/IE block management:** **Qube Property Management**, from Qube (2017), with a Service Charges module and the Engage resident portal.
- **Student, senior and military:** no dedicated MRI product was found in 2026.

### Cited Findings
**US/Canada condo and HOA**
- **Condo/HOA page:**
  - Offers Condo Sales (development and sales by project), Condo Management (allocations, board management, unit data) and Dues Payment via RentPayment HOA
  - Capabilities: sublet screening, collections/delinquency, e-payments, resident communications, "Board communications, vote administration, and association document management", and dashboards
  - No pricing or segment size
  - Source: [MRI Condo/HOA](https://www.mrisoftware.com/solutions/condo-hoa-management-software/)
- **CondoPlus:** condo/co-op dashboards, owner records, board voting, delinquency — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/). A CondoPlus webinar is hosted on MRI's Canada site — [MRI CA](https://www.mrisoftware.com/ca/resources/condoplus/)
- **Jenark modules:** Residential Property Management, Resident Owners, Resident Relations, Resident Collections, **Resident Architectural** (architectural requests) and Work Order — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **Jenark acquisition:**
  - Acquired from CoreLogic on 29 Oct 2020
  - Serves "community and homeowners associations"; "hundreds of management companies and large self-managed communities, representing half a million residential units"
  - MRI's 8th acquisition of 2020, positioned as expanding "MRI Living"
  - Source: [MRI release](https://www.mrisoftware.com/news/mri-software-acquires-jenark-from-corelogic) (snippet)

**Australia/NZ strata**
- **Strata Master:** "built for strata and body corporate management", tailored to Australian legislation. An add-on, MRI Strata Master Connect, automates maintenance and engagement — [MRI NZ Strata Master](https://www.mrisoftware.com/nz/products/strata-master/) (snippet)

**UK/IE block management and BTR**
- **Qube:**
  - MRI acquired Qube Global Software, which now trades under MRI legal names — [Aventis Advisors](https://aventis-advisors.com/mri-software-acquisitions/)
  - The acquisition year was 2017 per MRI release snippets (exact URL not confirmed)
  - A 2017 release says "Qube were the first to be able to deliver a solution to the UK Build-to-Rent market" — [MRI news (Qube PRS seminar)](https://www.mrisoftware.com/uk/news/prs-seminar-9-march-2017/) (snippet)
- **Client examples:**
  - Network Homes chose **Qube Living** (Aug 2017) — [MRI news](https://www.mrisoftware.com/news/network-homes-choose-qube-living/)
  - Evolve Block Management selected **MRI Qube PM** — [MRI UK](https://www.mrisoftware.com/uk/news/evolve-block-management-selects-mri-qube-pm)
  - JAR, a London block manager with 6,500+ homes, adopted **MRI Agora Orchestrator** (Oct 2026) "alongside its existing MRI residential systems" — [BeBeez, 6 Oct 2026](https://bebeez.eu/2026/10/06/jar-adopts-mri-softwares-agentic-ai-to-streamline-workflows-and-support-resident-service/)
- **"Service Charges" module (functional spec):** rent and service charges for leaseholders and tenants; standalone or integrated with housing solutions. PMX EMEA service charges require the **EMEA Regional Pack** (prior notes) — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **MRI Ireland residential page:** segments are Estate Agency, Block Management, Build-to-Rent (PRS) and Social Housing; "Pick one product, or add on complementary solutions" — [MRI IE residential](https://www.mrisoftware.com/ie/?p=43573)
- **UK BTR on PMX:** Residential Management is "A resident-focused platform for Build-to-Rent" — [MRI IE PMX](https://www.mrisoftware.com/ie/products/property-management-x/) (from the prior notes)
- **Start Living (UK)** uses the MRI Living suite — [MRI UK news](https://www.mrisoftware.com/uk/news/mri-living-suite-positions-start-living-for-future-growth/)

**Student, senior, military**
- **Student:** the only MRI material is a blog post asking "Is student housing considered multifamily?" — [MRI blog](https://mrisoftware.com/?p=87014) (snippet)
- **Senior:** a third-party directory claims Residential Management serves student and senior housing, but MRI's own sector lists omit both — [SoftwareFinder](https://softwarefinder.com/property-management-software/mri-residential-management) (snippet); [MRI residential hub](https://mrisoftware.com/residential)
- **Military:** no MRI military housing offering was found. The residential hub omits military — [MRI residential hub](https://mrisoftware.com/residential)

**UK social housing (adjacent; landlord-side but public/non-profit)**
- **Acquisitions:** Orchard (Apr 2020), Castleton Technology plc (taken private Jun 2020) and Capita One (2024 carve-out from Capita) — [Mann Report](https://www.mannpublications.com/mannreport/2020/04/02/mri-software-broadens-capabilities-with-orchard-information-systems-acquisition/); [Business Wire](https://www.businesswire.com/news/home/20200608005113/en/); [Aventis Advisors](https://aventis-advisors.com/mri-software-acquisitions/)
- **Products (functional spec):**
  - Castleton Housing Professional (voids, rent arrears, repairs, ASB, Decent Homes)
  - Orchard AccuServ and Asset Management
  - Housing Partners: Allocations, HomeSwapper, Homelessness Reduction
  - Source: [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)

### Inferences
- MRI competes seriously in condo/HOA in the US (Jenark, CondoPlus), Australia (Strata Master) and the UK (Qube block management). Geiger Property overlaps here only if it targets associations.
- Student, senior and military are effectively absent from MRI's residential marketing. These are areas where Yardi, RealPage and Entrata lead.

### Gaps
- No MRI student, senior or military product pages exist, so it is unclear whether PMX Residential is used in those niches.
- Jenark's current status (separate product or merged into CondoPlus/PMX) is unknown.
- An MRI UK claim of "over 1,000,000 UK units" in residential appeared only in a search summary; the exact page was not confirmed.

---

## Q5. Small and mid-size landlords (<500 units), Rentec Direct, self-serve or low-cost tiers

### Takeaway
- **US:** MRI has **no SMB property management product and no self-serve tier**.
- **Rentec Direct is NOT MRI-owned.** It states it is "privately held and independently owned" since 2007.
- **Australia/NZ:** MRI does serve small agencies:
  - **Property Tree** publishes pricing per 100 properties (Base A$130, Premium A$160, Pro A$205 per month ex GST; "from $126") with unlimited users
  - **Palace** averages about 210 properties per client
- **US small landlords:** MRI's closest touchpoint is **RentPayment**, which does not publish pricing and is judged by third parties a better fit for larger operators.

### Cited Findings
**Rentec Direct ownership**
- Rentec Direct FAQ: "privately held and independently owned", founded in 2007 by Nathan Miller; "No. Rentec Direct has been independently owned and operated since its founding in 2007" — [Rentec Direct About](https://www.rentecdirect.com/about/)
- Rentec targets landlords and PMs "up to a couple thousand units", with 16,000+ users and 700,000+ units — [Rentec Direct About](https://www.rentecdirect.com/about/)
- Rentec's only acquisition was TrueRent (completed Mar 2022) — [PRWeb](https://www.prweb.com/releases/rentec-direct-finalizes-acquisition-of-truerent-property-management-software-866991368.html)
- A search for an MRI–Rentec deal found none. A SourceForge page lists Rentec under MRI's name, which is a directory artefact, not ownership — [SourceForge](https://www.sourceforge.net/software/product/PACS-TOOLS) (snippet)

**US MRI positioning (enterprise)**
- The SFR page implies larger operators with "unique configuration" and has no small-landlord or self-serve tier — [MRI SFR page](https://www.mrisoftware.com/single-family-property-management-software/)
- Engage implementation takes 60–90 days — [MRI Multifamily CRM](https://www.mrisoftware.com/multifamily/multifamily-crm/)

**RentPayment**
- No public pricing; "contact sales" — [G2](https://www.g2.com/products/rentpayment-from-mri-software/pricing)
- A third party characterises it as better suited to larger operators than to small landlords — [FitGap](https://us.fitgap.com/products/024468/rentpayment-from-mri-software) (snippet)
- Capterra reviews are small-sample and low, at about 2.7–3.0/5 — [Capterra NZ](https://www.capterra.co.nz/software/1013751/rentpayment) (snippet)

**Property Tree (AU) published pricing, ex GST, per 100 properties**
- **Tiers:** **Base $130/mo** ("Stay Compliant"), **Premium $160/mo** ("Advanced Automation"), **Pro $205/mo** ("Full Ecosystem")
- **Discrepancy:** the hero banner says "From $126 per month ex. GST"
- **Included in all tiers:** unlimited users, unlimited trust accounts, owner and tenant portals, trust-accounting compliance, mobile app, maintenance management, inspection scheduling, Key Automate, AI invoice processing, and 50+ integrations including Xero and MRI CRM
- **Premium/Pro add:** AI maintenance workflows, paperless condition reports with e-signature and tenant-assisted inspections
- **Pro adds:** AI image-recognition comments, 360° inspections and an "AI Assistant" (website plugin)
- "up and running within 48 hours"
- Source: [MRI Property Tree pricing](https://www.mrisoftware.com/au/products/property-tree/pricing-1/)
- Review sites list a much higher, outdated "$10,000/year" figure — [Software Advice](https://www.softwareadvice.com/property/mri-property-tree-profile/) (snippet)

**Palace (NZ) scale**
- 700+ clients managing 150,000+ properties at acquisition (Mar 2021) — [MRI release](https://www.mrisoftware.com/news/mri-software-acquires-palace-new-zealand-property-management-provider)

### Inferences
- **US small-landlord segment: no MRI competitor.** Geiger Property faces no MRI competition in the US small-landlord or <500-unit PM segment. The competitors there are AppFolio, Buildium, Rentec, Yardi Breeze and others.
- **ANZ agencies: direct overlap.** In Australia/New Zealand, MRI is a direct SMB competitor through Property Tree and Palace. Property Tree is SMB-friendly at about A$1.30–2.05 per property per month with unlimited users.
- **Palace client size.** Palace's 150k properties across 700 clients averages about 214 properties per client, which is small-to-mid agency scale (calculated).

### Gaps
- No Palace pricing was found.
- RentPayment fee schedules (landlord vs renter fees) are not public.
- The Property Tree footnote on the "per 100 properties" unit was not captured.

---

## Q6. International residential: Property Tree, Palace (AU/NZ), Bricks+Agent, UK lettings, South Africa

### Takeaway
**Australia/New Zealand** is MRI's deepest residential SMB market:
- **Rockend** (Aug 2019) brought **Property Tree** (cloud), **Rest Professional** (desktop, legacy) and **Strata Master**.
- **Palace** (NZ, Mar 2021).
- **PropTech Group** (Feb 2023, A$93.4m) brought VaultRE, VaultEA, EagleCRM, Real Estate Investar, Website Blue, Designly and RentFind Inspector.
- **Proptech Labs** (Oct 2025) brought **Bricks+Agent** (maintenance), Inspection Manager, Invoice Automate, Key Automate and the reHeroes "Alex for Tenants" AI chatbot.

**Bricks+Agent is Australian-founded (Sydney/Melbourne, with a London presence), not a UK company.** MRI ownership is via Proptech Labs. That is strongly indicated but not stated in the MRI release.

**UK:** MRI Agency Solutions / Sales and Lettings (Thesaurus and CML, 2018), Qube (2017) and the Engage resident portal (2019).

**South Africa:** MRI Sales and Lettings is listed, and **TPN** (Oct 2022), a residential/commercial tenant credit bureau, was acquired. Most other South African deals (MDA, PropSys) were commercial.

**Not found:** no MRI link to "Domus" or "Kolmeo".

### Cited Findings
**Australia/New Zealand**
- **Rockend:** acquired Aug 2019, Sydney-based residential property management software — [IT Brief AU](https://itbrief.com.au/story/mri-software-acquires-rockend-looks-to-extend-reach-in-a-nz) (snippet). Rockend rebranded to MRI ("Rockend is now officially MRI Software") — [MRI AU](https://www.mrisoftware.com/au/?p=26236). Products now trade as MRI Property Tree, etc. — [Aventis Advisors](https://aventis-advisors.com/mri-software-acquisitions/)
- **Jul 2020 APAC launch:** brought Property Tree into the MRI suite and unified MRI branding in the region — [MRI release, 30 Jul 2020](https://www.mrisoftware.com/news/mri-software-new-residential-commercial-solutions-apac-ascend-users-conference/) (snippet)
- **Property Tree:** "Australia's leading cloud-based property management solution" — [MRI AU](https://www.mrisoftware.com/au/?p=26236) (snippet). Pricing and features are in Q5 — [MRI Property Tree pricing](https://www.mrisoftware.com/au/products/property-tree/pricing-1/)
- **Rest Professional (LEGACY):** used by "thousands of real estate professionals in Australia and New Zealand". MRI says it will "continue to be supported as long as we have customers who wish to use it" — [MRI AU Rest Professional](https://www.mrisoftware.com/au/?p=24323) (snippet)
- **Palace:**
  - Acquired 31 Mar 2021
  - "New Zealand's market-leading provider of residential property management solutions", founded 1999, offices in Auckland and Wellington
  - 700+ clients, 150k+ properties; price undisclosed
  - Source: [MRI release](https://www.mrisoftware.com/news/mri-software-acquires-palace-new-zealand-property-management-provider)
  - LJ Hooker Southern Partners (NZ) runs MRI Vault plus MRI Palace plus Movinghub. This came from a search summary of an MRI page, and the exact URL was not pinned down, so treat it as unverified.
- **PropTech Group (ASX: PTG):**
  - Scheme at A$0.60/share, about A$93.4m; completed 22 Feb 2023
  - Brands: VaultRE, VaultEA, EagleCRM, Real Estate Investar, Website Blue, Designly, RentFind Inspector
  - Sources: [AAP/Cision, 21 Feb 2023](https://www.aap.com.au/aapreleases/cision20230221ae21349); [Property Tribune](https://thepropertytribune.com.au/business-industry/mri-software-to-acquire-proptech-group-for-934m/) (snippets)
- **VaultRE in the functional spec:** residential listing-to-settlement pipeline and "VaultRE Agent Experience" mobile app. VaultRE is agency sales CRM, not rental property management — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)

**Proptech Labs (7 Oct 2025)**
- Melbourne-based; "longstanding partnership with MRI" serving 2,000+ agencies and property managers
- Capabilities to be integrated into Property Tree and Palace: maintenance, invoicing, key management, inspections and AI automation
- **Key Automate** to be included in Property Tree and Palace subscriptions by 31 Dec 2025
- Existing PMS integrations retained
- Source: [MRI AU release](https://www.mrisoftware.com/au/news/mri-software-acquires-proptech-labs-to-deliver-all-in-one-property-management-solutions-across-australia-new-zealand); [Real Estate Business](https://www.realestatebusiness.com.au/tech/30740-mri-software-acquires-proptech-labs)
- **Products listed on Proptech Labs' site:**
  - Bricks+Agent: "simplifying property management and maintenance workflows"
  - Inspection Manager
  - reHeroes: "Alex for Tenants is the most advanced AI chatbot in real estate"
  - Invoice Automate
  - Key Automate
  - Source: [Proptech Labs](https://www.proptechlabs.com/)

**Bricks+Agent ownership trail**
- **Founding and markets:** founded Dec 2016 as "a cloud-based property maintenance and inspections solution servicing Melbourne, Sydney and London" — [Bricks+Agent About](https://bricksandagent.com/about-us) (snippet)
- **Founder link:** co-founder Rafael Niesten — [Craft/press snippets](https://craft.co/bricks-agent). He is also CEO and co-founder of Proptech Labs and quoted in MRI's acquisition release — [MRI AU release](https://www.mrisoftware.com/au/news/mri-software-acquires-proptech-labs-to-deliver-all-in-one-property-management-solutions-across-australia-new-zealand)
- **Investor:** hipages took part in a Nov 2021 corporate round — [VCBacked](https://www.vcbacked.co/company/bricks-agent) (snippet)
- **Not stated in MRI materials:** neither MRI's release nor Real Estate Business names Bricks+Agent.

**UK lettings and agency**
- **CML Software** (Reading): residential agency, block management and BTR software; acquired Jul 2018 — [MRI UK release](https://www.mrisoftware.com/uk/?p=23338) (snippet)
- **Thesaurus Technology:** "cloud-based, self-service software for residential sales and lettings agents"; acquired Dec 2018 — [MRI release](https://www.mrisoftware.com/news/mri-software-acquires-thesaurus-technology-expand-solutions-for-uk-residential-market/) (snippet)
- **MRI Agency Solutions:** launched Mar 2019 to bring the UK sales and lettings brands together — [MRI UK release (Engage acquisition)](https://www.mrisoftware.com/uk/?p=24846) (snippet)
- **Engage Property Technology** (London, online resident portals): acquired May 2019. MRI already held 20% via Qube and bought the remaining 80% — [Bdaily](https://www.bdaily.co.uk/articles/2019/05/23/londons-engage-property-technology-acquired-by-us-based-software-firm); [Aventis Advisors](https://aventis-advisors.com/mri-software-acquisitions/)
- **AP Essentials:** "deeply integrated into MRI Qube Property Management and MRI Horizon" — [MRI AP Essentials datasheet](https://www.mrisoftware.com/uk/resources/ap-essentials-datasheet/) (snippet, from the prior notes)
- **"MRI Living" in Europe:** launched at Ascend London, Feb 2020 — [MRI NZ mirror](https://www.mrisoftware.com/nz/?p=24310) (snippet)

**South Africa**
- **MRI Sales and Lettings** is listed as available in South Africa, with accounting, CRM and client portal — [Capterra ZA](https://www.capterra.co.za/software/199960/mri-sales-and-lettings) (snippet)
- **MRI Residential Management** is also listed for South Africa — [GetApp ZA](https://www.getapp.za.com/software/2077447/mri-residential-management) (snippet)
- **TPN Group:**
  - Johannesburg registered credit bureau serving residential, commercial and education markets; founded 2000
  - Clients include landlords, managing agents and funds
  - Acquired 19 Oct 2022; terms undisclosed
  - Source: [MRI release](https://www.mrisoftware.com/news/mri-software-announces-acquisition-of-tpn-group-south-africas-leading-specialist-credit-bureau/) (snippet)
- **Commercial-focused South African deals:** MDA Property Systems (2017; Cape Town; about 5,000 users and 70% of listed SA REITs) and PropSys (Johannesburg) — [MRI MDA release](https://www.mrisoftware.com/news/mri-software-acquires-mda-property-systems-leader-real-estate-software-african-market); [MRI PropSys release](https://www.mrisoftware.com/za/?p=23337) (snippets)

### Inferences
- **ANZ is consolidating onto two cores.** MRI is consolidating Australia/New Zealand residential onto Property Tree (AU) and Palace (NZ), bundling acquired add-ons (Key Automate, maintenance, inspections, AI chatbot) into subscriptions. Rest Professional is being run down.
- **Bricks+Agent.** It almost certainly came to MRI inside Proptech Labs in Oct 2025, given the shared founder/CEO and Proptech Labs listing it as a product. MRI has not stated this explicitly, so mark it **probable, not confirmed**.
- **South Africa residential.** Beyond agency software and TPN screening data, MRI's South African residential property management presence looks thin.

### Gaps
- No MRI link to "Domus" (UK lettings) or "Kolmeo" was found. Treat both as **not MRI-owned unless shown otherwise**.
- The current status of the Qube Living, Thesaurus and CML brands under "MRI Sales and Lettings" is unclear (merged or sunset).
- No South African residential pricing or product page was fetched.
- Whether Proptech Labs/Bricks+Agent UK operations continue is unknown.

---

## Q7. Resident experience, mobile apps, payments and AI in residential

### Takeaway
Residential AI at MRI comes in four layers:
- **Engage (US):** AI suggested and auto-sent replies (Oct 2025) and a 24/7 AI voice leasing agent.
- **Agora platform:** Agora Intelligence and **Agora Orchestrator**, launched 25 Jun 2026 across multifamily, residential and social housing. Its first public residential adopter is UK block manager JAR (Oct 2026).
- **ANZ:**
  - **Property Tree Pro:** "AI Assistant" website plugin, AI invoice processing, AI inspection image recognition
  - **Proptech Labs:** reHeroes "Alex for Tenants" chatbot
- **Screening:** "AI-powered, human-supported", marketed for affordable and public housing.

Resident apps: the MRI Engage Resident Portal (US), Property Tree owner/tenant portals and mobile app (AU), and the Engage portal (UK).

### Cited Findings
- **Engage for Living AI:** "suggests replies based on the intent of each message"; staff can let the AI "respond automatically" — [Mann Report, 21 Oct 2025](https://www.mannpublications.com/mannreport/2025/10/21/mri-software-delivers-all-in-one-multifamily-engagement-suite/)
- **Engage CRM:** "An AI leasing agent that answers, logs, and escalates calls 24/7" — [MRI Multifamily CRM](https://www.mrisoftware.com/multifamily/multifamily-crm/)
- **Engage and Agora:** Engage "Connects AI capabilities with the MRI Agora platform" — [MRI Engage](https://www.mrisoftware.com/multifamily/engage/)
- **Agora Intelligence and Orchestrator (25 Jun 2026):**
  - Daily monitoring across leasing, finance and operations, with ranked risks and opportunities
  - Orchestrator deploys agents from a pre-built catalog with an auditable log
  - "Now available to MRI clients across commercial, multifamily, residential, social housing, local authority, and occupier sectors globally"
  - No named residential agents; no pricing
  - Source: [PR Newswire, 25 Jun 2026](https://www.prnewswire.com/news-releases/mri-software-launches-agora-intelligence-and-agora-orchestrator-delivering-ai-powered-recommendations-and-workflow-execution-for-real-estate-302810129.html)
- **JAR adoption:** JAR (London block management, 6,500+ homes) adopted Agora Orchestrator, announced 6 Oct 2026. Initial workflows were co-designed with MRI. A secondary source lists accounting, document processing and maintenance triage — [BeBeez](https://bebeez.eu/2026/10/06/jar-adopts-mri-softwares-agentic-ai-to-streamline-workflows-and-support-resident-service/) (snippet)
- **PMX AI (Jun 2025):** an agentic month-end close workflow and the Ask Agora page assistant, in limited availability — [MRI news, Jun 2025](https://www.mrisoftware.com/news/mri-software-introduces-ai-agent-and-page-assistant-to-transform-property-management-operations/); [YieldPro](https://yieldpro.com/2025/06/terry-keller) (from the prior notes)
- **Property Tree AI by tier:** AI invoice processing (all tiers); AI maintenance workflows (Premium/Pro); AI image-recognition comments, automated asset detection and an "AI Assistant (fully customisable, intelligent conversations, website plugin)" (Pro) — [MRI Property Tree pricing](https://www.mrisoftware.com/au/products/property-tree/pricing-1/)
- **reHeroes:** "Alex for Tenants is the most advanced AI chatbot in real estate" — [Proptech Labs](https://www.proptechlabs.com/)
- **AI screening:** "AI-powered, human-supported" screening on the affordable and public housing pages — [MRI Affordable Housing](https://www.mrisoftware.com/products/affordable-housing-compliance-software/); [MRI Public Housing](https://www.mrisoftware.com/products/public-housing-software/)
- **Payments and portals:**
  - RentPayment (AutoPay, cash, IVR, check scan) — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
  - Engage embedded payments — [Mann Report](https://www.mannpublications.com/mannreport/2025/10/21/mri-software-delivers-all-in-one-multifamily-engagement-suite/)
  - Property Tree owner and tenant portals and mobile app — [MRI Property Tree pricing](https://www.mrisoftware.com/au/products/property-tree/pricing-1/)
  - PHA Pro mobile portals — [MRI PHA Pro release](https://mrisoftware.com/news/mri-software-unveils-pha-pro-integrated-public-housing-voucher-management-compliance)

### Inferences
- **MRI trails on residential agents.** MRI's residential AI is behind the named multi-agent rosters of AppFolio (Realm-X Performers), Entrata (ELI) and RealPage (Lumina) described in the enterprise_platforms notes. MRI markets a generic orchestration layer (Agora) plus a voice leasing agent and reply suggestions, not a catalogue of named leasing, maintenance and collections agents.
- **Leasing chatbot naming.** An "MRI Engage Leasing Chatbot" was mentioned only in a search summary and could not be confirmed on MRI pages.

### Gaps
- There is no MRI list of the pre-built Agora Orchestrator agents for residential.
- No AI pricing is published.
- No independent outcome data exists for any MRI residential AI.

---

## Q8. Recent residential launches, rebrands, sunsets and migrations (2024–2026)

### Takeaway
The main 2024–2026 changes are:
- **Front-office rebrand:** "MRI Living" is being replaced by **MRI Engage**: Engage CRM (Jun 2024), then the Engage for Living suite (Oct 2025).
- **Public housing:** **PHA Pro** launched in May 2024 as the consolidated flagship.
- **Acquisitions:** **Insurent** (Jun 2024), **Capita One** (UK public sector, 2024) and **Proptech Labs** (Oct 2025; its add-ons are folded into Property Tree and Palace subscriptions from Dec 2025).
- **AI:** the **Agora Intelligence/Orchestrator** launch (Jun 2026).
- **Legacy:** Rest Professional (supported while customers remain), Access 24/7 and the HappyCo integration (existing clients only), and Bostonpost (still listed).

### Cited Findings
- **Jun 2024:** MRI Engage CRM launched — [MRI news](https://www.mrisoftware.com/news/unified-multifamily-crm-communications-accelerate-leasing-retention) (snippet)
- **29 May 2024:** PHA Pro launched for Housing Pro clients first — [MRI release](https://mrisoftware.com/news/mri-software-unveils-pha-pro-integrated-public-housing-voucher-management-compliance)
- **25 Jun 2024:** Insurent acquired — [MRI release](https://www.mrisoftware.com/news/mri-software-acquires-insurent-guarantor-insurance-services/) (snippet)
- **2024:** Capita One acquired (UK councils and housing providers) — [Aventis Advisors](https://aventis-advisors.com/mri-software-acquisitions/)
- **7 Oct 2025:** Proptech Labs acquired; Key Automate to be included in Property Tree and Palace by 31 Dec 2025 — [MRI AU release](https://www.mrisoftware.com/au/news/mri-software-acquires-proptech-labs-to-deliver-all-in-one-property-management-solutions-across-australia-new-zealand)
- **21 Oct 2025:** Engage for Living launched for PMX and Yardi Voyager clients — [Mann Report](https://www.mannpublications.com/mannreport/2025/10/21/mri-software-delivers-all-in-one-multifamily-engagement-suite/)
- **25 Jun 2026:** Agora Intelligence and Orchestrator launched — [PR Newswire](https://www.prnewswire.com/news-releases/mri-software-launches-agora-intelligence-and-agora-orchestrator-delivering-ai-powered-recommendations-and-workflow-execution-for-real-estate-302810129.html)
- **6 Oct 2026:** JAR (UK) adopted Agora Orchestrator — [BeBeez](https://bebeez.eu/2026/10/06/jar-adopts-mri-softwares-agentic-ai-to-streamline-workflows-and-support-resident-service/)
- **Rebrand:** MRI's own Engage page says MRI Living was the earlier umbrella name and older materials may still use it. mrisoftware.com/living now redirects to the multifamily/Engage page — [MRI Engage](https://www.mrisoftware.com/multifamily/engage/); [mrisoftware.com/living](https://mrisoftware.com/living/)
- **Legacy flags:**
  - Rest Professional is supported "as long as we have customers who wish to use it" — [MRI AU](https://www.mrisoftware.com/au/?p=24323) (snippet)
  - Access 24/7 and HappyCo Inspections are "existing clients only" — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **Earlier context:** MRI moved more than 75% of North American clients to Version X (2015 release). This is the precedent for forced platform migrations — [MRI release](https://www.mrisoftware.com/news/mri-software-migrates-more-than-75-percent-of-its-north-american-clients-to-flagship-property-management-software/)

### Inferences
- **Prospect/Resident Connect.** Expect them to be retired in favour of the Engage portal over 2026–2027, given the Engage single-record pitch. No sunset date has been announced.
- **Public housing.** Expect continued migration of Tenmast, Lindsey and HAB clients to PHA Pro (no dates published).
- **ANZ.** Expect continued consolidation of Rest Professional users onto Property Tree.

### Gaps
- No public end-of-life dates were found for any MRI residential product.
- No 2026 residential-specific launch was found beyond Agora. The sitemap title "MRI Software to Launch Prospect Connect, an All-new, Fully Integrated eLeasing Product for Multifamily" appears to be an older release; its date was not retrieved.

---

## Q9. Which MRI residential products compete most directly with Geiger Property?

### Takeaway
Geiger Property is a property management app with resident, owner and vendor portals and Stripe payments (from project memory). Its most direct MRI competitors are:
1. **MRI Property Tree (AU) and MRI Palace (NZ):** SMB/mid agency property management with owner and tenant portals, maintenance, inspections and trust accounting, with published per-property pricing.
2. **In the US, nothing at SMB scale.** MRI's US offering (PMX Residential + Engage) is enterprise multifamily, so it competes only if Geiger moves upmarket.
3. **RentPayment** competes with Geiger's payments feature.
4. **Condo/HOA** products (Jenark, CondoPlus, Strata Master, Qube) compete only if Geiger targets associations or block management.

### Cited Findings
- Property Tree tiers and inclusions (owner/tenant portals, maintenance, inspections, trust accounting, unlimited users) — [MRI Property Tree pricing](https://www.mrisoftware.com/au/products/property-tree/pricing-1/)
- Palace: 700+ clients and 150k+ properties — [MRI release](https://www.mrisoftware.com/news/mri-software-acquires-palace-new-zealand-property-management-provider)
- US Engage has a 60–90-day implementation; PMX and Yardi Voyager clients — [MRI Multifamily CRM](https://www.mrisoftware.com/multifamily/multifamily-crm/); [Mann Report](https://www.mannpublications.com/mannreport/2025/10/21/mri-software-delivers-all-in-one-multifamily-engagement-suite/)
- Rentec Direct is independent, not MRI — [Rentec Direct About](https://www.rentecdirect.com/about/)

### Inferences
- **The Property Tree feature bar for SMB agency software:** trust accounting, maintenance with AI triage, inspections with condition reports, key management and an AI tenant chatbot, all bundled at about A$1.30–2.05 per property per month with unlimited users.
- **Gap in Geiger's current scope.** Geiger's memory notes "skip all AI" and "e-sign later". Those are gaps against Property Tree Premium/Pro and Engage.

### Gaps
- This research did not verify Geiger Property's target region or segment beyond project memory. If Geiger is US-only and SMB, MRI is a minor direct competitor.
