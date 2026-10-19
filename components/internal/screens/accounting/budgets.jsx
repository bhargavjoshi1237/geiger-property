"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { LayoutDashboard, PiggyBank, CalendarRange, Scale, Clock, Plus, Trash2 } from "lucide-react";

import { DataTable, EmptyState, StatusPill } from "@/components/internal/shared/screen_kit";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { budgetsLayer } from "@/lib/supabase/budgets";
import { budgetLinesLayer } from "@/lib/supabase/budget_lines";
import { getLedgerAccounts, listLedger } from "@/lib/supabase/ledger";
import { propertyOptions } from "@/lib/supabase/options";
import { accountLabel, round2 } from "@/lib/ledger/postings";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { BUDGET_STATUS_MAP, filterOptions, currency, money } from "./shared";
import { SectionLoading, SummaryTiles } from "./sections";
import { AccountSelect } from "./ledger_dialogs";

// Budgets — operating budgets per property over `property.budgets`. Monthly
// amounts per GL account live in `property.budget_lines`; their income/expense
// sums are written back to totalIncome / totalExpense. Actuals come from the ledger.

const STATUS_OPTIONS = filterOptions(BUDGET_STATUS_MAP).slice(1);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const BUDGET_TYPES = ["Income", "Expense"];
const thisYear = () => new Date().getFullYear();
const sumOf = (list, fn) => list.reduce((s, x) => s + (Number(fn(x)) || 0), 0);

// Spread an annual amount over 12 months in cents; the remainder lands in December.
function spreadAnnual(total) {
  const cents = Math.round((Number(total) || 0) * 100);
  const base = Math.floor(cents / 12);
  return MONTHS.map((_, i) => (i === 11 ? cents - base * 11 : base) / 100);
}

// Number input that commits on blur / Enter (and only when the value changed).
function AmountCell({ value, onCommit, className = "" }) {
  const [draft, setDraft] = useState(value ? String(value) : "");
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value ? String(value) : "");
  }
  const commit = () => {
    const n = round2(draft);
    if (n !== round2(value)) onCommit(n);
  };
  return (
    <Input
      type="number"
      value={draft}
      placeholder="0"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={`h-8 min-w-[84px] px-2 text-right tabular-nums ${className}`}
    />
  );
}

// Monthly grid: one row per GL account, Jan–Dec + an editable annual total.
function MonthlySection({ item, onCommit }) {
  const [lines, setLines] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [extra, setExtra] = useState([]);
  const [pick, setPick] = useState("");
  const year = Number(item.year) || thisYear();

  useEffect(() => {
    let alive = true;
    Promise.all([budgetLinesLayer.list({ budgetId: item.id }), getLedgerAccounts()]).then(([l, a]) => {
      if (!alive) return;
      setLines(l || []);
      setAccounts(a || { byId: new Map(), byKey: new Map(), list: [] });
    });
    return () => {
      alive = false;
    };
  }, [item.id]);

  const rows = useMemo(() => {
    if (!lines || !accounts) return [];
    const ids = [...new Set([...lines.map((l) => l.glAccountId), ...extra])].filter(Boolean);
    return ids
      .map((id) => {
        const a = accounts.byId.get(id);
        const own = lines.filter((l) => l.glAccountId === id);
        const months = MONTHS.map((_, i) => own.find((l) => Number(l.month) === i + 1) || null);
        return {
          id,
          account: a,
          label: a ? accountLabel(a) : own[0]?.accountLabel || "Unknown account",
          type: a?.accountType || "Expense",
          months,
          total: round2(sumOf(own, (l) => l.amount)),
        };
      })
      .sort((x, y) => BUDGET_TYPES.indexOf(x.type) - BUDGET_TYPES.indexOf(y.type) || String(x.account?.number || "").localeCompare(String(y.account?.number || ""), undefined, { numeric: true }));
  }, [lines, accounts, extra]);

  if (!lines || !accounts) return <SectionLoading />;

  // Rewrite the budget's totals columns from the current lines.
  const syncTotals = (next) => {
    const byType = (t) => round2(sumOf(next.filter((l) => (accounts.byId.get(l.glAccountId)?.accountType || "Expense") === t), (l) => l.amount));
    const totalIncome = byType("Income");
    const totalExpense = byType("Expense");
    if (totalIncome !== round2(item.totalIncome) || totalExpense !== round2(item.totalExpense)) onCommit({ totalIncome, totalExpense });
  };

  // Upsert one month's amount (optimistic, rolled back on failure).
  const setMonth = async (row, monthIdx, amount, base = lines) => {
    const existing = row.months[monthIdx];
    const before = base;
    let next;
    let ok;
    if (existing) {
      next = base.map((l) => (l.id === existing.id ? { ...l, amount } : l));
      setLines(next);
      ok = await budgetLinesLayer.update(existing.id, { amount });
    } else {
      const line = {
        id: crypto.randomUUID(),
        budgetId: item.id,
        propertyId: item.propertyId || "",
        glAccountId: row.id,
        accountLabel: row.label,
        year,
        month: monthIdx + 1,
        amount,
      };
      next = [...base, line];
      setLines(next);
      ok = await budgetLinesLayer.create(line);
    }
    if (!ok) {
      setLines(before);
      toast.error("Couldn't save that amount.");
      return null;
    }
    return next;
  };

  const editMonth = async (row, i, amount) => {
    const next = await setMonth(row, i, amount);
    if (next) syncTotals(next);
  };

  // Annual total edit → spread evenly over the 12 months.
  const editAnnual = async (row, total) => {
    const parts = spreadAnnual(total);
    let current = lines;
    let snapshot = row;
    for (let i = 0; i < 12; i += 1) {
      if (round2(snapshot.months[i]?.amount) === parts[i]) continue;
      const next = await setMonth(snapshot, i, parts[i], current);
      if (!next) return;
      current = next;
      const own = next.filter((l) => l.glAccountId === row.id);
      snapshot = { ...row, months: MONTHS.map((_, m) => own.find((l) => Number(l.month) === m + 1) || null) };
    }
    syncTotals(current);
    toast.success(`Spread ${money(total)} across 12 months.`);
  };

  const removeRow = async (row) => {
    const own = lines.filter((l) => l.glAccountId === row.id);
    const next = lines.filter((l) => l.glAccountId !== row.id);
    setLines(next);
    setExtra((e) => e.filter((x) => x !== row.id));
    const results = await Promise.all(own.map((l) => budgetLinesLayer.softDelete(l.id)));
    if (results.some((r) => !r)) {
      toast.error("Couldn't remove every month of that account.");
      setLines(lines);
      return;
    }
    syncTotals(next);
  };

  const addRow = () => {
    if (!pick) {
      toast.error("Pick an account to budget.");
      return;
    }
    if (rows.some((r) => r.id === pick)) {
      toast.error("That account is already in the budget.");
      return;
    }
    setExtra((e) => [...e, pick]);
    setPick("");
  };

  const income = rows.filter((r) => r.type === "Income");
  const expense = rows.filter((r) => r.type !== "Income");
  const monthTotal = (list, i) => round2(sumOf(list, (r) => r.months[i]?.amount));
  const totalIncome = round2(sumOf(income, (r) => r.total));
  const totalExpense = round2(sumOf(expense, (r) => r.total));

  const columns = [
    {
      key: "label",
      header: "Account",
      className: "min-w-[200px]",
      render: (r) =>
        r.kind === "total" ? (
          <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">{r.label}</span>
        ) : (
          <span className="font-medium text-foreground">{r.label}</span>
        ),
    },
    ...MONTHS.map((m, i) => ({
      key: m,
      header: m,
      align: "right",
      className: "p-1 text-right",
      render: (r) =>
        r.kind === "total" ? (
          <span className="px-2 text-sm font-semibold tabular-nums text-foreground">{currency(monthTotal(r.list, i))}</span>
        ) : (
          <AmountCell value={round2(r.months[i]?.amount)} onCommit={(v) => editMonth(r, i, v)} />
        ),
    })),
    {
      key: "total",
      header: "Annual",
      align: "right",
      className: "p-1 text-right",
      render: (r) =>
        r.kind === "total" ? (
          <span className="px-2 text-sm font-semibold tabular-nums text-foreground">{currency(r.total)}</span>
        ) : (
          <AmountCell value={r.total} onCommit={(v) => editAnnual(r, v)} className="font-semibold" />
        ),
    },
    {
      key: "remove",
      header: "",
      className: "w-10 p-1 text-right",
      render: (r) =>
        r.kind === "total" ? null : (
          <Button variant="ghost" size="icon-sm" className="text-red-600 dark:text-red-300 hover:bg-red-500/10" onClick={() => removeRow(r)} aria-label="Remove account">
            <Trash2 className="h-4 w-4" />
          </Button>
        ),
    },
  ];

  const tableRows = [
    ...income,
    ...(income.length ? [{ id: "t-income", kind: "total", label: "Total income", list: income, total: totalIncome }] : []),
    ...expense,
    ...(expense.length ? [{ id: "t-expense", kind: "total", label: "Total expense", list: expense, total: totalExpense }] : []),
  ];

  return (
    <div className="space-y-4">
      <SummaryTiles
        items={[
          { label: "Budgeted income", value: currency(totalIncome) },
          { label: "Budgeted expense", value: currency(totalExpense) },
          { label: "Budgeted net", value: currency(totalIncome - totalExpense), className: totalIncome - totalExpense < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400" },
        ]}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="sm:w-80">
          <AccountSelect accounts={accounts} types={BUDGET_TYPES} value={pick} onChange={setPick} placeholder="Add an income or expense account…" />
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={addRow}>
          <Plus className="h-4 w-4" /> Add Account
        </Button>
        <p className="text-xs text-text-secondary sm:ml-auto">Type an annual amount to spread it evenly across the year.</p>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={CalendarRange} title="No budget lines yet" description="Add an income or expense account, then fill in its monthly amounts." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable columns={columns} data={tableRows} getRowKey={(r) => r.id} className="min-w-[1200px]" />
        </div>
      )}
    </div>
  );
}

const PERIOD_OPTIONS = [
  { value: "ytd", label: "Year to date" },
  { value: "month", label: "Single month" },
  { value: "year", label: "Full year" },
];
const MONTH_OPTIONS = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));

// Budget vs actual from the ledger for this property + year, per GL account.
function ActualsSection({ item }) {
  const year = Number(item.year) || thisYear();
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState("ytd");
  const [month, setMonth] = useState(String(year === thisYear() ? new Date().getMonth() + 1 : 12));

  useEffect(() => {
    let alive = true;
    const range = { from: `${year}-01-01`, to: `${year}-12-31` };
    Promise.all([
      listLedger(item.propertyId ? { propertyId: item.propertyId, ...range } : range),
      budgetLinesLayer.list({ budgetId: item.id }),
      getLedgerAccounts(),
    ]).then(([ledger, budget, accounts]) => {
      if (alive) setData({ ledger: ledger || [], budget: budget || [], accounts: accounts || { byId: new Map(), list: [] } });
    });
    return () => {
      alive = false;
    };
  }, [item.id, item.propertyId, year]);

  const rows = useMemo(() => {
    if (!data) return [];
    const m = Number(month);
    const inPeriod = (mo) => (period === "year" ? true : period === "month" ? mo === m : mo <= m);
    const per = new Map();
    const row = (id) => {
      if (!per.has(id)) {
        const a = data.accounts.byId.get(id);
        per.set(id, { id, account: a, label: a ? accountLabel(a) : "Unknown account", type: a?.accountType || "Expense", budget: 0, actual: 0 });
      }
      return per.get(id);
    };
    for (const b of data.budget) if (inPeriod(Number(b.month))) row(b.glAccountId).budget += Number(b.amount) || 0;
    for (const l of data.ledger) {
      const type = l.account?.accountType;
      if (type !== "Income" && type !== "Expense") continue;
      if (!inPeriod(Number(String(l.date).slice(5, 7)))) continue;
      const net = (Number(l.debit) || 0) - (Number(l.credit) || 0);
      row(l.glAccountId).actual += type === "Income" ? -net : net;
    }
    return [...per.values()]
      .map((r) => {
        const budget = round2(r.budget);
        const actual = round2(r.actual);
        // Favourable: income above budget, expense below budget.
        const variance = round2(r.type === "Income" ? actual - budget : budget - actual);
        return { ...r, budget, actual, variance };
      })
      .sort((x, y) => BUDGET_TYPES.indexOf(x.type) - BUDGET_TYPES.indexOf(y.type) || String(x.account?.number || "").localeCompare(String(y.account?.number || ""), undefined, { numeric: true }));
  }, [data, period, month]);

  if (!data) return <SectionLoading />;

  const totals = (type) => {
    const list = rows.filter((r) => r.type === type);
    const budget = round2(sumOf(list, (r) => r.budget));
    const actual = round2(sumOf(list, (r) => r.actual));
    return { budget, actual, variance: round2(type === "Income" ? actual - budget : budget - actual) };
  };
  const inc = totals("Income");
  const exp = totals("Expense");
  const net = { budget: round2(inc.budget - exp.budget), actual: round2(inc.actual - exp.actual) };
  net.variance = round2(net.actual - net.budget);

  const income = rows.filter((r) => r.type === "Income");
  const expense = rows.filter((r) => r.type !== "Income");
  const tableRows = [
    ...income,
    { id: "t-inc", kind: "total", label: "Total income", ...inc },
    ...expense,
    { id: "t-exp", kind: "total", label: "Total expense", ...exp },
    { id: "t-net", kind: "total", label: "Net operating income", ...net },
  ];
  const pct = (r) => (r.budget ? `${Math.round((r.actual / r.budget) * 100)}%` : "—");

  const periodLabel =
    period === "year" ? `${year}` : period === "month" ? `${MONTHS[Number(month) - 1]} ${year}` : `Jan–${MONTHS[Number(month) - 1]} ${year}`;

  return (
    <div className="space-y-4">
      <SummaryTiles
        items={[
          { label: "Income vs budget", value: currency(inc.variance), className: inc.variance < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400" },
          { label: "Expense vs budget", value: currency(exp.variance), className: exp.variance < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400" },
          { label: "Actual NOI", value: currency(net.actual), className: net.actual < 0 ? "text-red-600 dark:text-red-400" : "text-foreground" },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <FilterDropdown value={period} onValueChange={setPeriod} options={PERIOD_OPTIONS} height="h-9" />
        {period !== "year" ? <FilterDropdown value={month} onValueChange={setMonth} options={MONTH_OPTIONS} height="h-9" /> : null}
        <span className="text-sm text-text-secondary">{periodLabel}</span>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={Scale} title="Nothing to compare yet" description="Add monthly budget amounts, or post income and expenses to the ledger." />
        </div>
      ) : (
        <DataTable
          columns={[
            {
              key: "label",
              header: "Account",
              render: (r) =>
                r.kind === "total" ? (
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">{r.label}</span>
                ) : (
                  <span className="font-medium text-foreground">{r.label}</span>
                ),
            },
            { key: "budget", header: "Budget", align: "right", className: "text-right tabular-nums text-text-secondary", render: (r) => currency(r.budget) },
            { key: "actual", header: "Actual", align: "right", className: "text-right tabular-nums text-foreground", render: (r) => currency(r.actual) },
            { key: "pct", header: "% of budget", align: "right", className: "text-right tabular-nums text-text-secondary", render: pct },
            {
              key: "variance",
              header: "Variance",
              align: "right",
              className: "text-right font-semibold tabular-nums",
              render: (r) => (
                <span className={r.variance < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>
                  {r.variance > 0 ? "+" : ""}
                  {currency(r.variance)}
                </span>
              ),
            },
          ]}
          data={tableRows}
          getRowKey={(r) => r.id}
        />
      )}
      <p className="text-sm text-text-secondary">
        Actuals are posted ledger activity{item.propertyName ? ` for ${item.propertyName}` : " across all properties"}. Positive variance is favourable.
      </p>
    </div>
  );
}

const budgetsConfig = {
  key: "budget",
  singular: "Budget",
  plural: "Budgets",
  title: "Budgets",
  description:
    "Operating budgets by property — plan each GL account month by month, then track ledger actuals and variance against them.",
  icon: PiggyBank,
  titleField: "name",
  searchFields: ["name", "propertyName"],
  data: budgetsLayer.data,

  statusMap: BUDGET_STATUS_MAP,
  statusFilterOptions: filterOptions(BUDGET_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Budget",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.propertyName || "All properties"}</span>
        </div>
      ),
    },
    { key: "year", header: "Year", className: "text-sm tabular-nums text-text-secondary", render: (r) => r.year || "—" },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={BUDGET_STATUS_MAP} /> },
    { key: "totalIncome", header: "Income", align: "right", className: "text-right tabular-nums text-text-secondary", render: (r) => currency(r.totalIncome) },
    { key: "totalExpense", header: "Expense", align: "right", className: "text-right tabular-nums text-text-secondary", render: (r) => currency(r.totalExpense) },
    {
      key: "net",
      header: "Net",
      align: "right",
      className: "text-right font-semibold tabular-nums",
      render: (r) => {
        const net = (Number(r.totalIncome) || 0) - (Number(r.totalExpense) || 0);
        return <span className={net < 0 ? "text-red-600 dark:text-red-400" : "text-foreground"}>{currency(net)}</span>;
      },
    },
  ],

  stats: (rows) => {
    const year = thisYear();
    const current = rows.filter((r) => Number(r.year) === year && r.status !== "Archived");
    const income = current.reduce((s, r) => s + (Number(r.totalIncome) || 0), 0);
    const expense = current.reduce((s, r) => s + (Number(r.totalExpense) || 0), 0);
    return [
      { label: "Budgets", value: String(rows.length), footer: `${current.length} for ${year}` },
      { label: "Budgeted income", value: currency(income), footer: `${year} budgets` },
      { label: "Budgeted expense", value: currency(expense), footer: `${year} budgets` },
      { label: "Budgeted net", value: currency(income - expense), footer: "Income less expense" },
    ];
  },

  createDraft: { name: "", propertyId: "", propertyName: "", year: String(thisYear()) },
  createFields: [
    { key: "name", label: "Budget name", type: "text", placeholder: "e.g. Maple Court 2027 operating budget" },
    { key: "propertyId", label: "Property", type: "select", optionsFrom: "properties", placeholder: "Select a property…", emptyLabel: "No properties yet" },
    { key: "year", label: "Year", type: "number", placeholder: String(thisYear()) },
  ],
  loadCreateOptions: async () => ({ properties: await propertyOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    propertyId: draft.propertyId || "",
    propertyName: draft.propertyName || "",
    year: Number(draft.year) || thisYear(),
    totalIncome: 0,
    totalExpense: 0,
    status: "Draft",
  }),

  headerMeta: (r) => [r.propertyName || "All properties", r.year].filter(Boolean).join(" · "),

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this budget." }] },
    {
      group: "Budget",
      items: [
        { key: "details", label: "Details", icon: PiggyBank, desc: "Property, year, and status." },
        { key: "monthly", label: "Monthly Budget", icon: CalendarRange, desc: "Amounts per GL account for each month." },
        { key: "actuals", label: "Actuals & Variance", icon: Scale, desc: "Budget vs. posted ledger activity." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "propertyName", label: "Property", format: (v) => v || "All properties" },
        { key: "year", label: "Year" },
        { key: "totalIncome", label: "Budgeted income", format: (v) => currency(v) },
        { key: "totalExpense", label: "Budgeted expense", format: (v) => currency(v) },
        { key: "net", label: "Budgeted net", format: (_v, r) => currency((Number(r.totalIncome) || 0) - (Number(r.totalExpense) || 0)) },
        { key: "status", label: "Status" },
      ],
      note: "Totals are calculated from the Monthly Budget tab.",
    }),
    details: makeFieldsSection([
      { key: "name", label: "Budget name", type: "text", full: true },
      { key: "propertyId", label: "Property", type: "relation", load: propertyOptions, displayKey: "propertyName" },
      { key: "year", label: "Year", type: "number" },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    ]),
    monthly: MonthlySection,
    actuals: ActualsSection,
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this budget…" }),
  },
};

export function BudgetsScreen() {
  return <EntityListScreen config={budgetsConfig} />;
}

export default BudgetsScreen;
