"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Link2,
  ListChecks,
  KeyRound,
  Gauge,
  ClipboardCheck,
  Calculator,
  FileText,
  Clock,
  ArrowLeftRight,
  MapPin,
  Play,
  CheckCircle2,
  Ban,
  Loader2,
  Plus,
} from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { ListLoading, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { ActivitySection, DocumentsSection } from "@/components/internal/screens/entity/shared_sections";
import { makeRecordItemsSection } from "@/components/internal/screens/entity/sections/child_records";
import { movesData } from "@/lib/supabase/moves";
import { inspectionsLayer } from "@/lib/supabase/inspections";
import { securityDepositsLayer } from "@/lib/supabase/security_deposits";
import { leasesLayer } from "@/lib/supabase/leases";
import { updateUnit } from "@/lib/supabase/units";
import { updateTenant } from "@/lib/supabase/tenants";
import { leaseOptions, tenantOptions, unitOptions } from "@/lib/supabase/options";
import { DEFAULT_MOVE_IN_CHECKLIST, DEFAULT_MOVE_OUT_CHECKLIST, leasePolicies, todayISO, addDays } from "@/lib/leasing/workflows";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { makeGatedSection } from "./sections/gated";
import { Checklist, Linked } from "./sections/lease_lifecycle";
import { tenantJoinedLoader } from "./joins";
import { titleCase } from "@/lib/utils";
import {
  DEPOSIT_STATUS_MAP,
  INSPECTION_STATUS_MAP,
  MOVE_STATUS_MAP,
  MOVE_KIND_OPTIONS,
  REFUND_METHOD_OPTIONS,
  filterOptions,
  currency,
  formatDate,
  inspectionKindLabel,
  metaList,
  toOptions,
  withinDays,
} from "./shared";

// Move-ins & Move-outs — one entity screen over `property.moves`; `kind` ("in" /
// "out") picks the view and which workflow tabs apply. A move links its lease,
// tenant, unit, inspection, and deposit; completing it updates the lease and unit.

const isOut = (r) => r?.kind === "out";
const kindLabel = (r) => (isOut(r) ? "Move-out" : "Move-in");

async function inspectionOptions() {
  const rows = (await inspectionsLayer.list()) ?? [];
  return rows.map((i) => ({ value: i.id, label: [i.name, inspectionKindLabel(i), formatDate(i.inspectionDate)].filter(Boolean).join(" · "), patch: {} }));
}

async function depositOptions() {
  const rows = (await securityDepositsLayer.list()) ?? [];
  return rows.map((d) => ({ value: d.id, label: `${d.name || "Deposit"} · ${currency(d.amount)}`, patch: {} }));
}

const LINK_FIELDS = [
  { key: "kind", label: "Type", type: "select", options: MOVE_KIND_OPTIONS },
  { key: "moveDate", label: "Move date", type: "date" },
  { key: "status", label: "Status", type: "select", options: filterOptions(MOVE_STATUS_MAP).slice(1) },
  { key: "timeWindow", label: "Time window", type: "text", meta: true, placeholder: "e.g. 9am – 12pm" },
  { key: "leaseId", label: "Lease", type: "relation", load: leaseOptions, displayKey: "leaseName", full: true },
  { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
  { key: "tenantId", label: "Tenant", type: "relation", load: tenantOptions, displayKey: "tenantName" },
  { key: "inspectionId", label: "Inspection", type: "relation", load: inspectionOptions },
  { key: "depositId", label: "Security deposit", type: "relation", load: depositOptions },
  { key: "assignedTo", label: "Assigned to", type: "text", meta: true },
  { key: "elevatorReserved", label: "Elevator / dock reserved", type: "switch", meta: true },
];

// Linked inspection for this move, with a shortcut to create it.
function MoveInspectionSection({ item, onCommit }) {
  const [inspection, setInspection] = useState(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (item.inspectionId ? inspectionsLayer.get(item.inspectionId) : Promise.resolve(null)).then((r) => alive && setInspection(r));
    return () => {
      alive = false;
    };
  }, [item.inspectionId]);

  const create = async () => {
    setBusy(true);
    const row = await inspectionsLayer.create({
      id: crypto.randomUUID(),
      name: `${kindLabel(item)} inspection — ${item.unit || item.name}`,
      kind: isOut(item) ? "move_out" : "move_in",
      inspectionDate: item.moveDate || todayISO(),
      status: "Scheduled",
      moveId: item.id,
      leaseId: item.leaseId || "",
      leaseName: item.leaseName || "",
      unitId: item.unitId || "",
      unit: item.unit || "",
      tenantId: item.tenantId || "",
      tenantName: item.tenantName || "",
      propertyId: item.propertyId || "",
    });
    setBusy(false);
    if (!row) {
      toast.error("Couldn't create the inspection.");
      return;
    }
    await onCommit({ inspectionId: row.id });
    setInspection(row);
    toast.success("Inspection created and linked.");
  };

  if (inspection === undefined) return <ListLoading label="Loading inspection" className="py-10" />;
  return (
    <SectionCard
      title="Inspection"
      action={
        inspection ? null : (
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={create}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create {titleCase(kindLabel(item))} Inspection
          </Button>
        )
      }
      bodyPadding={!inspection}
    >
      {inspection ? (
        <Linked
          rows={[inspection]}
          tab="Inspections"
          columns={[
            { key: "name", header: "Inspection", render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
            { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={INSPECTION_STATUS_MAP} /> },
            { key: "date", header: "Date", align: "right", className: "text-right text-sm text-muted-foreground", render: (r) => formatDate(r.inspectionDate) },
          ]}
        />
      ) : (
        <p className="text-sm text-text-secondary">No inspection linked yet. Link one in Links, or create it here.</p>
      )}
    </SectionCard>
  );
}

// Deposit linked to a move-out, with its return deadline.
function ReconciliationSection({ item, onPatch, onCommit, onCommitMeta }) {
  const [deposit, setDeposit] = useState(undefined);
  useEffect(() => {
    let alive = true;
    (item.depositId ? securityDepositsLayer.get(item.depositId) : Promise.resolve(null)).then((r) => alive && setDeposit(r));
    return () => {
      alive = false;
    };
  }, [item.depositId]);

  return (
    <div className="space-y-6">
      {deposit === undefined ? (
        <ListLoading label="Loading deposit" className="py-10" />
      ) : deposit ? (
        <Linked
          rows={[deposit]}
          tab="Security Deposits"
          columns={[
            { key: "name", header: "Deposit", render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
            { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={DEPOSIT_STATUS_MAP} /> },
            { key: "due", header: "Return by", className: "text-sm text-muted-foreground", render: (r) => formatDate(r.returnDue) },
            { key: "amount", header: "Amount", align: "right", className: "text-right tabular-nums", render: (r) => currency(r.amount) },
          ]}
        />
      ) : (
        <SectionCard>
          <p className="text-sm text-text-secondary">No deposit linked — pick one in Links. Deductions and the refund are itemized on the deposit.</p>
        </SectionCard>
      )}
      <SectionCard title="Forwarding & refund">
        <FieldsForm
          item={item}
          fields={[
            { key: "forwardingAddress", label: "Forwarding address", type: "textarea", meta: true },
            { key: "forwardingEmail", label: "Forwarding email", type: "email", meta: true },
            { key: "forwardingPhone", label: "Forwarding phone", type: "phone", meta: true },
            { key: "refundMethod", label: "Refund by", type: "select", meta: true, options: REFUND_METHOD_OPTIONS },
          ]}
          onPatch={onPatch}
          onCommit={onCommit}
          onCommitMeta={onCommitMeta}
        />
      </SectionCard>
    </div>
  );
}

function MoveChecklistSection({ item, onCommitMeta }) {
  return (
    <Checklist
      item={item}
      field="checklist"
      defaults={isOut(item) ? DEFAULT_MOVE_OUT_CHECKLIST : DEFAULT_MOVE_IN_CHECKLIST}
      onCommitMeta={onCommitMeta}
    />
  );
}

const UTILITY_FIELDS = [
  { key: "electricStatus", label: "Electric", type: "select", meta: true, options: toOptions(["Transferred", "Pending", "Landlord account", "N/A"]) },
  { key: "electricReading", label: "Electric meter reading", type: "number", meta: true },
  { key: "gasStatus", label: "Gas", type: "select", meta: true, options: toOptions(["Transferred", "Pending", "Landlord account", "N/A"]) },
  { key: "gasReading", label: "Gas meter reading", type: "number", meta: true },
  { key: "waterStatus", label: "Water", type: "select", meta: true, options: toOptions(["Transferred", "Pending", "Landlord account", "N/A"]) },
  { key: "waterReading", label: "Water meter reading", type: "number", meta: true },
  { key: "internetStatus", label: "Internet", type: "select", meta: true, options: toOptions(["Transferred", "Pending", "Landlord account", "N/A"]) },
  { key: "readingsTakenOn", label: "Readings taken on", type: "date", meta: true },
];

const KEY_FIELDS = [
  { key: "name", label: "Key / device", type: "text", required: true, placeholder: "e.g. Front door key" },
  { key: "amount", label: "Quantity", type: "number", min: 0 },
  { key: "status", label: "Status", type: "select", options: toOptions(["Handed over", "Returned", "Missing"]) },
  { key: "tag", label: "Key tag / serial", type: "text" },
];

const movesConfig = {
  key: "move",
  singular: "Move",
  plural: "Moves",
  title: "Move-ins & Move-outs",
  description:
    "Every move across your portfolio — schedule move-ins and move-outs, run the checklist, hand over keys, link the inspection and deposit, and close it out.",
  icon: ArrowLeftRight,
  titleField: "name",
  searchFields: ["name", "unit", "tenantName", "leaseName"],
  data: movesData,
  rowsLoader: tenantJoinedLoader(movesData),

  statusMap: MOVE_STATUS_MAP,
  statusFilterOptions: filterOptions(MOVE_STATUS_MAP),

  views: [
    { value: "in", label: "Move-ins", filter: (r) => !isOut(r), createDefaults: { kind: "in" } },
    { value: "out", label: "Move-outs", filter: isOut, createDefaults: { kind: "out" } },
    { value: "all", label: "All", filter: () => true },
  ],

  columns: [
    {
      key: "name",
      header: "Move",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.tenantName, r.unit].filter(Boolean).join(" · ") || "No unit linked"}
          </span>
        </div>
      ),
    },
    {
      key: "kind",
      header: "Type",
      render: (r) => <Badge variant="neutral">{kindLabel(r)}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={MOVE_STATUS_MAP} />,
    },
    {
      key: "checklist",
      header: "Checklist",
      className: "text-sm text-muted-foreground tabular-nums",
      render: (r) => {
        const list = metaList(r, "checklist");
        return list.length ? `${list.filter((x) => x.done).length}/${list.length}` : "—";
      },
    },
    {
      key: "moveDate",
      header: "Date",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => formatDate(r.moveDate),
    },
  ],

  stats: (rows) => {
    const pending = rows.filter((r) => r.status !== "Complete" && r.status !== "Cancelled");
    const ins = pending.filter((r) => !isOut(r)).length;
    const outs = pending.filter(isOut).length;
    const soon = pending.filter((r) => withinDays(r.moveDate, 30)).length;
    return [
      { label: "Upcoming move-ins", value: String(ins), footer: "Not yet complete" },
      { label: "Upcoming move-outs", value: String(outs), footer: "Not yet complete" },
      { label: "Next 30 days", value: String(soon), footer: "Scheduled soon" },
      {
        label: "In progress",
        value: String(rows.filter((r) => r.status === "In progress").length),
        footer: `${rows.filter((r) => r.status === "Complete").length} complete`,
      },
    ];
  },

  createDraft: { name: "", kind: "", leaseId: "", moveDate: "" },
  createFields: [
    { key: "name", label: "Label", type: "text", placeholder: "e.g. Maple Court · 4B — Jordan Blake" },
    { key: "kind", label: "Type", type: "select", options: MOVE_KIND_OPTIONS, placeholder: "Matches the current tab" },
    {
      key: "leaseId",
      label: "Lease",
      type: "select",
      optionsFrom: "leases",
      placeholder: "Select a lease…",
      emptyLabel: "No leases yet — add them in Leases",
    },
    { key: "moveDate", label: "Move date", type: "date" },
  ],
  loadCreateOptions: async () => ({ leases: await leaseOptions() }),
  // `kind` only when chosen, so the active view's createDefaults apply otherwise.
  newRow: (draft) => ({
    name: draft.name.trim(),
    ...(draft.kind ? { kind: draft.kind } : {}),
    leaseId: draft.leaseId || "",
    leaseName: draft.leaseName || "",
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    tenantId: draft.tenantId || "",
    tenantName: draft.tenantName || "",
    moveDate: draft.moveDate || null,
    status: "Scheduled",
  }),

  headerMeta: (r) => [kindLabel(r), r.tenantName, r.unit, formatDate(r.moveDate)].filter(Boolean).join(" · "),

  actions: [
    {
      key: "start",
      label: "Start move",
      icon: Play,
      showIf: (r) => r.status === "Scheduled",
      run: async (ctx) => {
        if (await ctx.commit({ status: "In progress" })) {
          ctx.log("Started the move");
          toast.success("Move started.");
        }
      },
    },
    {
      key: "complete",
      label: "Complete move",
      icon: CheckCircle2,
      showIf: (r) => r.status !== "Complete" && r.status !== "Cancelled",
      wizard: {
        title: "Complete move",
        description: "Closes the move and updates the lease and unit.",
        finishLabel: "Complete",
        logSummary: "Completed the move",
        initial: (r) => ({
          completedOn: r.moveDate || todayISO(),
          updateLease: Boolean(r.leaseId),
          updateUnit: Boolean(r.unitId),
          markDeposit: isOut(r) && Boolean(r.depositId),
          isOut: isOut(r),
        }),
        steps: [
          {
            key: "done",
            title: "Complete",
            fields: [
              { key: "completedOn", label: "Completed on", type: "date", required: true },
              { key: "updateLease", label: "Update the lease (move-in date / ended)", type: "switch" },
              { key: "updateUnit", label: "Update the unit status", type: "switch" },
              { key: "unitStatus", label: "Unit status after move-out", type: "select", options: toOptions(["Make-ready", "Vacant"]), showIf: (v) => v.isOut && v.updateUnit },
              { key: "markDeposit", label: "Start the deposit return clock", type: "switch", showIf: (v) => v.isOut },
            ],
          },
        ],
        finish: async (v, ctx) => {
          const m = ctx.item;
          const ok = await ctx.commit({ status: "Complete", moveDate: v.completedOn });
          if (!ok) return false;
          await ctx.commitMeta({ completedOn: v.completedOn });
          const tasks = [];
          if (v.updateLease && m.leaseId) {
            tasks.push(
              isOut(m)
                ? leasesLayer.update(m.leaseId, { status: "Ended", moveOutDate: v.completedOn })
                : leasesLayer.update(m.leaseId, { moveInDate: v.completedOn }),
            );
            if (isOut(m) && m.tenantId) tasks.push(updateTenant(m.tenantId, { status: "Past" }));
          }
          if (v.updateUnit && m.unitId) {
            tasks.push(
              updateUnit(
                m.unitId,
                isOut(m)
                  ? { status: v.unitStatus || "Make-ready", tenantId: "", occupantName: "" }
                  : { status: "Occupied", tenantId: m.tenantId || "", occupantName: m.tenantName || "" },
              ),
            );
          }
          if (v.markDeposit && m.depositId) {
            const lease = m.leaseId ? await leasesLayer.get(m.leaseId) : null;
            const days = Number((await leasePolicies(lease || {})).depositReturnDays) || 30;
            tasks.push(
              securityDepositsLayer.update(m.depositId, {
                moveOutDate: v.completedOn,
                returnDue: addDays(v.completedOn, days),
                status: "Awaiting disposition",
              }),
            );
          }
          const results = await Promise.all(tasks);
          if (results.some((r) => !r)) toast.warning("Move completed, but some linked records didn't update.");
          else toast.success("Move completed.");
          ctx.reload();
          return true;
        },
      },
    },
    {
      key: "cancel",
      label: "Cancel move",
      icon: Ban,
      danger: true,
      separatorBefore: true,
      showIf: (r) => r.status !== "Complete" && r.status !== "Cancelled",
      run: async (ctx) => {
        if (await ctx.commit({ status: "Cancelled" })) {
          ctx.log("Cancelled the move");
          toast.success("Move cancelled.");
        }
      },
    },
  ],

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this move." },
        { key: "details", label: "Links", icon: Link2, desc: "Type, date, and the linked lease, unit, tenant, inspection, and deposit." },
      ],
    },
    {
      group: "Workflow",
      items: [
        { key: "checklist", label: "Checklist", icon: ListChecks, desc: "Tasks to complete for this move." },
        { key: "inspection", label: "Inspection", icon: ClipboardCheck, desc: "The linked walkthrough." },
        { key: "keys", label: "Keys & Access", icon: KeyRound, desc: "Keys and devices handed over or returned." },
        { key: "utilities", label: "Utilities & Meters", icon: Gauge, desc: "Utility transfers and meter readings." },
      ],
    },
    {
      group: "Move-out",
      items: [
        { key: "reconciliation", label: "Deposit & Forwarding", icon: Calculator, desc: "The deposit and where to send the refund.", showIf: isOut },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Signed forms, photos, and notices." },
        { key: "notes", label: "Notes", icon: MapPin, desc: "Access instructions and notes." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Every change and action on this move." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "kind", label: "Type", format: (_v, r) => kindLabel(r) },
        { key: "status", label: "Status" },
        { key: "unit", label: "Unit" },
        { key: "tenantName", label: "Tenant" },
        { key: "leaseName", label: "Lease" },
        { key: "moveDate", label: "Move date", format: (v) => formatDate(v) },
        {
          key: "checklistProgress",
          label: "Checklist",
          format: (_v, r) => {
            const list = metaList(r, "checklist");
            return list.length ? `${list.filter((x) => x.done).length}/${list.length} done` : "—";
          },
        },
        { key: "completedOn", label: "Completed on", meta: true, format: (v) => formatDate(v) },
      ],
    }),
    details: makeFieldsSection(LINK_FIELDS),
    checklist: MoveChecklistSection,
    inspection: MoveInspectionSection,
    keys: makeRecordItemsSection({
      kind: "key",
      fields: KEY_FIELDS,
      singular: "Key",
      icon: KeyRound,
      defaults: (m) => ({ amount: 1, status: isOut(m) ? "Returned" : "Handed over" }),
      summary: (k) => ({
        title: k.name,
        meta: [k.metadata?.tag, Number(k.amount) ? `Qty ${Number(k.amount)}` : null].filter(Boolean).join(" · "),
        badge: k.status,
        badgeVariant: k.status === "Missing" ? "danger" : k.status === "Returned" ? "success" : "info",
      }),
    }),
    utilities: makeFieldsSection(UTILITY_FIELDS),
    reconciliation: makeGatedSection({
      when: isOut,
      section: ReconciliationSection,
      icon: Calculator,
      title: "Reconciliation applies to move-outs",
      description: "This record is a move-in — the deposit is reconciled when the tenant moves out.",
    }),
    documents: DocumentsSection,
    notes: makeNotesSection({ field: "activityNotes", placeholder: "Access instructions, parking for the truck, notes…" }),
    activity: ActivitySection,
  },
};

export function MovesScreen() {
  return <EntityListScreen config={movesConfig} />;
}

export default MovesScreen;
