import {
  ClipboardCheck,
  Gauge,
  HardHat,
  KeyRound,
  Layers,
  ShieldCheck,
  Truck,
} from "lucide-react";

import { makeRecordItemsSection } from "@/components/internal/screens/entity/sections/child_records";
import {
  addMonths,
  currency,
  dateRange,
  daysUntil,
  expiryBadge,
  formatDate,
  opts,
  statusTone,
  todayISO,
} from "./constants";
import { loadVendorOptions } from "./joins";

// Repeater kinds stored in property.record_items (owner = the open record).
// Columns: name / status / startsOn / endsOn / amount / sort; every other field
// lands in the row's metadata. Shared by the Property and Building editors.

const join = (...parts) => parts.filter(Boolean).join(" · ");

// --- insurance ---------------------------------------------------------------

export const INSURANCE_FIELDS = [
  { key: "name", label: "Carrier", type: "text", required: true, placeholder: "e.g. Travelers" },
  {
    key: "policyType",
    label: "Policy type",
    type: "select",
    options: opts("Property / hazard", "General liability", "Umbrella", "Flood", "Earthquake", "Wind / hail", "Builder's risk", "Loss of rents", "Workers' comp", "Other"),
  },
  { key: "policyNumber", label: "Policy #", type: "text" },
  { key: "coverage", label: "Coverage limit", type: "currency" },
  { key: "deductible", label: "Deductible", type: "currency" },
  { key: "amount", label: "Annual premium", type: "currency" },
  { key: "startsOn", label: "Effective", type: "date", required: true },
  { key: "endsOn", label: "Expires", type: "date", required: true },
  { key: "agentName", label: "Agent / broker", type: "text" },
  { key: "agentPhone", label: "Agent phone", type: "phone" },
  { key: "agentEmail", label: "Agent email", type: "email" },
  { key: "paymentFrequency", label: "Premium billed", type: "select", options: opts("Annually", "Semi-annually", "Quarterly", "Monthly", "Escrowed") },
  { key: "additionalInsured", label: "Manager named as additional insured", type: "switch" },
  { key: "autoRenew", label: "Auto-renews", type: "switch" },
  { key: "documentUrl", label: "Certificate / policy link", type: "url", full: true },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const insuranceSummary = (r) => {
  const e = expiryBadge(r.endsOn, { soonDays: 60, active: "Active" });
  return {
    title: join(r.name, r.policyType),
    meta: join(r.policyNumber && `#${r.policyNumber}`, r.coverage && `${currency(r.coverage)} limit`, dateRange(r.startsOn, r.endsOn)),
    badge: e.badge,
    badgeVariant: e.variant,
    aside: r.amount ? `${currency(r.amount)}/yr` : null,
  };
};

// --- compliance ----------------------------------------------------------------

export const COMPLIANCE_FIELDS = [
  { key: "name", label: "Item", type: "text", required: true, placeholder: "e.g. Annual fire inspection" },
  {
    key: "category",
    label: "Category",
    type: "select",
    options: opts("Permit", "Certificate of occupancy", "Inspection", "License", "Rental registration", "Certification", "Lead / asbestos disclosure", "Other"),
  },
  { key: "status", label: "Status", type: "select", options: opts("Pending", "Compliant", "Action needed", "Failed") },
  { key: "authority", label: "Issuing authority", type: "text", placeholder: "e.g. City fire marshal" },
  { key: "referenceNumber", label: "Reference / permit #", type: "text" },
  { key: "frequency", label: "Recurs", type: "select", options: opts("One-time", "Annually", "Every 2 years", "Every 3 years", "Every 5 years") },
  { key: "startsOn", label: "Issued / last completed", type: "date" },
  { key: "endsOn", label: "Due / expires", type: "date" },
  { key: "amount", label: "Fee", type: "currency" },
  { key: "responsible", label: "Responsible", type: "text", placeholder: "Person or vendor" },
  { key: "documentUrl", label: "Document link", type: "url", full: true },
  { key: "notes", label: "Notes", type: "textarea" },
];

// Compliant-but-past-due reads Expired; anything else past due reads Overdue.
export function complianceState(r) {
  const days = daysUntil(r.endsOn);
  if (days !== null && days < 0) return r.status === "Compliant" ? "Expired" : "Overdue";
  if (days !== null && days <= 30 && r.status !== "Compliant") return "Due soon";
  return r.status || "Pending";
}

export const complianceSummary = (r) => {
  const state = complianceState(r);
  return {
    title: r.name,
    meta: join(r.category, r.authority, r.endsOn && `Due ${formatDate(r.endsOn)}`),
    badge: state,
    badgeVariant: statusTone(state),
    aside: r.amount ? currency(r.amount) : null,
  };
};

// --- assets ------------------------------------------------------------------

export const ASSET_FIELDS = [
  { key: "name", label: "Asset", type: "text", required: true, placeholder: "e.g. Rooftop HVAC unit 2" },
  {
    key: "category",
    label: "Category",
    type: "select",
    options: opts("HVAC", "Appliance", "Water heater", "Roof", "Plumbing", "Electrical", "Elevator", "Fire & life safety", "Security", "Laundry", "Pool & spa", "Other"),
  },
  { key: "status", label: "Status", type: "select", options: opts("In service", "Needs repair", "Out of service", "Retired") },
  { key: "condition", label: "Condition", type: "select", options: opts("Excellent", "Good", "Fair", "Poor") },
  { key: "make", label: "Make", type: "text" },
  { key: "model", label: "Model", type: "text" },
  { key: "serialNumber", label: "Serial #", type: "text" },
  { key: "location", label: "Location", type: "text", placeholder: "e.g. Roof, west side" },
  { key: "startsOn", label: "Installed", type: "date" },
  { key: "endsOn", label: "Warranty ends", type: "date" },
  { key: "serviceIntervalMonths", label: "Service every (months)", type: "number", min: 0 },
  { key: "lastServicedOn", label: "Last serviced", type: "date" },
  { key: "amount", label: "Replacement cost", type: "currency" },
  { key: "expectedLifeYears", label: "Expected life (years)", type: "number", min: 0 },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const nextServiceDue = (r) => addMonths(r.lastServicedOn || r.startsOn, r.serviceIntervalMonths);

export const assetSummary = (r) => {
  const due = nextServiceDue(r);
  const dueDays = daysUntil(due);
  const warranty = expiryBadge(r.endsOn, { soonDays: 90, active: "Under warranty" });
  const serviceBadge = dueDays !== null && dueDays < 0 ? { badge: "Service overdue", variant: "danger" } : null;
  return {
    title: r.name,
    meta: join(r.category, join(r.make, r.model), r.location, due && `Next service ${formatDate(due)}`),
    badge: serviceBadge?.badge || (r.status && r.status !== "In service" ? r.status : warranty.badge),
    badgeVariant: serviceBadge?.variant || (r.status && r.status !== "In service" ? statusTone(r.status) : warranty.variant),
    aside: r.amount ? currency(r.amount) : null,
  };
};

// --- keys & access -------------------------------------------------------------

export const KEY_FIELDS = [
  { key: "name", label: "Key tag / label", type: "text", required: true, placeholder: "e.g. K-104 master" },
  { key: "keyType", label: "Type", type: "select", options: opts("Key", "Fob", "Access card", "Keypad code", "Garage remote", "Mailbox key", "Lockbox") },
  { key: "opens", label: "Opens", type: "text", placeholder: "e.g. Boiler room, all common doors" },
  { key: "status", label: "Status", type: "select", options: opts("Available", "Checked out", "Lost", "Retired") },
  { key: "copies", label: "Copies on hand", type: "number", min: 0 },
  { key: "heldBy", label: "Checked out to", type: "text", showIf: (v) => v.status === "Checked out" },
  { key: "startsOn", label: "Issued / checked out", type: "date" },
  { key: "endsOn", label: "Due back", type: "date", showIf: (v) => v.status === "Checked out" },
  { key: "accessCode", label: "Code", type: "text", showIf: (v) => ["Keypad code", "Lockbox"].includes(v.keyType), hint: "Visible to your team only." },
  { key: "storageLocation", label: "Stored at", type: "text", placeholder: "e.g. Office key cabinet, hook 12" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const keySummary = (r) => {
  const overdue = r.status === "Checked out" && daysUntil(r.endsOn) !== null && daysUntil(r.endsOn) < 0;
  return {
    title: r.name,
    meta: join(r.keyType, r.opens, r.status === "Checked out" && r.heldBy && `With ${r.heldBy}`),
    badge: overdue ? "Overdue" : r.status || "Available",
    badgeVariant: overdue ? "danger" : statusTone(r.status || "Available"),
    aside: r.copies ? `${r.copies} copies` : null,
  };
};

// --- meters & utilities --------------------------------------------------------

export const METER_FIELDS = [
  { key: "name", label: "Label", type: "text", required: true, placeholder: "e.g. House electric" },
  { key: "utility", label: "Utility", type: "select", required: true, options: opts("Electric", "Gas", "Water", "Sewer", "Trash", "Internet", "Steam", "Solar") },
  { key: "status", label: "Status", type: "select", options: opts("Active", "Inactive") },
  { key: "meterNumber", label: "Meter #", type: "text" },
  { key: "provider", label: "Provider", type: "text", placeholder: "e.g. City Power & Light" },
  { key: "accountNumber", label: "Account #", type: "text" },
  { key: "responsibility", label: "Who pays", type: "select", options: opts("Owner", "Tenant", "RUBS / bill-back") },
  {
    key: "rubsMethod",
    label: "Allocation method",
    type: "select",
    options: opts("By occupants", "By square footage", "By unit", "By bedrooms"),
    showIf: (v) => v.responsibility === "RUBS / bill-back",
  },
  { key: "serves", label: "Serves", type: "text", placeholder: "e.g. Common areas, units 101–110" },
  { key: "location", label: "Meter location", type: "text" },
  { key: "amount", label: "Avg monthly cost", type: "currency" },
  { key: "lastReading", label: "Last reading", type: "number" },
  { key: "startsOn", label: "Last read on", type: "date" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const meterSummary = (r) => ({
  title: r.name,
  meta: join(r.utility, r.provider, r.meterNumber && `Meter ${r.meterNumber}`, r.responsibility && `${r.responsibility} pays`),
  badge: r.status === "Inactive" ? "Inactive" : r.responsibility === "RUBS / bill-back" ? "RUBS" : null,
  badgeVariant: r.status === "Inactive" ? "outline" : "info",
  aside: r.amount ? `${currency(r.amount)}/mo` : null,
});

// --- preferred vendors ---------------------------------------------------------

export const VENDOR_FIELDS = [
  { key: "vendorId", label: "Vendor", type: "relation", load: loadVendorOptions, displayKey: "name", required: true },
  {
    key: "trade",
    label: "Trade",
    type: "select",
    options: opts("General maintenance", "Plumbing", "Electrical", "HVAC", "Appliances", "Landscaping", "Snow removal", "Pest control", "Cleaning", "Painting", "Roofing", "Locksmith", "Pool", "Elevator", "Other"),
  },
  { key: "status", label: "Priority", type: "select", options: opts("Primary", "Backup") },
  { key: "amount", label: "Not-to-exceed", type: "currency", hint: "Auto-approve work under this amount." },
  { key: "afterHours", label: "Handles after-hours calls", type: "switch" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const vendorSummary = (r) => ({
  title: r.name || "Vendor",
  meta: join(r.trade, r.afterHours && "After-hours"),
  badge: r.status || null,
  badgeVariant: r.status === "Primary" ? "success" : "neutral",
  aside: r.amount ? `NTE ${currency(r.amount)}` : null,
});

// --- building floors -------------------------------------------------------------

export const FLOOR_FIELDS = [
  { key: "name", label: "Floor", type: "text", required: true, placeholder: "e.g. Level 2" },
  { key: "sort", label: "Level number", type: "number", hint: "Orders floors; basements are negative." },
  { key: "use", label: "Primary use", type: "select", options: opts("Residential", "Commercial", "Amenity", "Parking", "Mechanical", "Mixed") },
  { key: "unitCount", label: "Units on floor", type: "number", min: 0 },
  { key: "sqft", label: "Floor area (sqft)", type: "number", min: 0 },
  { key: "access", label: "Access", type: "select", options: opts("Elevator & stairs", "Stairs only", "Ground level", "Restricted") },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const floorSummary = (r) => ({
  title: r.name,
  meta: join(r.use, r.unitCount ? `${r.unitCount} units` : null, r.sqft ? `${Number(r.sqft).toLocaleString()} sqft` : null, r.access),
  badge: Number.isFinite(Number(r.sort)) && r.sort !== "" ? `Level ${r.sort}` : null,
  badgeVariant: "neutral",
});

// --- section factories -------------------------------------------------------------

export const InsuranceSection = makeRecordItemsSection({
  kind: "insurance_policy",
  fields: INSURANCE_FIELDS,
  summary: insuranceSummary,
  singular: "Policy",
  plural: "Policies",
  icon: ShieldCheck,
  defaults: () => ({ startsOn: todayISO(), paymentFrequency: "Annually" }),
  emptyDescription: "Track carriers, coverage and renewal dates. Policies expiring within 60 days are flagged.",
});

export const ComplianceSection = makeRecordItemsSection({
  kind: "compliance_item",
  fields: COMPLIANCE_FIELDS,
  summary: complianceSummary,
  singular: "Compliance item",
  plural: "Compliance items",
  icon: ClipboardCheck,
  defaults: () => ({ status: "Pending", frequency: "Annually" }),
  emptyDescription: "Permits, certificates and inspections with due dates — overdue items are flagged.",
});

export const AssetsSection = makeRecordItemsSection({
  kind: "asset",
  fields: ASSET_FIELDS,
  summary: assetSummary,
  singular: "Asset",
  plural: "Assets",
  icon: HardHat,
  defaults: () => ({ status: "In service", condition: "Good" }),
  emptyDescription: "Equipment and systems with warranty and service schedules.",
});

export const KeysSection = makeRecordItemsSection({
  kind: "key",
  fields: KEY_FIELDS,
  summary: keySummary,
  singular: "Key",
  plural: "Keys",
  icon: KeyRound,
  defaults: () => ({ keyType: "Key", status: "Available", copies: 1 }),
  emptyDescription: "Keys, fobs and access codes, and who has them.",
});

export const MetersSection = makeRecordItemsSection({
  kind: "meter",
  fields: METER_FIELDS,
  summary: meterSummary,
  singular: "Meter",
  plural: "Meters",
  icon: Gauge,
  defaults: () => ({ status: "Active", responsibility: "Owner" }),
  emptyDescription: "Utility meters, providers, account numbers and who pays.",
});

export const PreferredVendorsSection = makeRecordItemsSection({
  kind: "preferred_vendor",
  fields: VENDOR_FIELDS,
  summary: vendorSummary,
  singular: "Preferred vendor",
  plural: "Preferred vendors",
  icon: Truck,
  defaults: () => ({ status: "Primary" }),
  emptyDescription: "Go-to vendors by trade, with not-to-exceed limits.",
});

export const FloorsSection = makeRecordItemsSection({
  kind: "floor",
  fields: FLOOR_FIELDS,
  summary: floorSummary,
  singular: "Floor",
  plural: "Floors",
  icon: Layers,
  defaults: () => ({ use: "Residential", access: "Elevator & stairs" }),
  emptyDescription: "Describe each level — use, unit count and area.",
});
