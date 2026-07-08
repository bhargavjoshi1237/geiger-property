"use client";

import { LayoutDashboard, Scale, ClipboardList, FileText } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { leaseTemplatesLayer } from "@/lib/supabase/lease_templates";
import { lensData } from "@/lib/supabase/entity_factory";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { TEMPLATE_STATUS_MAP, filterOptions, formatDate } from "./shared";

// State-specific Leases — a lens on `property.lease_templates` (scope = "state").
// Manage jurisdiction-specific lease requirements and disclosures.

const stateData = lensData(leaseTemplatesLayer, {
  where: { scope: "state" },
  defaults: { scope: "state" },
});

const stateConfig = {
  key: "template",
  singular: "State lease",
  plural: "State leases",
  title: "State-specific Leases",
  description:
    "Lease templates and requirements scoped to a jurisdiction — keep every state's mandatory clauses and disclosures in one place.",
  icon: Scale,
  titleField: "name",
  searchFields: ["name", "state"],
  data: stateData,

  statusMap: TEMPLATE_STATUS_MAP,
  statusFilterOptions: filterOptions(TEMPLATE_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Template",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.state ? `State: ${r.state}` : "No state set"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={TEMPLATE_STATUS_MAP} />,
    },
  ],

  stats: (rows) => {
    const states = new Set(rows.map((r) => r.state).filter(Boolean)).size;
    const published = rows.filter((r) => r.status === "Published").length;
    return [
      { label: "State templates", value: String(rows.length), footer: `${published} published` },
      { label: "States covered", value: String(states), footer: "Distinct jurisdictions" },
      { label: "Published", value: String(published), footer: "Ready to use" },
      { label: "Drafts", value: String(rows.filter((r) => r.status === "Draft").length), footer: "In progress" },
    ];
  },

  createDraft: { name: "", state: "" },
  createFields: [
    { key: "name", label: "Template name", type: "text", placeholder: "e.g. Texas residential lease" },
    { key: "state", label: "State (2-letter)", type: "text", placeholder: "e.g. TX" },
  ],
  newRow: (draft) => ({ name: draft.name.trim(), state: draft.state || "", scope: "state", status: "Draft" }),

  headerMeta: (r) => [r.state ? `State: ${r.state}` : null, r.status].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this state template." },
      ],
    },
    {
      group: "Compliance",
      items: [
        { key: "requirements", label: "State Requirements", icon: Scale, desc: "Mandatory clauses for this state." },
        { key: "disclosures", label: "Required Disclosures", icon: ClipboardList, desc: "Disclosures the state requires." },
        { key: "body", label: "Template Body", icon: FileText, desc: "The lease text for this state." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "state", label: "State" },
        { key: "status", label: "Status" },
        { key: "createdAt", label: "Created", format: (v) => formatDate(v) },
      ],
    }),
    requirements: makeMetaListSection({
      field: "requirements",
      singular: "requirement",
      icon: Scale,
      primaryPlaceholder: "e.g. Security deposit cap",
    }),
    disclosures: makeMetaListSection({
      field: "disclosures",
      singular: "disclosure",
      icon: ClipboardList,
      primaryPlaceholder: "e.g. Lead-based paint disclosure",
      check: true,
    }),
    body: makeNotesSection({ field: "body", placeholder: "State-specific lease text…", meta: false, mono: true }),
  },
};

export function StateLeasesScreen() {
  return <EntityListScreen config={stateConfig} />;
}

export default StateLeasesScreen;
