# MRI Software non-residential product portfolio (commercial, occupier, workplace/facilities, investment), as of November 2026

Research date: 2026-11-03. Scope covers every MRI product outside residential, affordable and public housing. For each product: what it does, key features, target customer, region, deployment and origin, plus how the products fit together.

**How to read this file**
- **Builds on two earlier notes files** (2026-11-02), in `research_notes/Geiger vs MRI PMX fact check/`:
  - `mri_accounting_commercial.md`: PMX, Financials, Commercial Management, Advanced Retail, AP partners and AMTdirect.
  - `mri_investment_modeling.md`: Investment Management, Cougar, Investment Accounting, RAM and Agora.
  - Their findings are summarised here with their original source URLs so this file stands alone. New research concentrates on the occupier, workplace/facilities, energy and 2024–2026 items they did not cover.
- **Product inventory baseline.** The anchor is MRI's A–Z product index, fetched 2026-11-03 with a "© 2026 MRI Software LLC" footer — [MRI products index](https://www.mrisoftware.com/products/). A product absent from that index is treated as possibly legacy or renamed. Absence is not proof that a product was discontinued.
- **Evidence quality.** Most evidence is MRI's own marketing and press releases, so it is vendor-asserted. Review-site and deal-database items are secondary.
- **Labels.** Items marked "(snippet)" come from search-result text, not a fetched page. "Deployment" is often not stated on MRI pages; where it is unknown, that is said explicitly.

---

## Q1. Commercial property management: MRI Commercial Management / PMX for office, retail and industrial (CAM, recoveries, percentage rent, billing, retail sales, leasing/deal management, AI lease abstraction, tenant portal)

### Takeaway
MRI's landlord-side commercial stack is the **Property Management X (PMX)** suite. PMX is MRI's "Platform X" core, with roots in Version X (Oct 2014) and an APAC "next-generation PMX" relaunch in May 2024. It is sold worldwide. Its components:
- **Core modules:** **Commercial Management** (rent, recoveries/CAM, billing) and the **Advanced Retail** add-on (percentage rent, breakpoints, sales tracking).
- **Around the core:**
  - **Lease Flow:** leasing CRM and deal modelling, directly integrated with Commercial Management.
  - **Contract Intelligence:** AI lease abstraction, ex-Leverton, acquired July 2019.
  - **Tenant Connect** and the **Engage @Work** tenant portal (launched June 2023).
  - **MRI Angus:** building operations and work orders (ex-Angus Systems, Jan 2022).
- **APAC:** a second, parallel product, **MRI Simplicity**, came with the June 2025 Anacle take-private.

Nothing is sold as a stand-alone "MRI Leasing" product. Leasing is Lease Flow.

### Cited Findings

**What the earlier notes established (summary)**
- **PMX identity.** PMX is MRI's flagship core suite, "built on Platform X", sold in "170+ Countries". Its modules:
  - Commercial Management ("office, industrial, logistics, retail and mixed-use")
  - Residential Management
  - Advanced Retail
  - Lease Flow (leasing CRM)
  - Lease Intelligence (AI lease abstraction)
  - Tenant Connect and Connect Suite
  - A Financials suite: GL, AP, Corporate AR, Fixed Assets, Budgeting & Forecasting, Job Cost
  - Investment
  - Source: [MRI IE PMX page](https://www.mrisoftware.com/ie/products/property-management-x/)
- **May 2024 relaunch.** On 8 May 2024 MRI launched the "next-generation" PMX for APAC commercial real estate. It bundled Ask Agora (genAI Q&A), Agora Insights, PMX Studio Suite, the PMX Reimagined UI (X.7) and the PMX On-the-Go mobile app (free to MRI Cloud clients). MRI cited "over 2,500 clients and 50,000 end users worldwide" — [Elite Agent, 8 May 2024](https://eliteagent.com/mri-software-announces-next-generation-property-management-tech/)
- **Lineage.** Version X was announced 20 Oct 2014 — [MRI press release](https://www.mrisoftware.com/news/mri-software-debuts-its-latest-innovative-solution-mri-version-x)
- **AU scale claims.** "8,800+ commercial management clients", "4m+ commercial leases" — [MRI AU PMX page](https://www.mrisoftware.com/au/?p=72174)
- **CAM/recoveries** are in Commercial Management:
  - Expense pools and tenant recovery profiles
  - Pro-rata share of insurance, real estate taxes and utilities
  - Estimates from budget, then year-end reconciliation billed as a one-time charge or credit
  - Sources: [MRI blog, 4 Apr 2019](https://www.mrisoftware.com/ie/?p=25458); [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
  - "Non-retail Recovery Caps" were added in X.5.3 — [MRI X.5 release notes](https://info.mrisoftware.com/x5-release-us)
  - Retail-specific recoveries depth sits in Advanced Retail — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
  - The US retail page markets AI-assisted "CAM recoveries and reconciliation" — [MRI Advanced Retail page](https://www.mrisoftware.com/products/advanced-retail/)
- **Percentage rent and sales** are in Advanced Retail: "Percentage rent calculations", "reporting and analysis of sales data", and "breakpoints, lease offsets". Tenants submit sales through the Tenant Connect portal ("enter sales data"). No POS integration is documented. Sources: [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/); [MRI Advanced Retail page](https://www.mrisoftware.com/products/advanced-retail/); [MRI Tenant Connect (AU)](https://www.mrisoftware.com/au/?p=858) (snippet)
- **"MRI On Location Sales Ingestion"** ("Provides clients with retail sales data") is listed in the functional spec. OnLocation is the footfall business that came from Springboard (Oct 2022) — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/); [MRI NZ news](https://www.mrisoftware.com/nz/news/mri-software-acquires-springboard-retail-footfall-ai-analytics/) (snippet)
- **Regional packs.** EMEA service charges and direct recharges need the EMEA Regional Pack. Dual currency arrived in X.5.3 — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/); [MRI X.5 release notes](https://info.mrisoftware.com/x5-release-us)
- **US availability.** PMX is offered in the US, Canada, UK, Ireland, South Africa, UAE, Saudi Arabia, Australia, NZ, Singapore, Hong Kong and India — [MRI US PMX page](https://www.mrisoftware.com/products/property-management-x/)

**Leasing / deal management: MRI Lease Flow (new research)**
- **What it is.** Lease Flow is "a trusted leasing CRM" for commercial leasing teams:
  - Centralises contacts, notes, activities, leases and opportunities
  - Configurable workflows move prospects to tenants
  - Gives leasing-pipeline visibility
  - Models rent steps, breakpoints, cash allowances, free rent and TIs
  - Source: [MRI Lease Flow](https://www.mrisoftware.com/products/leaseflow/)
- **Integration.** "Direct integration with MRI Commercial Management eliminates duplicate entry". Executed leases move to the next lifecycle stage — [MRI Lease Flow](https://www.mrisoftware.com/products/leaseflow/)
- **Classification.** The 2026 A–Z index lists Lease Flow under "Lease Management", alongside ProLease, ProCalc, Contract Intelligence and CTM eContracts — [MRI products index](https://www.mrisoftware.com/products/)
- **Not on the page:** deal approvals, heads of terms, AI features, origin and deployment — [MRI Lease Flow](https://www.mrisoftware.com/products/leaseflow/)

**AI lease abstraction: MRI Contract Intelligence, ex-Leverton (new research)**
- **The acquisition.** MRI acquired LEVERTON, an AI data-extraction company, announced 31 Jul 2019, the same day as ProLease. Leverton reads leases for start and end dates, options, renewals and rent per square foot. It had more than 5,000 users and about 500,000 documents processed. Sources: [MRI UK press release](https://www.mrisoftware.com/uk/?p=25062); [KMWorld](https://www.kmworld.com/Articles/News/News/MRI-Software-acquires-LEVERTON-133328.aspx) (snippet)
- **Rebrand.** Leverton was rebranded **MRI Contract Intelligence** — [Dealroom profile](https://app.dealroom.co/companies/leverton_1) (snippet)
- **Current product page:**
  - "uses AI-powered lease abstraction to digitize, structure and connect critical contract data"
  - Extracts dates, financials, clauses and obligations, with human review layers
  - "25+ Languages", including Chinese, Japanese, Korean and Russian
  - **Contract Assistant**: natural-language Q&A over contract data
  - Feeds MRI ProLease for ASC 842/IFRS 16
  - The page does not mention Leverton or deployment
  - Source: [MRI Contract Intelligence](https://www.mrisoftware.com/products/contract-intelligence/)
- **Naming.** The IE PMX page names the landlord-side bundle "Lease Intelligence (AI lease abstraction)" — [MRI IE PMX page](https://www.mrisoftware.com/ie/products/property-management-x/)
  - Inference: "Lease Intelligence" is probably the PMX-facing label for the same Contract Intelligence engine. This is not confirmed.
- **Manhattan clients** were given access to "AI-powered lease abstraction" after the April 2021 deal — [MRI press release, 14 Apr 2021](https://www.mrisoftware.com/news/mri-software-completes-acquisition-manhattan-real-estate-workplace-solutions/)

**Tenant portal and tenant experience (new research)**
- **Tenant Connect** is the PMX tenant portal: "make payments, enter sales data, review account status and history, initiate service requests" — [MRI Tenant Connect (AU)](https://www.mrisoftware.com/au/?p=858) (snippet)
- **MRI Engage @Work** launched 13 Jun 2023 as a commercial "flexible property portal" that works across a mixed tech stack:
  - Links to MRI Angus and other facilities systems for work orders
  - PMX data syncs with several payment providers
  - Sources: [MRI press release](https://www.mrisoftware.com/news/mri-software-launches-flexible-property-portal-to-drive-tenant-engagement/); [GlobeSt, 16 Jun 2023](https://www.globest.com/2023/06/16/mri-software-launches-commercial-tenant-portal)
- **Engage origin.** MRI held 20% of Engage Property Technology through Qube and bought the remaining 80% in 2019 — [Aventis Advisors, MRI acquisitions](https://aventis-advisors.com/mri-software-acquisitions/)
  - The 2026 index lists **Engage @Work, Engage CRM and Engage Living** — [MRI products index](https://www.mrisoftware.com/products/)

**Building operations for landlords: MRI Angus (new research; see also Q3)**
- **The acquisition.** MRI acquired Toronto-based Angus Systems, announced 20 Jan 2022:
  - More than 700 customers
  - The **Angus AnyWhere** platform managed 2.7 billion sq ft across North America
  - Sources: [Commercial Observer, Jan 2022](https://commercialobserver.com/2022/01/mri-software-angus-systems); [MRI press release (UK)](https://www.mrisoftware.com/uk/?p=46198)
- **Rebrand.** In mid-2022 Angus AnyWhere became **MRI Angus**, and the MIRRA access-control data integration became **MRI MIRRA** — [MRI CA: Angus Systems becomes MRI Software](https://www.mrisoftware.com/ca/angus-systems-becomes-mri-software/) (snippet); [MRI CA](https://www.mrisoftware.com/ca/?p=41465) (snippet)
- **Current modules:**
  - Tenant Requests (branded portal)
  - Visitor Security (badges, access-card activation)
  - Building Directory
  - Certificate of Insurance tracking
  - Notify & Response
  - Preventive Maintenance (asset history, work-order dispatch)
  - Surveys, Property Websites, Resource Reservation (with billing) and Tenant Handbook
  - Source: [MRI Angus](https://www.mrisoftware.com/products/angus/)
  - Not on the page: AI features, deployment model and PMX integration

**APAC parallel commercial product: MRI Simplicity, ex-Anacle (new research)**
- **The deal.** MRI announced a take-private proposal for Singapore-based **Anacle Systems** (8353.HK) in March 2025 and completed it on 9 Jun 2025 — [MRI NZ: take-private proposal](https://www.mrisoftware.com/nz/?p=56467); [MRI UK, 9 Jun 2025](https://www.mrisoftware.com/uk/?p=85683)
- **What Anacle does.** MRI describes it as "a pioneer in commercial property management, facilities, digital workplace, energy, and asset management solutions". Its customers are in Hong Kong, Japan, Malaysia, Taiwan, China and other Asian countries — [MRI UK, 9 Jun 2025](https://www.mrisoftware.com/uk/?p=85683)
- **Rebrand.** Anacle rebranded as MRI Software, and its **Simplicity** product is now **MRI Simplicity** — [MRI AU: Anacle rebrand](https://www.mrisoftware.com/au/news/anacle-systems-mri-software-rebrand/) (snippet)
- **Positioning.** MRI Simplicity is aimed at "organisations managing complex commercial real estate portfolios in Singapore and across global markets", with automated rent calculations, service-charge allocations and invoice-approval workflows — [MRI SG blog](https://www.mrisoftware.com/sg/blog/commercial-property-management-accounting-software-singapore/) (snippet)
- **Follow-on.** MRI's March 2026 results release cites "expanded… commercial and facilities management offerings in Asia" — [MRI, 3 Mar 2026](https://www.mrisoftware.com/uk/?p=96392)

**Other commercial-adjacent items**
- **Findspace** appears in the 2026 index under Marketing/Sales/Leasing, and a deal database lists "MRI Software Acquires Findspace" — [MRI products index](https://www.mrisoftware.com/products/); [PrivSource](https://www.privsource.com/acquisitions/deal/4dSxD3) (snippet). What it does and when it was acquired were not researched.
- **AI in PMX (June 2025).** MRI demoed an "agentic month-end close workflow" and the Ask Agora in-page assistant, in "limited availability" — [YieldPro, 3 Jun 2025](https://yieldpro.com/2025/06/terry-keller); [Mann Report, 2 Jun 2025](https://www.mannpublications.com/mannreport/2025/06/02/mri-software-introduces-ai-agent-and-page-assistant/) (snippet)

### Inferences
- **Two landlord commercial cores.** MRI now runs two landlord-side commercial PM cores: PMX/Commercial Management (global) and MRI Simplicity (APAC, from Anacle). The UK Horizon line has been repositioned for occupiers (see Q2). No public roadmap says whether Simplicity will be converged into PMX.
- **Origin of each component:**
  - Built in-house, evolving from the MRI X platform: Commercial Management, Advanced Retail and Tenant Connect.
  - Acquired: AI abstraction (Leverton, 2019), building ops (Angus, 2022), the tenant-app brand (Engage, 2019) and APAC PM (Anacle, 2025).
  - Unknown: the origin of Lease Flow.
- **"MRI Leasing" does not exist.** MRI does not appear to sell a product by that name. Commercial deal management is Lease Flow, with lease analysis also available in ProCalc on the occupier side.

### Gaps
- **Lease Flow:** origin (built or acquired), launch year and deployment are not stated anywhere found.
- **"Lease Intelligence" vs "Contract Intelligence":** the relationship was not confirmed.
- **Tenant Connect vs Engage @Work:** whether Engage @Work replaces or wraps Tenant Connect for commercial tenants is not stated.
- **Simplicity vs PMX in APAC:** no source describes how MRI positions the two against each other.
- **Findspace:** the product and its acquisition date were not researched.
- **Deployment:** apart from "MRI Cloud" references for PMX, the deployment model (SaaS-only vs hosted vs on-prem) of Commercial Management is not stated on current pages.

---

## Q2. Corporate occupier and lease administration (ProLease, lease accounting ASC 842 / IFRS 16, lease admin, contract management, occupier portfolio management)

### Takeaway
MRI's occupier lease line is built from four acquisitions. Today it is sold mainly as **MRI ProLease** in three tiers (**Enterprise / Central / Direct**). It covers real estate and equipment lease administration plus ASC 842, IFRS 16, GASB 87 and FRS 102 accounting. MRI's page claims **3,500 occupier clients**.

| Acquisition | Date | Location | What it brought |
|---|---|---|---|
| **Qube Global Software** | Oct 2017 | UK | Horizon |
| **ProLease** | Jul 2019 | Stamford, CT | ProLease and ProCalc |
| **AMTdirect** | Jan 2021 | North Carolina | Lease accounting and lease administration |
| **Manhattan** | Apr 2021 | Bought from Trimble | ManhattanONE IWMS, which includes leasing and lease compliance |

- **Renames:** "MRI Horizon for Occupiers" was renamed **MRI ProLease Enterprise**. "MRI Real Estate Lease Accounting" is not a current product name.
- **Contract management:** the AI contract product is **Contract Intelligence** (ex-Leverton). The similarly named **CTM eContracts** is a *residential agent* transaction tool, not a commercial contract manager.
- **IDC MarketScape (October 2026):** MRI was named a Leader in the IDC MarketScape for AI-enabled lease administration, highest on capabilities. This rests on MRI's own press release.

### Cited Findings

**ProLease (acquired 31 Jul 2019)**
- **The acquisition.** MRI acquired ProLease of Stamford, Connecticut:
  - More than 700 clients across 40 industries
  - Modules: "real estate, equipment, lease accounting, workplace, maintenance, and project", plus ProCalc lease analysis
  - Among the first solutions updated for ASC 842/IFRS 16
  - MRI cited "significant growth of its occupier solutions globally", particularly in EMEA
  - Source: [MRI CA press release, 31 Jul 2019](https://www.mrisoftware.com/ca/news/mri-software-acquires-prolease-corporate-occupiers-new-global-lease-accounting-standards-workplace-management/)
- **Headquarters conflict.** Software Equity Group (ProLease's adviser) lists Cleveland, OH. MRI's release says Stamford, CT — [Software Equity Group](https://softwareequity.com/transactions/prolease-acquired-by-mri-software) (snippet)
- **Current ProLease page:**
  - Tagline: "Intelligent technology to alleviate the complexity of lease management"
  - Modules: lease management (real estate and equipment, deadline alerts), lease accounting ("ASC 842, GASB 87, IFRS 16, and FRS 102", automated journal entries and disclosures), lease compliance, transaction management (workflows and alerts), equipment leasing (residual value guarantees, capitalization schedules) and AI lease abstraction (integrated with Contract Intelligence)
  - Tiers: **ProLease Enterprise** ("large, complex, multinational portfolios"), **ProLease Central** (mid-sized) and **ProLease Direct** ("lean teams")
  - Claims "3,500 occupier clients" and "Standardized deployment that gets you live in weeks"
  - Alerts and calculations are described as "powered by AI"
  - Source: [MRI ProLease](https://www.mrisoftware.com/products/prolease/)
- **Deployment.** MRI's embed page calls ProLease "a true SaaS offering" — [MRI ProLease embed](https://mrisoftware.com/products/prolease/embed) (snippet)
- **Reviews.** G2 shows 4.1/5 from 35 reviews — [G2 MRI ProLease](https://www.g2.com/products/mri-prolease/reviews) (snippet)
- **IDC MarketScape.** A syndicated copy of MRI's 15 Oct 2026 release says MRI was named a Leader in the "IDC MarketScape: Worldwide AI-Enabled Lease Administration Applications 2026". It was "positioned highest for capabilities among evaluated vendors", which the release attributes to MRI ProLease. IDC trends cited: automated abstraction, sublease and lessor-side administration, and forecasting-driven portfolio strategy — [TechIntelPro (syndicated MRI release)](https://techintelpro.com/AI/Enterprise-AI/mri-software-named-leader-in-2026-idc-marketscape-for-lease-admin) (snippet; IDC report not seen)
- **Webinar.** MRI's 2026 site advertises a webinar titled "MRI ProLease Enterprise: new features, AI powered insights and training academy" — [MRI, 3 Mar 2026](https://www.mrisoftware.com/uk/?p=96392)

**Horizon (from Qube Global Software, Oct 2017) → ProLease Enterprise**
- **The Qube deal.** MRI acquired Qube Global Software, a UK property and facilities management software supplier, in October 2017. Afterwards MRI served "5,500 clients" with 350 UK staff — [MRI press release](https://www.mrisoftware.com/uk/?p=23530); [IPE Real Assets](https://realassets.ipe.com/propertyeu/mri-software-acquires-uk-competitor-qube/10081249.article) (snippet)
- **Horizon occupier customers:**
  - Dixons Carphone selected Horizon for its occupied and sub-let portfolio and IFRS 16 (6 Feb 2018) — [MRI news](https://www.mrisoftware.com/news/dixons-carphone-selects-horizon/)
  - Halfords selected Qube Horizon for more than 750 locations — [MRI news](https://www.mrisoftware.com/news/retail-giant-halfords-selects-qube-horizon-for-property-management-and-ifrs-16/)
  - The UK Foreign & Commonwealth Office selected Horizon as an IWMS for more than 5,000 properties, covering lease management, IFRS 16 and FM (Aug 2019) — [Mann Report, 22 Aug 2019](https://www.mannpublications.com/mannreport/2019/08/22/mri-softwares-horizon-iwms-platform-selected-by-uk-fco-to-manage-global-property-portfolio/) (snippet)
- **Deployment.** Horizon is described as SaaS "with ISO 27001 accreditation for its hosted component" (snippet, via the FCO coverage).
- **The rename.** A UK G-Cloud listing names the product "MRI ProLease Enterprise (formerly MRI Horizon Occupier)" — [UK Digital Marketplace G-Cloud listing](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud-14/services/813712730500263) (snippet)
  - Software Advice still carries a profile titled "MRI Horizon for Occupiers" — [Software Advice](https://www.softwareadvice.com/property/mri-horizon-cre-profile/) (snippet)
- **UK government use.** The Government Property Agency reportedly uses MRI ProLease for about 55% of the UK government's property portfolio — via search summary of G-Cloud listings (snippet; unverified)
- **Analyst recognition.** Verdantix's 2017 IWMS Green Quadrant named Qube an "Innovator", citing lease administration and early IFRS 16 functionality — [MRI news](https://mrisoftware.com/news/qube-named-innovator-2017)
- **LEGACY label:** the "Horizon / Qube Horizon / MRI Horizon for Occupiers" names are legacy, and the 2026 A–Z index does not list Horizon — [MRI products index](https://www.mrisoftware.com/products/)
  - Horizon *Retail Management* and *Lease Payments/Receivables* modules still appear in MRI's functional spec — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)

**AMTdirect (acquired 27 Jan 2021)**
- **The acquisition.** MRI bought AMTdirect, a North Carolina provider of "lease accounting, lease administration, and facilities management software", from Luminate Capital Partners. MRI then said it served "approximately 2,000 occupier clients worldwide" — [MRI press release, 27 Jan 2021](https://www.mrisoftware.com/news/mri-software-acquires-amtdirect-lease-facilities-management); [Luminate release (PR Newswire)](https://prnewswire.com/news-releases/luminate-capital-partners-announce-sale-of-amtdirect-301216036.html)
- **Modules (functional spec):**
  - **OPEX Manager:** custom expense pools for auditing landlord CAM
  - **Percent Rent:** multiple breakpoints and sales exclusions
  - **CPI Manager:** US CPI changes
  - Source: [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/) (from earlier notes)
- **Standards and status.** A third-party directory says AMTdirect supports ASC 842, IFRS 16 and GASB 87 and still operates under the AMTdirect name — [ERPResearch](https://erpresearch.com/erp-add-ons/lease-accounting/amtdirect) (secondary). The 2026 A–Z index does **not** list AMTdirect — [MRI products index](https://www.mrisoftware.com/products/)

**Contract management**
- **Contract Intelligence** (ex-Leverton) is MRI's contract and lease data-extraction product. See Q1 — [MRI Contract Intelligence](https://www.mrisoftware.com/products/contract-intelligence/)
- **CTM eContracts is NOT occupier contract management.**
  - MRI acquired CTM Software of Colorado on 7 Feb 2019. CTM made "SaaS transaction management, document workflow and electronic signature solutions for residential real estate agents" — [MRI press release](https://www.mrisoftware.com/news/mri-software-expands-solutions-real-estate-agents-acquisition-ctm-software/)
  - In January 2024 MRI announced a next-generation CTM eContracts alongside the acquisition of eGent — [MRI news, Jan 2024](https://mrisoftware.com/news/mri-software-announces-next-generation-ctm-econtracts)
  - The 2026 index nonetheless files it under "Lease Management" — [MRI products index](https://www.mrisoftware.com/products/)
- **"MRI Contract Manager"** was not found as a current product name on the 2026 index — [MRI products index](https://www.mrisoftware.com/products/)

**Occupier portfolio management / IWMS lease modules**
- **ManhattanONE** (see Q3) includes Leasing, Lease Compliance ("FASB ASC 842 / IFRS 16 conformance"), Transactions (acquisition and disposition), Financials and Decision Support for "real estate occupiers" — [MRI ManhattanONE](https://www.mrisoftware.com/products/manhattanone/)
- **Combined occupier base.** The Manhattan deal added "more than 3,000 corporate occupiers" — [MRI press release, 14 Apr 2021](https://www.mrisoftware.com/news/mri-software-completes-acquisition-manhattan-real-estate-workplace-solutions/)
- **ProCalc** (lease analysis, from ProLease) remains on the 2026 index — [MRI products index](https://www.mrisoftware.com/products/)

### Inferences
- **The tier mapping.** The three ProLease tiers plausibly map to the acquired code bases: Enterprise = ex-Horizon (confirmed by G-Cloud), Central = original ProLease, Direct = ex-AMTdirect. Only the Enterprise mapping is sourced; Central and Direct are inference.
- **Overlapping occupier lease engines.** MRI sells overlapping occupier lease engines: ProLease (all tiers) and ManhattanONE's lease modules. The overlap is a likely consolidation target, but no sunset was announced.
- **Lease accounting naming.** "MRI Real Estate Lease Accounting" as a stand-alone name is not current. Lease accounting is a ProLease capability, also present in ManhattanONE, and MRI's site navigation uses the generic "Lease Accounting" / "Lease Management" headings.

### Gaps
- **Tier mapping:** no MRI source confirms which legacy code base underlies ProLease Central and ProLease Direct.
- **AMTdirect status:** whether it is still sold under its own name in 2026 is unconfirmed; it is absent from the index.
- **IDC MarketScape:** the report itself was not accessed; the placement rests on the vendor release.
- **Lessor-side and sublease features:** no specific feature detail was found on ProLease for lessor-side or sublease administration.

---

## Q3. Workplace and facilities (ManhattanSoftware / ManhattanONE, room booking, Angus, IWMS/space/CAFM, Evolution, Horizon)

### Takeaway
MRI's workplace and facilities line was almost entirely acquired:

| Origin | Date | Location | Product today |
|---|---|---|---|
| Qube Horizon IWMS | 2017 | UK | Now ProLease Enterprise |
| WhosOnLocation | Before Apr 2021 | NZ | OnLocation People Presence Management (visitor and presence) |
| Trimble's Manhattan business | Apr 2021 | — | **ManhattanONE** IWMS; **CenterStone** (also ex-Trimble) |
| FSI | Aug 2021 | UK | **MRI Evolution** (Concept Evolution CAFM/CMMS) |
| eSight | Nov 2021 | UK | **MRI Energy** |
| Angus Systems | Jan 2022 | Toronto | **MRI Angus** (building operations) |
| Springboard | Oct 2022 | UK | **OnLocation Footfall Analytics** |
| Anacle | Jun 2025 | Singapore | Facilities, digital workplace and energy (APAC) |

- **MRI-built:** **Workplace Central** (space planning, move management, room/desk booking, utilization), launched as a return-to-office product. **Space Scheduling** appears as a separate index item.
- **Trezo and Kinnosa:** no evidence was found that either is an MRI product or acquisition.
- **Analyst position:** Verdantix's Jan 2025 CPIP/IWMS Green Quadrant names MRI among eight leaders.

### Cited Findings

**ManhattanONE (Manhattan IWMS, ex-Trimble)**
- **The deal.** Trimble agreed on 17 Feb 2021 to sell its "Manhattan real estate and workplace solutions business" to MRI, in line with its focus on construction — [Trimble/Harvest Partners release, 17 Feb 2021](https://harvestpartners.com/?p=1201) (snippet); [Trimble release PDF](https://s202.q4cdn.com/922416715/files/doc_news/2021/02/2454597997.pdf) (snippet)
- **Close.** The deal closed 14 Apr 2021:
  - IWMS with "robust space scheduling, booking and facilities management capabilities"
  - Added "more than 3,000 corporate occupiers" across North America, Europe and APAC
  - Staff in the US, Canada, UK, India, NZ and Australia
  - Manhattan clients gained access to MRI AI lease abstraction and WhosOnLocation
  - Source: [MRI press release, 14 Apr 2021](https://www.mrisoftware.com/news/mri-software-completes-acquisition-manhattan-real-estate-workplace-solutions/)
- **Current page modules:**
  - Decision Support (benchmarking, trends)
  - Financials (ledger-level cost tracking)
  - Transactions
  - Leasing and Lease Compliance (ASC 842/IFRS 16)
  - Space, Room & Desk Booking, Utilization
  - Projects
  - Facilities Maintenance
  - Sustainability (energy and utility tracking)
  - Mobile Apps
  - Target: "real estate occupiers" (global retailer, bank and consultancy references). AI, deployment and origin are not stated.
  - Source: [MRI ManhattanONE](https://www.mrisoftware.com/products/manhattanone/)
- **Mobile app.** An iOS app listed as "MRI Workplace Connect" has an App Store URL slug of "trimble-engage", which suggests a former Trimble employee app — [Apple App Store](https://apps.apple.com/ca/app/trimble-engage/id1459537809) (snippet)
- **CenterStone** is listed on the 2026 index. TrustRadius describes MRI CenterStone as "Formerly from Trimble" — [MRI products index](https://www.mrisoftware.com/products/); [TrustRadius](https://trustradius.com/products/mri-centerstone/pricing) (snippet)
  - Inference: it arrived with the Manhattan deal.
- **Verdantix:**
  - 2022 IWMS Green Quadrant: MRI (ManhattanONE) in the Leaders quadrant, with a section on "MRI Leverages Acquisitions To Improve Functionality Across IWMS" — [Verdantix Green Quadrant IWMS 2022](https://www.verdantix.com/client-portal/report/green-quadrant-integrated-workplace-management-systems-2022) (snippet; paywalled)
  - Jan 2025 "Connected Portfolio Intelligence Platforms (CPIP/IWMS)" Green Quadrant leaders: Planon, IBM, Eptura, MRI Software, Tango, Johnson Controls, Spacewell-Nemetschek and Nuvolo. MRI "couples MRI Manhattan with an advanced business intelligence tool" — [Verdantix CPIP/IWMS 2025](https://www.verdantix.com/report/real-estate-built-environment/green-quadrant-connected-portfolio-intelligence-platforms-cpip-iwms-2025) (snippet; paywalled)
  - 2019 report: "MRI Stands Out With Its Strong Functionality For Real Estate Investors" — [Verdantix IWMS 2019](https://www.verdantix.com/report/green-quadrant-integrated-workplace-management-systems-2019) (snippet)

**Workplace Central and Space Scheduling (room/desk booking)**
- **Workplace Central:**
  - Pitch: "A comprehensive workplace management solution to help real estate occupiers create and deploy return-to-office plans"
  - Space planning (seating scenarios, distancing capacity)
  - Move management
  - Space scheduling (zones and neighbourhoods; check-in by QR, app, room/desk screens or sensors)
  - Utilization analytics (badge, WiFi, IoT)
  - Visitor management via WhosOnLocation
  - No AI, deployment or Manhattan/ProLease integration on the page
  - Source: [MRI Workplace Central](https://mrisoftware.com/products/workplace-central)
- **Launch.** MRI's release is titled "MRI Software Launches Workplace Central to Enable Safe, Flexible and Efficient Return to Work". Its date was not retrieved; the framing suggests 2020 — [MRI UK news](https://mrisoftware.com/uk/news/mri-software-launches-workplace-central-enable-safe-flexible-efficient-return-to-work)
- **Customers and review caveat.** Osborne Clarke adopted the Space Scheduling module with a mobile app, and Mishcon de Reya uses it for room booking at its London HQ. A FitGap review says Workplace Central "is not primarily a meeting room booking system" — [casestudies.com: Osborne Clarke](https://www.casestudies.com/company/mri-software/case-study/osborne-clarke-returns-to-the-office-using-mris-space-scheduling-tools); [casestudies.com: Mishcon de Reya](https://www.casestudies.com/company/mri-software/case-study/mishcon-de-reya-simplifies-desk-booking-by-implementing-space-scheduling-software); [FitGap](https://us.fitgap.com/products/011976/mri-workplace-central) (all snippets)
- **Index listing.** Workplace Central, Space Scheduling, NETfacilities and Energy sit together under "Facilities, Energy & Workplace" — [MRI products index](https://www.mrisoftware.com/products/)
- **Trezo / Kinnosa.** Searches for "Kinnosa" and "Trezo" with MRI and booking terms returned nothing linking either name to MRI — searches performed 2026-11-03 (no relevant hits).

**OnLocation (presence, visitor, footfall)**
- **WhosOnLocation** (NZ) was acquired as "an integrated solution for workplace safety and security", before April 2021 — [MRI NZ press release](https://www.mrisoftware.com/nz/?p=29744) (snippet; exact date not retrieved); [MRI press release, 14 Apr 2021](https://www.mrisoftware.com/news/mri-software-completes-acquisition-manhattan-real-estate-workplace-solutions/)
- **The 2026 index lists** "OnLocation Suite, OnLocation People Presence Management, OnLocation Footfall Analytics" — [MRI products index](https://www.mrisoftware.com/products/)
- **Springboard** (UK retail footfall, AI on existing camera networks) was acquired in October 2022 — [MRI NZ news](https://www.mrisoftware.com/nz/news/mri-software-acquires-springboard-retail-footfall-ai-analytics/) (snippet)

**MRI Evolution (CAFM/CMMS, ex-FSI Concept Evolution)**
- **The acquisition.** MRI acquired UK-based FSI (FM Solutions) in August 2021 and rebranded it in June 2022:
  - "Concept Evolution, FSI's premier cloud-based FM software, continues to serve the market as MRI Evolution"
  - FSI brought "CAFM, mobile workforce enablement and smart building support" and more than 300 clients
  - Products: MRI Evolution, **Evolution GO** (mobile engineers) and **Evolution Contractor** (subcontractor management)
  - Sources: [MRI SG: FSI becomes MRI Software](https://www.mrisoftware.com/sg/?p=40041); [MRI NZ](https://www.mrisoftware.com/nz/?p=42274); [TwinFM: MRI acquires FSI](https://www.twinfm.com/article/mri-software-acquires-fsi) (snippets)
- **Review-site profile.** Browser-based "CAFM/CMMS IWMS" with work orders, PM, asset tracking, space management and vendor management. One reviewer noted the lack of a comprehensive financial module — [Capterra](https://www.capterra.com/p/32352/Concept/) (snippet)
- **Public sector.** It is listed on UK G-Cloud 14 — [G-Cloud 14 listing](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud-14/services/507168932461863) (snippet)

**MRI Angus (building operations / work orders, ex-Angus Systems)**
- Acquired Jan 2022, Toronto, more than 700 customers, 2.7bn sq ft in North America; rebranded mid-2022. Modules are in Q1 — [Commercial Observer](https://commercialobserver.com/2022/01/mri-software-angus-systems); [MRI Angus](https://www.mrisoftware.com/products/angus/)
- A deal database says Angus added facilities management, access control and tenant experience, plus about 120 employees — [Mergr](https://mergr.com/mri-software-acquires-angus-systems-group) (snippet)

**NETfacilities (CMMS)**
- Listed on the 2026 index. Third parties describe it as "a cloud-based Computerized Maintenance Management System (CMMS) for facilities and property managers" with asset tracking and PM scheduling — [MRI products index](https://www.mrisoftware.com/products/); [SoftwareConnect](https://softwareconnect.com/facility-management/netfacilities/) (snippet)
- G2 lists it as "MRI Facilities Management" — [G2](https://www.g2.com/products/mri-facilities-management) (snippet)
- Origin not established (see Gaps).

**Horizon (legacy UK IWMS)**
- Covered in Q2. It was an IWMS (FCO: lease, IFRS 16 and FM across more than 5,000 properties) and is now rebranded ProLease Enterprise — [Mann Report, 22 Aug 2019](https://www.mannpublications.com/mannreport/2019/08/22/mri-softwares-horizon-iwms-platform-selected-by-uk-fco-to-manage-global-property-portfolio/) (snippet)

**Anacle (APAC facilities, digital workplace and energy)**
- Covered in Q1. MRI cites Anacle's "smart infrastructure, sustainability, and government-grade lifecycle asset management" — [MRI UK, 9 Jun 2025](https://www.mrisoftware.com/uk/?p=85683)

### Inferences
- **Overlapping FM/work-order products.** MRI has at least four overlapping work-order products: Angus (landlord building ops, North America), Evolution (CAFM, UK/global), NETfacilities (CMMS) and ManhattanONE Facilities Maintenance, plus Anacle's APAC FM. They overlap functionally and serve different regions and buyers. No consolidation or sunset has been announced.
- **Space and booking.** Space planning and booking exist in both ManhattanONE (Space, Room & Desk Booking, Utilization) and Workplace Central / Space Scheduling. Workplace Central looks like MRI's lighter, standalone workplace product next to the full Manhattan IWMS. This is inference; MRI does not state it.
- **The user's names.** "Evolution" exists (ex-FSI). "Horizon" exists, but as a legacy name now sold as ProLease Enterprise. "Manhattan Central" is not a current name: the product is **ManhattanONE**.

### Gaps
- **Unestablished origins:**
  - NETfacilities: not established. One possibility, not verified, is that it came with AMTdirect, which MRI described as a "lease and facilities management" vendor.
  - Space Scheduling: not established.
  - CenterStone: no product description was found.
- **Unconfirmed dates:** the exact WhosOnLocation acquisition date and the Workplace Central launch date were not retrieved.
- **Paywalled analyst detail:** Verdantix 2025 placement details and any Gartner IWMS/CPIP coverage are paywalled and were not seen.
- **Trezo and Kinnosa:** no evidence links either to MRI, and both may be misattributions.

---

## Q4. Investment management (Investment Management suite, Agora Insights, fund/investor management, investor portal, budgeting/forecasting, valuation, debt/financing)

### Takeaway
MRI's investment stack is a separately licensed suite in two layers, not part of PMX:
- **A modelling layer**, Cougar-derived (acquired 3 Feb 2015): Asset Modeling, Fund Modeling, **Valuations** (formerly "Global Valuations"; DCF plus UK methods) and **Debt Management**.
- **An accounting and investor layer** on MRI Financials: **Investment Accounting** (built in-house, Nov 2016), **Investment Central**, **Investor Connect** and investor reporting, plus Portfolio Management and **Fee Accounting** on the 2026 index.

**MRI Agora / Agora Insights** is the cross-product analytics and AI layer, not an investment product. No product named "Real Asset Financing" exists on the 2026 index: debt is handled by **Debt Management**, which is borrower-side.

### Cited Findings

**Summary of earlier notes**
- **Investment is separate from PMX.** The PMX page lists "Investment Management" as a separate product link — [MRI PMX](https://www.mrisoftware.com/products/property-management-x/)
- **The 2026 investment page modules:**
  - Asset Modeling: "Model capital projects, test development returns, and run scenarios to hit target IRR"
  - Fund Modeling: "powerful forecasting, transactional simulations, and scenario and sensitivity testing"
  - Valuation, Debt Management, Investment Accounting and Investor reporting
  - AI: "AI reporting" ("Cut admin time by 80% using AI reporting")
  - Sources: [MRI investment management page](https://www.mrisoftware.com/products/investment-modeling/); [MRI IE investment page](https://www.mrisoftware.com/ie/?p=57067)
- **Cougar Software.** Acquired 3 Feb 2015 for long-range modelling across fund, debt, valuation, asset and budget management — [MRI press release](https://mrisoftware.com/nz/news/mri-software-announces-acquisition-of-cougar-software)
  - Name history: "MRI Investment Management (IM)" (2016) → "MRI Strategic Planning" with the "Analytix Portal" (2022) → Asset/Fund Modeling (2026) — [MRI, 15 Jul 2016](https://mrisoftware.com/uk/?p=23502); [MRI, 27 Apr 2022](https://www.mrisoftware.com/news/investment-firm-a-s-r-real-estate-selects-mri-software-to-boost-fund-visibility-and-decision-making)
  - **LEGACY names:** Cougar, IM, Strategic Planning and Analytix Portal. None appears on the 2026 index — [MRI products index](https://www.mrisoftware.com/products/)
- **Investment Accounting.** Launched 15 Nov 2016 "within the MRI Financials suite" (Version X.4):
  - Commitments, capital calls and contributions
  - A waterfall engine
  - Consolidations
  - Source: [MRI press release](https://www.mrisoftware.com/news/mri-software-announces-launch-investment-accounting/)
- **Fixed Asset Accounting.** MRI Fixed Asset Accounting is built on RAM (Real Asset Management, UK, acquired 20 Sep 2017) — [MRI press release](https://www.mrisoftware.com/nz/news/mri-software-acquires-real-asset-management-leading-provider-asset-management-solutions/) (snippet)
- **Agora is MRI-built.** Agora Insights is MRI's cross-product dashboarding. Agora Intelligence and Agora Orchestrator were added 25 Jun 2026 (see Q8) — [Commercial Observer, Jun 2026](https://commercialobserver.com/2026/06/mri-software-data-platform-ai-expansion/)

**New research: the current investment product list**
- **The 2026 index** groups "Investment Accounting, Investment Central, Portfolio Management, Valuations" under Investment Management. Its Financials group lists "Budgeting & Forecasting, Debt Management, Enterprise General Ledger, General Ledger, Fee Accounting, Fixed Asset Accounting, Job Cost, AP Automation, Vendor Pay" — [MRI products index](https://www.mrisoftware.com/products/)
- **Investment Central** is described as "Full lifecycle asset management to stay ahead and build investor confidence" — [MRI investment management page](https://www.mrisoftware.com/products/investment-modeling/)
  - Case studies pair "MRI Investment Central and Investor Connect" (National Real Estate Advisors) and use Investment Central for a LIHTC portfolio of more than 240 properties (Stratford Capital) — [casestudies.com](https://www.casestudies.com/company/mri-software/case-study/national-real-estate-advisors-llc-improves-processes-with-mri-investment-central-and-investor-connect); [casestudies.com](https://www.casestudies.com/company/mri-software/case-study/stratford-capital-group-manages-growing-lihtc-portfolio-with-data-management-services-and-investment-central) (snippets)
- **Fee Accounting** is on the index but is not described on the investment page — [MRI products index](https://www.mrisoftware.com/products/); [MRI investment management page](https://www.mrisoftware.com/products/investment-modeling/)
- **Valuations (formerly "Global Valuations"):**
  - Aimed at appraisers, valuers and analysts
  - Methods: "Term and Reversion, Hardcore, Discounted Cash Flow, Capitalization, and Equivalent"
  - What-if scenarios
  - "MRI ShaRE" secure file sharing
  - "available in two deployment models", plus a SaaS offering
  - Trials proved a "UK-ready calculation engine"
  - Sources: [MRI news: Re-defining Value with Global Valuation](https://www.mrisoftware.com/news/mri-software-is-re-defining-value-with-global-valuation-solution); [MRI Valuations product page](https://www.mrisoftware.com/products/valuations/) (snippets)
- **Debt and financing.** Debt Management gives "all portfolio debt in one place" — [MRI investment management page](https://www.mrisoftware.com/products/investment-modeling/)
  - A Debt Modeling overview describes "a central repository for all debt contracts, a sophisticated debt calculation engine" — [MRI AU resources](https://www.mrisoftware.com/au/resources/side/80/) (from earlier notes)
  - No "Real Asset Financing" product appears on the 2026 index — [MRI products index](https://www.mrisoftware.com/products/)
- **Budgeting & Forecasting** is a PMX Financials module. It gained multicurrency in X.5.2 and inflation and seasonal index reloads in X.5.7 — [MRI X.5 release notes](https://info.mrisoftware.com/x5-release-us)
- **Agora availability.** The June 2026 Agora Intelligence release lists commercial, multifamily, residential, social housing, local authority and occupier sectors. Investment management is not named — [Finanznachrichten (MRI release), 25 Jun 2026](https://www.finanznachrichten.de/nachrichten-2026-06/68865626-mri-software-launches-agora-intelligence-and-agora-orchestrator-delivering-ai-powered-recommendations-and-workflow-execution-for-real-estate-008.htm)

### Inferences
- **Origin of Valuations.** Valuations is most likely Cougar heritage, since Cougar covered "valuation management" in 2015. The Global Valuation release does not state its origin.
- **What "investor management" means at MRI.** Investment Accounting covers capital calls, waterfalls and distribution statements. Investor Connect covers portal and reporting. MRI does not market a stand-alone "Investor Management" or "Fund Administration" brand comparable to Juniper Square.
- **"Real Asset Financing" is likely a misattribution.** Lender-side loan servicing was not found in MRI's catalogue; Yardi sells Debt Manager – Lender.

### Gaps
- **Undescribed modules:** no current descriptions were found for Portfolio Management or Fee Accounting.
- **Investor Connect:** its origin and current portal feature set (e-sign subscriptions, K-1 distribution) were not found.
- **Waterfall mechanics:** preferred return, catch-up and clawback are still undocumented publicly.
- **Valuations deployment:** whether Valuations still offers an on-prem deployment in 2026 is unclear.

---

## Q5. Construction / capital projects, procurement and AP automation

### Takeaway
MRI has **no dedicated construction-management product**. No product named "ProjectBridge" was found.

Capital-project functionality is spread across:
- **Job Cost** (PMX Financials)
- **Project4000** (ex-RAM, sold with Asset4000 as "Series4000")
- **ManhattanONE "Projects"**
- The "project" module that came with ProLease (2019)

**AP and procurement automation** is partner-delivered:
- **MRI AP Automation powered by Nexus** (Nexus has been owned by Bottomline since 2022)
- **MRI Vendor Pay powered by AvidXchange** (US)
- **MRI AP Essentials** for UK Qube/Horizon customers

**Callmax** is a 2016 acquisition, but not an AP product. No "MRI Payment Solutions" brand exists on the 2026 index.

### Cited Findings
- **Job Cost** is part of the PMX Financials suite — [MRI IE PMX page](https://www.mrisoftware.com/ie/products/property-management-x/)
- **Project4000 / Series4000:**
  - An MRI case study describes a company choosing "Series4000 modules (Asset4000 and Project4000)" for multi-book depreciation — [casestudies.com: Toyota parts manufacturer](https://www.casestudies.com/company/mri-software/case-study/large-toyota-parts-manufacturer-selects-series4000-to-manage-fixed-assets) (snippet)
  - Asset4000 is now "MRI Fixed Asset Accounting", adopted by "over 3,000 organisations in more than 70 countries" — [Capterra UK](https://www.capterra.co.uk/software/45450/asset4000) (snippet)
  - Both Asset4000 and Project4000 remain on the 2026 index — [MRI products index](https://www.mrisoftware.com/products/)
  - Origin: RAM, acquired Sep 2017 — [MRI press release](https://www.mrisoftware.com/nz/news/mri-software-acquires-real-asset-management-leading-provider-asset-management-solutions/) (snippet)
- **ManhattanONE "Projects"** covers project planning and delivery — [MRI ManhattanONE](https://www.mrisoftware.com/products/manhattanone/)
- **ProLease 2019 modules** included "project" and "maintenance" — [MRI CA press release, 31 Jul 2019](https://www.mrisoftware.com/ca/news/mri-software-acquires-prolease-corporate-occupiers-new-global-lease-accounting-standards-workplace-management/). They are not described on the current ProLease page — [MRI ProLease](https://www.mrisoftware.com/products/prolease/)
- **Asset Modeling** models capital projects and development returns against a target IRR. This is an investment-side capex appraisal, not construction management — [MRI investment management page](https://www.mrisoftware.com/products/investment-modeling/)
- **"ProjectBridge"** returned no MRI-related results — search performed 2026-11-03 (no relevant hits)
- **AP automation (from earlier notes):**
  - "MRI AP Automation powered by Nexus Systems" launched 17 Nov 2016 for Canada, Latin America, EMEA, Asia and ANZ — [MRI AP Automation webinar page](https://www.mrisoftware.com/resources/demo-ap-automation/)
  - Bottomline acquired Nexus in September 2022 — [Bottomline press release](https://bottomline.com/newsroom/press-releases/bottomline-acquires-nexus-systems)
  - US: "MRI Vendor Pay powered by AvidXchange", later expanded with AvidInvoice — [MRI CA news](https://www.mrisoftware.com/ca/?p=23216) (snippet)
  - UK: AP Essentials is "deeply integrated into MRI Qube Property Management and MRI Horizon" — [MRI AP Essentials datasheet](https://www.mrisoftware.com/uk/resources/ap-essentials-datasheet/) (snippet)
  - Native PMX has PO approval limits and Workflow Design — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **The 2026 index** lists "AP Automation" and "Vendor Pay" under Financials — [MRI products index](https://www.mrisoftware.com/products/)
- **Callmax:**
  - Acquired 2016; its COO became managing director of "MRI's CallMaX division" — [Aventis Advisors](https://aventis-advisors.com/mri-software-acquisitions/)
  - The 2026 index files Callmax under Marketing, Sales & Leasing (including multifamily), not Financials — [MRI products index](https://www.mrisoftware.com/products/)
  - Background knowledge, not sourced here: Callmax is a UK lettings/estate-agency call-handling service. Treat as unverified.

### Inferences
- **Capital projects.** For CRE owners, MRI's capital-project support is accounting-centric (Job Cost and Project4000 capex control) and IWMS-centric (ManhattanONE Projects). It does not compete with Procore, Yardi Construction Manager or Kahua-style construction PM.
- **"MRI Payment Solutions" and Callmax as AP.** These were probably conflated with MRI's payments brands (RentPayment, Vendor Pay) and with Callmax. Neither is an AP-automation product.

### Gaps
- **Project4000:** no current feature description was found.
- **Partner status:** whether Nexus (Bottomline) is still MRI's international AP partner in 2026 is unconfirmed; the webinar page is undated.
- **Callmax:** its current scope was not verified from a primary source.

---

## Q6. Compliance, ESG and energy

### Takeaway
MRI's ESG and energy offer has four parts:
- **MRI Energy**, formerly **eSight**: UK enterprise energy management, acquired from BID Equity on 2 Nov 2021.
- A **Sustainability Management** / ESG reporting positioning page.
- **Sustainability modules inside ManhattanONE**.
- **Anacle's** APAC energy and smart-infrastructure products (2025).

Independent review sees it as energy-data and disclosure reporting, **"not a full ESG platform"**. Compliance features are module-level, with no stand-alone compliance product:
- Lease compliance in ProLease and ManhattanONE
- Certificate-of-insurance tracking in Angus
- Contract compliance alerts in Contract Intelligence

### Cited Findings
- **eSight acquisition.** MRI acquired eSight Energy (UK) on about 2 Nov 2021, terms undisclosed. Seller: BID Equity. Rationale: energy monitoring to "decrease operating costs, reduce environmental impact, improve facility performance" — [MRI UK press release](https://www.mrisoftware.com/uk/?p=43183) (snippet); [Harvest Partners, 2 Nov 2021](https://harvestpartners.com/?p=1210) (snippet); [Mergr: BID Equity exits eSight](https://mergr.com/transaction/bid-equity-advisory-exits-esight-energy) (snippet)
- **Branding.** The 2026 index lists "Energy" under Facilities, Energy & Workplace — [MRI products index](https://www.mrisoftware.com/products/). Case studies still use "MRI eSight":
  - ENGIE: "web-based energy management"
  - Molson Coors: energy and CO2 reduction across sites
  - Sources: [casestudies.com: ENGIE](https://www.casestudies.com/company/mri-esight/case-study/engie-chooses-esight-as-their-energy-data-platform-accessed-by-clients); [casestudies.com: Molson Coors](https://www.casestudies.com/company/mri-software/case-study/molson-coors-beverage-company-saves-energy-cuts-costs-with-the-dollarense-project-mri-esight) (snippets)
- **Sustainability Management page.** MRI's page "An ESG and Sustainability Manager's system of choice to reach Net Zero" covers business rules and standardised collection protocols to reduce bad data, plus real-time energy monitoring for internal and external reporting — [MRI SG sustainability page](https://www.mrisoftware.com/sg/?p=42303) (snippet)
- **Conflict on carbon scope.** Zoftwarehub says MRI Energy tracks Scopes 1–3 — [Zoftwarehub](https://zoftwarehub.com/en-ae/products/mri-energy/overview) (snippet). Net Zero Compare says MRI is "not a full ESG platform" and lacks full carbon accounting — [Net Zero Compare](https://netzerocompare.com/software/mri-software) (snippet)
- **ManhattanONE "Sustainability"** covers energy and utility tracking — [MRI ManhattanONE](https://www.mrisoftware.com/products/manhattanone/)
- **Anacle** brought "energy" and "sustainability" capabilities. MRI says Anacle will be "enhanced with MRI's broader real estate and energy technology offerings" — [MRI UK, 9 Jun 2025](https://www.mrisoftware.com/uk/?p=85683)
- **Compliance features:**
  - ProLease "lease compliance" — [MRI ProLease](https://www.mrisoftware.com/products/prolease/)
  - ManhattanONE "Lease Compliance" — [MRI ManhattanONE](https://www.mrisoftware.com/products/manhattanone/)
  - Angus "Certificate of Insurance" collection and tracking — [MRI Angus](https://www.mrisoftware.com/products/angus/)
  - Contract Intelligence compliance checks and alerts — [MRI Contract Intelligence](https://www.mrisoftware.com/products/contract-intelligence/)

### Inferences
- **Narrow ESG offer.** MRI's ESG offer is energy-management-led (eSight heritage) rather than a GRESB/CSRD-grade ESG data platform. The ESG reporting depth claims come only from listing sites.

### Gaps
- No MRI source was found on GRESB, CSRD, SFDR or the NYC LL97 module.
- The current "Energy" product page was not fetched, so eSight's carbon-accounting scope remains contested.

---

## Q7. How the commercial and occupier products fit the core financial platform, and which are sold standalone (the MRI stack)

### Takeaway
MRI's non-residential stack is a **hub-and-spoke** around the MRI X / PMX financials:
- **The hub:** GL, Enterprise GL, AP, Corporate AR, Fixed Assets, Budgeting & Forecasting and Job Cost.
- **Landlord-side spokes:** Commercial Management, Advanced Retail, Lease Flow, Tenant Connect/Engage, Investment Accounting.
- **The AI/data layer:** **MRI Agora** (Ask Agora, Agora Insights, Agora Intelligence, Agora Orchestrator) sits across all sectors, including occupier and FM.

Most acquired occupier, workplace, FM and energy products are **sold standalone**, with their own product pages and customer bases. They connect through point integrations rather than a shared ledger: ProLease, ManhattanONE, Evolution, Angus, NETfacilities, Energy (eSight), OnLocation, Valuations, Contract Intelligence and Simplicity.

### Cited Findings
- **The 2026 index** separates "Property Management & Financials" (PMX plus the financial modules) from Investment Management, Facilities/Energy/Workplace, Lease Management and others — [MRI products index](https://www.mrisoftware.com/products/)
- **Documented integrations:**
  - Lease Flow to Commercial Management: "direct integration… eliminates duplicate entry" — [MRI Lease Flow](https://www.mrisoftware.com/products/leaseflow/)
  - Engage @Work links to MRI Angus for work orders and syncs PMX data with payment providers — [GlobeSt, 16 Jun 2023](https://www.globest.com/2023/06/16/mri-software-launches-commercial-tenant-portal)
  - Contract Intelligence feeds abstracted data into ProLease for lease accounting — [MRI Contract Intelligence](https://www.mrisoftware.com/products/contract-intelligence/); [MRI ProLease](https://www.mrisoftware.com/products/prolease/)
  - Manhattan clients got access to lease abstraction and WhosOnLocation after the acquisition — [MRI press release, 14 Apr 2021](https://www.mrisoftware.com/news/mri-software-completes-acquisition-manhattan-real-estate-workplace-solutions/)
  - Workplace Central uses WhosOnLocation for visitor movement — [MRI Workplace Central](https://mrisoftware.com/products/workplace-central)
  - Investment Accounting is "built within the MRI Financials suite" — [MRI press release, 15 Nov 2016](https://www.mrisoftware.com/news/mri-software-announces-launch-investment-accounting/)
  - Fund Modeling is "integrated with its existing MRI property management and accounting platform" (United Properties) — [casestudies.com](https://www.casestudies.com/company/mri-software/case-study/united-properties-boosts-efficiency-with-mri-fund-modeling) (snippet)
- **Pages with no PMX integration statement:** MRI Angus, ManhattanONE and Workplace Central pages describe no PMX or Commercial Management integration — [MRI Angus](https://www.mrisoftware.com/products/angus/); [MRI ManhattanONE](https://www.mrisoftware.com/products/manhattanone/); [MRI Workplace Central](https://mrisoftware.com/products/workplace-central)
- **Agora as the horizontal layer.** MRI says Agora helps teams "across the commercial, residential, subsidized housing, facilities management and corporate occupier sectors globally operationalize AI". Agora Intelligence is "built on Agora Insights, a cross-product data and analytics dashboarding solution" — [Finanznachrichten (MRI release), 25 Jun 2026](https://www.finanznachrichten.de/nachrichten-2026-06/68865626-mri-software-launches-agora-intelligence-and-agora-orchestrator-delivering-ai-powered-recommendations-and-workflow-execution-for-real-estate-008.htm)
  - MRI also describes Agora as linking MRI products, partner solutions and third-party apps (snippet via search summary) — [MRI news, Oct 2025](https://www.mrisoftware.com/news/mri-software-unveils-advanced-ai-companion-to-transform-real-estate-workflows/)
- **Partner and API ecosystem.** The index lists "Application eXchange" and "Information eXchange" — [MRI products index](https://www.mrisoftware.com/products/)

**Product master table** (status as of Nov 2026)

| Product | Segment | Origin (year) | Region | Deployment (if stated) | Standalone? |
|---|---|---|---|---|---|
| PMX / Commercial Management | Landlord commercial PM and accounting | In-house; Version X 2014; APAC relaunch May 2024 | Global | MRI Cloud referenced | Core hub |
| Advanced Retail | Retail % rent, sales, recoveries | In-house | Global | n/s | Add-on to Commercial Management |
| Lease Flow | Leasing CRM / deal modelling | Unknown | n/s | n/s | Integrated with Commercial Management |
| Contract Intelligence (ex-Leverton) | AI lease/contract abstraction | Acquired Jul 2019 | Global, 25+ languages | n/s | Standalone; feeds ProLease |
| Tenant Connect / Engage @Work | Tenant portal / experience | Tenant Connect in-house; Engage remaining 80% in 2019; @Work launched Jun 2023 | n/s | n/s | Add-on |
| MRI Angus (ex-Angus AnyWhere) | Building ops, work orders, visitor/access | Acquired Jan 2022 | North America | n/s | Standalone |
| MRI Simplicity (ex-Anacle) | APAC commercial PM, FM, energy | Acquired Jun 2025 | APAC | n/s | Standalone |
| ProLease (Enterprise/Central/Direct) | Occupier lease admin and accounting | ProLease Jul 2019; Enterprise = ex-Horizon (Qube, Oct 2017) | Global; strong UK public sector | "true SaaS" (snippet) | Standalone |
| AMTdirect | Occupier lease accounting/admin | Acquired Jan 2021 | US | n/s | Not on 2026 index (status unclear) |
| ProCalc | Lease analysis | With ProLease, 2019 | n/s | n/s | Standalone tool |
| ManhattanONE | Occupier IWMS | Acquired from Trimble, Apr 2021 | NA, Europe, APAC | n/s | Standalone |
| CenterStone | FM/IWMS (ex-Trimble) | Likely with Manhattan, 2021 | n/s | n/s | Listed; no detail |
| Workplace Central / Space Scheduling | Space planning, booking, utilization | MRI-launched (c. 2020, unconfirmed) | Global (UK cases) | n/s | Standalone |
| OnLocation (WhosOnLocation, Springboard) | Presence/visitor; footfall | NZ (before Apr 2021); UK (Oct 2022) | Global | n/s | Standalone |
| MRI Evolution (ex-FSI Concept Evolution) | CAFM/CMMS | Acquired Aug 2021, rebranded Jun 2022 | UK/global | "cloud-based" | Standalone |
| NETfacilities | CMMS | Unknown | n/s | cloud (3rd-party) | Standalone |
| MRI Energy (ex-eSight) | Energy/ESG data | Acquired Nov 2021 | UK/global | web-based | Standalone |
| Investment modelling (Asset/Fund Modeling, Debt Mgmt) | Investment modelling | Cougar, Feb 2015 | Global | n/s | Separate suite |
| Valuations (ex-Global Valuations) | Valuation | Likely Cougar (inference) | UK + global | Two models + SaaS | Standalone |
| Investment Accounting / Investment Central / Investor Connect | Fund accounting, investor reporting | IA in-house Nov 2016; others unknown | Global | On MRI Financials | Separate modules |
| Fixed Asset Accounting / Asset4000 / Project4000 | Fixed assets, capex | RAM, Sep 2017 | UK origin; 70+ countries | n/s | Standalone or in Financials |
| AP Automation (Nexus) / Vendor Pay (AvidXchange) | AP automation | Partners (2016 / US) | International / US | Partner SaaS | Add-on |
| MRI Agora (Ask Agora, Insights, Intelligence, Orchestrator) | AI/data layer | In-house; Agora 2024; Intelligence/Orchestrator Jun 2026 | Global | Cloud | Cross-product layer |

Sources for the table are the rows' citations throughout this file. "n/s" = not stated in sources found.

### Inferences
- **Two integration tiers.**
  - **Shared-ledger tier:** PMX Financials, Commercial Management, Advanced Retail, Investment Accounting, Budgeting, Job Cost and Fixed Assets. Property-level transactions roll into enterprise and fund accounting here.
  - **Standalone tier:** ProLease, ManhattanONE, Evolution, Angus, Energy, OnLocation, Valuations and Simplicity. Each is sold to its own buyer (corporate real estate, FM, energy manager, valuer) with point integrations.
  - **Agora** is MRI's strategy for unifying the two tiers at the data and AI layer rather than by code consolidation.
- **Occupier buyers rarely need PMX.** A corporate occupier would typically buy ProLease or ManhattanONE (plus Workplace Central, Evolution or Energy) and integrate with its own ERP, never touching PMX.

### Gaps
- MRI publishes no integration matrix showing which standalone products exchange data natively with PMX GL.
- Bundling and pricing across the stack are not public.

---

## Q8. Recent 2024–2026 launches, rebrands, sunsets and AI features in these lines

### Takeaway
The 2024–2026 story is (1) **AI via MRI Agora** and (2) **APAC expansion through Anacle**:
- May 2024: Agora platform and Ask Agora
- June 2025: PMX AI agent and page assistant
- October 2025: expanded Ask Agora "AI companion"
- June 2026: Agora Intelligence and Agora Orchestrator, and a Digie award
- **Rebrands:** Anacle Simplicity → MRI Simplicity; Horizon → ProLease Enterprise, with ProLease tiering. Earlier rebrands in 2022: Angus, FSI/Evolution.
- **Recognition:** in October 2026 MRI was named an IDC MarketScape Leader for ProLease.
- **No sunsets** of commercial, occupier, workplace or investment products were found announced. Several names have simply disappeared from the 2026 index: AMTdirect, Horizon, Strategic Planning and eSight as a brand.

### Cited Findings
- **May 2024.** Next-generation PMX (APAC) shipped with Ask Agora, Agora Insights, Studio Suite, PMX Reimagined (X.7) and PMX On-the-Go — [Elite Agent, 8 May 2024](https://eliteagent.com/mri-software-announces-next-generation-property-management-tech/). Verdantix covered the Agora platform launch — [Verdantix blog](https://www.verdantix.com/insights/blog/where-ambition-meets-innovation-mri-software-unveils-new-agora-platform) (title only)
- **March–June 2025.** The Anacle take-private was announced in March and completed 9 Jun 2025 — [MRI UK, 9 Jun 2025](https://www.mrisoftware.com/uk/?p=85683). Simplicity was later rebranded MRI Simplicity — [MRI AU](https://www.mrisoftware.com/au/news/anacle-systems-mri-software-rebrand/) (snippet)
- **June 2025.** MRI introduced an AI agent (agentic month-end close) and a page assistant for PMX, in limited availability — [Mann Report, 2 Jun 2025](https://www.mannpublications.com/mannreport/2025/06/02/mri-software-introduces-ai-agent-and-page-assistant/) (snippet); [YieldPro, 3 Jun 2025](https://yieldpro.com/2025/06/terry-keller)
- **20 Oct 2025.** "MRI Software Unveils Advanced AI Companion to Transform Real Estate Workflows": an expanded Ask Agora said to be trained on real-estate use cases. MRI cited "more than a quarter of a million monthly active users" of its AI features — [MRI news](https://www.mrisoftware.com/news/mri-software-unveils-advanced-ai-companion-to-transform-real-estate-workflows/) (snippet); headline date from [MRI platform news index](https://www.mrisoftware.com/news/category/platform/)
- **22 Oct 2025.** MRI announced a strategic regional investment in the Middle East — [MRI platform news index](https://www.mrisoftware.com/news/category/platform/)
- **3 Mar 2026.** MRI's record-year release:
  - Almost 2,000 new clients in 2025 (about 20% year-on-year)
  - Expanded relationships with nearly 7,000 clients
  - "98% time reduction in finance report creation" from AI
  - New offices in Singapore, the Philippines, South Africa, Canada and Saudi Arabia
  - Expanded "commercial and facilities management offerings in Asia"
  - No acquisitions mentioned
  - Source: [MRI, 3 Mar 2026](https://www.mrisoftware.com/uk/?p=96392)
- **10 Jun 2026.** MRI Agora won a 2026 Digie Award for Best Tech Innovation in Commercial Real Estate — [MRI platform news index](https://www.mrisoftware.com/news/category/platform/)
- **25 Jun 2026: Agora Intelligence.**
  - Daily role-specific briefings across leasing, finance and operations
  - Findings tagged as risks, trends, watches or opportunities, with confidence and data-completeness scores
  - Source: [Finanznachrichten (MRI release)](https://www.finanznachrichten.de/nachrichten-2026-06/68865626-mri-software-launches-agora-intelligence-and-agora-orchestrator-delivering-ai-powered-recommendations-and-workflow-execution-for-real-estate-008.htm)
- **25 Jun 2026: Agora Orchestrator.**
  - Agentic workflows from a pre-built agent catalog, with human-in-the-loop steps and a searchable, exportable audit trail
  - Generally available to clients globally, including the commercial and occupier sectors
  - Source: [Finanznachrichten (MRI release)](https://www.finanznachrichten.de/nachrichten-2026-06/68865626-mri-software-launches-agora-intelligence-and-agora-orchestrator-delivering-ai-powered-recommendations-and-workflow-execution-for-real-estate-008.htm)
  - Commercial Observer tied the launch to new Chief Innovation Officer Nihar Malik — [Commercial Observer, Jun 2026](https://commercialobserver.com/2026/06/mri-software-data-platform-ai-expansion/)
- **15 Oct 2026.** MRI was named a Leader in the IDC MarketScape for Worldwide AI-Enabled Lease Administration Applications 2026, highest on capabilities, for ProLease — [TechIntelPro (syndicated MRI release)](https://techintelpro.com/AI/Enterprise-AI/mri-software-named-leader-in-2026-idc-marketscape-for-lease-admin) (snippet)
- **January 2025.** Verdantix's CPIP/IWMS Green Quadrant names MRI a leader — [Verdantix](https://www.verdantix.com/report/real-estate-built-environment/green-quadrant-connected-portfolio-intelligence-platforms-cpip-iwms-2025) (snippet)
- **Other 2024–2025 deals:**
  - Capita One, UK public-sector/local-government software (2024)
  - An Indian container-lessor/depot software provider (2024)
  - Proptech Labs (Australia, residential, Oct 2025)
  - None are in the commercial, occupier or investment lines
  - Sources: [Aventis Advisors](https://aventis-advisors.com/mri-software-acquisitions/); [VIR: Proptech Labs](https://vir.com.vn/mri-software-2025-proptech-labs-acquisition-for-unified-solutions-138080.html) (snippet)
  - Inference: the container-lessor target is likely the iInterchange Systems deal listed on MergerLinks for 9 Dec 2024 — [MergerLinks](https://app.mergerlinks.com/transactions/2024-12-09-iinterchange-systems) (snippet)
- **No 2026 acquisitions.** A search found no MRI acquisition announced in 2026, and the March 2026 results release mentions none — [MRI, 3 Mar 2026](https://www.mrisoftware.com/uk/?p=96392)

**Legacy and rename register (non-residential)**

| Legacy name | Current name | Source |
|---|---|---|
| Leverton | MRI Contract Intelligence | [Dealroom](https://app.dealroom.co/companies/leverton_1) (snippet) |
| Qube Horizon / MRI Horizon for Occupiers | MRI ProLease Enterprise | [G-Cloud](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud-14/services/813712730500263) (snippet) |
| Trimble Manhattan | ManhattanONE | [MRI ManhattanONE](https://www.mrisoftware.com/products/manhattanone/) |
| FSI Concept Evolution | MRI Evolution | [MRI NZ](https://www.mrisoftware.com/nz/?p=42274) (snippet) |
| Angus AnyWhere | MRI Angus; MIRRA → MRI MIRRA | [MRI CA](https://www.mrisoftware.com/ca/?p=41465) (snippet) |
| eSight | MRI Energy (case studies still say "MRI eSight") | [MRI products index](https://www.mrisoftware.com/products/) |
| Anacle Simplicity | MRI Simplicity | [MRI AU](https://www.mrisoftware.com/au/news/anacle-systems-mri-software-rebrand/) (snippet) |
| Cougar → Investment Management (IM) → Strategic Planning / Analytix Portal | Asset/Fund Modeling, Debt Management | [MRI, 27 Apr 2022](https://www.mrisoftware.com/news/investment-firm-a-s-r-real-estate-selects-mri-software-to-boost-fund-visibility-and-decision-making) |
| Global Valuations | Valuations | [MRI Valuations](https://www.mrisoftware.com/products/valuations/) |
| RAM Asset4000 | MRI Fixed Asset Accounting (Asset4000 still on index) | [Capterra UK](https://www.capterra.co.uk/software/45450/asset4000) (snippet) |
| Springboard | OnLocation Footfall Analytics | [MRI products index](https://www.mrisoftware.com/products/) |

- **AMTdirect:** absent from the 2026 index; status unknown.

### Inferences
- **Where AI is concentrated.** AI investment is concentrated in the horizontal Agora layer and in lease abstraction (Contract Intelligence and ProLease), rather than in the workplace or FM products. No AI features are described on the Angus, Evolution, ManhattanONE or Workplace Central pages.
- **Consolidating by brand, not code.** MRI appears to be consolidating its occupier line under the ProLease brand: Horizon became ProLease Enterprise and AMTdirect has dropped off the index. In FM it keeps multiple products alive under "MRI" prefixes. No formal end-of-life notices were found.

### Gaps
- **AI companion release:** the full 20 Oct 2025 text was not fetched; details are from a search summary.
- **End-of-life notices:** none were found, though they may exist in client-only portals.
- **Agora pricing:** whether Agora features are bundled or priced separately is not public.
