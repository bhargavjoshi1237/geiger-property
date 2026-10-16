"use client";

import { useMemo, useState } from "react";
import { FileBarChart } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { SectionCard } from "@/components/internal/shared/screen_kit";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { cn } from "@/lib/utils";
import { listUnits } from "@/lib/supabase/units";
import { rentAccountsLayer } from "@/lib/supabase/rent_collection";
import { transactionsLayer } from "@/lib/supabase/transactions";
import { billsLayer } from "@/lib/supabase/bills";
import { bankAccountsLayer } from "@/lib/supabase/bank_accounts";
import { securityDepositsLayer } from "@/lib/supabase/security_deposits";
import {
  ReportScreen,
  ReportTable,
  ReportEmpty,
  StatementLines,
  ChartLegendRow,
  SERIES,
  useReportData,
  exportCsv,
} from "./report_kit";
import {
  PERIOD_OPTIONS,
  currency,
  compactMoney,
  byId,
  inRange,
  periodRange,
  lastMonths,
  monthRange,
  monthLabel,
  incomeEntries,
  expenseEntries,
  billOpenAmount,
  balanceOf,
  sumBy,
} from "./shared";

// Financial Statements — P&L, balance sheet and cash flow computed from the
// rent ledger, transactions, bills, bank accounts and deposits held.

const LOADERS = {
  units: listUnits,
  accounts: () => rentAccountsLayer.list(),
  transactions: () => transactionsLayer.list(),
  bills: () => billsLayer.list(),
  banks: () => bankAccountsLayer.list(),
  deposits: () => securityDepositsLayer.list(),
};

const TABS = [
  { value: "pnl", label: "Profit & Loss" },
  { value: "balance", label: "Balance Sheet" },
  { value: "cash", label: "Cash Flow" },
];

const BANK_TYPES = ["Operating", "Trust", "Security deposit", "Reserve"];

// Sum entries by account → [{ label, amount }] largest first.
const groupByAccount = (entries) => {
  const map = new Map();
  for (const e of entries) map.set(e.account, (map.get(e.account) || 0) + e.amount);
  return [...map.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
};

// Amount still held on a deposit (Held, or Partially returned minus what went back).
const heldOf = (d) => {
  if (d.status === "Held") return Number(d.amount) || 0;
  if (d.status !== "Partially returned") return 0;
  const back = Number(d.metadata?.returnedAmount ?? d.metadata?.amountReturned ?? 0) || 0;
  return Math.max(0, (Number(d.amount) || 0) - back);
};

const CASH_CONFIG = {
  inflow: { label: "Cash in", color: SERIES.primary.color },
  outflow: { label: "Cash out", color: SERIES.secondary.color },
};

function CashFlowChart({ series }) {
  return (
    <ChartContainer config={CASH_CONFIG} className="aspect-auto h-72 w-full">
      <BarChart data={series} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={compactMoney}
        />
        <ChartTooltip
          cursor={{ fill: "var(--color-surface-hover)" }}
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span
                      className="h-2.5 w-2.5 rounded-[2px]"
                      style={{ background: CASH_CONFIG[name]?.color }}
                    />
                    {CASH_CONFIG[name]?.label || name}
                  </span>
                  <span className="font-medium tabular-nums text-foreground">{currency(value)}</span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="inflow" fill="var(--color-inflow)" radius={[4, 4, 0, 0]} maxBarSize={20} />
        <Bar dataKey="outflow" fill="var(--color-outflow)" radius={[4, 4, 0, 0]} maxBarSize={20} />
      </BarChart>
    </ChartContainer>
  );
}

const CASH_COLUMNS = [
  { key: "label", header: "Month", className: "text-foreground", render: (r) => r.longLabel },
  {
    key: "inflow",
    header: "Cash in",
    align: "right",
    className: "text-right tabular-nums text-text-secondary",
    render: (r) => currency(r.inflow),
  },
  {
    key: "outflow",
    header: "Cash out",
    align: "right",
    className: "text-right tabular-nums text-text-secondary",
    render: (r) => currency(r.outflow),
  },
  {
    key: "net",
    header: "Net",
    align: "right",
    className: "text-right font-semibold tabular-nums",
    render: (r) => (
      <span className={r.net < 0 ? "text-red-600 dark:text-red-400" : "text-foreground"}>{currency(r.net)}</span>
    ),
  },
];

export function FinancialStatementsScreen() {
  const { loading, data } = useReportData(LOADERS);
  const [tab, setTab] = useState("pnl");
  const [period, setPeriod] = useState("this_month");

  const ledger = useMemo(() => {
    if (loading) return { income: [], expenses: [] };
    return {
      income: incomeEntries({
        accounts: data.accounts,
        transactions: data.transactions,
        unitsById: byId(data.units),
      }),
      expenses: expenseEntries({ transactions: data.transactions, bills: data.bills }),
    };
  }, [loading, data]);

  const pnl = useMemo(() => {
    const range = periodRange(period);
    const income = groupByAccount(ledger.income.filter((e) => inRange(e.date, range)));
    const expenses = groupByAccount(ledger.expenses.filter((e) => inRange(e.date, range)));
    const totalIncome = sumBy(income, (r) => r.amount);
    const totalExpense = sumBy(expenses, (r) => r.amount);
    return { income, expenses, totalIncome, totalExpense, net: totalIncome - totalExpense };
  }, [ledger, period]);

  const balance = useMemo(() => {
    if (loading) return null;
    const banks = data.banks.filter((b) => b.status === "Active");
    const byType = BANK_TYPES.map((t) => ({
      label: `${t} accounts`,
      amount: sumBy(banks.filter((b) => b.accountType === t), (b) => b.balance),
    }));
    const other = sumBy(banks.filter((b) => !BANK_TYPES.includes(b.accountType)), (b) => b.balance);
    if (other) byType.push({ label: "Other accounts", amount: other });
    const cash = sumBy(banks, (b) => b.balance);
    const receivable = sumBy(data.accounts, (a) => Math.max(0, balanceOf(a)));
    const deposits = sumBy(data.deposits, heldOf);
    const payables = sumBy(data.bills, billOpenAmount);
    const assets = cash + receivable;
    const liabilities = deposits + payables;
    return {
      assets: [...byType.filter((r) => r.amount), { label: "Rent receivable", amount: receivable }],
      liabilities: [
        { label: "Security deposits held", amount: deposits },
        { label: "Accounts payable", amount: payables },
      ],
      cash,
      totalAssets: assets,
      totalLiabilities: liabilities,
      equity: assets - liabilities,
    };
  }, [loading, data]);

  const cash = useMemo(() => {
    const series = lastMonths(12).map((key) => {
      const range = monthRange(key);
      const inflow = sumBy(ledger.income.filter((e) => inRange(e.date, range)), (e) => e.amount);
      const outflow = sumBy(ledger.expenses.filter((e) => inRange(e.date, range)), (e) => e.amount);
      return {
        id: key,
        label: monthLabel(key, false),
        longLabel: range.start.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        inflow,
        outflow,
        net: inflow - outflow,
      };
    });
    const totalIn = sumBy(series, (r) => r.inflow);
    const totalOut = sumBy(series, (r) => r.outflow);
    return { series, totalIn, totalOut, net: totalIn - totalOut };
  }, [ledger]);

  const hasData =
    !loading &&
    [data.accounts, data.transactions, data.bills, data.banks, data.deposits].some((r) => r?.length);

  const periodLabel = PERIOD_OPTIONS.find((p) => p.value === period)?.label;

  const stats =
    tab === "pnl"
      ? [
          { label: "Income", value: currency(pnl.totalIncome), footer: periodLabel },
          { label: "Expenses", value: currency(pnl.totalExpense), footer: periodLabel },
          { label: "Net income", value: currency(pnl.net), footer: "Income − expenses" },
          {
            label: "Margin",
            value: pnl.totalIncome > 0 ? `${Math.round((pnl.net / pnl.totalIncome) * 100)}%` : "0%",
            footer: "Net of income",
          },
        ]
      : tab === "balance"
        ? [
            { label: "Total assets", value: currency(balance?.totalAssets), footer: "Cash + receivables" },
            { label: "Total liabilities", value: currency(balance?.totalLiabilities), footer: "Deposits + payables" },
            { label: "Equity", value: currency(balance?.equity), footer: "Assets − liabilities" },
            { label: "Cash", value: currency(balance?.cash), footer: "Active bank accounts" },
          ]
        : [
            { label: "Cash in", value: currency(cash.totalIn), footer: "Last 12 months" },
            { label: "Cash out", value: currency(cash.totalOut), footer: "Last 12 months" },
            { label: "Net cash flow", value: currency(cash.net), footer: "In − out" },
            { label: "Avg monthly net", value: currency(cash.net / 12), footer: "12-month average" },
          ];

  const onExport = () => {
    if (tab === "pnl") {
      const rows = [
        ...pnl.income.map((r) => ({ section: "Income", ...r })),
        { section: "Income", label: "Total income", amount: pnl.totalIncome },
        ...pnl.expenses.map((r) => ({ section: "Expenses", ...r })),
        { section: "Expenses", label: "Total expenses", amount: pnl.totalExpense },
        { section: "Net", label: "Net income", amount: pnl.net },
      ];
      exportCsv(`Profit and loss ${periodLabel}`, [
        { header: "Section", key: "section" },
        { header: "Account", key: "label" },
        { header: "Amount", value: (r) => r.amount.toFixed(2) },
      ], rows);
    } else if (tab === "balance" && balance) {
      const rows = [
        ...balance.assets.map((r) => ({ section: "Assets", ...r })),
        { section: "Assets", label: "Total assets", amount: balance.totalAssets },
        ...balance.liabilities.map((r) => ({ section: "Liabilities", ...r })),
        { section: "Liabilities", label: "Total liabilities", amount: balance.totalLiabilities },
        { section: "Equity", label: "Equity", amount: balance.equity },
      ];
      exportCsv("Balance sheet", [
        { header: "Section", key: "section" },
        { header: "Line", key: "label" },
        { header: "Amount", value: (r) => r.amount.toFixed(2) },
      ], rows);
    } else {
      exportCsv("Cash flow", [
        { header: "Month", key: "id" },
        { header: "Cash in", value: (r) => r.inflow.toFixed(2) },
        { header: "Cash out", value: (r) => r.outflow.toFixed(2) },
        { header: "Net", value: (r) => r.net.toFixed(2) },
      ], cash.series);
    }
  };

  const lines = (rows, empty) =>
    rows.length
      ? rows.map((r) => ({ label: r.label, value: currency(r.amount) }))
      : [{ label: empty, value: currency(0), muted: true }];

  return (
    <ReportScreen
      title="Financial Statements"
      description="Profit & loss, balance sheet, and cash flow — computed live from your ledger."
      loading={loading}
      stats={loading || hasData ? stats : null}
      onExport={hasData ? onExport : null}
      filters={
        hasData ? (
          <>
            <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
            {tab === "pnl" ? (
              <FilterDropdown value={period} onValueChange={setPeriod} options={PERIOD_OPTIONS} height="h-9" />
            ) : null}
          </>
        ) : null
      }
    >
      {!hasData ? (
        <ReportEmpty
          icon={FileBarChart}
          title="No financial activity yet"
          description="Record rent payments, transactions, bills, and bank accounts in Accounting and your statements build themselves."
        />
      ) : tab === "pnl" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Income" description="Rent payments plus Income transactions" bodyPadding={false}>
            <StatementLines
              lines={lines(pnl.income, "No income in this period")}
              total={{ label: "Total income", value: currency(pnl.totalIncome) }}
            />
          </SectionCard>
          <SectionCard title="Expenses" description="Expense transactions and bill payments, by account" bodyPadding={false}>
            <StatementLines
              lines={lines(pnl.expenses, "No expenses in this period")}
              total={{ label: "Total expenses", value: currency(pnl.totalExpense) }}
            />
          </SectionCard>
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface-subtle px-5 py-4 lg:col-span-2">
            <span className="text-sm font-semibold text-foreground">Net income · {periodLabel}</span>
            <span className={cn("text-lg font-semibold tabular-nums", pnl.net < 0 ? "text-red-600 dark:text-red-400" : "text-foreground")}>
              {currency(pnl.net)}
            </span>
          </div>
        </div>
      ) : tab === "balance" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Assets" description="Active bank balances and rent owed to you" bodyPadding={false}>
            <StatementLines
              lines={lines(balance.assets, "No assets recorded")}
              total={{ label: "Total assets", value: currency(balance.totalAssets) }}
            />
          </SectionCard>
          <div className="space-y-6">
            <SectionCard title="Liabilities" description="Deposits you hold and bills you owe" bodyPadding={false}>
              <StatementLines
                lines={lines(balance.liabilities, "No liabilities")}
                total={{ label: "Total liabilities", value: currency(balance.totalLiabilities) }}
              />
            </SectionCard>
            <SectionCard title="Equity" bodyPadding={false}>
              <StatementLines
                lines={[
                  { label: "Total assets", value: currency(balance.totalAssets) },
                  { label: "Less total liabilities", value: `−${currency(balance.totalLiabilities)}` },
                ]}
                total={{ label: "Owner's equity", value: currency(balance.equity) }}
              />
            </SectionCard>
          </div>
        </div>
      ) : (
        <>
          <SectionCard
            title="Monthly cash flow"
            description="Last 12 months · cash in is rent collected plus income; cash out is expenses and bills paid"
            action={
              <ChartLegendRow
                items={[
                  { label: "Cash in", swatch: SERIES.primary.swatch },
                  { label: "Cash out", swatch: SERIES.secondary.swatch },
                ]}
              />
            }
          >
            <CashFlowChart series={cash.series} />
          </SectionCard>
          <ReportTable title="By month" columns={CASH_COLUMNS} rows={[...cash.series].reverse()} />
        </>
      )}
    </ReportScreen>
  );
}

export default FinancialStatementsScreen;
