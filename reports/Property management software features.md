# Turn Geiger Property's record-keepers into operating engines

Every serious property management platform builds the same thing: a tabbed detail page for each core record (property, unit, lease, tenant, owner, vendor, work order, application). Each page follows a shared skeleton (General, then entity-specific tabs, then Ledger, Settings/Overrides, Files, Notes, History and Custom fields). Settings cascade from Company to Property to Lease, a header Actions menu holds lifecycle operations, and multi-step wizards handle move-out and renewal. Geiger Property already matches the market's **breadth**: 58 registered screens across 13 nav groups, all backed by real `property.*` tables. It lacks the market's **depth and engines**. Its richest editor (Work Orders) has 17 sections and about 60 controls, while the Geiger Events editor it was ported from has about 67 tabs and about 730 controls. And nothing in Property sends, schedules, posts money, or connects to a provider. The largest gaps are structural:

- **No double-entry ledger or payments engine.** Payments do not post to Transactions.
- **No settings cascade.** Fees & Policies is never read anywhere.
- **One-to-many data stored as singletons.** Tenants have one emergency contact, one pet and one vehicle.
- **Thin core financial records.** Properties have no ownership, banking, management-fee or late-fee tabs. Leases have no rent schedule, ledger or payment overrides.
- **No working portals.**

AI agents (leasing, maintenance triage, resident messaging, bill scanning, natural-language analytics, plus MCP/Claude connectors) are now standard at the enterprise vendors and are the main premium-tier upsell for SMB vendors. That makes them the obvious differentiator once the basics work. The recommended order is: fix the editor engine (P0), deepen the seven core editors to 15–30 tabs each (P1a), wire the money and messaging engines plus portals (P1b), then ship workflows and AI agents (P2–P3).

## Six vendors converge on one record skeleton and a three-level settings cascade

The per-record detail pages of AppFolio, Buildium, Rent Manager, DoorLoop, Rentvine and Propertyware differ in naming but not in shape.

- **Rent Manager is the most granular.** Its RM12 help site documents a separate page for every record tab. A property alone has about 20 tabs: General, Owners, Fees, Fees Setup, Late Fees, Recurring Charges, ePay, Screening, SD Interest, Images, History/Notes, User Defined Fields, Accounting Close, Association, Owner Check Setup, Property Files, Default Charge Setup, Application Settings, Association Settings, Reservable Amenities and Holidays ([RM12 Help](https://rm12help.rentmanager.com/)).
- **Buildium and Rentvine document field-level detail through public OpenAPI specs.** Those specs mirror what each edit form stores ([Buildium Open API](https://developer.buildium.com/); [Rentvine API docs](https://docs.rentvine.com/)).
- **Rent Manager and Buildium attach notes, files, history and custom fields to nearly every record.** Across all of them the common skeleton is **Overview/General → entity-specific tabs → Financials/Ledger → Settings/Overrides → Files → Notes → History → Custom fields**.

Geiger's `EntityDetailScreen` already has the right frame: a grouped right-hand nav with `?section=` in the URL. What it lacks is the content inside that frame ([entity_detail_screen.jsx](C:/Pro/geiger-property/components/internal/screens/entity/entity_detail_screen.jsx)).

**Settings are inherited, not copied.** In DoorLoop, lease settings override property settings, which override company settings. Late fees, payment reminders, payment instructions and tenant-portal settings can each be overridden per property ([DoorLoop: property-specific late fees](https://support.doorloop.com/en/articles/8358223-set-up-property-specific-automatic-late-fees); [DoorLoop: tenant portal settings](https://support.doorloop.com/en/articles/6081899-customize-tenant-portal-settings)). The other vendors follow the same pattern:

- **AppFolio:** property late-fee settings are the defaults applied at move-in, and the per-occupant setting is what actually posts ([PM Bookkeeper, 2019](https://www.pmbookkeeper.com/blog/appfolio-adds-late-fee-customization)).
- **Rentvine:** assigns late-fee "profiles" per lease ([Rentvine help](https://help.rentvine.com/how-to-set-up-late-fees)).
- **Rent Manager:** recurring charges cascade **Property → Unit Type → Unit → Tenant** as "Inherited Charge Types" ([RM12: Tenant Recurring Charges](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Tenant-Recurring-Charges.htm)).

For Geiger this means building a reusable **policy object** for late fees, payment rules, statements and management fees. Each record would show the resolved value plus an "inherited from Company / Property, or overridden here" badge. Today Geiger stores a company-level Fees & Policies page that no other screen reads ([settings/](C:/Pro/geiger-property/components/internal/screens/settings/integrations.jsx)).

**Actions live in a header menu and multi-step wizards, not in field edits.** The header menu goes by different names: Rentvine's "Actions," DoorLoop's "Manage Lease" and AppFolio's right-hand "Tasks" panel. Each holds lifecycle actions such as renew, end lease, move out, transfer unit, activate/deactivate and send a portal invite. Money actions (post charge, receive payment, credit, refund, NSF reversal, withhold deposit) sit as primary buttons on the ledger tab ([DoorLoop: Lease Transactions](https://support.doorloop.com/en/articles/6076741-lease-transactions-overview); [APM Help: AppFolio tenant management](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-5-tenant-management)).

Move-out is a **wizard everywhere**. Rent Manager's runs verify lease → contact info → move-out actions, including "Kick Off Make Ready" and "Set Unit Status" ([RM12: Move Out Wizard](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Move-Out-Wizard.htm)). Rentvine's runs deposits → charges/credits → refund ([Rentvine help: move out](https://help.rentvine.com/how-to-move-out-a-tenant)). Geiger's editor header has only "Save changes." Its list rows offer the same Edit/Duplicate/Delete on every entity ([entity_list_screen.jsx](C:/Pro/geiger-property/components/internal/screens/entity/entity_list_screen.jsx)).

**Custom fields are typed, grouped and broadly attached.**

- **Buildium** supports custom field groups on 17 entity types, including Leases, Vendors, WorkOrders, Applicants and UnitListings. Field types are Checkbox, DropDown, ShortText, LongText and Date, each with IsRequired/IsActive flags ([Buildium Open API](https://developer.buildium.com/)).
- **Rentvine** adds Number, Decimal, Integer and Toggle types, plus user-defined lease and work-order statuses ([Rentvine API docs](https://docs.rentvine.com/)).
- **Rent Manager** puts a UDF tab on Property, Unit, Tenant, Prospect, Owner and Vendor. It also supports UDFs on leases, contacts and service issues, and recently added a Hyperlink type ([RM12: Property UDFs](https://rm12help.rentmanager.com/Topics/12/Management/Properties/User-Defined-Fields-Tab.htm)).

Geiger supports only Text, Number and Date, and only on properties, units, tenants and leases ([factories.jsx](C:/Pro/geiger-property/components/internal/screens/entity/sections/factories.jsx)).

The table below sums up the cross-cutting conventions a Geiger editor should adopt. The next section applies them record by record.

| Convention | Industry pattern | Vendors | Geiger today |
|---|---|---|---|
| Tab skeleton | General → entity tabs → Ledger → Settings/Overrides → Files → Notes → History → Custom fields | Rent Manager, Buildium, DoorLoop, Rentvine | Overview → Details → a few lists → Custom Fields/Documents/Activity/Settings |
| Settings cascade | Company → Property/Portfolio → Lease/Tenant, with overrides | DoorLoop, AppFolio, Rent Manager, Rentvine, Propertyware | None; company settings are never read |
| Header actions | "Actions"/"Manage Lease"/"Tasks" menu with lifecycle actions | Rentvine, DoorLoop, AppFolio | Single "Save changes" |
| Wizards | Move-in, move-out, renewal, ownership transfer, owner add | Rent Manager, DoorLoop, Rentvine | Two one-click converters (application → tenant + lease; request → work order) |
| History | Automatic system audit plus user notes | Rent Manager History/Notes; DoorLoop Notifications Log | Activity holds only typed notes; `createActivity` is called only from the note box ([activity_section.jsx](C:/Pro/geiger-property/components/internal/screens/entity/shared_sections/activity_section.jsx)) |
| Custom fields | 5–8 types, required/active, grouped, on 15+ entities | Buildium, Rentvine, Rent Manager | 3 types on 4 entities |
| One-to-many children | Lists for contacts, pets, vehicles, emergency contacts, occupants, cosigners | Rentvine, Buildium, Rent Manager | Singletons stored in `metadata` |

## Target editor tabs for each record type

The catalogs below list the tabs Geiger should build for each record. Each row gives the key fields, settings and actions, the vendors documented as offering it, and Geiger's current state.

Where the evidence comes from:

- **Rent Manager** tab names come from its help site.
- **Buildium and Rentvine** fields come from their APIs. These prove what is stored, not the exact UI layout.
- **AppFolio** detail comes from customer knowledge bases and APM Help training videos, because its help center is behind a login.
- **Propertyware** rests on search excerpts only, so it is the weakest source.

A realistic depth target is **15–30 sections and 100–250 controls** for the core records (Property, Unit, Lease, Tenant, Work Order). That is a quarter to a third of the Events editor ([geiger-events event_sections.js](C:/Pro/geiger-events/components/internal/screens/events/event_sections.js)).

### Property: from 10 sections to about 20

Geiger's property editor today has Overview, Details (9 fields), Units, Amenities, Floor Plans, Photos & Media, Custom Fields, Documents, Activity and Settings. Settings holds only a status select and a delete button ([properties/config.jsx](C:/Pro/geiger-property/components/internal/screens/properties/config.jsx)).

The biggest omissions are the **financial and ownership tabs**. Every vendor treats these as the heart of the property record.

| Target tab | Key fields, settings and actions | Who offers it | Geiger |
|---|---|---|---|
| Overview | Occupancy, rent roll, delinquency, open work orders; at-a-glance facts; map | Rentvine lat/long ([API](https://docs.rentvine.com/)) | Partial (read-only facts) |
| General | Name/short name, type + subtype (SingleFamily, MultiFamily, CondoTownhome, Office, Retail, Storage…); the type switches available features (Commercial, Association, Short Term Rental, RV/Campground); address, county, legal description, year built, total sq ft, property tax ID, time zone, manager, logo, management start/end date and end reason, non-revenue status | [Buildium API](https://developer.buildium.com/), [RM12 General](https://rm12help.rentmanager.com/Topics/12/Management/Properties/General-Tab.htm), [Rentvine API](https://docs.rentvine.com/), [AppFolio KB](https://treaty-oak-property-management-llc.helpscoutdocs.com/article/216-entering-new-landlord-property-info-in-appfolio) | Partial (9 fields) |
| Units & buildings | Unit list, bulk add, common-expense allocations, bulk CAM charges | [Buildium commercial](https://help.buildium.com/hc/s/article/Navigating-Commercial-Portfolios-in-Buildium), DoorLoop Custom Allocations ([help](https://support.doorloop.com/en/articles/6232512-set-up-property-specific-settings)) | Partial (add by label) |
| Owners & ownership | Primary owner, owner rows (start, end, %, reserve), bill-approval threshold; actions: Enter Ownership, Renew Ownership Contract | [RM12 Owners tab](https://rm12help.rentmanager.com/Topics/12/Management/Properties/Owners-Tab.htm), AppFolio Owners & Financials ([KB](https://treaty-oak-property-management-llc.helpscoutdocs.com/article/216-entering-new-landlord-property-info-in-appfolio)), DoorLoop Owners tab | Missing |
| Banking & accounting | Operating and escrow bank accounts, per-charge-type banks, reserve, fiscal year end, posting day, accounting close / locked periods, 1099 payer | Buildium Financials tab ([SoftwareConnect](https://softwareconnect.com/reviews/buildium/)), [RM12 General](https://rm12help.rentmanager.com/Topics/12/Management/Properties/General-Tab.htm), AppFolio ([KB](https://treaty-oak-property-management-llc.helpscoutdocs.com/article/216-entering-new-landlord-property-info-in-appfolio)) | Missing |
| Management fees | Commission type, % or flat, per-unit / per-occupied, min/max, leasing fee, renewal fee, waive when vacant, pass-through; actions: view breakdown, roll back last posting | [RM12 Fees Setup](https://rm12help.rentmanager.com/Topics/12/Management/Properties/Fees-Setup-Tab.htm), [RM12 Fees](https://rm12help.rentmanager.com/Topics/12/Management/Properties/Fees-Tab.htm), [AppFolio Ep. 3](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-3-how-to-set-up-a-new-property), Rentvine managementFeeSettingID | Missing (exists on Owner as one %) |
| Late fees & payment policy | Late fee type (fixed / % of rent / % of balance / script), grace period and grace balance, daily amount with monthly max, exclude weekends/holidays, eligible charges; NSF fee; ePay (ACH/card enabled, warning limit, offline payment instructions); partial-payment rule; payment allocation order | [RM12 Late Fees](https://rm12help.rentmanager.com/Topics/12/Management/Properties/Late-Fees-Tab.htm), [RM12 ePay](https://rm12help.rentmanager.com/Topics/12/Management/Properties/ePay-Tab.htm), [DoorLoop late fee policy](https://support.doorloop.com/en/articles/6191191-set-up-your-automatic-late-fees-policy), [Buildium API](https://developer.buildium.com/), [Buildium payment allocation](https://www.buildium.com/blog/introducing-custom-payment-allocation/) | Missing (company-level only, never read) |
| Default & recurring charges | Property-level recurring charges inherited by units and tenants; default charge setup | [RM12 Recurring Charges](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Tenant-Recurring-Charges.htm) | Missing |
| Leasing defaults | Default lease template, standard addenda, renewal templates, renewal increase ($ or %); application template and fee; screening-criteria overrides; Apply Now links; lease-term rent differential; showing provider | [AppFolio Ep. 3](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-3-how-to-set-up-a-new-property), [RM12 Screening](https://rm12help.rentmanager.com/Topics/12/Management/Properties/Screening-Tab.htm), [Rentvine API](https://docs.rentvine.com/) | Missing |
| Marketing | Marketing title/description, posted to website / internet, premium listing, syndicate units separately, available-on date, YouTube URL, pet policy | AppFolio Marketing Information ([KB](https://treaty-oak-property-management-llc.helpscoutdocs.com/article/216-entering-new-landlord-property-info-in-appfolio)), [DoorLoop](https://support.doorloop.com/en/articles/6232512-set-up-property-specific-settings) | Missing (lives only on Listings) |
| Amenities & utilities | Amenity enum (laundry, elevator, pool, gate, package receiving, smoke-free…), utilities included in rent (gas, electric, water, trash…), reservable amenities | [Buildium API](https://developer.buildium.com/), [RM12](https://rm12help.rentmanager.com/) | Partial (attach amenities; no utilities-included list) |
| Maintenance settings | Spend limit before approval, maintenance markup % / min / max, preferred vendors, default inspector, home-warranty coverage and expiry, maintenance notes, online-request instructions | [Rentvine API](https://docs.rentvine.com/), [AppFolio KB](https://treaty-oak-property-management-llc.helpscoutdocs.com/article/216-entering-new-landlord-property-info-in-appfolio), [Buildium API](https://developer.buildium.com/) | Missing |
| Insurance & compliance | Carrier/agent/policy/expiry; required renters-insurance liability amount; track-insurance flag; security-deposit interest (simple/compound, rate table); affordable/Section 8 flags | [Rentvine API](https://docs.rentvine.com/), [RM12 SD Interest](https://rm12help.rentmanager.com/Topics/12/Management/Properties/SD-Interest-Tab.htm), [DoorLoop](https://support.doorloop.com/en/articles/6232512-set-up-property-specific-settings) | Missing |
| Assets, keys & meters | Appliances with service history, assets (last/next maintenance), meter readings, keys, fixed assets | [Buildium API](https://developer.buildium.com/), [RM12 Unit General](https://rm12help.rentmanager.com/Topics/12/Management/Units/General-Tab.htm), [AppFolio KB](https://treaty-oak-property-management-llc.helpscoutdocs.com/article/216-entering-new-landlord-property-info-in-appfolio) | Missing |
| Budget | Annual/monthly budget, variance threshold | [AppFolio Ep. 3](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-3-how-to-set-up-a-new-property) | Missing (separate Budgets screen only) |
| Statements & portal | Statement settings, "Suppress Owner Visibility" on fees, tenant-portal override | [AppFolio Ep. 3](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-3-how-to-set-up-a-new-property), [DoorLoop portal](https://support.doorloop.com/en/articles/6081899-customize-tenant-portal-settings) | Missing |
| Association (shown only for HOA type) | Board members (role, term), committees, architectural requests with decision, board review settings | [RM12 Association](https://rm12help.rentmanager.com/Topics/12/Management/Properties/Association-Tab.htm), [Buildium API](https://developer.buildium.com/) | Missing |
| Photos & media | Upload, reorder, video-link images, cover | [Buildium API](https://developer.buildium.com/) | Has (no reorder) |
| Files / Notes / History / Custom fields | Standard | All | Partial (History has no system events) |
| Actions | Inactivate (with mass move-out), reactivate, delete, export | [RM12 General](https://rm12help.rentmanager.com/Topics/12/Management/Properties/General-Tab.htm), [Rentvine API](https://docs.rentvine.com/) | Delete only |

Rentvine adds a **Portfolio** layer that holds owner and distribution settings: statement settings, payout amount, min/max distribution, overdraft override, additional reserve, hold distributions, live-ledger toggle and owners ([Rentvine API](https://docs.rentvine.com/)). Geiger's Portfolio editor has five fields (name, manager, region, accent colour, description) and no owner or financial link ([portfolios/config.jsx](C:/Pro/geiger-property/components/internal/screens/portfolios/config.jsx)). It should either take on Rentvine's role or be merged into the Owner/Property relationship.

### Unit, unit type and floor plan

Units need dated rent history, listing fields, access instructions and a non-revenue flag. Geiger has a 10-field Details form and a four-field "Lease & Occupancy" section ([units/config.jsx](C:/Pro/geiger-property/components/internal/screens/units/config.jsx)).

| Target tab | Key fields, settings and actions | Who offers it | Geiger |
|---|---|---|---|
| General | Unit number, building, address, beds (Studio…9+), baths including halves, size, floor, unit type, max occupancy, site classification, inspection template, default deposit, commercial space type; RV fields (length, width, amps) | [Buildium API](https://developer.buildium.com/), [RM12 Unit General](https://rm12help.rentmanager.com/Topics/12/Management/Units/General-Tab.htm), [Rentvine API](https://docs.rentvine.com/) | Partial |
| Rent & pricing | Dated market-rent entries (add / edit / batch modify), legal rent, preferential rent, application fee, deposit | [RM12 Market Rent](https://rm12help.rentmanager.com/Topics/12/Management/Units/Market-Rent-Tab.htm), [AppFolio KB](https://treaty-oak-property-management-llc.helpscoutdocs.com/article/216-entering-new-landlord-property-info-in-appfolio) | Single rent value |
| Occupancy & status | Status, occupancy history, current lease link, non-revenue flag / type / start date (model or employee unit) | [RM12](https://rm12help.rentmanager.com/), [Rentvine API](https://docs.rentvine.com/), [AppFolio Ep. 3](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-3-how-to-set-up-a-new-property) | Partial (no history) |
| Listing | Listing date, rent, deposit, lease terms, available date, managed-externally flag, application URL, contact | [Buildium API](https://developer.buildium.com/) | On separate Listings screen |
| Features | Unit feature enum (A/C, dishwasher, W/D, hookups, fireplace, balcony, garage, fenced yard, pets, furnished…) | [Buildium API](https://developer.buildium.com/) | Has (amenities attach) |
| Recurring charges | Unit-level charges inherited from property/unit type | [RM12](https://rm12help.rentmanager.com/) | Missing |
| Access & instructions | Resident entry instructions, vendor entry instructions, maintenance notes, lease notes, keys | [Rentvine API](https://docs.rentvine.com/), [AppFolio KB](https://treaty-oak-property-management-llc.helpscoutdocs.com/article/216-entering-new-landlord-property-info-in-appfolio) | Missing |
| Assets & utilities | Appliances/assets with last and next maintenance, utility-billing flag, meter readings | [RM12 Unit General](https://rm12help.rentmanager.com/Topics/12/Management/Units/General-Tab.htm), [Rentvine API](https://docs.rentvine.com/), [Buildium API](https://developer.buildium.com/) | Missing |
| Inspections, work orders, leases | Related-record lists: last inspection date, work-order history, lease history | [AppFolio KB](https://treaty-oak-property-management-llc.helpscoutdocs.com/article/216-entering-new-landlord-property-info-in-appfolio) | Missing |
| Actions | Activate/deactivate, set status, kick off make-ready | [Rentvine API](https://docs.rentvine.com/), [RM12 Move Out Wizard](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Move-Out-Wizard.htm) | Delete only |

Among the vendors researched, only Rent Manager makes **Unit Type** a first-class record. It has General (type, other rentable item, beds, baths, inspection template), Images and Recurring Charges tabs, and an "Assign Unit Types to Properties" step that sets a per-property rent with Units/Active/Occupied counts ([RM12: Unit Types](https://rm12help.rentmanager.com/Topics/12/Management/Unit-Types/General-Tab.htm)). Buildium and Rentvine store beds, baths, size and market rent directly on the unit.

Geiger already has both Unit Types and Floor Plans. That is ahead of most vendors in structure. To make it useful, Geiger needs to add per-property rent, recurring-charge inheritance and a default inspection template ([unit_types/config.jsx](C:/Pro/geiger-property/components/internal/screens/unit_types/config.jsx)).

### Lease: the record with the most missing money mechanics

Geiger's lease editor has 13 sections and includes a clause builder and a text preview. But guarantor and co-signer are free text. There is no rent schedule, escalation, per-lease late fee, ledger or payment restriction. Templates are never merged into a lease ([leasing/config.jsx](C:/Pro/geiger-property/components/internal/screens/leasing/config.jsx)). The vendors treat the lease as the financial account.

| Target tab | Key fields, settings and actions | Who offers it | Geiger |
|---|---|---|---|
| Summary | Status (Active/Past/Future, or Pending/Active/Closed plus custom statuses), pre-activation step bar (e.g. deposit paid), balance, move-out status | [Buildium API](https://developer.buildium.com/), [Rentvine API](https://docs.rentvine.com/), [Rentvine KB](https://help.rentvine.com/leases) | Partial |
| Terms | Lease type (Fixed, Fixed-with-rollover, At-will), term type, start/end, move-in date, sign date, payment due day, notice date, expected move-out, eviction-pending flag (disables payments) | [Buildium API](https://developer.buildium.com/), [RM12 Leases](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Leases/Leases.htm), [DoorLoop leases](https://support.doorloop.com/en/collections/3376049-manage-your-leases) | Partial |
| People | Tenants, co-signers, occupants (name, DOB), applicants; auto-move-out of tenants; add/remove tenant; send portal invitations | [Buildium API](https://developer.buildium.com/), [Rentvine API](https://docs.rentvine.com/) | Tenant relation plus free-text guarantor/co-signer |
| Rent & recurring charges | Rent schedule (start, end, cycle: monthly, weekly, every 2 weeks, quarterly… one-time; backdate); charge lines (GL account, amount, memo, first charge date, post days in advance, due day); **escalations** (scheduled increases); one active rent charge plus other recurring charges; recurring credits and payments; first/last-month proration | [Buildium API](https://developer.buildium.com/), [Rentvine API](https://docs.rentvine.com/), [DoorLoop](https://support.doorloop.com/en/articles/6076741-lease-transactions-overview), [Propertyware auto charge](https://support.propertyware.com/s/article/How-to-Create-an-Auto-charge-on-a-Lease) | Label + amount list |
| Move-in charges & deposits | Deposit amount and due date, one-time move-in charges with proration; withhold, refund, transfer deposit to a new lease | [Buildium API](https://developer.buildium.com/), [Rentvine API](https://docs.rentvine.com/), [DoorLoop](https://support.doorloop.com/en/collections/3376049-manage-your-leases) | Missing (separate Deposits screen, not linked) |
| Ledger / transactions | Post charge, receive payment (auto-apply oldest first or manual), credit, refund, reverse payment with NSF charge, outstanding balances, download account statement | [Buildium API](https://developer.buildium.com/), [DoorLoop Transactions](https://support.doorloop.com/en/articles/6076741-lease-transactions-overview) | Missing |
| Payment settings & overrides | Late-fee profile and on/off switch; lease-level late-fee rule override; NSF amount; portal disabled; portal payments disabled; ACH/card/cash disabled; certified funds only; allowed payment amount type; require payment in full; past-due notices; statement settings and public statement | [Rentvine API](https://docs.rentvine.com/), [Buildium "Overrides"](https://www.apmhelp.com/educational-videos/buildium-training---ep-5-leases-and-adding-tenants-into-buildium), [Propertyware late fee rule](https://support.propertyware.com/s/article/Late-Fee-Rules-Individual-Lease) | Missing |
| Pets, vehicles, emergency contacts | Pets (type, name, age, weight, colour, vaccinated, service/ESA animal, pet-screening ID); vehicles (make, model, year, colour, plate, state); emergency contacts (list) | [Rentvine API](https://docs.rentvine.com/) | Missing on lease (singletons on tenant) |
| Insurance | Renters-insurance policies (carrier, policy, effective/expiry/cancel dates, insured tenants), tenant legal liability, requirement toggle | [Buildium API](https://developer.buildium.com/), [Rentvine API](https://docs.rentvine.com/), [DoorLoop](https://support.doorloop.com/en/collections/3376049-manage-your-leases) | Missing |
| Documents & e-sign | Signature status (signed/unsigned), e-sign transaction, document-published flag, addenda, generate from template | [Buildium training](https://www.apmhelp.com/educational-videos/buildium-training---ep-5-leases-and-adding-tenants-into-buildium), [RM12 Leases](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Leases/Leases.htm), [Rentvine API](https://docs.rentvine.com/) | Partial (records only, nothing sent) |
| Renewal | Renewal offer status (NotStarted, Generated, Sent, Accepted, PartiallySigned, Countersign, Activated…), renewal wizard (stop/create/update recurring charges), increase-eligibility date, pipeline 30–180 days out | [Buildium API](https://developer.buildium.com/), [DoorLoop](https://support.doorloop.com/en/collections/3376049-manage-your-leases), [Rentvine renewals](https://www.rentvine.com/blog/tip-of-the-week-episode-34---lease-renewal-workflows) | Partial (option, notice days, increase %) |
| Move-out | Notice date, expected and actual move-out, reason, deposit refund due date, forwarding name/address/email/phone, refund payout type, unit availability date, violation flag | [Rentvine API](https://docs.rentvine.com/), [AppFolio move-out](https://support.theearnesthomes.com/support/solutions/articles/61000269883-how-to-perform-move-out-and-security-deposit-refund-on-appfolio) | On separate Moves screen, not linked |
| Programs & flags | Section 8, rent-by-room, multi-unit commercial, prepaid rent, last-month deposit, risk indicators, resident benefits package | [DoorLoop](https://support.doorloop.com/en/collections/3376049-manage-your-leases), [Rentvine API](https://docs.rentvine.com/), [AppFolio Q3 2025](https://www.appfolio.com/articles/2025-q3-product-update) | Missing |
| Actions | Renew, End Lease (move-out date, notice, reason, files; ends portal access), Move-Out Tenant, Transfer to another unit, Notice to Vacate, set eviction, send rent reminder or overdue notice | [DoorLoop End a Lease](https://support.doorloop.com/en/articles/6067246-end-a-lease), [AppFolio transfer](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-6-tenant-moves-into-wrong-unit---transfer-tenant-task) | Renew exists only on the Renewals screen |

### Tenant / resident and household

The vendors split on how they model a household:

- **Rent Manager** uses one tenant **account** with many **contacts**. One contact is Primary, up to two show on statements, SSN and income are masked by privilege, and phones carry text-capable flags ([RM12: Contacts Tab](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Contacts-Tab.htm)).
- **Buildium, Rentvine, DoorLoop and AppFolio** use a lease with many tenants plus co-signers and occupants. AppFolio labels each person "financially responsible," "additional occupant" or "co-signer" ([APM Help Ep. 5](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-5-tenant-management)).

Geiger's tenant editor already has 15 sections, the most of any people editor. But its contacts, pets and vehicles are singletons ([tenants/config.jsx](C:/Pro/geiger-property/components/internal/screens/tenants/config.jsx)).

| Target tab | Key fields, settings and actions | Who offers it | Geiger |
|---|---|---|---|
| Contact | First/middle/last name, multiple emails and phones (SMS opt-in, text-capable), addresses plus alternate address, mailing preference, DOB, tax ID, ID document (type, number, country, issuer, expiry) | [Buildium API](https://developer.buildium.com/), [Rentvine API](https://docs.rentvine.com/), [RM 12.300](https://info.rentmanager.com/hubfs/RM12%20Release%20Notes/12.300.pdf) | Single email/phone |
| Household & contacts | Multiple contacts with roles; primary; show on statement | [RM12 Contacts](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Contacts-Tab.htm) | Households table with occupant count |
| Emergency contacts | List: name, relationship, phone ×2, email, address | [Buildium API](https://developer.buildium.com/), [Rentvine API](https://docs.rentvine.com/), [DoorLoop](https://support.doorloop.com/en/articles/6189780-view-and-edit-tenant-information) | One contact |
| Pets, vehicles, dependents | Lists (see Lease); parking pass | [DoorLoop](https://support.doorloop.com/en/articles/6189780-view-and-edit-tenant-information), [Buildium API](https://developer.buildium.com/) | One of each |
| Rental info | Rent period, due day, leasing agent, subsidies, tax type, statement method | [RM12 Tenant General](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/General-Tab.htm) | Partial |
| Transactions, recurring charges, late fees | Tenant-level ledger, charges and late-fee overrides; actions: add charge/credit/payment, move transaction, void or NSF payment, scan check, refund ePay, print receipt | [RM12 Transactions](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Transactions-Tab.htm) | Balance only (from rent accounts) |
| Payment restrictions | Don't charge late fees; don't accept checks, partial payments or payments; don't send AR automation notices | [RM12 Tenant General](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/General-Tab.htm) | Missing |
| Portal | Status (no email sent, invite sent, email failed, signed in, blocked), autopay enabled, portal access on/off, resend invite | [Buildium API](https://developer.buildium.com/), [DoorLoop](https://support.doorloop.com/en/articles/6189780-view-and-edit-tenant-information) | Toggle and last-seen (portal not live) |
| Screening, income, insurance | Screening status, annual income, insurance documents | [RM12](https://rm12help.rentmanager.com/), [AppFolio Ep. 5](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-5-tenant-management) | Has (entered by hand) |
| Violations & notifications log | Violations; log of every system notification sent | [RM12](https://rm12help.rentmanager.com/), [DoorLoop](https://support.doorloop.com/en/articles/6189780-view-and-edit-tenant-information) | Manual communication log |
| Actions | Send portal invite, rent reminder, overdue notice; enter receipt; add additional tenant; transfer tenant; move-out wizard; security-deposit receive/refund/transfer | [DoorLoop](https://support.doorloop.com/en/articles/6189780-view-and-edit-tenant-information), [AppFolio Ep. 5](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-5-tenant-management), [RM12 Security Deposits](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Security-Deposits.htm) | None |

### Owner and vendor

Geiger's owner editor has 7 sections. "Properties & Splits" are typed labels and percentages: they are not real property links and are not checked to sum to 100% ([owners/owners.jsx](C:/Pro/geiger-property/components/internal/screens/owners/owners.jsx)). The vendor editor has 9 sections but no list of the vendor's work orders or bills, and no expiry alerts ([maintenance/vendors.jsx](C:/Pro/geiger-property/components/internal/screens/maintenance/vendors.jsx)).

| Record → target tab | Key fields, settings and actions | Who offers it | Geiger |
|---|---|---|---|
| Owner → General | Person/company, display name, DOB, phones, emails, address, management agreement start/end | [Buildium API](https://developer.buildium.com/), [RM12 Owner General](https://rm12help.rentmanager.com/Topics/12/Management/Owners/General-Tab.htm) | Has |
| Owner → Ownership | Property, contract start/end, %, reserve, bill-approval flag and threshold; Ownership Transfer Wizard | [RM12 Ownership](https://rm12help.rentmanager.com/Topics/12/Management/Owners/Ownership-Tab.htm) | Text labels |
| Owner → Payouts | Payout method (ACH, check, eCheck, EFT…), payee, hold payments, prevent consolidated payments, separate checks per ownership, balance reserves across ownerships, draw/contribution accounts, bank details | [Rentvine API](https://docs.rentvine.com/), [RM12 Owner General](https://rm12help.rentmanager.com/Topics/12/Management/Owners/General-Tab.htm) | Method + schedule |
| Owner → Tax | SSN/EIN, taxpayer names, include in 1099, tax form type | [Buildium API](https://developer.buildium.com/), [Rentvine API](https://docs.rentvine.com/) | Has (last 4, W-9 flag) |
| Owner → Statements & reports | Statement style (Enhanced), owner packet, included reports, GL account map, statement batches and downloads | [AppFolio KB](https://treaty-oak-property-management-llc.helpscoutdocs.com/article/216-entering-new-landlord-property-info-in-appfolio), [Rentvine API](https://docs.rentvine.com/) | Missing |
| Owner → Requests & contributions | Owner requests; contribution requests with reminders; record distributions and contributions | [Buildium API](https://developer.buildium.com/), [DoorLoop](https://support.doorloop.com/en/collections/3376049-manage-your-leases) | Missing |
| Vendor → General | Person/company, category/trade, website, account number, default expense GL, terms, associated properties, private flag, "vendor is a user" | [Buildium API](https://developer.buildium.com/), [RM12 Vendor General](https://rm12help.rentmanager.com/Topics/12/Management/Vendors/General-Tab.htm), [Rentvine API](https://docs.rentvine.com/) | Partial |
| Vendor → Compliance | Insurance provider, policy, expiry; workers' comp expiry; insurance-lapse diagnostic; portal document upload | [Buildium API](https://developer.buildium.com/), [RM12](https://rm12help.rentmanager.com/Topics/12/Management/Vendors/General-Tab.htm), [Rentvine API](https://docs.rentvine.com/), [AppFolio vendor portal](https://www.appfolio.com/help/vendor-portal) | Fields only, no alerts |
| Vendor → Payments & 1099 | Payout type, ACH, hold payments, max line items per payment, discount % and grace days, 1099 category, 1099 YTD | [Rentvine API](https://docs.rentvine.com/), [RM12](https://rm12help.rentmanager.com/) | Callout fee, terms |
| Vendor → Contacts, transactions, POs, work orders | Contacts list, bills/credits/refunds ledger, purchase orders, work-order list | [RM12](https://rm12help.rentmanager.com/), [Buildium API](https://developer.buildium.com/) | Missing |

### Work order: the deepest Geiger editor, missing the money links

Geiger's work order editor has 17 sections across 6 groups and merges work orders, tenant requests and field visits into one screen. That is the closest Geiger comes to vendor depth. But costs are typed by hand instead of summed from labor and materials. There is no link to bills, no owner approval, no tenant chargeback and no SLA timer ([maintenance/config.jsx](C:/Pro/geiger-property/components/internal/screens/maintenance/config.jsx)).

| Target tab | Key fields, settings and actions | Who offers it | Geiger |
|---|---|---|---|
| Details | Title, type (Internal, Resident Request, Unit Turn), category, priority, description, incident location, requester (property / unit / tenant / owner), appliance | [AppFolio Ep. 19](https://www.apmhelp.com/educational-videos/appfolio-tutorials---ep-19-maintenance-part-1), [Buildium](https://softwareconnect.com/reviews/buildium/), [Rentvine API](https://docs.rentvine.com/) | Has |
| Access & entry | Entry allowed (yes/no/unknown), entry contacts, entry instructions, resident-provided instructions, pets present, vendor access type | [Buildium API](https://developer.buildium.com/), [Rentvine API](https://docs.rentvine.com/) | Partial (access notes, permission to enter) |
| Assignment & schedule | Vendor, trade, assigned user, technicians; scheduled and actual start/end, due, appointment window, follow-up date; tech check-in/out time | [Rentvine API](https://docs.rentvine.com/), [RM12 Issues](https://rm12help.rentmanager.com/Topics/12/Services/Service-Manager/Issues.htm) | Has |
| Approval & sharing | Estimate, owner approved, shared with tenant, shared with owner, maintenance-limit check | [Rentvine API](https://docs.rentvine.com/), [AppFolio Ep. 19](https://www.apmhelp.com/educational-videos/appfolio-tutorials---ep-19-maintenance-part-1) | Missing |
| Costs & billing | Line items (GL, quantity, unit price, memo), markup/discount %, charge to (owner/tenant), tenant financially responsible, linked bills, invoice number; materials and labor-rate catalogs | [Buildium API](https://developer.buildium.com/), [Rentvine API](https://docs.rentvine.com/), [AppFolio Ep. 19](https://www.apmhelp.com/educational-videos/appfolio-tutorials---ep-19-maintenance-part-1) | Labor/Materials lists; total typed by hand |
| Checklist, links, history | Checklist; links to inspection, project, template, appliance; status timeline | [RM12 Issues](https://rm12help.rentmanager.com/Topics/12/Services/Service-Manager/Issues.htm), [Rentvine API](https://docs.rentvine.com/), [Buildium](https://softwareconnect.com/reviews/buildium/) | Checklist plus a hand-typed timeline |
| Actions | Create third-party vendor bill, Mark as Complete (date and notes), print PDF (simple/detailed), send vendor notification, notify tenant/owner, memorize as recurring, lock/close, send letters | [AppFolio Ep. 19](https://www.apmhelp.com/educational-videos/appfolio-tutorials---ep-19-maintenance-part-1), [Buildium](https://softwareconnect.com/reviews/buildium/), [RM12 Issues](https://rm12help.rentmanager.com/Topics/12/Services/Service-Manager/Issues.htm) | Convert request → WO only |

### Application, prospect and the remaining records

**Applications.**

- **Buildium** application statuses: Undecided, Approved, Rejected, AddedToLease, Cancelled, Deferred, New, Draft and AddedToDraftLease. Buildium also has applicant groups and an application-fee ledger ([Buildium API](https://developer.buildium.com/)).
- **Rentvine** application summary: an income ratio (combined income ÷ rent, compared with an expected ratio) and per-applicant screening statuses for identity, income, credit, criminal, eviction and landlord ([Rentvine API](https://docs.rentvine.com/)).
- **DoorLoop** application tabs: Overview, Rental Application, Reports, Tasks, Notes and Files. Actions are approve/deny, request screening, assign users and create a lease or draft lease ([DoorLoop: review application](https://support.doorloop.com/en/articles/6284916-review-a-submitted-rental-application)).

Geiger's application editor has 8 sections and a working "Convert to tenant + draft lease," but screening is typed by hand and the convert action does not update the prospect or waitlist ([marketing/applications.jsx](C:/Pro/geiger-property/components/internal/screens/marketing/applications.jsx)).

**Prospects.** Rent Manager's prospect record has:

- **General:** leasing agent, lead source, status, **stage**, interest level, stage history and lost reason.
- **Unit Preference:** property, unit types, floors, amenities, number of people, rent range and move dates.
- **Rent Quotes** with an expiry, and a **Reserved Unit** ([RM12 Prospect General](https://rm12help.rentmanager.com/Topics/12/Management/Prospects/General-Tab.htm); [RM12 Unit Preference](https://rm12help.rentmanager.com/Topics/12/Management/Prospects/Unit-Preference-Tab.htm)).

AppFolio guest cards auto-fill desired beds and baths, max rent, move-in date, income and pets from web inquiries ([APM Help Ep. 4](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-4-guest-cards-and-applications)). Geiger's prospect editor has 5 sections, with no convert action and no stage history.

**Accounting records.** These need the most structural work:

- **Bills** carry approval status (NotNeeded, ApprovalRequired, Approved, Pending, Rejected). Lines carry a property/unit, GL account, markup and memo, and one check can pay many bills ([Buildium API](https://developer.buildium.com/)). Rentvine bill lines can also pass costs to tenants (`leaseCharges`) ([Rentvine API](https://docs.rentvine.com/)). Rent Manager adds master-meter bills, convert-to-recurring and RUBS post/rollback ([RM12 Bills](https://rm12help.rentmanager.com/Topics/12/Accounting/AP/Bills.htm)).
- **Bank accounts** in Buildium cover check-printing layout, deposits, quick deposits, transfers, withdrawals, undeposited funds and reconciliations (clear/unclear, finalize) ([Buildium API](https://developer.buildium.com/)).
- **Rentvine runs ledger-health "diagnostics":** negative bank balances, reconciliation lapses, reserve not met, escrow mismatch and prepayment mismatch ([Rentvine API](https://docs.rentvine.com/)).

Geiger's Transactions editor has three sections. Its accounts are text labels rather than ids, and Bank Accounts holds a balance typed by hand ([accounting/shared.js](C:/Pro/geiger-property/components/internal/screens/accounting/shared.js)).

**Associations (HOA).** Buildium models ownership accounts, board-member terms (President through BoardMember), committees, architectural requests with Pending/Approved/Denied decisions, and owner delinquency status (NoDelinquency, InCollections, InForeclosure, Foreclosed) ([Buildium API](https://developer.buildium.com/)). This should be a conditional tab group on a Property whose type is "Association." It should not be a separate module.

## Module catalog: what the market ships, and how it is packaged

At module level, the SMB vendors all share the same core. Each of Buildium, Rent Manager, Propertyware, DoorLoop, Rentvine and Yardi Breeze covers:

- properties and units
- listing syndication
- applications and screening
- e-sign leases
- tenant and owner portals
- trust accounting with owner statements
- online payments
- maintenance with vendors
- reports with export

([Buildium Pricing](https://www.buildium.com/pricing/); [Yardi Breeze Pricing](https://www.yardibreeze.com/pricing/); [Rentvine Features](https://www.rentvine.com/features)).

The enterprise vendors (AppFolio, Yardi Voyager/RentCafe, Entrata, RealPage, ResMan) add three things on top: CRM, budgeting, affordable and student compliance, websites and agentic AI ([AppFolio Pricing](https://www.appfolio.com/pricing); [Entrata](https://www.entrata.com/); [RealPage products](https://www.realpage.com/property-management-software/)). Yardi's first-party pages returned 403 errors, so Voyager detail is thinner than for the others.

The DIY landlord tools give the software away and earn their revenue from renter-paid fees:

- screening at $30–$55
- ACH at $0–$2.50
- cards at 2.75–3.5%
- rent reporting at $4.99–$5.99 a month

([TurboTenant pricing](https://www.turbotenant.com/pricing/); [Avail pricing](https://www.avail.com/pricing); [RentRedi pricing](https://www.rentredi.com/pricing)).

| Module | Capabilities to replicate (vendor examples) | Packaging signal | Geiger today |
|---|---|---|---|
| Marketing & listings | Syndication to 19–25+ sites ([TurboTenant](https://www.turbotenant.com/pricing/), [Avail](https://www.avail.com/pricing)); marketing website ([Buildium](https://www.buildium.com/pricing/)); AI listing descriptions ([TenantCloud](https://www.tenantcloud.com/ai-assistant)); Zillow-native applications ([AppFolio Q3 2025](https://www.appfolio.com/articles/2025-q3-product-update)) | Free at DIY tools; websites are an add-on or top tier | Listings with 7 syndication switches that only record manual posting |
| Leads & CRM | Prospect pipeline, call hub, voice/chat, tour scheduling ([Buildium](https://www.buildium.com/pricing/)); CRM IQ unified calls/chat/text/email ([Yardi](https://www.yardi.com/news/press-releases/yardi-releases-customer-centric-crm-iq/)); Knock CRM, self-guided tours ([RealPage](https://www.realpage.com/property-management-software/)) | CRM sits in the top tier at AppFolio Max and ResMan Thrive ([ResMan](https://www.myresman.com/platform/pricing/)) | Prospects, Showings, Waitlist as manual records; no calendar or reminders |
| Applications & screening | TransUnion screening, income verification via Plaid, fraud detection ([TurboTenant](https://www.turbotenant.com/pricing/), [RentRedi](https://rentredi.com/features/)); automated reference checks ([Avail](https://www.avail.com/pricing)); ID verification and fraud detection ([ResMan](https://www.myresman.com/)) | Applicant-paid; enhanced screening is tier-gated | Screening typed by hand; no provider |
| Leases & e-sign | State-specific, lawyer-reviewed templates with auto-inserted disclosures ([Avail](https://www.avail.com/pricing), [Hemlane](https://www.hemlane.com/pricing/)); state-based lease documents and addenda ([Breeze Premier](https://www.yardibreeze.com/pricing/)); AI lease audit ([TurboTenant](https://www.turbotenant.com/landlord-toolbox/lease-agreement-audit-ai/)); unlimited e-sign ([Rent Manager](https://www.rentmanager.com/pricing/)) | E-sign priced per document at Buildium: $5 / $1 / unlimited by tier ([Buildium](https://www.buildium.com/pricing/)) | Templates with state requirements, never merged into leases; e-sign records only |
| Rent collection & payments | ACH/card/autopay; retail cash via PayNearMe ([Buildium](https://www.buildium.com/features/retail-cash-payments/)); custom payment-allocation order ([Buildium](https://www.buildium.com/blog/introducing-custom-payment-allocation/)); split rent through Flex/Livble ([Flex + Yardi](https://getflex.com/blog/flex-and-yardi-unveil-seamless-rent-payment-integration-in-rentcafe), [Buildium portals](https://www.buildium.com/features/tenant-portals-rental-owner-logins/)); returned-payment automation ([Buildium](https://www.buildium.com/pricing/)) | Revenue engine: incoming EFT is $2.35 / $1.35 / $0.60 across Buildium tiers | Rent accounts with manual "Post next charge"; late fees and autopay stored but never run |
| Credit / rent reporting | Opt-in reporting to bureaus ([RentRedi](https://www.rentredi.com/pricing), [Avail](https://www.avail.com/pricing)); California AB 2747 requires covered landlords to offer it from April 1, 2025 ([Rentec Direct](https://www.rentecdirect.com/blog/instant-rent-reporting-for-california-landlords-ab-2747-compliance-made-simple)) | Renter-paid add-on | Missing |
| Accounting | Double-entry trust accounting ([Rentvine](https://www.rentvine.com/features)); escrow, 1099 e-file, drill-down statements ([Breeze](https://www.yardibreeze.com/pricing/)); bank reconciliation with rules ([Buildium](https://www.buildium.com/pricing/)); job costing, approval workflows ([Breeze Premier](https://www.yardibreeze.com/pricing/)); AI bill scan ([Buildium](https://www.buildium.com/blog/best-ai-property-management-tools/)) | Budgeting and custom statements in mid tier | 7 screens, no double-entry ledger, text-label accounts |
| Owner management | Owner portal with statements, distributions and dashboards ([Buildium portals](https://www.buildium.com/features/tenant-portals-rental-owner-logins/)); fractional ownership, reserve-aware payouts ([Breeze](https://www.yardibreeze.com/pricing/)); management agreements sent for e-sign ([AppFolio](https://www.appfolio.com/articles/owner-experience)); automated management fees ([Rentvine](https://www.rentvine.com/pricing)) | Owner portal in mid tier at DIY tools ([TenantCloud](https://www.tenantcloud.com/pricing)) | Owner records; no payouts or portal |
| Resident experience | Portal/app with payments, maintenance with photos, documents, insurance, announcements, amenity booking, community calendar, utility setup ([Buildium](https://www.buildium.com/features/tenant-portals-rental-owner-logins/)); package tracking, rewards ([RentCafe](https://apps.apple.com/us/app/rentcafe-resident/id541403633)); tenant self-inspections ([Rent Manager](https://www.rentmanager.com/?p=61642)); guided onboarding ([AppFolio](https://www.appfolio.com/blog/product-update-2025-q4)) | Table stakes everywhere | Portal toggle on tenant; "Portals aren't live yet" |
| Maintenance | Projects and templates, staff calendar, time tracking, unit-turn automation, maintenance billing, contact center ([Buildium](https://www.buildium.com/pricing/)); service-tech mapping, video inspections ([Rent Manager](https://www.rentmanager.com/pricing/)); auto-charge tenants, link vendor invoices ([Breeze](https://www.yardibreeze.com/pricing/)) | Inspections and scheduling are often top tier | Work Orders, Preventive (no scheduler), Unit Turns (not linked), Inventory (usage doesn't change stock) |
| Inspections | Native inspections with statuses and action log ([AppFolio Q4 2025](https://www.appfolio.com/blog/product-update-2025-q4)); HappyCo inspections bundled ([Buildium](https://www.buildium.com/pricing/)); AI inspections ([DoorLoop](https://www.doorloop.com/features)) | Paid or tier-gated | Rooms with free-text condition, photo upload, no signature or rating scale |
| Vendors | Vendor portal with payment preference and compliance documents ([AppFolio](https://www.appfolio.com/help/vendor-portal)); credentialing with expiry notifications ([RealPage](https://www.realpage.com/vendor-services-credentialing/)) | Often a third-party add-on | Vendor records |
| Communications | Two-way email/SMS threads ([Buildium](https://www.buildium.com/pricing/)); text and phone broadcast, VoIP with call logging ([Rent Manager](https://www.rentmanager.com/pricing/)); universal inbox mixing AI and human replies ([Entrata](https://www.entrata.com/press/entrata-unveils-ai-powered-platforms-at-summit-2025-bringing-autonomous-property-management-tm-closer-to-reality)) | Message credit pools by tier ([DoorLoop](https://www.doorloop.com/pricing)) | Inbox is a manual log; announcements "Mark as sent" |
| Reports | 450+ reports, Report Writer, scheduled batches ([Rent Manager](https://www.rentmanager.com/reporting)); about 25 named reports including CAM reconciliation, insurance compliance, audit log ([DoorLoop](https://support.doorloop.com/en/collections/3918512-reporting)); dynamic column/sort/export reports ([Buildium](https://buildium.com/blog/introducing-dynamic-reports)) | Custom reports in mid tier | 7 reports, CSV only, fixed periods |
| Automation | Triggers, actions, rules, monitoring, templates ([DoorLoop Workflows](https://doorloop.com/features/workflows)); Realm-X Flows for move-in, move-out, reputation and collections ([AppFolio](https://www.appfolio.com/blog/product-update-2025-q4)); Workflow Studio ([Entrata](https://www.entrata.com/press/entrata-announces-new-lineup-of-eli-product-suites-at-summit-2024)) | Flows sit in AppFolio Plus | 7 triggers / 5 actions defined; nothing executes |
| Insurance & risk | Renters-insurance compliance tracking; liability-to-landlord auto-enrollment ([AppFolio](https://info.appfolio.com/additionalservices-insurance.html)); deposit alternatives, master policy ([Entrata](https://www.entrata.com/)) | Revenue add-on | Insurance-expiring trigger only |
| Utilities | Utility billing, RUBS, submetering ([RealPage](https://www.realpage.com/property-management-software/), [Breeze Premier](https://www.yardibreeze.com/pricing/), [ResMan](https://www.myresman.com/platform/pricing/)) | Add-on | Move-in utility status only |
| Verticals | Affordable (HUD, LIHTC, USDA; [ResMan](https://www.myresman.com/platform/affordable/)); HOA, self-storage, manufactured housing ([Breeze Premier](https://www.yardibreeze.com/pricing/)); student, military ([Entrata](https://www.entrata.com/)) | Premium pricing (Breeze Affordable is $3/unit) | Residential only |
| Integrations & API | Stack marketplace ([AppFolio](https://www.appfolio.com/stack)); open REST API plus native MCP with about 90 tools ([Rentvine](https://www.rentvine.com/blog/rentvine-unveils-industry-first-mcp)); write API in the top tier ([AppFolio](https://www.appfolio.com/pricing)) | API is tier-gated | 6 integration cards with disabled Connect buttons; webhooks never sent |

**AI has become a standard set of agent jobs.** By 2026 every enterprise vendor ships named agents:

- **AppFolio Realm-X Performers:** Leasing, Maintenance, Resident Messenger and Receptionist. AppFolio also offers a Claude connector on all plans ([AppFolio newsroom](https://www.appfolio.com/newsroom/appfolio-introduces-the-new-realm-x)).
- **RealPage Lumina:** Leasing, Resident, Operations, Facilities, Finance, Spend and Analytics agents, plus MCP access ([RealPage Lumina AI Suite](https://www.realpage.com/news/realpage-introduces-lumina-ai-suite/)).
- **Entrata ELI and Entrata Pro:** ELI Console for plain-language questions over company data, and Agent Studio for configuring agents from a company's SOPs ([GlobeNewswire](https://www.globenewswire.com/news-release/2026/09/15/3362553/0/en/entrata-introduces-entrata-pro-at-summit-2026-giving-new-ai-capability-across-the-entrata-os.html)).
- **Yardi:** Virtuoso and Chat IQ.
- **ResMan:** Sam, an app-less SMS resident assistant ([ResMan](https://www.myresman.com/)).

In SMB the agents are packaged as upsells:

- **Buildium:** the Lumina AI Workforce is included in Premium. On other plans it is a paid add-on governed by rules for when the AI "acts, assists, or steps back" ([Buildium Lumina AI Workforce](https://www.buildium.com/features/lumina-ai-workforce/)).
- **DoorLoop:** Receptionist, Maintenance Ops and Lease Renewal agents are add-ons ([DoorLoop Pricing](https://www.doorloop.com/pricing)).
- **Rentvine:** bundles Fixie at no extra charge. Fixie asks residents follow-up questions, suggests safe troubleshooting, and either marks the issue "Resolved by Agent" or files a work order with a diagnostic summary ([Fixie help](https://help.rentvine.com/introduction-to-fixie-ai)).
- **Short-term-rental platforms** went further on inbox automation:
  - Guesty's ReplyAI Autopilot uses confidence thresholds and escalation, and its AI Task Creation turns messages into tasks ([Mann Report](https://www.mannpublications.com/mannreport/2026/04/22/guesty-launches-replyai-autopilot-and-ai-task-creation/)).
  - Hospitable shipped an official MCP server in April 2026 ([Hospitable changelog](https://community.hospitable.com/hospitable-changelog-3/hospitable-is-the-first-official-mcp-server-from-a-short-term-1426)).

**Adoption and outcome data are weak.** The evidence that AI is now expected comes from vendor-sponsored surveys. EliseAI reports that 89% of operators include AI in their operating model ([EliseAI 2026](https://eliseai.com/resources/the-2026-state-of-ai-in-us-multifamily)). Every published outcome metric is vendor-reported, including AppFolio's "1 in 4 work orders resolved with the resident directly" and showings up to 35% higher ([AppFolio AI agents](https://www-dyn.appfolio.com/newsroom/appfolio-ai-agents)). No independent benchmark was found.

**From the STR platforms, the features that carry over to long-term and mid-term rentals are:**

- move-out-triggered turnover task chains
- smart-lock access codes per lease or showing
- ID verification
- deposit-free damage protection
- a unified inbox that turns messages into work orders
- syndication to mid-term channels such as Furnished Finder, which Hostfully integrated in September 2026 ([Guesty pricing](https://www.guesty.com/pricing/); [Hospitable pricing](https://hospitable.com/pricing); [Hostfully](https://www.hostfully.com/integrations/furnished-finder/))

Nightly dynamic pricing and OTA channel management matter little for long-term rentals.

## Geiger Property matches the market's breadth but runs none of its engines

**Breadth is close to the market.** Geiger's sidebar covers almost every industry module: listings, prospects, showings, applications, waitlist, rent comparables, leases, renewals, moves, inspections, deposits, notices, tenants, owners, vendors, work orders, preventive maintenance, unit turns, inventory, rent collection, transactions, recurring charges, bills, chart of accounts, budgets, bank accounts, inbox, announcements, templates, e-signature and seven reports. Only "AI Assistant" falls back to a "coming soon" card ([sidebar_nav.jsx](C:/Pro/geiger-property/components/internal/sidebar/sidebar_nav.jsx); [registry.jsx](C:/Pro/geiger-property/components/internal/screens/registry.jsx)).

**Every one of those screens is a manual record-keeper.** None of the following runs:

- e-signature, syndication or screening
- automations or announcements
- payments or portals

Specific examples:

- The Integrations page shows six cards with disabled Connect buttons.
- The Automations screen carries a banner saying the runner isn't connected. There is no `app/api` route, cron job or database trigger ([automations/automations.jsx](C:/Pro/geiger-property/components/internal/screens/automations/automations.jsx)).
- Roles & Permissions gates nothing, because the sidebar passes no roles and `roleHasPermission` returns true when none exist ([lib/rbac.js](C:/Pro/geiger-property/lib/rbac.js)).

**The weakest links are structural.** The engine has defects that will compound as editors grow:

- Duplicate reports success without checking the save, and it copies the whole `metadata` bag.
- Keys with no matching column are silently dropped (tenantName and leaseName on Moves, Inspections and Deposits; propertyId on Unit Turns).
- Account links in Transactions, Bills and Recurring Charges are text labels, not ids.
- Some status maps hardcode hex colours.
- "Save changes" shows success before the write finishes.
- Two save models run side by side.

([factories.jsx](C:/Pro/geiger-property/components/internal/screens/entity/sections/factories.jsx); [entity_factory.js](C:/Pro/geiger-property/lib/supabase/entity_factory.js)).

**Cross-module links are missing**, so automation and reporting cannot be accurate. These pairs have no real relationship:

- Moves ↔ Inspections and Deposits
- Owners ↔ Properties
- Vendors ↔ Work Orders
- Turns ↔ Moves
- Templates ↔ Leases
- Payments ↔ Transactions

| Capability | Industry baseline | Geiger state | Gap |
|---|---|---|---|
| Editor depth (core records) | ~20 property tabs at Rent Manager; Events editor ~67 tabs | 7–17 sections, flat field grids | High |
| Settings cascade with overrides | All six SMB vendors | Company page never read | High |
| Ledger (double-entry, GL ids, lease/owner/vendor ledgers) | All | None; text-label accounts | Critical |
| Rent schedule, escalations, proration, recurring posting | Buildium, Rentvine, Rent Manager | Manual "Post next charge"; no scheduler | Critical |
| Late fees and NSF automation | All | Stored, never applied | High |
| Online payments and autopay | Table stakes | None (Stripe card disabled) | Critical |
| Resident, owner and vendor portals | Table stakes | Toggles only | Critical |
| E-sign, screening, syndication providers | Table stakes | Records only | High |
| Email/SMS delivery and unified inbox | Table stakes | Manual log | High |
| Lists for contacts, pets, vehicles, occupants, co-signers | Rentvine, Buildium, Rent Manager | Singletons and free text | Medium–High |
| Lifecycle wizards (move-in/out, renew, transfer, end lease) | All | Two converters, one renew button | High |
| Automatic audit history | Rent Manager, DoorLoop | User notes only | Medium |
| Custom fields (types, entities, required) | Buildium (17 entities), Rentvine | 3 types, 4 entities | Medium |
| Reports (PDF, custom range, scheduled, report writer) | Rent Manager, Buildium, DoorLoop | CSV, fixed periods | Medium |
| Workflow runner | DoorLoop, AppFolio, Entrata | Definitions only | High |
| AI agents and MCP | Enterprise standard; SMB premium tier | None ("AI Assistant" unregistered) | Differentiator |
| RBAC enforcement | All | Advisory and inert | Medium |

Geiger is **ahead or level** in a few places worth keeping:

- separate Unit Types and Floor Plans (only Rent Manager has a unit-type record)
- a clause builder with live preview on leases
- a 17-section work order that merges requests and field visits
- Rent Comparables, a Preventive & Recurring screen with "Create work order now," and a real-data Property Overview with occupancy and collection gauges

([property_overview.jsx](C:/Pro/geiger-property/components/internal/screens/overview/property_overview.jsx); [unit_types/config.jsx](C:/Pro/geiger-property/components/internal/screens/unit_types/config.jsx)).

## Build order: fix the engine, deepen records, wire money, then ship agents

The order follows dependencies, not glamour. AI agents and workflows act on records, ledgers and messaging channels. An agent that cannot post a charge, send a text or read a real owner–property link has nothing to do. The Events editor shows that the shell can carry about 67 tabs. The patterns worth porting are:

- nav search
- `showIf` conditional tabs
- one metadata key per tab, saved through a `<schema>.<entity>_merge_meta` shallow-merge RPC
- repeater-plus-dialog primitives
- live previews
- "Configure →" switchboards that gate tabs

Its known defects should not be copied: stale sibling tabs, tabs sharing a key that overwrite each other, and a Save that always reports success ([geiger-events event_sections.js](C:/Pro/geiger-events/components/internal/screens/events/event_sections.js)).

### P0: foundations (before adding any tab)

| # | Build item | Why | Reference |
|---|---|---|---|
| 0.1 | Fix engine defects: checked Duplicate, no silently dropped keys, one save model with honest feedback, semantic colour tokens | Every new tab inherits these bugs | [factories.jsx](C:/Pro/geiger-property/components/internal/screens/entity/sections/factories.jsx) |
| 0.2 | Port `useEntityConfig` + `property.<entity>_merge_meta` RPC (one key per tab), nav search and `showIf` | Lets 20+ tabs save without clobbering each other; gates HOA, commercial and affordable tabs by property type | Events shell |
| 0.3 | Repeater + dialog primitive (list rows with edit/delete/reorder) and child tables for contacts, pets, vehicles, emergency contacts, occupants, co-signers, ownerships | Fixes the singleton modelling | [Rentvine API](https://docs.rentvine.com/) |
| 0.4 | Header **Actions** menu and a **wizard** primitive (stepper dialog) | Needed for move-in/out, renew, transfer, end lease, owner add | [DoorLoop](https://support.doorloop.com/en/articles/6067246-end-a-lease), [RM12](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Move-Out-Wizard.htm) |
| 0.5 | **Policy cascade** object (company → portfolio/property → lease/tenant) with an "inherited / overridden" badge; make Fees & Policies the root | The basis for late fees, payment rules, management fees and statements | [DoorLoop](https://support.doorloop.com/en/articles/8358223-set-up-property-specific-automatic-late-fees) |
| 0.6 | System activity log: write an `activity` row on every status change, money post and wizard step | Gives a History tab and audit log | [DoorLoop audit log report](https://support.doorloop.com/en/collections/3918512-reporting) |
| 0.7 | Real relationships: `ownerships` (owner × property × % × dates × reserve), vendor ↔ work order ↔ bill, move ↔ inspection ↔ deposit, payment ↔ transaction, GL account ids | Reports and automations need real joins | — |
| 0.8 | Custom fields: add long text, dropdown, toggle, decimal and hyperlink types; required/active flags; groups; extend to owners, vendors, work orders, applications, prospects and listings | Matches Buildium/Rentvine coverage | [Buildium API](https://developer.buildium.com/) |

### P1a: table-stakes record depth (the editor tabs above)

**Lease** (highest value): Rent & recurring charges with escalations and proration, Ledger, Payment settings & overrides, People lists, Insurance, Move-out, Renewal offer status, and the Actions menu.

**Property:** Owners & ownership, Banking & accounting, Management fees, Late fees & payment policy, Leasing defaults, Maintenance settings, Insurance & compliance, Assets/keys/meters, and an Association tab gated by type.

**Unit:** Market-rent history, Occupancy history, Access & instructions, non-revenue flag, and related-record lists.

**Tenant:** Multi-contact household, Payment restrictions, Portal status, Notifications log and Violations.

**Owner:** Real ownerships, Payouts, Statements, Contributions and distributions.

**Vendor:** Compliance with expiry alerts, Payments & 1099, and work order and bill lists.

**Work order:** Approval & sharing; Costs summed from line items with markup and tenant chargeback; "Create vendor bill"; and an automatic status timeline.

**Application:** Screening statuses, income ratio and a fee ledger. Conversion should also close the prospect and the waitlist entry.

**Prospect:** Stages with history, rent quotes and a reserved unit.

The target is **15–30 sections and 100–250 controls** per core record.

### P1b: table-stakes engines (make records do things)

| # | Engine | Notes |
|---|---|---|
| 1 | Double-entry ledger with GL ids; lease, owner and vendor sub-ledgers; trust/escrow separation | Everything financial depends on it ([Rentvine](https://www.rentvine.com/features)) |
| 2 | Scheduler (cron / Supabase jobs) for recurring charges, late fees, management fees, PM work orders, reminders | Unblocks Recurring Charges, Preventive, Automations |
| 3 | Payments: ACH/card/autopay through the stubbed Stripe card; returned-payment handling; allocation order | The industry's revenue engine ([Buildium Pricing](https://www.buildium.com/pricing/)) |
| 4 | Email/SMS delivery and a two-way inbox; send templates merged with real data | Turns Announcements, Notices and Templates live |
| 5 | Template merge → lease document → e-sign provider | Closes the Templates ↔ Leases gap |
| 6 | Resident portal (pay, autopay, requests with photos, documents, insurance, announcements) and owner portal (statements, distributions, documents, approvals) | Table stakes ([Buildium portals](https://www.buildium.com/features/tenant-portals-rental-owner-logins/)) |
| 7 | Screening and listing-syndication integrations | Applicant-paid screening is itself a revenue line |
| 8 | Reports: PDF, custom date range, scheduled email batches, owner packets; add Trial Balance, GL, A/P aging, deposit detail, check register, management fees, insurance compliance, 1099 | [DoorLoop reports](https://support.doorloop.com/en/collections/3918512-reporting), [Rent Manager](https://www.rentmanager.com/report-automation/) |
| 9 | Bank reconciliation (clear/unclear, finalize) and ledger-health diagnostics | [Buildium API](https://developer.buildium.com/), [Rentvine API](https://docs.rentvine.com/) |
| 10 | Enforce RBAC (pass roles to the sidebar and to controls) | Currently inert |

### P2: near-table-stakes and quick wins

These are common, often partner-delivered, and individually small:

- **Workflow runner** for the existing Automations definitions: trigger, action, delay/condition, monitoring and error log, with templates for move-in, move-out, collections and renewal ([DoorLoop](https://doorloop.com/features/workflows); [AppFolio Flows](https://www.appfolio.com/blog/product-update-2025-q4)).
- **Approval workflows** for bills and work orders, with limits.
- **Vendor portal** with COI upload and expiry alerts.
- **Renters-insurance compliance tracking.**
- **Opt-in rent reporting**, needed for California AB 2747.
- **Amenity booking and community calendar.**
- **Structured inspections:** a room and item rating scale, signatures, and links to moves, deposits and turns.
- **Deposit interest and deposit return deadlines.**
- **Monthly budgets** with variance.
- **Utility billing / RUBS, CAM reconciliation and job costing** for commercial and larger operators.

### P3: differentiators, led by AI agents

Ship the AI Assistant slot as a set of governed agents. Use Buildium's "acts / assists / steps back" control model and a central AI settings page, with every agent action logged to the P0 activity trail. Suggested sequence, each item backed by a market precedent:

1. **Maintenance intake agent:** resident chat or photo → troubleshooting → work order with a diagnostic summary, or "resolved by agent" ([Rentvine Fixie](https://help.rentvine.com/introduction-to-fixie-ai)).
2. **Generative writing and translation** for listings, notices and announcements ([Buildium](https://www.buildium.com/blog/best-ai-property-management-tools/)).
3. **Document AI:** lease extraction at onboarding ([RentRedi](https://rentredi.com/blog/ai-onboarding-for-landlords)), bill and receipt scanning into draft bills ([Buildium](https://www.buildium.com/blog/best-ai-property-management-tools/)), and a state-compliance lease audit ([TurboTenant](https://www.turbotenant.com/landlord-toolbox/lease-agreement-audit-ai/)).
4. **Leasing agent:** 24/7 multichannel lead response and tour booking ([Entrata Leasing AI](https://www.entrata.com/products/leasing-ai)).
5. **Resident messenger:** balances, lease Q&A, payment and renewal nudges ([AppFolio](https://www.appfolio.com/blog/product-update-2025-q4)).
6. **Natural-language analytics** over the ledger and portfolio, saving answers to dashboards ([ResMan Reporting Assistant](https://www.myresman.com/solutions/crm-ai/)).
7. **An MCP server / Claude connector** exposing governed tools ([Rentvine MCP](https://www.rentvine.com/blog/rentvine-unveils-industry-first-mcp); [AppFolio Claude connector](https://www.appfolio.com/newsroom/appfolio-introduces-the-new-realm-x)).
8. **An AI-versus-human performance view** ([Entrata OXP](https://www.entrata.com/press/entrata-unveils-ai-powered-platforms-at-summit-2025-bringing-autonomous-property-management-tm-closer-to-reality)).

Non-AI differentiators:

- STR-derived smart-lock codes per lease or showing
- furnished and mid-term availability with mid-term channel syndication
- deposit alternatives
- a resident benefits package billed with rent ([AppFolio Q3 2025](https://www.appfolio.com/articles/2025-q3-product-update))

**Defer:**

- **Revenue management.** RealPage's November 2025 DOJ settlement restricts the use of competitors' nonpublic data ([RealPage](https://www.realpage.com/news/realpage-reaches-settlement-with-us-department-of-justice/)).
- **GPO procurement, IoT smart-building and sustainability reporting.**
- **Affordable, student and military compliance**, unless Geiger chooses to target those markets.

**Packaging.** If Geiger mirrors market packaging, put accounting, leasing, maintenance and portals in the base tier. Put custom fields, budgeting, approvals, workflows and read API in the middle tier. Put CRM, autonomous agents, write API and websites in the top tier. Earn transaction revenue on ACH, screening and e-sign, as AppFolio, Buildium and ResMan do ([AppFolio Pricing](https://www.appfolio.com/pricing); [ResMan Pricing](https://www.myresman.com/platform/pricing/)).

## Conclusion

Geiger Property's problem is not missing screens. It is that each screen stores intent without executing it. The vendors' advantage sits in three invisible layers: a settings cascade, a ledger, and delivery channels (payments, messaging, e-sign, portals). Their dozens of tabs per record mostly expose those layers. Building tabs before those layers would produce a deeper version of today's record-keeper. Building the layers first makes most of the target tabs (payment overrides, management fees, ledgers, approvals) small configuration surfaces over working engines.

The AI race also favours this order. The agents vendors now sell are workflow owners acting on the same records and ledgers: Fixie files work orders, Lumina reconciles bank accounts, and Realm-X Flows post deposit charges. Because Geiger is a suite product with an empty "AI Assistant" slot, it can design those governed actions and the activity trail into P0. AI then becomes a native layer rather than a bolt-on, and the MCP server and agents become the leap past SMB incumbents. All agent outcome claims in this market are still vendor-reported, so Geiger should instrument its own AI-versus-human metrics from day one.
