// Field catalogue: the shared, server-safe (no JSX) description of each entity's importable/exportable fields.
// Consumed by the PLAT-03 importer, PLAT-04 export and PLAT-14 custom fields; keys are DB column names.
//
// Field: { key, label, type, required, enum?, lookup?, example, target }
//   type    text | email | phone | integer | number | money | percent | date | boolean | enum | reference
//   target  "column" (property.<table>.<key>) or "metadata" (metadata jsonb, custom fields)
//   lookup  reference only: { entity, by: [fields tried in order], scope?: [fields that narrow the match] }

const f = (key, label, type, example, extra = {}) => ({ key, label, type, required: false, example, target: "column", ...extra });
const req = (key, label, type, example, extra = {}) => f(key, label, type, example, { ...extra, required: true });

export const PROPERTY_TYPES = ["Single-family", "Multi-family", "Apartment", "Condo", "Townhome", "HOA", "Commercial", "Mixed-use", "Student housing", "Senior living", "Manufactured housing"];
export const PROPERTY_STATUSES = ["Active", "Vacant", "Maintenance", "Draft", "Off-market", "Inactive", "Archived"];
export const UNIT_STATUSES = ["Occupied", "Vacant", "Notice", "Make-ready", "Down", "Draft"];
export const OWNER_STATUSES = ["Active", "Onboarding", "Inactive"];
export const VENDOR_STATUSES = ["Active", "Onboarding", "Preferred", "Inactive", "Do not use"];
export const TENANT_STATUSES = ["Applicant", "Future", "Current", "Late", "Notice", "Past", "Draft"];
export const LEASE_STATUSES = ["Draft", "Pending", "Active", "Expiring soon", "Month-to-month", "Notice given", "Eviction", "Renewed", "Terminated", "Ended"];
export const LEASE_TYPES = ["residential", "commercial"];
export const TERM_TYPES = ["fixed", "mtm"];

const propertyRef = () => ({ lookup: { entity: "properties", by: ["name", "address"] } });
const unitRef = () => ({ lookup: { entity: "units", by: ["label"], scope: ["property_id"] } });

// Import order: an entity only references entities that come earlier.
export const ENTITY_ORDER = ["properties", "units", "owners", "vendors", "tenants", "leases"];

const ENTITIES = {
  properties: {
    label: "Property",
    plural: "Properties",
    table: "properties",
    naturalKey: ["name"],
    fields: [
      req("name", "Property name", "text", "Harbor & Pine Apartments"),
      f("address", "Address", "text", "120 Harbor St"),
      f("city", "City", "text", "Portland"),
      f("state", "State", "text", "ME"),
      f("zip", "ZIP", "text", "04101"),
      f("type", "Type", "enum", "Multi-family", { enum: PROPERTY_TYPES }),
      f("status", "Status", "enum", "Active", { enum: PROPERTY_STATUSES }),
      f("year_built", "Year built", "integer", "1998"),
      f("description", "Description", "text", "Garden-style community near the waterfront"),
      f("portfolio_id", "Portfolio", "reference", "East Coast", { lookup: { entity: "portfolios", by: ["name"] } }),
    ],
  },
  units: {
    label: "Unit",
    plural: "Units",
    table: "units",
    naturalKey: ["property_id", "label"],
    fields: [
      req("property_id", "Property", "reference", "Harbor & Pine Apartments", propertyRef()),
      req("label", "Unit number", "text", "2B"),
      f("floor", "Floor", "text", "2"),
      f("bedrooms", "Bedrooms", "number", "2"),
      f("bathrooms", "Bathrooms", "number", "1.5"),
      f("sqft", "Square feet", "integer", "850"),
      f("rent", "Market rent", "money", "1850.00"),
      f("deposit", "Deposit", "money", "1850.00"),
      f("status", "Status", "enum", "Vacant", { enum: UNIT_STATUSES }),
    ],
  },
  owners: {
    label: "Owner",
    plural: "Owners",
    table: "owners",
    naturalKey: ["email", "name"],
    fields: [
      req("name", "Owner name", "text", "Maria Alvarez"),
      f("company", "Company", "text", "Alvarez Holdings LLC"),
      f("email", "Email", "email", "maria@example.com"),
      f("phone", "Phone", "phone", "(207) 555-0142"),
      f("management_fee_pct", "Management fee %", "percent", "8"),
      f("payout_method", "Payout method", "text", "ACH"),
      f("tax_id_last4", "Tax ID (last 4)", "text", "1234"),
      f("since", "Owner since", "date", "2019-04-01"),
      f("status", "Status", "enum", "Active", { enum: OWNER_STATUSES }),
    ],
  },
  vendors: {
    label: "Vendor",
    plural: "Vendors",
    table: "vendors",
    naturalKey: ["email", "name"],
    fields: [
      req("name", "Vendor name", "text", "Coastal Plumbing"),
      f("contact_name", "Contact name", "text", "Sam Doyle"),
      f("email", "Email", "email", "sam@coastalplumbing.example"),
      f("phone", "Phone", "phone", "(207) 555-0199"),
      f("specialty", "Specialty", "text", "Plumbing"),
      f("hourly_rate", "Hourly rate", "money", "95.00"),
      f("insurance_expiry", "Insurance expiry", "date", "2027-01-31"),
      f("status", "Status", "enum", "Active", { enum: VENDOR_STATUSES }),
    ],
  },
  tenants: {
    label: "Tenant",
    plural: "Tenants",
    table: "tenants",
    naturalKey: ["email", "name"],
    fields: [
      req("name", "Tenant name", "text", "Jordan Lee"),
      f("email", "Email", "email", "jordan@example.com"),
      f("phone", "Phone", "phone", "(207) 555-0123"),
      f("property_id", "Property", "reference", "Harbor & Pine Apartments", propertyRef()),
      f("unit_id", "Unit", "reference", "2B", unitRef()),
      f("status", "Status", "enum", "Current", { enum: TENANT_STATUSES }),
    ],
  },
  leases: {
    label: "Lease",
    plural: "Leases",
    table: "leases",
    naturalKey: ["unit_id", "term_start"],
    fields: [
      req("property_id", "Property", "reference", "Harbor & Pine Apartments", propertyRef()),
      req("unit_id", "Unit", "reference", "2B", unitRef()),
      req("tenant_id", "Tenant", "reference", "jordan@example.com", { lookup: { entity: "tenants", by: ["email", "name"] } }),
      req("term_start", "Lease start", "date", "2026-01-01"),
      f("term_end", "Lease end", "date", "2026-12-31"),
      req("rent", "Monthly rent", "money", "1850.00"),
      f("deposit", "Security deposit", "money", "1850.00"),
      f("lease_type", "Lease type", "enum", "residential", { enum: LEASE_TYPES }),
      f("term_type", "Term type", "enum", "fixed", { enum: TERM_TYPES }),
      f("status", "Status", "enum", "Active", { enum: LEASE_STATUSES }),
      f("signed_date", "Signed date", "date", "2025-12-15"),
      f("move_in_date", "Move-in date", "date", "2026-01-01"),
      f("notice_date", "Notice date", "date", ""),
      f("move_out_date", "Move-out date", "date", ""),
    ],
  },
};

// Custom field types (PLAT-14) → catalogue types.
const CUSTOM_TYPES = { text: "text", number: "number", date: "date", boolean: "boolean", select: "enum", email: "email", phone: "phone" };

// Catalogue fields for a project's custom-field definitions: [{ id, label, type, options?, required?, example? }].
export function customFields(defs = []) {
  return defs.map((d) => {
    const type = CUSTOM_TYPES[d.type] || "text";
    return {
      key: `cf_${d.id}`,
      label: d.label,
      type,
      required: Boolean(d.required),
      example: d.example ?? "",
      target: "metadata",
      ...(type === "enum" ? { enum: d.options || [] } : {}),
    };
  });
}

export const entityKeys = () => [...ENTITY_ORDER];
export const hasEntity = (key) => Object.hasOwn(ENTITIES, key);

// Entity description with its fields (custom fields appended when given); throws on an unknown entity.
export function getEntity(key, { custom = [] } = {}) {
  if (!hasEntity(key)) throw new Error(`Unknown import entity: ${key}`);
  const e = ENTITIES[key];
  return { key, ...e, fields: [...e.fields, ...customFields(custom)] };
}

export const getFields = (key, opts) => getEntity(key, opts).fields;
export const getField = (key, fieldKey, opts) => getFields(key, opts).find((x) => x.key === fieldKey) || null;
export const requiredFields = (key, opts) => getFields(key, opts).filter((x) => x.required);

// Entities this entity resolves references against (drives import ordering).
export function dependsOn(key) {
  const own = new Set(getFields(key).filter((x) => x.lookup).map((x) => x.lookup.entity));
  return ENTITY_ORDER.filter((k) => own.has(k) && k !== key);
}

// Template header row and example row for an entity.
export const templateHeaders = (key, opts) => getFields(key, opts).map((x) => x.label);
export const templateExample = (key, opts) => getFields(key, opts).map((x) => x.example);
