"use client";

import { Badge } from "@/components/ui/badge";
import { makePolicySection } from "@/components/internal/screens/entity/sections/policy_section";
import {
  CLASS_OPTIONS,
  MONTH_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  daysUntil,
  opts,
} from "../constants";
import { bankAccountLoader, glAccountLoader, loadPortfolioOptions, teamLoader } from "../joins";
import { CoverCard } from "./cover_card";
import { makeCardsSection } from "./form_cards";

// Field-driven tabs of the Property editor. Columns persist via onCommit, flat
// `meta` keys via onCommitMeta, and structured tabs under their own metadata key
// (construction, marketing, banking, rentSettings, management, contacts, association).

// --- Details -----------------------------------------------------------------------

export const PropertyDetailsSection = makeCardsSection([
  {
    title: "Identity",
    description: "What this property is and where it sits in your portfolio.",
    fields: [
      { key: "name", label: "Property name", type: "text", required: true, full: true },
      { key: "type", label: "Property type", type: "select", options: PROPERTY_TYPE_OPTIONS },
      { key: "propertyClass", label: "Class", type: "select", options: CLASS_OPTIONS, meta: true },
      { key: "portfolioId", label: "Portfolio", type: "relation", load: loadPortfolioOptions, displayKey: "portfolioName", placeholder: "No portfolio" },
      { key: "yearBuilt", label: "Year built", type: "number", min: 1700, max: 2100 },
      { key: "units", label: "Unit count", type: "readonly", hint: "Kept in sync by Add units and Sync unit count." },
      { key: "hasAssociation", label: "Governed by an HOA / association", type: "switch", meta: true },
    ],
  },
  {
    title: "Address",
    fields: [
      { key: "address", label: "Street address", type: "text", full: true },
      { key: "address2", label: "Address line 2", type: "text", meta: true, full: true },
      { key: "city", label: "City", type: "text" },
      { key: "state", label: "State / region", type: "text" },
      { key: "zip", label: "ZIP / postal code", type: "text" },
      { key: "county", label: "County", type: "text", meta: true },
      { key: "country", label: "Country", type: "text", meta: true, placeholder: "United States" },
      { key: "neighborhood", label: "Neighborhood", type: "text", meta: true },
      { key: "latitude", label: "Latitude", type: "number", meta: true, step: "any" },
      { key: "longitude", label: "Longitude", type: "number", meta: true, step: "any" },
    ],
  },
  {
    title: "Size & parcel",
    fields: [
      { key: "totalSqft", label: "Total building area", type: "number", meta: true, suffix: "sqft", min: 0 },
      { key: "rentableSqft", label: "Rentable area", type: "number", meta: true, suffix: "sqft", min: 0 },
      { key: "lotSize", label: "Lot size", type: "number", meta: true, min: 0, step: "any" },
      { key: "lotSizeUnit", label: "Lot size unit", type: "select", meta: true, options: opts("sqft", "acres") },
      { key: "parcelNumber", label: "Parcel / APN", type: "text", meta: true },
      { key: "zoning", label: "Zoning", type: "text", meta: true, placeholder: "e.g. R-3" },
      { key: "floodZone", label: "Flood zone", type: "text", meta: true, placeholder: "e.g. X" },
      { key: "taxAssessedValue", label: "Assessed value", type: "currency", meta: true },
      { key: "annualPropertyTax", label: "Annual property tax", type: "currency", meta: true },
    ],
  },
  {
    title: "Acquisition",
    fields: [
      { key: "purchaseDate", label: "Purchase date", type: "date", meta: true },
      { key: "purchasePrice", label: "Purchase price", type: "currency", meta: true },
      { key: "currentValue", label: "Current estimated value", type: "currency", meta: true },
      { key: "valuationDate", label: "Valued on", type: "date", meta: true },
    ],
  },
  {
    title: "Contact & web",
    fields: [
      { key: "websiteUrl", label: "Website", type: "url", meta: true, placeholder: "https://" },
      { key: "phone", label: "Main phone", type: "phone", meta: true },
      { key: "email", label: "Main email", type: "email", meta: true },
      {
        key: "timezone",
        label: "Time zone",
        type: "select",
        meta: true,
        options: opts("America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "Europe/London", "UTC"),
      },
    ],
  },
  {
    title: "Description",
    fields: [{ key: "description", label: "Description", type: "textarea", rows: 5, placeholder: "What makes this property special…" }],
  },
  { title: "Cover photo", description: "Shown on the overview and in listings.", render: (props) => <CoverCard {...props} /> },
]);

// --- Construction & systems (shared with Buildings) ----------------------------------

export const CONSTRUCTION_FIELDS = [
  { key: "constructionType", label: "Construction", type: "select", options: opts("Wood frame", "Masonry", "Steel frame", "Concrete", "Modular", "Mixed") },
  { key: "stories", label: "Stories", type: "number", min: 1 },
  { key: "foundation", label: "Foundation", type: "select", options: opts("Slab", "Crawl space", "Basement", "Pier & beam") },
  { key: "exterior", label: "Exterior", type: "select", options: opts("Brick", "Siding", "Stucco", "Stone", "Glass curtain wall", "Mixed") },
  { key: "roofType", label: "Roof", type: "select", options: opts("Asphalt shingle", "Flat / membrane", "Metal", "Tile", "Slate") },
  { key: "roofYear", label: "Roof replaced (year)", type: "number", min: 1900, max: 2100 },
  { key: "hvacType", label: "HVAC", type: "select", options: opts("Central air", "Split systems", "PTAC", "Boiler / radiators", "Heat pump", "Window units", "None") },
  { key: "heatingFuel", label: "Heating fuel", type: "select", options: opts("Natural gas", "Electric", "Oil", "Propane", "District steam") },
  { key: "waterHeater", label: "Hot water", type: "select", options: opts("Central boiler", "Individual tank", "Tankless", "Heat pump") },
  { key: "electricalAmps", label: "Electrical service", type: "number", suffix: "amps", min: 0 },
  { key: "plumbing", label: "Plumbing", type: "select", options: opts("Copper", "PEX", "PVC / CPVC", "Galvanized", "Cast iron", "Mixed") },
  { key: "elevators", label: "Elevators", type: "number", min: 0 },
  { key: "parkingSpaces", label: "Parking spaces", type: "number", min: 0 },
  { key: "parkingType", label: "Parking type", type: "select", options: opts("Surface lot", "Garage", "Covered", "Street", "None") },
  { key: "lastRenovated", label: "Last major renovation (year)", type: "number", min: 1900, max: 2100 },
  { key: "sprinklered", label: "Fire sprinklers", type: "switch" },
  { key: "fireAlarm", label: "Monitored fire alarm", type: "switch" },
  { key: "adaAccessible", label: "ADA accessible", type: "switch" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const ConstructionSection = makeCardsSection([
  {
    title: "Construction & systems",
    description: "Structure and building systems — used for planning capital work and insurance.",
    metaKey: "construction",
    fields: CONSTRUCTION_FIELDS,
  },
]);

// --- Marketing ---------------------------------------------------------------------

export const MarketingSection = makeCardsSection([
  {
    title: "Marketing copy",
    description: "Defaults for listings created from this property's vacancies.",
    metaKey: "marketing",
    fields: [
      { key: "headline", label: "Headline", type: "text", full: true, placeholder: "e.g. Sunny courtyard living near downtown" },
      { key: "marketingDescription", label: "Marketing description", type: "textarea", rows: 5 },
      { key: "virtualTourUrl", label: "Virtual tour", type: "url" },
      { key: "videoUrl", label: "Video", type: "url" },
      { key: "petPolicyText", label: "Pet policy (public)", type: "text", full: true },
      { key: "parkingInfo", label: "Parking (public)", type: "text", full: true },
    ],
  },
  {
    title: "Leasing office",
    metaKey: "marketing",
    fields: [
      { key: "leasingOfficeHours", label: "Office hours", type: "text", placeholder: "e.g. Mon–Fri 9–6, Sat 10–4" },
      { key: "leasingPhone", label: "Leasing phone", type: "phone" },
      { key: "leasingEmail", label: "Leasing email", type: "email" },
      { key: "selfShowing", label: "Self-guided showings", type: "switch" },
      { key: "onlineApplications", label: "Accept online applications", type: "switch" },
      { key: "publishVacancies", label: "Publish vacancies to listings", type: "switch" },
      { key: "showingInstructions", label: "Showing instructions (internal)", type: "textarea" },
    ],
  },
]);

// --- Banking & accounting ----------------------------------------------------------------

const GL = (key, label) => ({ key, label, type: "relation", load: glAccountLoader(`${key}Name`), displayKey: `${key}Name`, placeholder: "Company default" });

export const BankingSection = makeCardsSection([
  {
    title: "Bank accounts",
    description: "Where this property's money moves. Accounts come from Accounting → Bank Accounts.",
    metaKey: "banking",
    fields: [
      { key: "operatingAccountId", label: "Operating account", type: "relation", load: bankAccountLoader("operatingAccountName"), displayKey: "operatingAccountName", placeholder: "Not linked" },
      { key: "depositAccountId", label: "Security deposit (trust) account", type: "relation", load: bankAccountLoader("depositAccountName"), displayKey: "depositAccountName", placeholder: "Not linked" },
      { key: "reserveAccountId", label: "Reserve account", type: "relation", load: bankAccountLoader("reserveAccountName"), displayKey: "reserveAccountName", placeholder: "Not linked" },
      { key: "separateTrust", label: "Hold deposits in a separate trust account", type: "switch" },
    ],
  },
  {
    title: "Accounting",
    metaKey: "banking",
    fields: [
      { key: "accountingBasis", label: "Accounting basis", type: "select", options: opts("Cash", "Accrual", "Modified cash") },
      { key: "fiscalYearStart", label: "Fiscal year starts", type: "select", options: MONTH_OPTIONS },
      { key: "reserveAmount", label: "Operating reserve", type: "currency", hint: "Minimum cash kept in the operating account." },
      { key: "reserveTarget", label: "Capital reserve target", type: "currency" },
      { key: "report1099", label: "Report owner income on 1099s", type: "switch" },
      { key: "requireBillApproval", label: "Require approval before paying bills", type: "switch" },
      { key: "billApprovalAbove", label: "Approval needed above", type: "currency", showIf: (v) => Boolean(v.requireBillApproval) },
    ],
  },
  {
    title: "Default GL accounts",
    description: "Used when charges and bills on this property don't name an account. Blank uses the company default.",
    metaKey: "banking",
    fields: [
      GL("rentIncomeGlId", "Rent income"),
      GL("otherIncomeGlId", "Other income"),
      GL("lateFeeGlId", "Late fee income"),
      GL("depositLiabilityGlId", "Deposit liability"),
      GL("repairsGlId", "Repairs & maintenance"),
      GL("utilitiesGlId", "Utilities"),
      GL("managementFeeGlId", "Management fees"),
      GL("taxesGlId", "Property taxes"),
      GL("insuranceGlId", "Insurance"),
    ],
  },
]);

// --- Rent & market -------------------------------------------------------------------------

export const RentMarketSection = makeCardsSection([
  {
    title: "Pricing",
    metaKey: "rentSettings",
    fields: [
      { key: "targetOccupancyPct", label: "Target occupancy", type: "percent", min: 0, max: 100 },
      { key: "marketRent", label: "Average market rent", type: "currency" },
      { key: "pricingStrategy", label: "Pricing strategy", type: "select", options: opts("Manual", "Market-based", "Fixed annual increase") },
      { key: "annualIncreasePct", label: "Standard annual increase", type: "percent", showIf: (v) => v.pricingStrategy === "Fixed annual increase" },
      { key: "nextRentReview", label: "Next rent review", type: "date" },
      { key: "concessions", label: "Current concessions", type: "textarea", placeholder: "e.g. 4 weeks free on 13-month leases" },
    ],
  },
  {
    title: "Regulation & programs",
    metaKey: "rentSettings",
    fields: [
      { key: "rentControlled", label: "Rent controlled / stabilized", type: "switch" },
      { key: "rentIncreaseCapPct", label: "Annual increase cap", type: "percent", showIf: (v) => Boolean(v.rentControlled) },
      { key: "rentRegistrationId", label: "Rent registration #", type: "text", showIf: (v) => Boolean(v.rentControlled) },
      { key: "affordableProgram", label: "Affordable program", type: "select", options: opts("None", "LIHTC", "Section 8 project-based", "HOME", "Inclusionary zoning", "Other") },
      { key: "incomeLimitAmi", label: "Income limit (% AMI)", type: "percent", showIf: (v) => v.affordableProgram && v.affordableProgram !== "None" },
      { key: "acceptsVouchers", label: "Accepts housing vouchers", type: "switch" },
    ],
  },
  {
    title: "Utility billing",
    metaKey: "rentSettings",
    fields: [
      { key: "utilityBilling", label: "Utility billing", type: "select", options: opts("Included in rent", "Submetered", "RUBS", "Flat fee", "Tenant pays provider") },
      { key: "rubsMethod", label: "RUBS allocation", type: "select", options: opts("By occupants", "By square footage", "By unit", "By bedrooms"), showIf: (v) => v.utilityBilling === "RUBS" },
      { key: "utilityFlatFee", label: "Monthly utility fee", type: "currency", showIf: (v) => v.utilityBilling === "Flat fee" },
      { key: "includedUtilities", label: "Included utilities", type: "multiselect", options: opts("Water", "Sewer", "Trash", "Gas", "Electric", "Internet", "Heat") },
    ],
  },
]);

// --- Policies -----------------------------------------------------------------------------

export const RentPolicySection = makePolicySection({ scope: "property", groups: ["rent", "payments"] });
export const LeasingPolicySection = makePolicySection({ scope: "property", groups: ["leasing", "deposits"] });
export const MaintenancePolicySection = makePolicySection({ scope: "property", groups: ["maintenance"] });
const ManagementFeesSection = makePolicySection({ scope: "property", groups: ["management"] });

// --- Management agreement -----------------------------------------------------------------

function agreementBadge(item) {
  const m = item.metadata?.management || {};
  if (!m.agreementStart && !m.agreementEnd) return <Badge variant="outline">Not recorded</Badge>;
  const days = daysUntil(m.agreementEnd);
  if (days !== null && days < 0) return <Badge variant={m.autoRenew ? "info" : "danger"}>{m.autoRenew ? "Auto-renewed" : "Ended"}</Badge>;
  if (days !== null && days <= 60) return <Badge variant="warning">Ends in {days}d</Badge>;
  return <Badge variant="success">Active</Badge>;
}

const AgreementCards = makeCardsSection([
  {
    title: "Management agreement",
    description: "Terms of your agreement with the owner(s).",
    metaKey: "management",
    action: agreementBadge,
    fields: [
      { key: "agreementStart", label: "Starts", type: "date" },
      { key: "agreementEnd", label: "Ends", type: "date" },
      { key: "autoRenew", label: "Auto-renews", type: "switch" },
      { key: "renewalTermMonths", label: "Renewal term (months)", type: "number", min: 1, showIf: (v) => Boolean(v.autoRenew) },
      { key: "terminationNoticeDays", label: "Termination notice (days)", type: "number", min: 0 },
      { key: "earlyTerminationFee", label: "Early termination fee", type: "currency" },
      { key: "signedOn", label: "Signed on", type: "date" },
      { key: "signedBy", label: "Signed by (owner side)", type: "text" },
      { key: "agreementDocUrl", label: "Agreement document", type: "url", full: true, hint: "Link to the signed agreement (or upload it under Documents)." },
      {
        key: "services",
        label: "Services included",
        type: "multiselect",
        options: opts("Leasing", "Rent collection", "Maintenance", "Accounting", "Inspections", "Evictions", "Capital projects", "HOA liaison"),
      },
      { key: "reportingFrequency", label: "Owner reporting", type: "select", options: opts("Monthly", "Quarterly", "Annually") },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
]);

export function ManagementSection(props) {
  return (
    <div className="space-y-5">
      <AgreementCards {...props} />
      <ManagementFeesSection {...props} />
    </div>
  );
}

// --- Team & contacts ----------------------------------------------------------------------

const MEMBER = (key, label) => ({ key, label, type: "relation", load: teamLoader(`${key}Name`), displayKey: `${key}Name`, placeholder: "Unassigned" });

export const ContactsSection = makeCardsSection([
  {
    title: "Assigned team",
    description: "Team members from Settings → Team & Members.",
    metaKey: "contacts",
    fields: [
      MEMBER("managerId", "Property manager"),
      MEMBER("assistantManagerId", "Assistant manager"),
      MEMBER("leasingAgentId", "Leasing agent"),
      MEMBER("maintenanceLeadId", "Maintenance lead"),
      MEMBER("accountantId", "Accountant"),
    ],
  },
  {
    title: "On-site",
    metaKey: "contacts",
    fields: [
      { key: "onSiteOffice", label: "On-site office", type: "switch" },
      { key: "officeAddress", label: "Office location", type: "text", showIf: (v) => Boolean(v.onSiteOffice) },
      { key: "officePhone", label: "Office phone", type: "phone" },
      { key: "officeEmail", label: "Office email", type: "email" },
      { key: "officeHours", label: "Office hours", type: "text" },
      { key: "superintendentName", label: "Superintendent", type: "text" },
      { key: "superintendentPhone", label: "Superintendent phone", type: "phone" },
      { key: "afterHoursPhone", label: "After-hours line", type: "phone" },
      { key: "emergencyInstructions", label: "Emergency instructions", type: "textarea" },
    ],
  },
]);

// --- Association (HOA / condo) --------------------------------------------------------------

export const AssociationSection = makeCardsSection([
  {
    title: "Association",
    metaKey: "association",
    fields: [
      { key: "associationName", label: "Association name", type: "text", full: true },
      { key: "managementCompany", label: "Management company", type: "text" },
      { key: "contactName", label: "Contact", type: "text" },
      { key: "contactPhone", label: "Contact phone", type: "phone" },
      { key: "contactEmail", label: "Contact email", type: "email" },
      { key: "portalUrl", label: "Owner portal", type: "url" },
      { key: "accountNumber", label: "Account #", type: "text" },
    ],
  },
  {
    title: "Dues & assessments",
    metaKey: "association",
    fields: [
      { key: "duesAmount", label: "Dues", type: "currency" },
      { key: "duesFrequency", label: "Billed", type: "select", options: opts("Monthly", "Quarterly", "Semi-annually", "Annually") },
      { key: "duesPaidBy", label: "Paid by", type: "select", options: opts("Owner", "Tenant", "Manager on owner's behalf") },
      { key: "duesDueDay", label: "Due day", type: "number", min: 1, max: 28 },
      { key: "duesIncludes", label: "Dues include", type: "multiselect", options: opts("Water", "Trash", "Insurance", "Landscaping", "Snow removal", "Amenities", "Exterior maintenance") },
      { key: "specialAssessment", label: "Special assessment", type: "currency" },
      { key: "specialAssessmentEnds", label: "Assessment ends", type: "date" },
      { key: "specialAssessmentNotes", label: "Assessment details", type: "textarea" },
    ],
  },
  {
    title: "Rules & governance",
    metaKey: "association",
    fields: [
      { key: "ccrsUrl", label: "CC&Rs", type: "url" },
      { key: "bylawsUrl", label: "Bylaws", type: "url" },
      { key: "rulesUrl", label: "Rules & regulations", type: "url" },
      { key: "leaseApprovalRequired", label: "Board approves new leases", type: "switch" },
      { key: "minLeaseTermMonths", label: "Minimum lease term (months)", type: "number", min: 0 },
      { key: "rentalCap", label: "Rental cap", type: "text", placeholder: "e.g. 25% of units" },
      { key: "boardContactName", label: "Board contact", type: "text" },
      { key: "boardContactEmail", label: "Board contact email", type: "email" },
    ],
  },
]);
