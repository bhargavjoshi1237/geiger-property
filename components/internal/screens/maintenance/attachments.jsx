"use client";

import {
  LayoutDashboard,
  SquarePen,
  Eye,
  Clock,
  Settings,
  Camera,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { maintenanceAttachmentsData } from "@/lib/supabase/maintenance_attachments";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  ATTACHMENT_STATUS_MAP,
  ATTACHMENT_CATEGORY_MAP,
  ATTACHMENT_CATEGORY_OPTIONS,
  selectOptions,
  filterOptions,
  formatDate,
} from "./shared";

// Photos & Attachments — maintenance media (owns
// `property.maintenance_attachments`). Photos, videos, invoices, manuals, and
// supporting documents, organized by category and linked to a work order.

const attachmentsConfig = {
  key: "attachment",
  singular: "Attachment",
  plural: "Attachments",
  title: "Photos & Attachments",
  description:
    "Upload, organize, and preview maintenance media — photos, videos, invoices, manuals, and supporting documents. Filter by category and link to a work order.",
  icon: Camera,
  titleField: "name",
  searchFields: ["name", "workOrderLabel", "category"],
  data: maintenanceAttachmentsData,

  statusMap: ATTACHMENT_STATUS_MAP,
  statusFilterOptions: filterOptions(ATTACHMENT_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Attachment",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {r.workOrderLabel || "Not linked to a work order"}
          </span>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (r) => (
        <Badge variant={ATTACHMENT_CATEGORY_MAP[r.category]?.variant || "neutral"}>
          {r.category}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={ATTACHMENT_STATUS_MAP} />,
    },
    {
      key: "createdAt",
      header: "Added",
      align: "right",
      className: "text-right",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{formatDate(r.createdAt)}</span>
      ),
    },
  ],

  stats: (rows) => {
    const photos = rows.filter((r) => r.category === "Photo").length;
    const invoices = rows.filter((r) => r.category === "Invoice").length;
    const linked = rows.filter((r) => r.workOrderLabel).length;
    return [
      { label: "Files", value: String(rows.length), footer: `${photos} photos` },
      { label: "Invoices", value: String(invoices), footer: "Billing docs" },
      { label: "Linked", value: String(linked), footer: "Tied to a work order" },
      { label: "Categories", value: String(new Set(rows.map((r) => r.category).filter(Boolean)).size), footer: "In use" },
    ];
  },

  createDraft: { name: "", category: "Photo", status: "Active" },
  createFields: [
    { key: "name", label: "File name", type: "text", placeholder: "e.g. Faucet before repair" },
    { key: "category", label: "Category", type: "select", options: ATTACHMENT_CATEGORY_OPTIONS },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    category: draft.category || "Photo",
    workOrderLabel: "",
    status: draft.status || "Active",
  }),

  headerMeta: (r) =>
    [r.category, r.workOrderLabel, formatDate(r.createdAt)].filter((v) => v && v !== "—").join(" · "),

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this file." }],
    },
    {
      group: "File",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Name, category, and link." },
        { key: "preview", label: "Preview", icon: Eye, desc: "The file preview." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "notes", label: "Notes", icon: Clock, desc: "Notes about this file." },
        { key: "settings", label: "Settings", icon: Settings, desc: "Status and configuration." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "category", label: "Category" },
        { key: "workOrderLabel", label: "Work order" },
        { key: "status", label: "Status" },
        { key: "url", label: "URL" },
        { key: "createdAt", label: "Added", format: (v) => formatDate(v) },
      ],
    }),
    details: makeFieldsSection([
      { key: "name", label: "File name", type: "text", full: true },
      { key: "category", label: "Category", type: "select", options: ATTACHMENT_CATEGORY_OPTIONS },
      { key: "workOrderLabel", label: "Linked work order", type: "text" },
      { key: "url", label: "File URL", type: "text", full: true },
    ]),
    preview: PreviewSection,
    notes: makeNotesSection({ field: "notes", placeholder: "Notes about this file…" }),
    settings: makeFieldsSection([
      { key: "status", label: "Status", type: "select", options: selectOptions(ATTACHMENT_STATUS_MAP) },
      { key: "category", label: "Category", type: "select", options: ATTACHMENT_CATEGORY_OPTIONS },
    ]),
  },
};

// Lightweight preview: renders an image when the URL looks like one, else a link.
function PreviewSection({ item }) {
  const url = item?.url;
  const isImage = url && /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(url);
  if (!url) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle px-4 py-10 text-center text-sm text-text-secondary">
        Add a file URL in Details to preview it here.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={item?.name || "Attachment preview"}
          className="max-h-[420px] w-full rounded-xl border border-border object-contain bg-surface-subtle"
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface-subtle px-4 py-10 text-center text-sm text-text-secondary">
          No inline preview for this file type.
        </div>
      )}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex text-sm font-medium text-primary hover:underline"
      >
        Open original ↗
      </a>
    </div>
  );
}

export function AttachmentsScreen() {
  return <EntityListScreen config={attachmentsConfig} />;
}

export default AttachmentsScreen;
