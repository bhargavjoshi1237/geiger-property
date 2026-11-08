import { test } from "node:test";
import assert from "node:assert/strict";

import { billLeaseRent } from "./post";
import { billedPeriodsIn } from "./steps";
import { summarizeRentEntries } from "./keys";
import { summarizeHapEntries } from "@/lib/housing/hap";
import { indexAccounts } from "@/lib/ledger/postings";

// In-memory ledger behind the few PostgREST calls billLeaseRent makes (selects with eq / in / like / is, and the ledger_post RPC).
function fakeAdmin() {
  const db = { ledger_entries: [], ledger_lines: [] };
  let clock = 0;
  const query = (table) => {
    const filters = [];
    let cols = "*";
    const q = {
      select: (c) => ((cols = c || "*"), q),
      eq: (c, v) => (filters.push((r) => r[c] === v), q),
      in: (c, vs) => (filters.push((r) => vs.includes(r[c])), q),
      like: (c, pattern) => (filters.push((r) => String(r[c] || "").startsWith(pattern.replace(/%$/, ""))), q),
      is: (c, v) => (filters.push((r) => (r[c] ?? null) === v), q),
      limit: () => q,
      order: () => q,
      range: () => q,
      then: (resolve, reject) => {
        const rows = db[table].filter((r) => filters.every((f) => f(r)));
        // PostgREST alias metadata->hapRate as hap_rate.
        const data = cols.includes("hap_rate:") ? rows.map((r) => ({ ...r, hap_rate: r.metadata?.hapRate ?? null })) : rows;
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return q;
  };
  const admin = {
    db,
    from: query,
    async rpc(name, { p_entry: e, p_lines: lines }) {
      assert.equal(name, "ledger_post");
      const dup = db.ledger_entries.find((x) => x.project_id === e.project_id && x.idempotency_key === e.idempotency_key);
      if (dup) return { data: dup.id, error: null };
      const total = Math.round(lines.reduce((s, l) => s + Number(l.debit || 0), 0) * 100) / 100;
      const created_at = `2026-11-20T00:00:${String((clock += 1)).padStart(2, "0")}Z`;
      db.ledger_entries.push({ ...e, status: "posted", reversal_of: null, deleted_at: null, total, created_at });
      for (const l of lines) db.ledger_lines.push({ ...l, entry_id: e.id, project_id: e.project_id, lease_id: l.lease_id ?? e.lease_id, deleted_at: null });
      return { data: e.id, error: null };
    },
  };
  return admin;
}

const P = "p1";
const ACCT = indexAccounts([
  { id: "ar", systemKey: "accounts_receivable", subtype: "receivable", accountType: "Asset", number: "1200" },
  { id: "hap", systemKey: "subsidy_receivable", subtype: "subsidy_receivable", accountType: "Asset", number: "1220" },
  { id: "rent", systemKey: "rent_income", subtype: "income", accountType: "Income", number: "4000" },
]);
const ctx = { accounts: async () => ACCT, isPeriodOpen: async () => true, isDateOpen: async () => true, openDate: async (_, d) => d, today: async () => "2026-11-20" };
const POLICIES = { prorationMethod: "actual", prorateFirstMonth: true, rentDueDay: "1" };
const lease = (meta = { subsidized: true, hapAmount: 1100 }, over = {}) => ({ id: "L", project_id: P, status: "Active", rent: 1500, tenant_id: "T", unit_id: "U", property_id: "PR", term_start: "2026-10-01", metadata: meta, ...over });
const steps = [{ id: "s1", lease_id: "L", effective_date: "2026-10-01", amount: 1500, status: "active" }];
const bill = (admin, l, opts = {}) => billLeaseRent(admin, ctx, l, "2026-11", { steps, policies: POLICIES, today: "2026-11-20", ...opts });
const keys = (res) => res.entries.map((e) => [e.key.replace(":L:2026-11", ""), e.amount]);
const entry = (admin, key) => admin.db.ledger_entries.find((e) => e.idempotency_key === key);

test("billLeaseRent: a voucher month posts the HAP share first (hap:), then the tenant's (rent:); a re-run posts nothing", async () => {
  const admin = fakeAdmin();
  const first = await bill(admin, lease());
  assert.deepEqual(keys(first), [["hap", 1100], ["rent", 400]]);
  assert.deepEqual(first.split, { tenant: 400, hap: 1100 });
  assert.equal(entry(admin, "hap:L:2026-11").tenant_id, null);
  assert.equal(entry(admin, "hap:L:2026-11").metadata.hapRate, 1100);
  assert.equal(entry(admin, "rent:L:2026-11").metadata.hapRate, 1100);
  assert.deepEqual(keys(await bill(admin, lease())), []);
});

test("billLeaseRent: a lease-field change keeps a billed month's frozen rate; resplit trues up with hap-adj: and rent-adj:", async () => {
  const admin = fakeAdmin();
  await bill(admin, lease());
  assert.deepEqual(keys(await bill(admin, lease({ subsidized: true, hapAmount: 1200 }))), []);
  const resplit = await bill(admin, lease({ subsidized: true, hapAmount: 1200 }), { resplit: true });
  assert.deepEqual(keys(resplit), [["hap-adj:1", 100], ["rent-adj:1", -100]]);
  const credit = entry(admin, "rent-adj:L:2026-11:1");
  assert.equal(credit.source_type, "credit");
  const applied = admin.db.ledger_lines.find((l) => l.entry_id === credit.id && l.applies_to_entry_id);
  assert.deepEqual([applied.gl_account_id, applied.applies_to_entry_id, applied.credit], ["ar", entry(admin, "rent:L:2026-11").id, 100]);
  // The latest recorded rate (1,200) is now the month's frozen rate.
  assert.deepEqual(keys(await bill(admin, lease({ subsidized: true, hapAmount: 1100 }))), []);
});

test("billLeaseRent: a month billed in full before splits stays frozen at rate 0 until Bill now re-splits it", async () => {
  const admin = fakeAdmin();
  await bill(admin, lease({}));
  assert.deepEqual(keys(await bill(admin, lease())), []);
  const resplit = await bill(admin, lease(), { resplit: true });
  assert.deepEqual(keys(resplit), [["hap", 1100], ["rent-adj:1", -1100]]);
});

test("billLeaseRent: HAP at or above rent posts hap: only; a rent drop credits HAP with hap-adj: applied to the HAP charge", async () => {
  const admin = fakeAdmin();
  assert.deepEqual(keys(await bill(admin, lease({ subsidized: true, hapAmount: 1800 }))), [["hap", 1500]]);
  const lower = [...steps, { id: "s2", lease_id: "L", effective_date: "2026-11-16", amount: 1000, status: "active" }];
  const res = await bill(admin, lease({ subsidized: true, hapAmount: 1800 }), { steps: lower });
  assert.deepEqual(keys(res), [["hap-adj:1", -250]]);
  const credit = entry(admin, "hap-adj:L:2026-11:1");
  const applied = admin.db.ledger_lines.find((l) => l.entry_id === credit.id && l.applies_to_entry_id);
  assert.deepEqual([credit.source_type, applied.gl_account_id, applied.applies_to_entry_id, applied.credit], ["credit", "hap", entry(admin, "hap:L:2026-11").id, 250]);
  assert.equal(entry(admin, "rent:L:2026-11"), undefined);
});

test("billedPeriodsIn: schedule-change true-ups include HAP-only months (tenant share 0)", () => {
  const row = (id, key, total, extra = {}) => ({ id, lease_id: "L", idempotency_key: key, total, entry_date: "2026-10-01", status: "posted", source_type: "charge", created_at: "2026-10-01T00:00:00Z", ...extra });
  const rent = summarizeRentEntries([row("r9", "rent:L:2026-09", 400), row("r10", "rent:L:2026-10", 400)], ["L"]).get("L");
  const hap = summarizeHapEntries([row("h10", "hap:L:2026-10", 1100), row("h11", "hap:L:2026-11", 1500)], ["L"]).get("L");
  const window = { start: "2026-08-01", end: null };
  assert.deepEqual(billedPeriodsIn(rent, hap, { from: "2026-10", startsOn: "", window, dueDay: 1 }), ["2026-10", "2026-11"]);
  assert.deepEqual(billedPeriodsIn(rent, hap, { from: "2026-09", startsOn: "2026-10-01", window, dueDay: 1 }), ["2026-10", "2026-11"]);
  assert.deepEqual(billedPeriodsIn(rent, undefined, { from: "2026-01", startsOn: "", window, dueDay: 1 }), ["2026-09", "2026-10"]);
});
