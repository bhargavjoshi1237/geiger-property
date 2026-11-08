import { test } from "node:test";
import assert from "node:assert/strict";
import { createSandboxClient } from "./sandbox_client";
import { TENANTS } from "./seed/core";
import { arMonthlyRows, partyReceivables, sumArMonths } from "@/lib/ledger/ar_reads";

// CORE-07: the landing playground has its own fixture ledger, so its balances and rent trend read realistic numbers
// from the in-memory store (never 0, never the live ledger).

const sb = createSandboxClient(() => null);
const all = (q) => q;

test("playground fixture ledger: balanced entries, and the late tenants owe their sample balances", async () => {
  const { data: lines } = await sb.from("ledger_lines").select("*");
  const per = new Map();
  for (const l of lines) per.set(l.entry_id, Math.round(((per.get(l.entry_id) || 0) + l.debit - l.credit) * 100) / 100);
  assert.ok(per.size > 50);
  assert.deepEqual([...per.values()].filter((v) => v !== 0), []);
  const byTenant = await partyReceivables(sb, all, "tenant");
  const owed = Object.fromEntries(TENANTS.filter((t) => byTenant.get(t.id) > 0).map((t) => [t.name, byTenant.get(t.id)]));
  assert.deepEqual(owed, { "Omar Haddad": 1450, "Marcus Johnson": 2150, "Liam O'Connor": 650 });
});

test("playground views: ledger_ar_monthly sums to the party balances and the trend is not empty", async () => {
  const rows = await arMonthlyRows(sb, all, {});
  const months = sumArMonths(rows);
  assert.ok(months.size >= 2);
  for (const b of months.values()) assert.ok(b.billed > 0 && b.collected > 0);
  const byLease = await partyReceivables(sb, all, "lease");
  const net = new Map();
  for (const r of rows) net.set(r.leaseId, Math.round(((net.get(r.leaseId) || 0) + r.net) * 100) / 100);
  for (const [id, b] of byLease) assert.equal(net.get(id) || 0, b);
});
