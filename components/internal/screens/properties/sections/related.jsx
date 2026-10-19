"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ClipboardPen, DoorOpen, FileSignature, Home, Plus, Warehouse } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { StatusPill } from "@/components/internal/shared/screen_kit";
import { WizardDialog } from "@/components/internal/shared/wizard_dialog";
import { makeRelatedSection } from "@/components/internal/screens/entity/sections/related_section";
import { listUnits } from "@/lib/supabase/units";
import { listBuildings, createBuilding } from "@/lib/supabase/buildings";
import { leasesLayer } from "@/lib/supabase/leases";
import { workOrdersLayer } from "@/lib/supabase/work_orders";
import { listingsLayer } from "@/lib/supabase/listings";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import {
  BUILDING_STATUS_MAP,
  STRUCTURE_OPTIONS,
  UNIT_STATUS_MAP,
  currency,
  dateRange,
  formatDate,
  statusTone,
} from "../constants";
import { computeKpis, leasesFor } from "../joins";
import { emitRefresh, useRefreshKey } from "./refresh";

// Related-record tables for the Property / Building editors. Rows open in their
// own workspace tab; toolbars add records without leaving the editor.

const toneBadge = (s) => <Badge variant={statusTone(s)}>{s || "—"}</Badge>;
const right = "text-right tabular-nums text-foreground";

function Footer({ children }) {
  return <p className="px-1 text-xs text-text-tertiary">{children}</p>;
}

function Toolbar({ children }) {
  return <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>;
}

// --- units -----------------------------------------------------------------------

export const UNIT_COLUMNS = [
  {
    key: "label",
    header: "Unit",
    render: (u) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-foreground">{u.label || "Unit"}</span>
        <span className="text-xs text-text-secondary">
          {[u.buildingName, u.floor && `Floor ${u.floor}`].filter(Boolean).join(" · ") || "—"}
        </span>
      </div>
    ),
  },
  { key: "status", header: "Status", render: (u) => <StatusPill status={u.status} map={UNIT_STATUS_MAP} /> },
  {
    key: "beds",
    header: "Beds / baths",
    render: (u) => <span className="text-sm text-muted-foreground">{`${u.bedrooms || 0} bd / ${u.bathrooms || 0} ba`}</span>,
  },
  { key: "sqft", header: "Sqft", align: "right", className: right, render: (u) => (u.sqft ? Number(u.sqft).toLocaleString() : "—") },
  { key: "occupant", header: "Resident", render: (u) => <span className="text-sm text-muted-foreground">{u.occupantName || "—"}</span> },
  { key: "rent", header: "Rent", align: "right", className: right, render: (u) => currency(u.rent) },
];

const unitsFooter = (rows) => {
  const k = computeKpis({ units: rows });
  return (
    <Footer>
      {rows.length} units · {Math.round(k.occupancy)}% occupied · {currency(rows.reduce((s, u) => s + (Number(u.rent) || 0), 0))}/mo at full occupancy
    </Footer>
  );
};

async function loadUnitsWith(filter) {
  const [units, buildings] = await Promise.all([listUnits(), listBuildings()]);
  const names = Object.fromEntries((buildings || []).map((b) => [b.id, b.name]));
  return (units || [])
    .filter(filter)
    .map((u) => ({ ...u, buildingName: names[u.buildingId] || "" }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true }));
}

const PropertyUnitsTable = makeRelatedSection({
  load: (item) => loadUnitsWith((u) => u.propertyId === item.id),
  columns: UNIT_COLUMNS,
  tab: "Units",
  plural: "Units",
  icon: DoorOpen,
  emptyDescription: "Use Add units to create a batch of units for this property.",
  footer: unitsFooter,
});

const BuildingUnitsTable = makeRelatedSection({
  load: (item) => loadUnitsWith((u) => u.buildingId === item.id),
  columns: UNIT_COLUMNS,
  tab: "Units",
  plural: "Units",
  icon: DoorOpen,
  emptyDescription: "Use Add units to create units in this building.",
  footer: unitsFooter,
});

function UnitsWithToolbar({ Table, ...props }) {
  const key = useRefreshKey("units", props.item.id);
  return (
    <div className="space-y-4">
      <Toolbar>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => props.runAction("addUnits")}>
          <Plus className="h-4 w-4" /> Add Units
        </Button>
      </Toolbar>
      <Table key={key} {...props} />
    </div>
  );
}

export const PropertyUnitsSection = (props) => <UnitsWithToolbar Table={PropertyUnitsTable} {...props} />;
export const BuildingUnitsSection = (props) => <UnitsWithToolbar Table={BuildingUnitsTable} {...props} />;

// --- buildings --------------------------------------------------------------------

const PropertyBuildingsTable = makeRelatedSection({
  load: async (item) => {
    const [buildings, units] = await Promise.all([listBuildings(), listUnits()]);
    return (buildings || [])
      .filter((b) => b.propertyId === item.id)
      .map((b) => {
        const mine = (units || []).filter((u) => u.buildingId === b.id);
        return { ...b, unitCount: mine.length, occupancy: computeKpis({ units: mine }).occupancy };
      });
  },
  columns: [
    {
      key: "name",
      header: "Building",
      render: (b) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{b.name}</span>
          <span className="text-xs text-text-secondary">
            {[b.blockCode && `Block ${b.blockCode}`, b.structureType].filter(Boolean).join(" · ") || "—"}
          </span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (b) => <StatusPill status={b.status} map={BUILDING_STATUS_MAP} /> },
    { key: "floors", header: "Floors", align: "right", className: right, render: (b) => b.floors ?? 1 },
    { key: "units", header: "Units", align: "right", className: right, render: (b) => b.unitCount },
    { key: "occ", header: "Occupancy", align: "right", className: right, render: (b) => (b.unitCount ? `${Math.round(b.occupancy)}%` : "—") },
  ],
  tab: "Buildings",
  plural: "Buildings",
  icon: Warehouse,
  emptyDescription: "Add the buildings or blocks that make up this property.",
});

const BUILDING_FIELDS = [
  { key: "name", label: "Building name", type: "text", required: true, placeholder: "e.g. Building A" },
  { key: "blockCode", label: "Block code", type: "text", placeholder: "e.g. A" },
  { key: "floors", label: "Floors", type: "number", min: 1 },
  { key: "yearBuilt", label: "Year built", type: "number" },
  { key: "structureType", label: "Structure", type: "select", options: STRUCTURE_OPTIONS },
];

export function PropertyBuildingsSection(props) {
  const { item } = props;
  const key = useRefreshKey("buildings", item.id);
  const [open, setOpen] = useState(false);

  const create = async (values) => {
    const row = await createBuilding({
      id: crypto.randomUUID(),
      ...values,
      floors: Number(values.floors) || 1,
      propertyId: item.id,
      status: "Active",
    });
    if (!row) {
      toast.error("Couldn't add the building.");
      return false;
    }
    logSystemActivity("building", row.id, "created", `Created building on ${item.name}`);
    emitRefresh("buildings", item.id);
    toast.success(`${row.name} added.`);
    return true;
  };

  return (
    <div className="space-y-4">
      <Toolbar>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New Building
        </Button>
      </Toolbar>
      <PropertyBuildingsTable key={key} {...props} />
      <WizardDialog
        open={open}
        onOpenChange={setOpen}
        title="New Building"
        description={`Add a building or block to ${item.name}.`}
        steps={[{ key: "main", title: "Building", fields: BUILDING_FIELDS }]}
        initial={{ floors: 1 }}
        finishLabel="Add Building"
        onFinish={create}
      />
    </div>
  );
}

// --- leases / work orders / listings ------------------------------------------------

export const PropertyLeasesSection = makeRelatedSection({
  load: async (item) => {
    const [leases, units] = await Promise.all([leasesLayer.list(), listUnits()]);
    const unitIds = (units || []).filter((u) => u.propertyId === item.id).map((u) => u.id);
    return leasesFor(leases, [item.id], unitIds);
  },
  columns: [
    {
      key: "name",
      header: "Lease",
      render: (l) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{l.name || "Lease"}</span>
          <span className="text-xs text-text-secondary">{[l.tenantName, l.unit && `Unit ${l.unit}`].filter(Boolean).join(" · ") || "—"}</span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (l) => toneBadge(l.status) },
    { key: "term", header: "Term", render: (l) => <span className="text-sm text-muted-foreground">{dateRange(l.termStart, l.termEnd) || "—"}</span> },
    { key: "rent", header: "Rent", align: "right", className: right, render: (l) => currency(l.rent) },
  ],
  tab: "Leases",
  plural: "Leases",
  icon: FileSignature,
  emptyDescription: "Leases on this property's units show up here.",
  footer: (rows) => (
    <Footer>
      {rows.filter((l) => ["Active", "Expiring soon"].includes(l.status)).length} active ·{" "}
      {currency(rows.filter((l) => ["Active", "Expiring soon"].includes(l.status)).reduce((s, l) => s + (Number(l.rent) || 0), 0))}/mo
    </Footer>
  ),
});

export const WORK_ORDER_COLUMNS = [
  {
    key: "name",
    header: "Work order",
    render: (w) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-foreground">{w.name || "Work order"}</span>
        <span className="text-xs text-text-secondary">{[w.category, w.vendorName || w.technician].filter(Boolean).join(" · ") || "—"}</span>
      </div>
    ),
  },
  { key: "status", header: "Status", render: (w) => toneBadge(w.status) },
  { key: "priority", header: "Priority", render: (w) => <Badge variant={["Urgent", "High", "Emergency"].includes(w.priority) ? "danger" : "neutral"}>{w.priority || "—"}</Badge> },
  { key: "date", header: "Scheduled", render: (w) => <span className="text-sm text-muted-foreground">{formatDate(w.scheduledDate)}</span> },
  { key: "cost", header: "Cost", align: "right", className: right, render: (w) => (w.totalCost ? currency(w.totalCost) : "—") },
];

export const PropertyWorkOrdersSection = makeRelatedSection({
  load: (item) => workOrdersLayer.list({ propertyId: item.id }),
  columns: WORK_ORDER_COLUMNS,
  tab: "Work Orders",
  plural: "Work orders",
  icon: ClipboardPen,
  emptyDescription: "Maintenance requests and work orders for this property show up here.",
  footer: (rows) => (
    <Footer>
      {rows.filter((w) => !["Completed", "Rejected", "Converted", "Cancelled", "Closed"].includes(w.status)).length} open ·{" "}
      {currency(rows.reduce((s, w) => s + (Number(w.totalCost) || 0), 0))} total cost
    </Footer>
  ),
});

export const PropertyListingsSection = makeRelatedSection({
  load: (item) => listingsLayer.list({ propertyId: item.id }),
  columns: [
    {
      key: "name",
      header: "Listing",
      render: (l) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{l.name || "Listing"}</span>
          <span className="text-xs text-text-secondary">{l.unit ? `Unit ${l.unit}` : "—"}</span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (l) => toneBadge(l.status) },
    { key: "beds", header: "Beds / baths", render: (l) => <span className="text-sm text-muted-foreground">{`${l.bedrooms || 0} bd / ${l.bathrooms || 0} ba`}</span> },
    { key: "available", header: "Available", render: (l) => <span className="text-sm text-muted-foreground">{formatDate(l.availableDate)}</span> },
    { key: "rent", header: "Rent", align: "right", className: right, render: (l) => currency(l.rent) },
  ],
  tab: "Listings",
  plural: "Listings",
  icon: Home,
  emptyDescription: "Marketing listings for this property's vacancies show up here.",
});
