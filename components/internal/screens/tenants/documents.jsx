"use client";

import { LayoutDashboard, FileText, Share2, Clock, Files } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { tenantDocumentsData } from "@/lib/supabase/tenant_documents";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { formatDate } from "./shared";

// Documents — an entity screen over `property.tenant_documents`. Every tenant
// document in one place: leases, IDs, income, notices, and more.

const KIND_LABEL = {
  lease: "Lease",
  id: "ID",
  income: "Income",
  background: "Background",
  notice: "Notice",
  other: "Other",
};

const KIND_OPTIONS = [
  { value: "lease", label: "Lease" },
  { value: "id", label: "ID" },
  { value: "income", label: "Income" },
  { value: "background", label: "Background" },
  { value: "notice", label: "Notice" },
  { value: "other", label: "Other" },
];

const fmtSize = (b) => {
  const n = Number(b) || 0;
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const documentsConfig = {
  key: "document",
  singular: "Document",
  plural: "Documents",
  title: "Documents",
  description:
    "Every tenant document across your portfolio — leases, IDs, income proof, and notices. Search, filter, and open one to manage it.",
  icon: Files,
  titleField: "name",
  searchFields: ["name", "kind"],
  data: tenantDocumentsData,

  statusMap: {},
  statusFilterOptions: [{ value: "all", label: "All documents" }],

  columns: [
    {
      key: "name",
      header: "Document",
      render: (r) => (
        <span className="font-medium text-foreground">{r.name}</span>
      ),
    },
    {
      key: "kind",
      header: "Kind",
      render: (r) => (
        <Badge variant="neutral">{KIND_LABEL[r.kind] || r.kind}</Badge>
      ),
    },
    {
      key: "sizeBytes",
      header: "Size",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{fmtSize(r.sizeBytes)}</span>
      ),
    },
    {
      key: "createdAt",
      header: "Added",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => formatDate(r.createdAt),
    },
  ],

  stats: (rows) => {
    const leases = rows.filter((r) => r.kind === "lease").length;
    const ids = rows.filter((r) => r.kind === "id").length;
    const size = rows.reduce((s, r) => s + (Number(r.sizeBytes) || 0), 0);
    return [
      { label: "Documents", value: String(rows.length), footer: "On file" },
      { label: "Leases", value: String(leases), footer: "Lease documents" },
      { label: "IDs", value: String(ids), footer: "Identity documents" },
      { label: "Total size", value: fmtSize(size), footer: "Stored" },
    ];
  },

  createDraft: { name: "", kind: "other" },
  createFields: [
    { key: "name", label: "Document name", type: "text", placeholder: "e.g. Signed lease.pdf" },
    { key: "kind", label: "Kind", type: "select", options: KIND_OPTIONS },
  ],
  newRow: (draft) => ({ name: draft.name.trim(), kind: draft.kind || "other", sizeBytes: 0 }),

  headerMeta: (r) => [KIND_LABEL[r.kind] || r.kind, fmtSize(r.sizeBytes)].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this document." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "file", label: "File & Preview", icon: FileText, desc: "Name, kind, link, and size." },
        { key: "sharing", label: "Sharing", icon: Share2, desc: "Who can access this document." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "kind", label: "Kind", format: (v) => KIND_LABEL[v] || v },
        { key: "sizeBytes", label: "Size", format: (v) => fmtSize(v) },
        { key: "url", label: "Link", format: (v) => v || "Not linked" },
        { key: "createdAt", label: "Added", format: (v) => formatDate(v) },
      ],
    }),
    file: makeFieldsSection([
      { key: "name", label: "Document name", type: "text", placeholder: "e.g. Signed lease.pdf" },
      { key: "kind", label: "Kind", type: "select", options: KIND_OPTIONS },
      { key: "url", label: "Link (URL)", type: "text", full: true, placeholder: "https://…" },
      { key: "sizeBytes", label: "Size (bytes)", type: "number" },
    ]),
    sharing: makeFieldsSection([
      { key: "sharedWithTenant", label: "Visible to tenant", type: "switch", meta: true },
      { key: "shareLink", label: "Share link", type: "text", meta: true, full: true, placeholder: "https://…" },
      { key: "expiresOn", label: "Link expires", type: "date", meta: true },
    ]),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this document…" }),
  },
};

export function TenantDocumentsScreen() {
  return <EntityListScreen config={documentsConfig} />;
}

export default TenantDocumentsScreen;
