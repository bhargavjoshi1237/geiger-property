"use client";

import {
  LayoutDashboard,
  ListChecks,
  FileSignature,
  Users,
  Eye,
  Clock,
  FilePen,
} from "lucide-react";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { leasesLayer } from "@/lib/supabase/leases";
import { lensData } from "@/lib/supabase/entity_factory";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { currency, formatDate } from "./shared";

// Lease Builder — a drafting lens on `property.leases` (status = "Draft"). Same
// data as Leases, focused on assembling a new agreement clause by clause.

const builderData = lensData(leasesLayer, {
  where: { status: "Draft" },
  defaults: { status: "Draft" },
});

const builderConfig = {
  key: "lease",
  singular: "Draft lease",
  plural: "Draft leases",
  title: "Lease Builder",
  description:
    "Assemble new lease agreements — set the parties and terms, add clauses, and preview the document before sending for signature.",
  icon: FilePen,
  titleField: "name",
  searchFields: ["name", "unit", "tenantName"],
  data: builderData,

  statusMap: {},
  statusFilterOptions: [{ value: "all", label: "All drafts" }],

  columns: [
    {
      key: "name",
      header: "Draft",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.unit || "No unit set"}</span>
        </div>
      ),
    },
    {
      key: "tenantName",
      header: "Tenant",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{r.tenantName || "—"}</span>
      ),
    },
    {
      key: "rent",
      header: "Rent",
      align: "right",
      className: "text-right font-semibold tabular-nums text-white",
      render: (r) => (r.rent ? `${currency(r.rent)}/mo` : "—"),
    },
  ],

  stats: (rows) => [
    { label: "Drafts", value: String(rows.length), footer: "In the builder" },
    { label: "With tenant", value: String(rows.filter((r) => r.tenantName).length), footer: "Party assigned" },
    { label: "Priced", value: String(rows.filter((r) => Number(r.rent) > 0).length), footer: "Rent set" },
    { label: "Dated", value: String(rows.filter((r) => r.termStart).length), footer: "Term set" },
  ],

  createDraft: { name: "", unit: "" },
  createFields: [
    { key: "name", label: "Lease name", type: "text", placeholder: "e.g. Maple Court · 4B — Jordan Blake" },
    { key: "unit", label: "Unit", type: "text", placeholder: "e.g. Maple Court · 4B" },
  ],
  newRow: (draft) => ({ name: draft.name.trim(), unit: draft.unit || "", rent: 0, status: "Draft" }),

  headerMeta: (r) => [r.unit, r.tenantName].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Builder", icon: LayoutDashboard, desc: "Draft lease at a glance." },
      ],
    },
    {
      group: "Build",
      items: [
        { key: "terms", label: "Terms", icon: FileSignature, desc: "Rent, deposit, and dates." },
        { key: "parties", label: "Parties", icon: Users, desc: "Tenant, landlord, and guarantor." },
        { key: "clauses", label: "Clauses", icon: ListChecks, desc: "Add and order lease clauses." },
        { key: "preview", label: "Preview", icon: Eye, desc: "The assembled lease document." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "unit", label: "Unit" },
        { key: "tenantName", label: "Tenant" },
        { key: "rent", label: "Rent", format: (v) => (v ? `${currency(v)}/mo` : "—") },
        { key: "termStart", label: "Term start", format: (v) => formatDate(v) },
        { key: "termEnd", label: "Term end", format: (v) => formatDate(v) },
      ],
      note: "When the draft is ready, set its status to Pending from All Leases to send it out.",
    }),
    terms: makeFieldsSection([
      { key: "rent", label: "Monthly rent", type: "number" },
      { key: "deposit", label: "Security deposit", type: "number" },
      { key: "termStart", label: "Term start", type: "date" },
      { key: "termEnd", label: "Term end", type: "date" },
    ]),
    parties: makeFieldsSection([
      { key: "tenantName", label: "Tenant", type: "text" },
      { key: "landlord", label: "Landlord / manager", type: "text", meta: true },
      { key: "guarantor", label: "Guarantor", type: "text", meta: true },
    ]),
    clauses: makeMetaListSection({
      field: "clauses",
      singular: "clause",
      icon: ListChecks,
      primaryPlaceholder: "e.g. No smoking",
    }),
    preview: makeNotesSection({ field: "body", placeholder: "The assembled lease text will build up here…", mono: true }),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this draft…" }),
  },
};

export function LeaseBuilderScreen() {
  return <EntityListScreen config={builderConfig} />;
}

export default LeaseBuilderScreen;
