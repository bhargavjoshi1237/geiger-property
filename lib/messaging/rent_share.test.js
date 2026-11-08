import { test } from "node:test";
import assert from "node:assert/strict";

import { tenantRentView } from "@/lib/housing/hap";
import { buildMergeValues } from "./context";
import { rentReminderData, tenantRentData } from "./reminder_jobs";

const voucher = { id: "L", project_id: "P", tenant_id: "T", rent: 1500, term_end: "2027-09-30", metadata: { subsidized: true, hapAmount: 1100 } };
const plain = { ...voucher, id: "L2", metadata: {} };

// Minimal property-schema client: eq / is filters over in-memory rows.
function fakeDb(tables) {
  return {
    from(table) {
      let rows = [...(tables[table] || [])];
      const q = {
        select: () => q,
        eq: (c, v) => ((rows = rows.filter((r) => r[c] === v)), q),
        is: (c, v) => ((rows = rows.filter((r) => (r[c] ?? null) === v)), q),
        order: () => q,
        limit: (n) => ((rows = rows.slice(0, n)), q),
        maybeSingle: async () => ({ data: rows[0] || null, error: null }),
        then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
      };
      return q;
    },
  };
}

test("tenantRentView: voucher leases show the tenant's share with an assistance flag and label", () => {
  assert.deepEqual(tenantRentView(voucher, null, "2026-12-01"), { amount: 400, total: 1500, hap: 1100, assistance: true, label: "Your share of rent" });
  assert.deepEqual(tenantRentView(plain, null, "2026-12-01"), { amount: 1500, total: 1500, hap: 0, assistance: false, label: "Monthly rent" });
});

test("rent reminder emails state the tenant's share, never the housing authority's", () => {
  const data = rentReminderData({ lease: voucher, recipientName: "Sofia", due: "2026-12-01", days: 3, tenant: { balance: 0 }, propertyName: "Pinecrest", unitLabel: "S-101" });
  assert.deepEqual([data.amount, data.assistance, data.amountLabel, data.dueDate.includes("2026")], ["$400", "true", "Your share of rent", true]);
  const full = rentReminderData({ lease: plain, recipientName: "A", due: "2026-12-01", days: 3, tenant: null, propertyName: "", unitLabel: "" });
  assert.deepEqual([full.amount, full.assistance, full.amountLabel], ["$1,500", "", "Monthly rent"]);
  assert.equal(tenantRentData({ ...voucher, metadata: { subsidized: true, hapAmount: 1800 } }, "2026-12-01").amount, 0);
});

test("merge tokens: {{rent}} is the tenant's share; {{full_rent}}, {{assistance_amount}} and {{rent_label}} carry the split", async () => {
  const sb = fakeDb({ leases: [voucher, plain], settings: [] });
  const { values } = await buildMergeValues(sb, { projectId: "P", leaseId: "L" }, { now: new Date("2026-11-20T12:00:00Z") });
  assert.deepEqual([values.rent, values.full_rent, values.assistance_amount, values.rent_label], ["$400", "$1,500", "$1,100", "Your share of rent"]);
  const other = (await buildMergeValues(sb, { projectId: "P", leaseId: "L2" }, { now: new Date("2026-11-20T12:00:00Z") })).values;
  assert.deepEqual([other.rent, other.full_rent, other.assistance_amount, other.rent_label], ["$1,500", "$1,500", "", "Monthly rent"]);
});

test("merge tokens: a lease without rent falls back to the unit's rent instead of $0", async () => {
  const sb = fakeDb({ leases: [{ ...plain, id: "L3", rent: null, unit_id: "U" }], units: [{ id: "U", rent: 1650 }], settings: [] });
  const { values } = await buildMergeValues(sb, { projectId: "P", leaseId: "L3" }, { now: new Date("2026-11-20T12:00:00Z") });
  assert.deepEqual([values.rent, values.full_rent], ["$1,650", ""]);
});
