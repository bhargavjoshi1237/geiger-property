"use client";

import { LayoutDashboard, FileText, Link2, PenLine, Clock } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { leaseAddendaData } from "@/lib/supabase/lease_addenda";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { ADDENDA_STATUS_MAP, filterOptions, formatDate } from "./shared";

// Addenda & Documents — an entity screen over `property.lease_addenda`. Manage
// lease addenda and supporting documents and their signature status.

const addendaConfig = {
  key: "addendum",
  singular: "Addendum",
  plural: "Addenda",
  title: "Addenda & Documents",
  description:
    "Lease addenda and supporting documents — pet agreements, parking, and amendments — attached to their leases.",
  icon: FileText,
  titleField: "name",
  searchFields: ["name"],
  data: leaseAddendaData,

  statusMap: ADDENDA_STATUS_MAP,
  statusFilterOptions: filterOptions(ADDENDA_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Addendum",
      render: (r) => <span className="font-medium text-foreground">{r.name}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={ADDENDA_STATUS_MAP} />,
    },
    {
      key: "createdAt",
      header: "Created",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => formatDate(r.createdAt),
    },
  ],

  stats: (rows) => {
    const signed = rows.filter((r) => r.status === "Signed").length;
    const attached = rows.filter((r) => r.status === "Attached").length;
    return [
      { label: "Addenda", value: String(rows.length), footer: `${signed} signed` },
      { label: "Attached", value: String(attached), footer: "On a lease" },
      { label: "Signed", value: String(signed), footer: "Executed" },
      { label: "Drafts", value: String(rows.filter((r) => r.status === "Draft").length), footer: "In progress" },
    ];
  },

  createDraft: { name: "", status: "Draft" },
  createFields: [
    { key: "name", label: "Addendum name", type: "text", placeholder: "e.g. Pet agreement" },
    { key: "status", label: "Status", type: "select", options: filterOptions(ADDENDA_STATUS_MAP).slice(1) },
  ],
  newRow: (draft) => ({ name: draft.name.trim(), status: draft.status || "Draft" }),

  headerMeta: (r) => r.status,

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this addendum." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "content", label: "Content", icon: FileText, desc: "The addendum text." },
        { key: "linkedLease", label: "Linked Lease", icon: Link2, desc: "The lease this attaches to." },
        { key: "signatures", label: "Signatures", icon: PenLine, desc: "Who has signed." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "status", label: "Status" },
        { key: "leaseName", label: "Linked lease", meta: true },
        { key: "createdAt", label: "Created", format: (v) => formatDate(v) },
      ],
    }),
    content: makeNotesSection({ field: "body", placeholder: "Addendum text…", meta: false, mono: true }),
    linkedLease: makeFieldsSection([
      { key: "leaseName", label: "Lease", type: "text", meta: true, placeholder: "e.g. Maple Court · 4B — Jordan Blake" },
      { key: "effectiveDate", label: "Effective date", type: "date", meta: true },
    ]),
    signatures: makeMetaListSection({
      field: "signatures",
      singular: "signature",
      icon: PenLine,
      primaryPlaceholder: "Signer name",
      check: true,
    }),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this addendum…" }),
  },
};

export function AddendaScreen() {
  return <EntityListScreen config={addendaConfig} />;
}

export default AddendaScreen;
