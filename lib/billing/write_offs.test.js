import { test } from "node:test";
import assert from "node:assert/strict";

import { buildCharge, buildCreditApplication, buildPayment, buildRecovery, buildWriteOff, indexAccounts, normalizeEntry, normalizeGlAccount, normalizeLine, openItems, recoveryKey, summarize, toRpcArgs, writeOffKey } from "@/lib/ledger/postings";
import { referenceTotals, totalsRow } from "@/lib/reports/aggregates";
import { receivableAging } from "@/lib/reports/ledger_math";
import {
  collectionsOf,
  itemLabel,
  nextSeq,
  openAfterCredits,
  planRecovery,
  planWriteOff,
  reasonLabel,
  writeOffReasonProblem,
  writtenOffLedger,
  writtenOffOutstanding,
} from "./write_off_rules";

// CORE-15: write-off and recovery builders, the planning rules, the ledger they leave (AR, aging, bad debt, the Written off view) and how cash basis (CORE-44) reads them.

const PROJECT = "proj-wo";
const ACCOUNTS = [
  ["trust", "1010", "Trust Cash", "Asset", "cash", "trust_cash"],
  ["ar", "1200", "Accounts Receivable", "Asset", "receivable", "accounts_receivable"],
  ["rent", "4000", "Rental Income", "Income", "income", "rent_income"],
  ["late", "4010", "Late Fee Income", "Income", "income", "late_fee_income"],
  ["baddebt", "5800", "Bad Debt", "Expense", "expense", "bad_debt"],
].map(([id, number, name, account_type, subtype, system_key]) => ({ id, project_id: PROJECT, number, name, account_type, subtype, system_key, is_trust: id === "trust", deleted_at: null }));
const ACCT = indexAccounts(ACCOUNTS.map(normalizeGlAccount));
const DIMS = { leaseId: "lease-1", tenantId: "tenant-1", unitId: "unit-1", propertyId: "prop-1" };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// A tiny ledger: post a built entry as raw rows (what ledger_post would store), void one as ledger_void does.
function ledger() {
  const entries = [];
  const lines = [];
  const post = (id, built, extra = {}) => {
    assert.ok(!built.error, built.error);
    const { p_entry: e, p_lines: ls } = toRpcArgs({ ...built, entry: { ...built.entry, id } }, { projectId: PROJECT });
    entries.push({ ...e, id, status: "posted", reversal_of: null, deleted_at: null, created_at: `${e.entry_date}T00:00:00Z`, ...extra });
    ls.forEach((l, i) => lines.push({ ...l, id: `${id}-${i}`, entry_id: id, project_id: PROJECT, entry_date: e.entry_date, line_no: i, property_id: l.property_id ?? e.property_id, lease_id: l.lease_id ?? e.lease_id, tenant_id: l.tenant_id ?? e.tenant_id, unit_id: l.unit_id ?? e.unit_id, deleted_at: null }));
    return id;
  };
  const voidOf = (id, date) => {
    const e = entries.find((x) => x.id === id);
    e.status = "void";
    const rid = `${id}-void`;
    entries.push({ ...e, id: rid, entry_date: date, status: "posted", reversal_of: id, metadata: { voidOf: id } });
    for (const l of lines.filter((x) => x.entry_id === id)) lines.push({ ...l, id: `${l.id}-v`, entry_id: rid, entry_date: date, debit: l.credit, credit: l.debit, applies_to_entry_id: l.applies_to_entry_id || id });
    return rid;
  };
  // Normalized lines with their entries (what the browser layer and the reports read), through a date.
  const view = (to = "9999-12-31") => {
    const byId = new Map(entries.map((e) => [e.id, normalizeEntry(e)]));
    return lines.filter((l) => l.entry_date <= to).map((l) => ({ ...normalizeLine(l), entry: byId.get(l.entry_id) }));
  };
  return { entries, lines, post, voidOf, view };
}

// The acceptance scenario: rent 400 + a late fee 300 written off (700), then a 300 payment recorded as a recovery.
function scenario() {
  const L = ledger();
  const rent = L.post("e-rent", buildCharge({ ...DIMS, amount: 400, date: "2026-11-01", memo: "Rent · November 2026" }, ACCT));
  const late = L.post("e-late", buildCharge({ ...DIMS, amount: 300, date: "2026-11-10", sourceType: "late_fee", memo: "Late fee" }, ACCT));
  const wo = L.post(
    "e-wo",
    buildWriteOff({ ...DIMS, writeOffId: "wo-1", date: "2026-12-05", reason: "skip", items: [{ entryId: rent, amount: 400, date: "2026-11-01", memo: "Rent · November 2026", kind: "rent", period: "2026-11" }, { entryId: late, amount: 300, date: "2026-11-10", memo: "Late fee" }] }, ACCT),
  );
  const pay = L.post("e-pay", buildPayment({ ...DIMS, amount: 300, date: "2027-01-10", cashGlAccountId: "trust" }, ACCT));
  const rec = L.post("e-rec", buildRecovery({ ...DIMS, paymentEntryId: pay, date: "2027-01-10", items: [{ entryId: rent, amount: 300, date: "2026-11-01", memo: "Rent · November 2026", applySeq: 1 }] }, ACCT));
  const app = L.post("e-app", buildCreditApplication({ ...DIMS, creditEntryId: pay, itemEntryId: rent, amount: 300, date: "2027-01-10" }, ACCT));
  return { L, rent, late, wo, pay, rec, app };
}

const lineText = (built) => built.lines.map((l) => `${l.debit ? "Dr" : "Cr"} ${ACCT.byId.get(l.glAccountId).number} ${r2(l.debit || l.credit).toFixed(2)}${l.appliesToEntryId ? ` → ${l.appliesToEntryId}` : ""}`);

test("buildWriteOff: Dr 5800 the total / Cr AR applied to each item, keyed wo:<id>, source write_off", () => {
  const built = buildWriteOff({ ...DIMS, writeOffId: "wo-1", date: "2026-12-05", reason: "uncollectible", items: [{ entryId: "a", amount: 400 }, { entryId: "b", amount: 300 }] }, ACCT);
  assert.deepEqual(lineText(built), ["Dr 5800 700.00", "Cr 1200 400.00 → a", "Cr 1200 300.00 → b"]);
  assert.equal(built.entry.sourceType, "write_off");
  assert.equal(built.entry.idempotencyKey, writeOffKey("wo-1"));
  assert.equal(built.entry.idempotencyKey, "wo:wo-1");
  assert.equal(built.entry.propertyId, "prop-1", "the bad debt carries the lease's property");
  assert.deepEqual(built.lines[0].metadata, { writeOff: "wo-1" }, "the 5800 line is tagged so its void nets out");
  assert.equal(built.entry.metadata.reason, "uncollectible");
  assert.equal(built.entry.metadata.items.length, 2);
  assert.match(buildWriteOff({ writeOffId: "x", items: [] }, ACCT).error, /at least one/);
  assert.match(buildWriteOff({ writeOffId: "x", items: [{ entryId: "a", amount: 0 }] }, ACCT).error, /above zero/);
  assert.match(buildWriteOff({ writeOffId: "x", items: [{ entryId: "a", amount: 1 }, { entryId: "a", amount: 2 }] }, ACCT).error, /twice/);
  assert.match(buildWriteOff({ items: [{ entryId: "a", amount: 1 }] }, ACCT).error, /id/);
  assert.match(buildWriteOff({ writeOffId: "x", items: [{ entryId: "a", amount: 1 }] }, indexAccounts(ACCOUNTS.filter((a) => a.id !== "baddebt").map(normalizeGlAccount))).error, /Bad Debt/);
});

test("buildRecovery: Dr AR reinstating each item / Cr 5800 tagged { recovery }, keyed wo-recover:<payment>[:n]", () => {
  const built = buildRecovery({ ...DIMS, paymentEntryId: "pay", date: "2027-01-10", items: [{ entryId: "a", amount: 200, applySeq: 1 }, { entryId: "b", amount: 100, applySeq: 2 }] }, ACCT);
  assert.deepEqual(lineText(built), ["Dr 1200 200.00 → a", "Dr 1200 100.00 → b", "Cr 5800 300.00"]);
  assert.equal(built.entry.sourceType, "write_off");
  assert.equal(built.entry.idempotencyKey, "wo-recover:pay");
  assert.deepEqual(built.lines[2].metadata, { recovery: "pay" });
  assert.deepEqual(built.entry.metadata.items.map((i) => i.applySeq), [1, 2]);
  assert.equal(buildRecovery({ ...DIMS, paymentEntryId: "pay", seq: 2, items: [{ entryId: "a", amount: 1 }] }, ACCT).entry.idempotencyKey, "wo-recover:pay:2");
  assert.equal(recoveryKey("pay", 3), "wo-recover:pay:3");
  assert.match(buildRecovery({ items: [{ entryId: "a", amount: 1 }] }, ACCT).error, /payment/);
});

test("planWriteOff: open items only, amounts up to what's open, everything with 'all'", () => {
  const open = [
    { entryId: "b", date: "2026-11-10", open: 300, kind: "late_fee", period: "2026-11" },
    { entryId: "a", date: "2026-11-01", open: 400, kind: "rent", period: "2026-11", memo: "Rent" },
  ];
  const all = planWriteOff(open, "all");
  assert.equal(all.total, 700);
  assert.deepEqual(all.items.map((i) => i.entryId), ["a", "b"], "oldest first");
  assert.equal(all.items[0].memo, "Rent · November 2026");
  assert.deepEqual(planWriteOff(open, [{ entryId: "a", amount: 150 }]).items.map((i) => i.amount), [150], "part of a charge");
  assert.equal(planWriteOff(open, [{ entryId: "a" }]).total, 400, "no amount = all that's open");
  assert.match(planWriteOff(open, [{ entryId: "a", amount: 400.01 }]).error, /only 400.00 open/);
  assert.match(planWriteOff(open, [{ entryId: "zz" }]).error, /isn't open/);
  assert.match(planWriteOff(open, [{ entryId: "a" }, { entryId: "a" }]).error, /twice/);
  assert.match(planWriteOff(open, [{ entryId: "a", amount: -5 }]).error, /above zero/);
  assert.match(planWriteOff([], "all").error, /Nothing/);
  assert.match(planWriteOff(open, []).error, /at least one/);
});

test("openAfterCredits: unapplied credits pay the oldest charges first (CORE-13's planner)", () => {
  const res = openAfterCredits(
    [
      { entryId: "a", date: "2026-11-01", open: 400 },
      { entryId: "b", date: "2026-11-10", open: 300 },
    ],
    [{ entryId: "c", amount: 450, date: "2026-10-01" }],
  );
  assert.equal(res.applied, 450);
  assert.deepEqual(res.items.map((i) => [i.entryId, i.open, i.openBefore]), [["b", 250, 300]]);
});

test("reasons: collections guidance and the note an Other write-off needs", () => {
  assert.equal(collectionsOf("uncollectible"), "eligible");
  assert.equal(collectionsOf("skip"), "eligible");
  assert.equal(collectionsOf("bankruptcy"), "stayed");
  assert.equal(collectionsOf("settlement"), "settled");
  assert.equal(collectionsOf("deceased"), "estate");
  assert.equal(reasonLabel("skip"), "Skip");
  assert.equal(reasonLabel(""), "Manual credit");
  assert.equal(writeOffReasonProblem("skip", ""), "");
  assert.match(writeOffReasonProblem("other", " "), /note/);
  assert.match(writeOffReasonProblem("nope", ""), /Pick a reason/);
  assert.equal(itemLabel({ kind: "late_fee", period: "2026-11" }), "Late fee · November 2026");
  assert.equal(itemLabel({ kind: "charge", memo: "Parking" }), "Parking");
});

test("planRecovery: oldest written-off item first, capped by the payment's unapplied credit and what's written off", () => {
  const outstanding = [
    { entryId: "b", amount: 300, date: "2026-11-10" },
    { entryId: "a", amount: 400, date: "2026-11-01" },
  ];
  assert.deepEqual(planRecovery({ outstanding, unapplied: 500 }).items.map((i) => [i.entryId, i.amount]), [["a", 400], ["b", 100]]);
  assert.equal(planRecovery({ outstanding, unapplied: 300 }).amount, 300);
  assert.equal(planRecovery({ outstanding, unapplied: 900 }).amount, 700, "never more than is written off");
  assert.deepEqual(planRecovery({ outstanding, unapplied: 900, amount: 50 }).items, [{ entryId: "a", amount: 50, date: "2026-11-01", memo: "" }]);
  assert.match(planRecovery({ outstanding, unapplied: 300, amount: 301 }).error, /At most 300.00/);
  assert.match(planRecovery({ outstanding, unapplied: 0 }).error, /already applied/);
  assert.match(planRecovery({ outstanding: [], unapplied: 300 }).error, /Nothing on this lease is written off/);
  assert.equal(nextSeq([], "wo-recover:p"), 1);
  assert.equal(nextSeq(["wo-recover:p"], "wo-recover:p"), 2);
  assert.equal(nextSeq(["wo-recover:p", "wo-recover:p:2"], "wo-recover:p"), 3);
});

test("acceptance: write off 700 → AR 0 and off Delinquency; a 300 recovery → Dr 1200 300 / Cr 5800 300 + the application; 5800 = 400, AR = 0", () => {
  const { L, rent, late, pay } = scenario();
  const before = L.view("2026-12-04");
  assert.equal(summarize(before, ACCT).receivable, 700);
  assert.equal(receivableAging(before, ACCT, "2026-12-04").length, 1, "owing before the write-off");
  const afterWo = L.view("2026-12-31");
  const s1 = summarize(afterWo, ACCT);
  assert.deepEqual([s1.receivable, s1.byAccount.find((a) => a.number === "5800").balance], [0, 700]);
  assert.deepEqual(openItems(afterWo, ACCT), [], "nothing open");
  assert.equal(receivableAging(afterWo, ACCT, "2026-12-31").length, 0, "Delinquency excludes the lease");
  assert.equal(summarize(L.view("2027-01-09"), ACCT).receivable, 0);
  const all = L.view();
  const s2 = summarize(all, ACCT);
  assert.deepEqual([s2.receivable, s2.byAccount.find((a) => a.number === "5800").balance], [0, 400], "net 5800 = 400, AR = 0");
  assert.deepEqual(openItems(all, ACCT), []);
  assert.equal(receivableAging(all, ACCT, "2027-01-31").length, 0);
  // Outstanding written off per item after the recovery: the rent has 100 left, the late fee 300.
  const woLines = L.lines.filter((l) => ["e-wo", "e-rec"].includes(l.entry_id) && l.gl_account_id === "ar");
  assert.deepEqual([...writtenOffOutstanding(woLines)], [[rent, 100], [late, 300]]);
  // Every entry balances.
  for (const e of L.entries) {
    const ls = L.lines.filter((l) => l.entry_id === e.id);
    assert.equal(r2(ls.reduce((s, l) => s + l.debit, 0)), r2(ls.reduce((s, l) => s + l.credit, 0)), e.id);
  }
  assert.ok(pay);
});

test("written-off ledger (Delinquency › Written off): written off, recovered and net per lease; a voided recovery drops out", () => {
  const { L } = scenario();
  const { rows, recoveries } = writtenOffLedger(L.view(), ACCT, { asOf: "2027-01-31" });
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.deepEqual([r.leaseId, r.writtenOff, r.recovered, r.net, r.reason, r.collections, r.delinquentSince, r.lastWrittenOff, r.items], ["lease-1", 700, 300, 400, "skip", "eligible", "2026-11-01", "2026-12-05", 2]);
  assert.deepEqual(recoveries.map((x) => [x.amount, x.paymentEntryId]), [[300, "e-pay"]]);
  assert.equal(writtenOffLedger(L.view(), ACCT, { asOf: "2026-12-31" }).rows[0].recovered, 0, "as of a date before the recovery");
  L.voidOf("e-rec", "2027-01-15");
  const after = writtenOffLedger(L.view(), ACCT, { asOf: "2027-01-31" });
  assert.deepEqual([after.rows[0].writtenOff, after.rows[0].recovered, after.recoveries.length], [700, 0, 0]);
  L.voidOf("e-wo", "2027-01-16");
  assert.equal(writtenOffLedger(L.view(), ACCT, { asOf: "2027-01-31" }).rows.length, 0, "a voided write-off nets to nothing");
});

test("cash basis (CORE-44): a write-off is never cash; the recovery counts as income on the charge it reinstated, when the payment applies", () => {
  const { L } = scenario();
  const db = { entries: L.entries, lines: L.lines, accounts: ACCOUNTS };
  const rows = (from, to) => referenceTotals(db, "ledger_cash_basis_totals", { p_project_id: PROJECT, p_from: from, p_to: to, p_grain: "range" }).data.map(totalsRow);
  const on = (rs, acct) => r2(rs.filter((r) => r.glAccountId === acct).reduce((s, r) => s + r.credit - r.debit, 0));
  const outside = (rs) => r2(rs.filter((r) => r.glAccountId === "ar").reduce((s, r) => s + r.debit - r.credit, 0));
  const all = rows(null, null);
  assert.equal(on(all, "baddebt"), 0, "neither the write-off nor the recovery's reinstatement moves 5800 on a cash basis");
  assert.equal(on(all, "rent"), 300, "the 300 recovered is rent collected");
  assert.equal(on(all, "late"), 0, "the late fee was never paid");
  assert.deepEqual([on(rows("2026-11-01", "2026-12-31"), "rent"), on(rows("2026-11-01", "2026-12-31"), "baddebt")], [0, 0], "charging and writing off move nothing");
  const jan = rows("2027-01-01", "2027-01-31");
  assert.deepEqual([on(jan, "rent"), outside(jan)], [300, 0], "the payment and its application net outside income; the rent counts in January");
  // Cash net = accrual net − Δ receivables + outside: accrual 700 income − 400 bad debt = 300, receivables back to 0.
  const accrual = referenceTotals(db, "ledger_period_totals", { p_project_id: PROJECT, p_from: null, p_to: null, p_grain: "range" }).data.map(totalsRow);
  const net = (rs) => r2(rs.filter((r) => ["rent", "late"].includes(r.glAccountId)).reduce((s, r) => s + r.credit - r.debit, 0) - rs.filter((r) => r.glAccountId === "baddebt").reduce((s, r) => s + r.debit - r.credit, 0));
  const dAr = r2(accrual.filter((r) => r.glAccountId === "ar").reduce((s, r) => s + r.debit - r.credit, 0));
  assert.deepEqual([net(accrual), dAr, net(all)], [300, 0, 300]);
  assert.equal(r2(net(accrual) - dAr + outside(all)), net(all), "the CORE-44 bridge holds");
});
