import { test } from "node:test";
import assert from "node:assert/strict";
import { indexAccounts } from "./postings";
import { delinquentAging, normalizeArMonth, partyReceivable, partyReceivables, receivableMap, sumArMonths } from "./ar_reads";
import { receivableAging } from "@/lib/reports/ledger_math";

// CORE-07: every balance a screen or job reads is ledger_party_balances' tenant AR; the trend is ledger_ar_monthly.

// A PostgREST-shaped fake over in-memory tables: eq / in / lte / is / order / range, thenable.
function fakeDb(tables, log = []) {
  return {
    from(table) {
      let rows = [...(tables[table] || [])];
      const q = {
        select: () => q,
        eq: (c, v) => ((rows = rows.filter((r) => r[c] === v)), q),
        in: (c, vs) => (log.push({ table, in: vs.length }), (rows = rows.filter((r) => vs.includes(r[c]))), q),
        lte: (c, v) => ((rows = rows.filter((r) => r[c] <= v)), q),
        gte: (c, v) => ((rows = rows.filter((r) => r[c] >= v)), q),
        is: (c, v) => ((rows = rows.filter((r) => (r[c] ?? null) === v)), q),
        order: () => q,
        range: (a, b) => Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
        then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej),
      };
      return q;
    },
  };
}

const P = "p1";
const scope = (q) => q.eq("project_id", P);

test("receivableMap rounds and sums per party", () => {
  const m = receivableMap([
    { dimension_id: "l1", receivable: "100.105" },
    { dimension_id: "l2", receivable: -20 },
    { dimension_id: null, receivable: 5 },
  ]);
  assert.deepEqual([...m], [["l1", 100.11], ["l2", -20]]);
});

test("partyReceivables reads one dimension in the project, chunked when narrowed", async () => {
  const log = [];
  const rows = [
    ...Array.from({ length: 200 }, (_, i) => ({ project_id: P, dimension: "lease", dimension_id: `l${i}`, receivable: i })),
    { project_id: P, dimension: "tenant", dimension_id: "t1", receivable: 999 },
    { project_id: "other", dimension: "lease", dimension_id: "l1", receivable: 5000 },
  ];
  const sb = fakeDb({ ledger_party_balances: rows }, log);
  const all = await partyReceivables(sb, scope, "lease");
  assert.equal(all.size, 200);
  assert.equal(all.get("l1"), 1);
  const some = await partyReceivables(sb, scope, "lease", Array.from({ length: 160 }, (_, i) => `l${i}`));
  assert.equal(some.size, 160);
  assert.deepEqual(log.map((x) => x.in), [150, 10]);
  assert.equal(await partyReceivable(sb, scope, { tenantId: "t1" }), 999);
  assert.equal(await partyReceivable(sb, scope, { leaseId: "l3", tenantId: "t1" }), 3);
  assert.equal(await partyReceivable(sb, scope, { leaseId: "missing" }), 0);
  await assert.rejects(() => partyReceivables(sb, scope, "owner"));
});

test("monthly AR rows normalize and sum per month, scoped to properties", () => {
  const rows = [
    { property_id: "a", lease_id: "l1", tenant_id: "t1", month: "2026-10-01", charged: "1500", collected: 1500, credited: 0, transferred: 0, net: 0 },
    { property_id: "b", lease_id: "l2", tenant_id: "t2", month: "2026-10-01", charged: 900, collected: 400, credited: 75, transferred: 0, net: 425 },
    { property_id: "a", lease_id: "l1", tenant_id: "t1", month: "2026-11-01", charged: 1500, collected: 0, credited: 0, transferred: 0, net: 1500 },
  ].map(normalizeArMonth);
  assert.equal(rows[0].month, "2026-10");
  assert.equal(rows[0].charged, 1500);
  const all = sumArMonths(rows);
  assert.deepEqual(all.get("2026-10"), { charged: 2400, collected: 1900, credited: 75, transferred: 0, net: 425 });
  assert.equal(sumArMonths(rows, { propertyIds: ["a"] }).get("2026-10").collected, 1500);
  assert.equal(sumArMonths(rows, { propertyIds: [] }).get("2026-11").net, 1500);
});

test("delinquentAging ages only leases owing on the ledger, matching receivableAging", async () => {
  const accounts = indexAccounts([
    { id: "ar", accountType: "Asset", subtype: "receivable" },
    { id: "hap", accountType: "Asset", subtype: "subsidy_receivable" },
    { id: "cash", accountType: "Asset", subtype: "cash" },
  ]);
  const line = (id, entry, lease, gl, date, debit, credit) => ({ id, entry_id: entry, project_id: P, lease_id: lease, tenant_id: `t-${lease}`, gl_account_id: gl, entry_date: date, debit, credit, deleted_at: null });
  const lines = [
    line("1", "e1", "l1", "ar", "2026-09-01", 1000, 0),
    line("2", "e2", "l1", "ar", "2026-10-05", 0, 400),
    line("3", "e3", "l2", "ar", "2026-10-01", 800, 0),
    line("4", "e4", "l2", "ar", "2026-10-03", 0, 800),
    line("5", "e5", "l1", "hap", "2026-10-01", 700, 0),
    line("6", "e6", "l1", "ar", "2026-12-01", 500, 0),
  ];
  const entries = ["e1", "e2", "e3", "e4", "e5", "e6"].map((id, i) => ({ id, entry_date: lines[i].entry_date, source_type: ["charge", "payment", "charge", "payment", "charge", "charge"][i], status: "posted" }));
  const balances = [
    { project_id: P, dimension: "lease", dimension_id: "l1", receivable: 1100 },
    { project_id: P, dimension: "lease", dimension_id: "l2", receivable: 0 },
  ];
  const sb = fakeDb({ ledger_party_balances: balances, ledger_lines: lines, ledger_entries: entries });
  const rows = await delinquentAging(sb, scope, accounts, "2026-11-08");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].leaseId, "l1");
  assert.equal(rows[0].balance, 600); // HAP and the December charge stay out
  const expected = receivableAging(
    lines.filter((l) => l.lease_id === "l1" && l.gl_account_id === "ar").map((l) => ({ id: l.id, entryId: l.entry_id, leaseId: l.lease_id, tenantId: l.tenant_id, glAccountId: l.gl_account_id, date: l.entry_date, debit: l.debit, credit: l.credit, entry: { sourceType: entries.find((e) => e.id === l.entry_id).source_type } })),
    accounts,
    "2026-11-08",
  );
  assert.equal(rows[0].balance, expected[0].balance);
  assert.equal(rows[0].b61, expected[0].b61);
});
