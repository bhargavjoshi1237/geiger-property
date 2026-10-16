"use client";

import { useMemo, useState } from "react";
import { TrendingDown, CircleCheck } from "lucide-react";

import { StatusPill, SearchInput } from "@/components/internal/shared/screen_kit";
import { listUnits } from "@/lib/supabase/units";
import { listProperties } from "@/lib/supabase/properties";
import { rentAccountsLayer } from "@/lib/supabase/rent_collection";
import {
  ReportScreen,
  ReportTable,
  ReportEmpty,
  PropertyFilter,
  matchesProperty,
  useReportData,
  exportCsv,
} from "./report_kit";
import {
  RENT_STATUS_MAP,
  AGING_BUCKETS,
  agingOf,
  balanceOf,
  currency,
  byId,
  norm,
  propertyIdOf,
} from "./shared";

// Delinquency — rent accounts with a balance, aged by the date of each unpaid charge.

const LOADERS = {
  accounts: () => rentAccountsLayer.list(),
  units: listUnits,
  properties: listProperties,
};

const money = (v) => (v > 0 ? currency(v) : <span className="text-text-tertiary">—</span>);

const COLUMNS = [
  {
    key: "name",
    header: "Account",
    render: (r) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-foreground">{r.tenant || r.name}</span>
        <span className="text-xs text-text-secondary">
          {[r.unit, r.property].filter(Boolean).join(" · ") || r.name}
        </span>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (r) => <StatusPill status={r.status} map={RENT_STATUS_MAP} />,
  },
  ...AGING_BUCKETS.map((b) => ({
    key: b.key,
    header: b.label,
    align: "right",
    className: "text-right tabular-nums text-text-secondary",
    render: (r) => money(r[b.key]),
  })),
  {
    key: "balance",
    header: "Balance",
    align: "right",
    className: "text-right font-semibold tabular-nums text-red-600 dark:text-red-400",
    render: (r) => currency(r.balance),
  },
  {
    key: "oldest",
    header: "Oldest",
    align: "right",
    className: "text-right tabular-nums text-text-tertiary",
    render: (r) => `${r.oldestDays}d`,
  },
];

const CSV_COLUMNS = [
  { header: "Account", key: "name" },
  { header: "Tenant", key: "tenant" },
  { header: "Unit", key: "unit" },
  { header: "Property", key: "property" },
  { header: "Status", key: "status" },
  ...AGING_BUCKETS.map((b) => ({ header: b.label, key: b.key })),
  { header: "Balance", key: "balance" },
  { header: "Oldest (days)", key: "oldestDays" },
];

export function DelinquencyScreen() {
  const { loading, data } = useReportData(LOADERS);
  const [property, setProperty] = useState("all");
  const [search, setSearch] = useState("");

  const all = useMemo(() => {
    if (loading) return [];
    const units = byId(data.units);
    const props = byId(data.properties);
    const today = new Date();
    return data.accounts
      .filter((a) => balanceOf(a) > 0)
      .map((a) => {
        const aging = agingOf(a, today);
        const propertyId = propertyIdOf(a, units);
        return {
          id: a.id,
          name: a.name || "Rent account",
          tenant: a.tenantName,
          unit: a.unit || units.get(a.unitId)?.label || "",
          property: props.get(propertyId)?.name || a.propertyName || "",
          propertyId,
          status: a.status,
          ...aging,
          balance: aging.total,
        };
      })
      .filter((r) => r.balance > 0)
      .sort((a, b) => b.balance - a.balance);
  }, [loading, data]);

  const scoped = useMemo(
    () => all.filter((r) => matchesProperty(property, r.propertyId)),
    [all, property],
  );

  const rows = useMemo(() => {
    const q = norm(search);
    return q
      ? scoped.filter((r) => [r.name, r.tenant, r.unit, r.property].some((v) => norm(v).includes(q)))
      : scoped;
  }, [scoped, search]);

  const stats = useMemo(() => {
    const sum = (k) => scoped.reduce((s, r) => s + r[k], 0);
    const total = sum("balance");
    const over60 = sum("b61") + sum("b91");
    return [
      { label: "Total delinquent", value: currency(total), footer: "Unpaid charges" },
      { label: "Accounts", value: String(scoped.length), footer: "With a balance" },
      { label: "Over 60 days", value: currency(over60), footer: "61+ days past charge" },
      { label: "Over 90 days", value: currency(sum("b91")), footer: "Candidates for collections" },
    ];
  }, [scoped]);

  const hasAccounts = (data.accounts || []).length > 0;

  return (
    <ReportScreen
      title="Delinquency"
      description="Who owes rent and how long it's been owed, aged into 30-day buckets."
      loading={loading}
      stats={loading || hasAccounts ? stats : null}
      onExport={hasAccounts ? () => exportCsv("Delinquency", CSV_COLUMNS, rows) : null}
      filters={
        hasAccounts ? (
          <PropertyFilter properties={data.properties} value={property} onChange={setProperty} />
        ) : null
      }
      toolbarRight={
        hasAccounts ? (
          <SearchInput value={search} onChange={setSearch} placeholder="Search tenants or units…" className="sm:w-72" />
        ) : null
      }
    >
      {hasAccounts ? (
        <ReportTable
          title="Aging"
          description="Payments are applied to the oldest charges first. Charges are dated from their date, else their label (e.g. “Jul 2026 rent”), else the account's creation date."
          columns={COLUMNS}
          rows={rows}
          emptyIcon={CircleCheck}
          emptyTitle={scoped.length ? "No accounts match your search" : "Nobody is behind on rent"}
          emptyDescription={scoped.length ? "Try a different search." : "Every rent account in this view is paid up."}
        />
      ) : (
        <ReportEmpty
          icon={TrendingDown}
          title="No rent accounts yet"
          description="Delinquency is computed from rent accounts in Accounting → Rent Collection."
        />
      )}
    </ReportScreen>
  );
}

export default DelinquencyScreen;
