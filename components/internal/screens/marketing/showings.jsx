"use client";

import { LayoutDashboard, SquarePen, MessageSquareText, Clock, CalendarClock } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { showingsLayer } from "@/lib/supabase/showings";
import { prospectOptions, unitOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  SHOWING_STATUS_MAP,
  SHOWING_TYPE_OPTIONS,
  filterOptions,
  formatDate,
  selectOptions,
  todayISO,
} from "./shared";

// Showings — scheduled tours of units (owns `property.showings`). Linked to a
// prospect and a unit; in-person, self-guided, or virtual, with feedback.

const isUpcoming = (r) =>
  r.status === "Scheduled" && (!r.showingDate || String(r.showingDate).slice(0, 10) >= todayISO());

const when = (r) =>
  r.showingDate ? [formatDate(r.showingDate), r.showingTime].filter(Boolean).join(" · ") : "Not scheduled";

const showingsConfig = {
  key: "showing",
  singular: "Showing",
  plural: "Showings",
  title: "Showings",
  description:
    "Schedule and track unit tours — in-person, self-guided, or virtual — and capture feedback from every showing.",
  icon: CalendarClock,
  titleField: "name",
  searchFields: ["name", "prospectName", "unit", "agent"],
  data: showingsLayer.data,

  statusMap: SHOWING_STATUS_MAP,
  statusFilterOptions: filterOptions(SHOWING_STATUS_MAP),

  views: [
    { value: "upcoming", label: "Upcoming", filter: isUpcoming },
    { value: "past", label: "Past", filter: (r) => !isUpcoming(r) },
    { value: "all", label: "All", filter: () => true },
  ],

  columns: [
    {
      key: "name",
      header: "Showing",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.prospectName, r.unit].filter(Boolean).join(" · ") || "No prospect linked"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={SHOWING_STATUS_MAP} />,
    },
    {
      key: "showingType",
      header: "Type",
      render: (r) =>
        r.showingType ? <Badge variant="neutral">{r.showingType}</Badge> : <span className="text-text-tertiary">—</span>,
    },
    {
      key: "agent",
      header: "Agent",
      className: "text-sm text-text-secondary",
      render: (r) => r.agent || "—",
    },
    {
      key: "showingDate",
      header: "When",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: when,
    },
  ],

  stats: (rows) => {
    const completed = rows.filter((r) => r.status === "Completed").length;
    const noShow = rows.filter((r) => r.status === "No-show").length;
    const attended = completed + noShow;
    return [
      { label: "Showings", value: String(rows.length), footer: "All time" },
      { label: "Upcoming", value: String(rows.filter(isUpcoming).length), footer: "Scheduled ahead" },
      { label: "Completed", value: String(completed), footer: "Tours given" },
      {
        label: "No-show rate",
        value: attended ? `${Math.round((noShow / attended) * 100)}%` : "—",
        footer: `${noShow} no-show${noShow === 1 ? "" : "s"}`,
      },
    ];
  },

  createDraft: { name: "", prospectId: "", unitId: "", showingDate: "", showingType: "In-person" },
  createFields: [
    { key: "name", label: "Showing title", type: "text", placeholder: "e.g. Jordan Blake · Maple Court 4B" },
    {
      key: "prospectId",
      label: "Prospect",
      type: "select",
      optionsFrom: "prospects",
      placeholder: "Select a prospect…",
      emptyLabel: "No prospects yet",
    },
    {
      key: "unitId",
      label: "Unit",
      type: "select",
      optionsFrom: "units",
      placeholder: "Select a unit…",
      emptyLabel: "No units yet",
    },
    { key: "showingDate", label: "Date", type: "date" },
    { key: "showingType", label: "Type", type: "select", options: SHOWING_TYPE_OPTIONS },
  ],
  loadCreateOptions: async () => {
    const [prospects, units] = await Promise.all([prospectOptions(), unitOptions()]);
    return { prospects, units };
  },
  newRow: (draft) => ({
    name: draft.name.trim(),
    prospectId: draft.prospectId || "",
    prospectName: draft.prospectName || "",
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    showingDate: draft.showingDate || "",
    showingType: draft.showingType || "In-person",
    status: "Scheduled",
  }),

  headerMeta: (r) => [r.prospectName, r.unit, r.showingDate ? when(r) : null].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this showing." },
      ],
    },
    {
      group: "Showing",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Who, where, and when." },
        { key: "feedback", label: "Feedback", icon: MessageSquareText, desc: "How the tour went." },
      ],
    },
    {
      group: "General",
      items: [{ key: "activity", label: "Activity", icon: Clock, desc: "Notes and activity on this showing." }],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "prospectName", label: "Prospect" },
        { key: "unit", label: "Unit" },
        { key: "showingDate", label: "Date", format: (v) => formatDate(v) },
        { key: "showingTime", label: "Time" },
        { key: "showingType", label: "Type" },
        { key: "agent", label: "Agent" },
        { key: "status", label: "Status" },
        { key: "interest", label: "Interest level", meta: true },
      ],
    }),
    details: makeFieldsSection([
      { key: "name", label: "Showing title", type: "text", full: true },
      { key: "prospectId", label: "Prospect", type: "relation", load: prospectOptions, displayKey: "prospectName" },
      { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
      { key: "showingDate", label: "Date", type: "date" },
      { key: "showingTime", label: "Time", type: "text", placeholder: "e.g. 2:30 PM" },
      { key: "showingType", label: "Type", type: "select", options: SHOWING_TYPE_OPTIONS },
      { key: "agent", label: "Agent", type: "text", placeholder: "Who's giving the tour" },
      { key: "status", label: "Status", type: "select", options: selectOptions(SHOWING_STATUS_MAP) },
    ]),
    feedback: makeFieldsSection([
      {
        key: "interest",
        label: "Interest level",
        type: "select",
        meta: true,
        options: [
          { value: "High", label: "High" },
          { value: "Medium", label: "Medium" },
          { value: "Low", label: "Low" },
        ],
      },
      { key: "followUpNeeded", label: "Follow-up needed", type: "switch", meta: true },
      { key: "feedback", label: "Feedback", type: "textarea", meta: true, placeholder: "What did they like or dislike?" },
    ]),
    activity: makeNotesSection({ field: "notes", placeholder: "Notes and activity on this showing…" }),
  },
};

export function ShowingsScreen() {
  return <EntityListScreen config={showingsConfig} />;
}

export default ShowingsScreen;
