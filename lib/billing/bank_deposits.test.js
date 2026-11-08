import { test } from "node:test";
import assert from "node:assert/strict";

import { BUILDERS, buildBankDeposit, indexAccounts, normalizeLine, toRpcArgs } from "@/lib/ledger/postings";
import { cashRegister, groupDepositLines } from "@/lib/reports/ledger_math";
import { bankDepositKey, depositDateProblem, depositLabel, groupReconLines, slipTotals } from "./bank_deposits_math";
import { depositCashIns, settleUndepositedCash, sweepRows } from "./deposits_math";
import { depositSlipHtml } from "./deposit_slip_html";
import { cashRoute } from "./payment_rules";
import { normalizeBillingSettings } from "./settings";

const ACCT = indexAccounts([
  { id: "und", number: "1050", name: "Undeposited Funds", accountType: "Asset", subtype: "cash", isTrust: true, systemKey: "undeposited_funds" },
  { id: "trust", number: "1010", name: "Trust Cash", accountType: "Asset", subtype: "cash", isTrust: true, systemKey: "trust_cash" },
  { id: "dep", number: "1020", name: "Security Deposit Trust Cash", accountType: "Asset", subtype: "cash", isTrust: true, systemKey: "deposit_cash" },
  { id: "ar", number: "1200", name: "Accounts Receivable", accountType: "Asset", subtype: "receivable", systemKey: "accounts_receivable" },
]);
const D = "3f2a9c1e-77aa-4b1c-9d2e-0123456789ab";
const ITEMS = [
  { lineId: "l1", entryId: "p1", amount: 1000, propertyId: "P1", leaseId: "L1", tenantId: "T1", unitId: "U1", memo: "Deposited · Check #101" },
  { lineId: "l2", entryId: "p2", amount: 1200, propertyId: "P1", leaseId: "L2", tenantId: "T2", unitId: "U2" },
  { lineId: "l3", entryId: "p3", amount: 800, propertyId: "P2", leaseId: "L3", tenantId: "T3", unitId: "U3" },
];

test("keys and labels: bankdep:<id>, slip or date label", () => {
  assert.equal(bankDepositKey(D), `bankdep:${D}`);
  assert.equal(depositLabel({ slipNumber: "1042", depositDate: "2026-11-09" }), "Slip 1042");
  assert.equal(depositLabel({ depositDate: "2026-11-09" }), "Deposit · Nov 9, 2026");
});

test("slip totals split cash from checks; a deposit can't predate its payments", () => {
  assert.deepEqual(slipTotals([{ method: "Check", amount: 1000 }, { method: "Cash", amount: 200.5 }, { method: "Money order", amount: 300 }]), { cash: 200.5, checks: 1300, count: 3, total: 1500.5 });
  assert.equal(depositDateProblem("2026-11-09", [{ date: "2026-11-08" }, { date: "2026-11-09" }]), "");
  assert.match(depositDateProblem("2026-11-07", [{ date: "2026-11-08" }]), /before a payment/);
  assert.match(depositDateProblem("", []), /Pick the deposit date/);
});

test("builder: Dr bank once per property / Cr 1050 once per payment on its dims", () => {
  const built = buildBankDeposit({ bankGlAccountId: "trust", bankAccountId: "B1", date: "2026-11-09", slipNumber: "77", sourceId: D, items: ITEMS, metadata: { bankDepositId: D } }, ACCT);
  assert.equal(built.total, 3000);
  const dr = built.lines.filter((l) => l.debit > 0);
  const cr = built.lines.filter((l) => l.credit > 0);
  assert.deepEqual(dr.map((l) => [l.glAccountId, l.propertyId, l.debit, l.bankAccountId]), [["trust", "P1", 2200, "B1"], ["trust", "P2", 800, "B1"]]);
  assert.ok(dr.every((l) => l.leaseId === null && l.tenantId === null && l.unitId === null));
  assert.deepEqual(cr.map((l) => [l.glAccountId, l.credit, l.leaseId, l.tenantId, l.propertyId, l.metadata.itemLineId, l.metadata.paymentEntryId]), [
    ["und", 1000, "L1", "T1", "P1", "l1", "p1"],
    ["und", 1200, "L2", "T2", "P1", "l2", "p2"],
    ["und", 800, "L3", "T3", "P2", "l3", "p3"],
  ]);
  assert.equal(built.entry.sourceType, "bank_deposit");
  assert.equal(built.entry.memo, "Bank deposit · Slip 77 · 3 items");
  assert.equal(built.entry.propertyId, undefined, "two properties: no entry-level property");
  const rpc = toRpcArgs({ ...built, entry: { ...built.entry, idempotencyKey: bankDepositKey(D) } }, { projectId: "proj" });
  assert.equal(rpc.p_entry.idempotency_key, `bankdep:${D}`);
  assert.equal(rpc.p_entry.source_type, "bank_deposit");
  assert.ok(rpc.p_lines.slice(0, 2).every((l) => l.lease_id === null && l.tenant_id === null && l.owner_id === undefined));
  const debits = rpc.p_lines.reduce((s, l) => s + l.debit, 0);
  const credits = rpc.p_lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(debits, credits);
  const one = buildBankDeposit({ bankGlAccountId: "trust", items: ITEMS.slice(0, 2) }, ACCT);
  assert.equal(one.entry.propertyId, "P1", "one property: the entry carries it");
});

test("builder refuses: no bank, 1050 as the bank, no items, a zero item; never a browser builder", () => {
  assert.match(buildBankDeposit({ items: ITEMS }, ACCT).error, /bank account/);
  assert.match(buildBankDeposit({ bankGlAccountId: "und", items: ITEMS }, ACCT).error, /not Undeposited Funds/);
  assert.match(buildBankDeposit({ bankGlAccountId: "trust", items: [] }, ACCT).error, /at least one/);
  assert.match(buildBankDeposit({ bankGlAccountId: "trust", items: [{ ...ITEMS[0], amount: 0 }] }, ACCT).error, /above zero/);
  assert.match(buildBankDeposit({ bankGlAccountId: "trust", items: ITEMS }, indexAccounts([])).error, /Undeposited Funds/);
  assert.ok(!Object.values(BUILDERS).includes(buildBankDeposit));
});

test("settings: paper payments land in 1050 by default; off when the project turns it off", () => {
  const on = normalizeBillingSettings({});
  assert.equal(on.useUndepositedFunds, true);
  assert.deepEqual(cashRoute({ method: "Check", bankAccountId: "B1", useUndepositedFunds: on.useUndepositedFunds }), { systemKey: "undeposited_funds" });
  assert.deepEqual(cashRoute({ method: "Cash", useUndepositedFunds: on.useUndepositedFunds }), { systemKey: "undeposited_funds" });
  assert.deepEqual(cashRoute({ method: "ACH", bankAccountId: "B1", useUndepositedFunds: on.useUndepositedFunds }), { bankAccountId: "B1" });
  const off = normalizeBillingSettings({ useUndepositedFunds: false });
  assert.deepEqual(cashRoute({ method: "Check", bankAccountId: "B1", useUndepositedFunds: off.useUndepositedFunds }), { bankAccountId: "B1" });
});

const line = (id, entryId, debit, credit, extra = {}) => ({ id, entryId, date: "2026-11-09", debit, credit, glAccountId: "trust", bankAccountId: "B1", ...extra });

test("reconciliation: a deposit's bank lines are one row, its reversal another, other lines stay single", () => {
  const dep = { sourceType: "bank_deposit", memo: "Bank deposit · Slip 77 · 3 items", metadata: { itemCount: 3 } };
  const rows = groupReconLines(
    [
      line("a", "E1", 2200, 0, { bankDepositId: D, entry: dep }),
      line("b", "E1", 800, 0, { bankDepositId: D, entry: dep }),
      line("c", "E2", 500, 0, { entry: { sourceType: "payment" } }),
      line("d", "R1", 0, 3000, { bankDepositId: D, entry: { ...dep, reversalOf: "E1" } }),
    ],
    (l) => l.debit || l.credit,
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0].lineIds, ["a", "b"]);
  assert.equal(rows[0].amount, 3000);
  assert.equal(rows[0].items, 3);
  assert.equal(rows[0].memo, "Bank deposit · Slip 77 · 3 items");
  assert.deepEqual(rows[1].lineIds, ["c"]);
  assert.equal(rows[2].amount, 3000);
  assert.deepEqual(rows[2].lineIds, ["d"]);
});

test("check register: a deposit reads as one line per account, with the property filter still per property", () => {
  const entry = { sourceType: "bank_deposit", memo: "Bank deposit · Slip 77 · 3 items", metadata: { reference: "Slip 77" }, status: "posted" };
  const lines = [
    { ...line("a", "E1", 2200, 0, { propertyId: "P1" }), entry },
    { ...line("b", "E1", 800, 0, { propertyId: "P2" }), entry },
    { ...line("u1", "E1", 0, 1000, { glAccountId: "und", bankAccountId: "", propertyId: "P1" }), entry },
    { ...line("u2", "E1", 0, 2000, { glAccountId: "und", bankAccountId: "", propertyId: "P2" }), entry },
  ];
  assert.equal(groupDepositLines(lines).length, 2);
  const reg = cashRegister(lines, ACCT, { bankAccountId: "B1" });
  assert.equal(reg.rows.length, 1);
  assert.equal(reg.rows[0].deposit, 3000);
  assert.equal(reg.rows[0].reference, "Slip 77");
  assert.equal(reg.rows[0].memo, "Bank deposit · Slip 77 · 3 items");
  assert.equal(reg.closing, 3000);
  const p2 = cashRegister(lines.filter((l) => l.propertyId === "P2"), ACCT, { bankAccountId: "B1" });
  assert.equal(p2.rows[0].deposit, 800);
});

test("sweep timing: a deposit payment in 1050 isn't sweepable until a bank deposit takes it, then it moves from that bank", () => {
  const deposits = new Map([
    ["BD1", { id: "BD1", status: "Posted", bank_account_id: "B1", deposit_date: "2026-11-10" }],
    ["BD2", { id: "BD2", status: "Void", bank_account_id: "B1", deposit_date: "2026-11-10" }],
  ]);
  const bankGl = new Map([["B1", "trust"], ["B9", "dep"]]);
  const cash = [
    { entry_id: "p1", entry_date: "2026-11-08", gl_account_id: "und", bank_account_id: null, bank_deposit_id: null, debit: 500 },
    { entry_id: "p2", entry_date: "2026-11-08", gl_account_id: "und", bank_account_id: null, bank_deposit_id: "BD1", debit: 500 },
    { entry_id: "p3", entry_date: "2026-11-08", gl_account_id: "und", bank_account_id: null, bank_deposit_id: "BD2", debit: 500 },
    { entry_id: "p4", entry_date: "2026-11-08", gl_account_id: "trust", bank_account_id: "B1", bank_deposit_id: null, debit: 500 },
  ];
  const settled = settleUndepositedCash(cash, { undepositedId: "und", deposits, bankGl });
  assert.deepEqual(settled.map((l) => [l.entry_id, l.gl_account_id, l.entry_date]), [["p2", "trust", "2026-11-10"], ["p4", "trust", "2026-11-08"]]);
  assert.deepEqual(settleUndepositedCash(cash, {}), cash, "no 1050 in the chart: unchanged");
  const deposit = { id: "SD1", charge_entry_id: "C1" };
  const arLines = ["p1", "p2", "p3", "p4"].map((p) => ({ entry_id: p, applies_to_entry_id: "C1", debit: 0, credit: 500 }));
  const entries = new Map(["p1", "p2", "p3", "p4"].map((p) => [p, { id: p, source_type: "payment", status: "posted", entry_date: "2026-11-08" }]));
  const ins = depositCashIns({ deposits: [deposit], arLines, entries, cashLines: settled, receivedLines: [] });
  assert.deepEqual(ins.map((r) => [r.entryId, r.date]), [["p4", "2026-11-08"], ["p2", "2026-11-10"]]);
  const rows = sweepRows({ cashIns: ins, depositCashIds: new Set(["dep"]), posted: new Set() });
  assert.deepEqual(rows.map((r) => r.paymentEntryId).sort(), ["p2", "p4"]);
  const intoDepositBank = settleUndepositedCash(cash, { undepositedId: "und", deposits: new Map([["BD1", { ...deposits.get("BD1"), bank_account_id: "B9" }]]), bankGl });
  const direct = depositCashIns({ deposits: [deposit], arLines, entries, cashLines: intoDepositBank, receivedLines: [] });
  assert.equal(sweepRows({ cashIns: direct, depositCashIds: new Set(["dep"]), posted: new Set() }).some((r) => r.paymentEntryId === "p2"), false, "deposited into the deposit bank: nothing to move");
});

test("normalizeLine carries bank_deposit_id", () => {
  assert.equal(normalizeLine({ id: "x", entry_id: "e", bank_deposit_id: D }).bankDepositId, D);
  assert.equal(normalizeLine({ id: "x", entry_id: "e" }).bankDepositId, "");
});

test("deposit slip page: items, totals, slip number, VOID stamp, escaped text", () => {
  const slip = {
    label: "Slip 77",
    date: "2026-11-09",
    status: "Posted",
    slipNumber: "77",
    bank: { name: "Tenant rent trust", bankName: "Harbor", last4: "4321", accountType: "Trust" },
    company: { name: "Harbor & Pine" },
    items: [
      { date: "2026-11-08", payerName: "Ana <Lopez>", propertyName: "The Marlowe", unitLabel: "101", method: "Check", reference: "1042", receiptNo: "RCT-000012", amount: 1000 },
      { date: "2026-11-08", payerName: "Ben", method: "Cash", amount: 200 },
    ],
    totals: slipTotals([{ method: "Check", amount: 1000 }, { method: "Cash", amount: 200 }]),
  };
  const html = depositSlipHtml(slip);
  assert.match(html, /Deposit slip/);
  assert.match(html, /Slip 77/);
  assert.match(html, /\$1,200\.00/);
  assert.match(html, /RCT-000012/);
  assert.match(html, /•••• 4321/);
  assert.match(html, /Ana &lt;Lopez&gt;/);
  assert.doesNotMatch(html, /VOID/);
  assert.match(depositSlipHtml({ ...slip, status: "Void", voidReason: "Wrong bank" }), /VOID[\s\S]*Wrong bank/);
});
