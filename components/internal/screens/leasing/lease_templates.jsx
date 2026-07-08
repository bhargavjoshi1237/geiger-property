"use client";

import { LayoutDashboard, FileText, Braces, Activity as ActivityIcon, Settings, Files } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { leaseTemplatesData } from "@/lib/supabase/lease_templates";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { TEMPLATE_STATUS_MAP, filterOptions, formatDate } from "./shared";

// Lease Templates — an entity screen over `property.lease_templates`. Reusable
// lease bodies with merge fields; State-specific templates are the same table
// filtered by scope.

const SCOPE_OPTIONS = [
  { value: "generic", label: "Generic" },
  { value: "state", label: "State-specific" },
];

const templatesConfig = {
  key: "template",
  singular: "Template",
  plural: "Templates",
  title: "Lease Templates",
  description:
    "Reusable lease templates with merge fields — draft once and generate leases in seconds. Search, filter, and open one to edit.",
  icon: Files,
  titleField: "name",
  searchFields: ["name", "state"],
  data: leaseTemplatesData,

  statusMap: TEMPLATE_STATUS_MAP,
  statusFilterOptions: filterOptions(TEMPLATE_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Template",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {r.scope === "state" ? `State-specific${r.state ? ` · ${r.state}` : ""}` : "Generic"}
          </span>
        </div>
      ),
    },
    {
      key: "scope",
      header: "Scope",
      render: (r) => (
        <Badge variant={r.scope === "state" ? "info" : "neutral"}>
          {r.scope === "state" ? "State" : "Generic"}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={TEMPLATE_STATUS_MAP} />,
    },
  ],

  stats: (rows) => {
    const published = rows.filter((r) => r.status === "Published").length;
    const stateSpecific = rows.filter((r) => r.scope === "state").length;
    return [
      { label: "Templates", value: String(rows.length), footer: `${published} published` },
      { label: "Published", value: String(published), footer: "Ready to use" },
      { label: "State-specific", value: String(stateSpecific), footer: "Jurisdiction-scoped" },
      { label: "Drafts", value: String(rows.filter((r) => r.status === "Draft").length), footer: "In progress" },
    ];
  },

  createDraft: { name: "", scope: "generic", status: "Draft" },
  createFields: [
    { key: "name", label: "Template name", type: "text", placeholder: "e.g. Standard 12-month lease" },
    { key: "scope", label: "Scope", type: "select", options: SCOPE_OPTIONS },
  ],
  newRow: (draft) => ({ name: draft.name.trim(), scope: draft.scope || "generic", status: "Draft" }),

  headerMeta: (r) => [r.scope === "state" ? "State-specific" : "Generic", r.state].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this template." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "body", label: "Template Body", icon: FileText, desc: "The lease text with merge fields." },
        { key: "mergeFields", label: "Merge Fields", icon: Braces, desc: "Placeholders filled in per lease." },
        { key: "usage", label: "Usage", icon: ActivityIcon, desc: "Where this template is used." },
        { key: "settings", label: "Settings", icon: Settings, desc: "Scope, state, and status." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "scope", label: "Scope", format: (v) => (v === "state" ? "State-specific" : "Generic") },
        { key: "state", label: "State" },
        { key: "status", label: "Status" },
        { key: "createdAt", label: "Created", format: (v) => formatDate(v) },
      ],
    }),
    body: makeNotesSection({ field: "body", placeholder: "Lease template text — use {{merge_field}} placeholders…", meta: false, mono: true }),
    mergeFields: makeMetaListSection({
      field: "mergeFields",
      singular: "merge field",
      icon: Braces,
      primaryPlaceholder: "e.g. {{tenant_name}}",
    }),
    usage: makeOverviewSection({
      fields: [
        { key: "status", label: "Status" },
        { key: "createdAt", label: "Created", format: (v) => formatDate(v) },
      ],
      note: "Leases generated from this template will be tracked here.",
    }),
    settings: makeFieldsSection([
      { key: "scope", label: "Scope", type: "select", options: SCOPE_OPTIONS },
      { key: "state", label: "State (2-letter)", type: "text", placeholder: "e.g. TX" },
      { key: "status", label: "Status", type: "select", options: filterOptions(TEMPLATE_STATUS_MAP).slice(1) },
    ]),
  },
};

export function LeaseTemplatesScreen() {
  return <EntityListScreen config={templatesConfig} />;
}

export default LeaseTemplatesScreen;
