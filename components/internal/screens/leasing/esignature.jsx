"use client";

import { toast } from "sonner";
import {
  LayoutDashboard,
  Users,
  FileText,
  History,
  BellRing,
  FileSignature,
  Send,
  Eye,
  CheckCircle2,
  XCircle,
  Ban,
  Clock,
  PlugZap,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { ActivitySection } from "@/components/internal/screens/entity/shared_sections";
import { esignData } from "@/lib/supabase/esign";
import { leasesLayer } from "@/lib/supabase/leases";
import { leaseOptions } from "@/lib/supabase/options";
import { todayISO } from "@/lib/leasing/workflows";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
} from "@/components/internal/screens/entity/sections/factories";
import { Callout, makeStackSection } from "./sections/gated";
import { ESIGN_STATUS_MAP, filterOptions, formatDate, metaList } from "./shared";

// E-signature — an entity screen over `property.esign_requests`. Tracking only:
// no e-signature provider is connected, so statuses, signers, and the audit trail
// are updated by hand. Marking a lease request signed stamps the lease.

const OPEN = ["Draft", "Sent", "Viewed", "Partially signed"];

// Lease options that also prefill the primary signer with the lease's tenant.
async function signingLeaseOptions() {
  const opts = await leaseOptions();
  return opts.map((o) => ({ ...o, patch: { signer: o.patch.tenantName || "" } }));
}

function ProviderNotice() {
  return (
    <Callout tone="info" icon={PlugZap}>
      <span className="font-medium">E-signature provider not connected.</span> Requests are tracked here — send documents
      yourself and update each status as signatures come back.
    </Callout>
  );
}

// Status change + audit entry; signing a lease request stamps the lease's signed date.
const statusAction = (key, label, icon, status, showIf, extra = {}) => ({
  key,
  label,
  icon,
  showIf,
  ...extra,
  run: async (ctx) => {
    const patch = { status };
    if (status === "Sent" && !ctx.item.sentAt) patch.sentAt = new Date().toISOString();
    if (status === "Signed") patch.signedAt = new Date().toISOString();
    const ok = await ctx.commit(patch);
    if (!ok) return;
    await ctx.commitMeta({ audit: [...metaList(ctx.item, "audit"), { id: crypto.randomUUID(), label: `${status} — recorded manually`, date: formatDate(todayISO()) }] });
    if (status === "Signed" && ctx.item.leaseId) {
      const lease = await leasesLayer.get(ctx.item.leaseId);
      if (lease && !lease.signedDate) await leasesLayer.update(lease.id, { signedDate: todayISO() });
    }
    ctx.log(`Marked ${status.toLowerCase()}`);
    toast.success(`Marked ${status.toLowerCase()}.`);
  },
});

const esignConfig = {
  key: "request",
  singular: "Signing request",
  plural: "Signing requests",
  title: "E-signature",
  description:
    "Track documents out for signature — who signed, who's pending, and the audit trail. No e-signature provider is connected; statuses are updated by hand.",
  icon: FileSignature,
  titleField: "name",
  searchFields: ["name", "signer"],
  data: esignData,

  statusMap: ESIGN_STATUS_MAP,
  statusFilterOptions: filterOptions(ESIGN_STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "open", label: "Awaiting", filter: (r) => OPEN.includes(r.status) },
    { value: "signed", label: "Signed", filter: (r) => r.status === "Signed" },
    { value: "closed", label: "Declined & voided", filter: (r) => r.status === "Declined" || r.status === "Voided" },
  ],

  columns: [
    {
      key: "name",
      header: "Document",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.signer || "No signer set"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={ESIGN_STATUS_MAP} />,
    },
    {
      key: "signers",
      header: "Signed",
      className: "text-sm tabular-nums text-muted-foreground",
      render: (r) => {
        const s = metaList(r, "signers");
        return s.length ? `${s.filter((x) => x.done).length}/${s.length}` : "—";
      },
    },
    {
      key: "sentAt",
      header: "Sent",
      className: "text-sm text-muted-foreground",
      render: (r) => formatDate(r.sentAt),
    },
    {
      key: "signedAt",
      header: "Completed",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => formatDate(r.signedAt),
    },
  ],

  stats: (rows) => {
    const signed = rows.filter((r) => r.status === "Signed").length;
    const awaiting = rows.filter((r) => ["Sent", "Viewed", "Partially signed"].includes(r.status)).length;
    return [
      { label: "Requests", value: String(rows.length), footer: `${signed} signed` },
      { label: "Awaiting", value: String(awaiting), footer: "Sent, viewed, or partly signed" },
      { label: "Signed", value: String(signed), footer: "Completed" },
      { label: "Declined", value: String(rows.filter((r) => r.status === "Declined").length), footer: "Rejected" },
    ];
  },

  createDraft: { name: "", leaseId: "", signer: "" },
  createFields: [
    { key: "name", label: "Document name", type: "text", placeholder: "e.g. Maple Court · 4B lease" },
    {
      key: "leaseId",
      label: "Lease (optional)",
      type: "select",
      optionsFrom: "leases",
      placeholder: "Select a lease…",
      emptyLabel: "No leases yet — add them in Leases",
    },
    { key: "signer", label: "Primary signer", type: "text", placeholder: "e.g. Jordan Blake" },
  ],
  loadCreateOptions: async () => ({ leases: await signingLeaseOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    leaseId: draft.leaseId || "",
    signer: draft.signer || "",
    status: "Draft",
    metadata: draft.signer ? { signers: [{ id: crypto.randomUUID(), label: draft.signer, email: "", done: false }] } : {},
  }),

  headerMeta: (r) => [r.signer, r.sentAt ? `Sent ${formatDate(r.sentAt)}` : null, r.signedAt ? `Signed ${formatDate(r.signedAt)}` : null].filter(Boolean).join(" · "),

  actions: [
    statusAction("sent", "Mark sent", Send, "Sent", (r) => r.status === "Draft"),
    statusAction("viewed", "Mark viewed", Eye, "Viewed", (r) => r.status === "Sent"),
    statusAction("signed", "Mark signed", CheckCircle2, "Signed", (r) => OPEN.includes(r.status)),
    statusAction("declined", "Mark declined", XCircle, "Declined", (r) => OPEN.includes(r.status), { danger: true, separatorBefore: true }),
    statusAction("void", "Void request", Ban, "Voided", (r) => OPEN.includes(r.status), { danger: true }),
  ],

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this request." },
      ],
    },
    {
      group: "Request",
      items: [
        { key: "signers", label: "Signers", icon: Users, desc: "Everyone who needs to sign — tick each as they sign." },
        { key: "document", label: "Document", icon: FileText, desc: "The document being signed." },
        { key: "audit", label: "Audit Trail", icon: History, desc: "Every event in the signing flow." },
        { key: "reminders", label: "Reminders", icon: BellRing, desc: "When to nudge signers." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Every change and action on this request." },
      ],
    },
  ],
  sections: {
    overview: makeStackSection(
      ProviderNotice,
      makeOverviewSection({
        fields: [
          { key: "signer", label: "Primary signer" },
          { key: "status", label: "Status" },
          { key: "sentAt", label: "Sent", format: (v) => formatDate(v) },
          { key: "signedAt", label: "Completed", format: (v) => formatDate(v) },
          { key: "provider", label: "Provider", format: (v) => v || "Not connected" },
          {
            key: "progress",
            label: "Signers",
            format: (_v, r) => {
              const s = metaList(r, "signers");
              return s.length ? `${s.filter((x) => x.done).length} of ${s.length} signed` : "—";
            },
          },
          { key: "createdAt", label: "Created", format: (v) => formatDate(v) },
        ],
      }),
    ),
    signers: makeMetaListSection({
      field: "signers",
      singular: "signer",
      icon: Users,
      primaryPlaceholder: "Signer name",
      secondary: { key: "email", label: "Email", placeholder: "email@example.com" },
      check: true,
    }),
    document: makeFieldsSection([
      { key: "name", label: "Document name", type: "text" },
      { key: "leaseId", label: "Lease", type: "relation", load: leaseOptions },
      { key: "status", label: "Status", type: "select", options: filterOptions(ESIGN_STATUS_MAP).slice(1) },
      { key: "documentLink", label: "Document link", type: "url", meta: true, full: true, placeholder: "https://…" },
      { key: "signingOrder", label: "Signing order", type: "select", meta: true, options: [{ value: "any", label: "Any order" }, { value: "sequential", label: "In listed order" }] },
      { key: "expiresOn", label: "Expires on", type: "date", meta: true },
      { key: "message", label: "Message to signers", type: "textarea", meta: true, full: true },
    ]),
    audit: makeMetaListSection({
      field: "audit",
      singular: "audit event",
      icon: History,
      primaryPlaceholder: "e.g. Emailed to Jordan Blake",
      secondary: { key: "date", label: "When", placeholder: "e.g. Oct 16, 2026 10:12am" },
    }),
    reminders: makeFieldsSection([
      {
        key: "reminderCadence",
        label: "Reminder cadence",
        type: "select",
        meta: true,
        options: [
          { value: "Off", label: "Off" },
          { value: "Daily", label: "Daily" },
          { value: "Every 3 days", label: "Every 3 days" },
          { value: "Weekly", label: "Weekly" },
        ],
      },
      { key: "lastReminder", label: "Last reminder", type: "date", meta: true },
      { key: "reminderNote", label: "Reminder note", type: "textarea", meta: true },
    ]),
    activity: ActivitySection,
  },
};

export function EsignatureScreen() {
  return <EntityListScreen config={esignConfig} />;
}

export default EsignatureScreen;
