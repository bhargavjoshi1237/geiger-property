"use client";

import { useEffect, useState } from "react";
import {
  Boxes,
  Briefcase,
  Building2,
  ClipboardPen,
  Clock,
  FileText,
  LayoutDashboard,
  ListPlus,
  Settings,
  SquarePen,
  StickyNote,
  Target,
} from "lucide-react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { StatusPill } from "@/components/internal/shared/screen_kit";
import { listProperties, updateProperty } from "@/lib/supabase/properties";
import { portfoliosData } from "@/lib/supabase/portfolios";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import {
  SettingsSection,
  DocumentsSection,
  ActivitySection,
} from "@/components/internal/screens/entity/shared_sections";
import {
  PORTFOLIO_COLOR_OPTIONS,
  PORTFOLIO_STATUS_MAP,
  currency,
  pct,
} from "@/components/internal/screens/properties/constants";
import { loadPortfolioRows } from "@/components/internal/screens/properties/joins";
import { lifecycleActions } from "@/components/internal/screens/properties/actions";
import { makeInternalNotesSection } from "@/components/internal/screens/properties/sections/form_cards";
import { OccupancyBar } from "@/components/internal/screens/properties/sections/overview_parts";
import { emitRefresh } from "@/components/internal/screens/properties/sections/refresh";
import {
  PortfolioDetailsSection,
  PortfolioOverviewSection,
  PortfolioOwnersSection,
  PortfolioPropertiesTable,
  PortfolioTargetsSection,
  PortfolioWorkOrdersSection,
} from "./sections";

// Per-area config for Portfolios (row = a named collection of properties).

// Wizard step body: tick the properties to move into this portfolio.
function PropertyPicker({ portfolioId, values, set }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    listProperties().then((r) => alive && setRows((r || []).filter((p) => p.portfolioId !== portfolioId)));
    return () => {
      alive = false;
    };
  }, [portfolioId]);
  const picked = values.propertyIds || [];
  const toggle = (id) => set({ propertyIds: picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id] });

  if (rows === null) return <p className="text-sm text-text-secondary">Loading properties…</p>;
  if (!rows.length) return <p className="text-sm text-text-secondary">Every property is already in this portfolio.</p>;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
      {rows.map((p) => (
        <li key={p.id}>
          <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-surface-hover">
            <Checkbox checked={picked.includes(p.id)} onCheckedChange={() => toggle(p.id)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
              <span className="block truncate text-xs text-text-secondary">
                {[p.city, p.type, p.portfolioId ? "Moves from another portfolio" : null].filter(Boolean).join(" · ")}
              </span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

const addPropertiesAction = (item) => ({
  key: "addProperties",
  label: "Add properties",
  icon: ListPlus,
  wizard: {
    title: "Add properties",
    description: `Move properties into ${item.name}. A property belongs to one portfolio at a time.`,
    initial: () => ({ propertyIds: [] }),
    steps: [
      {
        key: "pick",
        title: "Properties",
        render: ({ values, set }) => <PropertyPicker portfolioId={item.id} values={values} set={set} />,
        validate: (v) => (v.propertyIds?.length ? null : "Pick at least one property."),
      },
    ],
    finishLabel: "Add to portfolio",
    logSummary: "Added properties",
    finish: async (values, ctx) => {
      const results = await Promise.all(values.propertyIds.map((id) => updateProperty(id, { portfolioId: ctx.item.id })));
      const ok = results.filter(Boolean);
      for (const p of ok) logSystemActivity("property", p.id, "updated", `Added to portfolio ${ctx.item.name}`);
      if (!ok.length) {
        toast.error("Couldn't add those properties.");
        return false;
      }
      emitRefresh("portfolio-properties", ctx.item.id);
      ctx.reload();
      ctx.navigate("properties");
      toast.success(`Added ${ok.length} propert${ok.length === 1 ? "y" : "ies"}.`);
      return true;
    },
  },
});

export const portfoliosConfig = {
  key: "portfolio",
  singular: "Portfolio",
  plural: "Portfolios",
  title: "Portfolios",
  description:
    "Group properties into portfolios to manage and report on them together. Open a portfolio to assign properties, set targets and track performance.",
  icon: Boxes,
  titleField: "name",
  searchFields: ["name", "manager", "region", "description"],
  data: portfoliosData,
  rowsLoader: loadPortfolioRows,

  statusMap: PORTFOLIO_STATUS_MAP,
  statusFilterOptions: [
    { value: "all", label: "All statuses" },
    ...Object.keys(PORTFOLIO_STATUS_MAP).map((k) => ({ value: k, label: k })),
  ],

  columns: [
    {
      key: "name",
      header: "Portfolio",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{[r.manager, r.region].filter(Boolean).join(" · ") || "—"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={PORTFOLIO_STATUS_MAP} />,
    },
    {
      key: "properties",
      header: "Properties",
      align: "right",
      className: "text-right tabular-nums text-foreground",
      render: (r) => r.propertyCount ?? 0,
    },
    {
      key: "units",
      header: "Units",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground dark:text-white",
      render: (r) => (r.unitCount ?? 0).toLocaleString(),
    },
    {
      key: "occupancy",
      header: "Occupancy",
      render: (r) => (r.unitCount ? <OccupancyBar value={r.occupancy} /> : <span className="text-sm text-text-tertiary">—</span>),
    },
    {
      key: "rentRoll",
      header: "Rent roll",
      align: "right",
      className: "text-right tabular-nums text-foreground",
      render: (r) => (r.rentRoll ? currency(r.rentRoll) : "—"),
    },
  ],

  stats: (rows) => {
    const live = rows.filter((r) => r.status !== "Archived");
    const props = live.reduce((s, r) => s + (Number(r.propertyCount) || 0), 0);
    const units = live.reduce((s, r) => s + (Number(r.unitCount) || 0), 0);
    const occupied = live.reduce((s, r) => s + ((Number(r.occupancy) || 0) / 100) * (Number(r.unitCount) || 0), 0);
    const rent = live.reduce((s, r) => s + (Number(r.rentRoll) || 0), 0);
    return [
      { label: "Portfolios", value: String(live.length), footer: `${new Set(live.map((r) => r.region).filter(Boolean)).size} regions` },
      { label: "Properties", value: String(props), footer: "Assigned to a portfolio" },
      { label: "Occupancy", value: pct(units ? (occupied / units) * 100 : 0), footer: `${units.toLocaleString()} units` },
      { label: "Rent roll", value: currency(rent), footer: "Monthly, all portfolios" },
    ];
  },

  createDraft: { name: "", manager: "", region: "", color: "emerald", status: "Active" },
  createFields: [
    { key: "name", label: "Portfolio name", type: "text", placeholder: "e.g. West Coast Residential" },
    { key: "manager", label: "Manager", type: "text", placeholder: "e.g. Dana Ruiz" },
    { key: "region", label: "Region", type: "text", placeholder: "e.g. Pacific Northwest" },
    { key: "color", label: "Accent color", type: "select", options: PORTFOLIO_COLOR_OPTIONS },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "Active", label: "Active" },
        { value: "Draft", label: "Draft" },
      ],
    },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    manager: draft.manager || "",
    region: draft.region || "",
    color: draft.color || "",
    status: draft.status || "Active",
  }),

  headerMeta: (r) =>
    [r.manager, r.region, r.propertyCount !== undefined ? `${r.propertyCount} properties` : null, r.unitCount ? `${r.unitCount} units` : null]
      .filter(Boolean)
      .join(" · "),

  actions: (item) => [addPropertiesAction(item), ...lifecycleActions({ singular: "Portfolio" })],

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "KPIs rolled up across every property in this portfolio." }] },
    {
      group: "Portfolio",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Name, manager, region and strategy." },
        { key: "properties", label: "Properties", icon: Building2, desc: "Properties in this portfolio — add or remove them here." },
        { key: "targets", label: "Targets & Reporting", icon: Target, desc: "Benchmarks and owner reporting." },
      ],
    },
    {
      group: "Rollups",
      items: [
        { key: "owners", label: "Owners", icon: Briefcase, desc: "Owners across this portfolio's properties." },
        { key: "workorders", label: "Work Orders", icon: ClipboardPen, desc: "Maintenance across this portfolio." },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Files and paperwork." },
        { key: "notes", label: "Notes", icon: StickyNote, desc: "Internal notes for your team." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Every change and note on this portfolio." },
        { key: "settings", label: "Settings", icon: Settings, desc: "Status and danger zone." },
      ],
    },
  ],
  sections: {
    overview: PortfolioOverviewSection,
    details: PortfolioDetailsSection,
    properties: PortfolioPropertiesTable,
    targets: PortfolioTargetsSection,
    owners: PortfolioOwnersSection,
    workorders: PortfolioWorkOrdersSection,
    documents: DocumentsSection,
    notes: makeInternalNotesSection(),
    activity: ActivitySection,
    settings: SettingsSection,
  },
};

export default portfoliosConfig;
