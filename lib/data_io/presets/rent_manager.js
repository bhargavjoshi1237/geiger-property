import { flipName, normKey } from "../values";

// Rent Manager: Report Writer exports have no fixed headers; these are its usual column captions on top of fuzzy matching.
// A shared Report Writer definition (.rrtx) that exports exactly these columns is still to be built from a real export.

const LEASE_STATUS = { current: "Active", future: "Pending", past: "Ended", notice: "Notice given", eviction: "Eviction", evict: "Eviction" };

export const rentManager = {
  key: "rent_manager",
  label: "Rent Manager",
  reports: [
    { key: "tenants", label: "Tenant list", entity: "leases", fingerprint: ["Property", "Unit", "Name", "Lease Start", "Lease End", "Move In", "Move Out", "Rent", "Security Deposit"] },
    { key: "aged_receivables", label: "Aged receivables", entity: "open_balances", fingerprint: ["Property", "Unit", "Name", "Current", "31-60", "61-90", "Over 90", "Balance"], options: { balanceMode: "forward" } },
  ],
  headers: {
    leases: {
      property_id: ["Property", "Property Name"],
      unit_id: ["Unit", "Unit Name"],
      "tenant.name": ["Name", "Tenant Name"],
      "tenant.email": ["Email", "E-mail"],
      "tenant.phone": ["Phone", "Phone Number"],
      "tenant.external_id": ["Tenant ID", "Account"],
      term_start: ["Lease Start"],
      term_end: ["Lease End"],
      move_in_date: ["Move In"],
      move_out_date: ["Move Out"],
      rent: ["Rent", "Market Rent"],
      deposit: ["Security Deposit"],
      status: ["Status"],
    },
    open_balances: { property: ["Property"], unit: ["Unit"], tenant: ["Name"], balance: ["Balance"], age_0_30: ["Current", "0-30"], age_31_60: ["31-60"], age_61_90: ["61-90"], age_90_plus: ["Over 90", "90+"] },
  },
  values: {
    leases: {
      status: (v) => {
        const k = normKey(v);
        return k in LEASE_STATUS ? LEASE_STATUS[k] : v;
      },
      "tenant.name": flipName,
    },
    open_balances: { tenant: flipName },
  },
};
