import test from "node:test";
import assert from "node:assert/strict";

import { indexAccounts } from "@/lib/ledger/postings";
import { buildJournals, journalTotals, selectLines, totalsByAccount, CLEARING_KEY } from "./journal";
import { overlappingExports, normalizeConfig, withHistory } from "./export_config";

const acc = (id, number, name, accountType, extra = {}) => ({ id, number, name, accountType, isTrust: false, ...extra });
const accounts = indexAccounts([
  acc("op", "1000", "Operating Cash", "Asset"),
  acc("tr", "1010", "Trust Cash", "Asset", { isTrust: true }),
  acc("dep", "2100", "Security Deposits Held", "Liability", { isTrust: true }),
  acc("ar", "1200", "Accounts Receivable", "Asset"),
  acc("inc", "4000", "Rental Income", "Income"),
  acc("fee", "4500", "Management Fee Income", "Income"),
  acc("exp", "5400", "Management Fees", "Expense"),
  acc("eq", "3000", "Owner Equity", "Equity"),
  acc("sw", "5900", "Software", "Expense"),
]);

const entries = [
  { id: "e1aaaaaa-0000", date: "2026-03-05", memo: "March rent", sourceType: "charge", status: "posted" },
  { id: "e2bbbbbb-0000", date: "2026-03-10", memo: "Management fee", sourceType: "management_fee", status: "posted" },
  { id: "e3cccccc-0000", date: "2026-03-12", memo: "Rent payment", sourceType: "payment", status: "void" },
  { id: "e4dddddd-0000", date: "2026-03-20", memo: "Void of Rent payment", sourceType: "payment", status: "posted", reversalOf: "e3cccccc-0000" },
  { id: "e5eeeeee-0000", date: "2026-03-21", memo: "Software", sourceType: "adjustment", status: "posted" },
  { id: "e6ffffff-0000", date: "2026-03-22", memo: "Trust to operating", sourceType: "cash", status: "posted" },
];
const dateOf = (id) => entries.find((e) => e.id === id)?.date || "2026-03-05";
const L = (entryId, glAccountId, debit, credit, extra = {}) => ({ id: `${entryId}-${glAccountId}`, entryId, date: dateOf(entryId), lineNo: 0, glAccountId, debit, credit, memo: "", propertyId: "p1", ownerId: "", metadata: {}, ...extra });
const lines = [
  L("e1aaaaaa-0000", "ar", 1000, 0, { lineNo: 1 }),
  L("e1aaaaaa-0000", "inc", 0, 1000, { lineNo: 2 }),
  L("e2bbbbbb-0000", "exp", 100, 0, { lineNo: 1 }),
  L("e2bbbbbb-0000", "tr", 0, 100, { lineNo: 2 }),
  L("e2bbbbbb-0000", "op", 100, 0, { lineNo: 3, metadata: { side: "manager" } }),
  L("e2bbbbbb-0000", "fee", 0, 100, { lineNo: 4, metadata: { side: "manager" } }),
  L("e3cccccc-0000", "tr", 1000, 0, { lineNo: 1 }),
  L("e3cccccc-0000", "ar", 0, 1000, { lineNo: 2 }),
  L("e4dddddd-0000", "ar", 1000, 0, { lineNo: 1 }),
  L("e4dddddd-0000", "tr", 0, 1000, { lineNo: 2 }),
  L("e5eeeeee-0000", "sw", 49.99, 0, { lineNo: 1, propertyId: "" }),
  L("e5eeeeee-0000", "op", 0, 54.99, { lineNo: 2, propertyId: "" }),
  L("e5eeeeee-0000", "eq", 5, 0, { lineNo: 3, propertyId: "" }),
  L("e6ffffff-0000", "op", 200, 0, { lineNo: 1, propertyId: "" }),
  L("e6ffffff-0000", "tr", 0, 200, { lineNo: 2, propertyId: "" }),
  L("e6ffffff-0000", "dep", 0, 0, { lineNo: 3, propertyId: "" }),
];
const opts = { propertyNames: { p1: "Harbor House" } };

test("ledger profile keeps every line", () => {
  assert.equal(selectLines(lines, accounts, { profile: "ledger" }).length, lines.length);
});

test("company profile keeps only ownerless non-trust lines on the manager side or with no property, never equity", () => {
  const sel = selectLines(lines, accounts, { profile: "company" });
  const ids = new Set(sel.map((l) => l.glAccountId));
  assert.deepEqual([...ids].sort(), ["fee", "op", "sw"]);
  assert.ok(sel.every((l) => !l.ownerId));
  for (const bad of ["tr", "dep", "ar", "inc", "eq", "exp"]) assert.ok(!ids.has(bad));
});

test("company profile drops owner lines even on non-trust accounts", () => {
  const owned = [L("e2bbbbbb-0000", "fee", 0, 5, { ownerId: "o1", metadata: { side: "manager" } })];
  assert.equal(selectLines(owned, accounts, { profile: "company" }).length, 0);
});

test("a ledger export balances per journal and overall", () => {
  const j = buildJournals(lines, entries, accounts, opts);
  const t = journalTotals(j);
  assert.equal(t.journals, 6);
  assert.ok(t.balanced, t.unbalanced.join());
  assert.equal(t.debit, t.credit);
});

test("a voided entry and its reversal both appear and net to zero", () => {
  const j = buildJournals(lines, entries, accounts, opts);
  const pair = j.filter((x) => /Rent payment|Void of/.test(x.memo));
  assert.equal(pair.length, 2);
  assert.ok(pair.some((x) => /voided/.test(x.memo)));
  for (const r of totalsByAccount(pair)) assert.equal(r.debit, r.credit);
});

test("company journals that lose their trust side get a clearing line and still balance", () => {
  const sel = selectLines(lines, accounts, { profile: "company" });
  const j = buildJournals(sel, entries, accounts, opts);
  assert.ok(journalTotals(j).balanced);
  const transfer = j.find((x) => x.memo === "Trust to operating");
  assert.ok(transfer.lines.some((l) => l.accountId === CLEARING_KEY && l.credit === 200));
  assert.equal(j.find((x) => x.memo === "Management fee").lines.length, 2);
});

test("clearing account name follows the mapping", () => {
  const sel = selectLines(lines, accounts, { profile: "company" });
  const j = buildJournals(sel, entries, accounts, { accountMap: { [CLEARING_KEY]: "Owner Funds Held" } });
  assert.ok(j.some((x) => x.lines.some((l) => l.account === "Owner Funds Held")));
});

test("account mapping overrides the default name; default is number and name", () => {
  const j = buildJournals(lines, entries, accounts, { accountMap: { ar: "Trade Debtors" } });
  const rent = j.find((x) => x.memo === "March rent");
  assert.deepEqual(rent.lines.map((l) => l.account), ["Trade Debtors", "4000 Rental Income"]);
});

test("classBy property sets the class from the property name", () => {
  const j = buildJournals(lines, entries, accounts, { classBy: "property", propertyNames: { p1: "Harbor House" } });
  assert.equal(j.find((x) => x.memo === "March rent").lines[0].className, "Harbor House");
  assert.equal(buildJournals(lines, entries, accounts, { classBy: "none" })[0].lines[0].className, "");
});

test("day granularity: one journal per day per property, same-account lines netted", () => {
  const same = [
    L("e1aaaaaa-0000", "ar", 600, 0),
    L("e1aaaaaa-0000", "inc", 0, 600),
    L("e9", "ar", 400, 0),
    L("e9", "inc", 0, 400),
    L("e1aaaaaa-0000", "ar", 50, 0, { propertyId: "p2" }),
    L("e1aaaaaa-0000", "inc", 0, 50, { propertyId: "p2" }),
  ];
  const j = buildJournals(same, entries, accounts, { granularity: "day", propertyNames: { p1: "A", p2: "B" } });
  assert.equal(j.length, 2);
  const a = j.find((x) => x.memo.includes("A"));
  assert.deepEqual(a.lines.map((l) => [l.debit, l.credit]), [[1000, 0], [0, 1000]]);
  assert.ok(journalTotals(j).balanced);
});

test("day granularity drops journals that net to nothing", () => {
  const z = [L("e1aaaaaa-0000", "ar", 10, 0), L("e1aaaaaa-0000", "ar", 0, 10)];
  assert.equal(buildJournals(z, entries, accounts, { granularity: "day" }).length, 0);
});

test("floating point amounts add up in whole cents", () => {
  const f = [L("e1aaaaaa-0000", "ar", 0.1, 0), L("e1aaaaaa-0000", "ar", 0.2, 0), L("e1aaaaaa-0000", "inc", 0, 0.3)];
  assert.ok(journalTotals(buildJournals(f, entries, accounts, {})).balanced);
});

test("overlappingExports flags intersecting ranges for the same books", () => {
  const history = [{ from: "2026-03-01", to: "2026-03-31", profile: "ledger" }, { from: "2026-01-01", to: "2026-01-31", profile: "ledger" }];
  assert.equal(overlappingExports(history, { from: "2026-03-15", to: "2026-04-15", profile: "ledger" }).length, 1);
  assert.equal(overlappingExports(history, { from: "2026-02-01", to: "2026-02-28", profile: "ledger" }).length, 0);
  assert.equal(overlappingExports(history, { from: "2026-03-31", to: "2026-04-30", profile: "ledger" }).length, 1);
  assert.equal(overlappingExports(history, { from: "2026-03-15", to: "2026-04-15", profile: "company" }).length, 0);
});

test("normalizeConfig fills defaults and withHistory keeps newest first", () => {
  const c = normalizeConfig({ format: "bogus", accountMap: { a: " ", b: "X" } });
  assert.equal(c.format, "qbo_csv");
  assert.deepEqual(c.accountMap, { b: "X" });
  assert.equal(withHistory([{ from: "a" }], { from: "b" })[0].from, "b");
});

test("journal numbers are unique even when entry ids share a tail", () => {
  const same = [L("aaaa0000-1111-2222-3333-444455556666", "ar", 5, 0), L("aaaa0000-1111-2222-3333-444455556666", "inc", 0, 5), L("bbbb0000-1111-2222-3333-444455556666", "ar", 7, 0), L("bbbb0000-1111-2222-3333-444455556666", "inc", 0, 7)];
  const refs = buildJournals(same, [], accounts, {}).map((j) => j.ref);
  assert.equal(new Set(refs).size, 2);
});
