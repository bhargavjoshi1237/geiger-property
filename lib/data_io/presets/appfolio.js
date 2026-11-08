import { flipName, normKey } from "../values";

// AppFolio report exports (headers from AppFolio's report column names as documented by third-party onboarding guides:
// Tenant Directory, Rent Roll, Delinquency). Unit ID / Tenant ID are AppFolio reference IDs, kept as old-system IDs.

const LEASE_STATUS = {
  current: "Active",
  past: "Ended",
  future: "Pending",
  notice: "Notice given",
  noticeunrented: "Notice given",
  noticerented: "Notice given",
  evict: "Eviction",
  eviction: "Eviction",
  vacantunrented: "",
  vacantrented: "",
  vacant: "",
};

// "VACANT" in the tenant column is a vacant unit, not a person.
const tenantName = (v) => (/^vacant\b/i.test(String(v || "").trim()) ? "" : flipName(v));

export const appfolio = {
  key: "appfolio",
  label: "AppFolio",
  reports: [
    {
      key: "tenant_directory",
      label: "Tenant Directory",
      entity: "leases",
      fingerprint: ["Property Name", "First Name", "Last Name", "Phone Numbers", "Emails", "Lease From", "Lease To", "Move-in", "Move-out", "Rent", "Unit ID", "Tenant ID"],
      // A directory usually follows the rent roll: it fills in contact details on the same tenants and leases.
      options: { dedupe: "update" },
    },
    {
      key: "rent_roll",
      label: "Rent Roll",
      entity: "leases",
      fingerprint: ["Unit", "Tenant", "Rent", "Market Rent", "Sq. Ft.", "Past Due"],
      // The rent roll lists every unit, vacant ones too, so it creates the units it names.
      options: { createMissing: true },
    },
    {
      key: "delinquency",
      label: "Delinquency",
      entity: "open_balances",
      fingerprint: ["Amount Receivable", "0-30", "30-60", "60-90", "90+"],
      options: { balanceMode: "forward" },
    },
  ],
  headers: {
    leases: {
      property_id: ["Property Name", "Property"],
      unit_id: ["Unit"],
      "unit.external_id": ["Unit ID"],
      "unit.rent": ["Market Rent"],
      "unit.sqft": ["Sq. Ft."],
      "tenant.name": ["Tenant"],
      "tenant.first_name": ["First Name"],
      "tenant.last_name": ["Last Name"],
      "tenant.email": ["Emails"],
      "tenant.phone": ["Phone Numbers"],
      "tenant.external_id": ["Tenant ID"],
      term_start: ["Lease From"],
      term_end: ["Lease To"],
      move_in_date: ["Move-in"],
      move_out_date: ["Move-out"],
      rent: ["Rent"],
      deposit: ["Deposit"],
      status: ["Status"],
    },
    open_balances: {
      property: ["Property Name", "Property"],
      unit: ["Unit"],
      tenant: ["Name", "Tenant", "Tenant Name"],
      balance: ["Amount Receivable"],
      age_0_30: ["0-30"],
      age_31_60: ["30-60"],
      age_61_90: ["60-90"],
      age_90_plus: ["90+"],
      deposit: ["Deposit"],
    },
    tenants: { name: ["Tenant"], email: ["Emails"], phone: ["Phone Numbers"], property_id: ["Property Name", "Property"], unit_id: ["Unit"], external_id: ["Tenant ID"] },
    units: { property_id: ["Property Name", "Property"], label: ["Unit"], external_id: ["Unit ID"], sqft: ["Sq. Ft."], rent: ["Market Rent"] },
    properties: { name: ["Property Name", "Property"], address: ["Property Street Address 1", "Property Address"], city: ["Property City"], state: ["Property State"], zip: ["Property Zip"], type: ["Property Type"], external_id: ["Property ID"] },
    owners: { name: ["Owner Name", "Name"], email: ["Emails", "Email"], phone: ["Phone Numbers"], "ownership.property_id": ["Properties Owned", "Property"], external_id: ["Owner ID"] },
    vendors: { name: ["Company Name", "Name"], email: ["Emails", "Email"], phone: ["Phone Numbers"], specialty: ["Vendor Type"], insurance_expiry: ["Liability Insurance Expires"], external_id: ["Vendor ID"] },
  },
  // Columns we recognise but don't import in that job, with why.
  notes: {
    leases: { "Past Due": "Balances come in with an Opening balances import (AppFolio Delinquency)." },
  },
  values: {
    leases: {
      status: (v) => {
        const k = normKey(v);
        return k in LEASE_STATUS ? LEASE_STATUS[k] : v;
      },
      "tenant.name": tenantName,
    },
    open_balances: { tenant: tenantName },
    tenants: { name: tenantName },
  },
};
