import { test } from "node:test";
import assert from "node:assert/strict";

import { indexAccounts, normalizeEntry, normalizeGlAccount, normalizeLine } from "@/lib/ledger/postings";
import { ownerScopedLines, ownershipIndex } from "@/lib/ledger/ownership";
import { createSandboxClient } from "@/lib/sandbox/sandbox_client";
import {
  cashFlowFromTotals,
  ledgerTotalsLines,
  openingLines,
  ownerTotals,
  periodOf,
  referenceTotals,
  rebucket,
  totalsParams,
  totalsRow,
  windowParams,
} from "./aggregates";
import { REPORTS, REPORT_CATEGORIES, getReport, reportViewTitle, reportsByCategory, searchReports, viewableReports } from "./catalog";
import { balanceSheet, cashFlow, cashRegister, glDetail, incomeStatement, scopeLines, trialBalance } from "./ledger_math";
import { loadLedgerTotals, loadLedgerWindow, rpcAll } from "./ledger_load";
import { dayBefore } from "./periods";
import { paramsKey, sourceParamsOf } from "./source_params";
import { resolvePropertyScope } from "./scope";

// CORE-41: totals from the aggregate functions (their JS mirror, referenceTotals) give the same reports as the line math.

const PROJECT = "proj-agg";
const [P1, P2, P3] = ["prop-1", "prop-2", "prop-3"];
const [O1, O2] = ["owner-1", "owner-2"];
const [B1, B2] = ["bank-1", "bank-2"];

// Seeded PRNG so failures reproduce.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ACCOUNTS = [
  ["trust", "1010", "Trust Cash", "Asset", "cash", true, "trust_cash"],
  ["operating", "1000", "Operating Cash", "Asset", "cash", false, "operating_cash"],
  ["undeposited", "1050", "Undeposited Funds", "Asset", "cash", true, "undeposited_funds"],
  ["ar", "1200", "Accounts Receivable", "Asset", "receivable", false, "accounts_receivable"],
  ["ap", "2000", "Accounts Payable", "Liability", "payable", false, "accounts_payable"],
  ["deposits", "2100", "Security Deposits Held", "Liability", "deposits", true, "security_deposits"],
  ["contrib", "3100", "Owner Contributions", "Equity", "contribution", false, "owner_contributions"],
  ["distrib", "3200", "Owner Distributions", "Equity", "distribution", false, "owner_distributions"],
  ["rent", "4000", "Rental Income", "Income", "income", false, "rent_income"],
  ["feeinc", "4500", "Management Fee Income", "Income", "income", false, "management_fee_income"],
  ["repairs", "5000", "Repairs & Maintenance", "Expense", "expense", false, "repairs_maintenance"],
  ["fees", "5400", "Management Fees", "Expense", "expense", false, "management_fees"],
].map(([id, number, name, account_type, subtype, is_trust, system_key]) => ({ id, project_id: PROJECT, number, name, account_type, subtype, is_trust, system_key, deleted_at: null, metadata: {} }));
// A deleted account with live lines: both paths leave it out.
ACCOUNTS.push({ id: "gone", project_id: PROJECT, number: "9999", name: "Retired", account_type: "Expense", subtype: "expense", deleted_at: "2026-01-01T00:00:00Z", metadata: {} });

const OWNERSHIP = [
  { id: "po1", project_id: PROJECT, owner_id: O1, property_id: P1, ownership_pct: 60, starts_on: null, ends_on: "2026-03-15", is_primary: true },
  { id: "po2", project_id: PROJECT, owner_id: O2, property_id: P1, ownership_pct: 40, starts_on: null, ends_on: "2026-03-15", is_primary: false },
  { id: "po3", project_id: PROJECT, owner_id: O1, property_id: P1, ownership_pct: 100, starts_on: "2026-03-16", ends_on: null, is_primary: true },
  { id: "po4", project_id: PROJECT, owner_id: O2, property_id: P2, ownership_pct: 100, starts_on: null, ends_on: null, is_primary: true },
].map((r) => ({ ...r, deleted_at: null, metadata: {} }));

// A random two-year ledger: every source type the reports care about, cash-to-cash transfers inside one entry, owner tags (real
// and stray), manager-side fee lines, voids, a deleted line, lines without a property and lines on a deleted account.
function buildLedger(seed = 7, count = 420) {
  const r = rng(seed);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const amount = () => Math.round(r() * 250000) / 100 + 0.01;
  const entries = [];
  const lines = [];
  const start = Date.UTC(2025, 0, 1);
  for (let i = 0; i < count; i += 1) {
    const date = new Date(start + Math.floor(r() * 730) * 86400000).toISOString().slice(0, 10);
    const prop = pick([P1, P1, P2, P3, null]);
    const id = `e${i}`;
    const amt = amount();
    const type = pick(["charge", "payment", "bank_deposit", "bill", "bill_payment", "distribution", "contribution", "management_fee", "deposit_held", "adjustment", "adjustment"]);
    const entry = { id, project_id: PROJECT, entry_date: date, source_type: type, status: "posted", owner_id: null, property_id: prop, metadata: {}, deleted_at: null, created_at: `${date}T00:00:${String(i % 60).padStart(2, "0")}Z` };
    const L = (acct, debit, credit, extra = {}) => lines.push({ id: `${id}-${lines.length}`, project_id: PROJECT, entry_id: id, entry_date: date, line_no: lines.length, gl_account_id: acct, debit, credit, property_id: prop, owner_id: null, bank_account_id: null, metadata: {}, deleted_at: null, created_at: entry.created_at, ...extra });
    const owner = pick([O1, O2]);
    if (type === "charge") (L("ar", amt, 0), L("rent", 0, amt));
    else if (type === "payment") (L("undeposited", amt, 0, { bank_account_id: B1 }), L("ar", 0, amt));
    else if (type === "bank_deposit") (L("trust", amt, 0, { bank_account_id: B1 }), L("undeposited", 0, amt, { bank_account_id: B1 }));
    else if (type === "bill") (L("repairs", amt, 0), L("ap", 0, amt));
    else if (type === "bill_payment") (L("ap", amt, 0), L("trust", 0, amt, { bank_account_id: B1 }));
    else if (type === "distribution") ((entry.owner_id = owner), L("distrib", amt, 0, { owner_id: owner }), L("trust", 0, amt, { owner_id: owner, bank_account_id: B1 }));
    else if (type === "contribution") ((entry.owner_id = owner), L("trust", amt, 0, { owner_id: owner, bank_account_id: B1 }), L("contrib", 0, amt, { owner_id: owner }));
    else if (type === "management_fee") {
      const fee = Math.round(amt * 8) / 100;
      L("fees", fee, 0);
      L("trust", 0, fee, { bank_account_id: B1 });
      L("operating", fee, 0, { bank_account_id: B2, metadata: { side: "manager" } });
      L("feeinc", 0, fee, { metadata: { side: "manager" } });
    } else if (type === "deposit_held") (L("trust", amt, 0, { bank_account_id: B1 }), L("deposits", 0, amt));
    else if (r() < 0.5) (L("repairs", amt, 0, { owner_id: owner }), L("operating", 0, amt, { owner_id: owner, bank_account_id: B2 }));
    else ((entry.metadata = { ownerExplicit: true }), (entry.owner_id = owner), L("gone", amt, 0, { owner_id: owner }), L("trust", 0, amt, { owner_id: owner, bank_account_id: B1 }));
    entries.push(entry);
  }
  // Voids: reversal entries with swapped sides.
  for (const e of entries.filter((_, i) => i % 37 === 5)) {
    const id = `${e.id}-void`;
    const date = e.entry_date < "2026-12-01" ? "2026-12-01" : e.entry_date;
    entries.push({ ...e, id, entry_date: date, reversal_of: e.id, created_at: `${date}T12:00:00Z` });
    e.status = "void";
    for (const l of lines.filter((x) => x.entry_id === e.id)) lines.push({ ...l, id: `${l.id}-v`, entry_id: id, entry_date: date, debit: l.credit, credit: l.debit, created_at: `${date}T12:00:00Z` });
  }
  lines[3] = { ...lines[3], deleted_at: "2026-02-01T00:00:00Z" };
  return { entries, lines };
}

const DB = (() => {
  const { entries, lines } = buildLedger();
  return { entries, lines, accounts: ACCOUNTS, propertyOwners: OWNERSHIP };
})();

// The line path's view of the same rows (as the report sources load them): live lines with their entry, oldest first.
const ACCTS = indexAccounts(ACCOUNTS.filter((a) => !a.deleted_at).map(normalizeGlAccount));
const LINES = (() => {
  const entries = new Map(DB.entries.filter((e) => !e.deleted_at).map((e) => [e.id, normalizeEntry(e)]));
  return DB.lines
    .filter((l) => !l.deleted_at)
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at) || a.line_no - b.line_no)
    .map((l) => ({ ...normalizeLine(l), entry: entries.get(l.entry_id) || null }));
})();

// A ledgerTotals result built from the reference functions (what loadLedgerTotals returns for the same params).
function totalsFrom(params) {
  const p = totalsParams(params);
  const base = { p_project_id: PROJECT, p_property_ids: p.propertyIds };
  const rows = (fn, args) => referenceTotals(DB, fn, { ...base, ...args }).data;
  return {
    params: p,
    accounts: ACCTS,
    any: true,
    opening: p.from ? rows("ledger_balances_as_of", { p_as_of: dayBefore(p.from) }).map(totalsRow) : [],
    period: rows("ledger_period_totals", { p_from: p.from, p_to: p.to, p_grain: p.grain }).map(totalsRow),
    cash: p.cash ? rows("ledger_cash_flow_totals", { p_from: p.from, p_to: p.to, p_grain: p.grain === "day" ? "day" : "month" }).map((r) => ({ period: r.period || "", sourceType: r.source_type, inflow: r.inflow, outflow: r.outflow })) : null,
  };
}

// Same figures to a millionth (the statements keep raw float accumulators beside their rounded amounts).
const same = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a, (_, x) => (typeof x === "number" ? Math.round(x * 1e6) / 1e6 : x))), JSON.parse(JSON.stringify(b, (_, x) => (typeof x === "number" ? Math.round(x * 1e6) / 1e6 : x))), msg);

// The fifteen reports that keep their own sidebar entry; later ones open from the Report Library only.
const SIDEBAR_REPORTS = ["rent_roll", "delinquency", "occupancy", "owner_statements", "maintenance_report", "leasing_report", "insurance_compliance", "financial_statements", "trial_balance", "general_ledger_detail", "check_register", "ap_aging", "deposit_detail", "management_fees", "vendor_1099"];

const RANGES = [
  { from: "2026-11-01", to: "2026-11-30" },
  { from: "2026-01-01", to: "2026-11-08" },
  { from: "2025-03-17", to: "2026-08-09" },
  { from: "2025-06-15", to: "2025-06-15" },
  { from: "2027-01-01", to: "2027-01-31" },
];
const SCOPES = [null, P1, P3];

test("aggregates: trial balance, P&L, balance sheet and cash flow equal the line math (every grain, range and scope)", () => {
  let compared = 0;
  for (const range of RANGES) {
    for (const propertyId of SCOPES) {
      const f = { ...range, propertyId: propertyId || "all" };
      const lineScope = scopeLines(LINES, { propertyId: f.propertyId });
      for (const grain of ["range", "month", "day", "year"]) {
        const totals = totalsFrom({ ...range, grain, propertyIds: resolvePropertyScope(f), cash: true });
        const synthetic = scopeLines(ledgerTotalsLines(totals), { propertyId: f.propertyId });
        same(trialBalance(synthetic, ACCTS, f), trialBalance(lineScope, ACCTS, f), `TB ${grain} ${JSON.stringify(f)}`);
        same(incomeStatement(synthetic, ACCTS, f), incomeStatement(lineScope, ACCTS, f), `P&L ${grain} ${JSON.stringify(f)}`);
        same(balanceSheet(synthetic, ACCTS, f.to), balanceSheet(lineScope, ACCTS, f.to), `BS ${grain} ${JSON.stringify(f)}`);
        same(cashFlowFromTotals(totals), cashFlow(LINES, ACCTS, f), `cash ${grain} ${JSON.stringify(f)}`);
        compared += 1;
      }
    }
  }
  assert.equal(compared, RANGES.length * SCOPES.length * 4);
});

test("aggregates: GL detail and the check register over a window plus opening lines equal the whole-ledger line math", () => {
  for (const range of RANGES) {
    for (const propertyId of SCOPES) {
      const props = propertyId ? [propertyId] : null;
      const opening = openingLines(referenceTotals(DB, "ledger_balances_as_of", { p_project_id: PROJECT, p_as_of: dayBefore(range.from), p_property_ids: props }).data.map(totalsRow), range.from, ACCTS);
      const window = [...opening, ...LINES.filter((l) => l.date >= range.from && l.date <= range.to && (!propertyId || l.propertyId === propertyId))];
      const whole = scopeLines(LINES, { propertyId });
      const f = { ...range, glAccountId: "all" };
      same(glDetail(window, ACCTS, f), glDetail(whole, ACCTS, f), `GL ${JSON.stringify(range)} ${propertyId}`);
      for (const bankAccountId of ["all", B1, B2]) {
        same(cashRegister(window, ACCTS, { ...f, bankAccountId }), cashRegister(whole, ACCTS, { ...f, bankAccountId }), `register ${bankAccountId}`);
      }
    }
  }
});

test("aggregates: owner tags follow ownerTagOf and owner scope drops manager-side lines", () => {
  const all = referenceTotals(DB, "ledger_period_totals", { p_project_id: PROJECT, p_from: null, p_to: null, p_grain: "range" }).data;
  const tagged = all.filter((r) => r.owner_id);
  assert.ok(tagged.length > 0);
  for (const r of tagged) assert.ok(["contrib", "distrib", "trust", "gone"].includes(r.gl_account_id), `only owner-specific lines keep a tag (${r.gl_account_id})`);
  assert.ok(!all.some((r) => r.gl_account_id === "operating" && r.owner_id), "a stray tag on a plain adjustment is dropped");
  const mine = referenceTotals(DB, "ledger_period_totals", { p_project_id: PROJECT, p_from: null, p_to: null, p_grain: "day", p_owner_id: O2 }).data;
  assert.ok(mine.length > 0);
  assert.ok(!mine.some((r) => r.gl_account_id === "feeinc"), "manager-side lines are no owner's");
  assert.ok(!mine.some((r) => r.gl_account_id === "operating" && r.owner_id), "a stray tag counts as property-level");
  assert.ok(mine.every((r) => r.owner_id === O2 || [P1, P2].includes(r.property_id)), "their tagged lines plus untagged lines on properties they held");
});

test("aggregates: an owner's totals equal their ownerScopedLines when no two lines share a day, account and property", () => {
  const rows = [];
  const lines = [];
  let n = 0;
  const add = (date, acct, prop, debit, credit, extra = {}) => {
    n += 1;
    const line = { id: `l${n}`, entryId: `e${n}`, date, glAccountId: acct, propertyId: prop, ownerId: "", debit, credit, metadata: {}, entry: { sourceType: "adjustment" }, ...extra };
    lines.push(line);
    rows.push({ period: date, glAccountId: acct, propertyId: prop, ownerId: extra.entry?.sourceType === "distribution" ? extra.ownerId : "", bankAccountId: "", debit, credit });
  };
  add("2026-03-10", "rent", P1, 0, 1000.01);
  add("2026-03-20", "rent", P1, 0, 333.33);
  add("2026-03-14", "repairs", P1, 77.77, 0);
  add("2026-04-02", "rent", P2, 0, 500);
  add("2026-04-03", "distrib", P1, 250, 0, { ownerId: O1, entry: { sourceType: "distribution" } });
  const idx = ownershipIndex(OWNERSHIP);
  for (const owner of [O1, O2]) {
    const sum = (xs) => {
      const per = {};
      for (const x of xs) per[x.glAccountId] = Math.round(((per[x.glAccountId] || 0) + x.debit - x.credit) * 100) / 100;
      return per;
    };
    const fromLines = sum(ownerScopedLines(lines, owner, idx).filter((l) => l.date >= "2026-03-01"));
    const t = ownerTotals(rows, { from: "2026-03-01", to: "2026-04-30", grain: "month", ownerId: owner }, idx);
    assert.deepEqual(sum(t.period), fromLines, owner);
  }
  assert.deepEqual(ownerTotals(rows, { from: "2026-03-15", to: "2026-04-30", grain: "range", ownerId: O2 }, idx).opening, [
    { glAccountId: "rent", propertyId: P1, ownerId: "", bankAccountId: "", debit: 0, credit: 400 },
    { glAccountId: "repairs", propertyId: P1, ownerId: "", bankAccountId: "", debit: 31.11, credit: 0 },
  ]);
});

test("aggregates: periods clamp to the range start; params normalize", () => {
  assert.equal(periodOf("2026-03-20", "month", "2026-03-17"), "2026-03-17");
  assert.equal(periodOf("2026-04-20", "month", "2026-03-17"), "2026-04-01");
  assert.equal(periodOf("2026-04-20", "year", "2026-03-17"), "2026-03-17");
  assert.equal(periodOf("2027-04-20", "year", "2026-03-17"), "2027-01-01");
  assert.equal(periodOf("2026-04-20", "day"), "2026-04-20");
  assert.equal(periodOf("2026-04-20", "range", null), "");
  assert.deepEqual(totalsParams({ from: "2026-01-05T10:00:00Z", grain: "weekly", propertyIds: ["b", "a", "b", ""] }), {
    from: "2026-01-05",
    to: null,
    grain: "month",
    propertyIds: ["a", "b"],
    ownerId: null,
    cash: false,
  });
  assert.deepEqual(totalsParams({ propertyIds: [] }).propertyIds, [], "an empty scope stays empty (no properties), unlike null (all)");
  assert.deepEqual(windowParams({ to: "2026-02-01", subtypes: ["payable"] }), { from: null, to: "2026-02-01", propertyIds: null, subtypes: ["payable"], opening: false });
  assert.equal(paramsKey({ b: 1, a: [2, { d: undefined, c: 3 }] }), '{"a":[2,{"c":3}],"b":1}');
  assert.equal(paramsKey(undefined), "");
  const rows = [
    { period: "2026-03-02", glAccountId: "rent", propertyId: P1, ownerId: "", bankAccountId: "", debit: 0, credit: 10.1 },
    { period: "2026-03-30", glAccountId: "rent", propertyId: P1, ownerId: "", bankAccountId: "", debit: 0, credit: 0.2 },
  ];
  assert.deepEqual(rebucket(rows, "month", "2026-03-01"), [{ period: "2026-03-01", glAccountId: "rent", propertyId: P1, ownerId: "", bankAccountId: "", debit: 0, credit: 10.3 }]);
  assert.match(referenceTotals(DB, "ledger_period_totals", { p_project_id: PROJECT, p_grain: "week" }).error.message, /grain/);
  assert.match(referenceTotals(DB, "ledger_period_totals", { p_grain: "month" }).error.message, /project/);
});

// A fake client whose rpc pages a fixed row set, counting calls.
function pagingClient(total) {
  const calls = [];
  const rows = Array.from({ length: total }, (_, i) => ({ i }));
  return {
    calls,
    rpc(fn, args) {
      const q = { order: () => q, range: (a, b) => (calls.push([a, b]), Promise.resolve({ data: rows.slice(a, b + 1), error: null })) };
      return q;
    },
  };
}

test("ledger_load: rpcAll pages past PostgREST's 1000-row cap", async () => {
  const sb = pagingClient(2500);
  assert.equal((await rpcAll(sb, "ledger_period_totals", {}, ["period"])).length, 2500);
  assert.deepEqual(sb.calls, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal((await rpcAll(pagingClient(1000), "x", {})).length, 1000);
});

// The in-memory sandbox client (the playground's) loaded with the fixture: the real loaders against the SQL mirror.
async function sandboxWithFixture() {
  const sb = createSandboxClient(() => null);
  const strip = (rows) => rows.map((r) => ({ ...r }));
  for (const [table, rows] of [["gl_accounts", ACCOUNTS], ["ledger_entries", DB.entries], ["ledger_lines", DB.lines], ["property_owners", OWNERSHIP]]) {
    const { error } = await sb.from(table).insert(strip(rows));
    assert.equal(error, null, table);
  }
  return sb;
}

test("ledger_load: loadLedgerTotals and loadLedgerWindow (through the sandbox client) feed the reports the same figures", async () => {
  const sb = await sandboxWithFixture();
  const range = { from: "2025-03-17", to: "2026-08-09" };
  const totals = await loadLedgerTotals(sb, PROJECT, { ...range, grain: "range", propertyIds: [P1], cash: true });
  assert.equal(totals.any, true);
  const f = { ...range, propertyId: P1 };
  same(trialBalance(ledgerTotalsLines(totals), totals.accounts, f), trialBalance(scopeLines(LINES, { propertyId: P1 }), ACCTS, f));
  same(cashFlowFromTotals(totals), cashFlow(LINES, ACCTS, f));
  const win = await loadLedgerWindow(sb, PROJECT, { ...range, propertyIds: [P1], opening: true });
  same(glDetail(win.lines, win.accounts, { ...range, glAccountId: "all" }), glDetail(scopeLines(LINES, { propertyId: P1 }), ACCTS, { ...range, glAccountId: "all" }));
  const ap = await loadLedgerWindow(sb, PROJECT, { to: "2026-06-30", subtypes: ["payable"] });
  assert.ok(ap.lines.length > 0 && ap.lines.every((l) => l.glAccountId === "ap" && l.date <= "2026-06-30" && l.entry));
  const none = await loadLedgerWindow(sb, PROJECT, { from: "2030-01-01", to: "2030-01-31" });
  assert.deepEqual([none.lines.length, none.any], [0, true], "an empty window still knows the ledger has activity");
  const owner = await loadLedgerTotals(sb, PROJECT, { ...range, grain: "month", ownerId: O2 });
  assert.ok(owner.period.length > 0 && owner.cash === null);
});

test("catalog: every report has a library category, keywords, and source params for its range", () => {
  for (const def of REPORTS) {
    assert.ok(REPORT_CATEGORIES.includes(def.category), `${def.key} category`);
    assert.ok(Array.isArray(def.keywords) && def.keywords.length >= 3, `${def.key} keywords`);
  }
  for (const key of SIDEBAR_REPORTS) assert.equal(reportViewTitle(getReport(key)), getReport(key).title, `${key} keeps its sidebar entry`);
  assert.equal(reportViewTitle({ title: "Rent Change" }), "Report Library", "a library-only report is gated by the library page");
  const f = { from: "2026-01-01", to: "2026-03-31", propertyId: P1, view: "cash" };
  // yearOf: the fiscal-year split for retained earnings (CORE-40).
  assert.deepEqual(sourceParamsOf(getReport("trial_balance"), f), { ledgerTotals: { from: "2026-01-01", to: "2026-03-31", grain: "range", propertyIds: [P1], yearOf: "2026-01-01" } });
  assert.deepEqual(sourceParamsOf(getReport("financial_statements"), { ...f, propertyId: "all" }).ledgerTotals.propertyIds, null);
  assert.deepEqual(sourceParamsOf(getReport("ap_aging"), f), { ledger: { to: "2026-03-31", subtypes: ["payable"] } });
  assert.deepEqual(sourceParamsOf(getReport("general_ledger_detail"), f), { ledger: { from: "2026-01-01", to: "2026-03-31", propertyIds: [P1], opening: true } });
  assert.deepEqual(sourceParamsOf(getReport("rent_roll"), f), {}, "reports without params keep the whole-ledger source");
  assert.ok(!getReport("financial_statements").sources.includes("ledger"), "statements never load ledger lines");
});

test("catalog: library search finds reports by keyword and groups them by category", () => {
  const keys = (q) => searchReports(REPORTS, q).map((r) => r.key);
  assert.deepEqual(keys("p&l"), ["financial_statements"]);
  assert.ok(keys("1099").includes("vendor_1099"));
  assert.ok(keys("accounts payable").includes("ap_aging"));
  assert.deepEqual(keys("w-9 irs"), ["vendor_1099"], "every word must match");
  assert.equal(keys("").length, REPORTS.length);
  assert.deepEqual(keys("no such report"), []);
  const groups = reportsByCategory(REPORTS);
  assert.deepEqual(groups.map((g) => g.category), REPORT_CATEGORIES.filter((c) => REPORTS.some((r) => r.category === c)));
  assert.equal(groups.reduce((n, g) => n + g.reports.length, 0), REPORTS.length);
  const visible = viewableReports((title) => title !== "Trial Balance");
  assert.ok(!visible.some((r) => r.key === "trial_balance") && visible.length === REPORTS.length - 1);
});
