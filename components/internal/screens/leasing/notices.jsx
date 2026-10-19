"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  SlidersHorizontal,
  FileText,
  Truck,
  Clock,
  Gavel,
  Send,
  CheckCircle2,
  AlertOctagon,
  Archive,
  Loader2,
  Wand2,
  FolderOpen,
} from "lucide-react";

import { Button } from "@geiger/ui/button";
import { SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { ActivitySection, DocumentsSection } from "@/components/internal/screens/entity/shared_sections";
import { noticesData } from "@/lib/supabase/notices";
import { leasesLayer } from "@/lib/supabase/leases";
import { listTenants } from "@/lib/supabase/tenants";
import { unitOptions } from "@/lib/supabase/options";
import { draftNoticeText, storeTextDocument, todayISO } from "@/lib/leasing/workflows";
import {
  makeFieldsSection,
  makeMetaListSection,
} from "@/components/internal/screens/entity/sections/factories";
import { makeMetaAwareFieldsSection } from "./sections/gated";
import {
  NOTICE_STATUS_MAP,
  NOTICE_TYPE_OPTIONS,
  NOTICE_DIRECTION_OPTIONS,
  DELIVERY_METHOD_OPTIONS,
  filterOptions,
  currency,
  formatDate,
  daysUntil,
  isNoticeOverdue,
  shiftDate,
} from "./shared";

// Notices & Violations — an entity screen over `property.notices`: notices served
// to (or received from) tenants, linked to their lease, with templated wording,
// service details, cure dates, and escalation into an eviction on the lease.

const isOpen = (r) => r.status !== "Cured" && r.status !== "Closed";

// Tenant options that also carry the tenant's unit onto the notice.
async function noticeTenantOptions() {
  const rows = (await listTenants()) ?? [];
  return rows.map((t) => ({
    value: t.id,
    label: t.unit ? `${t.name} · ${t.unit}` : t.name || "Tenant",
    patch: { tenantName: t.name || "", unitId: t.unitId || "", unit: t.unit || "" },
  }));
}

// Lease options carrying tenant, unit, and property onto the notice.
async function noticeLeaseOptions() {
  const rows = (await leasesLayer.list()) ?? [];
  return rows.map((l) => ({
    value: l.id,
    label: [l.name || "Lease", l.tenantName].filter(Boolean).join(" · "),
    patch: { tenantId: l.tenantId || "", tenantName: l.tenantName || "", unitId: l.unitId || "", unit: l.unit || "", propertyId: l.propertyId || "" },
  }));
}

const TEXT_FIELDS = [{ key: "noticeText", label: "Notice text", type: "textarea", meta: true, rows: 18 }];

// Notice wording with a starter template per type, merged against the lease.
function NoticeTextSection({ item, onPatch, onCommit, onCommitMeta }) {
  const [busy, setBusy] = useState("");
  const fill = async () => {
    setBusy("fill");
    const lease = item.leaseId ? await leasesLayer.get(item.leaseId) : null;
    const text = await draftNoticeText(lease, { ...item, reason: item.metadata?.reason, amountDue: item.metadata?.amountDue });
    setBusy("");
    if (await onCommitMeta({ noticeText: text })) toast.success("Filled from the template.");
  };
  const save = async () => {
    setBusy("save");
    const doc = await storeTextDocument({
      ownerType: "notice",
      ownerId: item.id,
      kind: "notice",
      name: item.name || "Notice",
      text: item.metadata?.noticeText || "",
    });
    setBusy("");
    if (doc) toast.success("Saved to Documents.");
    else toast.error("Couldn't save the notice document.");
  };
  return (
    <SectionCard
      title="Wording"
      description="Starter templates fill in the lease, tenant, unit, and notice details — edit before serving."
      action={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="border-border bg-surface-card" disabled={Boolean(busy)} onClick={fill}>
            {busy === "fill" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Fill from {item.noticeType || "Type"} Template
          </Button>
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={Boolean(busy) || !item.metadata?.noticeText} onClick={save}>
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />} Save as Document
          </Button>
        </div>
      }
    >
      <FieldsForm item={item} fields={TEXT_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
    </SectionCard>
  );
}

const noticesConfig = {
  key: "notice",
  singular: "Notice",
  plural: "Notices",
  title: "Notices & Violations",
  description:
    "Notices served to tenants — late rent, pay-or-quit, violations, entry, non-renewal, rent increases — and notices to vacate received, with delivery and cure dates.",
  icon: Gavel,
  titleField: "name",
  searchFields: ["name", "tenantName", "unit", "noticeType"],
  data: noticesData,

  statusMap: NOTICE_STATUS_MAP,
  statusFilterOptions: filterOptions(NOTICE_STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "open", label: "Open", filter: isOpen },
    { value: "overdue", label: "Overdue", filter: isNoticeOverdue },
    { value: "violations", label: "Violations", filter: (r) => ["Lease violation", "Cure or quit"].includes(r.noticeType) },
    { value: "incoming", label: "Received", filter: (r) => r.metadata?.direction === "incoming" },
    { value: "closed", label: "Resolved", filter: (r) => !isOpen(r) },
  ],

  columns: [
    {
      key: "name",
      header: "Notice",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.noticeType || "Type not set", r.metadata?.direction === "incoming" ? "Received" : null].filter(Boolean).join(" · ")}
          </span>
        </div>
      ),
    },
    {
      key: "tenantName",
      header: "Tenant · Unit",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-foreground">{r.tenantName || "—"}</span>
          <span className="text-xs text-text-secondary">{r.unit || "No unit"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={NOTICE_STATUS_MAP} />,
    },
    {
      key: "servedDate",
      header: "Served",
      className: "text-sm text-muted-foreground",
      render: (r) => (r.servedDate ? formatDate(r.servedDate) : "—"),
    },
    {
      key: "cureBy",
      header: "Cure by",
      align: "right",
      className: "text-right text-sm",
      render: (r) => {
        if (!r.cureBy) return <span className="text-muted-foreground">—</span>;
        const overdue = isNoticeOverdue(r);
        const d = daysUntil(r.cureBy);
        return (
          <span className={overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"}>
            {formatDate(r.cureBy)}
            {overdue ? ` · ${-d}d overdue` : ""}
          </span>
        );
      },
    },
  ],

  stats: (rows) => {
    const open = rows.filter(isOpen).length;
    const overdue = rows.filter(isNoticeOverdue).length;
    const thisMonth = new Date().toISOString().slice(0, 7);
    const served = rows.filter((r) => String(r.servedDate || "").startsWith(thisMonth)).length;
    const cured = rows.filter((r) => r.status === "Cured").length;
    const decided = rows.filter((r) => r.status === "Cured" || r.status === "Escalated").length;
    return [
      { label: "Open notices", value: String(open), footer: `${rows.length} total` },
      { label: "Overdue", value: String(overdue), footer: "Cure date passed" },
      { label: "Served this month", value: String(served), footer: "By served date" },
      {
        label: "Cure rate",
        value: `${decided ? Math.round((cured / decided) * 100) : 0}%`,
        footer: `${cured} cured`,
      },
    ];
  },

  createDraft: { name: "", noticeType: "", leaseId: "" },
  createFields: [
    { key: "name", label: "Notice title", type: "text", placeholder: "e.g. 3-day notice to pay — 4B" },
    { key: "noticeType", label: "Type", type: "select", options: NOTICE_TYPE_OPTIONS, placeholder: "Select a type…" },
    {
      key: "leaseId",
      label: "Lease",
      type: "select",
      optionsFrom: "leases",
      placeholder: "Select a lease…",
      emptyLabel: "No leases yet — add them in Leases",
    },
  ],
  loadCreateOptions: async () => ({ leases: await noticeLeaseOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    noticeType: draft.noticeType || "Other",
    leaseId: draft.leaseId || "",
    tenantId: draft.tenantId || "",
    tenantName: draft.tenantName || "",
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    propertyId: draft.propertyId || "",
    status: "Draft",
  }),

  headerMeta: (r) =>
    [r.noticeType, r.tenantName, r.unit, r.cureBy ? `Cure by ${formatDate(r.cureBy)}` : null]
      .filter(Boolean)
      .join(" · "),

  actions: [
    {
      key: "serve",
      label: "Mark served",
      icon: Send,
      showIf: (r) => r.status === "Draft",
      wizard: {
        title: "Mark served",
        finishLabel: "Mark Served",
        logSummary: "Served the notice",
        initial: (r) => ({ servedDate: todayISO(), deliveryMethod: r.deliveryMethod || "Posted", cureBy: r.cureBy || shiftDate(todayISO(), { days: 3 }) }),
        steps: [
          {
            key: "service",
            title: "Service",
            fields: [
              { key: "servedDate", label: "Served on", type: "date", required: true },
              { key: "deliveryMethod", label: "Delivery", type: "select", options: DELIVERY_METHOD_OPTIONS, required: true },
              { key: "cureBy", label: "Cure by", type: "date" },
              { key: "servedBy", label: "Served by", type: "text" },
            ],
          },
        ],
        finish: async (v, ctx) => {
          const ok = await ctx.commit({ status: "Served", servedDate: v.servedDate, deliveryMethod: v.deliveryMethod, cureBy: v.cureBy || "" });
          if (!ok) return false;
          const log = Array.isArray(ctx.item.metadata?.serviceLog) ? ctx.item.metadata.serviceLog : [];
          await ctx.commitMeta({ serviceLog: [...log, { id: crypto.randomUUID(), label: `${v.deliveryMethod}${v.servedBy ? ` by ${v.servedBy}` : ""}`, date: formatDate(v.servedDate) }] });
          toast.success("Notice served.");
          return true;
        },
      },
    },
    {
      key: "cure",
      label: "Mark cured",
      icon: CheckCircle2,
      showIf: (r) => r.status === "Served" || r.status === "Escalated",
      run: async (ctx) => {
        if (await ctx.commit({ status: "Cured" })) {
          await ctx.commitMeta({ curedOn: todayISO() });
          ctx.log("Marked the notice cured");
          toast.success("Notice cured.");
        }
      },
    },
    {
      key: "escalate",
      label: "Escalate to eviction",
      icon: AlertOctagon,
      danger: true,
      showIf: (r) => r.status === "Served" && Boolean(r.leaseId),
      wizard: {
        title: "Escalate to eviction",
        description: "Marks this notice escalated and starts an eviction on the linked lease.",
        finishLabel: "Escalate",
        logSummary: "Escalated the notice",
        initial: (r) => ({ reason: r.noticeType === "Pay or quit" || r.noticeType === "Late rent" ? "Nonpayment of rent" : "Lease violation" }),
        steps: [{ key: "x", title: "Confirm", fields: [{ key: "reason", label: "Eviction reason", type: "text", required: true }, { key: "amountOwed", label: "Amount owed", type: "currency" }] }],
        finish: async (v, ctx) => {
          const ok = await ctx.commit({ status: "Escalated" });
          if (!ok) return false;
          const lease = await leasesLayer.get(ctx.item.leaseId);
          if (lease && !lease.metadata?.evictionActive) {
            await leasesLayer.update(lease.id, { status: "Eviction" });
            await leasesLayer.mergeMeta(lease.id, {
              evictionActive: true,
              evictionStage: "Cure period",
              evictionReason: v.reason,
              evictionAmountOwed: Number(v.amountOwed) || 0,
              evictionStartedOn: todayISO(),
              evictionPriorStatus: lease.status,
            });
          }
          toast.success("Escalated — the lease is flagged for eviction.");
          return true;
        },
      },
    },
    {
      key: "close",
      label: "Close notice",
      icon: Archive,
      separatorBefore: true,
      showIf: isOpen,
      run: async (ctx) => {
        if (await ctx.commit({ status: "Closed" })) toast.success("Notice closed.");
      },
    },
  ],

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this notice." },
      ],
    },
    {
      group: "Notice",
      items: [
        { key: "details", label: "Details", icon: SlidersHorizontal, desc: "Type, lease, tenant, unit, and dates." },
        { key: "text", label: "Notice text", icon: FileText, desc: "The wording served to the tenant." },
        { key: "service", label: "Service record", icon: Truck, desc: "How and when it was delivered." },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FolderOpen, desc: "The served notice, photos, and proof of service." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Follow-ups and history." },
      ],
    },
  ],
  sections: {
    overview: makeFieldsSection([
      { key: "noticeType", label: "Type", type: "readonly" },
      { key: "status", label: "Status", type: "readonly" },
      { key: "tenantName", label: "Tenant", type: "readonly" },
      { key: "unit", label: "Unit", type: "readonly" },
      { key: "servedDate", label: "Served", type: "readonly", format: (v) => formatDate(v) },
      { key: "deliveryMethod", label: "Delivery", type: "readonly" },
      { key: "cureBy", label: "Cure by", type: "readonly", format: (v) => formatDate(v) },
      {
        key: "cureStatus",
        label: "Cure window",
        type: "readonly",
        format: (_v, r) => {
          const d = daysUntil(r.cureBy);
          if (d === null) return "—";
          if (!isOpen(r)) return r.status;
          return d < 0 ? `${-d} days overdue` : `${d} days left`;
        },
      },
      { key: "amountDue", label: "Amount due", type: "readonly", meta: true, format: (v) => (v ? currency(v) : "—") },
    ]),
    details: makeMetaAwareFieldsSection([
      { key: "noticeType", label: "Type", type: "select", options: NOTICE_TYPE_OPTIONS },
      { key: "status", label: "Status", type: "select", options: filterOptions(NOTICE_STATUS_MAP).slice(1) },
      { key: "direction", label: "Direction", type: "select", meta: true, options: NOTICE_DIRECTION_OPTIONS },
      { key: "leaseId", label: "Lease", type: "relation", load: noticeLeaseOptions, full: true },
      { key: "tenantId", label: "Tenant", type: "relation", load: noticeTenantOptions, displayKey: "tenantName" },
      { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
      { key: "servedDate", label: "Served date", type: "date" },
      { key: "cureBy", label: "Cure by", type: "date" },
      { key: "deliveryMethod", label: "Delivery method", type: "select", options: DELIVERY_METHOD_OPTIONS },
      { key: "amountDue", label: "Amount due", type: "currency", meta: true, hint: "For rent notices." },
      { key: "reason", label: "Violation / reason", type: "textarea", meta: true },
    ]),
    text: NoticeTextSection,
    service: makeMetaListSection({
      field: "serviceLog",
      singular: "service attempt",
      icon: Truck,
      primaryPlaceholder: "e.g. Posted on door, photo taken",
      secondary: { key: "date", label: "Date", placeholder: "e.g. Oct 12, 9:30am" },
    }),
    documents: DocumentsSection,
    activity: ActivitySection,
  },
};

export function NoticesScreen() {
  return <EntityListScreen config={noticesConfig} />;
}

export default NoticesScreen;
