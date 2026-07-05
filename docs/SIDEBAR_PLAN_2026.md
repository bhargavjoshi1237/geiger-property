# Sidebar Plan 2026 — Areas, Sub-items & Build Priority

> Derived from `COMPETITIVE_FEATURE_ANALYSIS_2026.md`. Maps each sidebar item to a **P0–P4** build priority so the UI doubles as a roadmap.
>
> **Priority legend**
> - **P0** 🟦 — Universal / table-stakes. Ship at MVP.
> - **P1** 🟩 — Common / expected. Within 90 days.
> - **P2** 🟨 — Uncommon differentiator. **Bundled free** (where incumbents upsell).
> - **P3** 🟥 — AI moat. Our distinctive value.
> - **P4** ⛔ — Deferred / out of scope (enterprise moats).
> - **★** = Geiger differentiator we lead on

Structure matches `components/internal/sidebar/sidebar_nav.jsx` so this can drive a build-order pass over the existing nav.

---

## 1. Overview 🟦
*Dashboard shell — ship at MVP.*
- (no sub-items; single landing screen)

---

## 2. Properties 🟦
*Entity spine — the first thing to build (P0).*

| Sub-item | Priority |
|---|---|
| All Properties | 🟦 P0 |
| Units | 🟦 P0 |
| Portfolios | 🟦 P0 |
| Buildings & Blocks | 🟦 P0 |
| Floor Plans | 🟦 P0 |
| Unit Types | 🟦 P0 |
| Property Photos & Media | 🟦 P0 |
| Amenities | 🟦 P0 |
| Custom Fields | 🟩 P1 |
| Property Groups | 🟩 P1 |
| Ownership & Splits | 🟩 P1 |
| Unit Turns & Make-ready | 🟩 P1 |
| Keys & Access | 🟩 P1 |

---

## 3. Listings & Marketing 🟦🟩
*Vacancy → prospect funnel.*

| Sub-item | Priority |
|---|---|
| Vacancy Listings | 🟦 P0 |
| Listing Syndication (Zillow/Apts.com) | 🟦 P0 |
| ILS Distribution | 🟦 P0 |
| Marketing Website | 🟩 P1 |
| Showings & Tours | 🟦 P0 |
| Self-guided Showings | 🟨 P2 |
| AI Listing Writer | 🟥 P3 ★ |
| Virtual Tours | 🟩 P1 |
| Rent Comparables | 🟩 P1 |
| Waitlist | 🟩 P1 |
| Promotions & Specials | 🟩 P1 |
| QR & Yard Signs | 🟩 P1 |

---

## 4. Leads & CRM 🟩
*Prospect pipeline — supports the AI leasing agent (P3).*

| Sub-item | Priority |
|---|---|
| Prospects | 🟩 P1 |
| Pipeline | 🟩 P1 |
| Guest Cards | 🟩 P1 |
| Follow-ups | 🟩 P1 |
| Lead Sources | 🟩 P1 |
| Lead-to-lease | 🟩 P1 |
| Auto-responders | 🟥 P3 ★ |

---

## 5. Applications & Screening 🟦
*Cost-of-entry — ship at MVP.*

| Sub-item | Priority |
|---|---|
| Online Applications | 🟦 P0 |
| Application Forms | 🟦 P0 |
| Tenant Screening | 🟦 P0 |
| Credit Checks | 🟦 P0 |
| Background Checks | 🟦 P0 |
| Eviction History | 🟦 P0 |
| Income Verification | 🟦 P0 |
| Application Fees | 🟦 P0 |
| Decisioning | 🟦 P0 |
| Applicant Communication | 🟦 P0 |

---

## 6. Leasing 🟦🟩
*E-sign + renewals are table-stakes; full lease automation is P1.*

| Sub-item | Priority |
|---|---|
| Leases | 🟦 P0 |
| Lease Builder | 🟦 P0 |
| Lease Templates | 🟦 P0 |
| State-specific Leases | 🟦 P0 |
| E-signature | 🟦 P0 |
| Addenda & Documents | 🟦 P0 |
| Security Deposits | 🟦 P0 |
| Move-in | 🟦 P0 |
| Move-out | 🟦 P0 |
| Move-in Inspection | 🟦 P0 |
| Renewals | 🟩 P1 |
| Rent Increases | 🟩 P1 |
| Lease Expirations | 🟩 P1 |
| Notices & Violations | 🟩 P1 |
| Deposit Alternatives | 🟨 P2 |

---

## 7. Tenants 🟦
*Tenant portal is P0; engagement features are P1+.*

| Sub-item | Priority |
|---|---|
| Tenant Directory | 🟦 P0 |
| Tenant Profiles | 🟦 P0 |
| Household & Occupants | 🟦 P0 |
| Resident Portal | 🟦 P0 |
| Documents | 🟦 P0 |
| Communication Log | 🟦 P0 |
| Announcements | 🟩 P1 |
| Notices | 🟩 P1 |
| Renters Insurance | 🟩 P1 |
| Rent Reporting (to bureaus) | 🟨 P2 |
| Renter Rewards | 🟨 P2 |
| Reviews & Feedback | 🟩 P1 |
| Move-out Pipeline | 🟩 P1 |

---

## 8. Owners 🟦🟩🟥
*Basic statements are P0; AI-generated narratives are our P3 differentiator.*

| Sub-item | Priority |
|---|---|
| Owner Directory | 🟦 P0 |
| Owner Statements | 🟦 P0 |
| Owner Portal | 🟩 P1 |
| Owner Distributions (ACH) | 🟩 P1 |
| Ownership Splits | 🟩 P1 |
| Management Fees | 🟩 P1 |
| 1099 & Tax | 🟩 P1 |
| Owner Communication | 🟩 P1 |
| Owner Documents | 🟩 P1 |
| Owner Contributions | 🟩 P1 |
| AI Owner Narratives | 🟥 P3 ★ |

---

## 9. Maintenance 🟦🟩
*Work orders + vendor mgmt are P0; recurring/inspections are P1.*

| Sub-item | Priority |
|---|---|
| Work Orders | 🟦 P0 |
| Maintenance Requests | 🟦 P0 |
| Vendors | 🟦 P0 |
| Vendor Assignments | 🟦 P0 |
| Photos & Attachments | 🟦 P0 |
| Mobile Maintenance | 🟦 P0 |
| Preventive Maintenance | 🟩 P1 |
| Recurring Work Orders | 🟩 P1 |
| Inspections | 🟩 P1 |
| Make-ready Boards | 🟩 P1 |
| Vendor Portal | 🟩 P1 |
| Estimates & Bids | 🟩 P1 |
| Inventory & Parts | 🟩 P1 |
| Meter Readings | 🟩 P1 |
| AI Maintenance Triage | 🟥 P3 ★ |
| 24/7 Coordination (Contact Center) | ⛔ P4 |

---

## 10. Accounting 🟦🟩🟨
*Rent collection is P0; full GL is P1; e-filing + auto-categorization are P2.*

| Sub-item | Priority |
|---|---|
| Rent Collection | 🟦 P0 |
| Online Payments | 🟦 P0 |
| Autopay | 🟦 P0 |
| Recurring Charges | 🟦 P0 |
| Late Fees | 🟦 P0 |
| Payment Plans | 🟦 P0 |
| General Ledger | 🟩 P1 |
| Chart of Accounts | 🟩 P1 |
| Bills & Payables | 🟩 P1 |
| Invoices & Receivables | 🟩 P1 |
| Bank Reconciliation | 🟩 P1 |
| Journal Entries | 🟩 P1 |
| Deposits | 🟩 P1 |
| Budgeting | 🟩 P1 |
| Trust Accounting | 🟩 P1 |
| Schedule E / Tax Pack | 🟩 P1 |
| QuickBooks Sync | 🟩 P1 |
| 1099 Generation | 🟩 P1 |
| 1099 E-filing | 🟨 P2 ★ |
| Utility Billing (RUBS) | 🟩 P1 |
| Cash / Retail Payments | 🟨 P2 |
| Payouts & Distributions | 🟩 P1 |
| AI Bookkeeping (auto-categorize) | 🟥 P3 ★ |
| CAM / Commercial Recoverables | ⛔ P4 |

---

## 11. Banking & Fintech 🟨
*Our P2 differentiator bundle — where we undercut the upsell ladder.*

| Sub-item | Priority |
|---|---|
| Landlord Banking | 🟨 P2 ★ |
| Property Sub-accounts (virtual accounts) | 🟨 P2 ★ |
| High-yield Savings | 🟨 P2 ★ |
| Debit & Cards | 🟨 P2 ★ |
| Payout Accounts | 🟨 P2 ★ |
| Instant / Same-day Payouts | 🟨 P2 ★ |
| Payment Methods | 🟦 P0 |
| Merchant Accounts | 🟩 P1 |
| Flexible Rent | 🟨 P2 |
| Refunds | 🟩 P1 |
| Transaction History | 🟦 P0 |
| Loan Marketplace | ⛔ P4 |

---

## 12. Communications 🟦🟩
*Email + in-app are P0; SMS + bulk are P1.*

| Sub-item | Priority |
|---|---|
| Inbox | 🟦 P0 |
| Email | 🟦 P0 |
| Notifications | 🟦 P0 |
| Message Templates | 🟦 P0 |
| Text / SMS (two-way) | 🟩 P1 |
| Bulk Messaging | 🟩 P1 |
| Announcements | 🟩 P1 |
| Call Logging | 🟩 P1 |
| VoIP & Voicemail | 🟩 P1 |
| Contact Center (managed) | ⛔ P4 |

---

## 13. Documents & eSign 🟦
*All P0 — table-stakes.*

| Sub-item | Priority |
|---|---|
| Document Library | 🟦 P0 |
| Templates | 🟦 P0 |
| E-signature | 🟦 P0 |
| Shared Files | 🟦 P0 |
| Compliance Documents | 🟦 P0 |
| Document Requests | 🟦 P0 |

---

## 14. Tasks & Operations 🟦🟨🟥
*Tasks are P0; the automation builder is a P2 differentiator; AI assistant is P3.*

| Sub-item | Priority |
|---|---|
| Tasks | 🟦 P0 |
| Reminders | 🟦 P0 |
| Calendar | 🟦 P0 |
| Team Assignments | 🟦 P0 |
| Recurring Tasks | 🟩 P1 |
| Automations (no-code builder) | 🟨 P2 ★ |
| AI Assistant (copilot) | 🟥 P3 ★ |

---

## 15. Associations & HOA 🟩
*Light HOA module is P1; full HOA suite is deferred.*

| Sub-item | Priority |
|---|---|
| Associations | 🟩 P1 |
| Board Members | 🟩 P1 |
| Dues & Assessments | 🟩 P1 |
| Violations | 🟩 P1 |
| Common Areas | 🟩 P1 |
| Amenity Booking | 🟩 P1 |
| Architectural Requests | ⛔ P4 |
| Committees | ⛔ P4 |
| Voting & Elections | ⛔ P4 |
| Meetings & Minutes | ⛔ P4 |

---

## 16. Reports 🟦🟩🟨
*Standard reports are P0; custom builder is P1; scheduled/export are P1.*

| Sub-item | Priority |
|---|---|
| Rent Roll | 🟦 P0 |
| Delinquency | 🟦 P0 |
| Occupancy | 🟦 P0 |
| Owner Statements | 🟦 P0 |
| Financial Reports | 🟩 P1 |
| Income Statement | 🟩 P1 |
| Balance Sheet | 🟩 P1 |
| Cash Flow | 🟩 P1 |
| General Ledger | 🟩 P1 |
| Schedule E / Tax Pack | 🟩 P1 |
| Maintenance Reports | 🟩 P1 |
| Leasing Reports | 🟩 P1 |
| Custom Report Builder | 🟩 P1 |
| Scheduled Reports | 🟩 P1 |
| Export Center | 🟩 P1 |

---

## 17. Insights 🟥
*The AI moat surfaces here — P3 differentiators.*

| Sub-item | Priority |
|---|---|
| Portfolio KPIs | 🟩 P1 |
| Occupancy Trends | 🟩 P1 |
| Revenue & NOI | 🟩 P1 |
| Delinquency Trends | 🟩 P1 |
| Lease Expiration Forecast | 🟩 P1 |
| Benchmarks | 🟩 P1 |
| Rent Optimization | 🟥 P3 ★ |
| AI Insights (anomalies, predictions) | 🟥 P3 ★ |

---

## 18. Portals 🟦🟩🟨
*Tenant portal is P0; others P1; branding/white-label is a P2 differentiator.*

| Sub-item | Priority |
|---|---|
| Resident Portal | 🟦 P0 |
| Owner Portal | 🟩 P1 |
| Applicant Portal | 🟦 P0 |
| Vendor Portal | 🟩 P1 |
| Board Portal | ⛔ P4 |
| Mobile App | 🟦 P0 |
| Portal Branding | 🟨 P2 ★ |

---

## 19. Integrations 🟩🟨
*Open API + webhooks are P2 differentiators (free, not a paid add-on).*

| Sub-item | Priority |
|---|---|
| Accounting Sync | 🟩 P1 |
| Payment Gateways | 🟦 P0 |
| Screening Providers | 🟦 P0 |
| Listing Partners | 🟦 P0 |
| Insurance Partners | 🟩 P1 |
| Connected Apps | 🟩 P1 |
| Data Import | 🟦 P0 |
| Zapier | 🟩 P1 |
| Open API | 🟨 P2 ★ |
| Webhooks | 🟨 P2 ★ |

---

## 20. Settings 🟦🟩🟨
*RBAC + audit log are P0; white-label is P2.*

| Sub-item | Priority |
|---|---|
| Company Profile | 🟦 P0 |
| Team & Members | 🟦 P0 |
| Roles & Permissions (RBAC) | 🟦 P0 |
| Audit Logs | 🟦 P0 |
| Security | 🟦 P0 |
| Notifications | 🟦 P0 |
| Billing & Plans | 🟦 P0 |
| Custom Fields | 🟩 P1 |
| Branding | 🟨 P2 ★ |
| White-label | 🟨 P2 ★ |
| Tax & Legal | 🟩 P1 |
| Localization | 🟩 P1 |
| Data & Backup | 🟩 P1 |
| 2FA / MFA | 🟩 P1 |
| SSO | 🟩 P1 |
| API & Webhooks | 🟨 P2 ★ |
| Support & SLA | 🟩 P1 |

---

## Build-order summary (by priority)

### 🟦 P0 — MVP (must ship together)
Properties spine · Applications & Screening · Leasing (core) · Tenants (portal + directory) · Maintenance (work orders + vendors) · Accounting (rent collection + payments) · Communications (email + in-app) · Documents & eSign · Reports (standard + rent roll) · Portals (resident + applicant) · Settings (RBAC + audit + billing)

### 🟩 P1 — Within 90 days
Full accounting (GL, AP/AR, reconciliation, statements) · Owner portal + distributions · SMS + bulk messaging · Preventive maintenance + inspections · Lease renewals · Custom report builder · Public marketing website · HOA (light) · Insights dashboards · Integrations (accounting sync, Zapier)

### 🟨 P2 — Differentiators we bundle FREE
Embedded banking + virtual accounts + debit card · Instant payouts · 1099 e-filing · No-code automation builder · White-label + branding · Open API + webhooks · Cash payment options · Auto-categorization

### 🟥 P3 — The AI moat (ship as core, not upsell)
AI copilot (ask-your-data) · AI leasing agent (24/7 chat) · AI bookkeeping · AI document parsing · Predictive insights · AI owner narratives · AI maintenance triage · AI listing writer

### ⛔ P4 — Deferred (enterprise moats, not our buyer)
Managed Contact Center · CAM / commercial recoverables · Master insurance · ESG / energy · End-to-end ERP / investment mgmt · Algorithmic rent engine · Full HOA suite (committees, voting, meetings) · Loan marketplace · Multi-currency
