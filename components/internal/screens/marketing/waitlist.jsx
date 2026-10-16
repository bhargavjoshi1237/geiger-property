"use client";

import { LayoutDashboard, Contact, SlidersHorizontal, Clock, ListOrdered } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { waitlistLayer } from "@/lib/supabase/waitlist";
import { propertyOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  WAITLIST_STATUS_MAP,
  filterOptions,
  formatDate,
  selectOptions,
} from "./shared";

// Waitlist — people waiting for a unit (owns `property.waitlist_entries`).
// Ordered by position, with property and unit preferences.

// Position order; unranked entries (0) sort after ranked ones.
const rank = (r) => Number(r.position) || Number.MAX_SAFE_INTEGER;
const byPosition = (a, b) => rank(a) - rank(b);

const waitlistConfig = {
  key: "entry",
  singular: "Waitlist entry",
  plural: "Waitlist entries",
  title: "Waitlist",
  description:
    "Keep an ordered list of people waiting for a unit. Offer openings in turn and convert them into applicants.",
  icon: ListOrdered,
  titleField: "name",
  searchFields: ["name", "email", "phone", "propertyName", "unitPreference"],
  data: waitlistLayer.data,
  rowsLoader: async () => ((await waitlistLayer.list()) ?? []).sort(byPosition),

  statusMap: WAITLIST_STATUS_MAP,
  statusFilterOptions: filterOptions(WAITLIST_STATUS_MAP),

  columns: [
    {
      key: "position",
      header: "#",
      className: "w-12 tabular-nums text-text-secondary",
      render: (r) => (Number(r.position) ? r.position : "—"),
    },
    {
      key: "name",
      header: "Name",
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
      render: (r) => <StatusPill status={r.status} map={WAITLIST_STATUS_MAP} />,
    },
    {
      key: "preference",
      header: "Looking for",
      className: "text-sm text-text-secondary",
      render: (r) => [r.propertyName, r.unitPreference].filter(Boolean).join(" · ") || "—",
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
    const waiting = rows.filter((r) => r.status === "Waiting").length;
    return [
      { label: "On waitlist", value: String(rows.length), footer: `${waiting} waiting` },
      { label: "Offered", value: String(rows.filter((r) => r.status === "Offered").length), footer: "Awaiting a reply" },
      { label: "Converted", value: String(rows.filter((r) => r.status === "Converted").length), footer: "Became applicants" },
      {
        label: "Properties",
        value: String(new Set(rows.map((r) => r.propertyId || r.propertyName).filter(Boolean)).size),
        footer: "With a waitlist",
      },
    ];
  },

  createDraft: { name: "", email: "", phone: "", propertyId: "", position: "" },
  createFields: [
    { key: "name", label: "Full name", type: "text", placeholder: "e.g. Jordan Blake" },
    { key: "email", label: "Email", type: "text", placeholder: "jordan@example.com" },
    { key: "phone", label: "Phone", type: "text", placeholder: "(555) 123-4567" },
    {
      key: "propertyId",
      label: "Property",
      type: "select",
      optionsFrom: "properties",
      placeholder: "Select a property…",
      emptyLabel: "No properties yet",
    },
    { key: "position", label: "Position", type: "number", placeholder: "e.g. 1" },
  ],
  loadCreateOptions: async () => ({ properties: await propertyOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    email: draft.email?.trim() || "",
    phone: draft.phone?.trim() || "",
    propertyId: draft.propertyId || "",
    propertyName: draft.propertyName || "",
    position: Number(draft.position) || 0,
    status: "Waiting",
  }),

  headerMeta: (r) =>
    [Number(r.position) ? `#${r.position}` : null, r.propertyName, r.unitPreference].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this entry." },
      ],
    },
    {
      group: "Entry",
      items: [
        { key: "contact", label: "Contact", icon: Contact, desc: "How to reach them." },
        { key: "preferences", label: "Preferences", icon: SlidersHorizontal, desc: "Property, unit, timing, and position." },
      ],
    },
    {
      group: "General",
      items: [{ key: "activity", label: "Activity", icon: Clock, desc: "Notes and activity on this entry." }],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "position", label: "Position", format: (v) => (Number(v) ? `#${v}` : "—") },
        { key: "status", label: "Status" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "propertyName", label: "Property" },
        { key: "unitPreference", label: "Unit preference" },
        { key: "moveInDate", label: "Desired move-in", format: (v) => formatDate(v) },
        { key: "createdAt", label: "Joined", format: (v) => formatDate(v) },
      ],
    }),
    contact: makeFieldsSection([
      { key: "name", label: "Full name", type: "text", full: true },
      { key: "email", label: "Email", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
    ]),
    preferences: makeFieldsSection([
      { key: "propertyId", label: "Property", type: "relation", load: propertyOptions, displayKey: "propertyName" },
      { key: "unitPreference", label: "Unit preference", type: "text", placeholder: "e.g. 2BR, ground floor" },
      { key: "moveInDate", label: "Desired move-in", type: "date" },
      { key: "position", label: "Position", type: "number" },
      { key: "status", label: "Status", type: "select", options: selectOptions(WAITLIST_STATUS_MAP) },
    ]),
    activity: makeNotesSection({ field: "notes", placeholder: "Notes and activity on this entry…" }),
  },
};

export function WaitlistScreen() {
  return <EntityListScreen config={waitlistConfig} />;
}

export default WaitlistScreen;
