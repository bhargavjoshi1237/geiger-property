"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Briefcase, Building2, ClipboardPen, X } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui/select";
import {
  DataTable,
  EmptyState,
  ListLoading,
  SectionCard,
  StatsBar,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import { makeRelatedSection } from "@/components/internal/screens/entity/sections/related_section";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listProperties, updateProperty } from "@/lib/supabase/properties";
import { propertyOwnersLayer } from "@/lib/supabase/property_owners";
import { workOrdersLayer } from "@/lib/supabase/work_orders";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import {
  MONTH_OPTIONS,
  PORTFOLIO_COLOR_OPTIONS,
  PROPERTY_STATUS_MAP,
  currency,
  formatDate,
  opts,
  pct,
} from "@/components/internal/screens/properties/constants";
import { loadScopeData, scopeKpis, teamLoader } from "@/components/internal/screens/properties/joins";
import { makeCardsSection } from "@/components/internal/screens/properties/sections/form_cards";
import { AttentionCard, OccupancyBar } from "@/components/internal/screens/properties/sections/overview_parts";
import { WORK_ORDER_COLUMNS } from "@/components/internal/screens/properties/sections/related";
import { emitRefresh, useRefreshKey } from "@/components/internal/screens/properties/sections/refresh";

// Portfolio editor sections: KPI rollup across member properties, membership
// table with add/remove, owner and work-order rollups, details and targets.

const right = "text-right tabular-nums text-foreground";

// Member properties with their own KPIs.
async function loadRollup(portfolioId) {
  const [properties, all] = await Promise.all([listProperties(), loadScopeData()]);
  const members = (properties || []).filter((p) => p.portfolioId === portfolioId);
  const rows = members.map((p) => ({ ...p, kpis: scopeKpis(all, { propertyIds: [p.id] }).kpis }));
  const total = scopeKpis(all, { propertyIds: members.map((p) => p.id) });
  return { properties: properties || [], members: rows, total };
}

const MEMBER_COLUMNS = [
  {
    key: "name",
    header: "Property",
    render: (p) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-foreground">{p.name}</span>
        <span className="text-xs text-text-secondary">{[p.city, p.type].filter(Boolean).join(" · ") || "—"}</span>
      </div>
    ),
  },
  { key: "status", header: "Status", render: (p) => <StatusPill status={p.status} map={PROPERTY_STATUS_MAP} /> },
  { key: "units", header: "Units", align: "right", className: right, render: (p) => p.kpis.unitCount },
  { key: "occ", header: "Occupancy", render: (p) => (p.kpis.unitCount ? <OccupancyBar value={p.kpis.occupancy} /> : "—") },
  { key: "work", header: "Open WOs", align: "right", className: right, render: (p) => p.kpis.openWork },
  { key: "rent", header: "Rent roll", align: "right", className: right, render: (p) => currency(p.kpis.rentRoll) },
];

export function PortfolioOverviewSection({ item, onNavigate }) {
  const { openItemInTab } = useWorkspaceUrl();
  const key = useRefreshKey("portfolio-properties", item.id);
  const [d, setD] = useState(null);

  useEffect(() => {
    let alive = true;
    loadRollup(item.id).then((r) => alive && setD(r));
    return () => {
      alive = false;
    };
  }, [item.id, key]);

  if (!d) return <ListLoading label="Loading overview" className="py-10" />;
  const k = d.total.kpis;
  const targets = item.metadata?.targets || {};
  const attention = [];
  if (!d.members.length) attention.push({ key: "empty", label: "No properties in this portfolio yet", tone: "warning", section: "properties" });
  if (targets.targetOccupancyPct && k.unitCount && k.occupancy < Number(targets.targetOccupancyPct)) {
    attention.push({ key: "occ", label: `Occupancy ${pct(k.occupancy)} is below the ${pct(targets.targetOccupancyPct)} target`, tone: "warning", section: "targets" });
  }
  if (targets.targetRentRoll && k.rentRoll < Number(targets.targetRentRoll)) {
    attention.push({ key: "rent", label: `Rent roll ${currency(k.rentRoll)} is below the ${currency(targets.targetRentRoll)} target`, tone: "warning", section: "targets" });
  }
  if (k.urgentWork) attention.push({ key: "work", label: `${k.urgentWork} high-priority work order${k.urgentWork === 1 ? "" : "s"} open`, tone: "danger", section: "workorders" });
  if (k.expiringLeases) attention.push({ key: "leases", label: `${k.expiringLeases} lease${k.expiringLeases === 1 ? "" : "s"} ending within 60 days`, tone: "warning" });

  return (
    <div className="space-y-6">
      <StatsBar
        stats={[
          { label: "Properties", value: String(d.members.length), footer: `${d.members.filter((p) => p.status === "Active").length} active` },
          { label: "Units", value: k.unitCount.toLocaleString(), footer: `${k.vacant} vacant` },
          { label: "Occupancy", value: pct(k.occupancy), footer: targets.targetOccupancyPct ? `Target ${pct(targets.targetOccupancyPct)}` : `${k.occupied} occupied` },
          { label: "Rent roll", value: currency(k.rentRoll), footer: "Monthly" },
        ]}
      />
      <StatsBar
        stats={[
          { label: "Active leases", value: String(k.activeLeases), footer: `${k.expiringLeases} ending in 60 days` },
          { label: "Open work orders", value: String(k.openWork), footer: `${k.urgentWork} high priority` },
          { label: "Avg rent", value: currency(k.avgRent), footer: "Per unit, asking" },
          { label: "Vacancy loss", value: currency(k.vacancyLoss), footer: "Monthly" },
        ]}
      />
      <AttentionCard items={attention} onNavigate={onNavigate} />
      <SectionCard title="Properties" description="Performance by property." bodyPadding={false}>
        {d.members.length ? (
          <div className="overflow-x-auto">
            <DataTable
              className="rounded-none border-0"
              columns={MEMBER_COLUMNS}
              data={d.members}
              getRowKey={(p) => p.id}
              onRowClick={(p) => openItemInTab(p.id, "Properties")}
            />
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-text-secondary">Add properties from the Properties tab.</p>
        )}
      </SectionCard>
    </div>
  );
}

// Membership: properties.portfolio_id = this portfolio. Optimistic add/remove.
export function PortfolioPropertiesTable({ item }) {
  const { openItemInTab } = useWorkspaceUrl();
  const key = useRefreshKey("portfolio-properties", item.id);
  const [d, setD] = useState(null);
  const [pick, setPick] = useState("");

  useEffect(() => {
    let alive = true;
    loadRollup(item.id).then((r) => alive && setD(r));
    return () => {
      alive = false;
    };
  }, [item.id, key]);

  const available = useMemo(
    () => (d ? d.properties.filter((p) => p.portfolioId !== item.id) : []),
    [d, item.id],
  );

  if (!d) return <ListLoading label="Loading properties" className="py-10" />;

  const reload = () => emitRefresh("portfolio-properties", item.id);

  const assign = async (propId) => {
    setPick("");
    const prop = d.properties.find((p) => p.id === propId);
    if (!prop) return;
    if (!(await updateProperty(propId, { portfolioId: item.id }))) {
      toast.error("Couldn't add that property.");
      return;
    }
    logSystemActivity("portfolio", item.id, "updated", `Added ${prop.name}`);
    logSystemActivity("property", propId, "updated", `Added to portfolio ${item.name}`);
    toast.success(`${prop.name} added.`);
    reload();
  };

  const remove = async (prop) => {
    setD((cur) => ({ ...cur, members: cur.members.filter((m) => m.id !== prop.id) }));
    if (!(await updateProperty(prop.id, { portfolioId: null }))) {
      toast.error("Couldn't remove that property.");
      reload();
      return;
    }
    logSystemActivity("portfolio", item.id, "updated", `Removed ${prop.name}`);
    logSystemActivity("property", prop.id, "updated", `Removed from portfolio ${item.name}`);
    toast.success(`${prop.name} removed.`);
    reload();
  };

  const columns = [
    ...MEMBER_COLUMNS,
    {
      key: "remove",
      header: "",
      align: "right",
      render: (p) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-red-600 dark:text-red-300 hover:bg-red-500/10"
            onClick={() => remove(p)}
            aria-label={`Remove ${p.name}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-text-secondary">
          {d.members.length} propert{d.members.length === 1 ? "y" : "ies"} · {d.total.kpis.unitCount} units
        </p>
        <Select value={pick} onValueChange={assign}>
          <SelectTrigger className="bg-surface-card sm:w-72">
            <SelectValue placeholder="Add a property…" />
          </SelectTrigger>
          <SelectContent>
            {available.length === 0 ? (
              <SelectItem value="__none__" disabled>
                No more properties to add
              </SelectItem>
            ) : (
              available.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.portfolioId ? " · in another portfolio" : p.city ? ` · ${p.city}` : ""}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
      {d.members.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={Building2} title="No properties yet" description="Add properties to build this portfolio." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable columns={columns} data={d.members} getRowKey={(p) => p.id} onRowClick={(p) => openItemInTab(p.id, "Properties")} />
        </div>
      )}
    </div>
  );
}

// Owners across every member property.
export const PortfolioOwnersSection = makeRelatedSection({
  load: async (item) => {
    const [properties, owners] = await Promise.all([listProperties(), propertyOwnersLayer.list()]);
    const ids = new Set((properties || []).filter((p) => p.portfolioId === item.id).map((p) => p.id));
    return (owners || []).filter((o) => ids.has(o.propertyId));
  },
  columns: [
    { key: "owner", header: "Owner", render: (o) => <span className="font-medium text-foreground">{o.ownerName || "Owner"}</span> },
    { key: "property", header: "Property", render: (o) => <span className="text-sm text-muted-foreground">{o.propertyName || "—"}</span> },
    { key: "since", header: "Since", render: (o) => <span className="text-sm text-muted-foreground">{formatDate(o.startsOn)}</span> },
    { key: "primary", header: "", render: (o) => (o.isPrimary ? <Badge variant="neutral">Primary</Badge> : null) },
    { key: "pct", header: "Share", align: "right", className: right, render: (o) => `${Number(o.ownershipPct) || 0}%` },
  ],
  plural: "Owners",
  icon: Briefcase,
  emptyDescription: "Owners assigned to this portfolio's properties show up here.",
});

export const PortfolioWorkOrdersSection = makeRelatedSection({
  load: async (item) => {
    const [properties, work] = await Promise.all([listProperties(), workOrdersLayer.list()]);
    const names = Object.fromEntries((properties || []).filter((p) => p.portfolioId === item.id).map((p) => [p.id, p.name]));
    return (work || []).filter((w) => names[w.propertyId]).map((w) => ({ ...w, propertyName: names[w.propertyId] }));
  },
  columns: [
    WORK_ORDER_COLUMNS[0],
    { key: "property", header: "Property", render: (w) => <span className="text-sm text-muted-foreground">{w.propertyName}</span> },
    ...WORK_ORDER_COLUMNS.slice(1),
  ],
  tab: "Work Orders",
  plural: "Work orders",
  icon: ClipboardPen,
  emptyDescription: "Work orders across this portfolio's properties show up here.",
});

export const PortfolioDetailsSection = makeCardsSection([
  {
    title: "Identity",
    fields: [
      { key: "name", label: "Portfolio name", type: "text", required: true, full: true },
      { key: "manager", label: "Manager", type: "text", placeholder: "e.g. Dana Ruiz" },
      { key: "managerMemberId", label: "Manager (team member)", type: "relation", meta: true, load: teamLoader("managerMemberName"), displayKey: "managerMemberName", placeholder: "Not linked" },
      { key: "region", label: "Region", type: "text" },
      { key: "color", label: "Accent color", type: "select", options: PORTFOLIO_COLOR_OPTIONS },
      { key: "strategy", label: "Strategy", type: "select", meta: true, options: opts("Core", "Core-plus", "Value-add", "Opportunistic", "Affordable", "Build-to-rent") },
      { key: "ownershipEntity", label: "Ownership entity", type: "text", meta: true, placeholder: "e.g. Maple Holdings LLC" },
      { key: "formedOn", label: "Formed on", type: "date", meta: true },
    ],
  },
  {
    title: "Description",
    fields: [{ key: "description", label: "Description", type: "textarea", rows: 4 }],
  },
]);

export const PortfolioTargetsSection = makeCardsSection([
  {
    title: "Targets",
    description: "Benchmarks the overview compares this portfolio against.",
    metaKey: "targets",
    fields: [
      { key: "targetOccupancyPct", label: "Target occupancy", type: "percent", min: 0, max: 100 },
      { key: "targetRentRoll", label: "Target monthly rent roll", type: "currency" },
      { key: "targetNoi", label: "Target annual NOI", type: "currency" },
      { key: "maxDelinquencyPct", label: "Max delinquency", type: "percent" },
      { key: "budgetYear", label: "Budget year", type: "number", min: 2000, max: 2100 },
      { key: "fiscalYearStart", label: "Fiscal year starts", type: "select", options: MONTH_OPTIONS },
    ],
  },
  {
    title: "Reporting",
    metaKey: "targets",
    fields: [
      { key: "reportingFrequency", label: "Report to owners", type: "select", options: opts("Monthly", "Quarterly", "Annually") },
      { key: "reportDay", label: "Report on day", type: "number", min: 1, max: 28 },
      { key: "reportRecipients", label: "Recipients", type: "text", full: true, placeholder: "Comma-separated emails" },
      { key: "consolidatedStatements", label: "Send one consolidated statement", type: "switch" },
    ],
  },
]);
