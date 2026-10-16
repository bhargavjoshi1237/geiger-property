"use client";

import { LayoutDashboard, SlidersHorizontal, FileText, Truck, Clock, Gavel } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { noticesData } from "@/lib/supabase/notices";
import { listTenants } from "@/lib/supabase/tenants";
import { unitOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  NOTICE_STATUS_MAP,
  NOTICE_TYPE_OPTIONS,
  DELIVERY_METHOD_OPTIONS,
  filterOptions,
  currency,
  formatDate,
  daysUntil,
  isNoticeOverdue,
} from "./shared";

// Notices & Violations — an entity screen over `property.notices`: notices served
// to tenants (late rent, violations, entry…) with service details and cure dates.

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

const noticesConfig = {
  key: "notice",
  singular: "Notice",
  plural: "Notices",
  title: "Notices & Violations",
  description:
    "Notices served to tenants — late rent, lease violations, entry, non-renewal, and rent increases — with how they were delivered and when they must be cured.",
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
    { value: "closed", label: "Resolved", filter: (r) => !isOpen(r) },
  ],

  columns: [
    {
      key: "name",
      header: "Notice",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.noticeType || "Type not set"}</span>
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

  createDraft: { name: "", noticeType: "", tenantId: "" },
  createFields: [
    { key: "name", label: "Notice title", type: "text", placeholder: "e.g. 3-day notice to pay — 4B" },
    { key: "noticeType", label: "Type", type: "select", options: NOTICE_TYPE_OPTIONS, placeholder: "Select a type…" },
    {
      key: "tenantId",
      label: "Tenant",
      type: "select",
      optionsFrom: "tenants",
      placeholder: "Select a tenant…",
      emptyLabel: "No tenants yet — add them in Tenants",
    },
  ],
  loadCreateOptions: async () => ({ tenants: await noticeTenantOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    noticeType: draft.noticeType || "Other",
    tenantId: draft.tenantId || "",
    tenantName: draft.tenantName || "",
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    status: "Draft",
  }),

  headerMeta: (r) =>
    [r.noticeType, r.tenantName, r.unit, r.cureBy ? `Cure by ${formatDate(r.cureBy)}` : null]
      .filter(Boolean)
      .join(" · "),

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
        { key: "details", label: "Details", icon: SlidersHorizontal, desc: "Type, tenant, unit, and dates." },
        { key: "text", label: "Notice text", icon: FileText, desc: "The wording served to the tenant." },
        { key: "service", label: "Service record", icon: Truck, desc: "How and when it was delivered." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Follow-ups and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "noticeType", label: "Type" },
        { key: "status", label: "Status" },
        { key: "tenantName", label: "Tenant" },
        { key: "unit", label: "Unit" },
        { key: "servedDate", label: "Served", format: (v) => formatDate(v) },
        { key: "deliveryMethod", label: "Delivery" },
        { key: "cureBy", label: "Cure by", format: (v) => formatDate(v) },
        {
          key: "cureStatus",
          label: "Cure window",
          format: (_v, r) => {
            const d = daysUntil(r.cureBy);
            if (d === null) return "—";
            if (!isOpen(r)) return r.status;
            return d < 0 ? `${-d} days overdue` : `${d} days left`;
          },
        },
        { key: "amountDue", label: "Amount due", meta: true, format: (v) => (v ? currency(v) : "—") },
      ],
    }),
    details: makeFieldsSection([
      { key: "noticeType", label: "Type", type: "select", options: NOTICE_TYPE_OPTIONS },
      { key: "status", label: "Status", type: "select", options: filterOptions(NOTICE_STATUS_MAP).slice(1) },
      { key: "tenantId", label: "Tenant", type: "relation", load: noticeTenantOptions, displayKey: "tenantName" },
      { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
      { key: "servedDate", label: "Served date", type: "date" },
      { key: "cureBy", label: "Cure by", type: "date" },
      { key: "deliveryMethod", label: "Delivery method", type: "select", options: DELIVERY_METHOD_OPTIONS },
      { key: "amountDue", label: "Amount due", type: "number", meta: true, hint: "For late-rent notices." },
    ]),
    text: makeNotesSection({
      field: "noticeText",
      placeholder: "The full notice as served — violation, required action, and deadline…",
      mono: true,
    }),
    service: makeMetaListSection({
      field: "serviceLog",
      singular: "service attempt",
      icon: Truck,
      primaryPlaceholder: "e.g. Posted on door, photo taken",
      secondary: { key: "date", label: "Date", placeholder: "e.g. Oct 12, 9:30am" },
    }),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a follow-up about this notice…" }),
  },
};

export function NoticesScreen() {
  return <EntityListScreen config={noticesConfig} />;
}

export default NoticesScreen;
