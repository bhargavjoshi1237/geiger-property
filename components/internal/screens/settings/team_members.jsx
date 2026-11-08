"use client";

import { LayoutDashboard, SquarePen, ShieldCheck, Clock, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@geiger/ui/badge";
import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { useMemo } from "react";

import { grantableBy, offersProperty } from "@/lib/rbac";
import { makeTeamMembersData } from "@/lib/supabase/team_members";
import { listRoles } from "@/lib/supabase/rbac";
import { usePermission, useRbac } from "@/context/rbac-context";
import { RoleNote } from "@/components/internal/shared/role_gate";
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

// Team & Members — workspace members and their roles (owns `property.team_members`; signed-in members' roles are
// property.role_grants, see lib/supabase/team_members). Inviting needs team.invite, changing a role team.assign_roles.

const NO_INVITE = "Your role can't invite members.";
const NO_ASSIGN = "Your role can't change member roles.";
const OWN_ACCESS = "You can't change your own role or status. Ask another owner or admin.";

// Refused lockout changes (your own access, the only owner) explain themselves before the generic error.
const teamMembersData = makeTeamMembersData({ onBlocked: (reason) => toast.error(reason) });

// The project's roles that carry Property keys (other apps' roles aren't offered), else the standard set; `allow` narrows an invite's choices.
async function roleOptions(allow) {
  const roles = (await listRoles())?.filter(offersProperty);
  const names = roles?.length ? roles.filter((r) => !allow || allow(r)).map((r) => r.name).filter(Boolean) : FALLBACK_ROLE_NAMES;
  return names.map((n) => ({ value: n, label: n, patch: {} }));
}

const accessFields = (canAssign) => [
  {
    key: "role",
    label: "Role",
    type: "relation",
    load: roleOptions,
    displayKey: "role",
    disabled: !canAssign,
    hint: canAssign
      ? "Takes effect when they next load the workspace. Only organization owners and admins can change a signed-in member's role, and they always keep Owner or Admin."
      : NO_ASSIGN,
  },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: selectOptions(TEAM_STATUS_MAP),
    disabled: !canAssign,
    hint: canAssign ? "Only organization owners and admins can disable or re-enable a member." : undefined,
  },
];
const AccessFields = makeFieldsSection(accessFields(true));
const LockedAccessFields = makeFieldsSection(accessFields(false));

function AccessSection(props) {
  const canAssign = usePermission("team.assign_roles");
  const { userId } = useRbac();
  const own = Boolean(userId) && props.item?.userId === userId;
  if (canAssign && !own) return <AccessFields {...props} />;
  return (
    <div className="space-y-4">
      <RoleNote>{own ? OWN_ACCESS : NO_ASSIGN}</RoleNote>
      <LockedAccessFields {...props} />
    </div>
  );
}

// Config per assign-roles permission: without it, invites carry no role (the default role applies). `grantable(role)` limits an
// invite to roles within the inviter's rights, as the database's roster guard does (PLAT-01d).
const makeTeamConfig = (canAssign, grantable) => ({
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
  createPermission: "team.invite",
  createPermissionNote: NO_INVITE,

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
    ...(canAssign ? [{ key: "role", label: "Role", type: "select", optionsFrom: "roles", placeholder: "Select a role" }] : []),
  ],
  loadCreateOptions: async () => ({ roles: canAssign ? await roleOptions(grantable) : [] }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    email: (draft.email || "").trim(),
    role: canAssign ? draft.role || "" : "",
    status: "Invited",
  }),
  // Copies keep the source's role only when the user may assign roles.
  prepareDuplicate: (copy) => (canAssign ? copy : { ...copy, role: "" }),

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
    access: AccessSection,
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log an internal note…" }),
  },
});

export function TeamMembersScreen() {
  const canAssign = usePermission("team.assign_roles");
  const { can, isOwner } = useRbac();
  const config = useMemo(() => makeTeamConfig(canAssign, (role) => grantableBy(role, can, isOwner)), [canAssign, can, isOwner]);
  return <EntityListScreen config={config} />;
}

export default TeamMembersScreen;
