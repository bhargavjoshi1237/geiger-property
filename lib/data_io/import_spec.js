import { GL_TYPES, getEntity, importableFields } from "./schemas";

// Import specs (PLAT-03): what each import job's file can carry, derived from the field catalogue.
// Field: { key, label, type, required, enum?, lookup?, aliases, example, group, target? } — keys are catalogue keys for the
// job's own entity, "<entity>.<key>" for a related record the row also writes (unit.sqft, tenant.email, ownership.ownership_pct)
// and plain names for balance rows. target "metadata" = a custom field (cf_<id>).

export const IMPORT_ENTITIES = ["properties", "units", "owners", "vendors", "tenants", "leases", "open_balances", "gl_opening"];
export const BALANCE_ENTITIES = ["open_balances", "gl_opening"];
export const SOURCE_SYSTEMS = ["generic", "appfolio", "buildium", "rent_manager", "yardi_breeze"];
export const SOURCE_LABELS = { generic: "Geiger template / other", appfolio: "AppFolio", buildium: "Buildium", rent_manager: "Rent Manager", yardi_breeze: "Yardi Breeze" };
export const DEPOSIT_TYPES = ["Security deposit", "Pet deposit", "Key deposit", "Last month's rent", "Other"];
export const BALANCE_KINDS = ["Tenant", "Owner"];

// Generic header aliases per catalogue entity + field (lower-case; matching ignores case and punctuation).
const ALIASES = {
  properties: {
    name: ["property", "property name", "building name", "community", "community name"],
    address: ["street", "street address", "address line 1", "address 1", "property address"],
    zip: ["postal code", "zip code", "postcode", "zipcode"],
    type: ["property type"],
    status: ["property status"],
    year_built: ["built", "year"],
    portfolio_id: ["portfolio name", "group"],
  },
  units: {
    property_id: ["property", "property name", "building", "community"],
    label: ["unit", "unit number", "unit #", "unit name", "unit no", "apt", "apartment"],
    bedrooms: ["beds", "bed", "br", "bedroom"],
    bathrooms: ["baths", "bath", "ba", "bathroom"],
    sqft: ["sq ft", "sq. ft.", "square feet", "square footage", "size", "area", "sqft"],
    rent: ["market rent", "asking rent", "unit rent"],
    deposit: ["unit deposit", "default deposit"],
    status: ["unit status", "occupancy status"],
    building_id: ["building name"],
    unit_type_id: ["unit type name", "type"],
    floor_plan_id: ["floor plan name", "floorplan"],
  },
  owners: {
    name: ["owner", "owner name", "rental owner", "full name", "display name"],
    company: ["company name", "business name", "entity"],
    email: ["email address", "owner email", "e-mail", "emails"],
    phone: ["phone number", "owner phone", "mobile", "cell", "phone numbers", "primary phone"],
    management_fee_pct: ["management fee", "mgmt fee", "fee %", "management fee percent"],
    payout_method: ["payment method", "payout", "disbursement method"],
    tax_id_last4: ["tax id", "ssn last 4", "ein last 4", "tin last 4"],
    since: ["owner since", "start date", "management start", "agreement start"],
    status: ["owner status"],
  },
  vendors: {
    name: ["vendor", "vendor name", "company", "company name", "payee", "supplier"],
    contact_name: ["contact", "contact person", "primary contact"],
    email: ["email address", "vendor email", "e-mail", "emails"],
    phone: ["phone number", "vendor phone", "mobile", "phone numbers", "primary phone"],
    specialty: ["trade", "category", "service", "vendor type", "type"],
    hourly_rate: ["rate", "hourly", "rate per hour"],
    insurance_expiry: ["insurance expiration", "insurance expires", "coi expiry", "liability insurance expiration"],
    status: ["vendor status"],
  },
  tenants: {
    name: ["tenant", "tenant name", "resident", "resident name", "full name", "name"],
    email: ["email address", "tenant email", "resident email", "e-mail", "emails"],
    phone: ["phone number", "tenant phone", "mobile", "cell", "phone numbers", "primary phone", "home phone"],
    property_id: ["property", "property name", "building"],
    unit_id: ["unit", "unit number", "unit #", "unit name", "apt"],
    status: ["tenant status", "resident status"],
  },
  leases: {
    property_id: ["property", "property name", "building", "community"],
    unit_id: ["unit", "unit number", "unit #", "unit name", "apt"],
    term_start: ["lease start", "lease from", "start date", "lease start date", "from", "start"],
    term_end: ["lease end", "lease to", "end date", "lease end date", "to", "expiration", "lease expiration", "end"],
    rent: ["monthly rent", "rent amount", "current rent", "lease rent", "rent"],
    deposit: ["security deposit", "deposit amount", "deposit"],
    lease_type: ["type of lease"],
    term_type: ["term"],
    status: ["lease status", "status"],
    signed_date: ["signed", "signed on", "date signed"],
    move_in_date: ["move in", "move-in", "move in date", "moved in"],
    notice_date: ["notice", "notice given", "notice date"],
    move_out_date: ["move out", "move-out", "move out date", "moved out"],
  },
};

const fromCatalogue = (entity, overrides = {}) =>
  importableFields(entity)
    .filter((fld) => overrides[fld.key] !== null)
    .map((fld) => ({ ...fld, aliases: ALIASES[entity]?.[fld.key] || [], group: getEntity(entity).label, ...(overrides[fld.key] || {}) }));

const extra = (key, label, type, example, more = {}) => ({ key, label, type, required: false, example, aliases: [], target: "virtual", ...more });
const externalId = (group, label = "ID in your old system") => extra(group === "own" ? "external_id" : `${group}.external_id`, label, "text", "", { aliases: ["id", "external id", "reference id", "legacy id"] });
const nameParts = (prefix, group) => [
  extra(`${prefix}first_name`, "First name", "text", "Jordan", { group, aliases: ["first name", "first", "given name"] }),
  extra(`${prefix}last_name`, "Last name", "text", "Lee", { group, aliases: ["last name", "last", "surname", "family name"] }),
];

const SPECS = {
  properties: {
    label: "Properties",
    description: "One row per property: name, address and type.",
    fields: () => [...fromCatalogue("properties"), externalId("own", "Property ID (old system)")],
  },
  units: {
    label: "Units",
    description: "One row per unit, with its property's name.",
    fields: () => [...fromCatalogue("units"), externalId("own", "Unit ID (old system)")],
  },
  owners: {
    label: "Owners",
    description: "One row per owner, or per owner and property with their ownership %.",
    fields: () => [
      ...fromCatalogue("owners", { name: { required: false, help: "Or first and last name." } }),
      ...nameParts("", "Owner"),
      externalId("own", "Owner ID (old system)"),
      extra("ownership.property_id", "Property owned", "reference", "Harbor & Pine Apartments", { group: "Ownership", lookup: { entity: "properties", by: ["name", "address"] }, aliases: ["property", "property name", "properties"] }),
      extra("ownership.ownership_pct", "Ownership %", "percent", "100", { group: "Ownership", aliases: ["ownership", "ownership percent", "percent owned", "share", "% owned"] }),
      extra("ownership.starts_on", "Owned since", "date", "2019-04-01", { group: "Ownership", aliases: ["ownership start"] }),
      extra("ownership.is_primary", "Primary owner", "boolean", "Yes", { group: "Ownership", aliases: ["primary"] }),
    ],
  },
  vendors: {
    label: "Vendors",
    description: "One row per vendor.",
    fields: () => [...fromCatalogue("vendors"), externalId("own", "Vendor ID (old system)")],
  },
  tenants: {
    label: "Tenants",
    description: "One row per tenant. Leases come in their own import (or with tenants, from a rent roll).",
    fields: () => [...fromCatalogue("tenants", { name: { required: false, help: "Or first and last name." } }), ...nameParts("", "Tenant"), externalId("own", "Tenant ID (old system)")],
  },
  leases: {
    label: "Tenants & leases",
    description: "One row per tenant on a lease (a rent roll or tenant directory): creates the tenant and the lease, and joins co-tenants on the same lease.",
    fields: () => [
      ...fromCatalogue("leases", {
        tenant_id: null,
        property_id: { required: false, help: "Needed unless the unit's old-system ID is given." },
        unit_id: { required: false, help: "Unit number, or the unit's old-system ID." },
        term_start: { required: false, help: "Needed for a row with a tenant." },
        rent: { required: false, help: "Needed for a row with a tenant." },
      }),
      externalId("own", "Lease ID (old system)"),
      extra("unit.external_id", "Unit ID (old system)", "text", "", { group: "Unit", aliases: ["unit id"] }),
      extra("unit.sqft", "Square feet", "integer", "850", { group: "Unit", aliases: ["sq ft", "sq. ft.", "square feet", "size", "sqft"] }),
      extra("unit.bedrooms", "Bedrooms", "number", "2", { group: "Unit", aliases: ["beds", "bedrooms", "br"] }),
      extra("unit.bathrooms", "Bathrooms", "number", "1", { group: "Unit", aliases: ["baths", "bathrooms", "ba"] }),
      extra("unit.rent", "Market rent", "money", "1900.00", { group: "Unit", aliases: ["market rent", "asking rent"] }),
      extra("tenant.name", "Tenant name", "text", "Jordan Lee", { group: "Tenant", aliases: ["tenant", "tenant name", "resident", "resident name", "name", "tenants", "residents"] }),
      ...nameParts("tenant.", "Tenant"),
      extra("tenant.email", "Tenant email", "email", "jordan@example.com", { group: "Tenant", aliases: ["email", "emails", "email address", "tenant email", "resident email"] }),
      extra("tenant.phone", "Tenant phone", "phone", "(207) 555-0123", { group: "Tenant", aliases: ["phone", "phone numbers", "phone number", "mobile", "cell", "tenant phone"] }),
      extra("tenant.external_id", "Tenant ID (old system)", "text", "", { group: "Tenant", aliases: ["tenant id", "resident id"] }),
    ],
  },
  open_balances: {
    label: "Opening balances",
    description: "Tenant balances (aged receivables or a balance per lease), prepaid credits, deposits held and owner balances as of the cutover. They land in an opening-balance batch.",
    fields: () => [
      extra("property", "Property", "text", "Harbor & Pine Apartments", { group: "Who", aliases: ["property", "property name", "building"] }),
      extra("unit", "Unit", "text", "2B", { group: "Who", aliases: ["unit", "unit number", "unit #", "unit name"] }),
      extra("tenant", "Tenant", "text", "Jordan Lee", { group: "Who", aliases: ["tenant", "tenant name", "resident", "name", "payer"] }),
      extra("owner", "Owner", "text", "", { group: "Who", aliases: ["owner", "owner name", "rental owner"] }),
      extra("kind", "Balance type", "enum", "Tenant", { group: "Balance", enum: BALANCE_KINDS, aliases: ["type", "balance type"] }),
      extra("balance", "Balance", "money", "1200.00", { group: "Balance", aliases: ["balance", "amount", "amount receivable", "balance due", "amount due", "total", "open", "owner balance"], help: "Positive is owed; negative is a prepaid credit." }),
      extra("charge_date", "Charge date", "date", "2026-10-01", { group: "Balance", aliases: ["date", "charge date", "due date", "transaction date", "post date"] }),
      extra("account", "Charge type", "text", "Rental Income", { group: "Balance", aliases: ["gl account", "account", "charge code", "charge type"] }),
      extra("memo", "Memo", "text", "October rent", { group: "Balance", aliases: ["memo", "description", "notes"] }),
      extra("age_0_30", "0–30 days", "money", "", { group: "Aging", aliases: ["0-30", "0 - 30", "current", "0-30 days"] }),
      extra("age_31_60", "31–60 days", "money", "", { group: "Aging", aliases: ["30-60", "31-60", "31 - 60", "31-60 days"] }),
      extra("age_61_90", "61–90 days", "money", "", { group: "Aging", aliases: ["60-90", "61-90", "61 - 90", "61-90 days"] }),
      extra("age_90_plus", "Over 90 days", "money", "", { group: "Aging", aliases: ["90+", "over 90", "90+ days", "91+"] }),
      extra("deposit", "Deposit held", "money", "1850.00", { group: "Deposit", aliases: ["deposit", "deposit held", "security deposit", "deposits held", "deposit amount"] }),
      extra("deposit_interest", "Deposit interest held", "money", "", { group: "Deposit", aliases: ["interest", "deposit interest", "accrued interest"] }),
      extra("deposit_kind", "Deposit type", "enum", "Security deposit", { group: "Deposit", enum: DEPOSIT_TYPES, aliases: ["deposit type", "deposit kind"] }),
      extra("bank", "Bank account", "text", "", { group: "Balance", aliases: ["bank", "bank account", "cash account"] }),
    ],
  },
  gl_opening: {
    label: "Trial balance",
    description: "Your old system's trial balance as of the day before cutover. Accounts are matched by number (missing ones are added to the chart); receivables, deposits, prepaid and trust cash tie out against the opening balances.",
    fields: () => [
      extra("account", "Account", "text", "1000", { required: true, group: "Account", aliases: ["account", "account number", "gl account", "number", "acct", "account no", "gl code", "gl number"] }),
      extra("account_name", "Account name", "text", "Operating Cash", { group: "Account", aliases: ["account name", "name", "description", "gl account name"] }),
      extra("account_type", "Account type", "enum", "Asset", { group: "Account", enum: GL_TYPES, aliases: ["type", "account type", "category"] }),
      extra("debit", "Debit", "money", "25000.00", { group: "Amount", aliases: ["debit", "dr", "debits"] }),
      extra("credit", "Credit", "money", "", { group: "Amount", aliases: ["credit", "cr", "credits"] }),
      extra("balance", "Balance", "money", "", { group: "Amount", aliases: ["balance", "net", "amount", "ending balance"], help: "Debit positive, credit negative — when there are no Debit / Credit columns." }),
      extra("property", "Property", "text", "", { group: "Account", aliases: ["property", "property name"] }),
      extra("memo", "Memo", "text", "", { group: "Account", aliases: ["memo", "notes"] }),
    ],
  },
};

export const isBalanceEntity = (key) => BALANCE_ENTITIES.includes(key);
export const hasImportEntity = (key) => Object.hasOwn(SPECS, key);
export const importLabel = (key) => SPECS[key]?.label || key;

// Catalogue entity whose custom fields (cf_<id>) an import carries.
const CUSTOM_OF = { properties: "properties", units: "units", owners: "owners", vendors: "vendors", tenants: "tenants", leases: "leases" };

// The import spec: { key, label, description, fields }; `custom` = the project's custom_fields setting ({ entity: [defs] }).
export function importSpec(key, { custom = {} } = {}) {
  const spec = SPECS[key];
  if (!spec) throw new Error(`Unknown import: ${key}`);
  const defs = (custom?.[CUSTOM_OF[key]] || []).filter((d) => d && d.active !== false && d.id && d.label);
  const cf = defs.length ? getEntity(CUSTOM_OF[key], { custom: defs }).fields.filter((x) => x.target === "metadata").map((x) => ({ ...x, aliases: [], group: "Custom fields" })) : [];
  const fields = [...spec.fields(), ...cf].map((x) => (x.group ? x : { ...x, group: spec.label }));
  return { key, label: spec.label, description: spec.description, fields };
}

export const importField = (spec, key) => spec.fields.find((x) => x.key === key) || null;
