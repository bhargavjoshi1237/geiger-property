import { accountLabel } from "@/lib/ledger/postings";
import { ownershipIndex } from "@/lib/ledger/ownership";
import { money, pctLabel, round2 } from "./format";
import {
  AP_BUCKETS,
  balanceSheet,
  cashRegister,
  depositsHeldByLease,
  glDetail,
  incomeByProperty,
  incomeStatement,
  managementFeePostings,
  payableAging,
  scopeLines,
  sourceLabel,
  trialBalance,
  trustPositions,
  vendorPayments,
} from "./ledger_math";
import { DEPOSIT_MATCH_MAP, FILING_STATUS_MAP, LEDGER_STATUS_MAP, TRUST_STATUS_MAP } from "./maps";
import { formatIso, monthName, parseIso } from "./periods";
import { byId, list, nameMaps, optionsFrom, partyName, stat, sum } from "./lookups";
import { cashFlowFromTotals, emptyTotals, ledgerTotalsLines } from "./aggregates";
import { propertyScope } from "./source_params";

// Ledger-driven report definitions: trial balance, GL detail, financial
// statements, check register, management fees, A/P aging, deposits, 1099s.
// Trial balance and statements read server totals (ledgerTotals); the line reports read a bounded ledger window (CORE-41).

const L = (data) => data.ledger || { lines: [], accounts: { byId: new Map(), byKey: new Map(), list: [] } };
const T = (data) => data.ledgerTotals || emptyTotals();
const NO_LEDGER = {
  title: "No ledger activity yet",
  description: "Post charges, payments and bills in Accounting — this report reads the general ledger.",
};

// Empty state for a ledger source: a failed load, else no ledger at all (`any` from a bounded load, else its lines); null with data.
function ledgerEmpty(src) {
  if (src?.error) return { title: "Couldn't load the ledger", description: src.error };
  return (src?.any ?? src?.lines?.length > 0) ? null : NO_LEDGER;
}

// The bounded ledger window a line report needs: its range and property, with opening balances when it shows them.
const windowFor = (f, { opening = false } = {}) => ({ ledger: { from: f.from, to: f.to, propertyIds: propertyScope(f), opening } });

const stmtCols = [
  { key: "label", header: "Line" },
  { key: "amount", header: "Amount", format: "money" },
];
const stmtRows = (rows, emptyLabel) =>
  rows.length ? rows.map((r) => ({ id: r.id, label: r.label, amount: r.amount })) : [{ id: "none", label: emptyLabel, amount: 0, muted: true }];

export const trialBalanceReport = {
  key: "trial_balance",
  title: "Trial Balance",
  description: "Opening balance, period debits and credits, and closing balance for every GL account.",
  category: "Financial",
  keywords: ["tb", "debits", "credits", "gl", "general ledger", "accounts", "balances", "opening", "closing", "month end", "close"],
  sources: ["ledgerTotals", "properties"],
  sourceParams: (f) => ({ ledgerTotals: { from: f.from, to: f.to, grain: "range", propertyIds: propertyScope(f) } }),
  filters: [{ type: "range", defaultPreset: "this_month" }, { type: "property" }],
  compute(data, f) {
    const empty = ledgerEmpty(T(data));
    if (empty) return { empty };
    const lines = scopeLines(ledgerTotalsLines(T(data)), { propertyId: f.propertyId });
    const tb = trialBalance(lines, T(data).accounts, f);
    return {
      stats: [
        stat("Debits", money(tb.totals.debit), "Posted in period"),
        stat("Credits", money(tb.totals.credit), "Posted in period"),
        stat("Accounts", tb.rows.length, "With activity or a balance"),
        stat("Status", tb.balanced ? "Balanced" : "Out of balance", tb.balanced ? "Debits equal credits" : `Off by ${money(Math.abs(tb.totals.closingDr - tb.totals.closingCr))}`),
      ],
      sections: [
        {
          key: "tb",
          title: "Trial balance",
          description: `Closing balances through ${formatIso(f.to)}; opening is everything before ${formatIso(f.from)}.`,
          columns: [
            { key: "label", header: "Account" },
            { key: "accountType", header: "Type" },
            { key: "opening", header: "Opening", format: "money" },
            { key: "debit", header: "Debits", format: "money" },
            { key: "credit", header: "Credits", format: "money" },
            { key: "closingDr", header: "Closing Dr", format: "money" },
            { key: "closingCr", header: "Closing Cr", format: "money" },
          ],
          rows: tb.rows,
          totals: tb.totals,
          emptyTitle: "No balances in this range",
        },
      ],
    };
  },
};

export const generalLedgerDetailReport = {
  key: "general_ledger_detail",
  title: "General Ledger Detail",
  description: "Every posted line by account, with opening balances and a running balance.",
  category: "Financial",
  keywords: ["gl", "general ledger", "journal", "lines", "postings", "running balance", "account activity", "audit"],
  sources: ["ledger", "properties"],
  sourceParams: (f) => windowFor(f, { opening: true }),
  filters: [
    { type: "range", defaultPreset: "this_month" },
    { type: "property" },
    {
      key: "glAccountId",
      label: "Account",
      type: "select",
      options: (data) => optionsFrom(
        [...L(data).accounts.list].sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true })),
        "All accounts",
        accountLabel,
      ),
    },
  ],
  compute(data, f) {
    const empty = ledgerEmpty(L(data));
    if (empty) return { empty };
    const lines = scopeLines(L(data).lines, { propertyId: f.propertyId });
    const gl = glDetail(lines, L(data).accounts, f);
    const posted = gl.rows.filter((r) => r.kind === "line");
    return {
      stats: [
        stat("Accounts", gl.summary.length, "In this view"),
        stat("Lines", posted.length, "Posted in period"),
        stat("Debits", money(sum(posted, "debit"))),
        stat("Credits", money(sum(posted, "credit"))),
      ],
      sections: [
        {
          key: "summary",
          title: "By account",
          columns: [
            { key: "account", header: "Account" },
            { key: "opening", header: "Opening", format: "money" },
            { key: "debit", header: "Debits", format: "money" },
            { key: "credit", header: "Credits", format: "money" },
            { key: "closing", header: "Closing", format: "money" },
            { key: "count", header: "Lines", format: "number" },
          ],
          rows: gl.summary,
          emptyTitle: "No activity in this range",
        },
        {
          key: "detail",
          title: "Detail",
          searchable: true,
          columns: [
            { key: "date", header: "Date", format: "date" },
            { key: "account", header: "Account" },
            { key: "source", header: "Type" },
            { key: "memo", header: "Memo" },
            { key: "status", header: "Status", format: "status", statusMap: LEDGER_STATUS_MAP },
            { key: "debit", header: "Debit", format: "money" },
            { key: "credit", header: "Credit", format: "money" },
            { key: "balance", header: "Balance", format: "money" },
          ],
          rows: gl.rows,
          emptyTitle: "No lines in this range",
        },
      ],
    };
  },
};

const FS_VIEWS = [
  { value: "pnl", label: "Profit & Loss" },
  { value: "balance", label: "Balance Sheet" },
  { value: "cash", label: "Cash Flow" },
];

export const financialStatementsReport = {
  key: "financial_statements",
  title: "Financial Statements",
  description: "Profit & loss, balance sheet, and cash flow from the general ledger.",
  category: "Financial",
  keywords: ["p&l", "pnl", "profit and loss", "income statement", "balance sheet", "cash flow", "noi", "net income", "assets", "liabilities", "equity"],
  sources: ["ledgerTotals", "properties"],
  sourceParams: (f) => ({ ledgerTotals: { from: f.from, to: f.to, grain: "range", propertyIds: propertyScope(f), cash: true } }),
  views: FS_VIEWS,
  filters: [{ type: "range", defaultPreset: "this_month" }, { type: "property" }],
  compute(data, f) {
    const empty = ledgerEmpty(T(data));
    if (empty) return { empty };
    const accounts = T(data).accounts;
    const lines = scopeLines(ledgerTotalsLines(T(data)), { propertyId: f.propertyId });
    const view = f.view || "pnl";
    if (view === "balance") {
      const bs = balanceSheet(lines, accounts, f.to);
      const diff = round2(bs.totalAssets - bs.totalLiabilities - bs.totalEquity);
      return {
        stats: [
          stat("Total assets", money(bs.totalAssets), `As of ${formatIso(f.to)}`),
          stat("Total liabilities", money(bs.totalLiabilities)),
          stat("Total equity", money(bs.totalEquity), "Incl. current earnings"),
          stat("Check", bs.balanced ? "Balanced" : money(diff), bs.balanced ? "Assets = liabilities + equity" : "Assets − (liabilities + equity)"),
        ],
        sections: [
          { key: "assets", title: "Assets", kind: "statement", span: "half", columns: stmtCols, rows: stmtRows(bs.assets, "No assets"), totals: { label: "Total assets", amount: bs.totalAssets } },
          { key: "liabilities", title: "Liabilities", kind: "statement", span: "half", columns: stmtCols, rows: stmtRows(bs.liabilities, "No liabilities"), totals: { label: "Total liabilities", amount: bs.totalLiabilities } },
          { key: "equity", title: "Equity", kind: "statement", span: "half", columns: stmtCols, rows: stmtRows(bs.equity, "No equity"), totals: { label: "Total equity", amount: bs.totalEquity } },
          {
            key: "check",
            title: "Liabilities + equity",
            kind: "statement",
            span: "half",
            columns: stmtCols,
            rows: [
              { id: "l", label: "Total liabilities", amount: bs.totalLiabilities },
              { id: "e", label: "Total equity", amount: bs.totalEquity },
            ],
            totals: { label: "Liabilities + equity", amount: round2(bs.totalLiabilities + bs.totalEquity) },
          },
        ],
      };
    }
    if (view === "cash") {
      const cf = cashFlowFromTotals(T(data));
      return {
        stats: [
          stat("Opening cash", money(cf.opening), formatIso(f.from)),
          stat("Cash in", money(cf.inflow)),
          stat("Cash out", money(cf.outflow)),
          stat("Closing cash", money(cf.closing), formatIso(f.to)),
        ],
        sections: [
          {
            key: "chart",
            title: "Monthly cash flow",
            kind: "chart",
            chart: { x: "label", series: [{ key: "inflow", label: "Cash in" }, { key: "outflow", label: "Cash out" }] },
            columns: [
              { key: "label", header: "Month" },
              { key: "inflow", header: "Cash in", format: "money" },
              { key: "outflow", header: "Cash out", format: "money" },
              { key: "net", header: "Net", format: "money" },
            ],
            rows: cf.byMonth.map((m) => ({ ...m, label: monthName(m.key) })),
          },
          {
            key: "activity",
            title: "By activity",
            description: "Operating = rent, bills and other cash; financing = owner contributions and distributions.",
            columns: [
              { key: "label", header: "Activity" },
              { key: "inflow", header: "Cash in", format: "money" },
              { key: "outflow", header: "Cash out", format: "money" },
              { key: "net", header: "Net", format: "money" },
            ],
            rows: cf.byCategory,
            totals: { label: "Net change in cash", inflow: cf.inflow, outflow: cf.outflow, net: cf.net },
          },
        ],
      };
    }
    const pl = incomeStatement(lines, accounts, f);
    return {
      stats: [
        stat("Income", money(pl.totalIncome)),
        stat("Expenses", money(pl.totalExpense)),
        stat("Net income", money(pl.net), "Income − expenses"),
        stat("Margin", pl.totalIncome ? pctLabel(pl.net / pl.totalIncome) : "0%", "Net of income"),
      ],
      sections: [
        { key: "income", title: "Income", kind: "statement", span: "half", columns: stmtCols, rows: stmtRows(pl.income, "No income in this period"), totals: { label: "Total income", amount: pl.totalIncome } },
        { key: "expenses", title: "Expenses", kind: "statement", span: "half", columns: stmtCols, rows: stmtRows(pl.expenses, "No expenses in this period"), totals: { label: "Total expenses", amount: pl.totalExpense } },
        {
          key: "net",
          title: "Net income",
          kind: "statement",
          columns: stmtCols,
          rows: [
            { id: "i", label: "Total income", amount: pl.totalIncome },
            { id: "e", label: "Less total expenses", amount: -pl.totalExpense },
          ],
          totals: { label: "Net income", amount: pl.net },
        },
      ],
    };
  },
};

export const checkRegisterReport = {
  key: "check_register",
  title: "Check & Payment Register",
  description: "Every deposit and payment through your cash accounts, with a running balance.",
  category: "Banking",
  keywords: ["checks", "check register", "payments", "deposits", "cash", "bank", "running balance", "disbursements", "receipts"],
  sources: ["ledger", "properties", "bankAccounts", "vendors", "tenants", "owners", "leases"],
  sourceParams: (f) => windowFor(f, { opening: true }),
  filters: [
    { type: "range", defaultPreset: "this_month" },
    { type: "property" },
    { key: "bankAccountId", label: "Bank account", type: "select", options: (data) => optionsFrom(data.bankAccounts, "All bank accounts", (b) => [b.name, b.last4 ? `••${b.last4}` : ""].filter(Boolean).join(" ")) },
  ],
  compute(data, f) {
    const empty = ledgerEmpty(L(data));
    if (empty) return { empty };
    const names = nameMaps(data);
    const lines = scopeLines(L(data).lines, { propertyId: f.propertyId });
    const reg = cashRegister(lines, L(data).accounts, f);
    const rows = reg.rows.map((r) => ({
      ...r,
      party: partyName(r, names),
      bank: names.bank.get(r.bankAccountId) || r.account,
      property: names.property.get(r.propertyId) || "",
    }));
    const deposits = round2(sum(rows, "deposit"));
    const payments = round2(sum(rows, "payment"));
    return {
      stats: [
        stat("Opening balance", money(reg.opening), formatIso(f.from)),
        stat("Deposits", money(deposits), `${rows.filter((r) => r.deposit).length} items`),
        stat("Payments", money(payments), `${rows.filter((r) => r.payment).length} items`),
        stat("Closing balance", money(reg.closing), formatIso(f.to)),
      ],
      sections: [
        {
          key: "register",
          title: "Register",
          searchable: true,
          columns: [
            { key: "date", header: "Date", format: "date" },
            { key: "type", header: "Type" },
            { key: "reference", header: "Ref / method" },
            { key: "party", header: "Payee / payer" },
            { key: "memo", header: "Memo" },
            { key: "bank", header: "Account" },
            { key: "status", header: "Status", format: "status", statusMap: LEDGER_STATUS_MAP },
            { key: "deposit", header: "Deposit", format: "money" },
            { key: "payment", header: "Payment", format: "money" },
            { key: "balance", header: "Balance", format: "money" },
          ],
          rows,
          totals: { date: "", type: "Totals", deposit: deposits, payment: payments, balance: reg.closing },
          emptyTitle: "No cash movement in this range",
        },
      ],
    };
  },
};

export const managementFeesReport = {
  key: "management_fees",
  title: "Management Fees",
  description: "Fees booked per property and owner against the income they were earned on.",
  category: "Owners & trust",
  keywords: ["management fee", "fees", "fee income", "owners", "effective rate", "commission"],
  sources: ["ledger", "properties", "owners", "propertyOwners"],
  sourceParams: (f) => windowFor(f),
  filters: [{ type: "range", defaultPreset: "this_month" }, { type: "property" }],
  compute(data, f) {
    const empty = ledgerEmpty(L(data));
    if (empty) return { empty };
    const accounts = L(data).accounts;
    const names = nameMaps(data);
    const lines = scopeLines(L(data).lines, { propertyId: f.propertyId });
    const postings = managementFeePostings(lines, accounts, f);
    const income = incomeByProperty(lines, accounts, f);
    const owners = byId(data.owners);
    const links = list(data.propertyOwners);
    const props = new Set([...income.keys(), ...postings.map((p) => p.propertyId).filter(Boolean)]);
    const rows = [...props].map((pid) => {
      const mine = postings.filter((p) => p.propertyId === pid);
      const link = links.find((r) => r.propertyId === pid && r.isPrimary) || links.find((r) => r.propertyId === pid);
      const owner = owners.get(link?.ownerId) || owners.get(mine[0]?.ownerId);
      const base = income.get(pid) || 0;
      const fee = round2(sum(mine, "amount"));
      const pct = Number(owner?.managementFeePct) || 0;
      const expected = round2((base * pct) / 100);
      return { id: pid, property: names.property.get(pid) || "Unassigned", owner: owner?.name || "", base, fee, rate: base > 0 ? fee / base : 0, pct, expected, variance: round2(fee - expected) };
    }).sort((a, b) => b.fee - a.fee);
    const fees = round2(sum(rows, "fee"));
    const base = round2(sum(rows, "base"));
    const months = new Map();
    for (const p of postings) {
      const k = p.date.slice(0, 7);
      months.set(k, round2((months.get(k) || 0) + p.amount));
    }
    return {
      stats: [
        stat("Fees booked", money(fees), `${postings.length} postings`),
        stat("Income base", money(base), "Property income in period"),
        stat("Effective rate", base ? pctLabel(fees / base, 1) : "0%", "Fees ÷ income"),
        stat("Variance", money(round2(sum(rows, "variance"))), "Booked − expected at owner %"),
      ],
      sections: [
        {
          key: "by_property",
          title: "By property",
          columns: [
            { key: "property", header: "Property" },
            { key: "owner", header: "Owner" },
            { key: "base", header: "Income", format: "money" },
            { key: "pct", header: "Agreed %", value: (r) => (r.pct ? `${r.pct}%` : "—") },
            { key: "expected", header: "Expected", format: "money" },
            { key: "fee", header: "Booked", format: "money" },
            { key: "rate", header: "Effective", format: "percent", digits: 1 },
            { key: "variance", header: "Variance", format: "money" },
          ],
          rows,
          totals: { property: "Totals", base, expected: round2(sum(rows, "expected")), fee: fees, variance: round2(sum(rows, "variance")) },
          emptyTitle: "No fees or income in this range",
        },
        {
          key: "by_month",
          title: "By month",
          span: "half",
          columns: [
            { key: "label", header: "Month" },
            { key: "amount", header: "Fees", format: "money" },
          ],
          rows: [...months.entries()].sort().map(([k, amount]) => ({ id: k, label: monthName(k), amount })),
          emptyTitle: "No fees booked",
        },
        {
          key: "postings",
          title: "Postings",
          span: "half",
          columns: [
            { key: "date", header: "Date", format: "date" },
            { key: "property", header: "Property", value: (r) => names.property.get(r.propertyId) || "—" },
            { key: "memo", header: "Memo" },
            { key: "amount", header: "Amount", format: "money" },
          ],
          rows: postings,
          emptyTitle: "No fees booked",
        },
      ],
    };
  },
};

export const apAgingReport = {
  key: "ap_aging",
  title: "A/P Aging",
  description: "Unpaid bills by days past due, from the ledger's accounts payable, grouped by payee (vendors, tenant refunds, owners).",
  category: "Payables",
  keywords: ["ap", "a/p", "accounts payable", "bills", "unpaid", "past due", "aging", "vendors", "payables"],
  sources: ["ledger", "properties", "vendors", "tenants", "owners"],
  // Every payable line through the as-of day: open items match payments to bills across the whole history.
  sourceParams: (f) => ({ ledger: { to: f.to, subtypes: ["payable"] } }),
  filters: [{ type: "range", mode: "asOf", defaultPreset: "today" }, { type: "property" }],
  compute(data, f) {
    const empty = ledgerEmpty(L(data));
    if (empty) return { empty };
    const names = nameMaps(data);
    const payeeName = (b) =>
      (b.payeeType === "vendor" && names.vendor.get(b.payeeId)) ||
      (b.payeeType === "tenant" && `${names.tenant.get(b.payeeId) || "Tenant"} (tenant)`) ||
      (b.payeeType === "owner" && `${names.owner.get(b.payeeId) || "Owner"} (owner)`) ||
      "No payee";
    const bills = payableAging(L(data).lines, L(data).accounts, f.to)
      .filter((b) => !f.propertyId || f.propertyId === "all" || b.propertyId === f.propertyId)
      .map((b) => ({ ...b, vendor: payeeName(b), property: names.property.get(b.propertyId) || "" }));
    const byVendor = new Map();
    for (const b of bills) {
      const v = byVendor.get(b.vendor) || { id: b.vendor, vendor: b.vendor, bills: 0, open: 0, current: 0, b1: 0, b31: 0, b61: 0, b91: 0 };
      v.bills += 1;
      for (const k of ["open", "current", "b1", "b31", "b61", "b91"]) v[k] = round2(v[k] + b[k]);
      byVendor.set(b.vendor, v);
    }
    const vendors = [...byVendor.values()].sort((a, b) => b.open - a.open);
    const bucketCols = AP_BUCKETS.map((b) => ({ key: b.key, header: b.label, format: "money" }));
    const total = round2(sum(bills, "open"));
    const pastDue = round2(total - sum(bills, "current"));
    const totals = { vendor: "Totals", bills: bills.length, open: total };
    for (const b of AP_BUCKETS) totals[b.key] = round2(sum(bills, b.key));
    return {
      stats: [
        stat("Total payable", money(total), `${bills.length} open bills`),
        stat("Past due", money(pastDue), `As of ${formatIso(f.to)}`),
        stat("Over 60 days", money(round2(sum(bills, "b61") + sum(bills, "b91")))),
        stat("Payees owed", vendors.length),
      ],
      sections: [
        {
          key: "vendors",
          title: "By payee",
          columns: [{ key: "vendor", header: "Payee" }, { key: "bills", header: "Bills", format: "number" }, ...bucketCols, { key: "open", header: "Total", format: "money" }],
          rows: vendors,
          totals,
          emptyTitle: "No unpaid bills",
          emptyDescription: "Every posted bill is paid as of this date.",
        },
        {
          key: "bills",
          title: "Open bills",
          searchable: true,
          columns: [
            { key: "vendor", header: "Payee" },
            { key: "memo", header: "Bill" },
            { key: "property", header: "Property" },
            { key: "billDate", header: "Billed", format: "date" },
            { key: "dueDate", header: "Due", format: "date" },
            { key: "daysPastDue", header: "Days past due", format: "number" },
            { key: "amount", header: "Amount", format: "money" },
            { key: "paid", header: "Paid", format: "money" },
            { key: "open", header: "Open", format: "money" },
          ],
          rows: bills,
          emptyTitle: "No unpaid bills",
        },
      ],
    };
  },
};

export const depositDetailReport = {
  key: "deposit_detail",
  title: "Deposit Detail",
  description: "Security deposits held per lease against the ledger, trust cash positions, and deposit activity.",
  category: "Owners & trust",
  keywords: ["security deposits", "deposits held", "trust", "trust cash", "deposit interest", "reconciliation", "shortfall"],
  sources: ["ledger", "deposits", "leases", "tenants", "units", "properties", "owners", "propertyOwners"],
  filters: [{ type: "range", defaultPreset: "ytd" }, { type: "property" }],
  compute(data, f) {
    const names = nameMaps(data);
    const accounts = L(data).accounts;
    const lines = scopeLines(L(data).lines, { propertyId: f.propertyId });
    // Held = 2100 per lease; deposit interest (2110) shows beside it; other deposits (2120, CORE-18) aren't security deposits.
    const held = depositsHeldByLease(lines, accounts, f.to, { systemKeys: ["security_deposits"] });
    const interestHeld = depositsHeldByLease(lines, accounts, f.to, { systemKeys: ["deposit_interest_payable"] });
    const leases = byId(data.leases);
    const units = byId(data.units);
    const recorded = new Map();
    for (const d of list(data.deposits)) {
      const key = d.leaseId || (d.tenantId ? `tenant:${d.tenantId}` : `deposit:${d.id}`);
      // CORE-04: a record is on the ledger once it has a charge_entry_id; a returned, partly returned or forfeited one holds nothing (the rest was applied to charges).
      const disposed = Boolean(d.applyEntryId || d.metadata?.disposition?.committedAt);
      const open = !disposed && (["Held", "Awaiting disposition"].includes(d.status) || (d.status === "Pending" && Boolean(d.chargeEntryId)));
      const amt = open ? Number(d.amount) || 0 : 0;
      const r = recorded.get(key) || { amount: 0, statuses: new Set(), location: "", deposit: d, unposted: 0 };
      r.amount += amt;
      if (open && !d.chargeEntryId) r.unposted += 1;
      r.statuses.add(d.status);
      r.location = r.location || d.heldLocation || "";
      recorded.set(key, r);
    }
    const keys = new Set([...held.keys(), ...recorded.keys()]);
    const rows = [...keys]
      .map((key) => {
        const rec = recorded.get(key);
        const lease = leases.get(key);
        const dep = rec?.deposit || {};
        const propertyId = lease?.propertyId || dep.propertyId || units.get(lease?.unitId || dep.unitId)?.propertyId || "";
        const ledger = round2(held.get(key) || 0);
        const amount = round2(rec?.amount || 0);
        const diff = round2(ledger - amount);
        const interest = round2(interestHeld.get(key) || 0);
        return {
          id: key,
          lease: lease?.name || dep.leaseName || dep.name || "Deposit",
          tenant: lease?.tenantName || dep.tenantName || names.tenant.get(dep.tenantId) || "",
          unit: names.unit.get(lease?.unitId || dep.unitId) || lease?.unit || dep.unit || "",
          property: names.property.get(propertyId) || "",
          propertyId,
          location: rec?.location || "",
          status: rec ? [...rec.statuses].join(", ") : "Ledger only",
          recorded: amount,
          ledger,
          interest,
          diff,
          match: rec?.unposted || (!ledger && amount) ? "unposted" : Math.abs(diff) < 0.01 ? "match" : diff > 0 ? "over" : "under",
        };
      })
      .filter((r) => (!f.propertyId || f.propertyId === "all" || r.propertyId === f.propertyId) && (r.recorded || r.ledger || r.interest || r.match === "unposted"))
      .sort((a, b) => a.property.localeCompare(b.property) || a.unit.localeCompare(b.unit, undefined, { numeric: true }));
    // Owner positions split each property's trust by the ownership in force on each line's date.
    const trust = trustPositions(lines, accounts, f.to, ownershipIndex(list(data.propertyOwners))).map((t) => ({
      ...t,
      owner: names.owner.get(t.ownerId) || (t.ownerId ? "Owner" : "Unassigned"),
      property: names.property.get(t.propertyId) || "",
      state: t.balance < 0 ? "short" : "ok",
    }));
    const activity = [];
    const seen = new Set();
    for (const l of scopeLines(lines, f)) {
      const t = l.entry?.sourceType;
      // Deposit source types, plus sweeps, releases and refund bills tagged with a deposit (CORE-04).
      if (!(["deposit_held", "deposit_return", "deposit_interest"].includes(t) || l.metadata?.depositId) || seen.has(l.entryId)) continue;
      seen.add(l.entryId);
      activity.push({ id: l.entryId, date: l.date, type: sourceLabel(t), memo: l.entry?.memo || "", tenant: names.lease.get(l.leaseId) || names.tenant.get(l.tenantId) || "", amount: Number(l.entry?.total) || 0 });
    }
    const totalHeld = round2(sum(rows, "ledger"));
    const totalRecorded = round2(sum(rows, "recorded"));
    const depositCash = round2(sum(trust.filter((t) => t.systemKey === "deposit_cash"), "balance"));
    if (!rows.length && !trust.length && !activity.length) {
      return { empty: { title: "No deposits yet", description: "Record security deposits on leases, or post deposits received in Accounting." } };
    }
    return {
      stats: [
        stat("Held (ledger)", money(totalHeld), `As of ${formatIso(f.to)}`),
        stat("Recorded on leases", money(totalRecorded), `${rows.length} leases`),
        stat("Variance", money(round2(totalHeld - totalRecorded)), "Ledger − deposit records"),
        stat("Deposit trust cash", money(depositCash), `${trust.filter((t) => t.state === "short").length} shortfalls`),
      ],
      sections: [
        {
          key: "leases",
          title: "Deposits by lease",
          searchable: true,
          columns: [
            { key: "tenant", header: "Tenant" },
            { key: "unit", header: "Unit" },
            { key: "property", header: "Property" },
            { key: "location", header: "Held at" },
            { key: "status", header: "Record status" },
            { key: "recorded", header: "Recorded", format: "money" },
            { key: "ledger", header: "Ledger", format: "money" },
            { key: "interest", header: "Interest held", format: "money" },
            { key: "match", header: "Reconciliation", format: "status", statusMap: DEPOSIT_MATCH_MAP },
          ],
          rows,
          totals: { tenant: "Totals", recorded: totalRecorded, ledger: totalHeld, interest: round2(sum(rows, "interest")) },
          emptyTitle: "No deposits held",
        },
        {
          key: "trust",
          title: "Trust positions",
          description: "Trust cash per account, owner and property. A negative position means one owner's funds are covering another's.",
          columns: [
            { key: "account", header: "Trust account" },
            { key: "owner", header: "Owner" },
            { key: "property", header: "Property" },
            { key: "state", header: "Status", format: "status", statusMap: TRUST_STATUS_MAP },
            { key: "balance", header: "Balance", format: "money" },
          ],
          rows: trust,
          emptyTitle: "No trust cash yet",
        },
        {
          key: "activity",
          title: "Deposit activity",
          columns: [
            { key: "date", header: "Date", format: "date" },
            { key: "type", header: "Type" },
            { key: "tenant", header: "Tenant / lease" },
            { key: "memo", header: "Memo" },
            { key: "amount", header: "Amount", format: "money" },
          ],
          rows: activity,
          emptyTitle: "No deposit postings in this range",
        },
      ],
    };
  },
};

// IRS 1099-NEC/MISC reporting threshold: $600 through 2025, $2,000 from 2026.
export const thresholdForYear = (year) => (Number(year) >= 2026 ? 2000 : 600);

export const vendor1099Report = {
  key: "vendor_1099",
  title: "1099 Summary",
  description: "Cash paid to each vendor in the period against the 1099 reporting threshold, with W-9 status.",
  category: "Tax",
  keywords: ["1099", "1099-nec", "1099-misc", "irs", "w-9", "w9", "tin", "vendor payments", "tax", "year end"],
  sources: ["ledger", "vendors"],
  sourceParams: (f) => ({ ledger: { from: f.from, to: f.to } }),
  filters: [
    { type: "range", defaultPreset: "last_year" },
    {
      key: "threshold",
      label: "Threshold",
      type: "select",
      options: () => [
        { value: "auto", label: "Threshold for the tax year" },
        { value: "2000", label: "$2,000 (2026+)" },
        { value: "600", label: "$600 (2025 and earlier)" },
      ],
      default: "auto",
    },
  ],
  compute(data, f) {
    const empty = ledgerEmpty(L(data));
    if (empty) return { empty };
    const year = parseIso(f.from)?.getFullYear();
    const threshold = f.threshold && f.threshold !== "auto" ? Number(f.threshold) : thresholdForYear(year);
    const vendors = byId(data.vendors);
    const rows = vendorPayments(L(data).lines, L(data).accounts, f)
      .filter((p) => p.total > 0)
      .map((p) => {
        const v = vendors.get(p.vendorId) || {};
        const m = v.metadata || {};
        const eligible = m.is1099 ?? true;
        const over = p.total >= threshold;
        return {
          id: p.vendorId,
          vendor: v.name || "Unknown vendor",
          taxpayer: m.taxpayerName || "",
          tin: m.tinLast4 ? `${m.tinType || "TIN"} ••${m.tinLast4}` : "",
          eligible,
          w9: Boolean(m.w9OnFile),
          payments: p.payments,
          last: p.last,
          total: p.total,
          state: !eligible ? "exempt" : !over ? "below" : m.w9OnFile ? "reportable" : "missing_w9",
        };
      })
      .sort((a, b) => b.total - a.total);
    const reportable = rows.filter((r) => r.state === "reportable" || r.state === "missing_w9");
    return {
      stats: [
        stat("Reportable vendors", reportable.length, `Paid ≥ ${money(threshold)}`),
        stat("Reportable total", money(round2(sum(reportable, "total")))),
        stat("Missing W-9", reportable.filter((r) => !r.w9).length, "Reportable without a W-9"),
        stat("Total paid", money(round2(sum(rows, "total"))), `${rows.length} vendors`),
      ],
      sections: [
        {
          key: "vendors",
          title: `Vendor payments · threshold ${money(threshold)}`,
          description: "Cash actually paid (bill payments and cash expenses tagged with the vendor), net of voids.",
          searchable: true,
          columns: [
            { key: "vendor", header: "Vendor" },
            { key: "taxpayer", header: "Taxpayer name" },
            { key: "tin", header: "TIN" },
            { key: "w9", header: "W-9 on file", format: "bool" },
            { key: "payments", header: "Payments", format: "number" },
            { key: "last", header: "Last paid", format: "date" },
            { key: "total", header: "Total paid", format: "money" },
            { key: "state", header: "1099 status", format: "status", statusMap: FILING_STATUS_MAP },
          ],
          rows,
          emptyTitle: "No vendor payments in this period",
        },
      ],
    };
  },
};

export const FINANCIAL_REPORTS = [
  financialStatementsReport,
  trialBalanceReport,
  generalLedgerDetailReport,
  checkRegisterReport,
  apAgingReport,
  depositDetailReport,
  managementFeesReport,
  vendor1099Report,
];
