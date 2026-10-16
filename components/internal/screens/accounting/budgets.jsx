"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LayoutDashboard, PiggyBank, ListOrdered, Scale, Clock, Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react";

import { DataTable, EmptyState, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { budgetsLayer } from "@/lib/supabase/budgets";
import { transactionsLayer } from "@/lib/supabase/transactions";
import { propertyOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { BUDGET_STATUS_MAP, filterOptions, currency, money } from "./shared";
import { SectionLoading, SummaryTiles } from "./sections";

// Budgets — annual budgets per property over `property.budgets`. Line items live
// in metadata.incomeLines / expenseLines; their totals are written to
// totalIncome / totalExpense. Actuals compares against posted transactions.

const STATUS_OPTIONS = filterOptions(BUDGET_STATUS_MAP).slice(1);
const thisYear = () => new Date().getFullYear();
const sumLines = (lines) => lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
const listOf = (item, field) => (Array.isArray(item?.metadata?.[field]) ? item.metadata[field] : []);

// One editable list of { id, label, amount } budget lines.
function LineList({ title, icon: Icon, lines, placeholder, onChange }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");

  const add = () => {
    const v = label.trim();
    if (!v) {
      toast.error("Add a category.");
      return;
    }
    onChange([...lines, { id: crypto.randomUUID(), label: v, amount: Number(amount) || 0 }]);
    setLabel("");
    setAmount("");
  };

  return (
    <SectionCard title={title} action={<span className="text-sm font-semibold tabular-nums text-foreground">{currency(sumLines(lines))}</span>}>
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={placeholder}
            className="bg-surface-card"
          />
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Annual amount"
            className="bg-surface-card sm:max-w-[40%]"
          />
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={add}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        {lines.length === 0 ? (
          <EmptyState icon={Icon} title="No lines yet" description="Add a category and its annual amount." className="py-8" />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {lines.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="truncate text-sm font-medium text-foreground">{l.label}</span>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm tabular-nums text-text-secondary">{money(l.amount)}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-red-600 dark:text-red-300 hover:bg-red-500/10"
                    onClick={() => onChange(lines.filter((x) => x.id !== l.id))}
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}

// Income + expense line items; every change rewrites the totals columns.
function LinesSection({ item, onCommit }) {
  const income = listOf(item, "incomeLines");
  const expense = listOf(item, "expenseLines");
  const commit = (field, next) => {
    const nextIncome = field === "incomeLines" ? next : income;
    const nextExpense = field === "expenseLines" ? next : expense;
    onCommit({
      totalIncome: sumLines(nextIncome),
      totalExpense: sumLines(nextExpense),
      metadata: { ...(item.metadata || {}), incomeLines: nextIncome, expenseLines: nextExpense },
    });
  };
  const net = sumLines(income) - sumLines(expense);
  return (
    <div className="space-y-4">
      <SummaryTiles
        items={[
          { label: "Budgeted income", value: currency(sumLines(income)) },
          { label: "Budgeted expense", value: currency(sumLines(expense)) },
          { label: "Budgeted net", value: currency(net), className: net < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400" },
        ]}
      />
      <LineList
        title="Income"
        icon={TrendingUp}
        lines={income}
        placeholder="e.g. Rental income"
        onChange={(next) => commit("incomeLines", next)}
      />
      <LineList
        title="Expenses"
        icon={TrendingDown}
        lines={expense}
        placeholder="e.g. Repairs & maintenance"
        onChange={(next) => commit("expenseLines", next)}
      />
    </div>
  );
}

// Budget vs actual from posted (non-void) transactions for this property + year.
function ActualsSection({ item }) {
  const [txns, setTxns] = useState(null);
  useEffect(() => {
    let alive = true;
    transactionsLayer.list().then((r) => alive && setTxns(r ?? []));
    return () => {
      alive = false;
    };
  }, []);

  if (txns === null) return <SectionLoading />;
  const year = String(item.year || thisYear());
  const scoped = txns.filter(
    (t) =>
      t.status !== "Void" &&
      String(t.txnDate || "").startsWith(year) &&
      (!item.propertyId || t.propertyId === item.propertyId),
  );
  const actualIncome = scoped.filter((t) => t.txnType === "Income").reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const actualExpense = scoped.filter((t) => t.txnType === "Expense").reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const budgetIncome = Number(item.totalIncome) || 0;
  const budgetExpense = Number(item.totalExpense) || 0;

  // Favourable variance: income above budget, expenses below budget.
  const rows = [
    { key: "income", label: "Income", budget: budgetIncome, actual: actualIncome, variance: actualIncome - budgetIncome },
    { key: "expense", label: "Expenses", budget: budgetExpense, actual: actualExpense, variance: budgetExpense - actualExpense },
    {
      key: "net",
      label: "Net",
      budget: budgetIncome - budgetExpense,
      actual: actualIncome - actualExpense,
      variance: actualIncome - actualExpense - (budgetIncome - budgetExpense),
    },
  ];
  const pct = (r) => (r.budget ? `${Math.round((r.actual / r.budget) * 100)}%` : "—");

  return (
    <div className="space-y-4">
      <DataTable
        columns={[
          { key: "label", header: "", render: (r) => <span className="font-medium text-foreground">{r.label}</span> },
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
        data={rows}
        getRowKey={(r) => r.key}
      />
      <p className="text-sm text-text-secondary">
        {scoped.length} posted transaction{scoped.length === 1 ? "" : "s"} in {year}
        {item.propertyName ? ` for ${item.propertyName}` : " across all properties"}. Positive variance is favourable.
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
    "Annual operating budgets by property — plan income and expenses line by line, then track actuals against them.",
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
    {
      key: "year",
      header: "Year",
      className: "text-sm tabular-nums text-text-secondary",
      render: (r) => r.year || "—",
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={BUDGET_STATUS_MAP} />,
    },
    {
      key: "totalIncome",
      header: "Income",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (r) => currency(r.totalIncome),
    },
    {
      key: "totalExpense",
      header: "Expense",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (r) => currency(r.totalExpense),
    },
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
    {
      key: "propertyId",
      label: "Property",
      type: "select",
      optionsFrom: "properties",
      placeholder: "Select a property…",
      emptyLabel: "No properties yet",
    },
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
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this budget." },
      ],
    },
    {
      group: "Budget",
      items: [
        { key: "details", label: "Details", icon: PiggyBank, desc: "Property, year, and status." },
        { key: "lines", label: "Lines", icon: ListOrdered, desc: "Income and expense line items." },
        { key: "actuals", label: "Actuals", icon: Scale, desc: "Budget vs. posted transactions." },
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
      note: "Totals are calculated from the line items on the Lines tab.",
    }),
    details: makeFieldsSection([
      { key: "name", label: "Budget name", type: "text", full: true },
      { key: "propertyId", label: "Property", type: "relation", load: propertyOptions, displayKey: "propertyName" },
      { key: "year", label: "Year", type: "number" },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    ]),
    lines: LinesSection,
    actuals: ActualsSection,
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this budget…" }),
  },
};

export function BudgetsScreen() {
  return <EntityListScreen config={budgetsConfig} />;
}

export default BudgetsScreen;
