# Per-record detail/edit screens in leading property management software (fields, tabs, settings, actions)

Research date: 2026-10-16. Method note: **field-level data for Buildium and Rentvine was taken directly from their public OpenAPI specs** (the Redoc pages at developer.buildium.com and docs.rentvine.com embed the full spec; schema/endpoint names are quoted verbatim). API fields reliably mirror what the record's edit form stores, but they do not prove the exact UI tab layout. **Rent Manager tab names come from its public RM12 help site** (rm12help.rentmanager.com), which has one help page per record tab. These were fetched in full and are the most reliable UI-level source. **AppFolio, DoorLoop and Propertyware UI details** come from help-center articles, training-video summaries (APM Help) and customer knowledge bases. Propertyware's Salesforce-hosted support articles would not render, so its items rest on search-result excerpts and are weaker.

---

## Q1. What tabs/sections and fields does each record have (AppFolio, Buildium, Rent Manager, DoorLoop, Rentvine, Propertyware)?

### Takeaway
Every platform gives the core records (Property, Unit, Lease/Tenant, Owner, Vendor, Work order) a tabbed or sectioned detail page. The shared sections are a General/Summary block (identity, address, type, manager), financial settings (bank account, reserve, management fee, late fee, ePay), sub-entity lists (units, tenants, owners, recurring charges), a ledger/transactions tab, and Files, Notes, History/Activity and User-defined/Custom fields tabs. Rent Manager is the most granular, with a separate help page per tab. Buildium and Rentvine expose the deepest field-level detail through their APIs.

### Cited Findings

#### PROPERTY (rental property / building)

**Buildium (rental property)**
- Property page tabs reported as "Summary," "Financials," "Units," "Tasks," "Event History," "Notes," "Files," "Vendors". The Financials tab holds income statements (cash or accrual basis), lease payment settings, management fee settings and locked periods. Each section is edited with its own edit button. — [SoftwareConnect Buildium review 2025](https://softwareconnect.com/reviews/buildium/) (third-party review, not Buildium docs)
- Add-property fields: property type, address, property owner, primary bank account, property reserve, primary manager, units and unit details. — [SoftwareConnect](https://softwareconnect.com/reviews/buildium/)
- API `RentalPropertyPostMessage` fields: Name*, StructureDescription, Address*, RentalSubType* (CondoTownhome | MultiFamily | SingleFamily | Industrial | Office | Retail | ShoppingCenter | Storage | ParkingSpace), RentalOwnerIds, OperatingBankAccountId*, PropertyManagerId, Reserve, YearBuilt, Units[]. A read adds NumberUnits, IsActive, RentalType (Residential/Commercial) and RentalManager. — [Buildium Open API](https://developer.buildium.com/)
- Property sub-resources (each maps to a tab or card on the page): amenities (`/rentals/{id}/amenities`), ePay settings (`/epaysettings`), images (upload, reorder, video-link images), meter readings, notes, preferred vendors (`/vendors`), inactivate/reactivate requests. Appliances are a separate resource with service history. — [Buildium Open API](https://developer.buildium.com/)
- Property amenity enum (RentalFeatures) includes LaundryRoom, WheelchairAccess, DoorAttendant, Elevator, Parking, StorageUnits, Pool, FitnessCenter, ClubHouse, Concierge, Gate, PackageReceiving, OnSiteMaintenance, SmokeFree, WirelessInternet… plus an "IncludedInRent" utilities list (Gas, Electric, Trash, Water, HotWater, Telephone, Heat, Cable, AirCon, Satellite, Sewer, BroadbandInternet). — [Buildium Open API](https://developer.buildium.com/)
- Commercial portfolios: the property's Units area holds common-expense allocations and the unit list, and bulk charges such as CAM can be entered from it. — [Buildium help: Navigating Commercial Portfolios](https://help.buildium.com/hc/s/article/Navigating-Commercial-Portfolios-in-Buildium)

**AppFolio (property)**
- Property setup sections and fields (customer knowledge base):
  - "Property Name," "Address/Address 2," "Property Type" (Single Family, Multi-Family), "Description," "Site Manager," "Year Built," "Management Start Date / End Date / End Reason," "Amenities," "Non-Revenue Status"
  - **Rental Information**: Bedrooms, Bathrooms, Square Feet, Market Rent, Use Market Rent on Ads?, Application Fee, Security Deposit, Use Custom Inspection Date, Last Inspection On, Rent Status, Legal Rent, Utilities Included In Lease, Appliances Included In Lease, Additional Lease Information
  - Amenities: Cats Allowed, Dogs Allowed
  - **Marketing Information**: Posted to your Website, Posted to the Internet, Premium Listing, Removed from Vacancies List, Available On, Marketing Title, Marketing Description, Syndicate units separately, Listing Type, YouTube Video URL
  - "Lease Settings"
  - **Owners and Financials**: Owner, Percent Owned, Contract Expires, Payment Type, Reserve Funds, Vendor 1099 Payer, Fiscal Year End
  - **Management Fees**: Commission Type, Management Fee Percent, Minimum Management Fee, Lease Fee Type, Lease Fee Percent, Renewal Fee
  - **Additional Fees** (account codes such as Late Fee, NSF Fees Collected, Application Fee Income, Early Lease Termination Fee)
  - **Late Fee Policy**: Effective Date, Base Amount, Eligible Charges, Daily amount/Monthly max, Grace period, Grace balance
  - "Budgets," "Keys"
  - **Maintenance Information**: Maintenance Limit, Insurance Expiration, Has Home Warranty Coverage, Maintenance Notes, Online Maintenance Request Instructions
  - "Fixed Asset," "Property Groups," "Statement Settings," "Bank Accounts" (Cash in Bank, Escrow Cash), "Photos," "Attachments"

  — [Treaty Oak PM knowledge base: entering a new property in AppFolio](https://treaty-oak-property-management-llc.helpscoutdocs.com/article/216-entering-new-landlord-property-info-in-appfolio)
- The video walkthrough of the same flow adds: affordable housing / Section 8 settings, owner's agent, NSF fee (under Rental Information), and **Leasing Settings**. Leasing Settings covers the default lease template, standard addendums and attachments, default renewal templates, renewal addendums, and the renewal increase (flat $ or %). Management Fees: fee start month, waive fees when vacant, % of rent or flat fee, min/max. Additional Fees: lease fee and renewal fee (% of first month or flat), fee types to include, "Suppress Owner Visibility." Also budget variance threshold, Photos (drag and drop images and videos), internal notes assignable to staff, and Attachments. Single-family properties keep all unit info on the property page. — [APM Help AppFolio Tutorials Ep. 3](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-3-how-to-set-up-a-new-property)

**Rent Manager (property)** — the help TOC lists these property tabs: General, Owners, Fees (management fees), Fees Setup, Late Fees, Recurring Charges, ePay, Screening, SD Interest (security deposit interest), Images, History/Notes, User Defined Fields, Accounting Close, Association, Owner Check Setup, Property Files, Default Charge Setup, Application Settings, Association Settings, Reservable Amenities, Holidays. — [RM12 Help](https://rm12help.rentmanager.com/)
- General tab sections and fields:
  - Property Name: Active, Full Name, Short Name, Manager, Email Address, Property Type, Logo. Property Type options include Commercial, Association, Short Term Rental, RV/Campground, and the type changes which features are available.
  - Address (multiple address types), Phone Numbers, Fiscal Year, Assets, Time Zone Offset
  - Other Information: Property Tax ID, Posting Day, Total Sq Ft, Comments, Default Bank, Rent Charge Type, Billing Name 1 & 2, Bank Settings, Charge Type Banks, User Privileges, Assign Service Issues, Default Inspector, AR Automation Schedule, Property Amenities, Reservable Amenities, Text Numbers, Statement Method, Lease Term Differential, Enable Lockbox, NSF Fee, Track Insurance
  - STR Rate Schedules, Apply Now Links, Property Application Settings, Property Files, Property Default Charge Setup

  Unchecking Active with a Move Out Date moves out all tenants. — [RM12: General Tab (Property)](https://rm12help.rentmanager.com/Topics/12/Management/Properties/General-Tab.htm)
- Owners tab: Primary Owner, Approve bills for all owners, Threshold Amount, Owner, Start, End, %, Reserve. Actions: Enter an Ownership, Set Up Owner Bill Approval, Renew an Ownership Contract. — [RM12: Owners Tab (Property)](https://rm12help.rentmanager.com/Topics/12/Management/Properties/Owners-Tab.htm)
- Association tab (HOA properties): Board Members (Contact Name, Role, Term Start, Term End, Status, Comments), Committee Members, Published TWA Reports and report schedules. — [RM12: Association Tab](https://rm12help.rentmanager.com/Topics/12/Management/Properties/Association-Tab.htm)

**DoorLoop (property)**
- Property Settings (Rentals > Properties > [Property] > Settings tab) has four tabs:
  - "General information": name, address, time zone, Affordable Housing flag, listing description, exterior photos, Property Type (Residential/Commercial, then Single-Family, Multi-Family, Condo, Townhome, Other), Pet Policy, Amenities
  - "Owners"
  - "Reserve Funds"
  - "Custom Allocations" (CAM charges and credits)

  — [DoorLoop: Set Up Property-Specific Settings](https://support.doorloop.com/en/articles/6232512-set-up-property-specific-settings)
- Property-level overrides also exist for Fees Settings > Late Fees, Rent & Payment Notifications, Payment Instructions and Tenant Portal (Properties > [Property] > Settings > Tenant Portal). — [DoorLoop: property-specific automatic late fees](https://support.doorloop.com/en/articles/8358223-set-up-property-specific-automatic-late-fees); [DoorLoop: Customize Tenant Portal Settings](https://support.doorloop.com/en/articles/6081899-customize-tenant-portal-settings)

**Rentvine (property)**
- API property fields:
  - portfolioID, name, address parts, county, legalDescription, propertyTypeID, isMultiUnit, assignedToUserID, yearBuilt, latitude/longitude
  - managementFeeSettingID, reserveAmount, maintenanceLimitAmount ("Spend limit before maintenance needs approval"), markupPercent / markupAmount / markupAmountMin / markupAmountMax (maintenance markup)
  - dateContractBegins / dateContractEnds, dateInsuranceExpires, dateWarrantyExpires, insuranceCompany / insuranceAgent / insurancePolicyNumber / insuranceContactDetails, requiredRentersInsuranceLiabilityAmount
  - leaseReturnChargeAmount ("Default NSF/returned-payment charge for the property's leases"), applicationTemplateID, commercialClassTypeID, salesTaxSettingID, withholdingTaxAgencyID, propertyShowingProviderID, maintenanceNotes
  - Linked objects: portfolio, postingSetting, operatingAccount, portfolioOwners

  Actions: activate/deactivate, delete, export. — [Rentvine API docs](https://docs.rentvine.com/)
- Properties belong to a **Portfolio**, which carries the owner and distribution settings: postingSettingID, statementSettingID, sendStatements, payoutAmount, minimum/maximumDistributionAmount, overdraftOverrideAmount, additionalReserveAmount + description, holdDistributions, isLiveLedgerEnabled, isBalanceNoticeDisabled, owners[], portfolioGroupIDs, attachments. — [Rentvine API docs](https://docs.rentvine.com/)

**Propertyware (building / portfolio)**
- The Building/Unit Summary page holds Building Type / Unit Type and Target Rent (both feed the Gross Potential Rent report). — [Propertyware support: GPR report columns](https://support.propertyware.com/s/article/What-are-the-columns-option-for-the-Gross-Potential-Rent-Report) (search excerpt only)
- Portfolio Summary page: open it from the Properties tab, click Edit, and fill company-defined portfolio custom fields. — [Propertyware: Editing Portfolios](https://support.propertyware.com/s/article/Editing-Portfolios) (search excerpt)
- The Management Summary page has an Owners tab and a Management Fee Calculations tab. — [Propertyware: Management Summary Page](https://support.propertyware.com/s/article/Management-Summary-Page) (search excerpt; the page itself failed to render)
- The mobile app exposes custom fields, conversations, notes, documents and activities for buildings, units and leases. — [Propertyware Mobile (App Store)](https://apps.apple.com/us/app/propertyware-mobile/id541673777)

#### UNIT

- **Buildium API** `RentalUnit`: PropertyId, BuildingName, UnitNumber, Description, MarketRent, Address, UnitBedrooms (Studio…NineBedPlus), UnitBathrooms (1–5+ incl. halves), UnitSize, IsUnitListed, IsUnitOccupied. Sub-resources: amenities, images (upload, reorder, video link), notes, listing (create/update/delete). The listing has ListingDate, Rent, Deposit, LeaseTerms, AvailableDate, IsManagedExternally, RentalApplicationUrl, Contact. Unit feature enum includes AirConditioning, Dishwasher, Washer/Dryer, WD_Hookup, Fireplace, HardwoodFloors, Balcony, GarageParking, FencedYard, PetsAllowed, DogFriendly, CatFriendly, Furnished, WalkinClosets… — [Buildium Open API](https://developer.buildium.com/)
- **Rent Manager** unit tabs: General, Amenities, Images, Market Rent, Occupancy, Recurring Charges, History/Notes, User Defined Fields, plus unit status management and Rainmaker LRO. — [RM12 Help](https://rm12help.rentmanager.com/)
  - General tab fields: Unit Name, Address, Unit Status, Assets (Name, Type, From, To, Last Maint., Next Maint.), Comment, Bathrooms, Bedrooms, Floor, Inspection Template, Marketing Description, Max Occupancy, Site Classification, Square Footage, Unit Type, Default Unit Security Deposit. RV/Campground info: Length, Width, Amps, Prohibited Eqpt., Slide Outs, Pull-Through. Apply Now Links. — [RM12: General Tab (Unit)](https://rm12help.rentmanager.com/Topics/12/Management/Units/General-Tab.htm)
  - Market Rent tab: dated market-rent entries (add, edit, delete, batch modify). — [RM12: Market Rent Tab](https://rm12help.rentmanager.com/Topics/12/Management/Units/Market-Rent-Tab.htm)
- **Rentvine** unit: name, address, rent (market, required), deposit, size, beds, fullBaths, halfBaths, commercialSpaceTypeID, isNonRevenue / nonRevenueTypeID / nonRevenueStartDate, isUtilityBillingEnabled, leaseNotes, entryInstructions (resident-facing), vendorEntryInstructions, maintenanceNotes, attachments, propertyManagerID, current leaseID. Actions: activate, deactivate, delete. — [Rentvine API docs](https://docs.rentvine.com/)
- **AppFolio** unit (multifamily): name, unit status, unit amenities/tags, non-revenue (model) units, Rental Information (beds/baths, market rent, application fee, security deposit, inspection dates, rent status, utilities and appliances included, lease notes), marketing links. — [APM Help Ep. 3](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-3-how-to-set-up-a-new-property). Unit sections mirror the property's (Rental Information, Amenities, Marketing Information, Keys, Maintenance Information, Fixed Asset, Photos) with "Preferential Rent" added. — [Treaty Oak KB](https://treaty-oak-property-management-llc.helpscoutdocs.com/article/216-entering-new-landlord-property-info-in-appfolio)

#### UNIT TYPE / FLOOR PLAN

- **Rent Manager** has a first-class Unit Type record with tabs General, Images, Recurring Charges, and an add wizard. General fields: Unit Type, Other Rentable Item, Description, Bedrooms, Bathrooms, Inspection Template. "Assign Unit Types to Properties" sets per-property Rent Amount, with Units / Active / Occupied counts. Recurring charges cascade Property → Unit Type → Unit → Tenant ("Inherited Charge Types"). — [RM12: General Tab (Unit Types)](https://rm12help.rentmanager.com/Topics/12/Management/Unit-Types/General-Tab.htm); [RM12: Recurring Charges Tab (Tenant)](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Tenant-Recurring-Charges.htm)
- **Buildium / Rentvine** APIs have no unit-type or floor-plan entity; bed/bath/size/market rent live on the unit. — [Buildium Open API](https://developer.buildium.com/); [Rentvine API docs](https://docs.rentvine.com/)

#### LEASE

**Buildium**
- `Lease` fields: PropertyId, UnitId, LeaseFromDate, LeaseToDate, LeaseType (Fixed | FixedWithRollover | AtWill), LeaseStatus (Active | Past | Future), IsEvictionPending, TermType (MonthToMonth | Standard | Owner), RenewalOfferStatus, CurrentTenants, CurrentNumberOfOccupants, AccountDetails (SecurityDeposit, Rent), Cosigners, AutomaticallyMoveOutTenants, MoveOutData, PaymentDueDay. RenewalOfferStatus values: NotStarted, Generated, Declined, Renewed, Draft, Unsigned, PartiallySigned, Countersign, Activated, Sent, Accepted, ReviewNeeded, NotSent, WaitingResponse. — [Buildium Open API](https://developer.buildium.com/)
- Create-lease fields: LeaseType*, UnitId*, LeaseFromDate*, LeaseToDate, SendWelcomeEmail*, Tenants / TenantIds / ApplicantIds, Cosigners, Rent, SecurityDeposit, ProratedFirstMonthRent, ProratedLastMonthRent. — [Buildium Open API](https://developer.buildium.com/)
- Rent schedule: StartDate, EndDate, TotalAmount, RentCycle (Monthly | Weekly | Every2Weeks | Quarterly | Yearly | Every2Months | Daily | Every6Months | OneTime), BackdateCharges. Each charge line has GLAccountId, Amount, Memo, FirstChargeDate, PostDaysInAdvance, DueOnDayOfTheMonth. — [Buildium Open API](https://developer.buildium.com/)
- Lease sub-resources: transactions (ledger), charges, payments, auto-allocated payments, reverse payments (incl. NSF charge), credits, refunds, applied deposits (deposit withholding), recurring charges / credits / payments, rent schedules, renewals, move-outs, notes, ePay settings, partial-payment settings, renters insurance policies, outstanding balances. — [Buildium Open API](https://developer.buildium.com/)
- UI: the lease summary page has a Tenant tab. Editing a lease uses a "Rent" tab, "Payment Settings" (due date) and "Overrides" (lease-specific late fee and prepayment policies). New-lease flow: Signature Status (Signed/Unsigned for e-sign), Start & End Date, rent with "Next Due Date" and automatic first-month proration, security deposit amount and due date, recurring charges (Frequency, Memo visible in portal), file upload. — [APM Help Buildium Training Ep. 5](https://www.apmhelp.com/educational-videos/buildium-training---ep-5-leases-and-adding-tenants-into-buildium); [SoftwareConnect](https://softwareconnect.com/reviews/buildium/)

**Rentvine**
- `lease` fields:
  - Status: primaryLeaseStatusID (Pending | Active | Closed), custom leaseStatusID, moveOutStatusID (None | Active | Completed)
  - Basics: assignedToUserID, applicationID, code, moveInDate, startDate, endDate
  - Insurance: tenant liability insurance provider and effective date; renters insurance company, policy number, expiration and file
  - Settings: lateFeeSettingID, isLateFeesActive, isPortalDisabled, isPortalPaymentDisabled, allowedPaymentAmountTypeID, isAchDisabled, isCreditCardDisabled, isCashDisabled, isCertifiedFundsRequired, leaseReturnChargeAmount (NSF), isTenantPastDueNoticeEnabled, statementSettingID, sendStatements, isPublicStatementEnabled, leaseActivationOptionID, increaseEligibilityDate
  - Move-out: noticeDate, expectedMoveOutDate, moveOutDate, depositRefundDueDate, moveOutReasonID, moveOutUnitAvailabilityDate, moveOutTenantRemarks, isLeaseAgreementViolated, forwarding name / address / email / phone, tenantRefundPayoutTypeID (Check | ACH), isMarkedToVacate, closedDate / closedDescription
  - Computed: rentAmount (sum of active recurring charges)

  — [Rentvine API docs](https://docs.rentvine.com/)
- Lease includes (likely tabs/cards): tenants, occupants, vehicles, emergencyContacts, moveOutContact, application, leaseDocumentTransaction (e-sign), pets (with pet-screening data), recurringCharges, leaseRecurringPayments, leaseRecurringCredits, outstanding charges / credits / payments, transactions, refundableTransactions, balances, lateFeeSetting, lease-fee bill, renewals / activeRenewal, renters-insurance request and status, resident benefits package and services. — [Rentvine API docs](https://docs.rentvine.com/)
- Create-lease payload: recurringCharges (accountID, amount, description, dayDue, frequency in months, start/end, nextChargeDate, isMoveInCharge proration, escalations[] for scheduled increases), one-time move-in charges (isProrated), tenants, cosignerTenants, applicants / cosignerApplicants, occupants (name, DOB), pets, emergencyContacts, vehicles, sendPortalInvitations, deactivateListing. — [Rentvine API docs](https://docs.rentvine.com/)
- UI: pending leases show a status bar of pre-activation steps (e.g. deposit paid), and move-in and recurring charges are edited at the top of the page. — [Rentvine Knowledge Base: Leases](https://help.rentvine.com/leases) (search excerpt)

**DoorLoop**
- Lease tabs:
  - Overview (landing page)
  - Transactions ("Post Charge," "Receive Payment," credits, refunds)
  - Rent (Recurring Rent Charge, only one active, plus multiple Recurring Charges)
  - Deposits (withhold/refund)
  - Tenants ("Move-Out Tenant" button)
  - Notes, Files
  - Settings (edit lease terms)

  "Manage Lease" menu (top right) holds End Lease. — [DoorLoop: Lease Transactions Overview](https://support.doorloop.com/en/articles/6076741-lease-transactions-overview); [DoorLoop: Edit an Inactive Lease](https://support.doorloop.com/en/articles/6187026-edit-an-inactive-lease-a-lease-that-has-ended) (search excerpt); [DoorLoop: End a Lease](https://support.doorloop.com/en/articles/6067246-end-a-lease) (search excerpt)
- Lease-level settings named in help: term, eviction status (disables payments), name and notes, renters-insurance requirement, lease risk indicators, late fees on/off, prepaid rent, proration, last-month-rent deposit, Section 8, rent-by-room, multi-unit commercial lease. — [DoorLoop: Manage Your Leases collection](https://support.doorloop.com/en/collections/3376049-manage-your-leases)

**Rent Manager**
- Leases sit under the tenant. Lease fields: Property, Unit, Move In, Move Out, Notice, Expected MO, Lease Start, Lease Term, Lease Sign, Lease End, Lease Documents, User Defined Fields. Columns add Document Published, Insurance, Ins. Expiration, Move Out Confirmed, Orig Start. RV info is available for campground properties. — [RM12: Tenant Leases](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Leases/Leases.htm)

**Propertyware**
- Lease Summary page (Edit) contains a Late Fee Rule section, which overrides the lease-form default, and an Auto Charges section. New Auto Charge fields: Account, Start/End Dates, Amount, Frequency; quarterly and semi-annual only for non-standard terms. — [Propertyware: Late Fee Rules (Individual Lease)](https://support.propertyware.com/s/article/Late-Fee-Rules-Individual-Lease); [Propertyware: How to Create an Auto charge on a Lease](https://support.propertyware.com/s/article/How-to-Create-an-Auto-charge-on-a-Lease) (search excerpts)

**AppFolio**
- The tenant/occupancy page has a right-hand task panel ("Tasks"), an "Online Portal Status" section ("Send Portal Activation Invite"), "Add Additional Tenant," "Enter Receipt" and the "Tenant Ledger." — [APM Help AppFolio Ep. 5](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-5-tenant-management)
- The move-out form has a Dates & Proration section (notice date, move-out date), forwarding address and charges/credits. — [Earnest Homes: AppFolio move-out](https://support.theearnesthomes.com/support/solutions/articles/61000269883-how-to-perform-move-out-and-security-deposit-refund-on-appfolio) (search excerpt)

#### TENANT / RESIDENT (household, co-signers, pets, vehicles)

- **Buildium** `Tenant`: FirstName, LastName, Email, AlternateEmail, PhoneNumbers, DateOfBirth, EmergencyContact (Name, RelationshipDescription, Phone, Email), SMSOptInStatus, Address, AlternateAddress, MailingPreference, Comment, TaxId, Leases. Cosigner: name, emails, phones, address, alternate address, mailing preference. Vehicle: Make, Model, LicensePlateNumber, ParkingPassNumber (on association owners). Renters insurance: InsuranceCompany, CarrierType, PolicyIdentifier, Effective / Expiration / Cancellation dates, InsuredTenants. Resident Center (portal) user status: AccountExistsButNoEmailSent | PasswordSent | EmailFailed | SignedIn | Blocked, plus IsAutoPayEnabled. — [Buildium Open API](https://developer.buildium.com/)
- **Rent Manager** tenant tabs: General, Contacts, Transactions, Recurring Charges, Late Fees, Leases, ePay, History/Notes, User Defined Fields. Violations are a related feature. — [RM12 Help](https://rm12help.rentmanager.com/)
  - General tab sections:
    - Account: Company, First/Last Name, Company Name, Account Group
    - Rental Info: Property, Rent Period (Monthly/Weekly/Daily), Due Day
    - Addresses, Security Deposit, Screening, Units (modify move-in/out dates, allow no insurance), Reservations (STR)
    - Miscellaneous: Tax Type, Subsidies, Leasing Agent, Statement Method, **Don't Charge Late Fees, Don't Accept Checks, Don't Accept Partial Payments, Don't Accept Payments, Don't Allow TWA Payments, Don't Send AR Automation Notifications**
    - Pets, Comment, Additional Options / ePay

    — [RM12: General Tab (Tenant)](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/General-Tab.htm)
  - Contacts tab models the household: multiple contacts per tenant account, one "Primary," up to two "Show On Statement/Labels," contact-level UDFs, a Personal section (SSN and Annual Income masked by privilege), phone numbers with text-capable flags, and Standard / Grid / Contact views. — [RM12: Contacts Tab (Tenant)](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Contacts-Tab.htm). Release 12.300 added Middle Name and Annual Income to Contacts. — [RM 12.300 release notes](https://info.rentmanager.com/hubfs/RM12%20Release%20Notes/12.300.pdf)
- **DoorLoop** tenant: Overview tab with Contact Info, Emergency Contacts, Address, Tenant Portal status, Custom Fields. Edit Tenant covers contact info, DOB, SSN, pet info, vehicle info, dependents and portal access on/off. Also a Notifications Log tab. — [DoorLoop: View and Edit Tenant Information](https://support.doorloop.com/en/articles/6189780-view-and-edit-tenant-information)
- **Rentvine** tenant contact: name, code, birthDate, identification type / number / country / issuing location / expiration, emails[], phones[], addresses[]. Actions: activate/deactivate. Pets on the lease: type, name, age, weight, color, gender, hasShots, isTrained, isNeutered, isDeclawed, isEmotionalSupportAnimal, isServiceAnimal, petScreeningAnimalID. Vehicles: make, model, yearBuilt, color, plateNumber, plateState. Emergency contacts: name, relationship, email, phone, phone2, fullAddress. Occupants: name, DOB. — [Rentvine API docs](https://docs.rentvine.com/)
- **AppFolio** tenant types: "financially responsible," "additional occupant," "co-signer," set via Add Additional Tenant (from an application or manual entry), with insurance document upload and screening info. — [APM Help AppFolio Ep. 5](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-5-tenant-management)

#### OWNER

- **Buildium** `RentalOwner`: IsCompany, IsActive, First/Last/Company name, DateOfBirth, phones, emails, Comment, Address, ManagementAgreementStartDate / EndDate, PropertyIds. TaxInformation: TaxPayerIdType SSN/EIN, TaxPayerId, TaxPayerName1/2, IncludeIn1099, Address. Sub-resources: notes, owner requests, contribution requests with reminder settings. — [Buildium Open API](https://developer.buildium.com/)
- **Rent Manager** owner tabs: General, Ownership, Checks, ePay, Mgmt Company, Reports, History/Notes, User Defined Fields. General fields: Name, Display Name, Tax ID, Draw Account, Contribution Account, Email, Don't Print Checks, Payment Method (ACH / Check / Debit / eChecks / EFT / ePay / NACHA), Payee, Separate checks by ownership, Balance reserves across ownerships. Ownership tab: Approve Bills, Property, Contract Start / End, %, Reserve, Threshold Amount. — [RM12: General Tab (Owner)](https://rm12help.rentmanager.com/Topics/12/Management/Owners/General-Tab.htm); [RM12: Ownership Tab](https://rm12help.rentmanager.com/Topics/12/Management/Owners/Ownership-Tab.htm)
- **Rentvine** owner: name, code, websiteUrl, birthDate, payoutTypeID, ACH account type and corporate flag, holdPayments, preventConsolidatedPayments, payeeName, isBillApprovalExempt, taxPayerName, taxFormTypeID, taxIdentifier, routing/account number. Actions: activate, deactivate, delete. — [Rentvine API docs](https://docs.rentvine.com/)
- **AppFolio** owner setup: Federal Tax, Accounting Info, Online Payables / eCheck, "Use owner address as payment address," Owner Statement (Enhanced), Notes for the Owner, Owner Packet, GL Account Map, Included reports, Maintenance Information / owner-specific notes, Attachments. — [Treaty Oak KB](https://treaty-oak-property-management-llc.helpscoutdocs.com/article/216-entering-new-landlord-property-info-in-appfolio)

#### VENDOR

- **Buildium** `Vendor`: IsCompany, IsActive, names, PrimaryEmail / AlternateEmail, phones, Website, Category*, Address, VendorInsurance (Provider, PolicyNumber, ExpirationDate), Comments, AccountNumber, ExpenseGLAccountId, TaxInformation (1099). Sub-resources: credits, refunds, notes, transactions. Properties keep a preferred-vendors list. — [Buildium Open API](https://developer.buildium.com/)
- **Rent Manager** vendor tabs: General, Contacts, Transactions, ePay, History/Notes, User Defined Fields, Purchase Orders, 1099 YTD. General: Vendor Name, Payee, Associated Properties, Expiration Dates (Insurance, Worker's Comp), Tax Information (1099 SSN/Tax #, 1099 Vendor, 1099 Category), Primary Contact, Addresses, Account Number, Default Account, Category, Active, Private, Auto-Fill Check/Bill Information, Terms, Payment Method, "Vendor is a user." — [RM12: General Tab (Vendor)](https://rm12help.rentmanager.com/Topics/12/Management/Vendors/General-Tab.htm)
- **Rentvine** vendor: name, vendorTypeID (trade), code, defaultBillChargeAccountID, websiteUrl, payeeName, payoutTypeID, ACH details, holdPayments, preventConsolidatedPayments, maxLineItemsOnPayment, tax name / ID / form type, discountPercent, discountGraceDays, attachments. Diagnostics flag "Vendor Insurance Lapse." — [Rentvine API docs](https://docs.rentvine.com/)

#### WORK ORDER / SERVICE ISSUE

- **Buildium** `WorkOrder`:
  - Fields: Title, DueDate, Priority (Low/Normal/High), Status (New / InProgress / Completed / Deferred / Closed), WorkDetails, InvoiceNumber, ChargeableTo, EntryAllowed (Yes/No/Unknown), EntryNotes, VendorId*, VendorNotes, EntryContacts, linked BillTransactionIds, Amount, LineItems (GL account, Quantity, Memo, UnitPrice)
  - Parent task: ContactRequest / ResidentRequest / Todo / RentalOwnerRequest
  - Resident request extras: IsEntryPermittedByResident, DoesResidentHavePets, ResidentEntryNotes, Appliance

  — [Buildium Open API](https://developer.buildium.com/)
- Buildium UI fields: Subject, Property, Appliance, Category, Vendor, Invoice number, Charge work to, Entry allowed, Entry contact, Work to be performed, Parts and labor, Vendor notes, Assigned to, Status, Due date, Priority, attachments. Status timeline; print as Simple or Detailed PDF. — [SoftwareConnect](https://softwareconnect.com/reviews/buildium/)
- **Rentvine** work order:
  - Location and parties: propertyID, unitID, leaseID, isInternal, isVacant, vendorContactID, vendorTradeID, assignedToUserID, requestedByContactID, technicianContactIDs
  - Details: description, priorityID (Low/Medium/High), workOrderStatusID (custom statuses), vendorWorkOrderStatusID, estimatedAmount, incidentLocation, closingDescription
  - Approval and sharing: isOwnerApproved, isSharedWithTenant, isSharedWithOwner
  - Scheduling: scheduled / actual start and end, dateDue, dateClosed, appointment window
  - Access and instructions: vendorInstructions, entryInstructions, residentProvidedEntryInstructions, vendorAccessTypeID (Permission Required / Not Required / …)
  - Links: inspectionID, workOrderProjectID, workOrderTemplateID
  - Cost and notification: isTenantFinanciallyResponsible, sendVendorNotification, attachments, issueImages

  Actions: print PDF, delete. Related catalogs: materials, labor rates. — [Rentvine API docs](https://docs.rentvine.com/)
- **AppFolio** work order: Requester (Property / Unit / Homeowner / Tenant, or "Not Unit Specific"), Work Order Type (Internal, Resident Request, Unit Turn), Permission to Enter, Priority (Low / Normal / Urgent), Description, Owner Approval, vendor or in-house tech, vendor instructions, trade, follow-up date. Billable items (hours, expense account, parts), vendor markup/discount %, "Actions → Create Third-Party Vendor Bill," "Mark as Complete" (completion date and notes), recurring work orders. — [APM Help AppFolio Ep. 19](https://www.apmhelp.com/educational-videos/appfolio-tutorials---ep-19-maintenance-part-1). Vendor-portal status groups: Needs Estimate / Estimated, In Progress, Work Done, Completed. — [AppFolio Vendor Portal Overview](https://www.appfolio.com/help/vendor-portal) (search excerpt)
- **Rent Manager** service issue: Issue #, Opened, Due, Scheduled, Closed, Locked, Category, Priority, Status, Assigned To, Hours, Project, Job, Vendor, Issue, Description, Resolution, tech time (check in/out), plus Issue Links, Checklist, Work Order, History/Notes and Issue UDFs. Actions: lock, close, advance, memorize (recurring), print, send letters. — [RM12: Issues](https://rm12help.rentmanager.com/Topics/12/Services/Service-Manager/Issues.htm)

#### RENTAL APPLICATION

- **Buildium** applicant status enum: Undecided / Approved / Rejected / AddedToLease / Cancelled / Deferred / New / Draft / AddedToDraftLease. Applicant groups, applications with responses, notes, and application ledger (charges, payments, refunds, reversals, outstanding balances). — [Buildium Open API](https://developer.buildium.com/)
- **Rentvine** application summary: incomeRatio (combinedIncome / rent vs expectedRatio), occupants, animals, per-applicant screening-field statuses (application, animals, identity, income, credit, criminal, eviction, landlord). Actions: update status, order screening reports. — [Rentvine API docs](https://docs.rentvine.com/)
- **DoorLoop** application tabs: Overview, Rental Application (view/print), Reports (screening), Tasks, Notes, Files. Sections include Application Fee and TransUnion Report. Actions: assign users, approve/deny, create lease or draft lease, edit property/unit. — [DoorLoop: Review a Submitted Rental Application](https://support.doorloop.com/en/articles/6284916-review-a-submitted-rental-application)

#### PROSPECT / LEAD (guest card)

- **Rent Manager** prospect tabs: General, Contacts, Unit Preference, Transactions, ePay, History/Notes, User Defined Fields. General: Leasing Agent, Lead Source, Status, Stage, Interest Level, Application Date, Screening/Verification (status, ID, income), Pets, Security Deposits, Stage History, Lost Reason. Unit Preference: Property, Unit Types, Floors, Amenities, # People, Rent Range, Move In / Out, expected lease (start, term, end, rent period), Rent Quotes (rent, recurring and one-time charges, expiration), Reserved Unit. — [RM12: Prospect General](https://rm12help.rentmanager.com/Topics/12/Management/Prospects/General-Tab.htm); [RM12: Unit Preferences Tab](https://rm12help.rentmanager.com/Topics/12/Management/Prospects/Unit-Preference-Tab.htm)
- **DoorLoop** prospect tabs: Rental Applications, Tasks, Notes, Files, Reports. Files follow the prospect when they become a tenant. — [DoorLoop: View and edit prospect information](https://support.doorloop.com/en/articles/6301481-view-and-edit-prospect-information) (search excerpt)
- **AppFolio** guest cards (Leasing > Guest Cards): web inquiries auto-fill desired beds/baths, max rent, move-in date, occupants, monthly income, estimated credit score and pets. Manual cards set lead source, assigned manager and unit. — [APM Help AppFolio Ep. 4](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-4-guest-cards-and-applications) (search excerpt)

#### RENT CHARGE / RECURRING CHARGE

- **Buildium** recurring charge: GLAccountId, RentId, Amount, Memo, OccurrencesRemaining, First/NextOccurrenceDate, PostDaysInAdvance, Frequency, Duration (UntilEndOfTerm | SpecificNumber | SpecificDate). Recurring payment adds Payer, PaymentMethod and Lines. Recurring credits also exist. — [Buildium Open API](https://developer.buildium.com/)
- **Rentvine** recurring charge: accountID, amount, description (statement label), frequency (months), startDate, endDate, dayDue, escalations. — [Rentvine API docs](https://docs.rentvine.com/)
- **Rent Manager** recurring charges at Property, Unit Type, Unit and Tenant level, with inheritance, Past/Future/Exceptions filters, ordering, suspend and delete. — [RM12: Recurring Charges Tab (Tenant)](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Tenant-Recurring-Charges.htm)
- **DoorLoop**: one active Recurring Rent Charge per lease plus multiple Recurring Charges, each running to a date or the lease end. — [DoorLoop: Lease Transactions Overview](https://support.doorloop.com/en/articles/6076741-lease-transactions-overview)

#### BILL

- **Buildium** `Bill`: Date, DueDate, PaidDate, Memo, VendorId, WorkOrderId, ReferenceNumber, ApprovalStatus (NotNeeded | ApprovalRequired | Approved | Pending | Rejected). Lines have AccountingEntity (property/association/company + unit), GLAccount, Amount, Markup (Percent/Amount), Memo. Sub-resources: files, payments; one check can pay many bills. — [Buildium Open API](https://developer.buildium.com/)
- **Rentvine** bill: payeeContactID, billDate, dateDue, reference, paymentMemo, description, workOrderID, bankAccountID with overrideBankAccount, serviceAccountNumber, utility period, discount/markup %. charges[] lines carry ledger, GL, amount, fromPayer/toPayee, markup, discount, sales tax and lease. leaseCharges[] pass costs to tenants, plus tenantAmount and workOrderStatusID. Actions: approve, print, void. — [Rentvine API docs](https://docs.rentvine.com/)
- **Rent Manager** bill: Bill Date, Post Date, Due Date, Invoice #, Memo, Attachment, lines (Property, Unit, 1099, Expense Account, Job, Amount), Disburse Amount. Master meter bills, tenant/prospect bills, convert to recurring bill, RUBS post/rollback, void (disconnect or delete check). — [RM12: Bills](https://rm12help.rentmanager.com/Topics/12/Accounting/AP/Bills.htm)

#### BANK ACCOUNT

- **Buildium** `BankAccount`: Name, Description, BankAccountType (Checking/Savings), Country, AccountNumber, RoutingNumber, IsActive, Balance, GLAccount, ElectronicPayments, CheckPrintingInfo. Check printing covers remote/local printing, CheckLayoutType, SignatureHeading, FractionalNumber, Bank/Company information lines 1–5. Sub-resources: checks (with files), deposits, quick deposits, transfers, withdrawals, undeposited funds, transactions, reconciliations (create, balances, clear/unclear, finalize). — [Buildium Open API](https://developer.buildium.com/)
- **Rentvine** diagnostics tied to bank/ledger health: negative bank accounts, bank reconciliation lapse, reserve not met, escrow mismatch, prepayment mismatch. Deposits can be reconciled and unreconciled. — [Rentvine API docs](https://docs.rentvine.com/)

#### ASSOCIATION / HOA

- **Buildium** `Association`: Name, IsActive, Reserve, Description, YearBuilt, OperatingBankAccount, Address, AssociationManager, FiscalYearEnd Month/Day, TaxInformation. Sub-records:
  - Association units
  - Owners: vehicles, OccupiesUnit, BoardMemberTerms, DelinquencyStatus (NoDelinquency | InCollections | InForeclosure | Foreclosed)
  - Ownership accounts: Status, DateOfPurchase, DateOfSale, ledger, recurring charges / credits / payments, partial-payment settings
  - Association tenants
  - Board members: President | VicePresident | Treasurer | Secretary | BoardMember, with start/end dates
  - Committees
  - Architectural requests: Status, Decision (Pending | Approved | Denied), files
  - Meter readings, ePay settings, preferred vendors, notes, inactivate/reactivate

  — [Buildium Open API](https://developer.buildium.com/)
- **Rent Manager** models an HOA as Property Type "Association," with the Association tab (board, committees, published TWA reports) and Association Settings (architectural requests pages, board review settings, "Allow board members to view requests"). — [RM12: Association Tab](https://rm12help.rentmanager.com/Topics/12/Management/Properties/Association-Tab.htm); [RM12: Association Settings](https://rm12help.rentmanager.com/Topics/12/Management/Properties/Association-Settings.htm)
- **Rentvine** treats an Association as a payee contact (for HOA dues): defaultBillChargeAccountID, payout/ACH, tax, discount fields. — [Rentvine API docs](https://docs.rentvine.com/)

### Inferences
- A suite-native "rich edit" page per entity can adopt a common tab skeleton: **Overview/General → entity-specific tabs → Financials/Ledger → Settings/Overrides → Files → Notes → Activity/History → Custom fields**. Rent Manager (History/Notes + User Defined Fields on every record) and Buildium (notes, files and custom fields on nearly every entity) both follow this pattern.
- Household modelling splits two ways. Rent Manager uses one tenant *account* with many *contacts*. Buildium, Rentvine, DoorLoop and AppFolio use a lease with many tenants plus co-signers and occupants. Pets, vehicles and emergency contacts hang off the lease (Rentvine) or the tenant (DoorLoop, Buildium association owners).
- Unit type / floor plan is a first-class record only in Rent Manager among those researched. The others denormalize bed/bath/size/market rent onto the unit.

### Gaps
- Could not load AppFolio's official help center (login-gated) or Propertyware's Salesforce support pages. AppFolio items rely on customer KBs and APM Help video summaries (undated, some likely 2023–2025). Propertyware items rely on search excerpts.
- Buildium's UI tab names (beyond the third-party review) were not confirmed from help.buildium.com, which renders client-side.
- No source found for a dedicated Propertyware Building record field list, AppFolio bank-account detail page, or DoorLoop owner/vendor/work-order detail tabs.

---

## Q2. Which per-record settings exist (late fee rules, management fee %, reserve, payment allow/deny, portal access, proration, NSF fees, ledger visibility)?

### Takeaway
Settings cascade **Company default → Property (or Portfolio) → Lease/Tenant override** on every platform. DoorLoop states this hierarchy explicitly. AppFolio sets property late-fee defaults that apply at move-in, with per-occupant settings used at posting time. Rentvine and Buildium expose lease-level ePay and partial-payment switches. Rent Manager has tenant-level "Don't accept…" flags.

### Cited Findings
- **Hierarchy**: in DoorLoop, lease-level settings beat property-level, which beat company-level. Late fees, rent/payment reminders, payment instructions and tenant portal can each be overridden per property. — [DoorLoop: property-specific late fees](https://support.doorloop.com/en/articles/8358223-set-up-property-specific-automatic-late-fees) (search excerpt); [DoorLoop: Customize Tenant Portal Settings](https://support.doorloop.com/en/articles/6081899-customize-tenant-portal-settings) (search excerpt)
- **DoorLoop late fee rule fields**: Fee Type (flat/%), Fee ($), Frequency (once / daily / weekly / monthly), Grace Period, Revenue Account, Description. Limits: Maximum Daily Fees, Maximum Monthly Fees, Minimum Balance to Apply Fees, Only Apply to Most Recent Charge, Apply Only on Specific Outstanding Charges. Reminders: Before the Fee is Charged / After a Fee is Charged. Late fees must also be switched on per lease. — [DoorLoop: Set Up Your Automatic Late Fees Policy](https://support.doorloop.com/en/articles/6191191-set-up-your-automatic-late-fees-policy)
- **AppFolio late fees**: property settings are defaults for new occupants at move-in; the tenant/homeowner page settings are what posting uses. Types: Flat Fee, Percent of Monthly Owed, Percent of Monthly Rent/Dues Charge, Percent of Total Owed, plus a max charge cap so daily fees don't exceed a monthly maximum. — [PM Bookkeeper, Oct 17 2019](https://www.pmbookkeeper.com/blog/appfolio-adds-late-fee-customization) (dated). Property Late Fee Policy fields: Effective Date, Base Amount, Eligible Charges, Daily amount/Monthly max, Grace period, Grace balance. — [Treaty Oak KB](https://treaty-oak-property-management-llc.helpscoutdocs.com/article/216-entering-new-landlord-property-info-in-appfolio)
- **Rent Manager late fees** (property and tenant tabs): Enable Late Fees; Posted Late Fees as Fixed Amount (option "On rent only"), Percent ("On rent only," "Full charge amount") or Script. "For Selected Methods" picks Add amounts together, Charge lowest amount or Charge highest amount. Per Day Options: Days, Non Retroactive, Exclude Weekends, Exclude Holidays, Use Due Date On Invoices, One Month Only. — [RM12: Late Fees Tab (Property)](https://rm12help.rentmanager.com/Topics/12/Management/Properties/Late-Fees-Tab.htm); [RM12: Tenant Late Fees](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Late-Fees-Tab.htm)
- **Rentvine late fees**: late-fee "settings/profiles" assigned per lease (lateFeeSettingID, isLateFeesActive), with global "Auto Charge Late Fee" or manual "Post Late Fees." — [Rentvine API docs](https://docs.rentvine.com/); [Rentvine help: late fee settings/profiles](https://help.rentvine.com/how-to-set-up-late-fees)
- **Propertyware late fees**: the late fee rule is set on the lease form and overridden on the Lease Summary. It requires "Auto Calculate Late Fees Nightly" = Yes in Accounting Preferences. Rule fields include Due Day and Maximum. — [Propertyware: Late Fee Rules (Individual Lease)](https://support.propertyware.com/s/article/Late-Fee-Rules-Individual-Lease); [Propertyware: Late Fee Charge did not Post](https://support.propertyware.com/s/article/Late-Fee-Charge-did-not-Post) (search excerpts)
- **Management fees**:
  - Rent Manager standard setup: Per Unit Min/Max Fee, Monthly Flat Fee, Monthly Per Unit Fee, Per Occupied Fee, per Charge Type Percentage, Pass Through, Property Expense Account, Mgmt Income Charge Type. Advanced setup adds % of Net / Total Income, Per Post Min/Max, prorate per occupied fee. The Fees tab can view the fee breakdown and roll back the last fee posting. — [RM12: Fees Setup Tab](https://rm12help.rentmanager.com/Topics/12/Management/Properties/Fees-Setup-Tab.htm); [RM12: Fees Tab](https://rm12help.rentmanager.com/Topics/12/Management/Properties/Fees-Tab.htm)
  - AppFolio: Commission Type, Management Fee Percent, Minimum Management Fee, Lease Fee Type/Percent, Renewal Fee; waive when vacant, min/max. — [Treaty Oak KB](https://treaty-oak-property-management-llc.helpscoutdocs.com/article/216-entering-new-landlord-property-info-in-appfolio); [APM Help Ep. 3](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-3-how-to-set-up-a-new-property)
  - Rentvine: managementFeeSettingID per property. — [Rentvine API docs](https://docs.rentvine.com/)
- **Reserve**:
  - Buildium: Reserve on property and association. — [Buildium Open API](https://developer.buildium.com/)
  - Rentvine: reserveAmount on property, additionalReserveAmount on portfolio. — [Rentvine API docs](https://docs.rentvine.com/)
  - Rent Manager: reserve % per ownership. — [RM12: Ownership Tab](https://rm12help.rentmanager.com/Topics/12/Management/Owners/Ownership-Tab.htm)
  - DoorLoop: "Reserve Funds," which cannot be distributed and is shown when paying bills. — [DoorLoop: property-specific settings](https://support.doorloop.com/en/articles/6232512-set-up-property-specific-settings)
- **Payment allow/deny & portal**:
  - Buildium ePay settings per property, lease and association: EFTPayments.PaymentsEnabled, CreditCardPayments.PaymentsEnabled, OfflinePayments (DisplayInfoInResidentCenter, DisplayCompanyAddress, PaymentInstructions). Partial-payment setting RequirePaymentsInFull applies per lease and ownership account. — [Buildium Open API](https://developer.buildium.com/)
  - Rentvine lease: isPortalDisabled, isPortalPaymentDisabled, isAchDisabled, isCreditCardDisabled, isCashDisabled, isCertifiedFundsRequired, allowedPaymentAmountTypeID. — [Rentvine API docs](https://docs.rentvine.com/)
  - Rent Manager tenant: Don't Charge Late Fees, Don't Accept Checks, Don't Accept Partial Payments, Don't Accept Payments, Don't Allow TWA Payments, Don't Send AR Automation Notifications. — [RM12: General Tab (Tenant)](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/General-Tab.htm)
  - DoorLoop: tenant portal access toggled per tenant; eviction status on a lease disables payments. — [DoorLoop: View and Edit Tenant Information](https://support.doorloop.com/en/articles/6189780-view-and-edit-tenant-information); [DoorLoop: Manage Your Leases](https://support.doorloop.com/en/collections/3376049-manage-your-leases)
  - Rent Manager property ePay tab: Bank Account, ePay Warning Limit, Fee Type, Batch settings (Full Balance / Selected Charges / Set Amount), Resident Payout, Check Scanning. — [RM12: Property ePay](https://rm12help.rentmanager.com/Topics/12/Management/Properties/ePay-Tab.htm)
- **NSF / returned payment fee**:
  - Rentvine: leaseReturnChargeAmount on property (default) and lease. — [Rentvine API docs](https://docs.rentvine.com/)
  - Rent Manager: property "NSF Fee." — [RM12: General Tab (Property)](https://rm12help.rentmanager.com/Topics/12/Management/Properties/General-Tab.htm)
  - AppFolio: property NSF fee. — [APM Help Ep. 3](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-3-how-to-set-up-a-new-property)
  - DoorLoop: Returned Payment Fees settings. — [DoorLoop: Manage Your Leases](https://support.doorloop.com/en/collections/3376049-manage-your-leases)
- **Proration**: Buildium lease has ProratedFirstMonthRent and ProratedLastMonthRent. — [Buildium Open API](https://developer.buildium.com/) Rentvine recurring charges have isMoveInCharge and move-in charges have isProrated. — [Rentvine API docs](https://docs.rentvine.com/)
- **Statements / ledger visibility**:
  - Rentvine lease: statementSettingID, sendStatements, isPublicStatementEnabled; portfolio sendStatements and isLiveLedgerEnabled. — [Rentvine API docs](https://docs.rentvine.com/)
  - Rent Manager: property and tenant "Statement Method." — [RM12: General Tab (Tenant)](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/General-Tab.htm)
  - AppFolio: "Suppress Owner Visibility" on additional fees and "Statement Settings" on the property. — [APM Help Ep. 3](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-3-how-to-set-up-a-new-property); [Treaty Oak KB](https://treaty-oak-property-management-llc.helpscoutdocs.com/article/216-entering-new-landlord-property-info-in-appfolio)
- **Other per-record settings**:
  - Maintenance limit / approval threshold: AppFolio Maintenance Limit; Rentvine maintenanceLimitAmount and maintenance markup; Rent Manager owner bill-approval Threshold Amount.
  - Security deposit interest: Rent Manager SD Interest tab (Simple / Annually Compounding, disbursement as Credit or Apply to Security Deposit, rate table). — [RM12: SD Interest](https://rm12help.rentmanager.com/Topics/12/Management/Properties/SD-Interest-Tab.htm)
  - Screening overrides per property: Rent Manager Screening tab. — [RM12: Screening Tab](https://rm12help.rentmanager.com/Topics/12/Management/Properties/Screening-Tab.htm)
  - Required renters-insurance liability amount: Rentvine property. — [Rentvine API docs](https://docs.rentvine.com/)

### Inferences
- Model settings as a reusable "policy" object (late fee, payment rules, statement, management fee) with a resolved value and an "inherited from Company / Property / overridden here" indicator on each record. All six platforms implement this cascade in some form.
- Payment-acceptance switches (ACH, card, cash, partial, certified funds only, portal payments) belong on the Lease and Property Settings tabs.

### Gaps
- Exact Buildium property-level late-fee override UI not confirmed. A Buildium update said Lease, Recurring Charge and Late Fee settings were merged into "Resident Global Settings" (undated). — [Buildium updates (May 7)](https://buildium.com/news/buildium-updates-for-the-week-of-may-7)
- The AppFolio late-fee source is from 2019, and the current UI may differ.

---

## Q3. What actions are available from each record?

### Takeaway
Actions cluster into lifecycle actions (renew, move in/out, end lease, transfer unit, activate/deactivate), money actions (post charge, receive payment, credit, refund, reverse/NSF, withhold deposit, recurring transactions) and communication/document actions (send notice, portal invite, statement, print, e-sign). The Buildium and Rentvine APIs enumerate them precisely; Rent Manager and DoorLoop help confirm the UI labels.

### Cited Findings
- **Lease (Buildium)**: create charge, payment, auto-allocated payment, payment reversal (incl. NSF charge and other bank charge), credit, refund, deposit withholding (applied deposits), recurring charge / credit / payment, rent schedule, lease renewal (with RecurringChargesToStop / Create / Update, AutomaticallyMoveOutTenants, SendWelcomeEmail), move out (TenantId, MoveOutDate, NoticeGivenDate; delete move-out to undo), add cosigner, notes, ePay and partial-payment settings. — [Buildium Open API](https://developer.buildium.com/)
- **Lease (DoorLoop)**: Post Charge, Receive Payment (auto-apply to oldest or manual), credits, refunds, deposit withhold/refund, Manage Lease → End Lease (move-out date, optional notice date, move-out reason, files; ends portal access; cannot be reactivated), Move-Out Tenant (Tenants tab; not for a sole tenant), Renew Lease wizard / renewal offer / renewal contract, Notice to Vacate, set eviction status, transfer deposit to a new lease, move tenant to another unit, download account statement, send rent reminder or overdue notice, delete lease. — [DoorLoop: Lease Transactions Overview](https://support.doorloop.com/en/articles/6076741-lease-transactions-overview); [DoorLoop: Manage Your Leases](https://support.doorloop.com/en/collections/3376049-manage-your-leases); [DoorLoop: End a Lease](https://support.doorloop.com/en/articles/6067246-end-a-lease) (search excerpt)
- **Lease (Rentvine)**: update lease status, add/remove tenant, recurring charge CRUD, create lease charge and payment, resident package / services. The move-out flow (Actions menu) runs deposits → charges/credits → refund. — [Rentvine API docs](https://docs.rentvine.com/); [Rentvine help: move out a tenant](https://help.rentvine.com/how-to-move-out-a-tenant) (search excerpt)
- **Tenant (Rent Manager)**: Transactions tab actions are Add charge / credit / payment, Move a Transaction, Void or NSF a Payment, Scan a Check, Refund an ePay Payment, Clear a Payment Allocation, Delete, Print Receipt. Other actions: Move Out Wizard (verify lease → contact info → move-out actions incl. Kick Off Make Ready, Set Unit Status, Set Asset Status), renew lease, generate renewal offer, security deposit charge / receive / refund (check, bill, eCheck, resident payout) / transfer, add violation. — [RM12: Transactions Tab (Tenant)](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Transactions-Tab.htm); [RM12: Move Out Wizard](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Move-Out-Wizard.htm); [RM12: Security Deposits](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Security-Deposits.htm); [RM12: Tenant Leases](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Leases/Leases.htm)
- **Tenant (AppFolio)**: Tasks panel with Enter Receipt (amount, payment type, remarks, reference), Add Additional Tenant, Send Portal Activation Invite, move-out from the task pane, Transfer Tenant (move-out + move-in + new lease). — [APM Help AppFolio Ep. 5](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-5-tenant-management); [APM Help: Transfer tenant task](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-6-tenant-moves-into-wrong-unit---transfer-tenant-task) (search excerpt)
- **Tenant list quick actions (DoorLoop)**: Add contact info, Resend portal invitation, Send rent reminder, Send overdue rent notices. — [DoorLoop: View and Edit Tenant Information](https://support.doorloop.com/en/articles/6189780-view-and-edit-tenant-information)
- **Property**:
  - Buildium: inactivate/reactivate, upload/reorder images, update amenities, update preferred vendors, record meter readings, notes. — [Buildium Open API](https://developer.buildium.com/)
  - Rentvine: activate/deactivate/delete/export. — [Rentvine API docs](https://docs.rentvine.com/)
  - Rent Manager: renew ownership contract, roll back last management-fee posting, print management fees, inactivate with mass move-out, convert Standard/Advanced. — [RM12: Owners Tab](https://rm12help.rentmanager.com/Topics/12/Management/Properties/Owners-Tab.htm); [RM12: Fees Tab](https://rm12help.rentmanager.com/Topics/12/Management/Properties/Fees-Tab.htm); [RM12: General Tab (Property)](https://rm12help.rentmanager.com/Topics/12/Management/Properties/General-Tab.htm)
- **Owner**:
  - Rentvine: activate/deactivate/delete, ACH details, statements (list/download, statement batches). — [Rentvine API docs](https://docs.rentvine.com/)
  - Rent Manager: Owner Add Wizard, Ownership Transfer Wizard, Pay Owners, Owner Contributions, save statement to History/Notes. — [RM12 Help](https://rm12help.rentmanager.com/)
  - DoorLoop: record/edit/delete owner distribution, record owner contribution. — [DoorLoop: Manage Your Leases](https://support.doorloop.com/en/collections/3376049-manage-your-leases)
- **Vendor**: Buildium create credit, refund, notes, view transactions. — [Buildium Open API](https://developer.buildium.com/) Rentvine activate/deactivate. — [Rentvine API docs](https://docs.rentvine.com/)
- **Work order**:
  - Buildium: update, print (Simple/Detailed), status timeline, delete. — [SoftwareConnect](https://softwareconnect.com/reviews/buildium/)
  - AppFolio: request owner approval, notify tenant/owner, Create Third-Party Vendor Bill, Mark as Complete, recurring work orders. — [APM Help Ep. 19](https://www.apmhelp.com/educational-videos/appfolio-tutorials---ep-19-maintenance-part-1)
  - Rentvine: print PDF, send vendor notification, bill sets the WO status. — [Rentvine API docs](https://docs.rentvine.com/)
  - Rent Manager: lock, close, advance, memorize, send letters, tech time. — [RM12: Issues](https://rm12help.rentmanager.com/Topics/12/Services/Service-Manager/Issues.htm)
- **Application / prospect**:
  - DoorLoop: approve/deny, request screening, assign users, create lease or draft lease. — [DoorLoop: Review a Submitted Rental Application](https://support.doorloop.com/en/articles/6284916-review-a-submitted-rental-application)
  - Buildium: approve → "Move in" → "Add to lease." — [SoftwareConnect](https://softwareconnect.com/reviews/buildium/)
  - Rent Manager: change status (to tenant, Lost / Lost-Rejected with reason), Move-In Wizard, send online application, rent quotes, reserve unit. — [RM12: Prospect General](https://rm12help.rentmanager.com/Topics/12/Management/Prospects/General-Tab.htm)
- **Bill**:
  - Buildium: pay (single or multi-bill check), upload/download files, approval status. — [Buildium Open API](https://developer.buildium.com/)
  - Rentvine: approve, print, void. — [Rentvine API docs](https://docs.rentvine.com/)
  - Rent Manager: pay, review, void, delete, convert to recurring, post/rollback RUBS. — [RM12: Bills](https://rm12help.rentmanager.com/Topics/12/Accounting/AP/Bills.htm)
- **Bank account (Buildium)**: write check, deposit, quick deposit, transfer, withdrawal, reconcile (clear/unclear, finalize), view undeposited funds. — [Buildium Open API](https://developer.buildium.com/)
- **Association (Buildium)**: add/remove board members, committees, architectural requests (upload files, decision), ownership-account charges / payments / credits / refunds / deposit withholdings / recurring transactions, owner occupancy status, inactivate/reactivate. — [Buildium Open API](https://developer.buildium.com/)

### Inferences
- A detail page needs a header **"Actions" menu** (Rentvine "Actions," DoorLoop "Manage Lease," AppFolio "Tasks" panel) holding lifecycle actions, plus per-tab primary buttons for money actions on the ledger/transactions tab.
- Move-out is consistently a multi-step wizard (dates/notice → forwarding contact → deposit disposition/charges → refund → unit status/make-ready), not a single field edit.

### Gaps
- Exact AppFolio action labels on the current tenant/unit pages are unconfirmed; sources are third-party and some are dated.
- No source for Propertyware's lease/unit action menus.

---

## Q4. What custom field / user-defined field / tag support exists per record?

### Takeaway
All six platforms support custom fields, with different entity coverage. Buildium and Rentvine have API-managed definitions grouped into categories. Rent Manager has a UDF tab on nearly every record, including contact-level UDFs and UDFs on leases and service issues. DoorLoop shows a Custom Fields section on tenants. Propertyware lets companies attach custom fields to most entities.

### Cited Findings
- **Buildium** custom field groups per EntityType: Rentals, Associations, RentalUnits, AssociationUnits, RentalTenants, AssociationTenants, AssociationOwners, Vendors, Leases, RentalOwners, Tasks, WorkOrders, Projects, OwnershipAccounts, Prospects, Applicants, UnitListings. Field types: Checkbox, DropDown, ShortText, LongText, Date. Definitions have IsRequired and IsActive. Values are upserted per entity. Property Groups (name, description, properties) are a grouping/tag mechanism. — [Buildium Open API](https://developer.buildium.com/)
- **Rentvine** custom field categories per static object type (Owner, Lease, Property…). Field types: Short Text, Paragraph, Dropdown, Toggle, Date, Number, Decimal, Integer. Values are saved per object. Portfolio groups and custom lease and work-order statuses are also user-defined. — [Rentvine API docs](https://docs.rentvine.com/)
- **Rent Manager** User Defined Fields tabs exist on Property, Unit, Tenant, Prospect, Owner and Vendor. UDFs also appear on leases, tenant contacts (required UDFs shown in gold), service issues (Issue UDFs) and prospect unit preferences. Field types include Hyperlink (newer). — [RM12 Help](https://rm12help.rentmanager.com/); [RM12: Property UDFs](https://rm12help.rentmanager.com/Topics/12/Management/Properties/User-Defined-Fields-Tab.htm); [RM12: Contacts Tab (Tenant)](https://rm12help.rentmanager.com/Topics/12/Management/Tenants/Contacts-Tab.htm); [Rent Manager ICYMI 2021 enhancements](https://www.rentmanager.com/icymi-the-biggest-feature-enhancements-of-2021/) (search excerpt)
- **DoorLoop** tenant Overview includes a "Custom Fields" section, with setup in a separate article. — [DoorLoop: View and Edit Tenant Information](https://support.doorloop.com/en/articles/6189780-view-and-edit-tenant-information)
- **Propertyware**: companies define portfolio custom fields filled on the Portfolio Summary edit. — [Propertyware: Editing Portfolios](https://support.propertyware.com/s/article/Editing-Portfolios) (search excerpt) A user review says custom fields can be attached to unit, building, portfolio, contact, work order, lease and vendor. — [Software Advice Propertyware reviews](https://www.softwareadvice.com/property/propertyware-profile/reviews/) (user review, not official) The mobile app groups custom fields by their field groups. — [Propertyware Mobile (App Store)](https://apps.apple.com/us/app/propertyware-mobile/id541673777)
- **AppFolio**: units can carry optional "unit amenities or tags," and properties use Property Groups for reporting. — [APM Help Ep. 3](https://www.apmhelp.com/educational-videos/appfolio-tutorials-ep-3-how-to-set-up-a-new-property)

### Inferences
- Build custom fields as **definitions grouped into sections per entity type**, using the common type set (short text, long text, number/decimal, date, toggle/checkbox, dropdown, hyperlink) with required/active flags. Render each entity's custom fields as a "Custom fields" tab or a grouped section in Overview. The project's `metadata jsonb` bag maps naturally to the stored values.

### Gaps
- No official AppFolio documentation was found on its custom-field or tag model.
- DoorLoop's custom-field entity coverage beyond tenants was not confirmed.
