"use client";

import { LayoutDashboard, Contact, SlidersHorizontal, ListChecks, Clock, UserPlus } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { prospectsLayer } from "@/lib/supabase/prospects";
import { unitOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  PROSPECT_STATUS_MAP,
  SOURCE_OPTIONS,
  currency,
  filterOptions,
  formatDate,
  selectOptions,
} from "./shared";

// Prospects — leads in the leasing pipeline (owns `property.prospects`). Contact
// details, preferences, and follow-ups from first touch to lease.

const CLOSED = ["Leased", "Lost"];

const prospectsConfig = {
  key: "prospect",
  singular: "Prospect",
  plural: "Prospects",
  title: "Prospects",
  description:
    "Every lead in your leasing pipeline. Track where they came from, what they're looking for, and the follow-ups that move them to a lease.",
  icon: UserPlus,
  titleField: "name",
  searchFields: ["name", "email", "phone", "source", "unit"],
  data: prospectsLayer.data,

  statusMap: PROSPECT_STATUS_MAP,
  statusFilterOptions: filterOptions(PROSPECT_STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "pipeline", label: "Active pipeline", filter: (r) => !CLOSED.includes(r.status) },
    { value: "won", label: "Won", filter: (r) => r.status === "Leased" },
    { value: "lost", label: "Lost", filter: (r) => r.status === "Lost" },
  ],

  columns: [
    {
      key: "name",
      header: "Prospect",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.email, r.phone].filter(Boolean).join(" · ") || "No contact set"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={PROSPECT_STATUS_MAP} />,
    },
    {
      key: "source",
      header: "Source",
      render: (r) =>
        r.source ? <Badge variant="neutral">{r.source}</Badge> : <span className="text-text-tertiary">—</span>,
    },
    {
      key: "budget",
      header: "Budget",
      align: "right",
      className: "text-right tabular-nums text-foreground",
      render: (r) => (r.budget ? `${currency(r.budget)}/mo` : "—"),
    },
    {
      key: "moveInDate",
      header: "Move-in",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => formatDate(r.moveInDate),
    },
  ],

  stats: (rows) => {
    const pipeline = rows.filter((r) => !CLOSED.includes(r.status)).length;
    const won = rows.filter((r) => r.status === "Leased").length;
    const lost = rows.filter((r) => r.status === "Lost").length;
    const closed = won + lost;
    return [
      { label: "Prospects", value: String(rows.length), footer: `${pipeline} in pipeline` },
      { label: "New leads", value: String(rows.filter((r) => r.status === "New").length), footer: "Awaiting first contact" },
      { label: "Touring", value: String(rows.filter((r) => r.status === "Touring").length), footer: "Showing scheduled or done" },
      { label: "Conversion", value: closed ? `${Math.round((won / closed) * 100)}%` : "—", footer: `${won} leased of ${closed} closed` },
    ];
  },

  createDraft: { name: "", email: "", phone: "", source: "Website" },
  createFields: [
    { key: "name", label: "Full name", type: "text", placeholder: "e.g. Jordan Blake" },
    { key: "email", label: "Email", type: "text", placeholder: "jordan@example.com" },
    { key: "phone", label: "Phone", type: "text", placeholder: "(555) 123-4567" },
    { key: "source", label: "Source", type: "select", options: SOURCE_OPTIONS },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    email: draft.email?.trim() || "",
    phone: draft.phone?.trim() || "",
    source: draft.source || "",
    status: "New",
  }),

  headerMeta: (r) => [r.source, r.email, r.phone].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this prospect." },
      ],
    },
    {
      group: "Prospect",
      items: [
        { key: "contact", label: "Contact", icon: Contact, desc: "How to reach this prospect." },
        { key: "preferences", label: "Preferences", icon: SlidersHorizontal, desc: "What they're looking for." },
        { key: "followups", label: "Follow-ups", icon: ListChecks, desc: "Next steps and reminders." },
      ],
    },
    {
      group: "General",
      items: [{ key: "activity", label: "Activity", icon: Clock, desc: "Notes and activity on this prospect." }],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "source", label: "Source" },
        { key: "status", label: "Status" },
        { key: "unit", label: "Interested in" },
        { key: "budget", label: "Budget", format: (v) => (v ? `${currency(v)}/mo` : "—") },
        { key: "moveInDate", label: "Desired move-in", format: (v) => formatDate(v) },
        { key: "createdAt", label: "Added", format: (v) => formatDate(v) },
      ],
    }),
    contact: makeFieldsSection([
      { key: "name", label: "Full name", type: "text", full: true },
      { key: "email", label: "Email", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      {
        key: "preferredContact",
        label: "Preferred contact",
        type: "select",
        meta: true,
        options: [
          { value: "Email", label: "Email" },
          { value: "Phone", label: "Phone" },
          { value: "Text", label: "Text" },
        ],
      },
      { key: "status", label: "Status", type: "select", options: selectOptions(PROSPECT_STATUS_MAP) },
    ]),
    preferences: makeFieldsSection([
      { key: "unitId", label: "Unit of interest", type: "relation", load: unitOptions, displayKey: "unit" },
      { key: "moveInDate", label: "Desired move-in", type: "date" },
      { key: "budget", label: "Monthly budget", type: "number" },
      { key: "source", label: "Source", type: "select", options: SOURCE_OPTIONS },
      { key: "bedrooms", label: "Bedrooms wanted", type: "number", meta: true },
      { key: "pets", label: "Has pets", type: "switch", meta: true },
      { key: "mustHaves", label: "Must-haves", type: "textarea", meta: true, placeholder: "Parking, in-unit laundry…" },
    ]),
    followups: makeMetaListSection({
      field: "followups",
      singular: "follow-up",
      icon: ListChecks,
      primaryPlaceholder: "e.g. Send floor plans",
      secondary: { key: "date", label: "Due", type: "date" },
      check: true,
    }),
    activity: makeNotesSection({ field: "notes", placeholder: "Notes and activity on this prospect…" }),
  },
};

export function ProspectsScreen() {
  return <EntityListScreen config={prospectsConfig} />;
}

export default ProspectsScreen;
