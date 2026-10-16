"use client";

import { useMemo, useState } from "react";
import { FileSignature, CalendarClock, Repeat } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { RENEWAL_STATUS_MAP } from "@/components/internal/screens/leasing/shared";
import { listUnits } from "@/lib/supabase/units";
import { listProperties } from "@/lib/supabase/properties";
import { leasesLayer } from "@/lib/supabase/leases";
import { prospectsLayer } from "@/lib/supabase/prospects";
import { showingsLayer } from "@/lib/supabase/showings";
import { applicationsLayer } from "@/lib/supabase/applications";
import { renewalsLayer } from "@/lib/supabase/renewals";
import {
  ReportScreen,
  ReportTable,
  ReportEmpty,
  PropertyFilter,
  MeterBar,
  SERIES,
  matchesProperty,
  useReportData,
  exportCsv,
} from "./report_kit";
import {
  PERIOD_OPTIONS,
  ACTIVE_LEASE_STATUSES,
  currency,
  formatDate,
  isoDate,
  byId,
  toDate,
  inRange,
  periodRange,
  nextMonths,
  monthKey,
  monthLabel,
  propertyIdOf,
  percent,
} from "./shared";

// Leasing Report — the prospect → lease funnel, upcoming expirations, and renewal outcomes.

const LOADERS = {
  units: listUnits,
  properties: listProperties,
  leases: () => leasesLayer.list(),
  prospects: () => prospectsLayer.list(),
  showings: () => showingsLayer.list(),
  applications: () => applicationsLayer.list(),
  renewals: () => renewalsLayer.list(),
};

const EXPIRY_CONFIG = { count: { label: "Leases expiring", color: SERIES.primary.color } };

function ExpirationsChart({ series }) {
  return (
    <ChartContainer config={EXPIRY_CONFIG} className="aspect-auto h-60 w-full">
      <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip
          cursor={{ fill: "var(--color-surface-hover)" }}
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">Leases expiring</span>
                  <span className="font-medium tabular-nums text-foreground">{value}</span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartContainer>
  );
}

const RENEWAL_COLUMNS = [
  {
    key: "status",
    header: "Outcome",
    render: (r) => <StatusPill status={r.status} map={RENEWAL_STATUS_MAP} />,
  },
  {
    key: "count",
    header: "Renewals",
    align: "right",
    className: "text-right tabular-nums text-foreground",
    render: (r) => r.count,
  },
  {
    key: "increase",
    header: "Avg increase",
    align: "right",
    className: "text-right tabular-nums text-text-secondary",
    render: (r) => (r.increase === null ? "—" : `${r.increase.toFixed(1)}%`),
  },
];

const EXPIRY_COLUMNS = [
  {
    key: "name",
    header: "Lease",
    render: (r) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-foreground">{r.tenantName || r.name || "Lease"}</span>
        <span className="text-xs text-text-secondary">{[r.unitText, r.propertyText].filter(Boolean).join(" · ") || "—"}</span>
      </div>
    ),
  },
  {
    key: "end",
    header: "Ends",
    className: "whitespace-nowrap tabular-nums text-text-secondary",
    render: (r) => formatDate(r.end),
  },
  {
    key: "rent",
    header: "Rent",
    align: "right",
    className: "text-right tabular-nums text-text-secondary",
    render: (r) => currency(r.rent),
  },
  {
    key: "renewal",
    header: "Renewal",
    render: (r) =>
      r.renewalStatus ? (
        <StatusPill status={r.renewalStatus} map={RENEWAL_STATUS_MAP} />
      ) : (
        <span className="text-xs text-text-tertiary">None started</span>
      ),
  },
];

export function LeasingReportScreen() {
  const { loading, data } = useReportData(LOADERS);
  const [property, setProperty] = useState("all");
  const [period, setPeriod] = useState("last_12");

  // Every source row tagged with its resolved property id.
  const scoped = useMemo(() => {
    if (loading) return null;
    const units = byId(data.units);
    const tag = (rows) =>
      rows.filter((r) => matchesProperty(property, propertyIdOf(r, units)));
    return {
      units,
      leases: tag(data.leases),
      prospects: tag(data.prospects),
      showings: tag(data.showings),
      applications: tag(data.applications),
      renewals: tag(data.renewals),
    };
  }, [loading, data, property]);

  const funnel = useMemo(() => {
    if (!scoped) return [];
    const range = periodRange(period);
    const created = (r) => toDate(r.createdAt);
    const stages = [
      { id: "prospects", label: "Prospects", count: scoped.prospects.filter((p) => inRange(created(p), range)).length },
      {
        id: "showings",
        label: "Showings",
        count: scoped.showings.filter(
          (s) => s.status !== "Cancelled" && inRange(toDate(s.showingDate) || created(s), range),
        ).length,
      },
      { id: "applications", label: "Applications", count: scoped.applications.filter((a) => inRange(created(a), range)).length },
      {
        id: "leases",
        label: "Leases signed",
        count: scoped.leases.filter(
          (l) => ACTIVE_LEASE_STATUSES.includes(l.status) && inRange(toDate(l.signedAt) || created(l), range),
        ).length,
      },
    ];
    return stages.map((s, i) => ({
      ...s,
      conversion: i === 0 ? null : stages[i - 1].count ? s.count / stages[i - 1].count : null,
    }));
  }, [scoped, period]);

  const expirations = useMemo(() => {
    if (!scoped) return { series: [], rows: [] };
    const props = byId(data.properties);
    const months = nextMonths(12);
    const renewalByLease = new Map(scoped.renewals.filter((r) => r.leaseId).map((r) => [r.leaseId, r]));
    const rows = scoped.leases
      .filter((l) => ACTIVE_LEASE_STATUSES.includes(l.status))
      .map((l) => ({ ...l, end: toDate(l.termEnd) }))
      .filter((l) => l.end && months.includes(monthKey(l.end)))
      .map((l) => ({
        ...l,
        unitText: l.unit || scoped.units.get(l.unitId)?.label || "",
        propertyText: props.get(propertyIdOf(l, scoped.units))?.name || "",
        renewalStatus: renewalByLease.get(l.id)?.status || null,
      }))
      .sort((a, b) => a.end - b.end);
    const series = months.map((key) => ({
      key,
      label: monthLabel(key, false),
      count: rows.filter((r) => monthKey(r.end) === key).length,
    }));
    return { series, rows };
  }, [scoped, data]);

  const renewals = useMemo(() => {
    if (!scoped) return [];
    const order = Object.keys(RENEWAL_STATUS_MAP);
    const groups = new Map();
    for (const r of scoped.renewals) {
      const g = groups.get(r.status) || { id: r.status, status: r.status, count: 0, pcts: [] };
      g.count += 1;
      if (r.currentRent > 0 && r.proposedRent > 0)
        g.pcts.push(((r.proposedRent - r.currentRent) / r.currentRent) * 100);
      groups.set(r.status, g);
    }
    return [...groups.values()]
      .map((g) => ({
        ...g,
        increase: g.pcts.length ? g.pcts.reduce((s, p) => s + p, 0) / g.pcts.length : null,
      }))
      .sort((a, b) => {
        const ia = order.indexOf(a.status);
        const ib = order.indexOf(b.status);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
  }, [scoped]);

  const periodLabel = PERIOD_OPTIONS.find((p) => p.value === period)?.label;
  const top = funnel[0]?.count || 0;
  const signed = funnel[3]?.count || 0;

  const stats = [
    { label: "Prospects", value: String(top), footer: periodLabel },
    { label: "Applications", value: String(funnel[2]?.count || 0), footer: periodLabel },
    { label: "Leases signed", value: String(signed), footer: periodLabel },
    { label: "Lead-to-lease", value: percent(signed, top), footer: "Leases ÷ prospects" },
  ];

  const hasData =
    !loading &&
    [data.leases, data.prospects, data.showings, data.applications, data.renewals].some((r) => r?.length);

  const onExport = () =>
    exportCsv(
      "Lease expirations",
      [
        { header: "Lease", key: "name" },
        { header: "Tenant", key: "tenantName" },
        { header: "Unit", key: "unitText" },
        { header: "Property", key: "propertyText" },
        { header: "Ends", value: (r) => isoDate(r.end) },
        { header: "Rent", key: "rent" },
        { header: "Renewal status", value: (r) => r.renewalStatus || "" },
      ],
      expirations.rows,
    );

  return (
    <ReportScreen
      title="Leasing Report"
      description="How leads turn into leases, which leases are coming up for renewal, and how renewals are landing."
      loading={loading}
      stats={loading || hasData ? stats : null}
      onExport={hasData ? onExport : null}
      filters={
        hasData ? (
          <>
            <PropertyFilter properties={data.properties} value={property} onChange={setProperty} />
            <FilterDropdown value={period} onValueChange={setPeriod} options={PERIOD_OPTIONS} height="h-9" />
          </>
        ) : null
      }
    >
      {!hasData ? (
        <ReportEmpty
          icon={FileSignature}
          title="No leasing activity yet"
          description="Prospects, showings, applications, leases, and renewals all feed this report."
        />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-5">
            <SectionCard
              title="Leasing funnel"
              description={`${periodLabel} · each step's conversion is from the step before`}
              className="lg:col-span-3"
            >
              <div className="space-y-4">
                {funnel.map((s) => (
                  <div key={s.id} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-text-secondary">{s.label}</span>
                      <span className="flex items-baseline gap-3">
                        {s.conversion !== null ? (
                          <span className="text-xs text-text-tertiary">
                            {Math.round(s.conversion * 100)}% conv.
                          </span>
                        ) : null}
                        <span className="font-semibold tabular-nums text-foreground">{s.count}</span>
                      </span>
                    </div>
                    <MeterBar value={top ? s.count / top : 0} className="h-2.5" />
                  </div>
                ))}
              </div>
            </SectionCard>
            <ReportTable
              title="Renewal outcomes"
              description="All renewals, by status"
              columns={RENEWAL_COLUMNS}
              rows={renewals}
              emptyIcon={Repeat}
              emptyTitle="No renewals yet"
              emptyDescription="Start renewals from Leasing → Renewals."
              className="lg:col-span-2"
            />
          </div>
          <SectionCard
            title="Lease expirations"
            description={`Active leases ending in the next 12 months · ${expirations.rows.length} total`}
          >
            <ExpirationsChart series={expirations.series} />
          </SectionCard>
          <ReportTable
            title="Expiring leases"
            description="Soonest first, with any renewal in progress"
            columns={EXPIRY_COLUMNS}
            rows={expirations.rows}
            emptyIcon={CalendarClock}
            emptyTitle="Nothing expiring in the next 12 months"
          />
        </>
      )}
    </ReportScreen>
  );
}

export default LeasingReportScreen;
