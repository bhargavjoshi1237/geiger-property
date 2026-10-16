"use client";

import { LayoutDashboard, SquarePen, ShieldCheck, Clock, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { teamMembersData } from "@/lib/supabase/team_members";
import { getSetting } from "@/lib/supabase/settings";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  FALLBACK_ROLE_NAMES,
  TEAM_STATUS_MAP,
  filterOptions,
  formatDate,
  selectOptions,
} from "./shared";

// Team & Members — workspace members and their roles (owns
// `property.team_members`). Roles come from Settings → Roles & Permissions.

// Role names from the saved `roles` setting, falling back to the standard set.
async function roleOptions() {
  const saved = await getSetting("roles", []);
  const names = Array.isArray(saved) && saved.length
    ? saved.map((r) => r.name).filter(Boolean)
    : FALLBACK_ROLE_NAMES;
  return names.map((n) => ({ value: n, label: n, patch: {} }));
}

const teamConfig = {
  key: "member",
  singular: "Member",
  plural: "Members",
  title: "Team & Members",
  description:
    "Everyone who works in this workspace and the role each one holds. Roles are defined in Roles & Permissions.",
  icon: UsersRound,
  titleField: "name",
  searchFields: ["name", "email", "role"],
  data: teamMembersData,

  statusMap: TEAM_STATUS_MAP,
  statusFilterOptions: filterOptions(TEAM_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Member",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.email || "No email set"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={TEAM_STATUS_MAP} />,
    },
    {
      key: "role",
      header: "Role",
      render: (r) =>
        r.role ? <Badge variant="neutral">{r.role}</Badge> : <span className="text-text-tertiary">—</span>,
    },
    {
      key: "createdAt",
      header: "Added",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => formatDate(r.createdAt),
    },
  ],

  stats: (rows) => {
    const count = (s) => rows.filter((r) => r.status === s).length;
    const roles = new Set(rows.map((r) => r.role).filter(Boolean)).size;
    return [
      { label: "Members", value: String(rows.length), footer: `${roles} role${roles === 1 ? "" : "s"} in use` },
      { label: "Active", value: String(count("Active")), footer: "Working in the workspace" },
      { label: "Invited", value: String(count("Invited")), footer: "Not yet active" },
      { label: "Disabled", value: String(count("Disabled")), footer: "Access turned off" },
    ];
  },

  createDraft: { name: "", email: "", role: "" },
  createFields: [
    { key: "name", label: "Full name", type: "text", placeholder: "e.g. Priya Shah" },
    { key: "email", label: "Email", type: "text", placeholder: "name@example.com" },
    { key: "role", label: "Role", type: "select", optionsFrom: "roles", placeholder: "Select a role" },
  ],
  loadCreateOptions: async () => ({ roles: await roleOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    email: (draft.email || "").trim(),
    role: draft.role || "",
    status: "Invited",
  }),

  headerMeta: (r) => [r.role, r.email].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this member." },
      ],
    },
    {
      group: "Member",
      items: [
        { key: "profile", label: "Profile", icon: SquarePen, desc: "Name, email, and phone." },
        { key: "access", label: "Access", icon: ShieldCheck, desc: "Role and account status." },
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
        { key: "email", label: "Email" },
        { key: "role", label: "Role" },
        { key: "status", label: "Status" },
        { key: "phone", label: "Phone", meta: true },
        { key: "createdAt", label: "Added", format: (v) => formatDate(v) },
      ],
      note: "Invitations aren't emailed yet — share the workspace link with new members yourself, then mark them Active.",
    }),
    profile: makeFieldsSection([
      { key: "name", label: "Full name", type: "text", full: true },
      { key: "email", label: "Email", type: "text" },
      { key: "phone", label: "Phone", type: "text", meta: true },
      { key: "title", label: "Job title", type: "text", meta: true, placeholder: "e.g. Property manager" },
    ]),
    access: makeFieldsSection([
      {
        key: "role",
        label: "Role",
        type: "relation",
        load: roleOptions,
        displayKey: "role",
        hint: "Permissions are advisory — they hide navigation and controls, not data.",
      },
      { key: "status", label: "Status", type: "select", options: selectOptions(TEAM_STATUS_MAP) },
    ]),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log an internal note…" }),
  },
};

export function TeamMembersScreen() {
  return <EntityListScreen config={teamConfig} />;
}

export default TeamMembersScreen;
