"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListLoading, StatsBar } from "@/components/internal/shared/screen_kit";
import { getProperty } from "@/lib/supabase/properties";
import { listRecordItems } from "@/lib/supabase/record_items";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { STRUCTURE_OPTIONS, currency, pct } from "@/components/internal/screens/properties/constants";
import { loadPropertyOptions, loadScopeData, scopeKpis } from "@/components/internal/screens/properties/joins";
import { complianceState } from "@/components/internal/screens/properties/record_kinds";
import { CONSTRUCTION_FIELDS } from "@/components/internal/screens/properties/sections/property_tabs";
import { makeCardsSection } from "@/components/internal/screens/properties/sections/form_cards";
import { CoverCard } from "@/components/internal/screens/properties/sections/cover_card";
import { AttentionCard, FactsCard, UnitMixCard } from "@/components/internal/screens/properties/sections/overview_parts";
import { useRefreshKey } from "@/components/internal/screens/properties/sections/refresh";

// Building-specific editor sections: overview rollup, details and construction.

export function BuildingOverviewSection({ item, config, onNavigate }) {
  const { openItemInTab } = useWorkspaceUrl();
  const [d, setD] = useState(null);
  const unitsKey = useRefreshKey("units", item.id);

  useEffect(() => {
    let alive = true;
    Promise.all([
      loadScopeData(),
      listRecordItems(config.key, item.id),
      item.propertyId ? getProperty(item.propertyId) : null,
    ]).then(([all, items, property]) => {
      if (alive) setD({ scope: scopeKpis(all, { buildingId: item.id }), items: items || [], property });
    });
    return () => {
      alive = false;
    };
  }, [item.id, item.propertyId, config.key, unitsKey]);

  if (!d) return <ListLoading label="Loading overview" className="py-10" />;

  const { kpis, units } = d.scope;
  const construction = item.metadata?.construction || {};
  const compliance = d.items.filter((r) => r.kind === "compliance_item").map((r) => ({ ...r, state: complianceState(r) }));
  const floorsLogged = d.items.filter((r) => r.kind === "floor").length;
  const attention = [];
  if (!item.propertyId) attention.push({ key: "prop", label: "Not linked to a property", tone: "warning", section: "details" });
  const overdue = compliance.filter((c) => ["Overdue", "Expired", "Failed"].includes(c.state));
  if (overdue.length) attention.push({ key: "comp", label: `${overdue.length} inspection${overdue.length === 1 ? "" : "s"} overdue`, detail: overdue.map((c) => c.name).join(", "), tone: "danger", section: "compliance" });
  const dueSoon = compliance.filter((c) => c.state === "Due soon");
  if (dueSoon.length) attention.push({ key: "comp-soon", label: `${dueSoon.length} inspection${dueSoon.length === 1 ? "" : "s"} due within 30 days`, tone: "warning", section: "compliance" });
  if (kpis.vacant) attention.push({ key: "vacant", label: `${kpis.vacant} vacant unit${kpis.vacant === 1 ? "" : "s"}`, detail: `${currency(kpis.vacancyLoss)}/mo in potential rent`, tone: "warning", section: "units" });
  if (kpis.expiringLeases) attention.push({ key: "leases", label: `${kpis.expiringLeases} lease${kpis.expiringLeases === 1 ? "" : "s"} ending within 60 days`, tone: "warning" });
  if (kpis.urgentWork) attention.push({ key: "work", label: `${kpis.urgentWork} high-priority work order${kpis.urgentWork === 1 ? "" : "s"} open`, tone: "danger" });

  return (
    <div className="space-y-6">
      <StatsBar
        stats={[
          { label: "Units", value: String(kpis.unitCount), footer: `${item.floors ?? 1} floors` },
          { label: "Occupancy", value: pct(kpis.occupancy), footer: `${kpis.occupied} occupied · ${kpis.vacant} vacant` },
          { label: "Rent roll", value: currency(kpis.rentRoll), footer: "Monthly" },
          { label: "Open work orders", value: String(kpis.openWork), footer: `${kpis.activeLeases} active leases` },
        ]}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <AttentionCard items={attention} onNavigate={onNavigate} />
        <FactsCard
          action={
            item.propertyId ? (
              <Button
                variant="outline"
                size="sm"
                className="border-border bg-surface-card hover:bg-surface-hover"
                onClick={() => openItemInTab(item.propertyId, "Properties")}
              >
                Open property <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            ) : null
          }
          facts={[
            { label: "Property", value: d.property?.name || item.propertyName },
            { label: "Block / wing", value: [item.blockCode && `Block ${item.blockCode}`, item.wing].filter(Boolean).join(" · ") },
            { label: "Structure", value: item.structureType },
            { label: "Year built", value: item.yearBuilt ? String(item.yearBuilt) : "" },
            { label: "Floors", value: `${item.floors ?? 1}${floorsLogged ? ` (${floorsLogged} described)` : ""}` },
            { label: "Construction", value: [construction.constructionType, construction.roofType].filter(Boolean).join(" · ") },
            { label: "Elevators", value: construction.elevators ? String(construction.elevators) : "" },
            { label: "Gross area", value: item.metadata?.grossSqft ? `${Number(item.metadata.grossSqft).toLocaleString()} sqft` : "" },
          ]}
        />
      </div>
      <UnitMixCard units={units} />
    </div>
  );
}

export const BuildingDetailsSection = makeCardsSection([
  {
    title: "Identity",
    fields: [
      { key: "name", label: "Building name", type: "text", required: true, full: true },
      { key: "propertyId", label: "Property", type: "relation", load: loadPropertyOptions, displayKey: "propertyName", placeholder: "Not linked" },
      { key: "blockCode", label: "Block code", type: "text" },
      { key: "wing", label: "Wing / section", type: "text" },
      { key: "structureType", label: "Structure type", type: "select", options: STRUCTURE_OPTIONS },
      { key: "floors", label: "Floors", type: "number", min: 1 },
      { key: "yearBuilt", label: "Year built", type: "number", min: 1700, max: 2100 },
    ],
  },
  {
    title: "Location & size",
    fields: [
      { key: "streetAddress", label: "Street address (if different)", type: "text", meta: true, full: true },
      { key: "grossSqft", label: "Gross area", type: "number", meta: true, suffix: "sqft", min: 0 },
      { key: "footprintSqft", label: "Footprint", type: "number", meta: true, suffix: "sqft", min: 0 },
      { key: "basementLevels", label: "Basement levels", type: "number", meta: true, min: 0 },
      { key: "entrances", label: "Entrances", type: "number", meta: true, min: 0 },
      { key: "mailroom", label: "Mailroom / package room", type: "switch", meta: true },
      { key: "laundryRoom", label: "Shared laundry", type: "switch", meta: true },
      { key: "accessNotes", label: "Access notes", type: "textarea", meta: true, placeholder: "Gate codes live under Keys & Access." },
    ],
  },
  {
    title: "Description",
    fields: [{ key: "description", label: "Description", type: "textarea", rows: 4 }],
  },
  {
    title: "Photo",
    description: "Shown on the building overview.",
    render: (props) => <CoverCard {...props} meta />,
  },
]);

export const BuildingConstructionSection = makeCardsSection([
  {
    title: "Construction & systems",
    description: "Structure and building systems for this building.",
    metaKey: "construction",
    fields: CONSTRUCTION_FIELDS,
  },
]);
