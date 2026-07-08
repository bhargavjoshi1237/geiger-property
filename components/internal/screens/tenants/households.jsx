"use client";

import {
  LayoutDashboard,
  UsersRound,
  Car,
  FileText,
  Clock,
  Users,
} from "lucide-react";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { householdsData } from "@/lib/supabase/tenant_households";
import { occupantsData } from "@/lib/supabase/tenant_occupants";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeChildListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";

// Household & Occupants — an entity screen over `property.tenant_households`.
// One row per household; the editor manages its occupants (a real child table)
// plus pets/vehicles and notes.

const householdsConfig = {
  key: "household",
  singular: "Household",
  plural: "Households",
  title: "Household & Occupants",
  description:
    "Every household across your portfolio — group co-residents together and manage the people living in each unit.",
  icon: UsersRound,
  titleField: "name",
  searchFields: ["name"],
  data: householdsData,

  statusMap: {},
  statusFilterOptions: [{ value: "all", label: "All households" }],

  columns: [
    {
      key: "name",
      header: "Household",
      render: (r) => (
        <span className="font-medium text-foreground">{r.name}</span>
      ),
    },
    {
      key: "occupantCount",
      header: "Occupants",
      align: "right",
      className: "text-right font-semibold tabular-nums text-white",
      render: (r) => `${r.occupantCount ?? 0}`,
    },
  ],

  stats: (rows) => {
    const occupants = rows.reduce((s, r) => s + (Number(r.occupantCount) || 0), 0);
    return [
      { label: "Households", value: String(rows.length), footer: "Across the portfolio" },
      { label: "Occupants", value: String(occupants), footer: "People housed" },
      {
        label: "Avg. size",
        value: rows.length ? (occupants / rows.length).toFixed(1) : "0",
        footer: "Occupants per household",
      },
      {
        label: "Single-occupant",
        value: String(rows.filter((r) => Number(r.occupantCount) === 1).length),
        footer: "Solo residents",
      },
    ];
  },

  createDraft: { name: "" },
  createFields: [
    { key: "name", label: "Household name", type: "text", placeholder: "e.g. The Blake Household" },
  ],
  newRow: (draft) => ({ name: draft.name.trim(), occupantCount: 0 }),

  headerMeta: (r) => `${r.occupantCount ?? 0} occupant${r.occupantCount === 1 ? "" : "s"}`,

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this household." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "occupants", label: "Occupants", icon: Users, desc: "People living in this household." },
        { key: "petsVehicles", label: "Pets & Vehicles", icon: Car, desc: "Registered pets and vehicles." },
        { key: "documents", label: "Documents", icon: FileText, desc: "Household paperwork." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "name", label: "Household" },
        { key: "occupantCount", label: "Occupants" },
      ],
      note: "Add and manage the people in this household from the Occupants tab.",
    }),
    occupants: makeChildListSection({
      data: occupantsData,
      parentKey: "householdId",
      singular: "occupant",
      icon: Users,
      fields: [
        { key: "name", placeholder: "Name" },
        { key: "relationship", placeholder: "Relationship" },
        { key: "age", type: "number", placeholder: "Age" },
      ],
    }),
    petsVehicles: makeMetaListSection({
      field: "petsVehicles",
      singular: "pet or vehicle",
      icon: Car,
      primaryPlaceholder: "e.g. Dog — Labrador, or 2020 Honda Civic",
      secondary: { key: "detail", label: "Detail", placeholder: "Plate / breed" },
    }),
    documents: makeMetaListSection({
      field: "documents",
      singular: "document",
      icon: FileText,
      primaryPlaceholder: "Document name",
    }),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this household…" }),
  },
};

export function HouseholdsScreen() {
  return <EntityListScreen config={householdsConfig} />;
}

export default HouseholdsScreen;
