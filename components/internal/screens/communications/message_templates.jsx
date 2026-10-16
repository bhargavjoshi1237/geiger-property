"use client";

import { toast } from "sonner";
import {
  LayoutDashboard,
  SquarePen,
  FileCode,
  Eye,
  Clock,
  MailOpen,
  Braces,
  Copy,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { messageTemplatesData } from "@/lib/supabase/message_templates";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  BROADCAST_CHANNELS,
  MERGE_FIELDS,
  TEMPLATE_CATEGORIES,
  TEMPLATE_STATUS_MAP,
  fillMergeFields,
  filterOptions,
  formatDate,
  listOptions,
  selectOptions,
  unknownTokens,
} from "./shared";

// Message Templates — reusable message bodies with {{merge_field}} tokens (owns
// `property.message_templates`). The Preview tab fills tokens with sample values.

const CATEGORY_OPTIONS = listOptions(TEMPLATE_CATEGORIES);
const CHANNEL_OPTIONS = listOptions(BROADCAST_CHANNELS);

const copyToken = async (token) => {
  try {
    await navigator.clipboard.writeText(`{{${token}}}`);
    toast.success(`Copied {{${token}}}`);
  } catch {
    toast.error("Couldn't copy to the clipboard.");
  }
};

// Live preview of subject + body with merge fields substituted, plus the token list.
function TemplatePreview({ item }) {
  const unknown = unknownTokens(`${item.subject || ""} ${item.body || ""}`);
  return (
    <div className="space-y-4">
      <SectionCard title="Preview" description="Rendered with sample values.">
        <div className="space-y-3">
          {item.channel !== "SMS" ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                Subject
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {fillMergeFields(item.subject) || "(no subject)"}
              </p>
            </div>
          ) : null}
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Body
            </p>
            {item.body ? (
              <div className="mt-1 whitespace-pre-wrap rounded-lg border border-border bg-surface-card p-4 text-sm leading-relaxed text-foreground">
                {fillMergeFields(item.body)}
              </div>
            ) : (
              <p className="mt-1 text-sm text-text-tertiary">
                The body is empty — write it in the Body tab.
              </p>
            )}
          </div>
          {unknown.length ? (
            <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlert className="h-3.5 w-3.5" />
              Unknown merge field{unknown.length > 1 ? "s" : ""}:{" "}
              {unknown.map((t) => `{{${t}}}`).join(", ")}
            </p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Available merge fields"
        description="Use these tokens in the subject or body. Click to copy."
        bodyPadding={false}
      >
        <ul className="divide-y divide-border">
          {MERGE_FIELDS.map((f) => (
            <li key={f.token} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Braces className="h-4 w-4 shrink-0 text-text-secondary" />
                <code className="truncate font-mono text-[13px] text-foreground">{`{{${f.token}}}`}</code>
                <span className="hidden truncate text-sm text-text-secondary sm:inline">{f.label}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm text-text-tertiary">{f.sample}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:bg-surface-active hover:text-foreground"
                  onClick={() => copyToken(f.token)}
                  aria-label={`Copy {{${f.token}}}`}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

const templatesConfig = {
  key: "template",
  singular: "Template",
  plural: "Templates",
  title: "Message Templates",
  description:
    "Reusable messages for leasing, maintenance, and payments — with merge fields that fill in tenant, unit, and rent details.",
  icon: MailOpen,
  titleField: "name",
  searchFields: ["name", "category", "channel", "subject", "body"],
  data: messageTemplatesData,

  statusMap: TEMPLATE_STATUS_MAP,
  statusFilterOptions: filterOptions(TEMPLATE_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Template",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="max-w-md truncate text-xs text-text-secondary">
            {r.subject || "No subject"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={TEMPLATE_STATUS_MAP} />,
    },
    {
      key: "category",
      header: "Category",
      render: (r) =>
        r.category ? <Badge variant="neutral">{r.category}</Badge> : <span className="text-text-tertiary">—</span>,
    },
    {
      key: "channel",
      header: "Channel",
      className: "text-sm text-muted-foreground",
      render: (r) => r.channel || "—",
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status === "Active").length;
    const byCat = (c) => rows.filter((r) => r.category === c).length;
    return [
      { label: "Templates", value: String(rows.length), footer: `${active} active` },
      { label: "Leasing", value: String(byCat("Leasing")), footer: "Applications & leases" },
      { label: "Maintenance", value: String(byCat("Maintenance")), footer: "Work order updates" },
      { label: "Payments", value: String(byCat("Payments")), footer: "Rent & fee reminders" },
    ];
  },

  createDraft: { name: "", category: "General", channel: "Email" },
  createFields: [
    { key: "name", label: "Template name", type: "text", placeholder: "e.g. Rent reminder — 3 days" },
    { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
    { key: "channel", label: "Channel", type: "select", options: CHANNEL_OPTIONS },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    category: draft.category || "General",
    channel: draft.channel || "Email",
    subject: "",
    body: "",
    status: "Active",
  }),

  headerMeta: (r) => [r.category, r.channel].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this template." },
      ],
    },
    {
      group: "Template",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Name, category, channel, and subject." },
        { key: "body", label: "Body", icon: FileCode, desc: "The message text — use {{merge_field}} tokens." },
        { key: "preview", label: "Preview", icon: Eye, desc: "See it filled in with sample values." },
      ],
    },
    {
      group: "General",
      items: [{ key: "activity", label: "Activity", icon: Clock, desc: "Internal notes and history." }],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "category", label: "Category" },
        { key: "channel", label: "Channel" },
        { key: "subject", label: "Subject" },
        { key: "status", label: "Status" },
        { key: "createdAt", label: "Created", format: (v) => formatDate(v) },
      ],
    }),
    details: makeFieldsSection([
      { key: "name", label: "Template name", type: "text", full: true },
      { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
      { key: "channel", label: "Channel", type: "select", options: CHANNEL_OPTIONS },
      { key: "subject", label: "Subject", type: "text", full: true, placeholder: "e.g. Rent for {{unit}} is due {{due_date}}" },
      { key: "status", label: "Status", type: "select", options: selectOptions(TEMPLATE_STATUS_MAP) },
    ]),
    body: makeNotesSection({
      field: "body",
      meta: false,
      mono: true,
      placeholder: "Hi {{tenant_name}}, your rent of {{rent}} for {{unit}} is due {{due_date}}.",
    }),
    preview: TemplatePreview,
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log an internal note…" }),
  },
};

export function MessageTemplatesScreen() {
  return <EntityListScreen config={templatesConfig} />;
}

export default MessageTemplatesScreen;
