import { normKey } from "../values";

// Yardi Breeze: file exports only (no API), resident-centred captions; synonyms on top of fuzzy matching.

const LEASE_STATUS = { current: "Active", future: "Pending", past: "Ended", former: "Ended", notice: "Notice given", eviction: "Eviction", applicant: "Draft" };

export const yardiBreeze = {
  key: "yardi_breeze",
  label: "Yardi Breeze",
  reports: [
    { key: "rent_roll", label: "Rent roll", entity: "leases", fingerprint: ["Property", "Unit", "Resident", "Lease From", "Lease To", "Move In", "Rent", "Deposit"] },
    { key: "aging", label: "Aging", entity: "open_balances", fingerprint: ["Property", "Unit", "Resident", "0-30", "31-60", "61-90", "Over 90", "Total"], options: { balanceMode: "forward" } },
  ],
  headers: {
    leases: {
      property_id: ["Property"],
      unit_id: ["Unit"],
      "tenant.name": ["Resident", "Resident Name"],
      "tenant.email": ["Email"],
      "tenant.phone": ["Phone"],
      term_start: ["Lease From"],
      term_end: ["Lease To"],
      move_in_date: ["Move In"],
      move_out_date: ["Move Out"],
      rent: ["Rent"],
      deposit: ["Deposit"],
      status: ["Status"],
    },
    open_balances: { property: ["Property"], unit: ["Unit"], tenant: ["Resident"], balance: ["Total", "Balance"], age_0_30: ["0-30"], age_31_60: ["31-60"], age_61_90: ["61-90"], age_90_plus: ["Over 90"] },
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
