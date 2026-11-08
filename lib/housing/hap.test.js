import { test } from "node:test";
import assert from "node:assert/strict";

import {
  frozenHapRate,
  hapAdjKey,
  hapKey,
  leaseAssistance,
  parseHapKey,
  rentSplit,
  splitPeriod,
  summarizeHapEntries,
  tenantShare,
} from "./hap";
import { billingWindow, rentForPeriod } from "@/lib/billing/rent";
import { summarizeRentEntries } from "@/lib/billing/keys";
import { computeLateFee } from "@/lib/policies";
import {
  BUILDERS,
  buildDepositReturn,
  buildHapAdjustment,
  buildHapCharge,
  buildPayment,
  indexAccounts,
  openItems,
  runningLedger,
  summarize,
  toRpcArgs,
} from "@/lib/ledger/postings";
import { CARRY_META, renewalLeaseRow } from "@/lib/leasing/renewal_terms";

const voucher = (over = {}) => ({
  id: "L1",
  status: "Active",
  rent: 1500,
  term_start: "2026-01-01",
  metadata: { subsidized: true, subsidyProgram: "Metro HA", hapAmount: 1100 },
  ...over,
});
const step = (effective_date, amount) => ({ id: `s-${effective_date}`, lease_id: "L1", effective_date, amount, status: "active" });
const ACTUAL = { prorationMethod: "actual", prorateFirstMonth: true, rentDueDay: "1" };
const periodFor = (lease, steps, period, policies = ACTUAL) => rentForPeriod(steps, period, billingWindow(lease), policies);
const terms = (...list) => new Map([["L1", list]]);

test("rentSplit: tenant pays rent less the assistance portion", () => {
  assert.deepEqual(rentSplit(voucher(), null, "2026-11-01"), {
    total: 1500,
    tenant: 400,
    hap: 1100,
    source: "lease",
    contractId: null,
    termId: null,
    abated: false,
  });
  assert.equal(tenantShare(voucher(), new Map(), "2026-11-01"), 400);
});

test("rentSplit: blank HAP or subsidy off behaves as full rent; HAP at or above rent leaves the tenant nothing", () => {
  assert.equal(rentSplit(voucher({ metadata: { subsidized: false, hapAmount: 1100 } }), null, "2026-11-01").tenant, 1500);
  assert.equal(rentSplit(voucher({ metadata: { subsidized: true, hapAmount: "" } }), null, "2026-11-01").tenant, 1500);
  assert.equal(rentSplit({ id: "X", rent: 1500 }, null, "2026-11-01").hap, 0);
  const over = rentSplit(voucher({ metadata: { subsidized: true, hapAmount: 1800 } }), null, "2026-11-01");
  assert.deepEqual([over.tenant, over.hap], [0, 1500]);
});

test("leaseAssistance reads a snake row, a camel view model or a live form item", () => {
  assert.deepEqual(leaseAssistance(voucher()), { subsidized: true, program: "Metro HA", hapAmount: 1100 });
  assert.equal(leaseAssistance({ subsidized: true, hapAmount: "950.5", metadata: {} }).hapAmount, 950.5);
  assert.equal(leaseAssistance({ subsidized: "true", hapAmount: 700 }).hapAmount, 700);
  assert.equal(leaseAssistance(null).hapAmount, 0);
});

test("late fees: a 5% percent fee is assessed on the tenant's share (20, not 75)", () => {
  const policies = { lateFeeType: "percent", lateFeeAmount: 5, graceDays: 5 };
  assert.equal(computeLateFee(policies, tenantShare(voucher(), null, "2026-11-10"), 9), 20);
  assert.equal(computeLateFee(policies, tenantShare(voucher({ metadata: {} }), null, "2026-11-10"), 9), 75);
});

test("splitPeriod: a full month bills 400 to the tenant and 1,100 to the housing authority", () => {
  const lease = voucher();
  const split = splitPeriod(lease, periodFor(lease, [step("2026-01-01", 1500)], "2026-11"), "2026-11");
  assert.deepEqual([split.total, split.tenant, split.hap, split.source, split.hapRate], [1500, 400, 1100, "lease", 1100]);
});

test("splitPeriod rounding: a prorated first month prorates HAP over the same days and the parts sum to the rent", () => {
  const lease = voucher({ rent: 1000, term_start: "2026-11-15", metadata: { subsidized: true, hapAmount: 333.33 } });
  const computed = periodFor(lease, [step("2026-11-15", 1000)], "2026-11");
  const split = splitPeriod(lease, computed, "2026-11");
  assert.deepEqual([computed.total, split.hap, split.tenant], [533.33, 177.78, 355.55]);
  assert.equal(Math.round((split.hap + split.tenant) * 100), Math.round(split.total * 100));
  const thirty = periodFor(lease, [step("2026-11-15", 1000)], "2026-11", { ...ACTUAL, prorationMethod: "thirty" });
  const s30 = splitPeriod(lease, thirty, "2026-11", { method: "thirty" });
  assert.deepEqual([thirty.total, s30.hap, s30.tenant], [533.33, 177.78, 355.55]);
});

test("splitPeriod: a mid-month rent change caps HAP at each range's rent", () => {
  const lease = voucher({ metadata: { subsidized: true, hapAmount: 1100 } });
  const computed = periodFor(lease, [step("2026-01-01", 1000), step("2026-06-16", 1200)], "2026-06");
  const split = splitPeriod(lease, computed, "2026-06");
  assert.deepEqual([computed.total, split.hap, split.tenant], [1100, 1050, 50]);
  assert.deepEqual(split.segments.map((s) => [s.hap, s.tenant]), [[500, 0], [550, 50]]);
});

test("splitPeriod: a mid-month HAP change (contract terms) splits the month by day", () => {
  const lease = voucher();
  const index = terms(
    { id: "t1", contractId: "c1", effectiveDate: "2026-01-01", hapAmount: 1100 },
    { id: "t2", contractId: "c1", effectiveDate: "2026-06-16", hapAmount: 1250 },
  );
  const split = splitPeriod(lease, periodFor(lease, [step("2026-01-01", 1500)], "2026-06"), "2026-06", { hapIndex: index });
  assert.deepEqual([split.hap, split.tenant, split.source, split.contractId], [1175, 325, "contract", "c1"]);
  const may = splitPeriod(lease, periodFor(lease, [step("2026-01-01", 1500)], "2026-05"), "2026-05", { hapIndex: index });
  assert.deepEqual([may.hap, may.tenant], [1100, 400]);
  assert.deepEqual(rentSplit(lease, index, "2026-06-20"), { total: 1500, tenant: 250, hap: 1250, source: "contract", contractId: "c1", termId: "t2", abated: false });
  // A frozen lease-level rate never overrides contract terms.
  assert.equal(splitPeriod(lease, periodFor(lease, [step("2026-01-01", 1500)], "2026-05"), "2026-05", { hapIndex: index, frozenRate: 0 }).hap, 1100);
});

test("splitPeriod rounding: per-day HAP pieces that round up never bill more than the rent", () => {
  const lease = voucher({ rent: 1000 });
  const index = terms(
    { id: "a", effectiveDate: "2026-07-01", hapAmount: 1200 },
    { id: "b", effectiveDate: "2026-07-03", hapAmount: 1300 },
    { id: "c", effectiveDate: "2026-07-10", hapAmount: 1400 },
  );
  // 2 + 7 + 22 days of 1,000 round to 64.52 + 225.81 + 709.68 = 1,000.01; capped at the rent.
  const split = splitPeriod(lease, periodFor(lease, [step("2026-01-01", 1000)], "2026-07"), "2026-07", { hapIndex: index });
  assert.deepEqual([split.total, split.hap, split.tenant], [1000, 1000, 0]);
});

test("splitPeriod: a contract that ends mid-month stops HAP the day after", () => {
  const lease = voucher();
  const index = terms({ id: "t1", effectiveDate: "2026-01-01", endDate: "2026-09-15", hapAmount: 1100 });
  const split = splitPeriod(lease, periodFor(lease, [step("2026-01-01", 1500)], "2026-09"), "2026-09", { hapIndex: index });
  assert.deepEqual([split.hap, split.tenant], [550, 950]);
});

test("splitPeriod: a frozen rate keeps a billed period's split when the lease field changes", () => {
  const lease = voucher({ metadata: { subsidized: true, hapAmount: 1200 } });
  const computed = periodFor(lease, [step("2026-01-01", 1500)], "2026-11");
  assert.equal(splitPeriod(lease, computed, "2026-11").hap, 1200);
  assert.equal(splitPeriod(lease, computed, "2026-11", { frozenRate: 1100 }).hap, 1100);
  assert.equal(splitPeriod(lease, computed, "2026-11", { frozenRate: 0 }).tenant, 1500);
});

test("frozenHapRate: latest recorded rate wins; billed before splits → 0; unbilled → null", () => {
  const sum = (hapRate, hapRateAt, n = 1) => ({ hapRate, hapRateAt, entries: Array.from({ length: n }, (_, i) => ({ id: i })) });
  assert.equal(frozenHapRate(sum(1100, "2026-11-01T10:00:00Z"), sum(1200, "2026-11-02T10:00:00Z")), 1200);
  assert.equal(frozenHapRate(sum(0, "2026-11-03T10:00:00Z"), sum(1100, "2026-11-02T10:00:00Z")), 0);
  assert.equal(frozenHapRate(sum(null, "", 1), sum(null, "", 0)), 0);
  assert.equal(frozenHapRate(sum(null, "", 0), sum(null, "", 0)), null);
});

test("HAP keys and the billed-HAP summary", () => {
  assert.equal(hapKey("L", "2026-11"), "hap:L:2026-11");
  assert.equal(hapAdjKey("L", "2026-11", 2), "hap-adj:L:2026-11:2");
  assert.deepEqual(parseHapKey("hap:L:2026-11"), { kind: "hap", owner: "L", period: "2026-11" });
  assert.deepEqual(parseHapKey("hap-adj:L:2026-11:3"), { kind: "adj", owner: "L", period: "2026-11", n: 3 });
  assert.equal(parseHapKey("hapr:R:L"), null);
  const e = (id, key, total, extra = {}) => ({ id, lease_id: "L", idempotency_key: key, total, entry_date: "2026-11-01", status: "posted", source_type: "charge", created_at: `2026-11-0${id.length}T00:00:00Z`, ...extra });
  const rows = [
    e("h", "hap:L:2026-11", 1100, { hap_rate: 1100 }),
    e("ad", "hap-adj:L:2026-11:1", 100, { source_type: "credit", hap_rate: 1000 }),
    e("vvv", "hap-adj:L:2026-11:2", 50, { status: "void", hap_rate: 9 }),
    e("rrrr", "hapr:R:L", 1000),
  ];
  const nov = summarizeHapEntries(rows, ["L"]).get("L").get("2026-11");
  assert.deepEqual([nov.total, nov.maxAdj, nov.mainKeyTaken, nov.hapRate, nov.charges.map((c) => c.id)], [1000, 2, true, 1000, ["h"]]);
});

test("summarizeRentEntries records the rate a period was split at", () => {
  const rows = [{ id: "r", lease_id: "L", idempotency_key: "rent:L:2026-11", total: 400, entry_date: "2026-11-01", status: "posted", source_type: "charge", created_at: "2026-11-01T00:00:00Z", hap_rate: 1100 }];
  const nov = summarizeRentEntries(rows, ["L"]).get("L").get("2026-11");
  assert.deepEqual([nov.total, nov.hapRate], [400, 1100]);
});

const ACCT = indexAccounts([
  { id: "ar", systemKey: "accounts_receivable", subtype: "receivable", accountType: "Asset", number: "1200" },
  { id: "hap", systemKey: "subsidy_receivable", subtype: "subsidy_receivable", accountType: "Asset", number: "1220" },
  { id: "rent", systemKey: "rent_income", subtype: "income", accountType: "Income", number: "4000" },
  { id: "trust", systemKey: "trust_cash", subtype: "cash", accountType: "Asset", isTrust: true, number: "1010" },
  { id: "dep", systemKey: "deposit_cash", subtype: "cash", accountType: "Asset", isTrust: true, number: "1020" },
  { id: "sd", systemKey: "security_deposits", subtype: "deposits", accountType: "Liability", isTrust: true, number: "2100" },
]);

test("buildHapCharge: Dr 1220 / Cr 4000 with the lease but no tenant or owner", () => {
  const built = buildHapCharge({ leaseId: "L", tenantId: "T", ownerId: "O", unitId: "U", propertyId: "P", amount: 1100, date: "2026-11-01", period: "2026-11" }, ACCT);
  assert.deepEqual(built.lines.map((l) => [l.glAccountId, l.debit || 0, l.credit || 0, l.tenantId]), [["hap", 1100, 0, null], ["rent", 0, 1100, null]]);
  assert.equal(built.entry.tenantId, undefined);
  assert.deepEqual([built.entry.leaseId, built.entry.sourceType, built.entry.metadata.payer, built.entry.metadata.period], ["L", "charge", "housing_authority", "2026-11"]);
  const rpc = toRpcArgs(built, { projectId: "p" });
  assert.deepEqual([rpc.p_entry.tenant_id, rpc.p_entry.owner_id, rpc.p_entry.lease_id], [null, null, "L"]);
  assert.ok(rpc.p_lines.every((l) => l.tenant_id === null));
  assert.equal(BUILDERS.hap_charge, buildHapCharge);
  assert.match(buildHapCharge({ leaseId: "L", amount: 5 }, indexAccounts([])).error, /Housing Assistance Receivable/);
});

test("buildHapAdjustment: a downward HAP true-up credits 1220 against the HAP charge", () => {
  const built = buildHapAdjustment({ leaseId: "L", tenantId: "T", amount: -100, allocations: [{ entryId: "h", amount: 100 }], date: "2026-11-05" }, ACCT);
  assert.deepEqual(built.lines.map((l) => [l.glAccountId, l.debit || 0, l.credit || 0, l.appliesToEntryId || "", l.tenantId]), [["rent", 100, 0, "", null], ["hap", 0, 100, "h", null]]);
  assert.equal(built.entry.sourceType, "credit");
  assert.equal(buildHapAdjustment({ leaseId: "L", amount: 50 }, ACCT).lines[0].glAccountId, "hap");
});

test("a housing-authority payment settles 1220 and leaves tenant AR alone; the deposit return never touches 1220", () => {
  const pay = buildPayment({ leaseId: "L", amount: 1100, arKey: "subsidy_receivable", allocations: [{ entryId: "h", amount: 1100 }] }, ACCT);
  assert.deepEqual(pay.lines.map((l) => [l.glAccountId, l.debit || 0, l.credit || 0]), [["trust", 1100, 0], ["hap", 0, 1100]]);
  const tenantPay = buildPayment({ leaseId: "L", amount: 400 }, ACCT);
  assert.equal(tenantPay.lines[1].glAccountId, "ar");
  const ret = buildDepositReturn({ leaseId: "L", appliedToCharges: 400, allocations: [{ entryId: "r", amount: 400 }] }, ACCT);
  assert.ok(ret.lines.every((l) => l.glAccountId !== "hap"));
});

test("balances: tenant AR and the housing authority's receivable stay apart", () => {
  const entry = { status: "posted" };
  const lines = [
    { entryId: "r", glAccountId: "ar", debit: 400, credit: 0, date: "2026-11-01", entry: { ...entry, sourceType: "charge" } },
    { entryId: "r", glAccountId: "rent", debit: 0, credit: 400, date: "2026-11-01", entry: { ...entry, sourceType: "charge" } },
    { entryId: "h", glAccountId: "hap", debit: 1100, credit: 0, date: "2026-11-01", entry: { ...entry, sourceType: "charge" } },
    { entryId: "h", glAccountId: "rent", debit: 0, credit: 1100, date: "2026-11-01", entry: { ...entry, sourceType: "charge" } },
    { entryId: "p", glAccountId: "trust", debit: 600, credit: 0, date: "2026-11-03", entry: { ...entry, sourceType: "payment" } },
    { entryId: "p", glAccountId: "hap", debit: 0, credit: 600, date: "2026-11-03", appliesToEntryId: "h", entry: { ...entry, sourceType: "payment" } },
  ];
  const s = summarize(lines, ACCT);
  assert.deepEqual([s.receivable, s.subsidyReceivable, s.income], [400, 500, 1500]);
  assert.deepEqual(openItems(lines, ACCT, "receivable").map((i) => [i.entryId, i.open]), [["r", 400]]);
  assert.deepEqual(openItems(lines, ACCT, "subsidy_receivable").map((i) => [i.entryId, i.open]), [["h", 500]]);
  assert.equal(runningLedger("lease", lines, ACCT).at(-1).balance, 400);
  assert.equal(runningLedger("lease_subsidy", lines, ACCT).at(-1).balance, 500);
});

test("renewals carry the voucher fields to the new lease", () => {
  for (const k of ["subsidized", "subsidyProgram", "hapAmount"]) assert.ok(CARRY_META.includes(k));
  const row = renewalLeaseRow({ id: "old", name: "A-1", rent: 1500, metadata: { subsidized: true, subsidyProgram: "Metro HA", hapAmount: 1100 } }, { id: "rn", new_start: "2027-01-01", proposed_rent: 1550 }, { id: "new" });
  assert.deepEqual([row.metadata.subsidized, row.metadata.subsidyProgram, row.metadata.hapAmount], [true, "Metro HA", 1100]);
});
