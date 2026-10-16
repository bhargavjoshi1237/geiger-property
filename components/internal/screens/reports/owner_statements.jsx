"use client";

import { useMemo, useState } from "react";
import { FileText, Building2, ReceiptText } from "lucide-react";

import { SectionCard, EmptyState } from "@/components/internal/shared/screen_kit";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { listUnits } from "@/lib/supabase/units";
import { listProperties } from "@/lib/supabase/properties";
import { ownersLayer } from "@/lib/supabase/owners";
import { rentAccountsLayer } from "@/lib/supabase/rent_collection";
import { transactionsLayer } from "@/lib/supabase/transactions";
import { billsLayer } from "@/lib/supabase/bills";
import {
  ReportScreen,
  ReportTable,
  ReportEmpty,
  StatementLines,
  SectionExportButton,
  useReportData,
  exportCsv,
} from "./report_kit";
import {
  currency,
  formatDate,
  isoDate,
  byId,
  norm,
  inRange,
  lastMonths,
  monthRange,
  ownerPropertiesOf,
  incomeEntries,
  expenseEntries,
  sumBy,
} from "./shared";

// Owner Statements — a month of income, expenses and fees across one owner's properties.

const LOADERS = {
  owners: () => ownersLayer.list(),
  properties: listProperties,
  units: listUnits,
  accounts: () => rentAccountsLayer.list(),
  transactions: () => transactionsLayer.list(),
  bills: () => billsLayer.list(),
};

const MONTH_OPTIONS = lastMonths(12)
  .reverse()
  .map((key) => {
    const { start } = monthRange(key);
    return {
      value: key,
      label: start.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    };
  });

const signed = (v) => (
  <span className={v < 0 ? "text-red-600 dark:text-red-400" : "text-foreground"}>{currency(v)}</span>
);

const PROPERTY_COLUMNS = [
  {
    key: "name",
    header: "Property",
    render: (r) => <span className="font-medium text-foreground">{r.name}</span>,
  },
  {
    key: "pct",
    header: "Ownership",
    align: "right",
    className: "text-right tabular-nums text-text-secondary",
    render: (r) => `${r.pct}%`,
  },
  ...[
    ["income", "Income"],
    ["expenses", "Expenses"],
    ["fee", "Mgmt fee"],
  ].map(([key, header]) => ({
    key,
    header,
    align: "right",
    className: "text-right tabular-nums text-text-secondary",
    render: (r) => currency(r[key]),
  })),
  {
    key: "net",
    header: "Net",
    align: "right",
    className: "text-right tabular-nums",
    render: (r) => signed(r.net),
  },
  {
    key: "share",
    header: "Owner share",
    align: "right",
    className: "text-right font-semibold tabular-nums",
    render: (r) => signed(r.share),
  },
];

const LINE_COLUMNS = [
  {
    key: "date",
    header: "Date",
    className: "whitespace-nowrap tabular-nums text-text-secondary",
    render: (r) => formatDate(r.date),
  },
  {
    key: "description",
    header: "Description",
    render: (r) => (
      <div className="flex flex-col gap-0.5">
        <span className="text-foreground">{r.description}</span>
        <span className="text-xs text-text-secondary">
          {[r.property, r.account, r.source].filter(Boolean).join(" · ")}
        </span>
      </div>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    align: "right",
    className: "text-right tabular-nums",
    render: (r) =>
      r.kind === "Expense" ? (
        <span className="text-text-secondary">−{currency(r.amount)}</span>
      ) : (
        <span className="text-foreground">{currency(r.amount)}</span>
      ),
  },
];

export function OwnerStatementsScreen() {
  const { loading, data } = useReportData(LOADERS);
  const [ownerPick, setOwnerPick] = useState(null);
  const [month, setMonth] = useState(MONTH_OPTIONS[0].value);

  const owners = useMemo(() => (loading ? [] : data.owners), [loading, data]);
  const ownerId = ownerPick || owners[0]?.id || null;
  const owner = owners.find((o) => o.id === ownerId) || null;
  const feePct = Number(owner?.managementFeePct) || 0;

  const statement = useMemo(() => {
    if (loading || !owner) return null;
    const holdings = ownerPropertiesOf(owner, data.properties);
    const range = monthRange(month);
    const unitsById = byId(data.units);
    const income = incomeEntries({ accounts: data.accounts, transactions: data.transactions, unitsById });
    const expenses = expenseEntries({ transactions: data.transactions, bills: data.bills });
    const propName = byId(data.properties);

    // Which owned property an entry belongs to (id first, then name).
    const holdingFor = (e) =>
      holdings.find(
        (h) =>
          (h.propertyId && e.propertyId === h.propertyId) ||
          norm(e.propertyName || propName.get(e.propertyId)?.name) === norm(h.name),
      );

    const lines = [];
    const rows = holdings.map((h) => ({ ...h, id: h.key, income: 0, expenses: 0 }));
    const rowFor = new Map(rows.map((r) => [r.key, r]));
    for (const [kind, entries] of [["Income", income], ["Expense", expenses]]) {
      for (const e of entries) {
        if (!inRange(e.date, range)) continue;
        const h = holdingFor(e);
        if (!h) continue;
        const row = rowFor.get(h.key);
        if (kind === "Income") row.income += e.amount;
        else row.expenses += e.amount;
        lines.push({ ...e, kind, property: h.name, id: `${kind}-${lines.length}` });
      }
    }
    for (const r of rows) {
      r.fee = (r.income * feePct) / 100;
      r.net = r.income - r.expenses - r.fee;
      r.share = (r.net * r.pct) / 100;
    }
    lines.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
    return { holdings, rows, lines };
  }, [loading, data, owner, month, feePct]);

  const totals = useMemo(() => {
    const rows = statement?.rows || [];
    return {
      income: sumBy(rows, (r) => r.income),
      expenses: sumBy(rows, (r) => r.expenses),
      fee: sumBy(rows, (r) => r.fee),
      net: sumBy(rows, (r) => r.net),
      share: sumBy(rows, (r) => r.share),
    };
  }, [statement]);

  const stats = [
    { label: "Gross income", value: currency(totals.income), footer: "Rent + other income" },
    { label: "Expenses", value: currency(totals.expenses), footer: "Transactions + bills paid" },
    { label: "Management fee", value: currency(totals.fee), footer: `${feePct}% of income` },
    { label: "Owner distribution", value: currency(totals.share), footer: "Net × ownership %" },
  ];

  const monthLabelText = MONTH_OPTIONS.find((m) => m.value === month)?.label || month;
  const ownerName = owner?.name || "Owner";

  const exportStatement = () =>
    exportCsv(
      `Owner statement ${ownerName} ${month}`,
      [
        { header: "Property", key: "name" },
        { header: "Ownership %", key: "pct" },
        { header: "Income", value: (r) => r.income.toFixed(2) },
        { header: "Expenses", value: (r) => r.expenses.toFixed(2) },
        { header: "Management fee", value: (r) => r.fee.toFixed(2) },
        { header: "Net", value: (r) => r.net.toFixed(2) },
        { header: "Owner share", value: (r) => r.share.toFixed(2) },
      ],
      statement?.rows || [],
    );

  const exportLines = () =>
    exportCsv(
      `Owner statement detail ${ownerName} ${month}`,
      [
        { header: "Date", value: (r) => isoDate(r.date) },
        { header: "Property", key: "property" },
        { header: "Type", key: "kind" },
        { header: "Account", key: "account" },
        { header: "Source", key: "source" },
        { header: "Description", key: "description" },
        { header: "Amount", value: (r) => (r.kind === "Expense" ? -r.amount : r.amount).toFixed(2) },
      ],
      statement?.lines || [],
    );

  const hasOwners = owners.length > 0;
  const hasHoldings = Boolean(statement?.holdings.length);

  return (
    <ReportScreen
      title="Owner Statements"
      description="A monthly statement for each owner — income, expenses, management fee, and their share of the net."
      loading={loading}
      stats={loading || (hasOwners && hasHoldings) ? stats : null}
      onExport={hasOwners && hasHoldings ? exportStatement : null}
      filters={
        hasOwners ? (
          <>
            <FilterDropdown
              value={ownerId}
              onValueChange={setOwnerPick}
              height="h-9"
              options={owners.map((o) => ({ value: o.id, label: o.name || "Unnamed owner" }))}
            />
            <FilterDropdown value={month} onValueChange={setMonth} options={MONTH_OPTIONS} height="h-9" />
          </>
        ) : null
      }
    >
      {!hasOwners ? (
        <ReportEmpty
          icon={FileText}
          title="No owners yet"
          description="Add owners under People → Owners, then link their properties in Properties & Splits."
        />
      ) : !hasHoldings ? (
        <ReportEmpty
          icon={Building2}
          title={`${ownerName} has no linked properties`}
          description="Add their properties and ownership % in People → Owners → Properties & Splits. Names must match a property in this project."
        />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <SectionCard
              title="Statement summary"
              description={`${ownerName} · ${monthLabelText}`}
              bodyPadding={false}
              className="lg:col-span-1"
            >
              <StatementLines
                lines={[
                  { label: "Gross income", value: currency(totals.income) },
                  { label: "Operating expenses", value: `−${currency(totals.expenses)}` },
                  { label: `Management fee (${feePct}%)`, value: `−${currency(totals.fee)}` },
                  { label: "Net operating income", value: currency(totals.net) },
                ]}
                total={{ label: "Owner distribution", value: currency(totals.share) }}
              />
            </SectionCard>
            <ReportTable
              title="By property"
              description="Fee is charged on income; owner share applies their ownership % to the net."
              columns={PROPERTY_COLUMNS}
              rows={statement.rows}
              className="lg:col-span-2"
            />
          </div>
          <ReportTable
            title="Detail"
            description="Rent payments, income and expense transactions, and bill payments dated in this month."
            action={statement.lines.length ? <SectionExportButton onClick={exportLines} /> : null}
            columns={LINE_COLUMNS}
            rows={statement.lines}
            emptyIcon={ReceiptText}
            emptyTitle="No activity this month"
            emptyDescription="Nothing was collected or spent on these properties in the selected month."
          />
        </>
      )}
    </ReportScreen>
  );
}

export default OwnerStatementsScreen;
