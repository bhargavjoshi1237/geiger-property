"use client";

import { toast } from "sonner";
import {
  LayoutDashboard,
  Link2,
  DoorClosed,
  GitCompare,
  StickyNote,
  PenLine,
  ClipboardCheck,
  Clock,
  FileText,
  Play,
  CheckCircle2,
  XCircle,
  Wand2,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { ActivitySection, DocumentsSection } from "@/components/internal/screens/entity/shared_sections";
import { inspectionsData } from "@/lib/supabase/inspections";
import { movesLayer } from "@/lib/supabase/moves";
import { securityDepositsLayer } from "@/lib/supabase/security_deposits";
import { unitTurnsLayer } from "@/lib/supabase/unit_turns";
import { leaseOptions, tenantOptions, unitOptions } from "@/lib/supabase/options";
import { storeTextDocument } from "@/lib/leasing/workflows";
import { makeNotesSection } from "@/components/internal/screens/entity/sections/factories";
import { makeGatedSection, makeMetaAwareFieldsSection } from "./sections/gated";
import {
  InspectionComparisonSection,
  InspectionOverviewSection,
  InspectionRoomsSection,
  InspectionSignaturesSection,
  inspectionStats,
  roomsOf,
} from "./sections/inspection_sections";
import { tenantJoinedLoader } from "./joins";
import {
  INSPECTION_STATUS_MAP,
  INSPECTION_TYPE_OPTIONS,
  conditionOf,
  currency,
  filterOptions,
  formatDate,
  inspectionKindLabel,
  inspectionKindOf,
  withinDays,
} from "./shared";

// Inspections — an entity screen over `property.inspections`. A structured
// report (rooms → items on a condition scale, notes, photos), typed-name
// signatures, and a move-in vs move-out comparison feeding deposit deductions.

const isMoveOut = (r) => inspectionKindOf(r) === "move_out";

async function moveOptions() {
  const rows = (await movesLayer.list()) ?? [];
  return rows.map((m) => ({ value: m.id, label: `${m.name || "Move"} · ${formatDate(m.moveDate)}`, patch: {} }));
}
async function depositOptions() {
  const rows = (await securityDepositsLayer.list()) ?? [];
  return rows.map((d) => ({ value: d.id, label: `${d.name || "Deposit"} · ${currency(d.amount)}`, patch: {} }));
}
async function turnOptions() {
  const rows = (await unitTurnsLayer.list()) ?? [];
  return rows.map((t) => ({ value: t.id, label: t.name || "Unit turn", patch: {} }));
}

// Plain-text report for the Documents tab.
function reportText(r) {
  const lines = [`INSPECTION REPORT — ${inspectionKindLabel(r).toUpperCase()}`, r.name, `Unit: ${r.unit || "—"}   Tenant: ${r.tenantName || "—"}`, `Date: ${formatDate(r.inspectionDate)}   Inspector: ${r.inspector || "—"}`, ""];
  for (const room of roomsOf(r)) {
    lines.push(room.name.toUpperCase());
    for (const it of room.items) {
      lines.push(`  • ${it.name}: ${conditionOf(it.condition)?.label || "Not rated"}${it.notes ? ` — ${it.notes}` : ""}${it.photos?.length ? ` (${it.photos.length} photo${it.photos.length === 1 ? "" : "s"})` : ""}`);
    }
    lines.push("");
  }
  const sig = r.metadata?.signatures || {};
  lines.push("SIGNATURES");
  for (const [k, label] of [["inspector", "Inspector"], ["tenant", "Tenant"], ["landlord", "Landlord"]]) {
    lines.push(`  ${label}: ${sig[k]?.name ? `/s/ ${sig[k].name} — ${formatDate(sig[k].signedOn)}` : "not signed"}`);
  }
  return lines.join("\n");
}

const inspectionsConfig = {
  key: "inspection",
  singular: "Inspection",
  plural: "Inspections",
  title: "Inspections",
  description:
    "Document unit condition at move-in, move-out, and routine visits — room by room on a condition scale, with photos and signatures — and compare move-out against move-in.",
  icon: ClipboardCheck,
  titleField: "name",
  searchFields: ["name", "unit", "inspector", "tenantName"],
  data: inspectionsData,
  rowsLoader: tenantJoinedLoader(inspectionsData),

  statusMap: INSPECTION_STATUS_MAP,
  statusFilterOptions: filterOptions(INSPECTION_STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "move_in", label: "Move-in", filter: (r) => inspectionKindOf(r) === "move_in", createDefaults: { kind: "move_in" } },
    { value: "move_out", label: "Move-out", filter: isMoveOut, createDefaults: { kind: "move_out" } },
    { value: "routine", label: "Routine & annual", filter: (r) => ["routine", "annual", "drive_by"].includes(inspectionKindOf(r)), createDefaults: { kind: "routine" } },
  ],

  columns: [
    {
      key: "name",
      header: "Inspection",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.unit, r.tenantName].filter(Boolean).join(" · ") || "No unit linked"}
          </span>
        </div>
      ),
    },
    {
      key: "kind",
      header: "Type",
      render: (r) => (inspectionKindOf(r) ? <Badge variant={isMoveOut(r) ? "warning" : "info"}>{inspectionKindLabel(r)}</Badge> : "—"),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={INSPECTION_STATUS_MAP} />,
    },
    {
      key: "progress",
      header: "Rated",
      className: "text-sm tabular-nums text-muted-foreground",
      render: (r) => {
        const s = inspectionStats(r);
        return s.items ? `${s.rated}/${s.items}` : "—";
      },
    },
    {
      key: "inspectionDate",
      header: "Date",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => formatDate(r.inspectionDate),
    },
  ],

  stats: (rows) => {
    const complete = rows.filter((r) => r.status === "Complete").length;
    const upcoming = rows.filter((r) => r.status === "Scheduled" && withinDays(r.inspectionDate, 14)).length;
    const damaged = rows.filter((r) => inspectionStats(r).counts.damaged > 0).length;
    return [
      { label: "Inspections", value: String(rows.length), footer: `${complete} complete` },
      { label: "Scheduled", value: String(rows.filter((r) => r.status === "Scheduled").length), footer: `${upcoming} in the next 14 days` },
      { label: "In progress", value: String(rows.filter((r) => r.status === "In progress").length), footer: "Underway" },
      { label: "With damage", value: String(damaged), footer: "At least one damaged item" },
    ];
  },

  createDraft: { name: "", kind: "", leaseId: "", unitId: "", inspectionDate: "" },
  createFields: [
    { key: "name", label: "Inspection label", type: "text", placeholder: "e.g. Maple Court · 4B — Move-in" },
    { key: "kind", label: "Type", type: "select", options: INSPECTION_TYPE_OPTIONS, placeholder: "Matches the current tab" },
    { key: "leaseId", label: "Lease", type: "select", optionsFrom: "leases", placeholder: "Optional — fills unit and tenant" },
    { key: "unitId", label: "Unit", type: "select", optionsFrom: "units", placeholder: "Select a unit…", emptyLabel: "No units yet — add them in Units" },
    { key: "inspectionDate", label: "Inspection date", type: "date" },
  ],
  loadCreateOptions: async () => {
    const [units, leases] = await Promise.all([unitOptions(), leaseOptions()]);
    return { units, leases };
  },
  newRow: (draft) => ({
    name: draft.name.trim(),
    ...(draft.kind ? { kind: draft.kind } : {}),
    leaseId: draft.leaseId || "",
    leaseName: draft.leaseName || "",
    tenantId: draft.tenantId || "",
    tenantName: draft.tenantName || "",
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    propertyId: draft.propertyId || "",
    inspectionDate: draft.inspectionDate || null,
    status: "Scheduled",
  }),

  headerMeta: (r) =>
    [inspectionKindLabel(r) !== "—" ? inspectionKindLabel(r) : null, r.unit, r.inspectionDate ? formatDate(r.inspectionDate) : null].filter(Boolean).join(" · "),

  actions: [
    {
      key: "start",
      label: "Start inspection",
      icon: Play,
      showIf: (r) => r.status === "Scheduled",
      run: async (ctx) => {
        if (await ctx.commit({ status: "In progress" })) {
          ctx.navigate("rooms");
          toast.success("Inspection started.");
        }
      },
    },
    {
      key: "complete",
      label: "Mark complete",
      icon: CheckCircle2,
      showIf: (r) => r.status !== "Complete",
      run: async (ctx) => {
        const s = inspectionStats(ctx.item);
        if (s.items && s.rated < s.items) toast.warning(`${s.items - s.rated} items aren't rated yet.`);
        if (await ctx.commit({ status: "Complete" })) {
          ctx.log("Completed the inspection");
          toast.success("Inspection complete.");
        }
      },
    },
    {
      key: "fail",
      label: "Mark failed",
      icon: XCircle,
      showIf: (r) => r.status !== "Failed" && ["routine", "annual", "drive_by"].includes(inspectionKindOf(r)),
      danger: true,
      run: async (ctx) => {
        if (await ctx.commit({ status: "Failed" })) toast.success("Marked failed — log the follow-up in Notes.");
      },
    },
    {
      key: "report",
      label: "Save report to Documents",
      icon: Wand2,
      separatorBefore: true,
      run: async (ctx) => {
        const doc = await storeTextDocument({
          ownerType: "inspection",
          ownerId: ctx.item.id,
          kind: "inspection_report",
          name: `${ctx.item.name || "Inspection"} — report`,
          text: reportText(ctx.item),
        });
        if (!doc) {
          toast.error("Couldn't save the report.");
          return;
        }
        ctx.log("Saved the inspection report");
        toast.success("Report saved to Documents.");
        ctx.navigate("documents");
      },
    },
  ],

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Ratings, signatures, and links at a glance." },
        { key: "details", label: "Links", icon: Link2, desc: "Type, date, inspector, and the linked lease, unit, move, deposit, and turn." },
      ],
    },
    {
      group: "Report",
      items: [
        { key: "rooms", label: "Rooms & Items", icon: DoorClosed, desc: "Rate each item New → Damaged, with notes and photos." },
        { key: "compare", label: "Move-in Comparison", icon: GitCompare, desc: "What changed since move-in — push damage to the deposit.", showIf: isMoveOut },
        { key: "notes", label: "Summary Notes", icon: StickyNote, desc: "Overall condition notes." },
        { key: "signoff", label: "Signatures", icon: PenLine, desc: "Typed-name signatures with date." },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Saved reports and attachments." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Every change and action on this inspection." },
      ],
    },
  ],
  sections: {
    overview: InspectionOverviewSection,
    details: makeMetaAwareFieldsSection([
      { key: "kind", label: "Type", type: "select", options: INSPECTION_TYPE_OPTIONS },
      { key: "status", label: "Status", type: "select", options: filterOptions(INSPECTION_STATUS_MAP).slice(1) },
      { key: "inspectionDate", label: "Inspection date", type: "date" },
      { key: "inspector", label: "Inspector", type: "text" },
      { key: "leaseId", label: "Lease", type: "relation", load: leaseOptions, displayKey: "leaseName", full: true },
      { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
      { key: "tenantId", label: "Tenant", type: "relation", load: tenantOptions, displayKey: "tenantName" },
      { key: "moveId", label: "Move", type: "relation", load: moveOptions },
      { key: "depositId", label: "Security deposit", type: "relation", load: depositOptions, meta: true },
      { key: "turnId", label: "Unit turn", type: "relation", load: turnOptions, meta: true },
      { key: "tenantPresent", label: "Tenant present", type: "switch", meta: true },
      { key: "weather", label: "Conditions / weather", type: "text", meta: true },
    ]),
    rooms: InspectionRoomsSection,
    compare: makeGatedSection({
      when: isMoveOut,
      section: InspectionComparisonSection,
      icon: GitCompare,
      title: "Comparison applies to move-out inspections",
      description: "Set the type to Move-out in Links to compare against the move-in report.",
    }),
    notes: makeNotesSection({ field: "conditionNotes", placeholder: "Overall condition notes…" }),
    signoff: InspectionSignaturesSection,
    documents: DocumentsSection,
    activity: ActivitySection,
  },
};

export function InspectionsScreen() {
  return <EntityListScreen config={inspectionsConfig} />;
}

export default InspectionsScreen;
