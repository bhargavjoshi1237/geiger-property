"use client";

import { LayoutDashboard, Users, FileText, History, BellRing, FileSignature } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { esignData } from "@/lib/supabase/esign";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
} from "@/components/internal/screens/entity/sections/factories";
import { ESIGN_STATUS_MAP, filterOptions, formatDate } from "./shared";

// E-signature — an entity screen over `property.esign_requests`. Manage document
// signing workflows: signers, status, audit trail, and reminders.

const esignConfig = {
  key: "request",
  singular: "Signing request",
  plural: "Signing requests",
  title: "E-signature",
  description:
    "Send documents for signature and track them end to end — who signed, who's pending, and the full audit trail.",
  icon: FileSignature,
  titleField: "name",
  searchFields: ["name", "signer"],
  data: esignData,

  statusMap: ESIGN_STATUS_MAP,
  statusFilterOptions: filterOptions(ESIGN_STATUS_MAP),

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
      key: "createdAt",
      header: "Created",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => formatDate(r.createdAt),
    },
  ],

  stats: (rows) => {
    const signed = rows.filter((r) => r.status === "Signed").length;
    const sent = rows.filter((r) => r.status === "Sent" || r.status === "Viewed").length;
    return [
      { label: "Requests", value: String(rows.length), footer: `${signed} signed` },
      { label: "Awaiting", value: String(sent), footer: "Sent or viewed" },
      { label: "Signed", value: String(signed), footer: "Completed" },
      { label: "Declined", value: String(rows.filter((r) => r.status === "Declined").length), footer: "Rejected" },
    ];
  },

  createDraft: { name: "", signer: "" },
  createFields: [
    { key: "name", label: "Document name", type: "text", placeholder: "e.g. Maple Court · 4B lease" },
    { key: "signer", label: "Primary signer", type: "text", placeholder: "e.g. Jordan Blake" },
  ],
  newRow: (draft) => ({ name: draft.name.trim(), signer: draft.signer || "", status: "Draft" }),

  headerMeta: (r) => [r.signer, r.status].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this request." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "signers", label: "Signers", icon: Users, desc: "Everyone who needs to sign." },
        { key: "document", label: "Document", icon: FileText, desc: "The document being signed." },
        { key: "audit", label: "Audit Trail", icon: History, desc: "Every event in the signing flow." },
        { key: "reminders", label: "Reminders", icon: BellRing, desc: "Nudge signers to complete." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "signer", label: "Primary signer" },
        { key: "status", label: "Status" },
        { key: "createdAt", label: "Created", format: (v) => formatDate(v) },
      ],
    }),
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
      { key: "status", label: "Status", type: "select", options: filterOptions(ESIGN_STATUS_MAP).slice(1) },
      { key: "documentLink", label: "Document link", type: "text", meta: true, full: true, placeholder: "https://…" },
      { key: "message", label: "Message to signers", type: "textarea", meta: true, full: true },
    ]),
    audit: makeMetaListSection({
      field: "audit",
      singular: "audit event",
      icon: History,
      primaryPlaceholder: "e.g. Sent to Jordan Blake",
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
    ]),
  },
};

export function EsignatureScreen() {
  return <EntityListScreen config={esignConfig} />;
}

export default EsignatureScreen;
