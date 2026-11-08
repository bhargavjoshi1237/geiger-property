import { test } from "node:test";
import assert from "node:assert/strict";

import { indexAccounts, normalizeEntry, normalizeGlAccount, normalizeLine } from "@/lib/ledger/postings";
import { createSandboxClient } from "@/lib/sandbox/sandbox_client";
import { runSchedule } from "@/lib/jobs/scheduled_reports";
import { ledgerTotalsLines } from "./aggregates";
import { REPORTS, getReport, reportSources, runReport } from "./catalog";
import { money } from "./format";
import { incomeStatement, scopeLines, trialBalance } from "./ledger_math";
import { loadLedgerTotals } from "./ledger_load";
import { delinquencyPct, fiscalYearOf, pnlByProperty, pnlSummary, proRatedTarget, targetChecks, ytdOf } from "./portfolio";
import { storableFilters } from "./schedule";
import { EMPTY_PORTFOLIO, hasPropertyFilter, inPropertyScope, portfolioIdOf, portfolioScope, resolvePropertyScope, scopeLabel, scopeOptions, scopeSummary } from "./scope";
import { sourceParamsOf } from "./source_params";

// CORE-43: a portfolio is a report scope resolved to its current member properties; its statements consolidate theirs.

const PROJECT = "proj-portfolio";
const [P1, P2, P3, P4] = ["prop-1", "prop-2", "prop-3", "prop-4"];
const [A, B, C, D] = ["pf-a", "pf-b", "pf-empty", "pf-archived"];

const PORTFOLIOS = [
  { id: A, name: "Downtown", status: "Active" },
  { id: B, name: "Suburban", status: "Active" },
  { id: C, name: "Empty", status: "Draft" },
  { id: D, name: "Divested", status: "Archived" },
];
const PROPERTIES = [
  { id: P1, name: "The Marlowe", portfolioId: A },
  { id: P2, name: "Cascade Lofts", portfolioId: A },
  { id: P3, name: "Pinecrest", portfolioId: B },
  { id: P4, name: "Unassigned House", portfolioId: null },
];

const ACCOUNTS = [
  ["trust", "1010", "Trust Cash", "Asset", "cash", true, "trust_cash"],
  ["operating", "1000", "Operating Cash", "Asset", "cash", false, "operating_cash"],
  ["ar", "1200", "Accounts Receivable", "Asset", "receivable", false, "accounts_receivable"],
  ["ap", "2000", "Accounts Payable", "Liability", "payable", false, "accounts_payable"],
  ["equity", "3000", "Owner Equity", "Equity", "equity", false, "owner_equity"],
  ["rent", "4000", "Rental Income", "Income", "income", false, "rent_income"],
  ["feeinc", "4500", "Management Fee Income", "Income", "income", false, "management_fee_income"],
  ["repairs", "5000", "Repairs & Maintenance", "Expense", "expense", false, "repairs_maintenance"],
  ["fees", "5400", "Management Fees", "Expense", "expense", false, "management_fees"],
].map(([id, number, name, account_type, subtype, is_trust, system_key]) => ({ id, project_id: PROJECT, number, name, account_type, subtype, is_trust, system_key, deleted_at: null, metadata: {} }));

// Six months on four properties: rent charged and part paid, a bill and its payment, a management fee whose manager side carries the
// property but no owner, an opening balance, plus a company expense without a property.
function buildLedger() {
  const entries = [];
  const lines = [];
  let n = 0;
  const post = (date, type, prop, rows) => {
    const id = `e${n++}`;
    const created = `${date}T00:00:${String(n % 60).padStart(2, "0")}Z`;
    entries.push({ id, project_id: PROJECT, entry_date: date, source_type: type, status: "posted", property_id: prop, metadata: {}, deleted_at: null, created_at: created });
    for (const [acct, debit, credit, extra = {}] of rows) {
      lines.push({ id: `${id}-${lines.length}`, project_id: PROJECT, entry_id: id, entry_date: date, line_no: lines.length, gl_account_id: acct, debit, credit, property_id: prop, owner_id: null, bank_account_id: null, metadata: {}, deleted_at: null, created_at: created, ...extra });
    }
  };
  [P1, P2, P3, P4].forEach((prop, i) => {
    post("2025-12-31", "adjustment", prop, [["trust", 5000 + i * 100, 0], ["equity", 0, 5000 + i * 100]]);
    for (let m = 1; m <= 6; m += 1) {
      const day = (d) => `2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const rent = 1000 + i * 250 + m * 7.31;
      const fee = Math.round(rent * 8) / 100;
      post(day(1), "charge", prop, [["ar", rent, 0], ["rent", 0, rent]]);
      post(day(5), "payment", prop, [["trust", rent - 13.17 * i, 0], ["ar", 0, rent - 13.17 * i]]);
      post(day(9), "bill", prop, [["repairs", 120.45 + i * m, 0], ["ap", 0, 120.45 + i * m]]);
      if (m % 2) post(day(20), "bill_payment", prop, [["ap", 120.45 + i * m, 0], ["trust", 0, 120.45 + i * m]]);
      post(day(28), "management_fee", prop, [["fees", fee, 0], ["trust", 0, fee], ["operating", fee, 0, { metadata: { side: "manager" } }], ["feeinc", 0, fee, { metadata: { side: "manager" } }]]);
    }
  });
  post("2026-03-15", "adjustment", null, [["repairs", 75, 0], ["operating", 0, 75]]);
  return { entries, lines };
}

const DB = buildLedger();
const ACCTS = indexAccounts(ACCOUNTS.map(normalizeGlAccount));
const LINES = (() => {
  const entries = new Map(DB.entries.map((e) => [e.id, normalizeEntry(e)]));
  return DB.lines.map((l) => ({ ...normalizeLine(l), entry: entries.get(l.entry_id) || null }));
})();

// The sandbox store is module-wide, so the fixture goes in once and every test shares it.
let seeded = null;
const sandbox = () => (seeded ||= seed());
async function seed() {
  const sb = createSandboxClient(() => null);
  const rows = {
    gl_accounts: ACCOUNTS,
    ledger_entries: DB.entries,
    ledger_lines: DB.lines,
    portfolios: PORTFOLIOS.map((p) => ({ id: p.id, project_id: PROJECT, name: p.name, status: p.status, metadata: {}, deleted_at: null, created_at: "2026-01-01T00:00:00Z" })),
    properties: PROPERTIES.map((p, i) => ({ id: p.id, project_id: PROJECT, name: p.name, portfolio_id: p.portfolioId, status: "Active", metadata: {}, deleted_at: null, created_at: `2026-01-0${i + 1}T00:00:00Z` })),
  };
  for (const [table, list] of Object.entries(rows)) {
    const { error } = await sb.from(table).insert(list.map((r) => ({ ...r })));
    assert.equal(error, null, table);
  }
  return sb;
}

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: ${a} vs ${b}`);
const RANGE = { preset: "custom", from: "2026-01-01", to: "2026-06-30" };

// A report's data bag for some filters, loaded through the real ledger loader (as the screen and the scheduled job do).
async function bagFor(sb, def, filters, properties = PROPERTIES) {
  const params = sourceParamsOf(def, filters, properties);
  const ledgerTotals = params.ledgerTotals ? await loadLedgerTotals(sb, PROJECT, params.ledgerTotals) : undefined;
  return { ledgerTotals, properties, portfolios: PORTFOLIOS };
}

// Amount per account label of a statement section.
const amounts = (result, key) => Object.fromEntries(result.sections.find((s) => s.key === key).rows.map((r) => [r.label, r.amount]));

test("scope: the property filter resolves all, one property or a portfolio's current members", () => {
  assert.equal(resolvePropertyScope({ propertyId: "all" }, PROPERTIES), null);
  assert.equal(resolvePropertyScope({}, PROPERTIES), null);
  assert.deepEqual(resolvePropertyScope({ propertyId: P3 }), [P3], "one property needs no property list");
  assert.deepEqual(resolvePropertyScope({ propertyId: portfolioScope(A) }, PROPERTIES), [P2, P1].sort());
  assert.deepEqual(resolvePropertyScope({ propertyId: portfolioScope(C) }, PROPERTIES), [], "an empty portfolio is no properties, never all");
  assert.deepEqual(resolvePropertyScope({ propertyId: portfolioScope(A) }, null), [], "before the properties load a portfolio resolves to none");
  assert.equal(portfolioIdOf("portfolio:"), null);
  assert.equal(portfolioIdOf(P1), null);
  assert.ok(inPropertyScope(null, "x") && inPropertyScope([P1], P1) && !inPropertyScope([], P1));
  assert.deepEqual(scopeLines(LINES, { propertyIds: [] }), []);
  assert.equal(scopeLines(LINES, { propertyIds: null }).length, LINES.length);
});

test("scope: the filter groups portfolios and properties, and labels the scope", () => {
  const opts = scopeOptions(PROPERTIES, PORTFOLIOS, "all");
  assert.deepEqual(opts[0], { value: "all", label: "All properties" });
  assert.deepEqual(opts.filter((o) => o.group === "Portfolios").map((o) => o.label), ["Downtown", "Empty", "Suburban"], "archived portfolios hide");
  assert.deepEqual(opts.filter((o) => o.group === "Properties").map((o) => o.value), [P2, P1, P3, P4].sort((a, b) => PROPERTIES.find((p) => p.id === a).name.localeCompare(PROPERTIES.find((p) => p.id === b).name)));
  assert.ok(scopeOptions(PROPERTIES, PORTFOLIOS, portfolioScope(D)).some((o) => o.value === portfolioScope(D)), "unless it is the current choice");
  assert.ok(scopeOptions(PROPERTIES, [], "all").every((o) => !o.group), "no portfolios keeps the flat list");
  const data = { properties: PROPERTIES, portfolios: PORTFOLIOS };
  assert.equal(scopeLabel({ propertyId: portfolioScope(A) }, data), "Downtown portfolio · 2 properties");
  assert.equal(scopeLabel({ propertyId: P3 }, data), "Pinecrest");
  assert.equal(scopeLabel({ propertyId: "all" }, data), "");
  assert.match(scopeSummary({ propertyId: portfolioScope(B) }, data), /^Suburban portfolio · 1 property — consolidated/);
});

test("portfolio: every report with a property filter resolves a portfolio to its members in its source params", () => {
  const f = { ...RANGE, propertyId: portfolioScope(A), view: "pnl" };
  const scoped = REPORTS.filter(hasPropertyFilter);
  assert.equal(scoped.length, REPORTS.filter((r) => r.filters?.some((x) => x.type === "property")).length);
  for (const def of scoped) {
    assert.ok(reportSources(def).includes("portfolios"), `${def.key} loads portfolios for its filter`);
    for (const p of Object.values(sourceParamsOf(def, f, PROPERTIES))) {
      if ("propertyIds" in p) assert.deepEqual(p.propertyIds, [P1, P2], `${def.key} loads the members only`);
    }
  }
  assert.deepEqual(sourceParamsOf(getReport("trial_balance"), f, PROPERTIES).ledgerTotals.propertyIds, [P1, P2]);
  assert.deepEqual(sourceParamsOf(getReport("general_ledger_detail"), f, PROPERTIES).ledger.propertyIds, [P1, P2]);
  assert.ok(!reportSources(getReport("vendor_1099")).includes("portfolios"), "the 1099 has no property filter");
});

test("portfolio: the P&L of a portfolio equals the sum of its properties' P&Ls, and its trial balance balances", async () => {
  const sb = await sandbox();
  const fs = getReport("financial_statements");
  const tb = getReport("trial_balance");
  const run = async (def, propertyId, properties = PROPERTIES) => {
    const f = { ...RANGE, propertyId, view: "pnl" };
    return runReport(def, await bagFor(sb, def, f, properties), f);
  };
  const [pa, p1, p2, all] = await Promise.all([run(fs, portfolioScope(A)), run(fs, P1), run(fs, P2), run(fs, "all")]);
  for (const key of ["income", "expenses"]) {
    const [x, y, z] = [amounts(pa, key), amounts(p1, key), amounts(p2, key)];
    assert.deepEqual(Object.keys(x).sort(), [...new Set([...Object.keys(y), ...Object.keys(z)])].sort());
    for (const label of Object.keys(x)) near(x[label], (y[label] || 0) + (z[label] || 0), `${key} ${label}`);
  }
  const net = (r) => r.sections.find((s) => s.key === "net").totals.amount;
  near(net(pa), net(p1) + net(p2), "net income");
  assert.equal(pa.subtitle, "Downtown portfolio · 2 properties");
  // Every scope adds up to the whole ledger: both portfolios, the unassigned property and the company line without a property.
  const company = incomeStatement(LINES.filter((l) => !l.propertyId), ACCTS, RANGE).net;
  const [pb, p4] = await Promise.all([run(fs, portfolioScope(B)), run(fs, P4)]);
  near(net(all), net(pa) + net(pb) + net(p4) + company, "the portfolios, the rest and the company line tie to the all-properties P&L");
  for (const scope of [portfolioScope(A), portfolioScope(B), P4, "all"]) {
    const r = await run(tb, scope);
    assert.equal(r.stats.find((s) => s.label === "Status").value, "Balanced", `TB ${scope}`);
  }
  // Each portfolio's TB equals the line math over its members' lines.
  const lineTb = trialBalance(scopeLines(LINES, { propertyIds: [P1, P2] }), ACCTS, RANGE);
  const aggTb = trialBalance(scopeLines(ledgerTotalsLines((await bagFor(sb, tb, { ...RANGE, propertyId: portfolioScope(A) })).ledgerTotals), { propertyIds: [P1, P2] }), ACCTS, RANGE);
  assert.deepEqual(aggTb.totals, lineTb.totals);
});

test("portfolio: moving a property to another portfolio changes the portfolio reports, never the ledger", async () => {
  const sb = await sandbox();
  const fs = getReport("financial_statements");
  const moved = PROPERTIES.map((p) => (p.id === P2 ? { ...p, portfolioId: B } : p));
  const before = JSON.stringify(DB.lines);
  const income = async (scope, properties) => {
    const f = { ...RANGE, propertyId: scope, view: "pnl" };
    return runReport(fs, await bagFor(sb, fs, f, properties), f).sections.find((s) => s.key === "income").totals.amount;
  };
  const [a0, b0, a1, b1, p2] = await Promise.all([income(portfolioScope(A), PROPERTIES), income(portfolioScope(B), PROPERTIES), income(portfolioScope(A), moved), income(portfolioScope(B), moved), income(P2, PROPERTIES)]);
  near(a1, a0 - p2, "Downtown loses Cascade Lofts");
  near(b1, b0 + p2, "Suburban gains it");
  assert.equal(JSON.stringify(DB.lines), before, "no ledger row changed");
});

test("portfolio: operational reports keep only the portfolio's properties", () => {
  const units = [
    { id: "u1", propertyId: P1, label: "1A", status: "Occupied", rent: 1500 },
    { id: "u2", propertyId: P3, label: "3A", status: "Vacant", rent: 1700 },
  ];
  const data = {
    properties: PROPERTIES,
    portfolios: PORTFOLIOS,
    units,
    leases: [{ id: "l1", unitId: "u1", propertyId: P1, status: "Active", tenantName: "Ana", rent: 1500, termStart: "2025-01-01", termEnd: "2027-01-01" }],
    tenants: [
      { id: "t1", name: "Ana", propertyId: P1, status: "Current", unit: "1A" },
      { id: "t2", name: "Bo", propertyId: P3, status: "Current", unit: "3A" },
    ],
    workOrders: [
      { id: "w1", propertyId: P1, name: "Leak", status: "Open", createdAt: "2026-03-02" },
      { id: "w2", propertyId: P3, name: "Fence", status: "Open", createdAt: "2026-03-03" },
    ],
    prospects: [{ id: "x1", propertyId: P3, createdAt: "2026-03-01" }],
    vendors: [{ id: "v1", name: "Plumbco", status: "Active", metadata: {} }],
    compliance: {},
    ledger: { lines: [], accounts: ACCTS },
  };
  const f = (key, extra = {}) => ({ ...RANGE, propertyId: portfolioScope(A), ...extra, ...(getReport(key).views ? { view: getReport(key).views[0].value } : {}) });
  const rows = (key, section, extra) => runReport(getReport(key), data, f(key, extra)).sections.find((s) => s.key === section).rows;
  assert.deepEqual(rows("rent_roll", "units", { status: "all" }).map((r) => r.id), ["u1"]);
  assert.deepEqual(rows("occupancy", "properties").map((r) => r.id), [P1]);
  assert.deepEqual(rows("maintenance_report", "list").map((r) => r.id), ["w1"]);
  const ins = rows("insurance_compliance", "requirements", { party: "all", state: "all" });
  assert.ok(ins.every((r) => r.id === "t:t1"), "residents of members only, and no vendors in a portfolio scope");
  assert.equal(runReport(getReport("leasing_report"), data, f("leasing_report")).stats[0].value, "0", "prospects outside the portfolio don't count");
});

test("portfolio: an empty portfolio is an empty report, not every property", () => {
  for (const def of REPORTS.filter(hasPropertyFilter)) {
    const r = runReport(def, { properties: PROPERTIES, portfolios: PORTFOLIOS }, { ...RANGE, propertyId: portfolioScope(C), view: def.views?.[0]?.value });
    assert.deepEqual(r.empty, EMPTY_PORTFOLIO, def.key);
  }
});

test("portfolio: a schedule keeps portfolio:<id> and its run emails the consolidated figures", async () => {
  const stored = storableFilters({ ...RANGE, preset: "ytd", propertyId: portfolioScope(A), view: "pnl" });
  assert.equal(stored.propertyId, portfolioScope(A));
  assert.ok(!("from" in stored) && !("propertyIds" in stored), "the range re-resolves at send time and membership is never frozen");
  const sb = await sandbox();
  const sent = [];
  const schedule = { id: "s1", project_id: PROJECT, name: "Downtown P&L", report_key: "financial_statements", filters: { ...RANGE, propertyId: portfolioScope(A), view: "pnl" }, recipients: ["owner@example.com"] };
  const run = await runSchedule(sb, schedule, { now: new Date("2026-07-01T12:00:00Z"), cache: new Map(), send: async (msg) => (sent.push(msg), { ok: true }) });
  assert.equal(run.status, "sent");
  assert.equal(sent.length, 1);
  const p1 = incomeStatement(scopeLines(LINES, { propertyIds: [P1] }), ACCTS, RANGE);
  const p2 = incomeStatement(scopeLines(LINES, { propertyIds: [P2] }), ACCTS, RANGE);
  const stat = (label) => sent[0].data.summary.find((s) => s.label === label).value;
  assert.equal(stat("Income"), money(p1.totalIncome + p2.totalIncome));
  assert.equal(stat("Expenses"), money(p1.totalExpense + p2.totalExpense));
  assert.equal(stat("Net income"), money(p1.net + p2.net));
  assert.match(sent[0].data.subtitle, /Downtown portfolio · 2 properties/);
});

test("portfolio math: fiscal year, year to date, pro-rated targets and the target checks", () => {
  assert.deepEqual(fiscalYearOf("2026-11-08", 1), { from: "2026-01-01", to: "2026-12-31" });
  assert.deepEqual(fiscalYearOf("2026-11-08", "7"), { from: "2026-07-01", to: "2027-06-30" });
  assert.deepEqual(fiscalYearOf("2026-03-08", 7), { from: "2025-07-01", to: "2026-06-30" });
  assert.deepEqual(fiscalYearOf("2026-03-08", "bad"), { from: "2026-01-01", to: "2026-12-31" });
  assert.deepEqual(ytdOf("2026-11-08", 7), { from: "2026-07-01", to: "2026-11-08" });
  const fy = fiscalYearOf("2026-07-02", 1);
  assert.equal(proRatedTarget(365000, fy, "2026-12-31"), 365000);
  assert.equal(proRatedTarget(365000, fy, "2026-01-01"), 1000);
  assert.equal(proRatedTarget(365000, fy, "2025-12-31"), 0);
  assert.equal(delinquencyPct(150, 6000), 2.5);
  assert.equal(delinquencyPct(150, 0), null);
  const ytd = { from: fy.from, to: "2026-07-02" };
  const c = targetChecks({ targets: { targetNoi: 365000, maxDelinquencyPct: 2 }, fiscalYear: fy, ytd, noi: 182000, delinquent: 150, rentRoll: 6000 });
  assert.deepEqual(c.noi, { annual: 365000, expected: 183000, actual: 182000, gap: -1000, met: false });
  assert.deepEqual(c.delinquency, { max: 2, pct: 2.5, amount: 150, rentRoll: 6000, met: false });
  const ok = targetChecks({ targets: { targetNoi: 365000, maxDelinquencyPct: 3 }, fiscalYear: fy, ytd, noi: 183000, delinquent: 150, rentRoll: 6000 });
  assert.ok(ok.noi.met && ok.delinquency.met);
  assert.deepEqual(targetChecks({ targets: {}, fiscalYear: fy, ytd }), { noi: null, delinquency: null });
});

test("portfolio math: NOI leaves out the manager's fee income, and property columns sum to the consolidated P&L", () => {
  const range = { from: "2026-01-01", to: "2026-06-30" };
  const lines = scopeLines(LINES, { propertyIds: [P1, P2] });
  const s = pnlSummary(lines, ACCTS, range);
  const fee = s.income.find((r) => r.id === "feeinc").amount;
  assert.ok(fee > 0);
  near(s.noi, s.totalIncome - fee - s.totalExpense, "NOI");
  near(s.net - s.noi, fee, "net income − NOI = the manager's fee income");
  const cmp = pnlByProperty(lines, ACCTS, range, [P1, P2]);
  assert.deepEqual(cmp.columns.map((c) => c.propertyId), [P1, P2]);
  for (const k of ["totalIncome", "totalExpense", "net", "noi", "feeIncome"]) near(cmp.columns.reduce((t, c) => t + c[k], 0), cmp.total[k], k);
  assert.deepEqual(cmp.total.net, s.net);
  const everyLine = pnlByProperty(LINES, ACCTS, range);
  assert.ok(everyLine.columns.some((c) => c.propertyId === ""), "lines without a property get their own column when unscoped");
  near(everyLine.columns.reduce((t, c) => t + c.net, 0), incomeStatement(LINES, ACCTS, range).net, "unscoped columns sum to the whole P&L");
});
