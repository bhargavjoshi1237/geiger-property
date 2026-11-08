import { normKey } from "../values";

// Buildium: its onboarding templates are the public "standard fields" reference; exports publish no fixed headers, so these
// synonyms sit on top of fuzzy alias matching. Confirm against a real customer export before relying on them.

const LEASE_STATUS = { active: "Active", current: "Active", future: "Pending", past: "Ended", expired: "Ended", terminated: "Terminated", atwill: "Month-to-month", monthtomonth: "Month-to-month" };

export const buildium = {
  key: "buildium",
  label: "Buildium",
  reports: [
    { key: "rental_properties", label: "Rental properties", entity: "properties", fingerprint: ["Property name", "Address line 1", "Address line 2", "City", "State", "Zip", "Property type", "Rental owners"] },
    { key: "units", label: "Units", entity: "units", fingerprint: ["Property name", "Unit number", "Beds", "Baths", "Size", "Market rent"] },
    { key: "leases", label: "Leases & tenants", entity: "leases", fingerprint: ["Property name", "Unit number", "Lease start date", "Lease end date", "Rent", "Security deposit", "Tenant first name", "Tenant last name"] },
    { key: "rental_owners", label: "Rental owners", entity: "owners", fingerprint: ["First name", "Last name", "Company name", "Email", "Phone", "Properties owned", "Ownership percentage"] },
    { key: "vendors", label: "Vendors", entity: "vendors", fingerprint: ["Company name", "First name", "Last name", "Email", "Phone", "Category", "Insurance expiration date"] },
  ],
  headers: {
    properties: { name: ["Property name"], address: ["Address line 1"], zip: ["Zip"], type: ["Property type"] },
    units: { property_id: ["Property name"], label: ["Unit number"], bedrooms: ["Beds"], bathrooms: ["Baths"], sqft: ["Size"], rent: ["Market rent"] },
    leases: {
      property_id: ["Property name"],
      unit_id: ["Unit number"],
      term_start: ["Lease start date"],
      term_end: ["Lease end date"],
      rent: ["Rent"],
      deposit: ["Security deposit"],
      "tenant.first_name": ["Tenant first name"],
      "tenant.last_name": ["Tenant last name"],
      "tenant.email": ["Tenant email", "Email"],
      "tenant.phone": ["Tenant phone", "Phone"],
      status: ["Lease status"],
      move_in_date: ["Move-in date"],
      move_out_date: ["Move-out date"],
    },
    owners: { first_name: ["First name"], last_name: ["Last name"], company: ["Company name"], "ownership.property_id": ["Properties owned"], "ownership.ownership_pct": ["Ownership percentage"] },
    vendors: { name: ["Company name"], specialty: ["Category"], insurance_expiry: ["Insurance expiration date"] },
    open_balances: { property: ["Property name"], unit: ["Unit number"], tenant: ["Tenant name"], balance: ["Balance", "Total balance"] },
  },
  values: {
    leases: {
      status: (v) => {
        const k = normKey(v);
        return k in LEASE_STATUS ? LEASE_STATUS[k] : v;
      },
    },
  },
};
