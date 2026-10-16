# Geiger Property — current feature inventory, and the Geiger Events editor as a depth benchmark

Scope: read-only review of local source code (C:/Pro/geiger-property and C:/Pro/geiger-events), October 2026. All "sources" are local file paths. No web sources were used. Counts marked "~" are approximate, taken from reading the code.

## What per-entity editor tabs and fields does Geiger Property have today, and which areas are thin or placeholder?

### Takeaway
Geiger Property has broad coverage:
- 13 nav groups and 58 registered screens.
- Every nav title except "AI Assistant" has a working screen.
- Every screen reads and writes real Supabase `property.*` tables.

Depth per entity is shallow to moderate. Most screens run on one config-driven list/editor engine:
- Editors have 3–17 right-hand sections.
- Most sections are flat field forms (2–10 fields) or simple add/remove lists stored in the `metadata` JSON column.
- The richest editors are Work Orders (17 sections), Tenants (15), Leases (13), Moves (~10) and Applications (8).
- The thinnest are Portfolios, Amenities, Media, Floor Plans, Unit Types, Transactions, Bank Accounts, Inbox, Waitlist, Showings and Rent Comps.

Nearly all "process" features are recorded but never run. Nothing sends, nothing schedules, nothing processes payments, and nothing integrates:
- e-signature
- syndication
- screening
- automations
- announcements
- payments
- portals

### Cited Findings

#### A. Navigation and registry
- **Sidebar order.** It follows a manager's daily workflow: Overview → Property (8) → Marketing & Leads (6) → Leasing (6) → People (3) → Maintenance (4) → Accounting (7) → Communications (3) → Documents (3) → Reports (7) → Automations → AI Assistant → Settings (7). Titles must be unique because URL slugs and `view.*` permission keys come from them. — [sidebar_nav.jsx](C:/Pro/geiger-property/components/internal/sidebar/sidebar_nav.jsx)
- **Sub-items by group:**

  | Group | Sub-items |
  |---|---|
  | Property | Properties, Units, Buildings, Portfolios, Floor Plans, Unit Types, Amenities, Media Library |
  | Marketing & Leads | Listings, Prospects, Showings, Applications, Waitlist, Rent Comparables |
  | Leasing | Leases, Renewals, Move-ins & Move-outs, Inspections, Security Deposits, Notices & Violations |
  | People | Tenants, Owners, Vendors |
  | Maintenance | Work Orders, Preventive & Recurring, Unit Turns, Inventory & Parts |
  | Accounting | Rent Collection, Transactions, Recurring Charges, Bills & Payables, Chart of Accounts, Budgets, Bank Accounts |
  | Communications | Inbox, Announcements, Message Templates |
  | Documents | Document Library, Templates, E-signature |
  | Reports | Rent Roll, Delinquency, Occupancy & Vacancy, Owner Statements, Financial Statements, Maintenance Report, Leasing Report |
  | Settings | Company Profile, Team & Members, Roles & Permissions, Custom Fields, Fees & Policies, Branding & Portals, Integrations |

  — [sidebar_nav.jsx](C:/Pro/geiger-property/components/internal/sidebar/sidebar_nav.jsx)
- **Registry.** `SCREEN_REGISTRY` maps 58 titles. "AI Assistant" is the only sidebar title not registered, so it falls back to `ComingSoonScreen`, a static "{title} is on the way" card. — [registry.jsx](C:/Pro/geiger-property/components/internal/screens/registry.jsx); [coming_soon.jsx](C:/Pro/geiger-property/components/internal/screens/coming_soon.jsx)
- **Merged screens.** About 50 legacy titles redirect into the current screens through `LEGACY_TABS`. Examples:
  - "Lease Builder" → Leases
  - "Tenant Screening" → Applications
  - "Mobile Maintenance" and "Vendor Assignments" → Work Orders
  - "Make-ready Boards" → Unit Turns
  - "Resident Portal" → Tenants

  So several capabilities exist only as sections inside a merged screen. — [lib/workspace/tabs.js](C:/Pro/geiger-property/lib/workspace/tabs.js)
- **No placeholder sections remain.** `SectionPlaceholder` ("— designed next") is defined but no screen uses it. — [section_placeholder.jsx](C:/Pro/geiger-property/components/internal/screens/entity/section_placeholder.jsx)

#### B. The shared entity engine (the frame for ~44 screens)
- **Which screens use it.** `EntityListScreen` plus `EntityDetailScreen` are a config-driven port of the geiger-events `all_events` / `event_detail`. Every area except these is a config object passed to it:
  - Document Library
  - the 7 reports
  - 6 of the settings pages
  - Property Overview

  — [entity_list_screen.jsx](C:/Pro/geiger-property/components/internal/screens/entity/entity_list_screen.jsx); [entity_detail_screen.jsx](C:/Pro/geiger-property/components/internal/screens/entity/entity_detail_screen.jsx)
- **List frame.**
  - Layout: `ScreenHeader` + "New X" → `StatsBar` of 4 KPIs → optional view tabs → one status `FilterDropdown` → search → `DataTable`. Loading, empty and filtered-empty states are all present.
  - Row actions are identical everywhere: Edit, Duplicate (adds "(copy)", resets to Draft) and Delete (confirm, then soft delete).
  - Create dialogs are generated from `createFields` (text and select only). Only the name is required.

  — [entity_list_screen.jsx](C:/Pro/geiger-property/components/internal/screens/entity/entity_list_screen.jsx)
- **Editor shell.**
  - Header: back link, title, `StatusPill`, a meta line, and a single "Save changes" button. There are no publish, preview, duplicate or share actions in the header.
  - Body: a right-hand grouped section nav (`navGroups`), with the active section in the URL (`?section=`).
  - There is no nav search and no conditional (`showIf`) sections.

  — [entity_detail_screen.jsx](C:/Pro/geiger-property/components/internal/screens/entity/entity_detail_screen.jsx)
- **Two save models side by side.**
  - The shared `DetailsSection` only updates local form state (`onPatch`), so edits need the header "Save changes".
  - The factory `FieldsForm` (`makeFieldsSection`) saves immediately: on select or switch change, and on blur for text fields.
  - "Save changes" shows "Changes saved." before the write finishes.

  — [details_section.jsx](C:/Pro/geiger-property/components/internal/screens/entity/shared_sections/details_section.jsx); [factories.jsx](C:/Pro/geiger-property/components/internal/screens/entity/sections/factories.jsx); [entity_detail_screen.jsx](C:/Pro/geiger-property/components/internal/screens/entity/entity_detail_screen.jsx)
- **Section building blocks** (everything below is assembled from these):
  - Field types: text, textarea, number, date, select, switch, relation (picker over another table), readonly.
  - `makeMetaListSection`: add/remove rows inside `metadata`, with an optional secondary value or a checkbox.
  - `makeChildListSection`: rows in a real child table.
  - `makeUploadSection`: real image upload to the `products` bucket.
  - `makeNotesSection`: one free-text field.
  - `makeCustomFieldsSection`: field definitions from Settings → Custom Fields; Text/Number/Date only; available for properties, units, tenants and leases.

  — [factories.jsx](C:/Pro/geiger-property/components/internal/screens/entity/sections/factories.jsx)
- **Shared sections reused across asset entities:**

  | Section | Behaviour |
  |---|---|
  | Overview | read-only: KPI row, cover image, "At a glance" facts, description |
  | Settings | a status select that saves immediately, plus a "Danger zone" delete — and nothing else |
  | Documents | real file upload into `property.documents` |
  | Activity | a note timeline from `property.activity`. Its comment says "system entries plus user notes", but `createActivity` is only called from the note box, so no system events are logged |
  | Amenities, Media, Floor Plans, Related Units, Portfolio Properties | attach/detach pickers and lists |

  — [shared_sections/](C:/Pro/geiger-property/components/internal/screens/entity/shared_sections/index.js); [activity_section.jsx](C:/Pro/geiger-property/components/internal/screens/entity/shared_sections/activity_section.jsx)
- **Engine-wide defects found:**
  - Duplicate shows a success toast without checking the save, and copies the whole `metadata` bag.
  - Keys with no matching column are silently dropped:
    - tenantName and leaseName on Moves, Inspections and Deposits
    - propertyId on Unit Turns
  - Account links in Transactions, Bills and Recurring charges are text labels, not ids.
  - Some status maps hardcode hex colours (`bg-[#737373]`).

  — [factories.jsx](C:/Pro/geiger-property/components/internal/screens/entity/sections/factories.jsx); [lib/supabase/entity_factory.js](C:/Pro/geiger-property/lib/supabase/entity_factory.js)

#### C. Property group: asset entities
In each table, "General" is the shared Documents / Activity / Settings set described above.

**Properties** — 10 sections
- **Statuses:** Active, Vacant, Maintenance, Draft, Off-market.
- **List columns:** Property (name + address/city), Status, Type, Units.
- **KPIs:** Properties, Units, Active, Vacant.
- **Create:** name, type, city, status.
- **Details fields:** name, type (Single-family, Multi-family, Apartment, Condo, Commercial), portfolio, address, city, state, ZIP, year built, description.

| Group | Sections |
|---|---|
| (top) | Overview |
| Property | Details (9 fields), Units (add a unit by label + list), Amenities (attach), Floor Plans (multi attach), Photos & Media (upload, set cover, delete) |
| General | Custom Fields, Documents, Activity, Settings (status + delete) |

- **Missing:** owner, parcel/APN, tax, insurance, utilities, management agreement, financials, occupancy history, map/geo, property-level fees/policies, marketing settings.

— [properties/config.jsx](C:/Pro/geiger-property/components/internal/screens/properties/config.jsx)

**Units** — 10 sections
- **Statuses:** Occupied, Vacant, Notice, Make-ready, Down, Draft.
- **List columns:** Unit, Status, Specs, Rent.
- **KPIs:** Units, Occupied, Vacant, Rent roll.
- **Create:** label, status.
- **Details fields:** label, property, building, unit type, floor, bedrooms, bathrooms, sq ft, monthly rent, deposit.

| Group | Sections |
|---|---|
| (top) | Overview |
| Unit | Details, Lease & Occupancy (tenant, occupant name, lease start, lease end), Amenities, Floor Plan (single), Photos & Media |
| General | Custom Fields, Documents, Activity, Settings |

- **Missing:** a lease/rent history ledger, a market vs. asking rent split, availability and make-ready dates, keys and utilities meters, appliances, work-order history.

— [units/config.jsx](C:/Pro/geiger-property/components/internal/screens/units/config.jsx)

**Buildings** — 9 sections
- **Statuses:** Active, Under construction, Inactive, Draft.
- **List columns:** Building, Status, Structure, Floors.
- **KPIs:** Buildings, Active, Floors, Building (= under construction).
- **Create:** name, block code, status.
- **Details fields:** name, block code, property, floors, year built, structure type (Low-rise, Mid-rise, High-rise, Townhome, Garden), wing, description.
- **Sections:** Overview, Details, Units, Floor Plans, Amenities, Photos & Media, Documents, Activity, Settings.

— [buildings/config.jsx](C:/Pro/geiger-property/components/internal/screens/buildings/config.jsx)

**Portfolios** — 6 sections (thin)
- **Statuses:** Active, Archived, Draft.
- **List columns:** Portfolio, Status, Manager, Region.
- **Create:** name, manager (free text), status.
- **Details fields (5):** name, manager, region, accent colour, description.
- **Sections:** Overview, Details, Properties (add/remove), Documents, Activity, Settings.
- **Missing:** no performance KPIs, owner link, or financial roll-up.

— [portfolios/config.jsx](C:/Pro/geiger-property/components/internal/screens/portfolios/config.jsx)

**Floor Plans** — 7 sections
- **Statuses:** Active, Draft, Archived.
- **Details fields:** name, bedrooms, bathrooms, sq ft, dimensions, property, description.
- **Sections:** Overview, Details, Plan File (upload/replace), Linked (read-only units and properties), Documents, Activity, Settings.

— [floor_plans/config.jsx](C:/Pro/geiger-property/components/internal/screens/floor_plans/config.jsx)

**Unit Types** — 7 sections
- **Statuses:** Active, Inactive, Draft.
- **Details fields:** name, bedrooms, bathrooms, typical sq ft, market rent, deposit, default floor plan, description.
- **Sections:** Overview, Details, Amenities (defaults), Units, Documents, Activity, Settings.
- **Missing:** pricing rules and rent ranges.

— [unit_types/config.jsx](C:/Pro/geiger-property/components/internal/screens/unit_types/config.jsx)

**Amenities** — 6 sections
- **Details fields:**
  - name
  - category (8 options: Community, Unit, Building, Outdoor, Parking, Security, Utilities, Accessibility)
  - applies to (both / property / unit)
  - icon (a Lucide name typed as text)
  - fee (free / one-time / monthly)
  - fee amount
  - description
- **Sections:** Overview, Details, Attached To (read-only), Documents, Activity, Settings.
- **Missing:** booking/reservation rules (e.g., clubhouse) and hours.

— [amenities/config.jsx](C:/Pro/geiger-property/components/internal/screens/amenities/config.jsx)

**Media Library** — 6 sections
- **Statuses:** Published, Draft.
- **Kinds:** photo, video, 360° tour, document.
- **Details fields (2):** name, kind.
- **Sections:** Overview, File (upload/replace), Details, Placement (attach to property/unit/building, set as cover), Activity, Settings.
- **Missing:** no tags, alt text, captions, ordering or albums.

— [media/config.jsx](C:/Pro/geiger-property/components/internal/screens/media/config.jsx)

#### D. People
**Tenants** — 15 sections in 6 groups; the richest people editor
- **Statuses:** Current, Applicant, Late, Past, Draft.
- **Views:** All, Current, Applicants, Past.
- **List columns:** Tenant, Status, Unit, Lease end, Balance (joined from rent accounts).
- **KPIs:** Tenants, Current, Applicants, Balance due.
- **Create:** name, email, unit, status.

| Group | Section | Fields / behaviour |
|---|---|---|
| (top) | Overview | read-only facts |
| General | Details | name, email, phone, status |
| General | Lease & Unit | unit, lease relation, lease start/end, property name, monthly rent |
| General | Payments & Balance | current balance (read-only), autopay switch, payment method (ACH, Card, Check, Cash), last payment date |
| General | Emergency Contacts | name, phone, relationship — **only one contact** |
| General | Settings | preferred contact (Email/Phone/SMS), language, do-not-contact switch |
| Profile | Identity | date of birth, SSN last 4, driver's license, nationality |
| Profile | Employment & Income | employer, job title, annual income, status (Employed, Self-employed, Student, Retired, Unemployed) |
| Profile | Vehicles & Pets | **one** vehicle, plate, **one** pet, pet weight |
| Profile | Screening & Background | credit score, background (Pending/Clear/Flagged), income verified, notes |
| Relationships | Household & Occupants | households in `tenant_households` with an occupant count |
| Records | Documents | name-only list in `tenant_documents` (no upload) |
| Records | Communication Log | manual log in `tenant_communications` |
| Records | Custom Fields | from Settings → Custom Fields |
| Portal | Resident Portal | portal-enabled toggle, last seen |

Most profile fields are stored in `metadata`.

— [tenants/config.jsx](C:/Pro/geiger-property/components/internal/screens/tenants/config.jsx); [tenants/shared.js](C:/Pro/geiger-property/components/internal/screens/tenants/shared.js); [tenants/sections/](C:/Pro/geiger-property/components/internal/screens/tenants/sections/household.jsx)

**Owners** — 7 sections
- **Statuses:** Active, Onboarding, Inactive.
- **List columns:** Owner, Status, Properties, Payout, Mgmt fee %.
- **Sections:**
  - Overview
  - Contact (adds mailing address)
  - Properties & Splits: label + % typed by hand; not real property links and not checked to total 100%
  - Management Fees: fee %, payout method (ACH/Check/Hold), payout schedule, operating reserve, leasing fee, notes
  - Tax & 1099: tax ID last 4, classification, 1099 required, W-9 on file
  - Documents (a notes box)
  - Activity
- **Missing:** no payouts and no owner portal.

— [owners/owners.jsx](C:/Pro/geiger-property/components/internal/screens/owners/owners.jsx)

**Vendors** — 9 sections
- **Statuses:** Active, Preferred, Inactive.
- **Sections:**
  - Overview
  - Details (address)
  - Specialties: service areas, availability, emergency service
  - Compliance: insurance provider, license number, W-9 on file (the insurance-expiry column is shown)
  - Rates: callout fee, payment terms
  - Ratings: a 0–5 number, jobs completed, review notes
  - Documents (names only)
  - Notes
  - Settings
- **Missing:** no list of the vendor's work orders, no expiry alerts, no vendor portal or payments.

— [maintenance/vendors.jsx](C:/Pro/geiger-property/components/internal/screens/maintenance/vendors.jsx)

#### E. Leasing
**Leases** — 13 sections
- **Statuses:** Active, Pending, Expiring soon, Draft, Ended.
- **Views:** All, Active, Drafts, Ending soon, Ended.
- **List columns:** Lease, Tenant · Unit, Status, Ends (with days left), Rent.
- **KPIs:** Leases, Monthly rent, In progress, Ending ≤60 days.
- **Create:** name, unit (fills rent), tenant, status.

| Group | Section | Fields / behaviour |
|---|---|---|
| (top) | Overview | read-only, including days remaining |
| Terms | Terms & Rent | rent, deposit, term start/end, status |
| Terms | Parties | tenant relation; landlord, guarantor, co-signer as **free text** |
| Terms | Unit & Property | unit, property, address |
| Terms | Charges & Deposits | label + amount list in `metadata` |
| Builder | Clauses | label + detail list |
| Builder | Preview | assembled lease text with copy-to-clipboard |
| Lifecycle | Addenda | child table `lease_addenda`: name + summary |
| Lifecycle | E-signature | requests in `esign_requests` with a status select; nothing is sent |
| Lifecycle | Documents | name-only list |
| Lifecycle | Renewal | option (Auto-renew, Manual, Month-to-month, Do not renew), notice days, increase % |
| Lifecycle | Custom Fields | from Settings → Custom Fields |
| Lifecycle | Activity | a notes field |

- **Missing:**
  - no rent schedule or escalations
  - no late-fee or grace terms per lease
  - no utilities responsibility
  - no pet/parking terms
  - no ledger
  - no generation from a template (Templates are not merged into leases)

— [leasing/config.jsx](C:/Pro/geiger-property/components/internal/screens/leasing/config.jsx); [leasing/lease_sections.jsx](C:/Pro/geiger-property/components/internal/screens/leasing/lease_sections.jsx)

**Other leasing screens** — all engine configs. Fields marked *meta* live in `metadata`.

| Screen | Sections | Notable fields and behaviour |
|---|---|---|
| Renewals | Overview (with a working "Renew lease" button that updates the lease's term and rent and sets it Active), Terms, Rent increase, Communication, Activity | Statuses: Not started, Offer sent, Negotiating, Accepted, Declined, Moving out. "Offer sent" is a status only; nothing is sent |
| Move-ins & Move-outs | Overview, Unit & Parties, Checklist, Inspection, Documents, Keys & Access, Utilities, Deposit Reconciliation, Activity | Keys & Access and Utilities show for move-ins only; Deposit Reconciliation (held, deductions, refund due, forwarding address) for move-outs only. Inspection fields: scheduled date, inspector, complete, condition summary. Utilities: electric, water, gas, internet status. Inspection and deposit data are **not linked** to the Inspections or Deposits tables |
| Inspections | Overview, Unit & Parties (type), Rooms & Areas (list with a free-text condition), Photos (real upload), Condition Notes, Sign-off (inspector, tenant present, signed date, status), Activity | Types: Move-in, Move-out, Routine, Annual, Drive-by. No signature capture and no structured room/item rating scale |
| Security Deposits | Overview, Lease & Tenant, Amount & Holding (received date, interest-bearing), Deductions (itemized), Refund (suggested refund, amount, date, method), Documents, Activity | Refunds post nothing to accounting; no interest calculation |
| Notices & Violations | Overview, Details (amount due), Notice text, Service record, Activity | Types: Late rent, Lease violation, Entry notice, Non-renewal, Rent increase, Other. Delivery methods: Hand delivered, Posted, Certified mail, Email, Portal. Nothing is generated or delivered |
| Templates | Overview, Template Body, Merge Fields, Merge Preview (sample values for 14 tokens), State Requirements + Required Disclosures (state templates only), Settings, Activity | Scope: generic or state. Templates are never merged into a real lease |
| E-signature | Overview, Signers (with email), Document (link URL, message), Audit Trail (typed by hand), Reminders (cadence, last reminder) | The screen states that no provider is connected and nothing is sent |

— [leasing/](C:/Pro/geiger-property/components/internal/screens/leasing/renewals.jsx)

#### F. Marketing and leads

| Screen | Sections | Notable fields and behaviour |
|---|---|---|
| Listings | Overview, Details (unit, property, rent, available date, beds, baths, status), Description, Photos (real upload), Syndication, Promotions (label + value), Activity | Syndication has 7 switches (website, Zillow, Trulia, Apartments.com, Rent.com, Craigslist, Facebook) that only record manual posting; the screen says publishing "isn't connected yet" |
| Prospects | Overview, Contact (preferred contact), Preferences (unit, move-in date, budget, source, bedrooms, pets, must-haves), Follow-ups (checklist with due dates), Activity | Statuses: New, Contacted, Touring, Applied, Leased, Lost. No convert-to-application action and no reminders |
| Showings | Overview, Details (prospect, unit, date, time as text, type, agent as text), Feedback (interest level, follow-up needed, notes), Activity | Types: In-person, Self-guided, Virtual. No calendar and no reminders |
| Applications | Overview, Applicant (DOB, current address), Co-applicants & occupants, Income (employer, position, time employed, other income, income-to-rent ratio), Screening (entered by hand, no provider), Fees (recorded only), Decision, Activity | Decision has a working **"Convert to tenant + draft lease"** button that creates a tenant and a Draft lease and links them. It does not update the prospect or waitlist entry |
| Waitlist | Overview, Contact, Preferences, Activity | No offer or convert action, no reordering |
| Rent Comparables | Overview, Details, Amenities list, Activity | Entered by hand; computes a "vs. yours" gap by bedroom count; no market-data feed |

— [marketing/](C:/Pro/geiger-property/components/internal/screens/marketing/applications.jsx)

#### G. Maintenance
**Work Orders** — 17 sections in 6 groups; the most sections of any Property editor. One screen merges work orders, tenant requests and field visits.
- **Views:** All, Work orders, Requests, Field, Open.
- **Statuses:** work orders Open, In progress, On hold, Completed, Draft; requests Submitted, In review, Approved, Rejected, Converted.
- **Priorities:** Low, Medium, High, Urgent.
- **Categories:** Plumbing, Electrical, HVAC, Appliance, General, Landscaping, Pest control, Cleaning.
- **KPIs:** Open, High & urgent, Requests to triage, Total cost.
- **Create:** summary, priority, category.

| Group | Section | Fields / behaviour |
|---|---|---|
| (top) | Overview | read-only facts |
| Work order | Details | summary, type, category, unit, property, tenant, description |
| Work order | Schedule | scheduled date, due date, arrival window, estimated hours, access notes |
| Work order | Assignment | vendor relation, technician, technician phone, crew, notes |
| Work order | Vendor Assignments | child table: scope + vendor |
| Work order | Priority & Status | priority, status, category |
| Request | Requester | requested by, contact, submitted date, preferred time, permission to enter |
| Request | Approval | status, priority, reviewed by, decision notes, and a working "Convert to work order" |
| Field | On-site Checklist | checkable list |
| Field | Field Report | notes field |
| Costs & work | Labor | entries with hours |
| Costs & work | Materials | entries with cost |
| Costs & work | Costs | labor, materials, total — typed by hand, not summed from Labor/Materials |
| Records | Photos & Attachments | real upload |
| Records | Timeline | list of event + date as text |
| Records | Activity | notes field |
| General | Settings | type, status, priority, field-visit switch |

- **Missing:** no SLA timers, no billing back to the tenant, no inventory deduction, no link to bills.

— [maintenance/config.jsx](C:/Pro/geiger-property/components/internal/screens/maintenance/config.jsx); [maintenance/work_order_sections.jsx](C:/Pro/geiger-property/components/internal/screens/maintenance/work_order_sections.jsx); [maintenance/shared.js](C:/Pro/geiger-property/components/internal/screens/maintenance/shared.js)

**Other maintenance screens**

| Screen | Sections | Notable fields and behaviour |
|---|---|---|
| Preventive & Recurring | Overview (with a working **"Create work order now"** that inserts a work order and advances the next due date), Details (instructions), Recurrence (season), Task Steps, Generated Work Orders, Activity | Frequencies: Weekly, Monthly, Quarterly, Semi-annually, Annually. The screen says "there's no background scheduler yet" |
| Unit Turns | Overview, Details (turn lead), Checklist (7 default tasks), Costs (spent / budget / remaining), Photos (real upload), Activity | Statuses: Not started, In progress, Ready, Leased. Not created from move-outs; no link to work orders or bills; "Leased" does not touch the unit |
| Inventory & Parts | Overview, Details (supplier, supplier part no.), Stock (quantity, reorder level, unit cost, reorder qty), Usage & Restocks, Activity | Status is computed: In stock, Low, Out of stock. Usage entries don't change the quantity |

— [maintenance/preventive.jsx](C:/Pro/geiger-property/components/internal/screens/maintenance/preventive.jsx); [maintenance/unit_turns.jsx](C:/Pro/geiger-property/components/internal/screens/maintenance/unit_turns.jsx); [maintenance/inventory.jsx](C:/Pro/geiger-property/components/internal/screens/maintenance/inventory.jsx)

#### H. Accounting
All seven screens are engine configs. There is no double-entry ledger.

| Screen | Sections and behaviour |
|---|---|
| Rent Collection | Statuses: Current, Due, Partial, Overdue, In collections, Draft. Sections: Overview, Tenant & Unit, Rent & Schedule (frequency Monthly/Weekly/Biweekly/Quarterly), Charges (label + amount), Payments (label + amount, no date or method), Late Fees (Flat/Percent, amount, grace days), Autopay & Method. Late fees and autopay are stored only; payments don't post to Transactions |
| Transactions | Overview, Details, Memo — **3 sections, thin**. Tabs: All, Income, Expenses, Transfers. The account is a text label; no reconciliation |
| Recurring Charges | A Posting tab with a working "Post next charge" that adds the charge to the tenant's rent account and advances the date. Posting is manual only; there is no scheduler |
| Bills & Payables | A Payments tab that records a payment (date, amount, method ACH/Check/Card/Wire/Cash), creates an Expense transaction, and updates Open → Partially paid → Paid |
| Chart of Accounts | Tabs by account type; a one-click 16-account starter chart; a Ledger tab matched by text label; no balances |
| Budgets | Lines (annual income and expense categories) and Actuals (budget vs. actual); annual amounts only |
| Bank Accounts | Balance tab with a manual balance and last-reconciled date; no bank feed |

— [accounting/](C:/Pro/geiger-property/components/internal/screens/accounting/bills.jsx); [accounting/shared.js](C:/Pro/geiger-property/components/internal/screens/accounting/shared.js)

#### I. Communications, documents, reports, automations, settings, overview
- **Inbox:** a manual log with tabs by channel and direction and 3 sections; no sending or receiving. — [communications/inbox.jsx](C:/Pro/geiger-property/components/internal/screens/communications/inbox.jsx)
- **Announcements:**
  - Audiences: All tenants, Property tenants, Owners, Vendors. Channels: Email, SMS, Portal.
  - Estimated recipient count; "Mark as sent" only changes the status.

  — [communications/announcements.jsx](C:/Pro/geiger-property/components/internal/screens/communications/announcements.jsx)
- **Message Templates:**
  - Categories: Leasing, Maintenance, Payments, General.
  - The preview fills 5 tokens with sample values; templates are never merged with real data.

  — [communications/message_templates.jsx](C:/Pro/geiger-property/components/internal/screens/communications/message_templates.jsx)
- **Document Library** (hand-built, no detail view):
  - Merges library uploads, tenant documents and maintenance attachments.
  - Filters: source and kind. Kinds: lease, inspection, insurance, invoice, notice, other.
  - Upload is real.
  - No rename, tagging or linking.

  — [documents/document_library.jsx](C:/Pro/geiger-property/components/internal/screens/documents/document_library.jsx)
- **Reports** (read-only, computed in the browser, CSV export only):
  - Rent Roll, Delinquency (0–30/31–60/61–90/90+ aging), Occupancy & Vacancy, Owner Statements, Financial Statements (P&L, simplified Balance Sheet, Cash Flow), Maintenance Report, Leasing Report (prospect → lease funnel).
  - Periods are a fixed list.
  - No PDF, print, custom date range, or scheduled/emailed reports.

  — [reports/report_kit.jsx](C:/Pro/geiger-property/components/internal/screens/reports/report_kit.jsx); [reports/shared.js](C:/Pro/geiger-property/components/internal/screens/reports/shared.js)
- **Automations:**
  - 7 triggers: rent overdue, lease expiring in 60 days, work order created/completed, application submitted, move-out scheduled, insurance expiring.
  - 5 actions: create task, apply late fee, send template, notify member, change status.
  - Conditions are free-text labels.
  - **Nothing executes:** a banner says the runner isn't connected, and there is no `app/api`, cron job or database trigger.

  — [automations/automations.jsx](C:/Pro/geiger-property/components/internal/screens/automations/automations.jsx)
- **Settings:** stored in `property.settings` as one JSON value per key.

  | Page | Fields | Status |
  |---|---|---|
  | Company Profile | legal name, DBA, license, contact, address, timezone, currency | Never read elsewhere |
  | Custom Fields | Text/Number/Date fields per entity | **The only setting used elsewhere** |
  | Fees & Policies | due day, grace days, late fee type/amount/max, application fee, NSF fee, payment-method toggles | Never read elsewhere |
  | Branding & Portals | display name, logo URL, accent colour, resident/owner/vendor portal toggles | Never read elsewhere; "Portals aren't live yet" |
  | Integrations | 6 cards (Stripe payments, e-signature, screening, syndication, accounting export, Email & SMS), all with a **disabled** Connect button; a webhooks list with 6 events | Webhooks are never sent |
  | Roles & Permissions | role editor and permission matrix | Gates nothing: the sidebar passes no roles, and `roleHasPermission` returns true when there are none |
  | Team & Members | engine screen | Invitations are not emailed |

  — [settings/](C:/Pro/geiger-property/components/internal/screens/settings/integrations.jsx); [lib/rbac.js](C:/Pro/geiger-property/lib/rbac.js)
- **Property Overview:** real data.
  - KPIs: Occupancy %, Rent collected (MoM), Delinquent balance, Open work orders.
  - Widgets:
    - Rent-over-time line chart
    - Unit status pie
    - Leasing funnel radar
    - Occupancy and collection gauges
    - Top properties
    - 6 "Needs attention" tiles

  — [overview/property_overview.jsx](C:/Pro/geiger-property/components/internal/screens/overview/property_overview.jsx)

#### J. Persistence (lib/supabase)
- **Table-backed data layers (~54 tables in the `property` schema):** properties, units, buildings, portfolios, floor_plans, floor_plan_links, unit_types, amenities, amenity_links, media, documents, activity, tenants, tenant_households, tenant_occupants, tenant_documents, tenant_communications, owners, vendors, vendor_assignments, leases, lease_addenda, lease_templates, esign_requests, renewals, moves, inspections, security_deposits, notices, listings, prospects, showings, applications, waitlist_entries, rent_comps, work_orders, maintenance_attachments, pm_schedules, unit_turns, inventory_items, rent_accounts, transactions, recurring_charges, bills, gl_accounts, budgets, bank_accounts, announcements, message_templates, automations, team_members, settings, plus pfp.
- **Media:** stored in the `products` storage bucket.
- **How tables are built:** most use the generic `makeEntityData` factory, which provides list, get, create, update and soft delete, with project scoping and a `metadata` bag.
- **Migrations:** 15 files, with `full_build_tables.sql` creating 23 tables.

— [lib/supabase/](C:/Pro/geiger-property/lib/supabase/entity_factory.js); [supabase/migrations/](C:/Pro/geiger-property/supabase/migrations/20261010165221_full_build_tables.sql)

### Inferences
- **Breadth matches mainstream property-management software; depth and automation do not.** Almost every industry module has a screen: listings, applications, leases, renewals, inspections, deposits, work orders, preventive maintenance, rent collection, accounting, owner statements and reports. Each, however, is a manual record-keeper. The big industry differentiators are all absent or stubbed:
  - online rent payments
  - tenant screening
  - e-signature
  - listing syndication
  - resident and owner portals
  - bank feeds and reconciliation
  - automated workflows
  - messaging delivery
- **The asset editors carry the least domain depth relative to their importance.** Properties, Units, Buildings, Portfolios, Unit Types and Amenities each have ~5–10 basic fields; their "Settings" section is only status + delete; Activity has no automatic audit trail. Portfolios, Amenities, Media, Floor Plans and Unit Types are the thinnest.
- **Work Orders, Tenants and Leases come closest to the events editor's model** of grouped sections with specific sub-features. Even there, sections are flat field grids, with no previews, rule builders, repeaters with per-row dialogs, or conditional sections.
- **Many entities model one-to-many data as one-to-one:** one emergency contact, one vehicle, one pet, guarantor as text. Industry tools treat these as lists.
- **Cross-module links are partly missing.** These have no real relationship:
  - Moves ↔ Inspections and Deposits
  - Owners ↔ Properties
  - Vendors ↔ Work orders
  - Turns ↔ Moves
  - Templates ↔ Leases
  - Payments ↔ Transactions

  This limits automation and reporting accuracy.

### Gaps
- Field counts per section were read from configs. Runtime behaviour, including sandbox seed data under `lib/sandbox/seed`, was not exercised in a browser.
- This inventory does not compare features against industry vendors (AppFolio, Buildium, Yardi, Entrata, etc.); that is covered by other researchers.
- The exact column list per table in the migration SQL was not transcribed; table names come from the data-layer files.

## What is the structure/depth of the Geiger Events editor that Geiger Property should mirror?

### Takeaway
The Geiger Events "Edit Event" editor uses the same shell pattern (header plus a right-hand grouped section nav) at roughly 5–10× the depth:
- **67 nav entries** in 13 labelled groups, with nav search and conditional tabs.
- About **730 distinct controls** outside page design, and about **900–950** including the page builder.
- Rich control types: repeaters with add/edit dialogs, rule builders, live previews, option cards, colour fields, maps, and feature switchboards.

Geiger Property's largest editor (Work Orders, 17 sections, ~60 controls) is roughly a quarter of the Events nav in section count and under a tenth in controls.

### Cited Findings

#### Shell structure
- **Files and layout.**
  - `event_detail.jsx` renders `EditorShell` (shared/editor_shell.jsx); the nav and section map live in `event_sections.js` (`NAV_GROUPS`, `SECTIONS`).
  - Two columns: body on the left, a 260px right-hand nav, each scrolling independently.

  — [event_detail.jsx](C:/Pro/geiger-events/components/internal/screens/events/event_detail.jsx); [event_sections.js](C:/Pro/geiger-events/components/internal/screens/events/event_sections.js); [editor_shell.jsx](C:/Pro/geiger-events/components/internal/shared/editor_shell.jsx)
- **Header.** Back link "All Events", title, status pill, and a meta line (date · time · venue). Actions:
  - an attendee-pass preview dialog
  - "View live page", which opens `/e/<id>`
  - "Save Changes"

  Status and visibility are set in Overview; delete and duplicate are list-row actions only. — [event_detail.jsx](C:/Pro/geiger-events/components/internal/screens/events/event_detail.jsx)
- **Nav.**
  - Each item is plain data: `{key, label, icon, desc, ownHeader, showIf}`.
  - An `ExpandableSearch` ("Search screens…") filters the items.
  - `showIf` hides tabs until a feature is enabled: 5 tabs depend on Ticket Rules switches, 2 on the Packages add-on.
  - URL state: `?event=<id>&section=<key>`.

  — [event_sections.js](C:/Pro/geiger-events/components/internal/screens/events/event_sections.js); [editor_shell.jsx](C:/Pro/geiger-events/components/internal/shared/editor_shell.jsx)
- **Save model.**
  - Each tab owns one top-level `metadata` key, through `useEventConfig(event, key, fallback, onPatch)` → `[value, setValue, save, saving]`.
  - It persists through the shallow-merge RPC `events.event_merge_meta(p_id, p_patch)`, so one tab never overwrites another.
  - Real columns go through `toRow`.
  - Tabs either autosave per control or use an explicit "Save" button with a spinner.

  — [lib/events/use-event-config.js](C:/Pro/geiger-events/lib/events/use-event-config.js); [lib/supabase/events.js](C:/Pro/geiger-events/lib/supabase/events.js)
- **Known defects in the events editor (do not copy):**
  - Most tabs don't pass `onPatch`, so sibling tabs go stale after a save, and tabs sharing a key (`tickets`, `attached`) can overwrite each other.
  - "Save Changes" always reports success.
  - Duplicate headers on some tabs.
  - Per-keystroke saves and toasts on a few tabs.
  - 3 orphaned sections: discounts, bundles, payments.

  — [event_sections.js](C:/Pro/geiger-events/components/internal/screens/events/event_sections.js); [lib/events/use-event-config.js](C:/Pro/geiger-events/lib/events/use-event-config.js)

#### Tab inventory
Grouped as in the nav; approximate control counts in brackets. Source for all of this: the files under [components/internal/screens/events/](C:/Pro/geiger-events/components/internal/screens/events/event_sections.js) and screens/tickets/.

**Top**
- **Overview** [~14]:
  - A 4-KPI StatGrid: Tickets sold, Revenue, Sell-through, Days to go.
  - At-a-glance facts.
  - A Status & sharing card: status and visibility selects that save immediately.
  - A pre-launch checklist in the `event_notes` table, with a progress bar, due dates, an Overdue flag and an add dialog.
- **Alerts** [~20]:
  - 12 triggers in 3 families (time-based, sales, activity), each with a dynamic parameter: an offset, a threshold or a digest.
  - Recipients: co-hosts, specific emails, or targeted buyers through an AudienceBuilder.
  - An enable switch per alert and a live summary sentence.

**General**
- **Event details** [8]: name, organizer and avatar upload, summary, format, date, start time.

**Operations**
- A schema-driven records/workflow mini-app with Records, Workflow (11 sub-tabs) and Configure (module, field, state and transition editor) tabs.

**Design**
- **Page design** [~70 settings + ~50 gallery actions]:
  - 4 modes (Standard, Themed, Import, Custom) and 5 sub-tabs:
    - **Brand:** logos, 10 colour fields, tagline, favicon.
    - **Typography:** 7 controls.
    - **Layout:** a gallery of 10 presets and 19 classic layouts with device preview; shape and style (10 controls); page background; viewer theme.
    - **Header & footer:** nav-link repeater, CTA, hero and cover styles, footer socials and links.
    - **Sections:** block lists with a block library.
  - A full-screen page builder: 46 components, undo/redo, per-breakpoint inspector, custom code, saved layouts.

**Page group (11)**
- **Cover Media** [~22]: cover upload; gallery upload or link; per-item settings; carousel/grid layout settings.
- **Rich Description** [3].
- **What to Expect, FAQ and On-demand Video** [~8 each]: generic repeaters with add/edit dialogs and up/down ordering.
- **Schedule** [~30]: an item dialog with a live preview, Standard/Clip-from-web/Custom HTML item types, and a list/grid/timeline style popover.
- **Section Notes**.
- **Disclaimer** [12]: 9 placement checkboxes across the event page and checkout.
- **Guests** [~20]: a layout dialog with a live preview.
- **Speakers**: attached from project records.
- **Infographics** [~58]: 5 block types with schema forms and nested repeaters.

**Location group (3)**
- **Location & Time** [~20]: address search, map pin, coordinates, saved venue, room, timezone, doors-open and end times.
- **Map & Directions** [~8]: nearby amenities detected automatically, directions links, weather, transport and parking notes.
- **Dietary & Accessibility guidelines**: a repeater.

**Tickets group (20, incl. 5 rule-gated)**
- **Tickets** [~22]: groups; dialog with name, price, quantity, description, group, type, discount codes.
- **Seating**: seat map, buyer flow, holds.
- **Exhibitor Floor**: halls, booth mapping, holds.
- **Offerings** [~15].
- **Packages** [~20].
- **Packages Page**.
- **Call to action**.
- **Ticket Selection** [~10].
- **Express Lane** [~18]: a readiness checklist with "Fix" buttons that jump to the right tab, plus a live preview.
- **Purchase Disclaimer** [~9].
- **Slots** [~22]: a 13-field dialog.
- **Purchasables** [~23]: a rule builder with all/any matching and 8 rule types.
- **Ticket Rules** [14]: a switchboard of 7 features, each with "Configure →".
- **Rule-gated tabs:** Early-bird, Donations, Access Codes, Reserved, Group Orders.
- **Batched Releases** [~38]: a wave-chain editor and a split wizard.
- **Memberships**.

**Ungrouped policy tabs (5)**
- Orders & Attendees, Invoices, Anti-scalping, Multi-currency, Dynamic Pricing.
- Mostly read-only dashboards, each with "attach from catalog" toggles and a "Manage →" link.

**Sponsorship group (4)**
- **Sponsor Spots** [~28]: spot and fill dialogs, progress bars, KPIs.
- **Sponsor Enquiries** [~19].
- **Sponsor Page** [~28]: a form-fields editor with conditional questions.
- **Sponsor Display** [~25]: a live preview.

**Registration group (3)**
- **RSVP Options** [14].
- **Custom Questions** [~7].
- **Registration Settings** [2].

**Check-in group (5)**
- Check-in options (4 switches).
- Multi-gate & Zones [~11].
- Sessions.
- Door Sales & Kiosk.
- Badge Printing (with a 3D preview).

**Communication**
- Chat channel setup [5].

**Sharing group (5)**
- Custom URL.
- SEO & Sharing (title and description character counters, social card preview).
- Add to Calendar.
- Embeddable Widget (type, theme, width, preview, embed code).
- Localization.

**Team**
- **Co-hosts & Admins** [~16]: a DataTable with role filter and search, 5 roles, add-from-team and add/edit dialogs, optimistic CRUD in `event_team_members`.

**Settings group (4)**
- **Visibility** [7]: option cards, listing switch, password/indexing/sign-in.
- **Time-zone** [4].
- **Hybrid Mode** [7].
- **Recurring Events** [7]: repeat pattern, weekday chips, end rule, upcoming-occurrences table.

#### Patterns worth mirroring
1. **One shared shell, with the nav as plain data.** Add nav search, `showIf` conditional tabs, and a feature-switchboard tab whose rows have "Configure →" `onNavigate` links.
2. **One metadata key per tab**, saved through a shallow-merge RPC (`<schema>.<entity>_merge_meta`). Only real columns go through `toRow`.
3. **Card layout.** A `SectionCard` stack, `SettingsList`/`SettingRow` switch rows with a control slot, `Field` grids, and sub-fields that appear when a switch is turned on.
4. **Repeaters.** Card rows with an enable switch, up/down, edit and delete; one add/edit dialog component; a red delete confirmation; an empty state.
5. **Choice controls.** Option cards, segmented controls, glyph/tile pickers and `ColorField`.
6. **Live previews next to settings** (badge, express sheet, SEO card, embed, sponsor display).
7. **Attach-from-catalog cards** with "Manage →" and "Create one" links.
8. **Fully data-backed CRUD tabs** (Team, Sponsor Spots): optimistic updates with `crypto.randomUUID`, rollback, `LogoLoading`, and loading, empty and filtered-empty states.
9. **Fix navigation across tabs.** Readiness checklists link straight to the tab that needs attention.

— [event_sections.js](C:/Pro/geiger-events/components/internal/screens/events/event_sections.js); [editor_shell.jsx](C:/Pro/geiger-events/components/internal/shared/editor_shell.jsx)

### Inferences
- **The scaffolding is already shared.** Property's `EntityDetailScreen` was ported from `event_detail.jsx`: the same grouped right-hand nav, `?section=` in the URL, and `onPatch`/`onCommit`. Reaching Events-level depth is mostly about **content per section**, not new infrastructure. Infrastructure worth porting:
  - nav search
  - `showIf`
  - a `useEntityConfig` + `<entity>_merge_meta` RPC hook
  - repeater + dialog primitives
  - live-preview panes
- **Events-style "feature switchboard" tabs map directly onto property-management features.** A Property or Unit "Policies & Features" switchboard could include:
  - pets allowed
  - parking
  - utilities included
  - smoking
  - Section 8 / vouchers
  - short-term rentals

  Each would gate tabs such as Pet Policy, Parking Spaces, Utility Billing and Rent Concessions — just as Ticket Rules gates Early-bird and Releases.
- **Property-side equivalents of Events' best tabs:**

  | Events tab | Property equivalent |
  |---|---|
  | Alerts | Lease-expiry, insurance-expiry and delinquency alerts per property |
  | Slots / Purchasables | Amenity booking rules |
  | Releases | Rent escalation schedules |
  | Sponsor Page / Display | Listing page / syndication design |
  | SEO & Sharing / Embed | Listing SEO and an availability widget |
  | Recurring Events | Recurring charges and PM schedules |
  | Express readiness checklist | Unit "rent-ready" checklist with Fix links |

- **Depth target.** Events has ~67 tabs / ~730 controls; Property's richest editor has ~17 sections / ~60 controls. A realistic aim is 15–30 sections and 100–250 controls for the core entities (Property, Unit, Lease, Tenant, Work Order).

### Gaps
- Control counts for the events editor are approximations from reading the code; the Operations workspace and page builder were not counted precisely.
- The events editor's own defects (stale sibling tabs, overlapping writes, always-success Save, static sample arrays in Localization and Redirects) are listed so they are not copied. Their runtime impact was not verified in a browser.
