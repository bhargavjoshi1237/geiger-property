"use client";

import { useMemo, useState } from "react";
import { PieChart, DoorOpen } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { listUnits } from "@/lib/supabase/units";
import { listProperties } from "@/lib/supabase/properties";
import { leasesLayer } from "@/lib/supabase/leases";
import {
  ReportScreen,
  ReportTable,
  ReportEmpty,
  PropertyFilter,
  MeterBar,
  SectionExportButton,
  matchesProperty,
  useReportData,
  exportCsv,
} from "./report_kit";
import {
  UNIT_STATUS_MAP,
  OCCUPIED_STATUSES,
  currency,
  formatDate,
  percent,
  byId,
  toDate,
  daysBetween,
  isoDate,
} from "./shared";

// Occupancy & Vacancy — unit status counts per property plus the vacant-unit list.

const LOADERS = {
  units: listUnits,
  properties: listProperties,
  leases: () => leasesLayer.list(),
};

const VACANT_STATUSES = ["Vacant", "Make-ready", "Down"];

// Last known lease end in the past (unit's own, else its latest ended lease).
function vacantSince(unit, leases, today) {
  const ends = [unit.leaseEnd, ...leases.filter((l) => l.unitId === unit.id).map((l) => l.termEnd)]
    .map(toDate)
    .filter((d) => d && d <= today)
    .sort((a, b) => b - a);
  return ends[0] || null;
}

const PROPERTY_COLUMNS = [
  {
    key: "name",
    header: "Property",
    render: (r) => <span className="font-medium text-foreground">{r.name}</span>,
  },
  ...["total", "occupied", "notice", "vacant", "makeReady"].map((k) => ({
    key: k,
    header: { total: "Units", occupied: "Occupied", notice: "Notice", vacant: "Vacant", makeReady: "Make-ready" }[k],
    align: "right",
    className: "text-right tabular-nums text-text-secondary",
    render: (r) => r[k],
  })),
  {
    key: "rate",
    header: "Occupancy",
    className: "w-56",
    render: (r) => (
      <div className="flex items-center gap-3">
        <MeterBar value={r.total ? r.occupiedAll / r.total : 0} />
        <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-foreground">
          {percent(r.occupiedAll, r.total)}
        </span>
      </div>
    ),
  },
];

const VACANT_COLUMNS = [
  {
    key: "unit",
    header: "Unit",
    render: (r) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-foreground">{r.unit}</span>
        <span className="text-xs text-text-secondary">{r.property}</span>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (r) => <StatusPill status={r.status} map={UNIT_STATUS_MAP} />,
  },
  {
    key: "since",
    header: "Vacant since",
    className: "text-text-secondary tabular-nums",
    render: (r) => (r.since ? formatDate(r.since) : "—"),
  },
  {
    key: "days",
    header: "Days vacant",
    align: "right",
    className: "text-right tabular-nums text-text-secondary",
    render: (r) => (r.days === null ? "—" : r.days),
  },
  {
    key: "rent",
    header: "Market rent",
    align: "right",
    className: "text-right tabular-nums text-foreground",
    render: (r) => currency(r.rent),
  },
];

export function OccupancyScreen() {
  const { loading, data } = useReportData(LOADERS);
  const [property, setProperty] = useState("all");

  const units = useMemo(
    () => (loading ? [] : data.units.filter((u) => u.status !== "Draft" && matchesProperty(property, u.propertyId))),
    [loading, data, property],
  );

  const byProperty = useMemo(() => {
    if (loading) return [];
    const props = byId(data.properties);
    const groups = new Map();
    for (const u of units) {
      const key = u.propertyId || "unassigned";
      if (!groups.has(key))
        groups.set(key, {
          id: key,
          name: props.get(u.propertyId)?.name || "Unassigned units",
          total: 0, occupied: 0, notice: 0, vacant: 0, makeReady: 0, down: 0, occupiedAll: 0,
        });
      const g = groups.get(key);
      g.total += 1;
      if (u.status === "Occupied") g.occupied += 1;
      if (u.status === "Notice") g.notice += 1;
      if (u.status === "Vacant") g.vacant += 1;
      if (u.status === "Make-ready") g.makeReady += 1;
      if (u.status === "Down") g.down += 1;
      if (OCCUPIED_STATUSES.includes(u.status)) g.occupiedAll += 1;
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [loading, data, units]);

  const vacant = useMemo(() => {
    if (loading) return [];
    const props = byId(data.properties);
    const today = new Date();
    return units
      .filter((u) => VACANT_STATUSES.includes(u.status))
      .map((u) => {
        const since = vacantSince(u, data.leases, today);
        return {
          id: u.id,
          unit: u.label || "Unnamed unit",
          property: props.get(u.propertyId)?.name || "Unassigned",
          status: u.status,
          since,
          days: since ? daysBetween(since, today) : null,
          rent: Number(u.rent) || 0,
        };
      })
      .sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
  }, [loading, data, units]);

  const stats = useMemo(() => {
    const occ = units.filter((u) => OCCUPIED_STATUSES.includes(u.status)).length;
    const loss = vacant.reduce((s, r) => s + r.rent, 0);
    return [
      { label: "Units", value: String(units.length), footer: `${byProperty.length} properties` },
      { label: "Occupancy", value: percent(occ, units.length), footer: `${occ} occupied or on notice` },
      { label: "Vacant", value: String(vacant.length), footer: "Vacant, make-ready or down" },
      { label: "Vacancy loss", value: currency(loss), footer: "Market rent per month" },
    ];
  }, [units, vacant, byProperty]);

  const hasUnits = (data.units || []).length > 0;

  const exportAll = () =>
    exportCsv(
      "Occupancy",
      [
        { header: "Property", key: "name" },
        { header: "Units", key: "total" },
        { header: "Occupied", key: "occupied" },
        { header: "Notice", key: "notice" },
        { header: "Vacant", key: "vacant" },
        { header: "Make-ready", key: "makeReady" },
        { header: "Down", key: "down" },
        { header: "Occupancy %", value: (r) => (r.total ? Math.round((r.occupiedAll / r.total) * 100) : 0) },
      ],
      byProperty,
    );

  const exportVacant = () =>
    exportCsv(
      "Vacant units",
      [
        { header: "Unit", key: "unit" },
        { header: "Property", key: "property" },
        { header: "Status", key: "status" },
        { header: "Vacant since", value: (r) => isoDate(r.since) },
        { header: "Days vacant", value: (r) => r.days ?? "" },
        { header: "Market rent", key: "rent" },
      ],
      vacant,
    );

  return (
    <ReportScreen
      title="Occupancy & Vacancy"
      description="How full each property is, and which units are sitting empty."
      loading={loading}
      stats={loading || hasUnits ? stats : null}
      onExport={hasUnits ? exportAll : null}
      filters={
        hasUnits ? (
          <PropertyFilter properties={data.properties} value={property} onChange={setProperty} />
        ) : null
      }
    >
      {hasUnits ? (
        <>
          <ReportTable
            title="By property"
            description="Occupancy counts occupied and on-notice units. Draft units are excluded."
            columns={PROPERTY_COLUMNS}
            rows={byProperty}
            emptyIcon={PieChart}
            emptyTitle="No units for this property"
          />
          <ReportTable
            title="Vacant units"
            description="Days vacant are measured from the last lease end on record."
            action={
              vacant.length ? (
<SectionExportButton onClick={exportVacant} />
              ) : null
            }
            columns={VACANT_COLUMNS}
            rows={vacant}
            emptyIcon={DoorOpen}
            emptyTitle="Fully occupied"
            emptyDescription="There are no vacant, make-ready, or down units in this view."
          />
        </>
      ) : (
        <ReportEmpty
          icon={PieChart}
          title="No units yet"
          description="Add units under Property → Units to see occupancy and vacancy."
        />
      )}
    </ReportScreen>
  );
}

export default OccupancyScreen;
