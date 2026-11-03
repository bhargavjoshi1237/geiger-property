# MRI Property Management X (PMX): multi-entity accounting and commercial/retail lease administration fact check

Research date: 2026-11-02. This covers MRI Property Management X (PMX), its Financials and Enterprise Ledger, Commercial Management, Advanced Retail, the AP partners (Nexus/Bottomline, AvidXchange) and occupier-side products (AMTdirect).

**How to read the sources**
- Most evidence is MRI's own material: product pages, press releases, the MRI functional specification and X.5 release notes. Treat it as vendor claims.
- The MRI functional specification page (https://www.mrisoftware.com/mrifunctionalspecs/) is the most precise first-party source on module boundaries. It is undated, and copies were uploaded in Feb and Oct 2023.
- Independent sources (G2, Capterra, GetApp, trade press) were thin. G2 returned HTTP 403, so the G2 points come from search snippets.
- A public MRI WebHelp instance (mrix.kettler.com) had an expired TLS certificate. Only its page title was usable.
- Items marked "(snippet)" come from search-result text, not a fetched page.

**Verdict summary**

| # | Claim | Verdict | Product that actually provides it |
|---|---|---|---|
| 1 | PMX identity: APAC, commercial, "enterprise ERP" | PARTLY TRUE | PMX is MRI's core platform suite, built on "Platform X" and sold worldwide. The May 2024 "next-generation PMX" launch targeted APAC commercial real estate. "ERP" is used by customers, not by MRI's own copy. |
| 2a | Multi-layered org trees | TRUE | Enterprise Ledger, a separate Financials product: "Entities above the property level in the ownership structure" |
| 2b | Intercompany "without manual journal entries" | OVERSTATED | Enterprise Ledger creates "automated inter-entity offsets and eliminating entries". MRI release notes also describe *manual* inter-entity entries. No source uses the quoted wording. |
| 3a | Multi-currency and consolidation | TRUE (minor caveats) | GL, AP, Commercial Management (dual currency), Budgeting and Investment Accounting |
| 3b | VAT/GST/regional tax | PARTLY TRUE | AP "tax engine", inclusive tax on tenant transactions, ANZ tax invoice. Malaysia GST and EMEA service charges need purchased Regional Packs. |
| 4 | Multi-tier AP approval by $ threshold and department signing authority | PARTLY TRUE / UNVERIFIABLE on specifics | Native PMX has voucher, PO and payment approvals, PO approval limits and Workflow Design. Full AP automation is a partner product: Nexus (owned by Bottomline since 2022) outside the US, AvidXchange in the US. MRI did not acquire either. |
| 5 | CAM/recovery reconciliations | TRUE (module and detail caveats) | Commercial Management recoveries. Retail recoveries depth is in Advanced Retail. Gross-up and exclusion mechanics are not publicly documented. |
| 6 | Percentage rent "automatically pulls tenant POS data" | OVERSTATED (POS part); TRUE (breakpoints) | Advanced Retail add-on. Sales arrive through the Tenant Connect portal or client-supplied data. No POS integration is documented. |
| 7 | CPI indexation and compound fixed-% escalations | PARTLY TRUE | CPI and fixed escalations are supported per MRI marketing. Compounding is undocumented. AMTdirect CPI Manager is a separate occupier-side product. |

---

## Q1. What exactly is MRI Property Management X (PMX)? When was it launched, which regions and segments does it target, how does it relate to other MRI products, and is "enterprise ERP" a fair description?

### Takeaway
PMX is not a new APAC-only product. It is MRI's long-standing flagship core suite, the "X" generation of MRI's web platform (Version X shipped in October 2014). MRI's Ireland/UK page describes it as "built on Platform X". Its modules include Commercial Management, Residential Management, Advanced Retail, a Financials suite (GL, AP, Corporate AR, Fixed Assets, Budgeting & Forecasting, Job Cost), Investment, Tenant Connect and others. It is sold worldwide.

What launched in **May 2024** was the **"next-generation PMX" for APAC commercial real estate**. It added a UI refresh, PMX X.7, Studio Suite, a mobile app and Ask Agora AI. MRI Agora is the AI and data layer on top, not the accounting engine. "Commercial Management" and "Residential Management" are modules or brand names of the same platform, not separate systems.

"Enterprise ERP" is fair only as a **real-estate-vertical ERP** (property operations plus full financials). MRI's copy calls it a "real estate & financials tech platform". The "ERP" label comes from customer testimonials and reviews.

**Verdict: PARTLY TRUE.** The APAC/commercial framing describes the 2024 relaunch, not the product's full scope. Residential use is real: UK Build-to-Rent, and more than 1M residential units managed.

### Cited Findings

**Launch, scale and regions**
- **The 2024 relaunch.** On 8 May 2024 MRI announced "its next-generation Property Management X™ (PMX) solution for the APAC commercial real estate (CRE) industry", "designed for commercial property professionals". MRI's APAC VP of Product calls PMX "our flagship PMX product" and "our tallest skyscraper" in "MRI's full suite" — [Elite Agent, 8 May 2024](https://eliteagent.com/mri-software-announces-next-generation-property-management-tech/). The MRI AU press release itself is at [mrisoftware.com/au](https://mrisoftware.com/au/news/revolutionising-real-estate-efficiency-next-generation-property-management-system); the fetch failed (ECONNRESET).
  - **Date conflict:** one search-engine summary said "August 2024" (snippet), which conflicts with the 8 May 2024 byline. The May date is the better-supported one.
- **What the relaunch comprised:**
  - Ask Agora, a generative-AI Q&A over PMX data
  - MRI Agora Insights, cross-product dashboards
  - PMX Studio Suite, a web toolkit for pages, reports and workflows
  - PMX Reimagined, a UI/UX redesign for PMX X.7 clients
  - PMX X.7 back-end architecture
  - PMX On-the-Go, a mobile app free to MRI Cloud clients
  - It is described as "the result of a comprehensive, multi-year initiative".
  - Source: [Elite Agent, 8 May 2024](https://eliteagent.com/mri-software-announces-next-generation-property-management-tech/)
- **Scale.** PMX has "over 2,500 clients and 50,000 end users worldwide", and PMX clients manage more than one million residential units worldwide — [Elite Agent, 8 May 2024](https://eliteagent.com/mri-software-announces-next-generation-property-management-tech/)
- **Predecessor: Version X.** MRI announced "Version X" of "its professional property management software" on 20 Oct 2014 in Cleveland, Ohio. It brought browser and tablet access, revamped menus and global search — [MRI press release, 20 Oct 2014](https://www.mrisoftware.com/news/mri-software-debuts-its-latest-innovative-solution-mri-version-x)

**Modules, platform and segments**
- **The Ireland/UK PMX page:**
  - Describes PMX as "An open, flexible and connected proptech platform", "built on Platform X".
  - **Modules:** Commercial Management ("office, industrial, logistics, retail and mixed-use property portfolios"), Residential Management ("A resident-focused platform for Build-to-Rent"), Advanced Retail, Lease Flow (leasing CRM), Lease Intelligence (AI lease abstraction), Tenant Connect and Connect Suite.
  - **Financials suite:** General Ledger, Accounts Payable, Corporate Accounts Receivable, Fixed Asset Accounting, Budgeting & Forecasting, and Job Cost.
  - **Investment:** Investment Management, Reporting & Analytics, and Strategic Planning.
  - Claims to work across "various sectors, asset types, currencies and geographies" and in "170+ Countries".
  - Source: [MRI IE PMX page](https://www.mrisoftware.com/ie/products/property-management-x/)
- **The Australian PMX page** is titled "MRI Property Management X | real estate & financials tech platform". It calls PMX "the most trusted accounting and financial platform in real estate". Sectors are office, industrial & logistics and retail, and it cites "8,800+ commercial management clients" and "4m+ commercial leases" — [MRI AU PMX page](https://www.mrisoftware.com/au/?p=72174)
- **The US/global PMX page** says PMX supports "residential, office, industrial, retail, and mixed-use properties". It is offered across US, Canada, UK, Ireland, South Africa, UAE, Saudi Arabia, Australia, NZ, Singapore, Hong Kong and India — [MRI US PMX page](https://www.mrisoftware.com/products/property-management-x/)
- **US marketing.** PMX AI features were launched in June 2025 and demoed at US events (Realcomm in Savannah, Apartmentalize in Las Vegas):
  - An agentic month-end close workflow
  - Ask Agora's in-page assistant
  - These were in "limited availability"
  - MRI's CTO said "MRI Property Management X is setting a new standard for AI-enabled efficiency."
  - Source: [YieldPro, 3 Jun 2025](https://yieldpro.com/2025/06/terry-keller)
  - Inference: PMX is a global brand, not APAC-only.
- **Same platform in the US.** MRI's US Commercial Real Estate page links to "Property Management X" and quotes a PMX customer. It does not present Commercial Management as a separate platform — [MRI Commercial Management page](https://www.mrisoftware.com/products/commercial-management/)
- **US residential on Version X.** MRI Residential Management – Version X appears in US residential webinars alongside the Multifamily Connect Suite and CondoPlus — [MRI webinar](https://mrisoftware.com/resources/demo-residential-management) (snippet)

**APAC history and adoption**
- **Savills.** Savills extended MRI PMX to South Korea, Japan and Australia in July 2023 — [Mann Report, 13 Jul 2023](https://www.mannpublications.com/mannreport/2023/07/13/savills-expands-use-of-mri-software-in-apac/) (snippet)
- **Loci Solutions.** In July 2023 MRI acquired Loci Solutions, described as its primary APAC PMX implementation partner "for most of the past 15 years" — [Elite Agent](https://eliteagent.com/mri-software-acquires-proptech-services-leader-loci-solutions) (snippet)
- **Anacle (a separate APAC product line).** On 9 Jun 2025 MRI completed a take-private acquisition of Singapore's Anacle Systems, "a pioneer in commercial property management, facilities, digital workplace, energy, and asset management solutions". The release does not say how Anacle relates to PMX — [MRI, 9 Jun 2025](https://www.mrisoftware.com/uk/?p=85683)

**The "ERP" label**
- An Irish/UK customer testimonial on MRI's page says "The PMX ERP solution is really unmatched in the industry" — [MRI IE PMX page](https://www.mrisoftware.com/ie/products/property-management-x/)
- A G2 review is titled "Solid Space-Orientated Real Estate ERP" — [G2 via search](https://g2.com/products/mri-property-management/reviews/mri-property-management-review-51707) (snippet; G2 returned 403)

**Independent sentiment**
- Capterra (US) lists MRI Property Management at 4.2 from 94 reviews in 2026 — [Capterra](https://www.capterra.com/p/79570/MRI-Software/reviews) (snippet)
- A Capterra AU reviewer rated PMX 1.0/5 and called it "a terrible system" — [Capterra AU](https://www.capterra.com.au/reviews/79570/mri-software) (snippet)
- GetApp lists MRI Commercial Management at 3.7/5 from 31 reviews — [GetApp AU](https://www.getapp.com.au/software/2058764/mri-commercial-management) (snippet)
- Small samples.

### Inferences
- **What PMX is.** PMX is best described as MRI's core "Platform X" property management and financials suite, with modules licensed per client: Commercial Management, Residential Management, Advanced Retail, Financials, Enterprise Ledger, Investment, regional packs. A claim that attributes something to "MRI PMX" is accurate at the suite level, but the capability often needs a specific module (see Q2–Q7).
- **"Launched 2024 for APAC."** This describes the relaunch, not the product's origin. PMX's lineage runs back at least to the 2014 Version X release, and APAC implementations go back roughly 15 years per the Loci release.
- **"Enterprise ERP."** Defensible as "real-estate ERP" (operations plus GL/AP/AR/FA/budgeting/job cost). Misleading if it implies a horizontal ERP (HR/payroll/procurement breadth like SAP/Oracle). MRI's own copy says "platform" and "accounting and financial platform".

### Gaps
- No MRI page gives an exact first-release date for the "Property Management X" name. The 2014 Version X release does not name modules.
- MRI's AU press release could not be fetched (ECONNRESET), so wording came from the Elite Agent reprint.
- No 2026 PMX-specific announcement or rename was found. A 2026 MRI Agora award release exists only in a syndicated copy, which was not verified.
- How Anacle's products will coexist with PMX in APAC is not stated publicly.

---

## Q2. Multi-entity GL: does PMX/MRI handle multi-layered org trees and automate intercompany accounting "without manual journal entries"?

### Takeaway
**Multi-layered ownership trees: TRUE**, through **Enterprise Ledger**. The functional spec lists it as a separate Financial product, not part of the base GL. It "Provides support for Entities above the property level in the ownership structure", and Investment Accounting adds consolidation methods.

**Intercompany automation: PARTLY TRUE.** Enterprise Ledger can "Create automated inter-entity offsets and eliminating entries".

**"Without manual journal entries": OVERSTATED.** No MRI source uses that wording, and MRI's own material points the other way:
- The X.5.9 release notes say "manual interentity entries can now be made from the manual journal entry page".
- The MRI WebHelp topic is titled "Creating Elimination Journal Entries" (General Ledger > Enterprise Ledger > Elimination Entries).

The accurate wording is that MRI *automates the offsetting due-to/due-from legs and elimination entries* once inter-entity relationships are configured. Users still originate inter-entity transactions and can, or must, create elimination and adjusting entries.

### Cited Findings
- **General Ledger (functional spec):** "Supports inter-entity transactions." — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **Enterprise Ledger, a separate Financial Products entry (functional spec):**
  - "Provides support for Entities above the property level in the ownership structure for the General Ledger."
  - "Create automated inter-entity offsets and eliminating entries."
  - "Create automated loan amortizations."
  - Source: [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **X.5 release notes (undated):**
  - **X.5.9, Financials:** "manual interentity entries can now be made from the manual journal entry page", including the prior-period and prior-year journal entry screens.
  - **X.5.9, Investment Accounting:** "the ability to create Cross Group Journal Entries is now possible" (requires option and security changes).
  - **X.5.7, Investment Accounting:** "a new field of Source Entity has been added to the Manual Adjusting or Elimination Entry screen".
  - **X.5.5, AP, Fixed Assets and GL:** "users can now consolidate transactions by project and portfolio", in addition to existing entity consolidation.
  - Source: [MRI X.5 release notes](https://info.mrisoftware.com/x5-release-us)
- **MRI WebHelp (customer-hosted MRI instance):**
  - Page title: "Creating Elimination Journal Entries"
  - Indexed text describes the path General Ledger > Enterprise Ledger > Elimination Entries, used so Balance Sheet and Comparative Income Statements can "consolidate financial data and remove any net activity between two entities"
  - Source: [MRI WebHelp (Kettler)](https://mrix.kettler.com/MRIWeb/WebHelp/mergedProjects/advgl/EliminationEntries/CreatingEliminationJournalEntries.htm) (snippet; the TLS certificate had expired, so the page body was not read)
- **Investment Accounting brochure (2016).** Lists "All consolidation methods: full consolidation, equity pickups, and proportionate" — [MRI Investment Accounting brochure, 2016](http://www.mrisoftware.com/wp-content/uploads/2016/05/MRI_Investment_Accounting_2016_D.pdf) (snippet; PDF text not extractable on fetch)
- **Current US commercial page:** "multi-entity reporting", "automates consolidations, distributions, and reporting" (investment management), and support for "additional entities, asset classes, geographies" — [MRI Commercial Management page](https://www.mrisoftware.com/products/commercial-management/)
- **The exact phrase.** A targeted search for MRI plus "intercompany" plus "without manual journal entries" returned no MRI source. Results were NetSuite, Oracle, Dynamics and other vendors — [search performed 2026-11-02; no MRI hit](https://developers.apideck.com/apis/accounting/mrisoftware/gotchas)
- **Other products' inter-fund features don't apply.** Tenmast GL (MRI's public housing line) "Allows for inter-fund balancing through user-created configurable process". This is a different MRI product, not PMX — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)

### Inferences
- **The likely origin of the claim.** "Without manual journal entries" probably paraphrases MRI's "automated inter-entity offsets" (the system books the balancing due-to/due-from side) and generic ERP marketing. As written, it overstates MRI's documented capability.
- **Ownership hierarchies beyond the property.** Parent corp → fund → subsidiary → property LLC requires Enterprise Ledger, and Investment Accounting for equity pickups and proportionate consolidation. Base PMX GL is property-entity centric.
- **Recommended wording:** "MRI's Enterprise Ledger module supports multi-tier ownership above the property level and can auto-generate inter-entity offsets and elimination entries."

### Gaps
- No public MRI help text was readable that describes the exact inter-entity mechanics: whether a single voucher spanning entities auto-creates due-to/due-from entries, and whether eliminations are rule-based each period or require initiation.
- Release dates for the X.5.x items are not given in the notes.

---

## Q3. Multi-currency and global tax: multi-currency, consolidation into a functional/reporting currency, and VAT/GST/regional tax

### Takeaway
**Multi-currency: TRUE.**
- The GL has multiple exchange-rate sources, triangulation and translation.
- AP has "global multi-currency processing".
- Commercial Management has "Real Time Dual Currency", keeping both entry and base currency (X.5.3).
- Budgeting & Forecasting gained multicurrency in X.5.2, and Investment Accounting supports multicurrency ownership structures (X.5.7).

**Consolidation into a single reporting currency is supported through translation**, but MRI's public text does not use the term "functional currency". One G2 reviewer reports that budgets load only in native currency, which limits budget-vs-actual comparisons in the consolidated currency.

**VAT/GST: PARTLY TRUE.**
- There is an AP "tax engine", "Inclusive Tax Enhancements" for tenant transactions (X.5.4) and an ANZ-compliant Tax Invoice Statement (X.5.9).
- Some regional tax and charge handling is gated behind **purchased Regional Packs**: Malaysia GST needs the Asia Regional Pack, and EMEA service charges and direct recharges need the EMEA Regional Pack.
- "Global tax handling" is therefore regional and add-on-dependent, not universal.

### Cited Findings
- **General Ledger (functional spec):**
  - "Multi-currency capabilities, including multiple exchange sources, currency triangulation, and currency translation."
  - "Provides availability for GST processing in Malaysia", applicable only if the client purchased the Asia Regional Pack.
  - Source: [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **Accounts Payable (functional spec):** "Global multi-currency processing; containing financial exchange rates" and "Robust tax engine and tax scenarios" — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **Commercial Management (functional spec):** "Handles primary Service Charge requirements in EMEA region" and "Includes Direct Recharge functionality for the EMEA region", both EMEA Regional Pack only — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **X.5 release notes:**
  - **X.5.3, Commercial Management:** "Real Time Dual Currency: The solution enables users to maintain both the entry currency and base currency"
  - **X.5.2, Budgeting & Forecasting:** "Multicurrency functionality has been added to Budgeting & Forecasting", with budgets posted to GL in a chosen currency at a spot rate
  - **X.5.7, Investment Accounting:** "improves Multicurrency functionality and enhances support for multicurrency ownership structures"
  - **X.5.4, Commercial Management:** "Inclusive Tax Enhancements can be added to appropriate tenant transactions"
  - **X.5.9, Financials:** a compliant "Tax Invoice Statement" for ANZ users
  - Source: [MRI X.5 release notes](https://info.mrisoftware.com/x5-release-us)
- **Fixed Asset Accounting** is described with "multi-currency capabilities", and GL with "flexible consolidation functionality" — [MRI IE PMX page](https://www.mrisoftware.com/ie/products/property-management-x/)
- **G2 user review:** budgets can only be loaded in native currency. Consolidating multiple currencies into one common currency is possible, but comparison against budgets in that format does not work — [G2 review](https://g2.com/products/mri-property-management/reviews/mri-property-management-review-51707) (snippet; page returned 403, review date unknown)
- **Third-party customer database:** South Africa's Growthpoint implemented MRI PMX as SaaS in 2017, partly for multi-currency reporting — [Apps Run The World](https://www.appsruntheworld.com/customers-database/products/view/mri-property-management-x/name/asc/10/1) (snippet; secondary source)

### Inferences
- **Multi-currency.** Multi-currency transaction processing and translation-based consolidation are native to the PMX Financials. Calling it "consolidation into a functional currency" is reasonable, but MRI's material says "base"/"reporting" currency and "translation". IFRS/ASC 830 functional-currency determination and CTA handling are not documented publicly.
- **Tax.** VAT/GST handling exists but is localized. A claim of seamless "global tax" across jurisdictions should be qualified with "via regional packs/localizations (e.g., Asia Regional Pack, EMEA Regional Pack, ANZ tax invoice)".

### Gaps
- There is no public MRI documentation on UK MTD-for-VAT submission, Australian BAS lodgment, Singapore/India GST returns, or US sales-tax engines within PMX.
- It is unclear which regional packs exist beyond the Asia, EMEA and Canada packs named in the spec, and what each contains.
- The cumulative translation adjustment / revaluation mechanics are not documented publicly.

---

## Q4. Corporate AP: multi-tier invoice approval routing by dollar thresholds and departmental signing authority. Native, or a separate AP-automation product or acquisition?

### Takeaway
**PARTLY TRUE, with specifics UNVERIFIABLE.**
- **Native PMX Financials** include "Integrated expense approvals for purchase orders, vouchers, payments". Purchase Order "Allows controls over approval limits and override capabilities", and Workflow Design lets users "create and automate notifications, document routing, and approval processes".
- No public MRI source documents invoice routing tiered by **dollar thresholds** combined with **departmental signing authority** in PMX.
- **The fuller AP-automation offering is a partner product, not an MRI acquisition:**
  - **MRI AP Automation powered by Nexus Systems** launched 17 Nov 2016 for Canada, Central/South America, EMEA, Asia and ANZ, with a "sophisticated approval workflow". **Bottomline** acquired Nexus in Sept 2022, not MRI.
  - In the US, MRI partners with **AvidXchange** (MRI Vendor Pay, AvidInvoice).
  - MRI AP Essentials serves the separate MRI Qube and Horizon products (UK), not PMX.

### Cited Findings
- **Native PMX approvals (functional spec):**
  - **Accounts Payable:** "Integrated expense approvals for purchase orders, vouchers, payments"
  - **Purchase Order:** "Allows controls over approval limits and override capabilities"
  - **Workflow Design:** "Allows authorized users to create and automate notifications, document routing, and approval processes"
  - Source: [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **Release notes.** No AP approval-tier or threshold items appear in the X.5 release notes. The closest is X.5.8 accruals that can "include all Unapproved Invoices for Expense Periods" — [MRI X.5 release notes](https://info.mrisoftware.com/x5-release-us)
- **MRI AP Automation, powered by Nexus:**
  - MRI calls it "an entirely paperless and automated procurement and accounts payable solution" with a "sophisticated approval workflow".
  - Regions: Canada, Central and South America, EMEA, Asia and ANZ.
  - No thresholds or departmental rules are described.
  - Source: [MRI AP Automation webinar page](https://www.mrisoftware.com/resources/demo-ap-automation/)
- **The 2016 launch.** The product was announced 17 Nov 2016, "developed in conjunction with its long-time partner, Nexus Systems", covering on-site purchasing, POs, "sophisticated approval workflow", invoice data capture, and budget vs actuals — [MRI press release](https://www.mrisoftware.com/news/mri-software-partners-with-nexus-systems-to-launch-ap-automation-for-international-markets/) (snippet). PYMNTS noted it followed Nexus's $28M Mainsail funding — [PYMNTS](https://www.pymnts.com/?p=330678) (snippet).
- **Bottomline owns Nexus.** Bottomline (a Thoma Bravo portfolio company) acquired Nexus Systems, announced 13–14 Sept 2022, terms undisclosed — [Bottomline press release](https://bottomline.com/newsroom/press-releases/bottomline-acquires-nexus-systems); [FinTech Futures, 14 Sept 2022](https://www.fintechfutures.com/paytech/bottomline-acquires-ap-automation-and-real-estate-payments-specialist-nexus-systems)
- **Implementation partner view.** REdirect Consulting describes Nexus as "an accounts payable automation and payment processing platform developed by Bottomline" that it integrates "into your existing Yardi or MRI Software". In other words, it is a third-party system integrated with MRI — [REdirect Consulting](https://www.redirectconsulting.com/software-solutions/nexus)
- **US partner: AvidXchange.** "MRI Vendor Pay powered by AvidXchange", later expanded to AvidInvoice for invoice processing — [MRI CA news](https://www.mrisoftware.com/ca/?p=23216) (snippet)
- **MRI AP Essentials** is "deeply integrated into MRI Qube Property Management and MRI Horizon". Those are UK products separate from PMX — [MRI AP Essentials datasheet](https://www.mrisoftware.com/uk/resources/ap-essentials-datasheet/) (snippet)
- **No MRI acquisition found.** A search for 2025–2026 MRI acquisitions of AP or invoice-automation companies found none. MRI's 2025 acquisition was Anacle (APAC commercial PM and facilities) — [MRI, 9 Jun 2025](https://www.mrisoftware.com/uk/?p=85683)

### Inferences
- **What the claim should say.** "Multi-tier approval routing by dollar thresholds and departmental signing authority" is plausible through native Workflow Design plus PO approval limits, but MRI does not document it publicly at that level of detail. Where it is marketed as an AP-automation capability (invoice capture, OCR, approval chains), it usually means the **Nexus/Bottomline** (international) or **AvidXchange** (US) partner products, sold or integrated separately.
- **No acquisition.** MRI acquired neither Nexus nor AvidXchange; Bottomline owns Nexus.

### Gaps
- There is no public MRI help documentation on PMX AP approval configuration: amount bands, approver hierarchies, cost-centre or departmental routing, delegation.
- It is unclear whether MRI still resells "MRI AP Automation powered by Nexus" under that name after the Bottomline deal. The webinar page is live but undated.

---

## Q5. CAM/recovery reconciliations: pro-rata square footage, exclusions, insurance, real estate taxes

### Takeaway
**TRUE at the capability level**, through the **Commercial Management** module. Retail-specific recovery depth sits in **Advanced Retail**, which MRI describes as "additional retail recoveries functionality".

MRI's material confirms:
- Expense pools and tenant recovery profiles
- Pro-rata share billing
- Insurance and real estate taxes as recoverable shared expenses
- Monthly estimates from budget, and year-end reconciliation billed as a one-time charge or credit
- Recovery caps, with capped and uncapped accounts in one pool (X.5.3)
- AI-assisted CAM reconciliation (marketing)

Exclusions are handled by separating recoverable from non-recoverable accounts. Square-footage denominators, gross-up and admin-fee mechanics are **not described in public MRI documentation**. They are likely present but unverified.

### Cited Findings
- **Commercial Management (functional spec):** "Handles many recoveries, straight line rent, and other complex calculations." — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **Advanced Retail (functional spec):** "Escalations and recoveries." — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **MRI blog "Managing real estate expense recoveries for retail" (Rafael Gallo, 4 Apr 2019):**
  - "MRI Commercial Management clients have access to retail recoveries tools"
  - Describes "the additional retail recoveries functionality" for those already using Commercial Management and AP
  - Recoveries are billed as each tenant's pro-rata share of shared expenses, which include insurance, real estate taxes, utilities, services and repairs/maintenance
  - Tenant recovery profiles are applied to expense pools; monthly estimates come from the budget and are billed as recurring charges
  - Reconciliation runs a few months after year-end, adjusts estimates to actuals per lease provisions, and posts a one-time charge or credit
  - Recoverable and non-recoverable items must be separated in the chart of accounts
  - Source: [MRI blog, 4 Apr 2019](https://www.mrisoftware.com/ie/?p=25458)
- **X.5 release notes:**
  - **X.5.3, Commercial Management:** "Non-retail Recovery Caps: Users can eliminate the need for custom calculations and formulas for office recoveries", with capped and uncapped accounts in the same pool
  - **X.5.2, Commercial Management:** a "Suite Type Area Usage" item refers to "recovery pools"
  - Source: [MRI X.5 release notes](https://info.mrisoftware.com/x5-release-us)
- **The PMX page (AU)** says PMX automates "complex lease calculations, including lease clauses, breakpoints, offsets, estimated payments, and outgoings" ("outgoings" is the Australian term for CAM/opex recoveries) — [MRI AU PMX page](https://www.mrisoftware.com/au/?p=72174)
- **The US retail page** offers "manage complex CAM recoveries", and says AI-driven automation can "increase the accuracy and efficiency of your CAM recoveries and reconciliation processes". Its FAQ also lists "percentage rent, breakpoints, lease offsets, and CAM" — [MRI retail page](https://www.mrisoftware.com/products/advanced-retail/)
- **The US commercial page** says it will "streamline rent, recoveries, and reporting", with no mechanics given — [MRI Commercial Management page](https://www.mrisoftware.com/products/commercial-management/)
- **Occupier side, a separate product.** AMTdirect OPEX Manager "Provides authorized users the ability to create custom expense pools" and year-over-year comparison percentages. This is a lease-accounting tool for tenants and occupiers that audit landlord CAM, not landlord-side PMX — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **EMEA equivalent.** UK/EMEA service charges in PMX require the EMEA Regional Pack — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)

### Inferences
- **Mostly accurate.** The claim is accurate if attributed to "MRI Commercial Management (a PMX module), with retail recoveries depth via Advanced Retail".
- **Detail is vendor-asserted.** Pro-rata, insurance and real-estate tax handling are confirmed by MRI. The square-footage denominator, gross-up and exclusion mechanics are reasonable assumptions for a product of this maturity, but public sources do not document them.

### Gaps
- No public MRI documentation was found on gross-up percentage or occupancy, base-year or expense-stop handling, anchor contributions, admin or management fees, or denominator options (GLA vs occupied vs fixed). MRI's "CM 101: Recoveries" webinar exists but was not reviewed.

---

## Q6. Percentage rent: does it "automatically pull tenant point-of-sale sales data"? Breakpoint structures?

### Takeaway
**"Automatically pull tenant POS data": OVERSTATED / not supported.** Every MRI source describes sales arriving by one of these routes:
- **Tenant self-reporting via the Tenant Connect portal** ("enter sales data", "report monthly sales")
- **Client-supplied data** ("based on data provided by client", in the separate Horizon product)
- Vague "capture turnover automatically" marketing that names no mechanism

No MRI source describes integration with tenant POS systems.

The functional spec does list "MRI On Location Sales Ingestion" ("Provides clients with retail sales data"). MRI OnLocation, however, is the footfall-analytics business acquired with Springboard in 2022, and it is not described as a POS connector.

**Percentage rent and breakpoints: TRUE**, but in the **Advanced Retail** module (an add-on to Commercial Management/PMX). It covers "Percentage rent calculations" and "breakpoints, lease offsets". The occupier-side AMTdirect Percent Rent supports "multiple sales breakpoints". Natural vs artificial and tiered breakpoints are not spelled out for the landlord product.

### Cited Findings
- **Advanced Retail (functional spec):**
  - "Percentage rent calculations."
  - "Control of retail portfolio with reporting and analysis of sales data."
  - "Escalations and recoveries."
  - Source: [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **Sales Ingestion (functional spec):** "MRI On Location Sales Ingestion … Provides clients with retail sales data". No POS systems are mentioned — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **US retail page:**
  - Portal technology lets tenants "report monthly sales"
  - The FAQ cites automation of "percentage rent, breakpoints, lease offsets, and CAM"
  - Turnover is captured to "invoice your tenants", with the collection method unspecified
  - Source: [MRI retail page](https://www.mrisoftware.com/products/advanced-retail/)
- **AU retail owners page:** "Capture turnover automatically, manage complex lease calculations and invoice tenants with ease". It names no data source (portal, import or POS) — [MRI AU Retail Owners](https://www.mrisoftware.com/au/?p=77215)
- **Tenant Connect** is a portal where tenants "make payments, enter sales data, review account status and history, initiate service requests" — [MRI Tenant Connect](https://www.mrisoftware.com/au/?p=858) (snippet)
- **PMX page (AU):** automates lease calculations "including lease clauses, breakpoints, offsets, estimated payments, and outgoings" — [MRI AU PMX page](https://www.mrisoftware.com/au/?p=72174)
- **AMTdirect Percent Rent (occupier/lease-accounting product, separate from PMX):**
  - "Enables authorized users to calculate overage rent and percent in lieu of base rent"
  - "account for sales exclusions by amount and percent"
  - "Allows for multiple sales breakpoints"
  - Rolls up multiple spaces into one calculation
  - Source: [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **Horizon Retail Management (separate UK product):** "Calculates percent rent payable based on data provided by client" — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **MRI OnLocation:**
  - Footfall analytics from Springboard (acquired Oct 2022), using "existing camera networks and proprietary AI-powered algorithms" — [MRI news](https://www.mrisoftware.com/nz/news/mri-software-acquires-springboard-retail-footfall-ai-analytics/) (snippet)
  - The UK G-Cloud listing describes footfall traffic analysis and benchmarks — [G-Cloud listing](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/415925730248610) (snippet)
  - A legacy Springboard page says the platform pairs sales performance data with footfall for conversion analysis — [info-emea.mrisoftware.com/springboard](https://info-emea.mrisoftware.com/springboard) (snippet)

### Inferences
- **The likely conflation.** The "automatic POS pull" wording probably blends three different things: "capture turnover automatically" marketing, tenant portal sales submission, and OnLocation's sales and footfall data products. As written, it should be downgraded to "tenant-reported sales via the Tenant Connect portal or import, feeding Advanced Retail percentage-rent calculations".
- **Breakpoints are confirmed** (the term appears on both the PMX and retail pages). The specific structures (natural vs artificial, tiered or multi-rate) are only explicitly documented ("multiple sales breakpoints") for the occupier-side AMTdirect product.

### Gaps
- There is no public documentation of a PMX connector to tenant POS systems, or of how "Sales Ingestion" receives data (file, API or portal).
- Landlord-side breakpoint types (natural/artificial, stepped, multi-tier rates, offsets/recapture) are not detailed publicly.

---

## Q7. CPI indexation and fixed-percentage compound escalations

### Takeaway
**PARTLY TRUE.**
- **CPI and fixed escalations are supported per MRI marketing.** The AU accounting blog (Aug 2025) speaks of "accurately applying rent escalations like CPI … increases" and "fixed increases or adjustments linked to indexation". Advanced Retail lists "Escalations", and MRI's lease abstraction identifies CPI-linked and fixed-step escalations and alerts ahead of "CPI reset dates".
- **Compounding is undocumented.** No MRI source found explicitly documents compound (vs simple) fixed-percentage escalations.
- **Dedicated CPI tooling belongs to a different product.** The "AMTdirect CPI Manager" ("calculate US-based CPI changes") is an occupier/lease-accounting product, not PMX.

### Cited Findings
- **MRI AU blog "How commercial property management accounting software improves operations" (21 Aug 2025):** "accurately applying rent escalations like CPI (Consumer Price Index) increases" and "such as fixed increases or adjustments linked to indexation". It references ABS CPI and does not name PMX — [MRI AU blog, 21 Aug 2025](https://www.mrisoftware.com/au/blog/how-commercial-property-management-accounting-software-improves-operations/)
- **Advanced Retail (functional spec):** "Escalations and recoveries." — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **AMTdirect CPI Manager (occupier and lease-accounting products):** "Enables authorized users to calculate US-based CPI changes." — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **MRI lease abstraction page:**
  - Identifies common escalation structures, including index-linked CPI escalations, percentage-based bumps and fixed steps
  - Critical-date tracking "generates automated alerts ahead of scheduled increases, CPI reset dates, and renewal deadlines"
  - Source: [MRI Lease Abstraction](https://www.mrisoftware.com/solutions/lease-abstraction-software/) (snippet)
- **X.5 release notes:**
  - **X.5.8, Residential Management (International clients):** "greater flexibility when adding or editing step ups to both renewal and prospect leases"
  - **X.5.7, Budgeting & Forecasting:** "reload inflation indexes, seasonal indexes and RM assumptions"
  - Source: [MRI X.5 release notes](https://info.mrisoftware.com/x5-release-us)
- **Horizon Lease Payments/Receivables (separate UK product):** "managing breaks, terminations and rent reviews" — [MRI Functional Specifications](https://www.mrisoftware.com/mrifunctionalspecs/)
- **The PMX page (AU)** claims automation of "complex lease calculations, including lease clauses …" but does not mention CPI or rent reviews explicitly — [MRI AU PMX page](https://www.mrisoftware.com/au/?p=72174)

### Inferences
- **CPI is mature functionality.** CPI and indexation escalation is standard for a product with "4m+ commercial leases" in CPI-heavy markets (Australia/NZ, UK RPI/CPI). Supporting it in Commercial Management is highly plausible and backed by MRI marketing. The detailed mechanics are not public: index series, base dates, caps and floors, ratchets, review lag.
- **Compounding is unconfirmed.** "Fixed-percentage compound escalations" is plausible (fixed annual % reviews compound by construction when applied to current rent) but unconfirmed. It should be marked UNVERIFIABLE until MRI documentation is seen.

### Gaps
- No public MRI documentation was found for PMX/Commercial Management rent-review setup: CPI series selection, collar/cap/floor, ratchet, market-review workflow, compound vs simple fixed increases.
- MRI's US Commercial Management and PMX pages do not mention CPI explicitly.
