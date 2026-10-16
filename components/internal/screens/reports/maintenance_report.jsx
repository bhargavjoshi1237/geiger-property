"use client";

import { useMemo, useState } from "react";
import { Wrench, Truck } from "lucide-react";

import { listUnits } from "@/lib/supabase/units";
import { listProperties } from "@/lib/supabase/properties";
import { workOrdersLayer } from "@/lib/supabase/work_orders";
import {
  ReportScreen,
  ReportTable,
  ReportEmpty,
  PropertyFilter,
  MeterBar,
  matchesProperty,
  useReportData,
  exportCsv,
} from "./report_kit";
import {
  currency,
  isoDate,
  byId,
  toDate,
  daysBetween,
  propertyIdOf,
  sumBy,
  percent,
} from "./shared";

// Maintenance Report — work-order volume, turnaround and spend by status,
// priority, category and vendor.

const LOADERS = {
  workOrders: () => workOrdersLayer.list(),
  units: listUnits,
  properties: listProperties,
};

const CLOSED = ["Completed", "Rejected", "Converted", "Cancelled", "Closed", "Draft"];
const PRIORITY_ORDER = ["Urgent", "High", "Medium", "Low"];

const costOf = (w) =>
  Number(w.totalCost) || (Number(w.laborCost) || 0) + (Number(w.materialCost) || 0);

// Completion date from the metadata bag, when the work order recorded one.
const completedOn = (w) =>
  toDate(w.completedAt) ||
  toDate(w.completedDate) ||
  toDate(w.completedOn) ||
  toDate(w.dateCompleted) ||
  toDate(w.closedAt);

// Group rows by a key → [{ id, label, count, open, cost }].
function breakdown(rows, keyOf, order) {
  const map = new Map();
  for (const w of rows) {
    const label = keyOf(w) || "Unspecified";
    const g = map.get(label) || { id: label, label, count: 0, open: 0, cost: 0 };
    g.count += 1;
    if (!CLOSED.includes(w.status)) g.open += 1;
    g.cost += costOf(w);
    map.set(label, g);
  }
  const out = [...map.values()];
  return order
    ? out.sort((a, b) => {
        const ia = order.indexOf(a.label);
        const ib = order.indexOf(b.label);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      })
    : out.sort((a, b) => b.count - a.count);
}

const breakdownColumns = (label, total) => [
  {
    key: "label",
    header: label,
    render: (r) => <span className="font-medium text-foreground">{r.label}</span>,
  },
  {
    key: "count",
    header: "Count",
    className: "w-40",
    render: (r) => (
      <div className="flex items-center gap-3">
        <MeterBar value={total ? r.count / total : 0} />
        <span className="w-8 shrink-0 text-right text-xs tabular-nums text-foreground">{r.count}</span>
      </div>
    ),
  },
  {
    key: "open",
    header: "Open",
    align: "right",
    className: "text-right tabular-nums text-text-secondary",
    render: (r) => r.open,
  },
  {
    key: "cost",
    header: "Cost",
    align: "right",
    className: "text-right tabular-nums text-text-secondary",
    render: (r) => currency(r.cost),
  },
];

const VENDOR_COLUMNS = [
  {
    key: "label",
    header: "Vendor",
    render: (r) => <span className="font-medium text-foreground">{r.label}</span>,
  },
  {
    key: "count",
    header: "Work orders",
    align: "right",
    className: "text-right tabular-nums text-text-secondary",
    render: (r) => r.count,
  },
  {
    key: "open",
    header: "Open",
    align: "right",
    className: "text-right tabular-nums text-text-secondary",
    render: (r) => r.open,
  },
  {
    key: "avg",
    header: "Avg cost",
    align: "right",
    className: "text-right tabular-nums text-text-secondary",
    render: (r) => currency(r.count ? r.cost / r.count : 0),
  },
  {
    key: "cost",
    header: "Total cost",
    align: "right",
    className: "text-right font-semibold tabular-nums text-foreground",
    render: (r) => currency(r.cost),
  },
];

export function MaintenanceReportScreen() {
  const { loading, data } = useReportData(LOADERS);
  const [property, setProperty] = useState("all");

  const rows = useMemo(() => {
    if (loading) return [];
    const units = byId(data.units);
    const props = byId(data.properties);
    return data.workOrders
      .map((w) => {
        const propertyId = propertyIdOf(w, units);
        return {
          ...w,
          propertyId,
          propertyText: props.get(propertyId)?.name || w.propertyLabel || "",
        };
      })
      .filter((w) => matchesProperty(property, w.propertyId));
  }, [loading, data, property]);

  const views = useMemo(() => {
    const vendors = breakdown(rows.filter((w) => w.vendorName), (w) => w.vendorName)
      .sort((a, b) => b.cost - a.cost || b.count - a.count)
      .slice(0, 10);
    return {
      status: breakdown(rows, (w) => w.status),
      priority: breakdown(rows, (w) => w.priority, PRIORITY_ORDER),
      category: breakdown(rows, (w) => w.category),
      vendors,
    };
  }, [rows]);

  const stats = useMemo(() => {
    const open = rows.filter((w) => !CLOSED.includes(w.status));
    const urgent = open.filter((w) => w.priority === "Urgent" || w.priority === "High").length;
    const durations = rows
      .filter((w) => w.status === "Completed")
      .map((w) => {
        const start = toDate(w.createdAt);
        const end = completedOn(w);
        return start && end ? Math.max(0, daysBetween(start, end)) : null;
      })
      .filter((d) => d !== null);
    const avg = durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : null;
    const labor = sumBy(rows, (w) => w.laborCost);
    const material = sumBy(rows, (w) => w.materialCost);
    return [
      { label: "Work orders", value: String(rows.length), footer: `${open.length} open` },
      { label: "Urgent / high", value: String(urgent), footer: `${percent(urgent, open.length)} of open` },
      {
        label: "Avg days to close",
        value: avg === null ? "—" : `${avg.toFixed(1)}d`,
        footer: durations.length ? `${durations.length} with a completion date` : "No completion dates recorded",
      },
      {
        label: "Total cost",
        value: currency(sumBy(rows, costOf)),
        footer: `${currency(labor)} labor · ${currency(material)} material`,
      },
    ];
  }, [rows]);

  const hasData = (data.workOrders || []).length > 0;

  const onExport = () =>
    exportCsv(
      "Maintenance report",
      [
        { header: "Work order", key: "name" },
        { header: "Property", key: "propertyText" },
        { header: "Category", key: "category" },
        { header: "Priority", key: "priority" },
        { header: "Status", key: "status" },
        { header: "Vendor", key: "vendorName" },
        { header: "Created", value: (r) => isoDate(toDate(r.createdAt)) },
        { header: "Completed", value: (r) => isoDate(completedOn(r)) },
        { header: "Labor cost", key: "laborCost" },
        { header: "Material cost", key: "materialCost" },
        { header: "Total cost", value: costOf },
      ],
      rows,
    );

  return (
    <ReportScreen
      title="Maintenance Report"
      description="Work-order volume, turnaround, and spend — by status, priority, category, and vendor."
      loading={loading}
      stats={loading || hasData ? stats : null}
      onExport={hasData ? onExport : null}
      filters={
        hasData ? (
          <PropertyFilter properties={data.properties} value={property} onChange={setProperty} />
        ) : null
      }
    >
      {!hasData ? (
        <ReportEmpty
          icon={Wrench}
          title="No work orders yet"
          description="Create work orders under Maintenance → Work Orders to see volume, turnaround, and cost."
        />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <ReportTable
              title="By status"
              columns={breakdownColumns("Status", rows.length)}
              rows={views.status}
              emptyIcon={Wrench}
              emptyTitle="No work orders for this property"
            />
            <ReportTable
              title="By priority"
              columns={breakdownColumns("Priority", rows.length)}
              rows={views.priority}
              emptyIcon={Wrench}
              emptyTitle="No work orders for this property"
            />
          </div>
          <ReportTable
            title="By category"
            columns={breakdownColumns("Category", rows.length)}
            rows={views.category}
            emptyIcon={Wrench}
            emptyTitle="No work orders for this property"
          />
          <ReportTable
            title="Top vendors"
            description="Ranked by total cost across their assigned work orders"
            columns={VENDOR_COLUMNS}
            rows={views.vendors}
            emptyIcon={Truck}
            emptyTitle="No vendors assigned"
            emptyDescription="Assign vendors on work orders to compare their volume and cost."
          />
        </>
      )}
    </ReportScreen>
  );
}

export default MaintenanceReportScreen;
